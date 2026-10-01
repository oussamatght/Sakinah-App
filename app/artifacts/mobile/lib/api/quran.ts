/**
 * Quran data — auth-free providers: text/chapters/tafsir api.alquran.cloud/v1,
 * chapter audio api.quran.com/api/v4/chapter_recitations/7. QFC was dropped on
 * purpose: it needs an OAuth2 secret that cannot live in a shipped bundle.
 * Normalization mirrors the old api-server quranService.ts, so screen shapes
 * are unchanged.
 */

import { fetchJson, isJsonRecord, type JsonRecord } from "./http";
import type {
  QuranAudio,
  QuranChapter,
  QuranChapterPage,
  QuranJuz,
  QuranJuzSurahRange,
  QuranPageGroup,
  QuranSurah,
  QuranTafsir,
  QuranVerse,
} from "./types";

const ALQURAN_API = "https://api.alquran.cloud/v1";
const QURAN_COM_API = "https://api.quran.com/api/v4";

// إعادة تصدير لمستهلكي مسار الصفحات (القارئ والاختبارات).
export type { QuranPageGroup, QuranSurah } from "./types";

/**
 * القارئ الافتراضي في api.quran.com (7 = مشاري راشد العفاسي). الأرقام مطابقة
 * لـ RECITERS في الإعدادات (قائمة القراء في /api/v4/recitations) ليُمرَّر الرقم
 * المختار مع كل طلب صوت.
 */
export const DEFAULT_RECITER_ID = 7;

/** أسماء القراء لقيمة reciter في واجهة الصوت (عرض وفهرس محلي فقط). */
export const RECITER_NAMES: Record<number, string> = {
  1: "عبد الباسط عبد الصمد (مجود)",
  2: "أبو بكر الشاطري",
  3: "أحمد العجمي",
  4: "الحصري",
  5: "ماهر المعيقلي",
  6: "منصور السالمي",
  7: "مشاري العفاسي",
  8: "محمد أيوب",
};

export function reciterNameOf(reciterId: number): string {
  return RECITER_NAMES[reciterId] ?? RECITER_NAMES[DEFAULT_RECITER_ID];
}

/** CDN for per-ayah files (مُتحقق حيًا: HTTP 206 مع Range requests). */
const AYAH_AUDIO_CDN = "https://audio.qurancdn.com";

/**
 * يطابق البسملة في أي رسم عثماني (تختلف العلامات وألف الوصل بين المصادر):
 * نحذف العلامات ونطابق الحروف الأساسية ثم نزيل نفس البادئة من النص الأصلي
 * ليبقى التشكيل. الأشكال المرصودة (alquran.cloud quran-uthmani):
 *   بسم (628,633,645)  ٱلله (671,644,644,647)
 *   ٱلرحمن (671,644,631,62d,645,646)  ٱلرحيم (671,644,631,62d,64a,645)
 */
const BISMILLAH_BASE = /^بسم\s+ٱلله\s+ٱلرحمن\s+ٱلرحيم(?=\s|$)/;

const TASHKEEL =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

function stripLeadingBismillah(text: string): string {
  const stripped = text.replace(TASHKEEL, "");
  if (!BISMILLAH_BASE.test(stripped)) return text;
  const strippedPrefixLen = stripped.split(/\s/).slice(0, 4).join(" ").length;
  let originalIndex = 0;
  let seen = 0;
  while (originalIndex < text.length && seen < strippedPrefixLen) {
    const char = text[originalIndex];
    const isMark = char !== char.replace(TASHKEEL, "");
    if (!isMark) seen += 1;
    originalIndex += 1;
  }
  // ابتلع العلامات والمسافات التالية للبسملة (مثل كسرة ميم ٱلرَّحِيمِ).
  while (
    originalIndex < text.length &&
    (/\s/.test(text[originalIndex]) ||
      text[originalIndex] !== text[originalIndex].replace(TASHKEEL, ""))
  ) {
    originalIndex += 1;
  }
  return text.slice(originalIndex).trim();
}

function mapChapter(raw: JsonRecord): QuranChapter {
  return {
    id: Number(raw.number),
    nameArabic: String(raw.name ?? "").replace(/^سُورَةُ\s*/, ""),
    nameEnglish: String(raw.englishName ?? ""),
    revelationPlace:
      String(raw.revelationType ?? "") === "Meccan" ? "makkah" : "madinah",
    versesCount: Number(raw.numberOfAyahs ?? 0),
  };
}

