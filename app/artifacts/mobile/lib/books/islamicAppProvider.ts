/**
 * مزوّد islamic.app (api.islamic.app/v1/library) — مكتبة كلاسيكية مفتوحة،
 * **بدون مفتاح API وبلا تسجيل** و CORS مفتوح (متحقّق: ACAO=*).
 *
 * كل المسارات هنا مُتحقَّق منها حيًّا (2026-09) قبل البناء:
 *   /v1/library/genres                        → 11 تصنيفًا + count لكل تصنيف ✅
 *   /v1/library/books?limit&offset            → 563 كتابًا، ترقيم بد.offset ✅
 *   /v1/library/books?genre=<slug>            → فلترة تصنيف على الخادم ✅
 *   /v1/library/books?author=<id>             → فلترة مؤلف بالمعرّف ✅ (36 لابن تيمية)
 *   /v1/library/books?school=hanbali          → فلترة مدرسة ✅
 *   /v1/library/search?q=&limit=              → بحث دلالي، يرجّع كتبًا + score ✅
 *   /v1/library/authors?limit&offset          → 332 مؤلفًا + works_count ✅
 *   /v1/library/authors/{id}                  → تفاصيل المؤلف + كتبه ✅
 *   /v1/library/books/{slug}                  → تفاصيل كاملة + sources + author ✅
 *   /v1/library/books/{slug}/chapters         → فهرس مسطّح (عناوين + start_page) ✅
 *   /v1/library/books/{slug}/text             → نص الكتاب منظّم (فصول) ✅
 *   /v1/library/books/{slug}/file?format=pdf  → PDF من R2 بدعم Range ✅
 *
 * حدود مُتحقَّق منها (لا نُخترع قدرة):
 *  - ‎`q` على ‎/books **غير مُفعَّل**: ‎?q=tafsir يُرجع total=563 (كل الكتب)،
 *    فالبحث النصي يمرّ إلزاميًا عبر ‎/library/search.
 *  - لا بحث بالعنوان وحده ولا باسم المؤلف نصًّا على ‎/books.
 *  - ‎/text يُرجع **الكتاب كاملًا** في طلب واحد (لا ‎/page صفحة-بصفحة)،
 *    فيُجلب مرّة ويُخزَّن، ثم نُشتقّ منه الفهرس والصفحات محليًّا.
 *    قياس حي على كتاب تفسير 203 صفحات: ‎190KB في ‎1.8s، 153 فصلًا، 98 منها
 *    بنصّ ⇒ مقبول للتخزين المؤقت، ولا يُعاد إلا مرة واحدة.
 *  - بعض الكتب PDF فقط (has_text=false) ⇒ لا صفحة-بصفعة، PDF فقط.
 *  - كل الردود envelop: ‎{code, status, data:{…}} — نغلّفها بـ dataOf.
 *
 * معرّفات التصنيف هنا **slugs** (aqeedah/tafsir/fiqh…) وهي فضاء مختلف عن
 * أرقام إسلام هاوس وتراث، فلا تُرسل لمصدر آخر (انظر lib/books/index.ts).
 */

import {
  fetchJsonRetry,
  fieldMatches,
  idString,
  isJsonRecord,
  num,
  safeLimit,
  safePage,
  SearchNoticeBuilder,
  str,
  uniqueById,
  type BookSearchParams,
  type CatalogueFilters,
  type IslamicBooksProvider,
} from "./providers";
import { ISLAMICAPP_CAPABILITIES, ISLAMICAPP_SEARCH_CAPABILITIES } from "./types";
import type {
  BookSearchFilters,
  IslamicBook,
  IslamicBookAuthor,
  IslamicBookCategory,
  IslamicBookChapter,
  IslamicBookDetails,
  IslamicBookPage,
  IslamicBookSearchResult,
} from "./types";

const LIB_API = "https://api.islamic.app/v1/library";

const SOURCE_NAME = "إسلاميك";
const SOURCE = "islamicapp" as const;

