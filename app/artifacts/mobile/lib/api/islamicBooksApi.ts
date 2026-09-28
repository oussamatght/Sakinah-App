/**
 * Islamic books data layer.
 *
 * Two providers are normalized into the same IslamicBook shape:
 *
 * 1. Turath.io
 *    - Search: GET https://api.turath.io/search?q=...&ver=3
 *    - Book info: GET https://api.turath.io/book?id=...&include=indexes&ver=3
 *    - Page: GET https://api.turath.io/page?book_id=...&pg=...&ver=3
 *
 * 2. IslamHouse API v3
 *    - Books list:
 *      GET https://api3.islamhouse.com/v3/paV29H2gm56kvLPy/main/books/ar/ar/{page}/{limit}/json
 *    - Item details:
 *      GET https://api3.islamhouse.com/v3/paV29H2gm56kvLPy/main/get-item/{id}/ar/json
 *    - Attachments:
 *      GET https://api3.islamhouse.com/v3/paV29H2gm56kvLPy/main/check-attachment/{id}/json
 *
 * The implementation follows the same pattern as the existing Hadith service:
 * fetchJson -> validate/normalize -> expose app-friendly types.
 */

import {
  fetchJson,
  intString,
  isJsonRecord,
  type JsonRecord,
} from "./http";

import type {
  IslamicBook,
  IslamicBookAttachment,
  IslamicBookCategory,
  IslamicBookPage,
  IslamicBookSearchResult,
} from "../../types/islamicBooksTypes";

const TURATH_API = "https://api.turath.io";
const ISLAMHOUSE_API =
  "https://api3.islamhouse.com/v3/paV29H2gm56kvLPy";

const TURATH_VERSION = 3;

function safePage(page: number): number {
  return Math.max(1, Math.floor(page || 1));
}

