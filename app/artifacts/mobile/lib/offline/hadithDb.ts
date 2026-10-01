/**
 * Web stub for the offline hadith cache. Metro resolves this file on web
 * (platform extension) so expo-sqlite's native/WASM entry never enters the web
 * bundle; native uses hadithDb.native.ts. On web, hadith caching is disabled
 * and the app stays online-only (same policy as the Quran offline store).
 */

import type { HadithItem } from "@/lib/api/types";

export function storeHadith(_item: HadithItem): void {
}

export function storeHadiths(_items: HadithItem[]): void {
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