/**
 * ذاكرة في-العملية لنص الكتاب: ‎/text يُرجع الكتاب كاملًا في طلب واحد
 * (لا ‎/page عند islamic.app)، والقارئ يطلب صفحة-بصفحة. بدون هذه الذاكرة
 * سيجلب القارئ 190KB كاملة لكل صفحة (.Network overhead هائل). الذاكرة
 * تُصفَّر تلقائيًا عند خروج التطبيق، ويُحفظ النص أيضًا في كاش React Query
 * (useLibraryBookText عبر staleTime طويل).
 */
type BookTextSection = {
  title: string;
  level: number;
  page: number;
  text: string;
  vol?: string;
};

type BookTextBundle = {
  sections: BookTextSection[];
  pageCount: number;
  /** الصفحة الأولى التي فيها نص فعلي (لتفادي صفحة بيضاء في البداية). */
  firstTextPage: number;
};

const textCache = new Map<string, Promise<BookTextBundle>>();

/**
 * يبني «خريطة صفحات» من فصول الكتاب: كل فصل يغطي [page, nextPage-1].
 * أرقام الصفحات في islamic.app **متفرّقة** (فهرس 153 فصلًا في كتاب 203 صفحات)،
 * فالصفحة المطلوبة قد تقع داخل فصل لا أن تبدأه — نبحث عن الفصل الحاوي لا
 * عن الفصل الذي page يساويه بالضبط، وإلا لظهرت صفحات فارغة.
 */
function sectionForPage(
  sections: BookTextSection[],
  page: number,
): BookTextSection | undefined {
  let best: BookTextSection | undefined;
  for (const section of sections) {
    if (section.page <= page) {
      if (!best || section.page > best.page) best = section;
    }
  }
  if (best) return best;
  // الصفحة قبل أول فصل نصّي: نرجع أول قسم فيه نص بدل شاشة فارغة.
  return sections.find((section) => section.text.trim().length > 0);
}

async function fetchBookText(slug: string): Promise<BookTextBundle> {
  const cached = textCache.get(slug);
  if (cached) return cached;

  const request = (async (): Promise<BookTextBundle> => {
    const payload = dataOf(
      await fetchJsonRetry(
        `${LIB_API}/books/${encodeURIComponent(slug)}/text`,
        SOURCE_NAME,
      ),
    );
    if (!isJsonRecord(payload)) return { sections: [], pageCount: 0, firstTextPage: 1 };

    const rows = arrayOf(payload, "chapters").filter(isJsonRecord);
    const sections: BookTextSection[] = [];
    rows.forEach((row, index) => {
      const text = str(row.text);
      if (!text) return;
      sections.push({
        title: localizedText(row, "title") || `القسم ${index + 1}`,
        level: num(row.level) ?? 0,
        page: num(row.page) ?? sections.length + 1,
        text,
        vol: str(row.vol),
      });
    });
    sections.sort((a, b) => a.page - b.page);

    const pageCount = num(payload.pageCount) ?? sections.length;
    const firstTextPage = sections[0]?.page ?? 1;
    return { sections, pageCount, firstTextPage };
  })();

  textCache.set(slug, request);
  try {
    return await request;
  } catch (error) {
    // لا نُبقي طلبًا فاشلًا في الذاكرة وإلا تعطّل الكتاب للأبد.
    textCache.delete(slug);
    throw error;
  }
}

/** تصنيفات الـ API إن لم يصل القائمة (fallback مضمون مُتحقَّق منه). */
const KNOWN_GENRES: Array<{ slug: string; label: string; count: number }> = [
  { slug: "tafsir", label: "تفسير", count: 88 },
  { slug: "aqeedah", label: "عقيدة", count: 105 },
  { slug: "fiqh", label: "فقه", count: 111 },
  { slug: "usul-fiqh", label: "أصول الفقه", count: 41 },
  { slug: "tasawwuf", label: "تصوف وأخلاق", count: 46 },
  { slug: "seerah", label: "سيرة", count: 28 },
  { slug: "tarikh", label: "تاريخ", count: 82 },
  { slug: "lughah", label: "لغة", count: 43 },
  { slug: "mantiq", label: "منطق", count: 2 },
  { slug: "firaq", label: "فرق", count: 2 },
  { slug: "general", label: "عام", count: 14 },
];

