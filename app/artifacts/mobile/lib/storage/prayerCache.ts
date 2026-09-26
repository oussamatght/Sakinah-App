import { readJson, storageKeys, writeJson } from "./client";

/**
 * Last-known prayer times (Task 8). Stored after EVERY successful Aladhan
 * fetch. When offline, screens show this instead of an error, with a clear
 * "آخر مواقيت محفوظة" notice — never an empty/error screen.
 */

export type CachedPrayerTimes = {
  timings: Record<string, string>;
  hijriDate: string;
  date: string;
  location: { latitude: number; longitude: number };
  /** ISO timestamp of when it was fetched. */
  cachedAt: string;
};

export async function savePrayerTimesCache(
  cache: CachedPrayerTimes,
): Promise<void> {
  await writeJson(storageKeys.prayerTimes, cache);
}

export async function getPrayerTimesCache(): Promise<CachedPrayerTimes | null> {
  return readJson<CachedPrayerTimes>(storageKeys.prayerTimes);
}
