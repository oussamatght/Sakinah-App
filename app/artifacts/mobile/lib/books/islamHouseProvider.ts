/**
 * مزوّد إسلام هاوس (API v3) — المسارات مُتحقّق منها حيًا:
 *   /main/books/ar/ar/{page}/{limit}/json (قائمة، links.total_items) ·
 *   /main/get-item/{id}/ar/json (مرفقات ومؤلفون وغلاف) ·
 *   /main/get-author/{id}/ar/json (سيرة وعدد عناصره) ·
 *   /main/get-author-items/{id}/showall/ar/ar/{page}/{limit}/json (كتب المؤلف) ·
 *   /categories/showall/ar/json (معرّفات **غير صالحة** ل get-category-items) ·
 *   /categories/viewcat/{source_id}/ar/showall/json (أبناء بمعرّفات صالحة) ·
 *   /main/get-category-items/{validId}/showall/ar/ar/{page}/{limit}/json
 * لا بحث نصي (متحقّق: ‎/main/search = 404) ولا بالعنوان ولا lookup بالمؤلف؛ فالتصنيف
 * والمؤلف(id) فلترة **على الخادم** وأي نص تصفية محلية **محدودة** تُعلن. ومتحقَّق حيًّا:
 * الفروع الحقيقية (١٦) من viewcat الخاص بالجذر لا من showall (معرّفاته «لا عناصر»).
 */

import {
  asNumericId,
  fetchJsonRetry,
  fieldMatches,
  httpsUrl,
  idString,
  isJsonRecord,
  itemsOf,
  num,
  paginationOf,
  safeLimit,
  safePage,
  SearchNoticeBuilder,
  str,
  uniqueById,
  type BookSearchParams,
  type CatalogueFilters,
  type IslamicBooksProvider,
} from "./providers";
import { ISLAMHOUSE_CAPABILITIES, ISLAMHOUSE_SEARCH_CAPABILITIES } from "./types";
import type {
  BookSearchFilters,
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

/** جذر شجرة التصنيفات — معرّفه مُتحقَّق منه (يُكتشف بالعنوان لا بمعرّف مخترع). */
const CATEGORY_TREE_ROOT_TITLE = "شجرة التصنيفات";

/** حدّ_pages المفحوصة نصيًا محليًا (لا نحمّل المكتبة كاملة). */
const MAX_SEARCH_SCAN_PAGES = 3;
const SEARCH_SCAN_PAGE_SIZE = 50;

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
    // إسلام هاوس لا يوفّر نقطة نهاية نصّ إطلاقًا: القراءة عبر PDF فقط.
    readability: "pdf-only",
  };
}

const isBook = (book: IslamicBook | null): book is IslamicBook =>
  book !== null && (book.itemType === undefined || book.itemType === "books");

export class IslamHouseBooksProvider implements IslamicBooksProvider {
  readonly id = "islamhouse" as const;
  readonly displayName = "إسلام هاوس";
  readonly capabilities = ISLAMHOUSE_CAPABILITIES;
  readonly searchCapabilities = ISLAMHOUSE_SEARCH_CAPABILITIES;

  private categoriesPromise?: Promise<IslamicBookCategory[]>;
  /** معرّف → عقدة (مع رابط أبناءها) — يبنيه showall/viewcat عند المرور. */
  private nodes = new Map<string, IslamicBookCategory>();
  private branchesPromise?: Promise<IslamicBookCategory[]>;
  private childrenPromises = new Map<string, Promise<IslamicBookCategory[]>>();

  async getCategories(): Promise<IslamicBookCategory[]> {
    if (!this.categoriesPromise) {
      this.categoriesPromise = (async () => {
        const payload = await fetchJsonRetry<unknown>(
          `${ISLAMHOUSE_API}/categories/showall/ar/json`,
          "تصنيفات إسلام هاوس",
        );
        const categories = (Array.isArray(payload) ? payload : [])
          .filter(isJsonRecord)
          .map((raw) => {
            const category: IslamicBookCategory = {
              id: idString(raw.id) ?? "",
              source: "islamhouse" as const,
              title: str(raw.title) ?? "",
              description: str(raw.shortdescription) ?? str(raw.description),
              parentId:
                raw.parent_id === null || raw.parent_id === undefined
                  ? null
                  : String(raw.parent_id),
              itemsUrl: str(raw.apiurl),
            };
            if (category.id) this.nodes.set(category.id, category);
            return category;
          })
          .filter((category) => category.id && category.title);
        return categories;
      })();
    }
    return this.categoriesPromise;
  }