/** يغلّف استجابة {code,status,data} ويعيد الحمولة الداخلية. */
function dataOf(json: unknown): unknown {
  if (!isJsonRecord(json)) return json;
  if ("data" in json) return json.data;
  return json;
}

function arrayOf(payload: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isJsonRecord(payload)) return [];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key] as unknown[];
  }
  return [];
}

/** slug → تسمية عربية (للعرض فقط؛ النطاق من /genres لا يُختلق). */
function genreLabel(slug: string): string {
  const known = KNOWN_GENRES.find((genre) => genre.slug === slug);
  return known?.label ?? slug;
}

function isSupportedGenre(slug: string | undefined): boolean {
  return Boolean(slug && KNOWN_GENRES.some((genre) => genre.slug === slug));
}

/** نص مُجمّع من i18n أو الحقول المباشرة. */
function localizedText(raw: Record<string, unknown>, prefix: "title" | "description" | "name" | "bio"): string | undefined {
  const direct = str(raw[`${prefix}_ar`]);
  if (direct) return direct;
  const i18n = raw[`${prefix}_i18n`];
  if (isJsonRecord(i18n)) {
    return str(i18n.ar) ?? str(i18n.en);
  }
  return str(raw[`${prefix}_en`]);
}

type RawBook = Record<string, unknown>;

function normalizeBook(raw: RawBook): IslamicBook | null {
  const slug = str(raw.slug);
  if (!slug) return null;
  const authorId = str(raw.author_id);
  const genre = str(raw.genre);
  const pages = num(raw.pages);
  const hasPdf = raw.has_pdf === true;
  return {
    id: `${SOURCE}:${slug}`,
    source: SOURCE,
    rawId: slug,
    title: localizedText(raw, "title") ?? slug,
    author:
      str(raw.author_name_ar) ??
      (isJsonRecord(raw.author) ? str(raw.author.name_ar) : undefined),
    authorId,
    description: localizedText(raw, "description"),
    sourceCategoryId: genre,
    sourceUrl: `https://islamic.app/library/${slug}`,
    // المسار الوحيد المُتحقَّق عليه للملفات (لا يوجد حقل pdf_url في الرد).
    downloadUrl: hasPdf
      ? `${LIB_API}/books/${encodeURIComponent(slug)}/file?format=pdf`
      : undefined,
    pages,
    // has_text لكل كتاب:_pdf فقط ⇒ لا زر «ابدأ القراءة» (بلا نص للعرض).
    hasText: raw.has_text === true,
    infoLong: str(raw.subgenre) ?? str(raw.school),
  };
}

const asBooks = (rows: unknown[]): IslamicBook[] =>
  uniqueById(
    rows
      .filter(isJsonRecord)
      .map((row) => normalizeBook(row))
      .filter((book): book is IslamicBook => book !== null),
  );

export class IslamicAppBooksProvider implements IslamicBooksProvider {
  readonly id = SOURCE;
  readonly displayName = SOURCE_NAME;
  readonly capabilities = ISLAMICAPP_CAPABILITIES;
  readonly searchCapabilities = ISLAMICAPP_SEARCH_CAPABILITIES;

  private genresPromise?: Promise<IslamicBookCategory[]>;

  /** التصنيفات = الأنواع (genres) من الخادم مع عدد الكتب الحقيقي. */
  private async loadGenres(): Promise<IslamicBookCategory[]> {
    if (!this.genresPromise) {
      this.genresPromise = (async () => {
        try {
          const payload = dataOf(
            await fetchJsonRetry(`${LIB_API}/genres`, SOURCE_NAME),
          );
          const rows = arrayOf(payload, "genres");
          if (rows.length === 0) throw new Error("empty genres");
          return rows.filter(isJsonRecord).map((row) => {
            const slug = str(row.slug) ?? "";
            return {
              id: slug,
              source: SOURCE,
              title: genreLabel(slug) || str(row.labelEn) || slug,
              description: str(row.descriptionEn),
              itemsCount: num(row.count),
            } as IslamicBookCategory & { itemsCount?: number };
          });
        } catch {
          return KNOWN_GENRES.map((genre) => ({
            id: genre.slug,
            source: SOURCE,
            title: genre.label,
            description: undefined,
          }));
        }
      })();
    }
    return this.genresPromise;
  }