export async function fetchQuranChapters(): Promise<QuranChapter[]> {
  const payload = await fetchJson<{ data?: unknown }>(
    `${ALQURAN_API}/surah`,
    "القرآن",
  );
  const list = Array.isArray(payload.data) ? payload.data : [];
  return list
    .filter(isJsonRecord)
    .map(mapChapter)
    .filter((chapter) => chapter.id > 0 && chapter.nameArabic)
    .sort((a, b) => a.id - b.id);
}

/**
 * Chapter → page ranges (quran.com) لاختياري الأجزاء/الصفحات: جزء = صفحات
 * (juz-1)*20+1..juz*20 تقريبًا، والصفحة تُنسب للسورة التي تحتويها.
 */
export async function fetchQuranChapterPages(): Promise<QuranChapterPage[]> {
  const payload = await fetchJson<{ chapters?: unknown }>(
    `${QURAN_COM_API}/chapters?language=ar`,
    "القرآن",
  );
  const chapters = Array.isArray(payload.chapters) ? payload.chapters : [];
  return chapters
    .filter(isJsonRecord)
    .map((raw) => {
      const pages = Array.isArray(raw.pages) ? raw.pages : [];
      return {
        id: Number(raw.id),
        nameArabic: String(raw.name_arabic ?? ""),
        startPage: Number(pages[0] ?? 0),
        endPage: Number(pages[1] ?? 0),
        versesCount: Number(raw.verses_count ?? 0),
        revelationPlace: String(raw.revelation_place ?? ""),
      };
    })
    .filter((chapter) => chapter.id > 0 && chapter.startPage > 0)
    .sort((a, b) => a.id - b.id);
}

function mapVerse(raw: JsonRecord, index: number, surahId: number): QuranVerse {
  const verseNumber = Number(raw.numberInSurah) || index + 1;
  let text = String(raw.text ?? "").trim();
  // alquran.cloud يدمج البسملة في الآية 1 من كل سورة عدا الفاتحة (1) والتوبة (9)
  // — تُحذف ليعرض القارئ بسملته الزخرفية كما كان الخادم يفعل.
  if (verseNumber === 1 && surahId !== 1 && surahId !== 9) {
    text = stripLeadingBismillah(text);
  }
  return {
    id: Number(raw.number) || index + 1,
    verseNumber,
    verseKey: `${surahId}:${verseNumber}`,
    text,
    juz: Number(raw.juz ?? 0),
    page: Number(raw.page ?? 0),
  };
}

export async function fetchQuranSurah(surahId: number): Promise<QuranSurah> {
  if (!Number.isInteger(surahId) || surahId < 1 || surahId > 114) {
    const error = new Error("رقم السورة غير صالح") as Error & { code?: string };
    error.code = "SURAH_NOT_FOUND";
    throw error;
  }
  const payload = await fetchJson<{ data?: unknown }>(
    `${ALQURAN_API}/surah/${surahId}/quran-uthmani`,
    "القرآن",
  );
  const data = isJsonRecord(payload.data) ? payload.data : {};
  const ayahs = Array.isArray(data.ayahs) ? data.ayahs : [];
  const verses = ayahs
    .filter(isJsonRecord)
    .map((raw, index) => mapVerse(raw, index, surahId));

  // Chapter metadata comes free from the same payload — no second request.
  const chapters = await fetchQuranChapters();
  const chapter =
    chapters.find((candidate) => candidate.id === surahId) ??
    (verses.length > 0
      ? {
          id: surahId,
          nameArabic: String(data.name ?? "").replace(/^سُورَةُ\s*/, ""),
          nameEnglish: String(data.englishName ?? ""),
          revelationPlace:
            String(data.revelationType ?? "") === "Meccan" ? "makkah" : "madinah",
          versesCount: verses.length,
        }
      : null) ??
    (verses.length > 0
      ? {
          id: surahId,
          nameArabic: `السورة ${surahId}`,
          nameEnglish: `Surah ${surahId}`,
          revelationPlace: "makkah",
          versesCount: verses.length,
        }
      : null);
  if (!chapter) {
    const error = new Error("السورة غير موجودة") as Error & { code?: string };
    error.code = "SURAH_NOT_FOUND";
    throw error;
  }
  // تحقق من الاكتمال: التحذيرات تُسجَّل ثم تُسلَّم الآيات مرتبة بلا تكرار، فلا تختفي آية بلا أثر.
  const validation = validateQuranSurah({ ...chapter, verses });
  if (validation.issues.length > 0) {
    console.warn(`[القرآن] ${validation.issues.join(" | ")}`);
  }
  return { ...chapter, verses: validation.sortedVerses };
}

/**
 * جزء كامل بحدود حقيقية من alquran.cloud (كل آية تحمل juz/page) لا تقريب نطاق
 * صفحات — لتابب "الأجزاء": جزء → نطاقات سوره الفعلية وآياته.
 */
