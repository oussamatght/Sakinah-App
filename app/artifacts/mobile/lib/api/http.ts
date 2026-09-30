import { UpstreamError } from "./types";

export type JsonRecord = Record<string, unknown>;

export function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function intString(value: unknown, fallback?: number): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function httpsUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/^http:/, "https:");
}

export function stringProp(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

/**
 * In-flight dedupe for identical concurrent GETs. Multiple consumers (list +
 * detail + prefetch) can request the same URL in the same tick; this merges
 * them into one network call. Session-only: entries are removed as soon as the
 * shared promise settles, so nothing is cached beyond an in-flight request.
 */
const inflightFetches = new Map<string, Promise<unknown>>();

/**
 * JSON fetch with timeout + UpstreamError mapping. All providers below send
 * `access-control-allow-origin: *`, so this works from native fetch and web.
 */
export async function fetchJson<T>(
  url: string,
  source: string,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const key = `${options.timeoutMs ?? 15_000}|${url}`;
  const existing = inflightFetches.get(key);
  if (existing) return existing as Promise<T>;

  const job = fetchJsonOnce<T>(url, source, options);
  inflightFetches.set(
    key,
    job.then(
      (value) => {
        inflightFetches.delete(key);
        return value;
      },
      (error: unknown) => {
        inflightFetches.delete(key);
        throw error;
      },
    ),
  );
  return job;
}

async function fetchJsonOnce<T>(
  url: string,
  source: string,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 15_000 } = options;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // فشل fetch() نفسه = انقطاع شبكة فعلي (DNS/timeout/بلا إنترنت).
    throw new UpstreamError(source, undefined, true);
  }

  if (!response.ok) {
    // الخادم ردّ فعلًا ⇒ الاتصال قائم، فالخلل في الخدمة لا في الشبكة.
    throw new UpstreamError(
      source,
      response.status >= 500
        ? `${source} غير متاح مؤقتًا، حاول لاحقًا.`
        : `تعذر جلب البيانات من ${source}.`,
      false,
    );
  }

  try {
    const payload: unknown = await response.json();
    return payload as T;
  } catch {
    // استجابة تالفة — الاتصال سليم، فلا داعي لرسالة "لا يوجد اتصال".
    throw new UpstreamError(source, undefined, false);
  }
}
