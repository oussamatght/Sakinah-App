import { Platform } from "react-native";
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";
import type {
  QuranChapter,
  QuranJuz,
  QuranSurah,
  QuranTafsir,
  QuranVerse,
} from "@/lib/api/types";

/**
 * Offline Quran store (Task 5 — native) — SQLite via expo-sqlite.
 *
 * Import point (verified against node_modules/expo-sqlite/build):
 *   index.d.ts re-exports ./SQLiteDatabase, which declares both
 *   openDatabaseSync (l.358) and openDatabaseAsync (l.348). So
 *   `import { openDatabaseSync } from 'expo-sqlite'` is the correct import.
 *
 * Sync vs Async policy:
 *   - *Sync: fast point reads (one surah / one ayah / one tafsir row) — safe
 *     because they touch a handful of indexed rows.
 *   - *Async: the initial 114-surah download (thousands of inserts + network
 *     batches) so the JS thread stays responsive and progress updates render.
 *
 * Resume semantics: each surah is committed in its own async transaction and
 * recorded in meta('quran.surah.'+id). An interrupted download skips surahs
 * already stored and continues where it stopped.
 *
 * Schema (surahId+number PK, index on juz; chapters carry the page ranges):
 *   chapters(id, nameArabic, nameEnglish, revelationPlace, versesCount)
 *   verses(surahId, number, text, juz, page)
 *   tafsir(surahId, ayahNumber, resourceName, text) — on-demand cache
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

// ---------------------------------------------------------------------------
// Download state
// ---------------------------------------------------------------------------

export type DownloadState = {
  downloadedAt: string | null;
  ayahCount: number;
};

export function getOfflineQuranState(): DownloadState {
  const db = getDb();
  if (!db) return { downloadedAt: null, ayahCount: 0 };
  try {
    const row = db.getFirstSync<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'quran.downloadedAt'",
    );
    const count = db.getFirstSync<{ total: number }>(
      "SELECT COUNT(*) as total FROM verses",
    );
    return { downloadedAt: row?.value ?? null, ayahCount: count?.total ?? 0 };
  } catch {
    return { downloadedAt: null, ayahCount: 0 };
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

// ---------------------------------------------------------------------------
// Download — surahs fetched from the SAME providers the app already uses
// ---------------------------------------------------------------------------

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
  /** Stored surahs after the current batch (drives "سورة X من 114"). */
  done: number;
  total: number;
  /** Overall percentage including the current batch midpoint. */
  percent: number;
};

/**
 * Downloads the whole Quran (chapters + 114 Uthmani surahs) using the ASYNC
 * API end-to-end. Surahs are fetched in small parallel batches; each batch is
 * committed with withTransactionAsync, and each stored surah is marked in
 * meta so an interrupted download resumes instead of restarting.
 */
export async function downloadQuran(
  fetchSurah: (surahId: number) => Promise<QuranSurah>,
  fetchChapters: () => Promise<QuranChapter[]>,
  onProgress?: (progress: DownloadProgress) => void,
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
    // Network first (parallel), then one async transaction per batch.
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
      done,
      total: 114,
      percent: Math.round((done / 114) * 100),
    });
  }

  await db.runAsync(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('quran.downloadedAt', ?)",
    new Date().toISOString(),
  );
  return { ayahCount };
}

// ---------------------------------------------------------------------------
// Local reads — SYNC (fast point reads), same shapes the API fetchers return
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tafsir on-demand cache (fetch → store → read offline afterwards)
// ---------------------------------------------------------------------------

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

/** True on native, where the SQLite store is available. */
export function offlineSupported(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}