  getCategories(): Promise<IslamicBookCategory[]> {
    return this.loadGenres();
  }

  /** الأنواع هي نفسها الفروع: مستوى واحد بلا أبناء. */
  async getCategoryBranches(): Promise<IslamicBookCategory[]> {
    return this.loadGenres();
  }

  /** بلا تدرّج: الأنواع 11 ولا يوجد أبناء. */
  async getCategoryChildren(): Promise<IslamicBookCategory[]> {
    return [];
  }

  private async listBooks(
    params: {
      genre?: string;
      author?: string;
      school?: string;
      page: number;
      perPage: number;
    },
  ): Promise<IslamicBookSearchResult> {
    const { page, perPage } = params;
    const search = new URLSearchParams({
      limit: String(perPage),
      offset: String((page - 1) * perPage),
    });
    if (params.genre) search.set("genre", params.genre);
    if (params.author) search.set("author", params.author);
    if (params.school) search.set("school", params.school);

    const payload = dataOf(
      await fetchJsonRetry(`${LIB_API}/books?${search.toString()}`, SOURCE_NAME),
    );
    const items = asBooks(arrayOf(payload, "books"));
    const total = isJsonRecord(payload) ? num(payload.total) : undefined;
    return {
      items,
      page,
      perPage,
      total: total ?? items.length,
      hasMore:
        total !== undefined ? (page - 1) * perPage + items.length < total : false,
    };
  }

  async getBooks(filters?: CatalogueFilters): Promise<IslamicBookSearchResult> {
    const page = safePage(filters?.page);
    const perPage = safeLimit(filters?.perPage);
    // التصنيف هنا slug من فضاء islamic.app فقط.
    const genre = isSupportedGenre(filters?.categoryId) ? filters?.categoryId : undefined;
    return this.listBooks({ genre, page, perPage });
  }

  /**
   * البحث النصي يمرّ إلزاميًا عبر /library/search (q على /books معطّل)،
   * ثم نُطبّق المؤلف/المصدر محليًا على النتائج لأن /search لا يقبلهما.
   */
  async searchBooks(
    query: string,
    params?: BookSearchParams,
  ): Promise<IslamicBookSearchResult> {
    const term = str(query);
    const page = safePage(params?.page);
    const perPage = safeLimit(params?.perPage);
    if (!term) return { items: [], page, perPage, total: 0, hasMore: false };

    // /search محدود ~10 طلبات/دقيقة → نطلب صفحة واحدة ونُصفّي محليًا.
    const search = new URLSearchParams({ q: term, limit: "50" });
    const payload = dataOf(
      await fetchJsonRetry(`${LIB_API}/search?${search.toString()}`, SOURCE_NAME),
    );
    let items = asBooks(arrayOf(payload, "books"));
    if (items.length === 0) items = asBooks(arrayOf(payload, "results"));

    const start = (page - 1) * perPage;
    const slice = items.slice(start, start + perPage);
    return {
      items: slice,
      page,
      perPage,
      total: items.length,
      hasMore: start + slice.length < items.length,
    };
  }

