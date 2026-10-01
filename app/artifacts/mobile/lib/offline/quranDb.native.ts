import { Platform } from "react-native";
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";
import { Directory, File, Paths } from "expo-file-system";
import type {
  QuranAudio,
  QuranChapter,
  QuranJuz,
  QuranSurah,
  QuranTafsir,
  QuranVerse,
} from "@/lib/api/types";

/**
 * Offline Quran store (Task 5 — native) — SQLite via expo-sqlite. Metro picks
 * the web stub (quranDb.ts) over this file, so offline is native-only.
 *
 * Import: openDatabaseSync is the correct one — expo-sqlite's index.d.ts
 * re-exports ./SQLiteDatabase which declares both openDatabaseSync (l.358) and
 * openDatabaseAsync (l.348) (verified against node_modules/expo-sqlite/build).
 * *Sync only for fast point reads (a few indexed rows); *Async for the initial
 * 114-surah download (thousands of inserts + network batches) so the JS thread
 * stays responsive and progress updates render.
 *
 * Resume semantics: each surah is committed in its own async transaction and
 * recorded in meta('quran.surah.'+id), so an interrupted download skips stored
 * surahs and continues where it stopped.
 *
 * Schema: chapters(id, nameArabic, nameEnglish, revelationPlace, versesCount);
 *   verses(surahId+number PK, juz indexed, page) — chapters carry page ranges;
 *   tafsir(surahId, ayahNumber, resourceName, text) — on-demand cache + full download;
 *   surah_audio(surahId, reciterId, url, reciter, format) — whole-surah mp3 of the
 *     selected reciter; the file lives in document/surah-audio/ (expo-file-system)
 *     and the reader prefers it when present (true offline).
 */

const DB_NAME = "sakinah-quran.db";

let dbInstance: SQLiteDatabase | null = null;