export async function fetchQuranJuz(juz: number): Promise<QuranJuz> {
  if (!Number.isInteger(juz) || juz < 1 || juz > 30) {
    const error = new Error("رقم الجزء غير صالح") as Error & { code?: string };
    error.code = "JUZ_NOT_FOUND";
    throw error;
  }
  const payload = await fetchJson<{ data?: unknown }>(
    `${ALQURAN_API}/juz/${juz}/quran-uthmani`,
    "القرآن",
  );
  const data = isJsonRecord(payload.data) ? payload.data : {};
  const ayahs = Array.isArray(data.ayahs) ? data.ayahs : [];
  const raws = ayahs.filter(isJsonRecord);
  if (raws.length === 0) {
    const error = new Error("الجزء غير موجود") as Error & { code?: string };
    error.code = "JUZ_NOT_FOUND";
    throw error;
  }

  const verses: QuranVerse[] = [];
  const ranges = new Map<number, QuranJuzSurahRange>();
  for (const raw of raws) {
    const surahRaw = isJsonRecord(raw.surah) ? raw.surah : {};
    const surahId = Number(surahRaw.number);
    const verseNumber = Number(raw.numberInSurah);
    const verse: QuranVerse = {
      id: Number(raw.number),
      verseNumber,
      verseKey: `${surahId}:${verseNumber}`,
      // البسملة تندمج في الآية 1 فقط، و/juz يبدأ وسط السورة (عدا الجزء 1)،
      // فآية الفاتحة/التوبة 1 هي الحالات الوحيدة التي تُحفظ كما وردت.
      text: String(raw.text ?? "").trim(),
      juz: Number(raw.juz ?? juz),
      page: Number(raw.page ?? 0),
    };
    verses.push(verse);

    const existing = ranges.get(surahId);
    const nameArabic = String(surahRaw.name ?? "").replace(/^سُورَةُ\s*/, "");
    if (existing) {
      existing.toAyah = verseNumber;
    } else {
      ranges.set(surahId, {
        surahId,
        nameArabic,
        fromAyah: verseNumber,
        toAyah: verseNumber,
        startPage: Number(raw.page ?? 0),
      });
    }
  }

  return {
    juz,
    ayahCount: verses.length,
    verses,
    surahRanges: [...ranges.values()].sort((a, b) => a.surahId - b.surahId),
  };
}

export async function fetchQuranAudio(
  surahId: number,
  reciterId: number = DEFAULT_RECITER_ID,
): Promise<QuranAudio> {
  const payload = await fetchJson<{ audio_file?: unknown }>(
    `${QURAN_COM_API}/chapter_recitations/${reciterId}/${surahId}`,
    "صوت القرآن",
  );
  const audioFile = isJsonRecord(payload.audio_file) ? payload.audio_file : {};
  const audioUrl = String(audioFile.audio_url ?? "");
  if (!audioUrl) {
    const error = new Error("تعذر تحميل الصوت") as Error & { code?: string };
    error.code = "AUDIO_NOT_FOUND";
    throw error;
  }
  return {
    surahId,
    audioUrl,
    reciter: reciterNameOf(reciterId),
    format: String(audioFile.format ?? "mp3"),
  };
}

/**
 * تقسيم آيات السورة لصفحات مصحف حقيقية (verse.page من alquran.cloud) — دالة
 * نقية مُصدَّرة للاختبارات؛ أي آية بلا page صالح تُرمى بدل صفحة وهمية 0.
 */
export function groupQuranVersesByPage(verses: QuranVerse[]): QuranPageGroup[] {
  const groups = new Map<number, QuranPageGroup>();
  for (const verse of verses) {
    const page = verse.page;
    if (!Number.isInteger(page) || page < 1) continue;
    const group = groups.get(page);
    if (group) {
      group.verses.push(verse);
    } else {
      groups.set(page, { page, verses: [verse] });
    }
  }
  return [...groups.values()].sort((a, b) => a.page - b.page);
}

// الترتيب القانوني للتنقّل: سورة+آية؛ الصفحات للعرض فقط.

/** عدد آيات السور الـ114 بالترتيب المصحفي الثابت (معياري، بلا طلب شبكة) —
 *  لحساب الآية التالية/السابقة دون تخطي أي آية. */
export const SURAH_AYAH_COUNTS: readonly number[] = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111,
  110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45,
  83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55,
  78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20,
  56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21,
  11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

/** معرّف مستقر للآية في الترتيب القانوني: "السورة:الآية" (مثل "114:6"). */
export type AyahPosition = { surah: number; ayah: number };

