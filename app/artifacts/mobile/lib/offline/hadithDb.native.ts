import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";
import type { HadithItem } from "@/lib/api/types";

/**
 * Offline hadith cache (Task 7) — same SQLite file as the Quran store, sync
 * single-row point reads/writes only (fast, UI-safe).
 *
 * Strategy: NOT a full-database download (the nine books are millions of
 * characters) but an accumulative cache — every browsed or favorited hadith is
 * upserted so previously-seen content stays readable offline. Favorites are
 * always persisted (the favorites module itself lives in AsyncStorage; this
 * cache makes their full text available offline).
 */

const DB_NAME = "sakinah-quran.db";

let dbInstance: SQLiteDatabase | null = null;

function getDb(): SQLiteDatabase | null {
  if (dbInstance) return dbInstance;
  try {
    dbInstance = openDatabaseSync(DB_NAME);
    dbInstance.execSync(`
      CREATE TABLE IF NOT EXISTS hadiths (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        book TEXT NOT NULL,
        reference TEXT NOT NULL,
        grade TEXT,
        attribution TEXT,
        cachedAt TEXT NOT NULL
      );
    `);
    return dbInstance;
  } catch {
    return null;
  }
}

export function storeHadith(item: HadithItem): void {
  const db = getDb();
  if (!db || !item.id || !item.text) return;
  try {
    db.runSync(
      "INSERT OR REPLACE INTO hadiths (id, text, book, reference, grade, attribution, cachedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      item.id,
      item.text,
      item.book,
      item.reference,
      item.grade ?? null,
      item.attribution ?? null,
      new Date().toISOString(),
    );
  } catch {
    // Cache write failures are non-fatal by design.
  }
}

export function storeHadiths(items: HadithItem[]): void {
  for (const item of items) storeHadith(item);
}

export function getOfflineHadith(id: string): HadithItem | null {
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.getFirstSync<{
      id: string;
      text: string;
      book: string;
      reference: string;
      grade: string | null;
      attribution: string | null;
    }>(
      "SELECT id, text, book, reference, grade, attribution FROM hadiths WHERE id = ?",
      id,
    );
    if (!row) return null;
    return {
      id: row.id,
      text: row.text,
      book: row.book,
      reference: row.reference,
      ...(row.grade ? { grade: row.grade } : {}),
      ...(row.attribution ? { attribution: row.attribution } : {}),
    };
  } catch {
    return null;
  }
}

/** Every hadith cached (bounded — the cache grows by browsing only). */
export function getOfflineHadiths(limit = 200): HadithItem[] {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = db.getAllSync<{
      id: string;
      text: string;
      book: string;
      reference: string;
      grade: string | null;
      attribution: string | null;
    }>(
      "SELECT id, text, book, reference, grade, attribution FROM hadiths ORDER BY cachedAt DESC LIMIT ?",
      limit,
    );
    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      book: row.book,
      reference: row.reference,
      ...(row.grade ? { grade: row.grade } : {}),
      ...(row.attribution ? { attribution: row.attribution } : {}),
    }));
  } catch {
    return [];
  }
}

export function offlineHadithCount(): number {
  const db = getDb();
  if (!db) return 0;
  try {
    const row = db.getFirstSync<{ total: number }>(
      "SELECT COUNT(*) as total FROM hadiths",
    );
    return row?.total ?? 0;
  } catch {
    return 0;
  }
}
