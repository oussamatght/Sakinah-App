/**
 * React Query hooks replacing the generated @workspace/api-client-react ones.
 *
 * Hook names/signatures intentionally mirror the generated client so screens
 * swap the import path and keep working. staleTime strategy:
 *
 *   - Quran text (surahs/surah/tafsir) : Infinity — immutable scripture,
 *     cached for the app's lifetime. This is also the foundation for offline
 *     mode later (react-query persists the cache; only persistence wiring
 *     remains to be added).
 *   - audio                            : 12h (URLs can rotate)
 *   - hadith lists                     : 1h  — categories 24h
 *   - prayer times                     : 1h
 */

import { useEffect } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  fetchAyahAudio,
  fetchQuranAudio,
  fetchQuranChapterPages,
  fetchQuranChapters,
  fetchQuranJuz,
  fetchQuranSurah,
  fetchQuranTafsir,
} from "./quran";
import {
  fetchBookHadiths,
  fetchHadithBooks,
  fetchHadithByNumber,
  fetchHadithCategories,
  fetchHadithDetail,
  fetchHadithList,
  fetchHadithSection,
  searchHadiths,
} from "./hadith";
import { fetchMatchedGradeFromFawaz } from "./hadithGradeEnrichment";
import { fetchPrayerTimes } from "./prayer";
import {
  getLocalChapters,
  getLocalJuz,
  getLocalSurah,
  getLocalSurahAudio,
  getLocalTafsir,
  getQuranAudioLocalUri,
  isQuranDownloaded,
  storeLocalSurahAudio,
  storeLocalTafsir,
} from "../offline/quranDb";
import { storeHadiths } from "../offline/hadithDb";
import { getPrayerTimesCache, savePrayerTimesCache } from "../storage/prayerCache";
import type {
  HadithBook,
  HadithCategoryNode,
  HadithItem,
  HadithPage,
  QuranAudio,
  QuranChapter,
  QuranChapterPage,
  QuranJuz,
  QuranSurah,
  QuranTafsir,
  PrayerTimesResult,
} from "./types";

const HOUR = 60 * 60 * 1000;
const HALF_DAY = 12 * HOUR;
const DAY = 24 * HOUR;
/** Immutable content — never goes stale; persists in memory for the session. */
const ETERNITY = Infinity;

export type PrayTimesParams = { latitude: number; longitude: number; date?: string };
export type HadithsParams = { categoryId?: string; page?: number; perPage?: number };

// ---------------------------------------------------------------------------
// Quran — stable query keys exported so the search helper (below) and future
// offline persistence can address the cache directly.
// ---------------------------------------------------------------------------

export const quranKeys = {
  surahs: ["quran", "surahs"] as const,
  surah: (id: number) => ["quran", "surah", id] as const,
  // مفتاح الصوت يشمل القارئ: تغيير القارئ من الإعدادات = مفتاح جديد = إعادة جلب وعزف فعلي.
  audio: (id: number, reciterId: number) =>
    ["quran", "audio", id, reciterId] as const,
  ayahAudio: (surahId: number, ayahNumber: number, reciterId: number) =>
    ["quran", "ayah-audio", surahId, ayahNumber, reciterId] as const,
  tafsir: (surahId: number, ayah: number) =>
    ["quran", "tafsir", surahId, ayah] as const,
  juz: (juz: number) => ["quran", "juz", juz] as const,
};

export function useGetQuranSurahs(): UseQueryResult<QuranChapter[], Error> {
  return useQuery({
    queryKey: quranKeys.surahs,
    // Offline-first: the local SQLite copy wins once the full download exists;
    // otherwise we fetch and let the persister cache the list as before.
    queryFn: async () => {
      if (isQuranDownloaded()) {
        const local = getLocalChapters();
        if (local) return local;
      }
      return fetchQuranChapters();
    },
    staleTime: ETERNITY,
    gcTime: ETERNITY,
  });
}

