/**
 * مزوّد تراث (api.turath.io, ver=3) — كل المسارات مُتحقّق منها حيًا:
 *   /search?q&page&ver=3 (+ فلترة cat= | author= | book=)
 *   /book?id&include=indexes&ver=3      → meta + indexes (فهرس وأعداد الصفحات)
 *   /page?book_id&pg&ver=3              → نص الصفحة + meta.headings
 *   /author?id&ver=3                    → الاسم + السيرة
 *
 * غير مدعوم عند تراث: تعداد تصنيفات عام (لا نقطة)، ملف تحميل كامل، صور أغلفة.
 * العنوان/المؤلف في نتائج البحث من meta.book_name / meta.author_name فقط.
 */

import {
  fetchJsonRetry,
  isJsonRecord,
  itemsOf,
  num,
  safeLimit,
  safePage,
  str,
  stripHtml,
  uniqueById,
  type BookSearchParams,
  type CatalogueFilters,
  type IslamicBooksProvider,
} from "./providers";
import { TURATH_CAPABILITIES } from "./types";
import type {
  IslamicBook,
  IslamicBookAuthor,
  IslamicBookCategory,
  IslamicBookChapter,
  IslamicBookDetails,
  IslamicBookPage,
  IslamicBookSearchResult,
} from "./types";

const TURATH_API = "https://api.turath.io";
const TURATH_VERSION = 3;

type TurathSearchItemRaw = Record<string, unknown>;

type TurathSearchPayload = Record<string, unknown> & {
  count?: unknown;
  data?: unknown;
};

type TurathBookPayload = Record<string, unknown> & {
  meta?: unknown;
  indexes?: unknown;
};

