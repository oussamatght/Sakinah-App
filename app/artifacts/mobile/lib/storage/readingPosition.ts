import { readJson, storageKeys, writeJson } from "./client";

/**
 * Reading-position persistence — saved automatically (no user action) every
 * time the quran-reader mounts a surah or the user scrolls/taps to a verse.
 * The home "أكمل وردك" card reads this to offer a resume shortcut.
 */

export type ReadingPosition = {
  surahId: number;
  surahName?: string;
  ayahNumber: number;
  /** رقم صفحة المصحف المعروضة (اختياري للتوافق مع السجلات القديمة). */
  pageNum?: number;
  updatedAt: string; // ISO
};

export async function getReadingPosition(): Promise<ReadingPosition | null> {
  return readJson<ReadingPosition>(storageKeys.readingPosition);
}

/** Fire-and-forget; call from quran-reader effects (never awaited by UI). */
export async function saveReadingPosition(
  position: Omit<ReadingPosition, "updatedAt">,
): Promise<void> {
  await writeJson(storageKeys.readingPosition, {
    ...position,
    updatedAt: new Date().toISOString(),
  });
}

export async function clearReadingPosition(): Promise<void> {
  await writeJson(storageKeys.readingPosition, null);
}