function getDb(): SQLiteDatabase | null {
  if (dbInstance) return dbInstance;
  try {
    dbInstance = openDatabaseSync(DB_NAME);
    dbInstance.execSync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS chapters (
        id INTEGER PRIMARY KEY,
        nameArabic TEXT NOT NULL,
        nameEnglish TEXT NOT NULL,
        revelationPlace TEXT NOT NULL,
        versesCount INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS verses (
        surahId INTEGER NOT NULL,
        number INTEGER NOT NULL,
        text TEXT NOT NULL,
        juz INTEGER NOT NULL,
        page INTEGER NOT NULL,
        PRIMARY KEY (surahId, number)
      );
      CREATE INDEX IF NOT EXISTS idx_verses_surah ON verses(surahId);
      CREATE INDEX IF NOT EXISTS idx_verses_juz ON verses(juz);
      CREATE TABLE IF NOT EXISTS tafsir (
        surahId INTEGER NOT NULL,
        ayahNumber INTEGER NOT NULL,
        resourceName TEXT NOT NULL,
        text TEXT NOT NULL,
        PRIMARY KEY (surahId, ayahNumber)
      );
      CREATE TABLE IF NOT EXISTS surah_audio (
        surahId INTEGER NOT NULL,
        reciterId INTEGER NOT NULL,
        url TEXT NOT NULL,
        reciter TEXT NOT NULL,
        format TEXT NOT NULL,
        PRIMARY KEY (surahId, reciterId)
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    return dbInstance;
  } catch {
    // Native module unavailable (e.g. tests) — degrade to online-only mode.
    return null;
  }
}

export type DownloadState = {
  downloadedAt: string | null;
  ayahCount: number;
  tafsirCount: number;
  surahAudioCount: number;
  audioReciterId: number | null;
};

export function getOfflineQuranState(): DownloadState {
  const db = getDb();
  if (!db) return { downloadedAt: null, ayahCount: 0, tafsirCount: 0, surahAudioCount: 0, audioReciterId: null };
  try {
    const row = db.getFirstSync<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'quran.downloadedAt'",
    );
    const count = db.getFirstSync<{ total: number }>(
      "SELECT COUNT(*) as total FROM verses",
    );
    const tafsirTotal = db.getFirstSync<{ total: number }>(
      "SELECT COUNT(*) as total FROM tafsir",
    );
    const audioTotal = db.getFirstSync<{ total: number }>(
      "SELECT COUNT(DISTINCT surahId) as total FROM surah_audio",
    );
    const audioReciter = db.getFirstSync<{ reciterId: number }>(
      "SELECT reciterId FROM surah_audio LIMIT 1",
    );
    return {
      downloadedAt: row?.value ?? null,
      ayahCount: count?.total ?? 0,
      tafsirCount: tafsirTotal?.total ?? 0,
      surahAudioCount: audioTotal?.total ?? 0,
      audioReciterId: audioReciter?.reciterId ?? null,
    };
  } catch {
    return { downloadedAt: null, ayahCount: 0, tafsirCount: 0, surahAudioCount: 0, audioReciterId: null };
  }
}

/** How many surahs are fully stored so far (resume UI). */
export function getStoredSurahCount(): number {
  const db = getDb();
  if (!db) return 0;
  try {
    const row = db.getFirstSync<{ total: number }>(
      "SELECT COUNT(*) as total FROM meta WHERE key LIKE 'quran.surah.%'",
    );
    return row?.total ?? 0;
  } catch {
    return 0;
  }
}

export function isQuranDownloaded(): boolean {
  const state = getOfflineQuranState();
  return state.downloadedAt !== null && state.ayahCount >= 6230;
}

// Surahs are fetched from the SAME providers the app already uses.

/** Bismillah stripping — duplicated from lib/api/quran.ts (see that file). */
const BISMILLAH_BASE = /^بسم\s+ٱلله\s+ٱلرحمن\s+ٱلرحيم(?=\s|$)/;
const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

function stripLeadingBismillah(text: string): string {
  const stripped = text.replace(TASHKEEL, "");
  if (!BISMILLAH_BASE.test(stripped)) return text;
  const strippedPrefixLen = stripped.split(/\s/).slice(0, 4).join(" ").length;
  let originalIndex = 0;
  let seen = 0;
  while (originalIndex < text.length && seen < strippedPrefixLen) {
    const char = text[originalIndex];
    if (char !== char.replace(TASHKEEL, "")) seen += 1;
    originalIndex += 1;
  }
  while (
    originalIndex < text.length &&
    (/\s/.test(text[originalIndex]) ||
      text[originalIndex] !== text[originalIndex].replace(TASHKEEL, ""))
  ) {
    originalIndex += 1;
  }
  return text.slice(originalIndex).trim();
}

export type DownloadProgress = {
  /** المرحلة الحالية تُعرض في الشاشة (chapters → surahs → tafsir → audio). */
  phase: "chapters" | "surahs" | "tafsir" | "audio";
  /** المنجز/الإجمالي داخل المرحلة؛ percent = النسبة شاملة منتصف المرحلة. */
  done: number;
  total: number;
  percent: number;
};

/**
 * وسائط اختيارية بعد النص: includeTafsir يحمل تفسير كل آية في جدول tafsir،
 * وincludeAudio يحمل صوت السور (ملف لكل سورة) في document/surah-audio/ ثم
 * جدول surah_audio (تشغيل بدون إنترنت).
 */
export type DownloadMediaOptions = {
  includeTafsir?: boolean;
  includeAudio?: boolean;
  reciterId?: number;
  fetchSurahAudio?: (surahId: number, reciterId: number) => Promise<QuranAudio>;
  fetchTafsir?: (surahId: number, ayahNumber: number) => Promise<QuranTafsir>;
};

/**
 * Downloads the whole Quran (chapters + 114 Uthmani surahs) end-to-end via the
 * ASYNC API: small parallel batches, each committed with withTransactionAsync
 * and marked in meta so an interrupted download resumes; optional media phases
 * follow, skipping rows already stored locally.
 */
export async function downloadQuran(
  fetchSurah: (surahId: number) => Promise<QuranSurah>,
  fetchChapters: () => Promise<QuranChapter[]>,
  onProgress?: (progress: DownloadProgress) => void,
  media?: DownloadMediaOptions,
): Promise<{ ayahCount: number }> {
  const db = getDb();
  if (!db) throw new Error("التخزين المحلي غير متاح على هذا الجهاز");

  // 1) Chapters list (single small table — sync-safe size, but run async).
  const chapters = await fetchChapters();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM chapters");
    for (const chapter of chapters) {
      await db.runAsync(
        "INSERT OR REPLACE INTO chapters (id, nameArabic, nameEnglish, revelationPlace, versesCount) VALUES (?, ?, ?, ?, ?)",
        chapter.id,
        chapter.nameArabic,
        chapter.nameEnglish,
        chapter.revelationPlace,
        chapter.versesCount,
      );
    }
  });

  // 2) Surahs in parallel batches, committed per batch (resume-safe).
  const stored = new Set(
    (
      await db.getAllAsync<{ key: string }>(
        "SELECT key FROM meta WHERE key LIKE 'quran.surah.%'",
      )
    ).map((row) => Number(row.key.slice("quran.surah.".length))),
  );

  const pending: number[] = [];
  for (let surahId = 1; surahId <= 114; surahId += 1) {
    if (!stored.has(surahId)) pending.push(surahId);
  }

  const BATCH = 6;
  let ayahCount =
    getOfflineQuranState().ayahCount - (stored.size === 114 ? 0 : 0);
  let done = stored.size;

  for (let start = 0; start < pending.length; start += BATCH) {
    const batchIds = pending.slice(start, start + BATCH);
    // Network first (parallel), then one transaction per batch.
    const surahs = await Promise.all(batchIds.map((id) => fetchSurah(id)));
    await db.withTransactionAsync(async () => {
      for (const surah of surahs) {
        for (const verse of surah.verses) {
          const text =
            verse.verseNumber === 1 && surah.id !== 1 && surah.id !== 9
              ? stripLeadingBismillah(verse.text)
              : verse.text;
          await db.runAsync(
            "INSERT OR REPLACE INTO verses (surahId, number, text, juz, page) VALUES (?, ?, ?, ?, ?)",
            surah.id,
            verse.verseNumber,
            text,
            verse.juz,
            verse.page,
          );
        }
        await db.runAsync(
          "INSERT OR REPLACE INTO meta (key, value) VALUES (?, '1')",
          `quran.surah.${surah.id}`,
        );
        ayahCount += surah.verses.length;
        done += 1;
      }
    });
    onProgress?.({
      phase: "surahs",
      done,
      total: 114,
      percent: Math.round((done / 114) * 100),
    });
  }

  await db.runAsync(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('quran.downloadedAt', ?)",
    new Date().toISOString(),
  );

  // 3) Whole-surah audio for the selected reciter (offline mp3 files).
  if (media?.includeAudio && media.fetchSurahAudio && media.reciterId) {
    const reciterId = Math.round(media.reciterId);
    let audioDone = 0;
    for (let surahId = 1; surahId <= 114; surahId += 1) {
      const existing = getLocalSurahAudio(surahId, reciterId);
      const existingFile = existing ? getQuranAudioLocalUri(surahId, reciterId) : null;
      if (!existing || !existingFile) {
        try {
          const audio = await media.fetchSurahAudio(surahId, reciterId);
          await downloadQuranAudioFile(surahId, reciterId, audio.audioUrl);
          storeLocalSurahAudio(surahId, reciterId, audio);
        } catch {
          // سورة واحدة فشلت لا تُوقف الباقي — يمكن إعادة المحاولة لاحقًا.
        }
      }
      audioDone += 1;
      onProgress?.({
        phase: "audio",
        done: audioDone,
        total: 114,
        percent: Math.round((audioDone / 114) * 100),
      });
    }
  }

  // 4) Full tafsir for every ayah (ar.muyassar), skipping stored rows.
  if (media?.includeTafsir && media.fetchTafsir) {
    const counts = new Map(chapters.map((c) => [c.id, c.versesCount]));
    const TOTAL_AYAHS = 6236;
    let tafsirDone = 0;
    for (let surahId = 1; surahId <= 114; surahId += 1) {
      const versesCount = counts.get(surahId) ?? 0;
      for (let ayah = 1; ayah <= versesCount; ayah += 1) {
        if (getLocalTafsir(surahId, ayah)) {
          tafsirDone += 1;
          continue;
        }
        try {
          const tafsir = await media.fetchTafsir(surahId, ayah);
          storeLocalTafsir(tafsir);
        } catch {
          // آية واحدة فشلت — تُترك فارغة ويُعاد التحميل لاحقًا.
        }
        tafsirDone += 1;
      }
      onProgress?.({
        phase: "tafsir",
        done: tafsirDone,
        total: TOTAL_AYAHS,
        percent: Math.round((tafsirDone / TOTAL_AYAHS) * 100),
      });
    }
  }

  return { ayahCount };
}