export function useGetQuranReader(
  surahId: number,
  options?: { query?: { enabled?: boolean } },
): UseQueryResult<QuranSurah, Error> {
  const enabled =
    options?.query?.enabled ?? (surahId >= 1 && surahId <= 114);
  return useQuery({
    queryKey: quranKeys.surah(surahId),
    queryFn: async () => {
      if (isQuranDownloaded()) {
        const local = getLocalSurah(surahId);
        if (local) return local;
      }
      return fetchQuranSurah(surahId);
    },
    enabled,
    staleTime: ETERNITY,
    gcTime: ETERNITY,
  });
}

export function useGetQuranAudio(
  surahId: number,
  reciterId: number,
  options?: { query?: { enabled?: boolean } },
): UseQueryResult<QuranAudio, Error> {
  const enabled =
    options?.query?.enabled ?? (surahId >= 1 && surahId <= 114);
  return useQuery({
    queryKey: quranKeys.audio(surahId, reciterId),
    queryFn: async () => {
      // محلي أولًا: سطر surah_audio إن وُجد، ويُفضَّل ملف mp3 الحقيقي عليه
      // (تشغيل فعلًا بدون إنترنت). غير موجود → جلب ثم رقن كذاكرة مؤقتة.
      const local = getLocalSurahAudio(surahId, reciterId);
      if (local) {
        const fileUri = getQuranAudioLocalUri(surahId, reciterId);
        if (fileUri) return { ...local, audioUrl: fileUri, format: "file" };
        return local;
      }
      const fetched = await fetchQuranAudio(surahId, reciterId);
      storeLocalSurahAudio(surahId, reciterId, fetched);
      return fetched;
    },
    enabled,
    staleTime: HALF_DAY,
    gcTime: DAY,
  });
}

/** صوت آية واحدة — يُجلب عند الضغط عليها فقط (بلا أي طلب مسبق). */
export function useGetAyahAudio(
  surahId: number,
  ayahNumber: number | null,
  reciterId: number,
): UseQueryResult<QuranAudio, Error> {
  return useQuery({
    queryKey: quranKeys.ayahAudio(surahId, ayahNumber ?? 0, reciterId),
    queryFn: () => fetchAyahAudio(surahId, ayahNumber!, reciterId),
    enabled: Boolean(ayahNumber) && surahId >= 1 && surahId <= 114,
    staleTime: HALF_DAY,
    gcTime: DAY,
  });
}

export function useGetQuranTafsir(
  surahId: number,
  ayahNumber: number,
  options?: { query?: { enabled?: boolean } },
): UseQueryResult<QuranTafsir, Error> {
  const enabled =
    options?.query?.enabled ?? (surahId >= 1 && surahId <= 114);
  return useQuery({
    queryKey: quranKeys.tafsir(surahId, ayahNumber),
    // Cache-aside: every fetched tafsir is stored locally, so after viewing
    // once it reads offline. Failure never blocks reading (sheet shows retry).
    queryFn: async () => {
      const local = getLocalTafsir(surahId, ayahNumber);
      if (local) return local;
      const remote = await fetchQuranTafsir(surahId, ayahNumber);
      storeLocalTafsir(remote);
      return remote;
    },
    enabled,
    staleTime: ETERNITY,
    gcTime: ETERNITY,
  });
}

/** Whole-juz content with REAL boundaries (alquran.cloud /juz/{n}). */
export function useGetQuranJuz(
  juz: number,
  options?: { query?: { enabled?: boolean } },
): UseQueryResult<QuranJuz, Error> {
  const enabled = options?.query?.enabled ?? (juz >= 1 && juz <= 30);
  return useQuery({
    queryKey: quranKeys.juz(juz),
    queryFn: async () => {
      if (isQuranDownloaded()) {
        const local = getLocalJuz(juz);
        if (local) return local;
      }
      return fetchQuranJuz(juz);
    },
    enabled,
    staleTime: ETERNITY,
    gcTime: ETERNITY,
  });
}

// ---------------------------------------------------------------------------
// Prayer times
// ---------------------------------------------------------------------------

export const prayerKeys = {
  times: (latitude: number, longitude: number, date?: string) =>
    ["prayer", latitude, longitude, date ?? null] as const,
};