function ayahCountOf(surah: number): number {
  return SURAH_AYAH_COUNTS[surah - 1] ?? 0;
}

/** الآية التالية قانونيًا: عند آخر آية → الآية 1 من السورة التالية؛ (114:6) → null. */
export function nextAyahPosition(pos: AyahPosition): AyahPosition | null {
  const { surah, ayah } = pos;
  if (surah < 1 || surah > 114 || ayah < 1 || ayah > ayahCountOf(surah)) return null;
  if (ayah < ayahCountOf(surah)) return { surah, ayah: ayah + 1 };
  if (surah < 114) return { surah: surah + 1, ayah: 1 };
  return null;
}

/** الآية السابقة قانونيًا: عند الآية 1 → آخر آية من السورة السابقة؛ (1:1) → null. */
export function prevAyahPosition(pos: AyahPosition): AyahPosition | null {
  const { surah, ayah } = pos;
  if (surah < 1 || surah > 114 || ayah < 1 || ayah > ayahCountOf(surah)) return null;
  if (ayah > 1) return { surah, ayah: ayah - 1 };
  if (surah > 1) return { surah: surah - 1, ayah: ayahCountOf(surah - 1) };
  return null;
}

export type QuranSurahValidation = {
  surahId: number;
  /** العدد القانوني الثابت من SURAH_AYAH_COUNTS. */
  canonicalCount: number;
  /** عدد الآيات كما استُلمت من المصدر. */
  receivedCount: number;
  /** عدد الآيات الصالحة بعد الفرز (فريدة، داخل النطاق). */
  uniqueCount: number;
  /** هل الترتيب 1..count مطابق بلا قفز ولا تكرار؟ */
  orderIsCanonical: boolean;
  /** أرقام آيات تكرّرت (تُعرض مرة واحدة). */
  duplicates: number[];
  /** أرقام من 1..count غير موجودة في البيانات. */
  missing: number[];
  /** أرقام آيات خارج نطاق السورة (1..count) — تُتجاهل مع تحذير. */
  extra: number[];
  /** آيات صالحة: فريدة، مرتبة تصاعديًا، داخل النطاق القانوني. */
  sortedVerses: QuranVerse[];
  /** تحذيرات وصفية (عربية) — لا يُحذف نص قرآني بصمت. */
  issues: string[];
};

/**
 * فحص سورة مقابل العدد القانوني الثابت: يكتشف التكرار والنواقص والخارج عن النطاق
 * وعدم الترتيب، ويُعيد `sortedVerses` (فرز+إزالة تكرار، النص الأصلي كما ورد)،
 * مع `issues` لكل انحراف (لا إسقاط صامت لآيات). دالة نقية قابلة للاختبار.
 */
export function validateQuranSurah(surah: QuranSurah): QuranSurahValidation {
  const canonicalCount = ayahCountOf(surah.id);
  const receivedCount = surah.verses.length;

  const emitted = new Set<number>();
  const duplicates = new Set<number>();
  const extra = new Set<number>();
  for (const verse of surah.verses) {
    const n = verse.verseNumber;
    if (n < 1 || n > canonicalCount) {
      extra.add(n);
      continue;
    }
    if (emitted.has(n)) duplicates.add(n);
    else emitted.add(n);
  }

  const missing: number[] = [];
  for (let n = 1; n <= canonicalCount; n += 1) {
    if (!emitted.has(n)) missing.push(n);
  }

  const issues: string[] = [];
  if (receivedCount !== canonicalCount) {
    issues.push(
      `سورة ${surah.id}: استُلمت ${receivedCount} آية والمتوقع القانوني ${canonicalCount}`,
    );
  }
  if (duplicates.size > 0) {
    issues.push(
      `سورة ${surah.id}: آيات مكررة [${[...duplicates].sort((a, b) => a - b).join(', ')}] — تُعرض لمرة واحدة`,
    );
  }
  if (missing.length > 0) {
    issues.push(
      `سورة ${surah.id}: آيات مفقودة [${missing.join(', ')}] — تحقق من مصدر البيانات`,
    );
  }
  if (extra.size > 0) {
    issues.push(
      `سورة ${surah.id}: آيات خارج النطاق [${[...extra].sort((a, b) => a - b).join(', ')}] — تجاهلت`,
    );
  }
  if (
    duplicates.size === 0 &&
    missing.length === 0 &&
    extra.size === 0 &&
    !surah.verses.every((verse, i) => i === 0 || verse.verseNumber === surah.verses[i - 1].verseNumber + 1)
  ) {
    issues.push(`سورة ${surah.id}: الآيات غير مرتبة — أعيد ترتيبها حسب رقم الآية`);
  }

  const seenOnce = new Set<number>();
  const sortedVerses = surah.verses
    .filter((verse) => {
      const n = verse.verseNumber;
      if (n < 1 || n > canonicalCount) return false;
      if (seenOnce.has(n)) return false;
      seenOnce.add(n);
      return true;
    })
    .sort((a, b) => a.verseNumber - b.verseNumber);

  const orderIsCanonical =
    sortedVerses.length === canonicalCount &&
    sortedVerses.every((verse, i) => verse.verseNumber === i + 1);

  return {
    surahId: surah.id,
    canonicalCount,
    receivedCount,
    uniqueCount: sortedVerses.length,
    orderIsCanonical,
    duplicates: [...duplicates].sort((a, b) => a - b),
    missing,
    extra: [...extra].sort((a, b) => a - b),
    sortedVerses,
    issues,
  };
}

