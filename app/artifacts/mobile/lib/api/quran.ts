/**
 * Quran data — direct, auth-free providers (serverless architecture):
 *   - text + chapters + tafsir : api.alquran.cloud/v1
 *   - chapter audio            : api.quran.com/api/v4/chapter_recitations/7
 *
 * (Quran Foundation/QFC was dropped client-side on purpose: it needs an
 * OAuth2 client secret that cannot live safely inside a shipped app bundle.)
 *
 * Normalization logic mirrors what artifacts/api-server/src/services/
 * quranService.ts did, so screen-level shapes are unchanged.
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

/** Reciter 7 on api.quran.com = Mishary Rashid Alafasy (murattal). */
const RECITER_ID = 7;
const RECITER_NAME = "مشاري العفاسي";
/** CDN for per-ayah files (مُتحقق حيًا: HTTP 206 مع Range requests). */
const AYAH_AUDIO_CDN = "https://audio.qurancdn.com";

/**
 * Matches the bismillah in ANY Uthmani-style rendering (tashkeel, dagger
 * alif, alef-wasla differ across providers). Strategy: strip combining marks,
 * match the four words by their base letters, then remove the equivalent
 * leading portion from the ORIGINAL text so the rest keeps its tashkeel.
 *
 * Observed base-letter forms (alquran.cloud quran-uthmani):
 *   بسم (628,633,645)  ٱلله (671,644,644,647)
 *   ٱلرحمن (671,644,631,62d,645,646)  ٱلرحيم (671,644,631,62d,64a,645)
 */
const BISMILLAH_BASE = /^بسم\s+ٱلله\s+ٱلرحمن\s+ٱلرحيم(?=\s|$)/;

const TASHKEEL =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

function stripLeadingBismillah(text: string): string {
  const stripped = text.replace(TASHKEEL, "");
  if (!BISMILLAH_BASE.test(stripped)) return text;
  // Cut in the original at the char where the stripped prefix ends.
  const strippedPrefixLen = stripped.split(/\s/).slice(0, 4).join(" ").length;
  let originalIndex = 0;
  let seen = 0;
  while (originalIndex < text.length && seen < strippedPrefixLen) {
    const char = text[originalIndex];
    const isMark = char !== char.replace(TASHKEEL, "");
    if (!isMark) seen += 1;
    originalIndex += 1;
  }
  // Swallow combining marks and whitespace right after the bismillah
  // (e.g. the kasra that belongs to the final meem of ٱلرَّحِيمِ).
  while (
    originalIndex < text.length &&
    (/\s/.test(text[originalIndex]) ||
      text[originalIndex] !== text[originalIndex].replace(TASHKEEL, ""))
  ) {
    originalIndex += 1;
  }
  return text.slice(originalIndex).trim();
}

// ---------------------------------------------------------------------------
// Chapters
// ---------------------------------------------------------------------------

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
 * Chapter → page ranges from quran.com (immutable data). Powers the
 * "الأجزاء / الصفحات" pickers: a juz is pages (juz-1)*20+1 .. juz*20 (approx.),
 * and a page maps to the surah that contains it.
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

// ---------------------------------------------------------------------------
// Surah with verses
// ---------------------------------------------------------------------------

function mapVerse(raw: JsonRecord, index: number, surahId: number): QuranVerse {
  const verseNumber = Number(raw.numberInSurah) || index + 1;
  let text = String(raw.text ?? "").trim();
  // alquran.cloud merges bismillah into ayah 1 of every surah except
  // Al-Fatihah (1) and At-Tawbah (9) — strip it so the reader can render its
  // own decorative bismillah banner, exactly like the server used to.
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
  return { ...chapter, verses };
}