function safePerPage(perPage: number): number {
  return Math.min(Math.max(Math.floor(perPage || 20), 1), 50);
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/* -------------------------------------------------------------------------- */
/* Turath.io                                                                  */
/* -------------------------------------------------------------------------- */

type TurathSearchRaw = JsonRecord & {
  author_id?: unknown;
  book_id?: unknown;
  cat_id?: unknown;
  meta?: unknown;
  snip?: unknown;
  text?: unknown;
};

type TurathSearchResponse = {
  count?: unknown;
  data?: unknown;
};

type TurathBookResponse = JsonRecord & {
  meta?: unknown;
  indexes?: unknown;
};

function parseTurathMeta(raw: unknown): JsonRecord {
  if (isJsonRecord(raw)) return raw;

  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return isJsonRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function normalizeTurathSearchItem(raw: TurathSearchRaw): IslamicBook {
  const meta = parseTurathMeta(raw.meta);
  const bookId = intString(raw.book_id, 0) ?? 0;
  const authorId = intString(raw.author_id, 0) ?? undefined;
  const categoryId = intString(raw.cat_id, 0) ?? undefined;

  return {
    id: `turath:${bookId}`,
    source: "turath",
    title:
      asNonEmptyString(meta.name) ??
      asNonEmptyString(meta.title) ??
      `كتاب ${bookId}`,
    author:
      asNonEmptyString(meta.author) ??
      (authorId ? `مؤلف #${authorId}` : undefined),
    description:
      asNonEmptyString(meta.info) ??
      asNonEmptyString(meta.description) ??
      asNonEmptyString(raw.snip),
    category: categoryId ? `تصنيف #${categoryId}` : undefined,
    language: "ar",
    url: bookId ? `https://app.turath.io/book/${bookId}` : undefined,
    rawId: bookId,
  };
}

/**
 * Search Turath books/content.
 *
 * Important: Turath's public API exposes search rather than a simple
 * "list every book" endpoint in the SDK/API used here. Therefore this
 * function is intentionally query-based.
 */
export async function searchTurathBooks(
  query: string,
  page = 1,
  perPage = 20,
): Promise<IslamicBookSearchResult> {
  const q = query.trim();
  if (!q) {
    return {
      items: [],
      page: safePage(page),
      perPage: safePerPage(perPage),
      total: 0,
      hasMore: false,
    };
  }

  const safeCurrentPage = safePage(page);
  const safeLimit = safePerPage(perPage);

  const payload = await fetchJson<TurathSearchResponse>(
    `${TURATH_API}/search?q=${encodeURIComponent(q)}&page=${safeCurrentPage}&ver=${TURATH_VERSION}`,
    "كتب تراث",
    { timeoutMs: 25_000 },
  );

  const data = Array.isArray(payload.data) ? payload.data : [];
  const items = data
    .filter(isJsonRecord)
    .map((raw) => normalizeTurathSearchItem(raw as TurathSearchRaw))
    .filter((item) => item.rawId);

  const total = intString(payload.count, items.length) ?? items.length;

  return {
    items,
    page: safeCurrentPage,
    perPage: safeLimit,
    total,
    hasMore: safeCurrentPage * safeLimit < total,
  };
}

export async function fetchTurathBook(bookId: number): Promise<IslamicBook> {
  const payload = await fetchJson<TurathBookResponse>(
    `${TURATH_API}/book?id=${bookId}&include=indexes&ver=${TURATH_VERSION}`,
    "تفاصيل كتاب تراث",
    { timeoutMs: 20_000 },
  );

  const meta = isJsonRecord(payload.meta) ? payload.meta : {};
  const title = asNonEmptyString(meta.name) ?? `كتاب ${bookId}`;

  return {
    id: `turath:${bookId}`,
    source: "turath",
    title,
    author: asNonEmptyString(meta.author),
    description:
      asNonEmptyString(meta.info) ?? asNonEmptyString(meta.info_long),
    category:
      meta.cat_id !== undefined ? `تصنيف #${String(meta.cat_id)}` : undefined,
    language: "ar",
    url: `https://app.turath.io/book/${bookId}`,
    totalPages: Array.isArray(
      (payload.indexes as JsonRecord | undefined)?.page_map,
    )
      ? ((payload.indexes as JsonRecord).page_map as unknown[]).length
      : undefined,
    rawId: bookId,
  };
}

export async function fetchTurathPage(
  bookId: number,
  pageNumber: number,
): Promise<IslamicBookPage> {
  const page = Math.max(1, Math.floor(pageNumber || 1));

  const payload = await fetchJson<JsonRecord>(
    `${TURATH_API}/page?book_id=${bookId}&pg=${page}&ver=${TURATH_VERSION}`,
    "صفحة من كتاب تراث",
    { timeoutMs: 20_000 },
  );

  const text = asNonEmptyString(payload.text) ?? "";
  const metaRaw = payload.meta;
  const meta = parseTurathMeta(metaRaw);

  if (!text && Object.keys(meta).length === 0) {
    throw new Error(`الصفحة ${page} غير موجودة في الكتاب ${bookId}`);
  }

  return {
    bookId: `turath:${bookId}`,
    source: "turath",
    page,
    text,
    heading: asNonEmptyString(meta.heading) ?? asNonEmptyString(meta.title),
    raw: payload,
  };
}

/* -------------------------------------------------------------------------- */
/* IslamHouse                                                                 */
/* -------------------------------------------------------------------------- */

type IslamHouseItemRaw = JsonRecord & {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  type?: unknown;
  prepared_by?: unknown;
  author?: unknown;
  url?: unknown;
  file_url?: unknown;
};

function normalizeIslamHouseItem(raw: IslamHouseItemRaw): IslamicBook {
  const id = String(raw.id ?? "");
  const preparedBy = Array.isArray(raw.prepared_by)
    ? raw.prepared_by
        .filter((item) => typeof item === "string")
        .join("، ")
    : undefined;

  return {
    id: `islamhouse:${id}`,
    source: "islamhouse",
    title: asNonEmptyString(raw.title) ?? `كتاب ${id}`,
    author:
      asNonEmptyString(raw.author) ??
      preparedBy ??
      undefined,
    description: asNonEmptyString(raw.description),
    category: asNonEmptyString(raw.type) ?? "books",
    language: "ar",
    url: asNonEmptyString(raw.url),
    downloadUrl: asNonEmptyString(raw.file_url),
    rawId: id,
  };
}

export async function fetchIslamHouseBooks(
  page = 1,
  perPage = 20,
): Promise<IslamicBookSearchResult> {
  const safeCurrentPage = safePage(page);
  const safeLimit = safePerPage(perPage);

  const payload = await fetchJson<unknown>(
    `${ISLAMHOUSE_API}/main/books/ar/ar/${safeCurrentPage}/${safeLimit}/json`,
    "كتب إسلام هاوس",
    { timeoutMs: 25_000 },
  );

  const data = Array.isArray(payload)
    ? payload
    : isJsonRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : [];

  const items = data
    .filter(isJsonRecord)
    .map((raw) => normalizeIslamHouseItem(raw as IslamHouseItemRaw))
    .filter((item) => item.rawId);

  /**
   * The list endpoint is an array and does not consistently expose total
   * metadata in the documented response shape. Keep hasMore conservative.
   */
  return {
    items,
    page: safeCurrentPage,
    perPage: safeLimit,
    total: items.length,
    hasMore: items.length === safeLimit,
  };
}

export async function searchIslamHouseBooks(
  query: string,
  page = 1,
  perPage = 20,
): Promise<IslamicBookSearchResult> {
  const q = query.trim().toLocaleLowerCase("ar");
  const result = await fetchIslamHouseBooks(page, perPage);

  if (!q) return result;

  const filtered = result.items.filter((book) =>
    `${book.title} ${book.author ?? ""} ${book.description ?? ""}`
      .toLocaleLowerCase("ar")
      .includes(q),
  );

  return {
    ...result,
    items: filtered,
    total: filtered.length,
    hasMore: false,
  };
}

export async function fetchIslamHouseBook(
  itemId: number | string,
): Promise<IslamicBook> {
  const payload = await fetchJson<IslamHouseItemRaw>(
    `${ISLAMHOUSE_API}/main/get-item/${encodeURIComponent(String(itemId))}/ar/json`,
    "تفاصيل كتاب إسلام هاوس",
    { timeoutMs: 20_000 },
  );

  return normalizeIslamHouseItem(payload);
}

export async function fetchIslamHouseAttachments(
  itemId: number | string,
): Promise<IslamicBookAttachment[]> {
  const payload = await fetchJson<unknown>(
    `${ISLAMHOUSE_API}/main/check-attachment/${encodeURIComponent(String(itemId))}/json`,
    "ملفات الكتاب",
    { timeoutMs: 20_000 },
  );

  const data = Array.isArray(payload)
    ? payload
    : isJsonRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : [];

  return data
    .filter(isJsonRecord)
    .map((raw) => ({
      id: String(raw.id ?? ""),
      url: String(raw.file_url ?? raw.url ?? ""),
      title: asNonEmptyString(raw.title),
      size: asNonEmptyString(raw.size),
      type: asNonEmptyString(raw.type),
    }))
    .filter((item) => item.id && item.url);
}

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

export async function fetchIslamHouseCategories(): Promise<
  IslamicBookCategory[]
> {
  const payload = await fetchJson<unknown>(
    `${ISLAMHOUSE_API}/categories/showall/ar/json`,
    "تصنيفات الكتب",
    { timeoutMs: 20_000 },
  );

  const data = Array.isArray(payload) ? payload : [];

  return data
    .filter(isJsonRecord)
    .map((raw) => ({
      id: String(raw.id ?? ""),
      title: String(raw.title ?? ""),
      description: asNonEmptyString(raw.description),
      source: "islamhouse" as const,
      parentId:
        raw.parent_id === null || raw.parent_id === undefined
          ? null
          : String(raw.parent_id),
    }))
    .filter((item) => item.id && item.title);
}

/* -------------------------------------------------------------------------- */
/* Combined provider                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Search both providers in parallel and merge their normalized results.
 *
 * This is the main function your Books screen can call.
 */
export async function searchIslamicBooks(
  query: string,
  page = 1,
  perPage = 20,
): Promise<IslamicBookSearchResult> {
  const [turath, islamHouse] = await Promise.all([
    searchTurathBooks(query, page, perPage),
    searchIslamHouseBooks(query, page, perPage),
  ]);

  const items = [...turath.items, ...islamHouse.items];

  return {
    items,
    page: Math.max(1, Math.floor(page || 1)),
    perPage: safePerPage(perPage),
    total: turath.total + islamHouse.total,
    hasMore: turath.hasMore || islamHouse.hasMore,
  };
}

/**
 * Browse both sources without a text query.
 *
 * Turath cannot be treated as a normal "list all books" endpoint through
 * its public SDK surface, so this returns only IslamHouse for an empty query.
 * For Turath, use searchTurathBooks("your query").
 */
export async function fetchIslamicBooks(
  page = 1,
  perPage = 20,
): Promise<IslamicBookSearchResult> {
  return fetchIslamHouseBooks(page, perPage);
}