/**
 * تسطيح سورة في مسار المصحف المتصل: دمج صفحات السورة (verse.page الحقيقي) مع
 * صفحات السور السابقة — أرقام الصفحات مرجع العرض، والترتيب سورة:آية للتنقل.
 */
export function flattenSurahIntoQuranPages(
  existing: QuranPageGroup[],
  surah: QuranSurah,
): QuranPageGroup[] {
  const merged = new Map<number, QuranPageGroup>();
  for (const group of existing) merged.set(group.page, group);
  for (const verse of surah.verses) {
    if (!Number.isInteger(verse.page) || verse.page < 1) continue;
    const group = merged.get(verse.page);
    if (group) {
      if (!group.verses.some((item) => item.verseKey === verse.verseKey)) {
        group.verses.push(verse);
      }
    } else {
      merged.set(verse.page, { page: verse.page, verses: [verse] });
    }
  }
  for (const group of merged.values()) {
    // ترتيب داخل الصفحة: (سورة، آية) لأن الصفحة قد تحوي نهاية سورة وبداية التالية
    // (604: الإخلاص ثم الفلق)؛ وترتيب verseNumber وحده كان يخلطهما.
    group.verses.sort((a, b) => {
      const [as, aa] = a.verseKey.split(":");
      const [bs, ba] = b.verseKey.split(":");
      return Number(as) * 1000 + Number(aa) - (Number(bs) * 1000 + Number(ba));
    });
  }
  return [...merged.values()].sort((a, b) => a.page - b.page);
}

/**
 * صوت آية واحدة: /recitations/{id}/by_ayah/{key} يُعيد مسارًا نسبيًا مثل
 * "Alafasy/mp3/002255.mp3" يُبنى فوق audio.qurancdn.com (مُتحقق حيًا 2026-09)،
 * والمسارات المطلقة تُمرَّر كما هي.
 */
export async function fetchAyahAudio(
  surahId: number,
  ayahNumber: number,
  reciterId: number = DEFAULT_RECITER_ID,
): Promise<QuranAudio> {
  const verseKey = `${surahId}:${ayahNumber}`;
  const payload = await fetchJson<{ audio_files?: unknown }>(
    `${QURAN_COM_API}/recitations/${reciterId}/by_ayah/${encodeURIComponent(verseKey)}`,
    "صوت الآية",
  );
  const files = Array.isArray(payload.audio_files) ? payload.audio_files : [];
  const first = files.find(isJsonRecord);
  const path = first ? String(first.url ?? "") : "";
  if (!path) {
    const error = new Error("لا يوجد صوت لهذه الآية") as Error & { code?: string };
    error.code = "AUDIO_NOT_FOUND";
    throw error;
  }
  const audioUrl = /^https?:\/\//.test(path)
    ? path
    : `${AYAH_AUDIO_CDN}/${path.replace(/^\//, "")}`;
  return { surahId, audioUrl, reciter: reciterNameOf(reciterId), format: "mp3" };
}

export async function fetchQuranTafsir(
  surahId: number,
  ayahNumber: number,
): Promise<QuranTafsir> {
  const payload = await fetchJson<{ data?: unknown }>(
    `${ALQURAN_API}/ayah/${surahId}:${ayahNumber}/ar.muyassar`,
    "التفسير",
  );
  const data = isJsonRecord(payload.data) ? payload.data : {};
  const edition = isJsonRecord(data.edition) ? data.edition : {};
  return {
    surahId,
    ayahNumber,
    // resourceName = edition.name (العنوان العربي)؛ englishName اسم الناشر فيظهر خطأ في الواجهة.
    resourceName: String(edition.name ?? "التفسير الميسّر"),
    text: String(data.text ?? ""),
  };
}