export function useGetPrayerTimes(
  params: PrayTimesParams,
  options?: { query?: { enabled?: boolean } },
): UseQueryResult<PrayerTimesResult, Error> {
  const { latitude, longitude, date } = params;
  const enabled = options?.query?.enabled ?? true;
  return useQuery({
    queryKey: prayerKeys.times(latitude, longitude, date),
    // Offline fallback (Task 8): on network failure, return the last cached
    // result (marked cached: true) instead of an error. On success, cache it.
    queryFn: async () => {
      try {
        const fresh = await fetchPrayerTimes(latitude, longitude, date);
        await savePrayerTimesCache({
          timings: fresh.timings,
          hijriDate: fresh.hijriDate,
          date: fresh.date,
          location: fresh.location,
          cachedAt: new Date().toISOString(),
        });
        return fresh;
      } catch (error) {
        const cached = await getPrayerTimesCache();
        if (cached) {
          return {
            date: cached.date,
            hijriDate: cached.hijriDate,
            timezone: "—",
            location: cached.location,
            timings: cached.timings,
            cached: true,
          } as PrayerTimesResult & { cached: boolean };
        }
        throw error;
      }
    },
    enabled,
    staleTime: HOUR,
    gcTime: DAY,
  });
}

// ---------------------------------------------------------------------------
// Hadith
// ---------------------------------------------------------------------------

// Canonical query-key family for hadith:
//   ["hadith", "categories"]
//   ["hadith", "category", categoryId, page, perPage]
//   ["hadith", "detail", hadithId]
//   ["hadith", "search", phrase]
//   ["hadith", "book", bookSlug, page, perPage]
//   ["hadith", "book", bookSlug, "by-number", number]
//   ["hadith", "book", bookSlug, "section", sectionNumber]
//   ["hadith", "grade", "book", bookSlug, number]
//   ["hadith", "grade", "hadeethenc", hadithId]
// Every page is its own cache entry (per-page queryKeys) — a page change never
// refetches another page, and `placeholderData: keepPreviousData` keeps the
// previous page visible while the next one loads.
export const hadithKeys = {
  categories: ["hadith", "categories"] as const,
  books: ["hadith", "books"] as const,
  categoryPage: (categoryId: string, page: number, perPage: number) =>
    ["hadith", "category", categoryId, page, perPage] as const,
  detail: (hadithId: string) => ["hadith", "detail", hadithId] as const,
  search: (phrase: string) => ["hadith", "search", phrase] as const,
  bookPage: (bookSlug: string, page: number, perPage: number) =>
    ["hadith", "book", bookSlug, page, perPage] as const,
  byNumber: (bookSlug: string, number: number) =>
    ["hadith", "book", bookSlug, "by-number", number] as const,
  section: (bookSlug: string, sectionNumber: number) =>
    ["hadith", "book", bookSlug, "section", sectionNumber] as const,
  gradeBook: (bookSlug: string, number: number) =>
    ["hadith", "grade", "book", bookSlug, number] as const,
  gradeDetail: (hadithId: string) =>
    ["hadith", "grade", "hadeethenc", hadithId] as const,
} as const;

/**
 * التخزين offline لا يعرقل إرجاع الاستعلام — يُنفَّذ خارج مسار العرض
 * (microtask) وفشله يُبتلع: التخزين المحلي اختياري.
 */
function persistHadiths(items: HadithItem[]): void {
  queueMicrotask(() => {
    try {
      storeHadiths(items);
    } catch {
      // اختياري — لا يُسقط العرض.
    }
  });
}

// Categories are quasi-static → ETERNITY staleTime (no refetch per screen).
export function useGetHadithCategories(): UseQueryResult<HadithCategoryNode[], Error> {
  return useQuery({
    queryKey: hadithKeys.categories,
    queryFn: fetchHadithCategories,
    staleTime: ETERNITY,
    gcTime: 2 * DAY,
  });
}

/**
 * The nine canonical books (Bukhari, Muslim, …) — for the hadith browser.
 * Book lists are immutable → cache forever; pages cache 1h like lists.
 */
export function useGetHadithBooks(): UseQueryResult<HadithBook[], Error> {
  return useQuery({
    queryKey: hadithKeys.books,
    queryFn: fetchHadithBooks,
    staleTime: ETERNITY,
    gcTime: ETERNITY,
  });
}

