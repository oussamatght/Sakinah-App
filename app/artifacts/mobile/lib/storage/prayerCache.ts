import { readJson, storageKeys, writeJson } from "./client";

/**
 * Last-known prayer times — stored after every successful Aladhan fetch, so
 * offline screens show them with a notice instead of an empty/error screen.
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
