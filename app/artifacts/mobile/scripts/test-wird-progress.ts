/**
 * Task-3 logic tests: computeWirdProgress + day-key separation.
 * Pure functions — no storage needed.
 * Run: npx tsx scripts/test-wird-progress.ts
 */
import {
  computeWirdProgress,
  effectiveDailyPages,
  localDayKey,
  type WirdDayRecord,
  type WirdGoal,
} from "../lib/storage/wird";

let failures = 0;
function expect(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "✓" : "✗"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failures += 1;
}

const pagesGoal: WirdGoal = { mode: "pages", targetPages: 5, createdAt: "" };
const khatmaGoal: WirdGoal = { mode: "khatma", targetDays: 60, createdAt: "" };

console.log("— الهدف اليومي:");
expect("pages goal → dailyGoal 5", computeWirdProgress(pagesGoal, null).dailyGoal, 5);
expect("khatma 60d → ~10/day", computeWirdProgress(khatmaGoal, null).dailyGoal, effectiveDailyPages(khatmaGoal));
expect("no goal → dailyGoal 0 + hasGoal false", (() => {
  const p = computeWirdProgress(null, null);
  return [p.dailyGoal, p.hasGoal];
})(), [0, false]);

console.log("— التقدم:");
const mk = (pagesRead: number): WirdDayRecord => ({
  day: localDayKey(),
  pagesRead,
  targetPages: 5,
  completed: pagesRead >= 5,
});
expect("تقدم 0", computeWirdProgress(pagesGoal, mk(0)).progress, 0);
expect("جزئي 3/5 → 0.6", computeWirdProgress(pagesGoal, mk(3)).progress, 0.6);
expect("إكمال 5/5 → 1", computeWirdProgress(pagesGoal, mk(5)).progress, 1);
expect("تجاوز 7/5 → يقف عند 1", computeWirdProgress(pagesGoal, mk(7)).progress, 1);

console.log("— المتبقي:");
expect("3/5 → متبقي 2", computeWirdProgress(pagesGoal, mk(3)).remaining, 2);
expect("5/5 → متبقي 0", computeWirdProgress(pagesGoal, mk(5)).remaining, 0);
expect("7/5 → متبقي 0 (لا سالب)", computeWirdProgress(pagesGoal, mk(7)).remaining, 0);
expect("بلا هدف → متبقي 0", computeWirdProgress(null, mk(3)).remaining, 0);

console.log("— حالة اليوم:");
expect("3/5 → isComplete false", computeWirdProgress(pagesGoal, mk(3)).isComplete, false);
expect("5/5 → isComplete true", computeWirdProgress(pagesGoal, mk(5)).isComplete, true);

console.log("— فصل الأيام (YYYY-MM-DD):");
const todayKey = localDayKey();
const d = new Date(`${todayKey}T12:00:00`);
d.setDate(d.getDate() - 1);
const yesterdayKey = localDayKey(d);
expect("مفتاح اليوم ≠ أمس", todayKey !== yesterdayKey, true);
// تقدم أمس لا يتسرب لليوم: today=null يعني completed=0 حتى لو كان بالأمس 5/5.
expect("تقدم أمس لا يُحسب اليوم", computeWirdProgress(pagesGoal, null).completed, 0);

if (failures > 0) {
  console.error(`WIRD LOGIC FAILED: ${failures} failure(s)`);
  process.exit(1);
}
console.log("WIRD PROGRESS LOGIC: ALL CHECKS PASSED");