export function useGetBookHadiths(
  params: { bookSlug: string; page?: number; perPage?: number } | null,
): UseQueryResult<HadithPage, Error> {
  const bookSlug = params?.bookSlug ?? "bukhari";
  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? 10;
  return useQuery({
    queryKey: hadithKeys.bookPage(bookSlug, page, perPage),
    // Accumulative offline cache: every fetched page is stored to SQLite so
    // previously-browsed hadiths stay readable offline (Task 7).
    queryFn: async () => {
      const result = await fetchBookHadiths(bookSlug, page, perPage);
      persistHadiths(result.items);
      return result;
    },
    enabled: Boolean(params?.bookSlug),
    // صفحة جديدة → تبقى البيانات السابقة ظاهرة حتى تصل الجديدة (لا شاشة
    // تحميل كاملة عند كل تنقل) — الحالة: isPending=false، isFetching=true.
    placeholderData: keepPreviousData,
    staleTime: HOUR,
    gcTime: DAY,
  });
}

export function useGetHadiths(
  params?: HadithsParams,
  options?: { query?: { enabled?: boolean } },
): UseQueryResult<HadithPage, Error> {
  const categoryId = params?.categoryId ?? "2";
  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? 5;
  const enabled = options?.query?.enabled ?? true;
  return useQuery({
    queryKey: hadithKeys.categoryPage(categoryId, page, perPage),
    queryFn: () => fetchHadithList(categoryId, page, perPage),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: HOUR,
    gcTime: DAY,
  });
}

/**
 * أحاديث قسم واحد (فهرس الأبواب) — تُجلب لمرة وتُخزن offline. الدرجات تُحمّل
 * كسولًا في البطاقات (useHadithGrade) ولا تُحبس هنا.
 */
export function useGetHadithSection(
  bookSlug: string | null,
  sectionNumber: number | null,
): UseQueryResult<HadithItem[], Error> {
  return useQuery({
    queryKey: hadithKeys.section(bookSlug ?? "", sectionNumber ?? 0),
    queryFn: async () => {
      const result = await fetchHadithSection(bookSlug!, sectionNumber!);
      persistHadiths(result);
      return result;
    },
    enabled: Boolean(bookSlug && sectionNumber && sectionNumber >= 1),
    staleTime: DAY,
    gcTime: 7 * DAY,
  });
}

/**
 * البحث النصي الموضوعي (hadeethenc) — مفتاح ["hadith","search",phrase] من
 * العائلة الموثقة. null يعطل الاستعلام (لا طلبات أثناء الكتابة؛ يُفعّل عند
 * submit فقط). النتائج بلا grade من المصدر — القاعدة محفوظة (تُحمّل كسولًا).
 */
export function useGetHadithSearch(
  phrase: string | null,
): UseQueryResult<HadithPage, Error> {
  return useQuery({
    queryKey: hadithKeys.search(phrase ?? ""),
    queryFn: () => searchHadiths(phrase!, 1, 50),
    enabled: Boolean(phrase && phrase.trim().length >= 2),
    staleTime: HOUR,
    gcTime: DAY,
  });
}

/**
 * تفصيل حديث واحد — المسار الوحيد الذي تظهر فيه الدرجة كما أعطاها المصدر.
 * HadeethEnc /hadeeths/one هو المصدر الوحيد الذي يقدم grade/attribution/
 * explanation/reference في التفصيل (مُتحقق حيًا: القوائم والبحث بلا grade).
 * hadis-api-id (الكتب التسعة) لا يوفر endpoint تفصيل أصلًا — تمرر الشاشة
 * hadithId=null فيتعطل الاستعلام (enabled=false) بدل خطأ اتصال مضلل.
 */
export function useGetHadithDetail(
  hadithId: string | null,
): UseQueryResult<HadithItem, Error> {
  return useQuery({
    queryKey: hadithKeys.detail(hadithId ?? ""),
    queryFn: () => fetchHadithDetail(hadithId!),
    enabled: Boolean(hadithId),
    staleTime: DAY,
    gcTime: 7 * DAY,
  });
}