/**
 * تنزيل سورة واحدة للاستخدام بدون إنترنت: نصها دائمًا، وباختيار المستخدم تفسير
 * آياتها وصوتها mp3 للقارئ المحدد — بنفس مسارات التخزين، وكل قطعة موجودة محليًا
 * تُتخطى (قابل للاستئناف). لا يلمس quran.downloadedAt فلا تُعتبر المصحف كاملة.
 */
export async function downloadQuranSurah(
  surahId: number,
  fetchSurah: (id: number) => Promise<QuranSurah>,
  fetchChapters: () => Promise<QuranChapter[]>,
  onProgress?: (progress: DownloadProgress) => void,
  media?: DownloadMediaOptions,
): Promise<{ ayahCount: number }> {
  const db = getDb();
  if (!db) throw new Error("التخزين المحلي غير متاح على هذا الجهاز");

  const surah = await fetchSurah(surahId);
  onProgress?.({ phase: "surahs", done: 0, total: 1, percent: 0 });
  storeLocalSurah(surah);
  onProgress?.({ phase: "surahs", done: 1, total: 1, percent: 100 });

  const reciterId = media?.reciterId ? Math.round(media.reciterId) : null;
  if (media?.includeAudio && media.fetchSurahAudio && reciterId) {
    const existing = getLocalSurahAudio(surahId, reciterId);
    const existingFile = existing ? getQuranAudioLocalUri(surahId, reciterId) : null;
    onProgress?.({ phase: "audio", done: 0, total: 1, percent: 0 });
    if (!existing || !existingFile) {
      try {
        const audio = await media.fetchSurahAudio(surahId, reciterId);
        await downloadQuranAudioFile(surahId, reciterId, audio.audioUrl);
        storeLocalSurahAudio(surahId, reciterId, audio);
      } catch {
        // فشل صوت السورة لا يمنع حفظ نصّها — يُعاد لاحقًا.
      }
    }
    onProgress?.({ phase: "audio", done: 1, total: 1, percent: 100 });
  }

  if (media?.includeTafsir && media.fetchTafsir) {
    const count = Math.max(surah.verses.length, 1);
    let tafsirDone = 0;
    onProgress?.({ phase: "tafsir", done: 0, total: count, percent: 0 });
    for (let ayah = 1; ayah <= count; ayah += 1) {
      if (!getLocalTafsir(surahId, ayah)) {
        try {
          const tafsir = await media.fetchTafsir(surahId, ayah);
          storeLocalTafsir(tafsir);
        } catch {
          // آية واحدة فاشلة تُعاد في محاولة لاحقة — لا تُوقف بقية السورة.
        }
      }
      tafsirDone += 1;
      onProgress?.({
        phase: "tafsir",
        done: tafsirDone,
        total: count,
        percent: Math.round((tafsirDone / count) * 100),
      });
    }
  }

  return { ayahCount: surah.verses.length };
}

