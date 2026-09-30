/**
 * واجهة المزوّد الموحّدة للمكتبة + أدوات مشتركة (جلب مع إعادة محاولة،
 * فك JSON، تنقية نص).
 *
 * التركيز على «لا نقول أبدًا إن شيئًا مدعوم إن لم نتحقق منه حيًا»:
 * - تراث: بحث/تفاصيل/فهرس/صفحة/مؤلف/بحث داخل الكتاب — مُتحقّق.
 * - إسلام هاوس: تصنيفات/قوائم/تفاصيل/مؤلفون/مرفقات PDF — مُتحقّق.
 * - أي قدرة غير مدعومة عند مزوّد تُرجع [] / undefined (لا endpoint مخترع).
 */

import { UpstreamError } from "@/lib/api/types";
import type {
  IslamicBook,
  IslamicBookAuthor,
  IslamicBookCapabilities,
  IslamicBookCategory,
  IslamicBookChapter,
  IslamicBookDetails,
  IslamicBookPage,
  IslamicBookSearchResult,
  IslamicLibrarySource,
  BookSearchCapabilities,
  BookSearchFilters,
  BookSearchNotice,
  BookSearchPlanStep,
} from "./types";

export type CatalogueFilters = {
  categoryId?: string;
  page?: number;
  perPage?: number;
};

export type BookSearchParams = {
  page?: number;
  perPage?: number;
};

export interface IslamicBooksProvider {
  readonly id: IslamicLibrarySource;
  readonly displayName: string;
  readonly capabilities: IslamicBookCapabilities;
  /** قدرات البحث فقط — لا نعرض في الواجهة ما لا يفعله المصدر فعلًا. */
  readonly searchCapabilities: BookSearchCapabilities;

  getCategories(): Promise<IslamicBookCategory[]>;

  /** الفروع الحقيقية من شجرة المصدر (فروع المستوى الأول ذات ids صالحة). */
  getCategoryBranches(): Promise<IslamicBookCategory[]>;

  /** أبناء فرع بعينه (للكشف عند الطلب — لا نحمّل الشجرة كلها). */
  getCategoryChildren(nodeId: string): Promise<IslamicBookCategory[]>;

  getBooks(filters?: CatalogueFilters): Promise<IslamicBookSearchResult>;

  searchBooks(
    query: string,
    params?: BookSearchParams,
  ): Promise<IslamicBookSearchResult>;

  /**
   * البحث الموحّد (نص/عنوان/مؤلف/تصنيف/مصدر). كل مزوّد ينفّذ ما يستطيع على
   * خادمه ويصفّي الباقي محليًا، ويُرجع تقريرًا صريحًا بما جرى.
   */
  searchWithFilters(
    filters: BookSearchFilters & { page?: number; perPage?: number },
  ): Promise<IslamicBookSearchResult>;

  /** كتب مؤلف بعينه (id) — تراث بلا endpoint لهذا، فيُرجع undefined. */
  getBooksByAuthor(
    authorId: string,
    page?: number,
    perPage?: number,
  ): Promise<IslamicBookSearchResult | undefined>;

  getBook(rawId: string): Promise<IslamicBook | undefined>;

  getBookDetails(rawId: string): Promise<IslamicBookDetails | undefined>;

  getBookChapters(rawId: string): Promise<IslamicBookChapter[] | undefined>;

  getBookPage(
    rawId: string,
    pageNumber: number,
  ): Promise<IslamicBookPage | undefined>;

  getAuthor(id: string): Promise<IslamicBookAuthor | undefined>;

  searchInsideBook(
    rawId: string,
    query: string,
  ): Promise<IslamicBookSearchResult | undefined>;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : undefined;
}

/**
 * يحوّل معرفًا يأتي رقمًا أو نصًا (على الغالب أرقام في إسلام هاوس) إلى نص.
 */
export function idString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return str(value);
}

export function num(value: unknown, fallback?: number): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function httpsUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/^http:/, "https:");
}

export function safePage(page: number | undefined): number {
  return Math.max(1, Math.floor(page ?? 1));
}

