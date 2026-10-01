/** Prayer times — api.aladhan.com/v1 بلا مصادقة، method 3 (Muslim World League). */

import { fetchJson, isJsonRecord, type JsonRecord } from "./http";
import type { PrayerTimesResult } from "./types";

const ALADHAN_API = "https://api.aladhan.com/v1";

function todayForApi(): string {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}`;
}

export async function fetchPrayerTimes(
  latitude: number,
  longitude: number,
  date?: string,
): Promise<PrayerTimesResult> {
  const effectiveDate = date ?? todayForApi();
  const payload = await fetchJson<{ data?: unknown }>(
    `${ALADHAN_API}/timings/${encodeURIComponent(effectiveDate)}?latitude=${latitude}&longitude=${longitude}&method=3`,
    "مواقيت الصلاة",
    { timeoutMs: 20_000 },
  );
  const data = isJsonRecord(payload.data) ? payload.data : {};
  const apiDate = isJsonRecord(data.date) ? data.date : {};
  const hijri = isJsonRecord(apiDate.hijri) ? apiDate.hijri : {};
  const meta = isJsonRecord(data.meta) ? data.meta : {};
  const timings = isJsonRecord(data.timings) ? data.timings : {};
  const stringTimings: Record<string, string> = {};
  for (const [key, value] of Object.entries(timings)) {
    if (typeof value === "string") stringTimings[key] = value;
  }
  return {
    date: String(apiDate.readable ?? effectiveDate),
    hijriDate: String(hijri.date ?? ""),
    timezone: String(meta.timezone ?? "UTC"),
    location: { latitude, longitude },
    timings: stringTimings,
  };
}
