/**
 * Web stub for the offline Quran store.
 *
 * expo-sqlite's web build needs a wa-sqlite WASM asset that isn't shipped
 * (Metro resolves `expo-sqlite/web/worker.ts` on web and fails on the missing
 * .wasm). Rather than bundling WASM for web, the offline download feature is
 * native-only; the web app stays online-only and everything else keeps
 * working. Metro picks this file over quranDb.native.ts via platform
 * extensions.
 */

import type {
  QuranAudio,
  QuranChapter,
  QuranJuz,
  QuranSurah,
  QuranTafsir,
} from "@/lib/api/types";

export type DownloadState = {
  downloadedAt: string | null;
  ayahCount: number;
  tafsirCount: number;
  surahAudioCount: number;
  audioReciterId: number | null;
};

export type DownloadProgress = {
  phase: "chapters" | "surahs" | "tafsir" | "audio";
  done: number;
  total: number;
  percent: number;
};

export type DownloadMediaOptions = {
  includeTafsir?: boolean;
  includeAudio?: boolean;
  reciterId?: number;
  fetchSurahAudio?: (surahId: number, reciterId: number) => Promise<QuranAudio>;
  fetchTafsir?: (surahId: number, ayahNumber: number) => Promise<QuranTafsir>;
};

export function getOfflineQuranState(): DownloadState {
  return { downloadedAt: null, ayahCount: 0, tafsirCount: 0, surahAudioCount: 0, audioReciterId: null };
}

export function isQuranDownloaded(): boolean {
  return false;
}

export async function downloadQuran(
  _fetchSurah: (surahId: number) => Promise<QuranSurah>,
  _fetchChapters: () => Promise<QuranChapter[]>,
  _onProgress?: (progress: DownloadProgress) => void,
  _media?: DownloadMediaOptions,
): Promise<{ ayahCount: number }> {
  throw new Error("التنزيل بدون إنترنت متاح على تطبيق الهاتف فقط");
}

export async function downloadQuranSurah(
  _surahId: number,
  _fetchSurah: (surahId: number) => Promise<QuranSurah>,
  _fetchChapters: () => Promise<QuranChapter[]>,
  _onProgress?: (progress: DownloadProgress) => void,
  _media?: DownloadMediaOptions,
): Promise<{ ayahCount: number }> {
  throw new Error("التنزيل بدون إنترنت متاح على تطبيق الهاتف فقط");
}

export function getLocalChapters(): QuranChapter[] | null {
  return null;
}

export function getLocalSurah(_surahId: number): QuranSurah | null {
  return null;
}

export type LocalQuranVerseHit = {
  surahId: number;
  surah: string;
  ayah: number;
  page: number;
  text: string;
};

export function searchLocalQuranVerses(_query: string, _limit?: number): LocalQuranVerseHit[] {
  // No local store on web — verse search needs downloaded chapters.
  return [];
}

export function storeLocalSurah(_surah: QuranSurah): void {
  // No local store on web.
}

export function getLocalJuz(_juz: number): QuranJuz | null {
  return null;
}

export function getLocalTafsir(
  _surahId: number,
  _ayahNumber: number,
): QuranTafsir | null {
  return null;
}

export function storeLocalTafsir(_tafsir: QuranTafsir): void {
  // No local store on web.
}

export async function downloadQuranAudioFile(
  _surahId: number,
  _reciterId: number,
  _url: string,
): Promise<string> {
  throw new Error("التنزيل بدون إنترنت متاح على تطبيق الهاتف فقط");
}

export function getQuranAudioLocalUri(
  _surahId: number,
  _reciterId: number,
): string | null {
  return null;
}

export function getLocalSurahAudio(
  _surahId: number,
  _reciterId: number,
): QuranAudio | null {
  return null;
}

export function storeLocalSurahAudio(
  _surahId: number,
  _reciterId: number,
  _audio: QuranAudio,
): void {
  // No local store on web.
}

export function offlineSupported(): boolean {
  return false;
}