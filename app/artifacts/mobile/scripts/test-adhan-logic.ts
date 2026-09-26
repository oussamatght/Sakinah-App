/** Task-10 logic check: prayer-time parsing for scheduling (no native modules). */
const PRAYERS: Record<string, string> = {
  Fajr: "04:55",
  Dhuhr: "12:20 (EET)", // Aladhan sometimes appends timezone
  Asr: "15:45",
  Maghrib: "18:10",
  Isha: "19:40",
  Sunrise: "06:15", // never scheduled
};

function parseTimeToClock(time: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return Number.isFinite(hour) && Number.isFinite(minute) ? { hour, minute } : null;
}

let ok = true;
const expected: Record<string, string> = {
  Fajr: "4:55",
  Dhuhr: "12:20",
  Asr: "15:45",
  Maghrib: "18:10",
  Isha: "19:40",
};
for (const [key, value] of Object.entries(expected)) {
  const parsed = parseTimeToClock(PRAYERS[key]);
  const label = parsed ? `${parsed.hour}:${String(parsed.minute).padStart(2, "0")}` : "null";
  console.log(`${key} → ${label}`);
  if (label !== value) ok = false;
}
// "12:20 (EET)" must not parse its minute wrong:
const dhuhr = parseTimeToClock(PRAYERS.Dhuhr);
if (!dhuhr || dhuhr.minute !== 20) ok = false;

if (!ok) throw new Error("ADHAN PARSE LOGIC FAILED");
console.log("ADHAN PARSE LOGIC OK");
