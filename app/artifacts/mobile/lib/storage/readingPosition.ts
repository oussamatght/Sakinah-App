import { readJson, storageKeys, writeJson } from "./client";

// Reading-position persistence — saved automatically (no user action) on every
// surah mount or verse tap; the home continue-reading card reads it for resume.

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
