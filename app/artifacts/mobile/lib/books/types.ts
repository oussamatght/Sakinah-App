/**
 * النماذج الموحّدة لمكتبة الكتب الإسلامية + قدرات كل مزوّد.
 *
 * لا يُضاف أي حقل يُخترع من خارج المصدر: أي قيمة غير موجودة في استجابة
 * المزوّد تبقى undefined ولا تُستبدل بنصوص اصطناعية.
 */

export type IslamicLibrarySource = "turath" | "islamhouse";

/** قدرات الكتاب — ما يوفره المصدر فعلًا فقط، حتى لا تظهر أزرار ميتة. */
export type IslamicBookCapabilities = {
  /** قراءة داخل التطبيق/عبر المصدر. */
  canReadOnline: boolean;
  /** قراءة نصية صفحة بصفحة (تراث). */
  canReadByPage: boolean;
  /** فهرس/أبواب داخل الكتاب. */
  canGetChapters: boolean;
  /** بحث داخل الكتاب. */
  canSearchInside: boolean;
  /** ملف (PDF…) قابل للتحميل. */
  canDownload: boolean;
  /** يُسمح بتخزين محلي وفق سياسة المصدر. */
  canStoreOffline: boolean;
  /** إعادة جلب لآخر تحديث. */
  canUpdate: boolean;
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

/** قدرات البحث المتحقَّق منها حيًا (انظر توثيق BookSearchCapabilities). */
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
};

/* -------------------------------------------------------------------------- */
/* البحث المتقدم — قدرات حقيقية مُتحقَّق منها حيًا قبل البناء                */
/* -------------------------------------------------------------------------- */

/**
 * قدرات البحث **المتحقَّق منها** لكل مزوّد (لا شيء هنا مُتَوَهَّم):
 *
 * تراث (api.turath.io ver=3):
 *  - /search?q=&page=            → نص حر داخل المحتوى ✅ (q إلزامي: بدونه 400)
 *  - /search?...&cat=<id>        → فلترة تصنيف من المصدر ✅
 *  - /search?...&author=<id>     → فلترة مؤلف بالمعرّف الرقمي فقط ✅
 *  - لا يوجد: بحث بالعنوان وحده ❌ / بحث باسم المؤلف نصيًا ❌ / تعداد تصنيفات ❌
 *
 * إسلام هاوس (api3 v3):
 *  - /main/get-category-items/{id}/...  → فلترة تصنيف من المصدر ✅
 *  - /main/get-author-items/{id}/...   → فلترة مؤلف بالمعرّف ✅
 *  - لا يوجد: أي بحث نصي (/main/search = 404) ❌ ولا بحث بالعنوان ❌
 *    ولا lookup باسم المؤلف ❌ → النصي هنا تصفية محلية محدودة ومُعلَنة.
 */
export type BookSearchCapabilities = {
  /** بحث نصي على خادم المصدر. */
  canSearchText: boolean;
  /** فلترة بالتصنيف (id) على الخادم. */
  canFilterByCategory: boolean;
  /** فلترة بالمؤلف (معرّف رقمي) على الخادم. */
  canFilterByAuthorId: boolean;
  /** فلترة باسم المؤلف (نصًا) على الخادم. */
  canFilterByAuthorName: boolean;
  /** فلترة باسم الكتاب (نصًا) على الخادم. */
  canFilterByTitle: boolean;
  /** البحث النصي يتم محليًا على ما أعطاه المصدر (لا endpoint نصي). */
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

/** خطوة تنفيذ واحدة: هل جرت على الخادم أم محليًا أم غير مدعومة أصلًا. */
export type BookSearchPlanStep = {
  label: string;
  scope: "server" | "client" | "unsupported";
};

/** تقرير صريح لكل مصدر: ما الذي نُفِّذ على الخادم وما الذي تصفّى محليًا. */
export type BookSearchNotice = {
  source: IslamicLibrarySource;
  sourceName: string;
  steps: BookSearchPlanStep[];
  /** قيود حقيقية يمنعها المزوّد (تُعرض للمستخدم كما هي). */
  limits: string[];
};