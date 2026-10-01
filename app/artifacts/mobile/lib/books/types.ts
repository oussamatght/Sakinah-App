/**
 * النماذج الموحّدة لمكتبة الكتب الإسلامية + قدرات كل مزوّد: لا يُضاف أي حقل
 * مخترَع من خارج المصدر، وأي قيمة غير موجودة في استجابة المزوّد تبقى undefined.
 */

export type IslamicLibrarySource = "turath" | "islamhouse" | "islamicapp";

/** قدرات الكتاب — ما يوفره المصدر فعلًا فقط، حتى لا تظهر أزرار ميتة. */
export type IslamicBookCapabilities = {
  canReadOnline: boolean;
  canReadByPage: boolean;
  canGetChapters: boolean;
  canSearchInside: boolean;
  canDownload: boolean;
  canStoreOffline: boolean;
  canUpdate: boolean;
  /** وحدة التنقّل هي **الفصل** لا الصفحة عند islamic.app (‎/text فصول بأرقام
   *  صفحات متفرّقة) فلا يُعرض نفس النص على صفحات متجاورة. */
  readsByChapter?: boolean;
};

export const TURATH_CAPABILITIES: IslamicBookCapabilities = {
  canReadOnline: true,
  canReadByPage: true,
  canGetChapters: true,
  canSearchInside: true,
  canDownload: false,
  canStoreOffline: false,
  canUpdate: true,
};

export const ISLAMHOUSE_CAPABILITIES: IslamicBookCapabilities = {
  canReadOnline: false,
  canReadByPage: false,
  canGetChapters: false,
  canSearchInside: false,
  canDownload: true,
  canStoreOffline: true,
  canUpdate: true,
};

export const TURATH_SEARCH_CAPABILITIES: BookSearchCapabilities = {
  canSearchText: true,
  canFilterByCategory: true,
  canFilterByAuthorId: true,
  canFilterByAuthorName: false,
  canFilterByTitle: false,
  textSearchIsLocal: false,
  requiresTextTerm: true,
};

export const ISLAMHOUSE_SEARCH_CAPABILITIES: BookSearchCapabilities = {
  canSearchText: false,
  canFilterByCategory: true,
  canFilterByAuthorId: true,
  canFilterByAuthorName: false,
  canFilterByTitle: false,
  textSearchIsLocal: true,
  requiresTextTerm: false,
};

/**
 * islamic.app (api.islamic.app/v1/library) — تحقّق حيّ 2026-09:
 *  - /genres (11 تصنيفًا + count) ✅ · /books?genre=&author=&school= فلترة وترقيم ✅
 *  - /search?q= دلالي ✅ · /authors (332 + كتبهم) ✅ · /books/{slug}/chapters|text|file ✅
 *  - ‎q على ‎/books وحده غير مُفعَّل (total يبقى 563) ❌
 */
export const ISLAMICAPP_CAPABILITIES: IslamicBookCapabilities = {
  canReadOnline: true,
  // ‎/text موجود (153 فصلًا بنصّ في كتاب 203 صفحات) والصفحات تُشتقّ منه محليًّا؛ لكن
  // has_text لكل كتاب على حدة ⇒ بعض الكتب PDF فقط فتُخفى القراءة حسب book.hasText.
  canReadByPage: true,
  canGetChapters: true,
  canSearchInside: false,
  canDownload: true,
  canStoreOffline: true,
  canUpdate: true,
  readsByChapter: true,
};

export const ISLAMICAPP_SEARCH_CAPABILITIES: BookSearchCapabilities = {
  canSearchText: true,
  canFilterByCategory: true,
  canFilterByAuthorId: true,
  canFilterByAuthorName: false,
  canFilterByTitle: false,
  textSearchIsLocal: false,
  requiresTextTerm: false,
};

export type IslamicBookCategory = {
  id: string;
  source: IslamicLibrarySource;
  title: string;
  description?: string;
  parentId?: string | null;
  /** مسار تصفح المصدر الذاتي-الوصف (إسلام هاوس فقط). */
  itemsUrl?: string;
};

export type IslamicBookAuthor = {
  id: string;
  source: IslamicLibrarySource;
  name: string;
  kind?: string;
  biography?: string;
  itemsCount?: number;
  itemsUrl?: string;
};

export type IslamicBookAttachment = {
  title?: string;
  url: string;
  size?: string;
  type?: string;
};