// Local reads are SYNC (fast point reads), same shapes the API fetchers return.

/**
 * يحفظ سورة واحدة (نصها + سطر chapters + علامة اكتمال) للتلاوة بدون إنترنت؛
 * آمن للاتصال عدة مرات (INSERT OR REPLACE).
 */
export function storeLocalSurah(surah: QuranSurah): void {
  const db = getDb();
  if (!db) return;
  try {
    db.runSync(
      "INSERT OR REPLACE INTO chapters (id, nameArabic, nameEnglish, revelationPlace, versesCount) VALUES (?, ?, ?, ?, ?)",
      surah.id,
      surah.nameArabic,
      surah.nameEnglish,
      surah.revelationPlace,
      surah.versesCount,
    );
    for (const verse of surah.verses) {
      const text =
        verse.verseNumber === 1 && surah.id !== 1 && surah.id !== 9
          ? stripLeadingBismillah(verse.text)
          : verse.text;
      db.runSync(
        "INSERT OR REPLACE INTO verses (surahId, number, text, juz, page) VALUES (?, ?, ?, ?, ?)",
        surah.id,
        verse.verseNumber,
        text,
        verse.juz,
        verse.page,
      );
    }
    db.runSync(
      "INSERT OR REPLACE INTO meta (key, value) VALUES (?, '1')",
      `quran.surah.${surah.id}`,
    );
  } catch {
    // Storage failures are non-fatal by design.
  }
}

export function getLocalChapters(): QuranChapter[] | null {
  const db = getDb();
  if (!db) return null;
  try {
    const rows = db.getAllSync<{
      id: number;
      nameArabic: string;
      nameEnglish: string;
      revelationPlace: string;
      versesCount: number;
    }>("SELECT * FROM chapters ORDER BY id");
    if (rows.length === 0) return null;
    return rows.map((row) => ({ ...row }));
  } catch {
    return null;
  }
}

