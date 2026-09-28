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