function parseMeta(raw: unknown): Record<string, unknown> {
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

function bookUrl(bookId: number): string | undefined {
  return bookId > 0 ? `https://app.turath.io/book/${bookId}` : undefined;
}

function normalizeSearchItem(raw: TurathSearchItemRaw): IslamicBook | null {
  const bookId = num(raw.book_id);
  if (bookId === undefined || bookId <= 0) return null;
  const meta = parseMeta(raw.meta);
  const authorId = num(raw.author_id);
  const categoryId = num(raw.cat_id);

  return {
    id: `turath:${bookId}`,
    source: "turath",
    rawId: String(bookId),
    title:
      str(meta.book_name) ??
      str(meta.name) ??
      `كتاب ${bookId}`,
    author:
      str(meta.author_name) ??
      str(meta.author) ??
      undefined,
    authorId: authorId !== undefined ? String(authorId) : undefined,
    description: stripHtml(raw.snip) ?? str(meta.info),
    sourceCategoryId: categoryId !== undefined ? String(categoryId) : undefined,
    sourceUrl: bookUrl(bookId),
    language: "ar",
    sourcePage: num(meta.page),
  };
}

function normalizeBookDetails(payload: TurathBookPayload, rawId: string) {
  const meta = parseMeta(payload.meta);
  const indexes = isJsonRecord(payload.indexes) ? payload.indexes : {};
  const bookId = num(meta.id, Number(rawId));
  const safeId = bookId ?? Number(rawId);

  const pageMap = Array.isArray(indexes.page_map) ? indexes.page_map : [];

  const book: IslamicBook = {
    id: `turath:${safeId}`,
    source: "turath",
    rawId: String(safeId),
    title: str(meta.name) ?? `كتاب ${safeId}`,
    authorId: num(meta.author_id) !== undefined ? String(meta.author_id) : undefined,
    description: str(meta.info),
    infoLong: str(meta.info_long),
    sourceCategoryId:
      num(meta.cat_id) !== undefined ? String(meta.cat_id) : undefined,
    sourceUrl: bookUrl(safeId),
    language: "ar",
    pages: pageMap.length > 0 ? pageMap.length : undefined,
  };

  const headings = Array.isArray(indexes.headings) ? indexes.headings : [];
  const chapters: IslamicBookChapter[] = [];
  for (const heading of headings) {
    const record = isJsonRecord(heading) ? heading : {};
    const page = num(record.page);
    if (page === undefined) continue;
    chapters.push({
      id: `turath-chapter-${page}`,
      title: str(record.title) ?? `صفحة ${page}`,
      page,
      level: num(record.level) ?? 1,
    });
  }

  return { book, chapters: chapters.length > 0 ? chapters : undefined };
}

export class TurathBooksProvider implements IslamicBooksProvider {
  readonly id = "turath" as const;
  readonly displayName = "تراث";
  readonly capabilities = TURATH_CAPABILITIES;

  async getCategories(): Promise<IslamicBookCategory[]> {
    return [];
  }

  async getBooks(_filters?: CatalogueFilters): Promise<IslamicBookSearchResult> {
    return { items: [], page: 1, perPage: 20, total: 0, hasMore: false };
  }

  async searchBooks(
    query: string,
    params?: BookSearchParams,
  ): Promise<IslamicBookSearchResult> {
    const q = str(query);
    const page = safePage(params?.page);
    const perPage = safeLimit(params?.perPage);

    if (!q) {
      return { items: [], page, perPage, total: 0, hasMore: false };
    }

    const payload = await fetchJsonRetry<TurathSearchPayload>(
      `${TURATH_API}/search?q=${encodeURIComponent(q)}&page=${page}&ver=${TURATH_VERSION}`,
      "كتب تراث",
    );

    const items = itemsOf(payload.data ?? payload)
      .map((raw) => normalizeSearchItem(isJsonRecord(raw) ? raw : {}))
      .filter((item): item is IslamicBook => item !== null);

    const total = num(payload.count, items.length) ?? items.length;

    return {
      items,
      page,
      perPage,
      total,
      hasMore: page * perPage < total,
    };
  }

  async getBook(rawId: string): Promise<IslamicBook | undefined> {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) return undefined;
    const payload = await fetchJsonRetry<TurathBookPayload>(
      `${TURATH_API}/book?id=${id}&include=indexes&ver=${TURATH_VERSION}`,
      "كتب تراث",
    );
    const details = normalizeBookDetails(payload, rawId);
    return details.book;
  }

  async getBookDetails(rawId: string): Promise<IslamicBookDetails | undefined> {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) return undefined;
    const payload = await fetchJsonRetry<TurathBookPayload>(
      `${TURATH_API}/book?id=${id}&include=indexes&ver=${TURATH_VERSION}`,
      "كتب تراث",
    );
    const details = normalizeBookDetails(payload, rawId);
    if (details.book.authorId) {
      try {
        const author = await this.getAuthor(details.book.authorId);
        if (author) details.book.author = author.name;
      } catch {
        // الفشل في الاسم لا يمنع تفاصيل الكتاب.
      }
    }
    return details;
  }

  async getBookChapters(
    rawId: string,
  ): Promise<IslamicBookChapter[] | undefined> {
    const details = await this.getBookDetails(rawId);
    return details?.chapters;
  }

  async getBookPage(
    rawId: string,
    pageNumber: number,
  ): Promise<IslamicBookPage | undefined> {
    const id = Number(rawId);
    const page = safePage(pageNumber);
    if (!Number.isInteger(id) || id <= 0) return undefined;

    const payload = await fetchJsonRetry<Record<string, unknown>>(
      `${TURATH_API}/page?book_id=${id}&pg=${page}&ver=${TURATH_VERSION}`,
      "صفحات كتب التراث",
    );

    const meta = parseMeta(payload.meta);
    const text = str(payload.text) ?? "";

    if (!text && Object.keys(meta).length === 0) return undefined;

    const headings = Array.isArray(meta.headings) ? meta.headings : [];
    const heading =
      str(meta.heading) ??
      str(meta.title) ??
      (headings.length > 0 && typeof headings[0] === "string"
        ? headings[0]
        : undefined);

    return {
      bookId: `turath:${id}`,
      source: "turath",
      page,
      vol: str(meta.vol),
      text,
      heading,
    };
  }

  async getAuthor(id: string): Promise<IslamicBookAuthor | undefined> {
    const authorId = Number(id);
    if (!Number.isInteger(authorId) || authorId <= 0) return undefined;

    const payload = await fetchJsonRetry<Record<string, unknown>>(
      `${TURATH_API}/author?id=${authorId}&ver=${TURATH_VERSION}`,
      "مؤلفو تراث",
    );

    const name = str(payload.name);
    if (!name) return undefined;

    return {
      id: String(authorId),
      source: "turath",
      name,
      biography: str(payload.biography),
    };
  }

  async searchInsideBook(
    rawId: string,
    query: string,
  ): Promise<IslamicBookSearchResult | undefined> {
    const id = Number(rawId);
    const q = str(query);
    if (!Number.isInteger(id) || id <= 0 || !q) return undefined;

    const payload = await fetchJsonRetry<TurathSearchPayload>(
      `${TURATH_API}/search?q=${encodeURIComponent(q)}&book=${id}&page=1&ver=${TURATH_VERSION}`,
      "البحث داخل الكتاب",
    );

    const items = itemsOf(payload.data ?? payload)
      .map((raw) => normalizeSearchItem(isJsonRecord(raw) ? raw : {}))
      .filter((item): item is IslamicBook => item !== null)
      .filter((item) => item.sourcePage !== undefined);

    const total = num(payload.count, items.length) ?? items.length;

    return {
      items: uniqueById(items),
      page: 1,
      perPage: items.length,
      total,
      hasMore: false,
    };
  }
}