export function getLocalSurah(surahId: number): QuranSurah | null {
  const db = getDb();
  if (!db) return null;
  try {
    const chapter = db.getFirstSync<{
      id: number;
      nameArabic: string;
      nameEnglish: string;
      revelationPlace: string;
      versesCount: number;
    }>("SELECT * FROM chapters WHERE id = ?", surahId);
    if (!chapter) return null;
    const rows = db.getAllSync<{
      number: number;
      text: string;
      juz: number;
      page: number;
    }>(
      "SELECT number, text, juz, page FROM verses WHERE surahId = ? ORDER BY number",
      surahId,
    );
    if (rows.length === 0) return null;
    const verses: QuranVerse[] = rows.map((row) => ({
      id: surahId * 1000 + row.number,
      verseNumber: row.number,
      verseKey: `${surahId}:${row.number}`,
      text: row.text,
      juz: row.juz,
      page: row.page,
    }));
    return { ...chapter, verses };
  } catch {
    return null;
  }
}

export type LocalQuranVerseHit = {
  surahId: number;
  surah: string;
  ayah: number;
  page: number;
  text: string;
};

/** Mirrors lib/api/queries.ts normalizeForSearch — plain Arabic, so "الكرسي"
 *  matches "ٱللَّهُ ... وَسِعَ كُرْسِيُّهُ". */
const SEARCH_TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

