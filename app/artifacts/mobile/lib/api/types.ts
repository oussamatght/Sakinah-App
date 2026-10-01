/**
 * Shared domain types for direct provider calls (no @workspace/api-server);
 * shapes intentionally match the server's normalization so screens compile unchanged.
 */

export type QuranChapter = {
  id: number;
  nameArabic: string;
  nameEnglish: string;
  revelationPlace: string;
  versesCount: number;
};

/** Chapter → mushaf page-range (start, end) for the juz/page pickers. */
export type QuranChapterPage = {
  id: number;
  nameArabic: string;
  startPage: number;
  endPage: number;
  versesCount: number;
  revelationPlace: string;
};

export type QuranVerse = {
  id: number;
  verseNumber: number;
  verseKey: string;
  text: string;
  juz: number;
  page: number;
};

export type QuranSurah = QuranChapter & {
  verses: QuranVerse[];
};

/** A surah's extent inside one juz — computed from real ayah data. */
export type QuranJuzSurahRange = {
  surahId: number;
  nameArabic: string;
  fromAyah: number;
  toAyah: number;
  startPage: number;
};

export type QuranJuz = {
  juz: number;
  ayahCount: number;
  /** Continuous verses of the whole juz, in mushaf order. */
  verses: QuranVerse[];
  surahRanges: QuranJuzSurahRange[];
};

/**
 * صفحة مصحف حقيقية: آيات تشترك في نفس verse.page من alquran.cloud (604 صفحة)
 * — أساس العرض المتصل، وتُبنى عبر groupQuranVersesByPage() في quran.ts.
 */
export type QuranPageGroup = {
  page: number;
  verses: QuranVerse[];
};

export type QuranAudio = {
  surahId: number;
  audioUrl: string;
  reciter: string;
  format: string;
};

export type QuranTafsir = {
  surahId: number;
  ayahNumber: number;
  resourceName: string;
  text: string;
};

/**
 * hadith موحّدة (على مستوى المشروع):
 *   book        — الاسم الشرعي (كتاب أو تصنيف)، لا اسم المزوّد التقني أبدًا.
 *   reference   — التخريج الحقيقي من المصدر فقط؛ فارغ إن لم يقدّمه المصدر.
 *   grade       — كما وردت بلا تحوير، اختيارية: hadis-api-id لا يقدّمها أبدًا
 *                 فتبقى undefined وتعرض الواجهة "غير متوفرة" — لا استنتاج من الاسم.
 *   explanation — شرح المصدر، منفصل عن النص ولا يُعرض مكانه أبدًا.
 *   apiSource   — تقني للتصحيح فقط، لا يُعرض في الواجهة أبدًا.
 */
export type HadithItem = {
  id: string;
  text: string;
  book: string;
  reference: string;
  grade?: string;
  attribution?: string;
  explanation?: string;
  apiSource?: "hadeethenc.com" | "hadis-api-id";
};

export type HadithPage = {
  items: HadithItem[];
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
};

export type HadithCategoryNode = {
  id: string;
  titleAr: string;
  count: number;
  parentId: string | null;
  children: HadithCategoryNode[];
};

/** A canonical hadith book (Bukhari, Muslim, …) for the browsing UI. */
export type HadithBook = {
  slug: string;
  nameAr: string;
  nameEn: string;
  total: number;
};

export type PrayerTimesResult = {
  date: string;
  hijriDate: string;
  timezone: string;
  location: { latitude: number; longitude: number };
  timings: Record<string, string>;
};

/**
 * thrown by every fetcher — Arabic message ready to show inline.
 * `offline` يفصل انقطاع الشبكة (فشل fetch) عن خلل الخدمة (HTTP أو JSON تالف)،
 * وإلا عُرضت رسالة "لا يوجد اتصال" على أي خطأ والواي فاي شغّال.
 */
export class UpstreamError extends Error {
  readonly source: string;
  readonly offline: boolean;
  /** رمز حالة HTTP إن وُجد — يميّز «المحتوى غير متاح» (413/404) عن «المشغول» (5xx). */
  readonly status?: number;
  constructor(source: string, message?: string, offline = false, status?: number) {
    super(message ?? `تعذر تحميل البيانات من ${source}؟ تحقّق من اتصالك ثم أعد المحاولة.`);
    this.name = "UpstreamError";
    this.source = source;
    this.offline = offline;
this.status = status;
  }
}

/** أذكار الصباح والمساء — كما وردت في مصدر Seen-Arabic. */
export type Dhikr = {
  order: number;
  content: string;
  count: number;
  count_description: string;
  fadl: string;
  source: string;
  /** 0 = عام، 1 = صباح، 2 = مساء (القيم الفعلية في المصدر). */
  type: number;
  audio: string;
  hadith_text: string;
  explanation_of_hadith_vocabulary: string;
};