/**
 * Whole-juz fetch — REAL juz boundaries from the same alquran.cloud source
 * (each ayah carries its juz/page), not a page-range approximation. Used by
 * the "الأجزاء" tab: pick a juz → see its actual surah ranges + read its verses.
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
      // Bismillah only ever merges into ayah 1 of a surah, and /juz chunks
      // start mid-surah (except juz 1), so ayah 1 of Fatihah/Tawbah is the
      // only case needing preservation — handled here explicitly.
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

// ---------------------------------------------------------------------------
// Chapter audio (reciter 7 = Mishary Alafasy)
// ---------------------------------------------------------------------------

export async function fetchQuranAudio(surahId: number): Promise<QuranAudio> {
  const payload = await fetchJson<{ audio_file?: unknown }>(
    `${QURAN_COM_API}/chapter_recitations/${RECITER_ID}/${surahId}`,
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
    reciter: RECITER_NAME,
    format: String(audioFile.format ?? "mp3"),
  };
}

/**
 * تقسيم آيات سورة إلى صفحات مصحف حقيقية (verse.page من alquran.cloud) —
 * دالة نقية مُصدَّرة لتُختبر مباشرة (الكهف/الإخلاص/البقرة/التوبة) وتُستهلك
 * من القارئ؛ أي آية بلا page صالح تُرمى بمكان مؤكد بدل صفحة وهمية 0.
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

// ---------------------------------------------------------------------------
// الترتيب القانوني: سورة + آية (التنقّل) — الصفحات للعرض فقط.
// ---------------------------------------------------------------------------

/**
 * عدد آيات السور الـ114 بالترتيب المصحفي الثابت (بيانات معيارية غير قابلة
 * للتغيير — لا تعتمد على أي طلب شبكة). يُستخدم لحساب الآية التالية/السابقة
 * عبر حدود السور دون تخطي أي آية.
 */
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

/**
 * الآية التالية في الترتيب القانوني: سورة:آية → سورة:آية+1، وعند آخر آية
 * في السورة → الآية 1 من السورة التالية؛ آخر آية في القرآن (114:6) → null.
 */
export function nextAyahPosition(pos: AyahPosition): AyahPosition | null {
  const { surah, ayah } = pos;
  if (surah < 1 || surah > 114 || ayah < 1 || ayah > ayahCountOf(surah)) return null;
  if (ayah < ayahCountOf(surah)) return { surah, ayah: ayah + 1 };
  if (surah < 114) return { surah: surah + 1, ayah: 1 };
  return null;
}

/**
 * الآية السابقة في الترتيب القانوني: سورة:آية → سورة:آية-1، وعند الآية 1
 * → آخر آية من السورة السابقة؛ أول آية في القرآن (1:1) → null.
 */
export function prevAyahPosition(pos: AyahPosition): AyahPosition | null {
  const { surah, ayah } = pos;
  if (surah < 1 || surah > 114 || ayah < 1 || ayah > ayahCountOf(surah)) return null;
  if (ayah > 1) return { surah, ayah: ayah - 1 };
  if (surah > 1) return { surah: surah - 1, ayah: ayahCountOf(surah - 1) };
  return null;
}

/**
 * تسطيح سورة في مسار المصحف المتصل: تُدمج صفحات السورة (verse.page الحقيقي)
 * مع صفحات السور السابقة المحفوظة — أرقام الصفحات هي المرجع الوحيد للعرض،
 * والترتيب سورة:آية للتنقّل. الدالة نقية ومُختبرة (البقرة = 48 صفحة...).
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
    // الترتيب داخل الصفحة: قانوني (سورة، آية) — الصفحة الواحدة قد تحوي نهاية
    // سورة وبداية التي تليها (مثل 604: الإخلاص ثم الفلق)، وترتيب verseNumber
    // وحده كان سيخلطهما (112:1 ثم 113:1 ثم 112:2...).
    group.verses.sort((a, b) => {
      const [as, aa] = a.verseKey.split(":");
      const [bs, ba] = b.verseKey.split(":");
      return Number(as) * 1000 + Number(aa) - (Number(bs) * 1000 + Number(ba));
    });
  }
  return [...merged.values()].sort((a, b) => a.page - b.page);
}

/**
 * صوت آية واحدة (نفس القارئ الافتراضي) — /recitations/{id}/by_ayah/{key}
 * يعيد مسارًا نسبيًا مثل "Alafasy/mp3/002255.mp3" يُبنى فوق
 * audio.qurancdn.com (مُتحقق حيًا 2026-09). المسارات المطلقة تُمرر كما هي.
 */
export async function fetchAyahAudio(
  surahId: number,
  ayahNumber: number,
): Promise<QuranAudio> {
  const verseKey = `${surahId}:${ayahNumber}`;
  const payload = await fetchJson<{ audio_files?: unknown }>(
    `${QURAN_COM_API}/recitations/${RECITER_ID}/by_ayah/${encodeURIComponent(verseKey)}`,
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
  return { surahId, audioUrl, reciter: RECITER_NAME, format: "mp3" };
}

// ---------------------------------------------------------------------------
// Tafsir (alquran.cloud edition ar.muyassar — التفسير الميسّر)
// ---------------------------------------------------------------------------

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
    // edition.name is the Arabic title ("تفسير المیسر"); englishName is the
    // publisher ("King Fahad Quran Complex") which reads wrong in the UI.
    resourceName: String(edition.name ?? "التفسير الميسّر"),
    text: String(data.text ?? ""),
  };
}