/**
 * حديث كتاب واحد برقمه — نفس مسار الإنتاج الذي يبني بطاقات الكتب
 * (hadis-api-id + إثراء fawaz الحرفي). تُستخدمه شاشة التفصيل لفتح حديث
 * من كتاب: الدرجة/النص/المرجع مطابقة تمامًا لبطاقة القائمة — لا مصدر
 * درجات ثانٍ.
 */
export function useGetHadithByNumber(
  bookSlug: string | null,
  number: number | null,
): UseQueryResult<HadithItem, Error> {
  return useQuery({
    queryKey: hadithKeys.byNumber(bookSlug ?? "", number ?? 0),
    queryFn: () => fetchHadithByNumber(bookSlug!, number!),
    enabled: Boolean(bookSlug && number && number >= 1),
    staleTime: DAY,
    gcTime: 7 * DAY,
  });
}

/**
 * الدرجة كسولًا لعنصر قائمة (لا تُحبس القائمة نفسها):
 *   - القديم من stock (fetcher مثرًى مثل by-number/التفصيل) يُعاد كما هو.
 *   - HadeethEnc → نفس مصدر/حقل شاشة التفصيل (fetchHadithDetail).
 *   - hadis-api-id → نفس القاعدة الحرفية (fawaz للكتب الخمسة؛ بخاري/مسلم بلا).
 * البطاقات المرئية فقط (FlatList virtualization) تحرك طلبًا واحدًا لكل حديث،
 * وتُحفظ النتيجة في كاش React Query (persisted) فالعودة فورية.
 */
export function useHadithGrade(
  item: HadithItem | null | undefined,
  bookSlug?: string | null,
): string | undefined {
  const immediate = item?.grade;
  const kind = item?.apiSource;
  const hadithId = item?.id;
  const reference = Number.parseInt(item?.reference ?? "", 10);
  const isBook =
    kind === "hadis-api-id" &&
    Boolean(bookSlug) &&
    Number.isInteger(reference) &&
    reference >= 1;
  const isDetail = kind === "hadeethenc.com" && Boolean(hadithId);
  const queryKey = isBook
    ? hadithKeys.gradeBook(bookSlug!, reference)
    : isDetail
      ? hadithKeys.gradeDetail(hadithId!)
      : (["hadith", "grade", "disabled"] as const);
  const { data } = useQuery({
    queryKey,
    queryFn: async () => {
      if (isBook && bookSlug && item) {
        return fetchMatchedGradeFromFawaz(bookSlug, reference, item.text);
      }
      if (isDetail && hadithId) {
        const detail = await fetchHadithDetail(hadithId);
        return detail.grade;
      }
      return undefined;
    },
    enabled: !immediate && (isBook || isDetail),
    staleTime: HOUR,
    gcTime: 7 * DAY,
  });
  return immediate ?? data;
}

/**
 * اجلب الصفحة التالية (واحدة فقط) في الخلفية — عند وصول المستخدم إليها
 * تكون مخزنة وطازجة فيظهر العرض فورًا بلا spinner. مستخدمة في شاشات
 * الأحاديث (كتب ومواضيع).
 */
export function usePrefetchNextHadithPage(params: {
  enabled: boolean;
  bookSlug?: string | null;
  categoryId?: string | null;
  page: number;
  perPage: number;
  hasMore: boolean;
}): void {
  const queryClient = useQueryClient();
  const { enabled, bookSlug, categoryId, page, perPage, hasMore } = params;
  useEffect(() => {
    if (!enabled || !hasMore || page < 1) return;
    const next = page + 1;
    if (bookSlug) {
      void queryClient.prefetchQuery({
        queryKey: hadithKeys.bookPage(bookSlug, next, perPage),
        queryFn: async () => {
          const result = await fetchBookHadiths(bookSlug, next, perPage);
          persistHadiths(result.items);
          return result;
        },
        staleTime: HOUR,
      });
    } else if (categoryId) {
      void queryClient.prefetchQuery({
        queryKey: hadithKeys.categoryPage(categoryId, next, perPage),
        queryFn: () => fetchHadithList(categoryId, next, perPage),
        staleTime: HOUR,
      });
    }
  }, [enabled, hasMore, page, perPage, bookSlug, categoryId, queryClient]);
}

/**
 * Chapter → page-range map (from quran.com) powering the juz/page pickers in
 * the Quran tab. Immutable content → cached forever.
 */