/**
 * القراءة داخل التطبيق — ثلاثة أحكام: readable = مصدره يوفّر نصًّا صفحة-بصفحة
 * وتحقّقنا من مساره (تراث)؛ pdf-only = لا نصّ إطلاقًا (المصدر يعلن has_text=false
 * أو لا يملك نقطة نهاية نصّ أصلًا كإسلام هاوس)؛ unverified = المصدر يعلن نصًّا
 * ولا سبيل لتأكيده (islamic.app: ٥٥ كتابًا من ٥٦٣ يُرجع ‎413 payload_oversize
 * على ‎/text)، ولا نَعِد بالقراءة إلا في الأول.
 */
export type BookReadability = "readable" | "pdf-only" | "unverified";

export type IslamicBook = {
  id: string;
  source: IslamicLibrarySource;
  rawId: string;
  title: string;
  author?: string;
  authorId?: string;
  description?: string;
  /** معرف التصنيف كما ورد في المصدر (لا يُعرض كاسم مختلق). */
  sourceCategoryId?: string;
  sourceUrl?: string;
  coverUrl?: string;
  downloadUrl?: string;
  attachments?: IslamicBookAttachment[];
  itemType?: string;
  language?: string;
  pages?: number;
  infoLong?: string;
  /** has_text الخام من المصدر — إشارة ضعيفة: لا تعني إمكانية القراءة. */
  hasText?: boolean;
  readability?: BookReadability;
  /** صفحة داخل الكتاب (نتائج البحث الداخلي تراث). */
  sourcePage?: number;
};

export type IslamicBookChapter = {
  id: string;
  title: string;
  page: number;
  level?: number;
};

export type IslamicBookPage = {
  bookId: string;
  source: IslamicLibrarySource;
  page: number;
  vol?: string;
  text: string;
  heading?: string;
};

export type IslamicBookDetails = {
  book: IslamicBook;
  chapters?: IslamicBookChapter[];
};

export type IslamicBookSearchResult = {
  items: IslamicBook[];
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
  /** تقرير صريح: ماذا جرى على خادم المصدر وماذا تصفّى محليًا. */
  notices?: BookSearchNotice[];
};


/**
 * قدرات البحث **المتحقَّق منها** لكل مزوّد (لا شيء هنا مُتَوَهَّم):
 * تراث (api.turath.io ver=3): ‎/search?q=&page= نص حر داخل المحتوى ✅ (q إلزامي
 * بدونه 400)، وcat=<id> وauthor=<id> بأرقام فقط ✅؛ لا بحث بالعنوان ❌ ولا
 * باسم المؤلف نصًّا ❌ ولا تعداد تصنيفات ❌.
 * إسلام هاوس (api3 v3): get-category-items وget-author-items فلترة على الخادم ✅؛
 * لا بحث نصي (/main/search = 404) ❌ ولا بالعنوان ❌ ولا lookup باسم المؤلف ❌
 * ⇒ النصي هنا تصفية محلية محدودة ومُعلَنة.
 */
export type BookSearchCapabilities = {
  canSearchText: boolean;
  canFilterByCategory: boolean;
  canFilterByAuthorId: boolean;
  canFilterByAuthorName: boolean;
  canFilterByTitle: boolean;
  textSearchIsLocal: boolean;
  /** المصدر يرفض أي استعلام بلا كلمة نصية (تراث: q إلزامي). */
  requiresTextTerm: boolean;
};

export type BookSearchMode = "free" | "title" | "author" | "category";

export type BookSearchSource = "all" | IslamicLibrarySource;

/** نموذج البحث الموحّد — مُهيكل على قدرات المصدرين لا على نقاط مخترَعة. */
export type BookSearchFilters = {
  mode?: BookSearchMode;
  query?: string;
  author?: string;
  categoryId?: string;
  source?: BookSearchSource;
};

/** خطوة تنفيذ واحدة: نطاقها الخادم أم محلي أم غير مدعومة أصلًا. */
export type BookSearchPlanStep = {
  label: string;
  scope: "server" | "client" | "unsupported";
};

export type BookSearchNotice = {
  source: IslamicLibrarySource;
  sourceName: string;
  steps: BookSearchPlanStep[];
  /** قيود حقيقية يمنعها المزوّد (تُعرض للمستخدم كما هي). */
  limits: string[];
};