export function safeLimit(perPage: number | undefined): number {
  const value = Math.floor(perPage ?? 20);
  return Math.min(Math.max(value, 1), 50);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * جلب JSON مع إعادة محاولة على الشبكة/المهلة/5xx/429 (المصد‌ران بطيئان
 * أحيانًا). أخطاء 4xx العادية تفلتفشل فورًا بلا إعادة.
 */
export async function fetchJsonRetry<T>(
  url: string,
  source: string,
  options: { timeoutMs?: number; tries?: number; retryDelayMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 25_000, tries = 3, retryDelayMs = 1_500 } = options;
  let last: unknown;

  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        const error = new UpstreamError(
          source,
          retryable
            ? `${source} مشغول مؤقتًا، حاول لاحقًا.`
            : `تعذر قراءة البيانات من ${source}.`,
        );
        if (!retryable) throw error;
        last = error;
        if (attempt < tries - 1) await delay(retryDelayMs);
        continue;
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch {
        json = null;
      }
      return json as T;
    } catch (error) {
      last = error;
      if (error instanceof UpstreamError || attempt >= tries - 1) break;
      await delay(retryDelayMs);
    }
  }

  throw last instanceof Error ? last : new UpstreamError(source);
}

/** يستخرج مصفوفة العناصر من استجابة {data|items: [...]} أو مصفوفة مباشرة. */
export function itemsOf(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (isJsonRecord(json)) {
    for (const key of ["data", "items", "results"]) {
      if (Array.isArray(json[key])) return json[key] as unknown[];
    }
  }
  return [];
}

type PaginationLinks = {
  total?: number;
  pages?: number;
  currentPage?: number;
};

/** يستخرج معلومات الترقيم من كائن {links:{...}} عند توفرها. */
export function paginationOf(json: unknown): PaginationLinks {
  if (!isJsonRecord(json) || !isJsonRecord(json.links)) return {};
  const links = json.links;
  return {
    total: num(links.total_items),
    pages: num(links.pages_number),
    currentPage: num(links.current_page),
  };
}

/** ينقّي النص من وسوم HTML وكيانات بسيطة (مقاطع البحث ترجع بنص HTML). */
export function stripHtml(value: unknown): string | undefined {
  const text = str(value);
  if (!text) return undefined;
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* أدوات البحث المتقدم                                                         */
/* -------------------------------------------------------------------------- */

const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/**
 * تطبيع عربي للمطابقة المحلية فقط: تشكيل، ألفات، تاء مربوطة.
 * يُستخدم لتضييق نتائج خادم المصدر (مثلًا: عنوان يحتوي العبارة) — ولا يُغني
 * أبدًا عن بحث الخادم، ولهذا نُعلنه في التقرير كـ«تصفية محلية».
 */
export function normalizeArabic(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(TASHKEEL, "")
    .replace(/[ٱأإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ar");
}

/** هل يحتوي الحقل على العبارة بعد التطبيع؟ (تطابق تجزئي، لا كلمة كاملة) */
export function fieldMatches(
  value: string | undefined,
  needle: string,
): boolean {
  const normalizedNeedle = normalizeArabic(needle);
  if (!normalizedNeedle) return true;
  return normalizeArabic(value).includes(normalizedNeedle);
}

/** هل الكلمة المُدخلة معرّفًا رقميًا صالحًا؟ (تراث/إسلام هاوس يستعملان أرقامًا) */
export function asNumericId(value: string | undefined): string | undefined {
  const trimmed = str(value);
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : undefined;
}

/** مولّد تقرير البحث — يبني الخطوات والقيود من قدرات المصدر المُتحقَّق منها. */
export class SearchNoticeBuilder {
  private readonly steps: BookSearchPlanStep[] = [];
  private readonly limits: string[] = [];

  constructor(private readonly capabilities: BookSearchCapabilities) {}

  server(label: string): this {
    this.steps.push({ label, scope: "server" });
    return this;
  }

  client(label: string): this {
    this.steps.push({ label, scope: "client" });
    return this;
  }

  unsupported(label: string, reason: string): this {
    this.steps.push({ label, scope: "unsupported" });
    this.limits.push(reason);
    return this;
  }

  limit(reason: string): this {
    this.limits.push(reason);
    return this;
  }

  build(source: IslamicLibrarySource, sourceName: string): BookSearchNotice {
    void this.capabilities;
    return {
      source,
      sourceName,
      steps: this.steps,
      limits: this.limits,
    };
  }
}