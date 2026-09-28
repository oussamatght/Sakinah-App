/**
 * مزوّد إسلام هاوس (API v3) — المسارات كلها مُتحقّق منها حيًا:
 *   /main/books/ar/ar/{page}/{limit}/json        قائمة كتب عامة
 *   /main/get-item/{id}/ar/json                  تفاصيل عنصر (مرفقات، مؤلفون، غلاف)
 *   /main/get-author/{id}/ar/json                مؤلف/مصدر (سيرة، عدد عناصره)
 *   /categories/showall/ar/json                  الشجرة الكاملة (id | source_id | apiurl)
 *   {apiurl} = categories/viewcat/{source_id}…   الفروع المباشرة (ذاتي-الوصف)
 *   /main/get-category-items/{nodeId}/…          عناصر التصنيف {data, links}
 *   /main/get-author-items/{authorId}/…          عناصر المؤلف {data, links}
 *
 * «البحث النصي» غير موجود في إصدار API هذا (مُتحقّق: لا نقطة بحث نصي).
 * البحث هنا = تصفية محلية على صفحات القوائم/التصنيفات التي قدمها المصدر.
 * التصنيفات تُتصفح عبر سلسلة: الشجرة → get-category-items، وعندما لا يحمل
 * تصنيف عناصر مباشرة نوسّعه عبر فروعه (viewcat) — بلا أي مسار مخترع.
 */

import {
  fetchJsonRetry,
  httpsUrl,
  idString,
  isJsonRecord,
  itemsOf,
  num,
  paginationOf,
  safeLimit,
  safePage,
  str,
  uniqueById,
  type BookSearchParams,
  type CatalogueFilters,
  type IslamicBooksProvider,
} from "./providers";
import { ISLAMHOUSE_CAPABILITIES } from "./types";
import type {
  IslamicBook,
  IslamicBookAttachment,
  IslamicBookAuthor,
  IslamicBookCategory,
  IslamicBookChapter,
  IslamicBookDetails,
  IslamicBookPage,
  IslamicBookSearchResult,
} from "./types";

const ISLAMHOUSE_API = "https://api3.islamhouse.com/v3/paV29H2gm56kvLPy";

const MAX_SEARCH_SCAN_PAGES = 3;

type IhItemRaw = Record<string, unknown>;

function coverOf(rawImage: string | undefined): string | undefined {
  if (!rawImage) return undefined;
  if (rawImage.startsWith("/")) return `https://islamhouse.com${rawImage}`;
  return httpsUrl(rawImage);
}

function normalizeItem(raw: IhItemRaw): IslamicBook | null {
  const id = idString(raw.id);
  if (!id) return null;

  const preparedBy = Array.isArray(raw.prepared_by) ? raw.prepared_by : [];
  const people = preparedBy.filter(isJsonRecord);
  const authors = people.filter((person) => {
    const kind = str(person.kind);
    return kind === undefined || kind === "author";
  });
  const primary = authors[0] ?? people[0];
  const authorId = primary
    ? idString(primary.id) ?? idString(primary.source_id)
    : undefined;

  const attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
  const attachmentList: IslamicBookAttachment[] = [];
  for (const attachment of attachments) {
    if (!isJsonRecord(attachment)) continue;
    const url = str(attachment.url);
    if (!url) continue;
    attachmentList.push({
      title: str(attachment.description) ?? str(attachment.title),
      url,
      size: str(attachment.size),
      type: str(attachment.extension_type) ?? str(attachment.type),
    });
  }

  return {
    id: `islamhouse:${id}`,
    source: "islamhouse",
    rawId: id,
    title: str(raw.title) ?? `كتاب ${id}`,
    author:
      (primary ? str(primary.title) : undefined) ?? str(raw.author),
    authorId,
    description: str(raw.description) ?? str(raw.full_description),
    sourceUrl: str(raw.api_url),
    coverUrl: coverOf(str(raw.image)),
    downloadUrl: attachmentList[0]?.url,
    attachments: attachmentList.length > 0 ? attachmentList : undefined,
    itemType: str(raw.type),
    language: str(raw.translated_language) ?? str(raw.source_language),
  };
}

const isBook = (book: IslamicBook | null): book is IslamicBook =>
  book !== null && (book.itemType === undefined || book.itemType === "books");

export class IslamHouseBooksProvider implements IslamicBooksProvider {
  readonly id = "islamhouse" as const;
  readonly displayName = "إسلام هاوس";
  readonly capabilities = ISLAMHOUSE_CAPABILITIES;

  private categoriesPromise?: Promise<IslamicBookCategory[]>;

  async getCategories(): Promise<IslamicBookCategory[]> {
    if (!this.categoriesPromise) {
      this.categoriesPromise = (async () => {
        const payload = await fetchJsonRetry<unknown>(
          `${ISLAMHOUSE_API}/categories/showall/ar/json`,
          "تصنيفات إسلام هاوس",
        );
        return (Array.isArray(payload) ? payload : [])
          .filter(isJsonRecord)
          .map((raw) => ({
            id: idString(raw.id) ?? "",
            source: "islamhouse" as const,
            title: str(raw.title) ?? "",
            description: str(raw.shortdescription) ?? str(raw.description),
            parentId:
              raw.parent_id === null || raw.parent_id === undefined
                ? null
                : String(raw.parent_id),
            itemsUrl: str(raw.apiurl),
          }))
          .filter((category) => category.id && category.title);
      })();
    }
    return this.categoriesPromise;
  }