  /** الفروع الحقيقية من viewcat الخاص بجذر الشجرة — معرّفاتها الصالحة لـ get-category-items؛ طلب واحد مُخزَّن. */
  async getCategoryBranches(): Promise<IslamicBookCategory[]> {
    if (!this.branchesPromise) {
      this.branchesPromise = (async () => {
        const categories = await this.getCategories();
        const root = categories.find(
          (category) => category.title.trim() === CATEGORY_TREE_ROOT_TITLE,
        );
        if (!root?.itemsUrl) return [];

        const payload = await fetchJsonRetry<unknown>(
          root.itemsUrl,
          "تصنيفات إسلام هاوس",
        );
        return this.registerChildren(root.id, payload);
      })();
    }
    return this.branchesPromise;
  }

  async getCategoryChildren(nodeId: string): Promise<IslamicBookCategory[]> {
    const id = str(nodeId);
    if (!id) return [];

    const cached = this.childrenPromises.get(id);
    if (cached) return cached;

    const promise = (async () => {
      const node = this.nodes.get(id);
      if (!node?.itemsUrl) return [];
      const payload = await fetchJsonRetry<unknown>(
        node.itemsUrl,
        "تصنيفات إسلام هاوس",
      );
      return this.registerChildren(id, payload);
    })();

    this.childrenPromises.set(id, promise);
    return promise;
  }