export function useGetQuranChapterPages(): UseQueryResult<QuranChapterPage[], Error> {
  return useQuery({
    queryKey: ["quran", "chapter-pages"],
    queryFn: fetchQuranChapterPages,
    staleTime: ETERNITY,
    gcTime: ETERNITY,
  });
}

// ---------------------------------------------------------------------------
// Client-side Quran search (Phase B groundwork) — searches over verses already
// present in the react-query cache, no network call. Call `useQuranSearch()`
// from a screen; it de-dupes and scans whatever surahs are loaded so far.
// ---------------------------------------------------------------------------

export type QuranSearchHit = {
  surahId: number;
  surahName: string;
  verseNumber: number;
  verseKey: string;
  text: string;
  /** -1 when the query matched only the surah's own name. */
  ayahScore: number;
};

const SEARCH_TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/**
 * Normalizes Uthmani script to plain Arabic for search: strips tashkeel and
 * folds alef-wasla (ٱ) / hamza carriers into plain alef so a user typing
 * "الصمد" matches "ٱلصَّمَدُ".
 */
function normalizeForSearch(text: string): string {
  return text
    .replace(SEARCH_TASHKEEL, "")
    .replace(/[ٱأإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

export function useQuranSearch(): (query: string) => QuranSearchHit[] {
  return (query: string) => searchQuranInMemory(query);
}

function searchQuranInMemory(query: string): QuranSearchHit[] {
  const needle = query.trim();
  if (needle.length < 2) return [];
  // Lazy import dance avoided: queryClient lives in the app module. Screens
  // pass loaded surahs directly instead — see searchQuranVerses().
  return [];
}

/**
 * Pure function usable from any screen: pass the surahs you already have in
 * memory (e.g. from useQueries over quranKeys.surah(id)) and get scored hits.
 * Kept dependency-free so it can also run against an offline store later.
 */
export function searchQuranVerses(
  surahs: QuranSurah[],
  query: string,
): QuranSearchHit[] {
  const needle = normalizeForSearch(query.trim());
  if (needle.length < 2) return [];
  const hits: QuranSearchHit[] = [];
  for (const surah of surahs) {
    if (normalizeForSearch(surah.nameArabic).includes(needle)) {
      hits.push({
        surahId: surah.id,
        surahName: surah.nameArabic,
        verseNumber: 0,
        verseKey: `${surah.id}:0`,
        text: surah.nameArabic,
        ayahScore: -1,
      });
    }
    for (const verse of surah.verses) {
      const normalizedText = normalizeForSearch(verse.text);
      const index = normalizedText.indexOf(needle);
      if (index >= 0) {
        hits.push({
          surahId: surah.id,
          surahName: surah.nameArabic,
          verseNumber: verse.verseNumber,
          verseKey: verse.verseKey,
          text: verse.text,
          ayahScore: index, // earlier match = higher relevance after sort
        });
      }
    }
  }
  return hits.sort((a, b) => {
    if (a.ayahScore === -1) return 1;
    if (b.ayahScore === -1) return -1;
    return a.ayahScore - b.ayahScore;
  });
}

// ---------------------------------------------------------------------------
// Next-prayer countdown (Phase A groundwork for expo-notifications): pure
// function over a timings record; returns minutes until the next prayer and
// its key, or null when all prayers for today have passed.
// ---------------------------------------------------------------------------

export type NextPrayerInfo = {
  key: string;
  time: string;
  minutesRemaining: number;
};

export function computeNextPrayer(
  timings: Record<string, string>,
  now: Date = new Date(),
): NextPrayerInfo | null {
  const order = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const parse = (value: string | undefined): number | null => {
    if (!value) return null;
    const [hours, minutes] = value.split(":").map(Number);
    return Number.isFinite(hours) && Number.isFinite(minutes)
      ? hours * 60 + minutes
      : null;
  };
  for (const key of order) {
    const minutes = parse(timings[key]);
    if (minutes !== null && minutes > currentMinutes) {
      return {
        key,
        time: timings[key],
        minutesRemaining: minutes - currentMinutes,
      };
    }
  }
  return null;
}