function normalizeVerseTextForSearch(text: string): string {
  return text
    .replace(SEARCH_TASHKEEL, "")
    .replace(/[ٱأإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

/**
 * بحث نصي مباشر في الآيات المحمَّلة على الجهاز يتجاهل التشكيل والهمزات، وكل
 * كلمة بحث يجب أن تظهر في الآية (وكلمة تبدأ بـ"ال" تُقبل بدون ال — يكفي
 * "كرسيه" لـ"الكرسي"). بالترتيب المصحفي، ويعيد [] على الويب (لا مخزن محلي).
 */
export function searchLocalQuranVerses(query: string, limit = 60): LocalQuranVerseHit[] {
  const db = getDb();
  if (!db) return [];
  const tokens = normalizeVerseTextForSearch(query.trim())
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return [];
  const hits: LocalQuranVerseHit[] = [];

  /**
   * القراءة على دفعات: نافذة SQLite (CursorWindow) ~2 ميغابايت، وجلب كل آيات
   * المصحف دفعة واحدة يُفشل بـ"Row too big to fit into CursorWindow" — لذا
   * 20 سورة لكل دفعة مع توقف فوري عند بلوغ الحد.
   */
  const SURAHS_PER_CHUNK = 20;
  try {
    for (let firstSurah = 1; firstSurah <= 114 && hits.length < limit; firstSurah += SURAHS_PER_CHUNK) {
      const lastSurah = Math.min(114, firstSurah + SURAHS_PER_CHUNK - 1);
      const rows = db.getAllSync<{
        surahId: number;
        number: number;
        page: number;
        text: string;
        nameArabic: string;
      }>(
        `SELECT v.surahId, v.number, v.page, v.text, c.nameArabic
         FROM verses v JOIN chapters c ON c.id = v.surahId
         WHERE v.surahId BETWEEN ? AND ?
         ORDER BY v.surahId, v.number`,
        firstSurah,
        lastSurah,
      );
      for (const row of rows) {
        const normalized = normalizeVerseTextForSearch(row.text);
        let everyToken = true;
        for (const token of tokens) {
          if (normalized.includes(token)) continue;
          const withoutAl = token.length > 2 && token.startsWith("ال") ? token.slice(2) : null;
          if (withoutAl && normalized.includes(withoutAl)) continue;
          everyToken = false;
          break;
        }
        if (!everyToken) continue;
        hits.push({
          surahId: row.surahId,
          surah: row.nameArabic,
          ayah: row.number,
          page: row.page,
          text: row.text,
        });
        if (hits.length >= limit) break;
      }
    }
    return hits;
  } catch {
    return hits;
  }
}

export function getLocalJuz(juz: number): QuranJuz | null {
  const db = getDb();
  if (!db) return null;
  try {
    const rows = db.getAllSync<{
      surahId: number;
      number: number;
      text: string;
      page: number;
      nameArabic: string | null;
    }>(
      `SELECT v.surahId, v.number, v.text, v.page, c.nameArabic
       FROM verses v LEFT JOIN chapters c ON c.id = v.surahId
       WHERE v.juz = ? ORDER BY v.surahId, v.number`,
      juz,
    );
    if (rows.length === 0) return null;
    const ranges = new Map<
      number,
      {
        surahId: number;
        nameArabic: string;
        fromAyah: number;
        toAyah: number;
        startPage: number;
      }
    >();
    for (const row of rows) {
      const existing = ranges.get(row.surahId);
      if (existing) {
        existing.toAyah = row.number;
      } else {
        ranges.set(row.surahId, {
          surahId: row.surahId,
          nameArabic: row.nameArabic ?? `السورة ${row.surahId}`,
          fromAyah: row.number,
          toAyah: row.number,
          startPage: row.page,
        });
      }
    }
    return {
      juz,
      ayahCount: rows.length,
      surahRanges: [...ranges.values()],
      verses: rows.map((row) => ({
        id: row.surahId * 1000 + row.number,
        verseNumber: row.number,
        verseKey: `${row.surahId}:${row.number}`,
        text: row.text,
        juz,
        page: row.page,
      })),
    };
  } catch {
    return null;
  }
}

// Tafsir on-demand cache (fetch → store → read offline afterwards)

export function getLocalTafsir(
  surahId: number,
  ayahNumber: number,
): QuranTafsir | null {
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.getFirstSync<
      { surahId: number; ayahNumber: number; resourceName: string; text: string }
    >(
      "SELECT surahId, ayahNumber, resourceName, text FROM tafsir WHERE surahId = ? AND ayahNumber = ?",
      surahId,
      ayahNumber,
    );
    return row ?? null;
  } catch {
    return null;
  }
}

export function storeLocalTafsir(tafsir: QuranTafsir): void {
  const db = getDb();
  if (!db) return;
  try {
    db.runSync(
      "INSERT OR REPLACE INTO tafsir (surahId, ayahNumber, resourceName, text) VALUES (?, ?, ?, ?)",
      tafsir.surahId,
      tafsir.ayahNumber,
      tafsir.resourceName,
      tafsir.text,
    );
  } catch {
    // Cache write failures are non-fatal by design.
  }
}

// Whole-surah audio for the selected reciter — DB row + real mp3 file
const AUDIO_DIR = "surah-audio";

function audioFileFor(surahId: number, reciterId: number): File {
  return new File(new Directory(Paths.document, AUDIO_DIR), `${reciterId}-${surahId}.mp3`);
}

/** ينزّل mp3 لسورة/قارئ إلى document/surah-audio ويعيد موقعه؛ ملف موجود لا يُعاد تنزيله. */
export async function downloadQuranAudioFile(
  surahId: number,
  reciterId: number,
  url: string,
): Promise<string> {
  const dir = new Directory(Paths.document, AUDIO_DIR);
  if (!dir.exists) dir.create();
  const file = audioFileFor(surahId, reciterId);
  if (file.exists) return file.uri;
  const downloaded = await File.downloadFileAsync(url, file);
  return downloaded.uri;
}

/** المسار المحلي لملف mp3 (إن وُجد) — القراءة به = تشغيل حقيقي بدون إنترنت. */
export function getQuranAudioLocalUri(
  surahId: number,
  reciterId: number,
): string | null {
  try {
    const file = audioFileFor(surahId, reciterId);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

export function getLocalSurahAudio(
  surahId: number,
  reciterId: number,
): QuranAudio | null {
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.getFirstSync<
      { surahId: number; reciterId: number; url: string; reciter: string; format: string }
    >(
      "SELECT surahId, reciterId, url, reciter, format FROM surah_audio WHERE surahId = ? AND reciterId = ?",
      surahId,
      reciterId,
    );
    if (!row) return null;
    return {
      surahId: row.surahId,
      audioUrl: row.url,
      reciter: row.reciter,
      format: row.format,
    };
  } catch {
    return null;
  }
}

export function storeLocalSurahAudio(
  surahId: number,
  reciterId: number,
  audio: QuranAudio,
): void {
  const db = getDb();
  if (!db) return;
  try {
    db.runSync(
      "INSERT OR REPLACE INTO surah_audio (surahId, reciterId, url, reciter, format) VALUES (?, ?, ?, ?, ?)",
      surahId,
      reciterId,
      audio.audioUrl,
      audio.reciter,
      audio.format,
    );
  } catch {
    // Non-fatal: online playback still works.
  }
}

/** True on native, where the SQLite store is available. */
export function offlineSupported(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}