  private registerChildren(
    parentId: string,
    payload: unknown,
  ): IslamicBookCategory[] {
    const raw = Array.isArray(payload) ? payload : itemsOf(payload);
    const children: IslamicBookCategory[] = [];
    for (const entry of raw) {
      if (!isJsonRecord(entry)) continue;
      const id = idString(entry.id);
      const title = str(entry.title);
      if (!id || !title) continue;
      const child: IslamicBookCategory = {
        id,
        source: "islamhouse" as const,
        title,
        description: str(entry.shortdescription) ?? str(entry.description),
        parentId,
        itemsUrl: str(entry.apiurl),
      };
      this.nodes.set(id, child);
      children.push(child);
    }
    return children;
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
      const batch = await this.fetchGlobalBooks(current, SEARCH_SCAN_PAGE_SIZE);
      scanned.push(...batch.items);
      if (batch.items.length < SEARCH_SCAN_PAGE_SIZE) break;
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

  /** كتب مؤلف بعينه — نقطة حقيقية (get-author-items) بترقيم و links. */
  async getBooksByAuthor(
    authorId: string,
    page = 1,
    perPage = 20,
  ): Promise<IslamicBookSearchResult | undefined> {
    const id = asNumericId(authorId);
    if (!id) return undefined;

    const safePageNumber = safePage(page);
    const limit = safeLimit(perPage);
    const payload = await fetchJsonRetry<unknown>(
      `${ISLAMHOUSE_API}/main/get-author-items/${encodeURIComponent(id)}/showall/ar/ar/${safePageNumber}/${limit}/json`,
      "كتب مؤلف إسلام هاوس",
    );

    if (isJsonRecord(payload) && typeof payload.error === "string") {
      return {
        items: [],
        page: safePageNumber,
        perPage: limit,
        total: 0,
        hasMore: false,
      };
    }

    const rawItems = itemsOf(payload).filter(isJsonRecord).map(normalizeItem);
    const items = uniqueById(rawItems.filter(isBook));
    const links = paginationOf(payload);
    const total = links.total ?? items.length;
    const hasMore =
      links.currentPage !== undefined && links.pages !== undefined
        ? links.currentPage < links.pages
        : safePageNumber * limit < total;

    return { items, page: safePageNumber, perPage: limit, total, hasMore };
  }

  /** تصنيف أو مؤلف(id) بلا نص → **كله على الخادم** (get-category-items/get-author-items)؛ وأي نص ⇒ لا
   * endpoint نصي (404 مُتحقَّق) فتصفية محلية على عدد محدود من الصفحات تُعلن للمستخدم. */
  async searchWithFilters(
    filters: BookSearchFilters & { page?: number; perPage?: number },
  ): Promise<IslamicBookSearchResult> {
    const page = safePage(filters.page);
    const perPage = safeLimit(filters.perPage);
    const mode = filters.mode ?? "free";
    const notice = new SearchNoticeBuilder(this.searchCapabilities);

    const query = str(filters.query);
    const authorText = str(filters.author);
    const categoryId = str(filters.categoryId);
    const authorId = asNumericId(authorText);
    const textTerm = mode === "author" ? (authorText ?? undefined) : (query ?? undefined);

    if (categoryId) notice.server("التصنيف (get-category-items)");
    if (authorId) notice.server("المؤلف (get-author-items)");
    if (authorText && !authorId) {
      notice.unsupported(
        "المؤلف نصيًا",
        "إسلام هاوس لا يوفّر بحثًا باسم المؤلف ولا يحوّل الاسم إلى معرّف؛ أدخل معرّف المؤلف الرقمي للفلترة الحقيقية على الخادم.",
      );
    }
    if (mode === "title" && query) {
      notice.unsupported(
        "البحث باسم الكتاب",
        "إسلام هاوس لا يوفّر بحثًا بالعنوان؛ التصفية هنا على نتائج التصنيف/القائمة فقط.",
      );
    }
    if (textTerm) {
      notice.client(
        `بحث نصي محلي (${MAX_SEARCH_SCAN_PAGES * SEARCH_SCAN_PAGE_SIZE} كتابًا من قائمة المصدر)`,
      );
    }

    if (authorId) {
      const byAuthor = await this.getBooksByAuthor(authorId, page, perPage);
      if (byAuthor) {
        if (textTerm) {
          const filtered = byAuthor.items.filter((book) =>
            fieldMatches(`${book.title} ${book.description ?? ""}`, textTerm),
          );
          return {
            ...byAuthor,
            items: filtered,
            notices: [notice.build(this.id, this.displayName)],
          };
        }
        return { ...byAuthor, notices: [notice.build(this.id, this.displayName)] };
      }
    }

    if (categoryId) {
      const byCategory = await this.browseCategory(categoryId, page, perPage);
      if (textTerm) {
        const filtered = byCategory.items.filter((book) =>
          mode === "title"
            ? fieldMatches(book.title, textTerm)
            : fieldMatches(
                `${book.title} ${book.author ?? ""} ${book.description ?? ""}`,
                textTerm,
              ),
        );
        return {
          ...byCategory,
          items: filtered,
          notices: [notice.build(this.id, this.displayName)],
        };
      }
      return { ...byCategory, notices: [notice.build(this.id, this.displayName)] };
    }

    if (!textTerm) {
      notice.limit("اختر كلمة بحث أو تصنيفًا أو معرّف مؤلف.");
      return {
        items: [],
        page,
        perPage,
        total: 0,
        hasMore: false,
        notices: [notice.build(this.id, this.displayName)],
      };
    }

    // تصفية نصية محلية على أول ١٥٠ كتابًا فقط (لا endpoint نصي عند إسلام هاوس).
    const scanned: IslamicBook[] = [];
    for (let current = 1; current <= MAX_SEARCH_SCAN_PAGES; current += 1) {
      const batch = await this.fetchGlobalBooks(current, SEARCH_SCAN_PAGE_SIZE);
      scanned.push(...batch.items);
      if (batch.items.length < SEARCH_SCAN_PAGE_SIZE) break;
    }

    const filtered = uniqueById(scanned).filter((book) => {
      if (mode === "title") return fieldMatches(book.title, textTerm);
      if (mode === "author") return fieldMatches(book.author, textTerm);
      return fieldMatches(
        `${book.title} ${book.author ?? ""} ${book.description ?? ""}`,
        textTerm,
      );
    });

    const start = (page - 1) * perPage;
    return {
      items: filtered.slice(start, start + perPage),
      page,
      perPage,
      total: filtered.length,
      hasMore: start + perPage < filtered.length,
      notices: [notice.build(this.id, this.displayName)],
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