  async searchWithFilters(
    filters: BookSearchFilters & { page?: number; perPage?: number },
  ): Promise<IslamicBookSearchResult> {
    const page = safePage(filters.page);
    const perPage = safeLimit(filters.perPage);
    const mode = filters.mode ?? "free";
    const term = str(filters.query);
    const author = str(filters.author);
    const genre = isSupportedGenre(filters.categoryId)
      ? filters.categoryId
      : undefined;
    const notice = new SearchNoticeBuilder(this.searchCapabilities);

    // كل ما هو مدعوم على الخادم يُنفَّذ هناك، وما عداه يُعلن للمستخدم.
    if (author) {
      notice.unsupported(
        "المؤلف",
        "البحث النصي في islamic.app دلالي على الخادم ولا يقبل اسم مؤلف نصًّا.",
      );
    }
    if (mode === "title") {
      notice.unsupported(
        "العنوان",
        "لا يوجد فلترة بالعنوان وحده؛ البحث دلالي على العناوين والفصول.",
      );
    }

    // 1) النص → بحث دلالي على الخادم.
    if (term) {
      const search = new URLSearchParams({ q: term, limit: "50" });
      const payload = dataOf(
        await fetchJsonRetry(`${LIB_API}/search?${search.toString()}`, SOURCE_NAME),
      );
      let hits = asBooks(arrayOf(payload, "books"));
      if (hits.length === 0) hits = asBooks(arrayOf(payload, "results"));
      notice.server(`بحث دلالي: «${term}»`);

      // تصفية محلية معلَنة للفلاتر التي لا يقبلها /search.
      let items = hits;
      if (author) {
        const before = items.length;
        items = items.filter(
          (book) =>
            fieldMatches(book.author, author) ||
            fieldMatches(book.authorId, author),
        );
        if (items.length !== before) {
          notice.client(`تصفية محلية بالمؤلف: «${author}»`);
        }
      }
      if (genre) {
        const before = items.length;
        items = items.filter((book) => book.sourceCategoryId === genre);
        if (items.length !== before) {
          notice.client(`تصفية محلية بالتصنيف: «${genreLabel(genre)}»`);
        }
      }
      const start = (page - 1) * perPage;
      const slice = items.slice(start, start + perPage);
      return {
        items: slice,
        page,
        perPage,
        total: items.length,
        hasMore: start + slice.length < items.length,
        notices: [notice.build(SOURCE, SOURCE_NAME)],
      };
    }

    // 2) بلا نص: فلترة تصنيف/مؤلف على الخادم (books يدعمGenre وauthor).
    if (genre || author) {
      const result = await this.listBooks({
        genre,
        author,
        page,
        perPage,
      });
      if (genre) notice.server(`تصنيف: ${genreLabel(genre)}`);
      if (author) notice.server(`مؤلف: ${author}`);
      return { ...result, notices: [notice.build(SOURCE, SOURCE_NAME)] };
    }

    // 3) تصفّح عادي بلا فلاتر.
    const result = await this.listBooks({ page, perPage });
    return { ...result, notices: [notice.build(SOURCE, SOURCE_NAME)] };
  }

  async getBooksByAuthor(
    authorId: string,
    page?: number,
    perPage?: number,
  ): Promise<IslamicBookSearchResult | undefined> {
    const clean = idString(authorId);
    if (!clean) return undefined;
    const result = await this.listBooks({
      author: clean,
      page: safePage(page),
      perPage: safeLimit(perPage),
    });
    return result.items.length > 0 ? result : undefined;
  }

  async getBook(rawId: string): Promise<IslamicBook | undefined> {
    const details = await this.getBookDetails(rawId);
    return details?.book;
  }

  async getBookDetails(rawId: string): Promise<IslamicBookDetails | undefined> {
    const slug = str(rawId);
    if (!slug) return undefined;
    const payload = dataOf(
      await fetchJsonRetry(
        `${LIB_API}/books/${encodeURIComponent(slug)}`,
        SOURCE_NAME,
      ),
    );
    if (!isJsonRecord(payload)) return undefined;
    const raw = isJsonRecord(payload.book) ? payload.book : payload;
    const book = normalizeBook(raw);
    if (!book) return undefined;

    // روابط المصادر كما وردت (المصدر يشترط ذكر المصدر في كل واجهة).
    const sources = Array.isArray(payload.sources)
      ? payload.sources.filter(isJsonRecord)
      : [];
    for (const entry of sources) {
      const url = str(entry.source_url);
      if (url && !book.sourceUrl) book.sourceUrl = url;
    }

    // الفهرس من نفس حزمة النص: أرقام الصفحات هنا هي نفسها التي يعرضها
    // القارئ، فالنقر على عنوان في الفهرس ينتقل للصفحة الصحيحة بالضبط.
    let chapters: IslamicBookChapter[] | undefined;
    if (raw.has_text === true) {
      try {
        const bundle = await fetchBookText(slug);
        chapters = bundle.sections.map((section, index) => ({
          id: `${slug}:${index}:${section.page}`,
          title: section.title,
          page: section.page,
          level: section.level,
        }));
        book.pages = bundle.pageCount || book.pages;
      } catch {
        chapters = undefined;
      }
    }

    return { book, chapters };
  }