  async getBooks(filters?: CatalogueFilters): Promise<IslamicBookSearchResult> {
    const page = safePage(filters?.page);
    const perPage = safeLimit(filters?.perPage);
    const categoryId = str(filters?.categoryId);
    if (categoryId) {
      return this.browseCategory(categoryId, page, perPage);
    }
    return this.fetchGlobalBooks(page, perPage);
  }

  private async fetchGlobalBooks(
    page: number,
    perPage: number,
  ): Promise<IslamicBookSearchResult> {
    const payload = await fetchJsonRetry<unknown>(
      `${ISLAMHOUSE_API}/main/books/ar/ar/${page}/${perPage}/json`,
      "كتب إسلام هاوس",
    );
    const arr = itemsOf(payload).filter(isJsonRecord).map(normalizeItem);
    const items = uniqueById(arr.filter(isBook));
    return {
      items,
      page,
      perPage,
      total: items.length,
      hasMore: arr.length >= perPage,
    };
  }

  private async fetchCategoryItems(
    categoryId: string,
    page: number,
    perPage: number,
  ): Promise<IslamicBookSearchResult> {
    const payload = await fetchJsonRetry<unknown>(
      `${ISLAMHOUSE_API}/main/get-category-items/${encodeURIComponent(categoryId)}/showall/ar/ar/${page}/${perPage}/json`,
      "كتب إسلام هاوس",
    );

    if (isJsonRecord(payload) && typeof payload.error === "string") {
      return { items: [], page, perPage, total: 0, hasMore: false };
    }

    const rawItems = itemsOf(payload).filter(isJsonRecord).map(normalizeItem);
    const items = uniqueById(rawItems.filter(isBook));
    const links = paginationOf(payload);
    const total = links.total ?? items.length;
    const hasMore =
      links.currentPage !== undefined && links.pages !== undefined
        ? links.currentPage < links.pages
        : page * perPage < total;

    return { items, page, perPage, total, hasMore };
  }

  private async browseCategory(
    categoryId: string,
    page: number,
    perPage: number,
  ): Promise<IslamicBookSearchResult> {
    const direct = await this.fetchCategoryItems(categoryId, page, perPage);
    if (direct.items.length > 0) return direct;

    const node = (await this.getCategories()).find((c) => c.id === categoryId);
    if (!node?.itemsUrl || page > 1) {
      return { items: [], page, perPage, total: 0, hasMore: false };
    }

    let children: unknown[] = [];
    try {
      const payload = await fetchJsonRetry<unknown>(node.itemsUrl, "تصنيفات إسلام هاوس");
      children = Array.isArray(payload) ? payload : itemsOf(payload);
    } catch {
      children = [];
    }

    const collected: IslamicBook[] = [];
    for (const childRaw of children) {
      if (collected.length >= perPage) break;
      const childId = isJsonRecord(childRaw) ? idString(childRaw.id) : undefined;
      if (!childId) continue;
      const result = await this.fetchCategoryItems(childId, 1, perPage);
      collected.push(...result.items);
    }

    const items = uniqueById(collected).slice(0, perPage);
    return { items, page, perPage, total: items.length, hasMore: false };
  }

  async searchBooks(
    query: string,
    params?: BookSearchParams,
  ): Promise<IslamicBookSearchResult> {
    const q = str(query);
    const page = safePage(params?.page);
    const perPage = safeLimit(params?.perPage);

    if (!q) return this.fetchGlobalBooks(page, perPage);

    const needle = q.toLocaleLowerCase("ar");
    const scanned: IslamicBook[] = [];
    for (let current = 1; current <= MAX_SEARCH_SCAN_PAGES; current += 1) {
      const batch = await this.fetchGlobalBooks(current, 50);
      scanned.push(...batch.items);
      if (batch.items.length < 50) break;
    }

    const filtered = uniqueById(scanned).filter((book) =>
      `${
        book.title
      } ${book.author ?? ""} ${book.description ?? ""}`
        .toLocaleLowerCase("ar")
        .includes(needle),
    );

    const start = (page - 1) * perPage;
    return {
      items: filtered.slice(start, start + perPage),
      page,
      perPage,
      total: filtered.length,
      hasMore: start + perPage < filtered.length,
    };
  }

  async getBook(rawId: string): Promise<IslamicBook | undefined> {
    const payload = await fetchJsonRetry<unknown>(
      `${ISLAMHOUSE_API}/main/get-item/${encodeURIComponent(rawId)}/ar/json`,
      "كتب إسلام هاوس",
    );
    if (!isJsonRecord(payload)) return undefined;
    return normalizeItem(payload) ?? undefined;
  }

  async getBookDetails(rawId: string): Promise<IslamicBookDetails | undefined> {
    const book = await this.getBook(rawId);
    return book ? { book } : undefined;
  }

  async getBookChapters(): Promise<IslamicBookChapter[] | undefined> {
    return undefined;
  }

  async getBookPage(): Promise<IslamicBookPage | undefined> {
    return undefined;
  }

  async getAuthor(id: string): Promise<IslamicBookAuthor | undefined> {
    const payload = await fetchJsonRetry<unknown>(
      `${ISLAMHOUSE_API}/main/get-author/${encodeURIComponent(id)}/ar/json`,
      "مؤلفو إسلام هاوس",
    );
    if (!isJsonRecord(payload)) return undefined;
    const name = str(payload.title) ?? str(payload.name);
    if (!name) return undefined;
    return {
      id: String(id),
      source: "islamhouse",
      name,
      kind: str(payload.kind),
      biography: str(payload.description) ?? str(payload.full_description),
      itemsCount: num(payload.items_count),
      itemsUrl: str(payload.item_api_url),
    };
  }

  async searchInsideBook(): Promise<IslamicBookSearchResult | undefined> {
    return undefined;
  }
}