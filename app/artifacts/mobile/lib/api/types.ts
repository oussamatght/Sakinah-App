/**
 * Shared domain types for direct provider calls.
 *
 * The mobile app no longer talks to @workspace/api-server; screens consume
 * these shapes directly. They intentionally match the shapes the server used
 * to normalize to, so screens compile unchanged.
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
 * Unified hadith shape (project-wide):
 *   book        — الشرعي: اسم الكتاب ("صحيح البخاري")، أو اسم التصنيف/الموسوعة
 *                 للمصادر الموضوعية. Never the technical API provider name.
 *   reference   — التخريج الحقيقي من المصدر فقط؛ يبقى فارغًا إن لم يقدمه
 *                 المصدر (المعرّف الداخلي ليس مرجعًا علميًا).
 *   grade       — الدرجة كما وردت من المصدر بلا تحوير. اختيارية إجباريًا:
 *                 مصدر الكتب (hadis-api-id) لا يقدمها إطلاقًا، فتبقى undefined
 *                 والواجهة تعرض "درجة الحديث غير متوفرة" — لا استنتاج من اسم الكتاب.
 *   attribution — الراوي/من رواه، إن توفر.
 *   explanation — شرح المصدر، منفصل عن نص الحديث ولا يُعرض مكانه أبدًا.
 *   apiSource   — تقني للتصحيح فقط ("hadeethenc.com" | "hadis-api-id")؛
 *                 لا تُعرض في الواجهة أبدًا.
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

/** Thrown by every fetcher — message is Arabic, ready to show inline. */
export class UpstreamError extends Error {
  readonly source: string;
  constructor(source: string, message?: string) {
    super(message ?? `تعذر الوصول إلى ${source}، تحقق من اتصالك وحاول مجددًا.`);
    this.name = "UpstreamError";
    this.source = source;
  }
}
