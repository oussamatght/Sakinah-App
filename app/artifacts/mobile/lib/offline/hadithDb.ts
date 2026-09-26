/**
 * Web stub for the offline hadith cache.
 *
 * Metro resolves this file on web (platform extension) so expo-sqlite's
 * native/WASM entry is never pulled into the web bundle. The native build
 * uses hadithDb.native.ts instead. On web, hadith caching is disabled and
 * the app stays online-only (same policy as the Quran offline store).
 */

import type { HadithItem } from "@/lib/api/types";

export function storeHadith(_item: HadithItem): void {
  // No local store on web.
}

export function storeHadiths(_items: HadithItem[]): void {
  // No local store on web.
}

export function getOfflineHadith(_id: string): HadithItem | null {
  return null;
}

export function getOfflineHadiths(_limit?: number): HadithItem[] {
  return [];
}

export function offlineHadithCount(): number {
  return 0;
}