  async getBookChapters(rawId: string): Promise<IslamicBookChapter[] | undefined> {
    const slug = str(rawId);
    if (!slug) return undefined;
    try {
      // ‎/text يحمل العنوان والصفحة والنص معًا ⇒ فهرس متوافق تمامًا مع
      // صفحة القراءة. ‎/chapters (فهرس مسطّح بلا نص) احتياط عند فشل ‎/text.
      const bundle = await fetchBookText(slug);
      if (bundle.sections.length > 0) {
        return bundle.sections.map((section, index) => ({
          id: `${slug}:${index}:${section.page}`,
          title: section.title,
          page: section.page,
          level: section.level,
        }));
      }

      const payload = dataOf(
        await fetchJsonRetry(
          `${LIB_API}/books/${encodeURIComponent(slug)}/chapters`,
          SOURCE_NAME,
        ),
      );
      const rows = arrayOf(payload, "chapters").filter(isJsonRecord);
      if (rows.length === 0) return undefined;
      const chapters: IslamicBookChapter[] = [];
      rows.forEach((row, index) => {
        const title = localizedText(row, "title");
        if (!title) return;
        chapters.push({
          id: str(row.id) ?? `${slug}:${index}`,
          title,
          page: num(row.start_page) ?? 1,
          level: isJsonRecord(row.parent_chapter_id) || row.parent_chapter_id ? 1 : 0,
        });
      });
      return chapters.length > 0 ? chapters : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * صفحة-بصفحة مُشتقّة من نص الكتاب المُخزَّن (لا يوجد ‎/page عند المصدر).
   * الصفحة المطلوبة قد تقع داخل فصل ⇒ نختار الفصل الحاوي، ويُعاد عنوانه
   * كـ heading ليبقى المستخدم يعرف أين هو.
   */
  async getBookPage(
    rawId: string,
    pageNumber: number,
  ): Promise<IslamicBookPage | undefined> {
    const slug = str(rawId);
    if (!slug) return undefined;
    const page = safePage(pageNumber);
    if (page < 1) return undefined;

    const bundle = await fetchBookText(slug);
    if (bundle.sections.length === 0) return undefined;
    if (page > bundle.pageCount) return undefined;

    const section = sectionForPage(bundle.sections, page);
    if (!section) return undefined;

    return {
      bookId: `${SOURCE}:${slug}`,
      source: SOURCE,
      page,
      vol: section.vol,
      text: section.text,
      heading: section.title,
    };
  }

  async getAuthor(id: string): Promise<IslamicBookAuthor | undefined> {
    const authorId = idString(id);
    if (!authorId) return undefined;
    const payload = dataOf(
      await fetchJsonRetry(
        `${LIB_API}/authors/${encodeURIComponent(authorId)}`,
        SOURCE_NAME,
      ),
    );
    if (!isJsonRecord(payload)) return undefined;
    const author = isJsonRecord(payload.author) ? payload.author : payload;
    const name = localizedText(author, "name");
    if (!name) return undefined;
    return {
      id: authorId,
      source: SOURCE,
      name,
      biography: localizedText(author, "bio"),
      itemsCount: num(author.works_count),
      itemsUrl: `https://islamic.app/library?author=${encodeURIComponent(authorId)}`,
    };
  }

  /** البحث داخل كتاب غير مدعوم (لا endpoint) ⇒ undefined بلا اختلاق. */
  async searchInsideBook(): Promise<IslamicBookSearchResult | undefined> {
    return undefined;
  }
}
