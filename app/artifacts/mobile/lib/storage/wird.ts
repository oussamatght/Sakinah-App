import { readJson, storageKeys, writeJson } from "./client";

/**
 * Local wird (daily Quran portion) persistence — Phase A groundwork.
 *
 * Everything lives on-device via AsyncStorage; the Phase-2 server endpoints
 * (wird/favorites in @workspace/db) can sync this later without changing the
 * shape stored here.
 */

export type WirdMode = "pages" | "khatma";

export type WirdGoal = {
  mode: WirdMode;
  /** mode=pages : pages to read per day. */
  targetPages?: number;
  /** mode=khatma : finish the mushaf (604 pages) in this many days. */
  targetDays?: number;
  createdAt: string; // ISO date
};

export type WirdDayRecord = {
  /** Local date "YYYY-MM-DD". */
  day: string;
  pagesRead: number;
  targetPages: number;
  completed: boolean;
};

export type WirdStreak = {
  current: number;
  longest: number;
};

export const MUSHAF_PAGES = 604;

export function effectiveDailyPages(goal: WirdGoal): number {
  if (goal.mode === "pages" && goal.targetPages) return goal.targetPages;
  if (goal.mode === "khatma" && goal.targetDays) {
    return Math.max(Math.round(MUSHAF_PAGES / goal.targetDays), 1);
  }
  return 1;
}

export function localDayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function getWirdGoal(): Promise<WirdGoal | null> {
  return readJson<WirdGoal>(storageKeys.wirdGoal);
}

export async function setWirdGoal(goal: Omit<WirdGoal, "createdAt">): Promise<WirdGoal> {
  const full: WirdGoal = { ...goal, createdAt: new Date().toISOString() };
  await writeJson(storageKeys.wirdGoal, full);
  return full;
}

export async function clearWirdGoal(): Promise<void> {
  await writeJson(storageKeys.wirdGoal, null);
}

export async function getWirdDays(): Promise<WirdDayRecord[]> {
  return (await readJson<WirdDayRecord[]>(storageKeys.wirdDays)) ?? [];
}

/** Adds pages to today's record (creating it if needed) and returns it. */
export async function addWirdPages(pages: number): Promise<WirdDayRecord> {
  const goal = await getWirdGoal();
  const targetPages = goal ? effectiveDailyPages(goal) : pages;
  const day = localDayKey();
  const days = await getWirdDays();
  const existing = days.find((record) => record.day === day);
  const next: WirdDayRecord = existing
    ? {
        ...existing,
        pagesRead: Math.max(existing.pagesRead + pages, 0),
        targetPages,
      }
    : { day, pagesRead: Math.max(pages, 0), targetPages, completed: false };
  next.completed = next.pagesRead >= next.targetPages;
  const others = days.filter((record) => record.day !== day);
  await writeJson(storageKeys.wirdDays, [...others, next]);
  return next;
}

/** Streak = consecutive days (ending today or yesterday) with completed=true. */
export async function getWirdStreak(): Promise<WirdStreak> {
  const days = await getWirdDays();
  const completed = new Set(
    days.filter((record) => record.completed).map((record) => record.day),
  );

  const dayShift = (key: string, delta: number): string => {
    const date = new Date(`${key}T12:00:00`);
    date.setDate(date.getDate() + delta);
    return localDayKey(date);
  };

  let current = 0;
  let cursor = localDayKey();
  if (!completed.has(cursor)) {
    // Today not done yet — a yesterday streak is still alive.
    cursor = dayShift(cursor, -1);
  }
  while (completed.has(cursor)) {
    current += 1;
    cursor = dayShift(cursor, -1);
  }

  // Longest: scan all completed days.
  let longest = 0;
  for (const day of completed) {
    if (!completed.has(dayShift(day, -1))) {
      let length = 1;
      let walker = dayShift(day, 1);
      while (completed.has(walker)) {
        length += 1;
        walker = dayShift(walker, 1);
      }
      longest = Math.max(longest, length);
    }
  }

  return { current, longest };
}

/** Everything the home progress card needs, in one call. */
export async function getWirdSummary(): Promise<{
  goal: WirdGoal | null;
  today: WirdDayRecord | null;
  streak: WirdStreak;
  totalCompletedDays: number;
}> {
  const goal = await getWirdGoal();
  const days = await getWirdDays();
  const today = days.find((record) => record.day === localDayKey()) ?? null;
  const streak = await getWirdStreak();
  return {
    goal,
    today,
    streak,
    totalCompletedDays: days.filter((record) => record.completed).length,
  };
}

// ---------------------------------------------------------------------------
// المنطق الحسابي الوحيد للورد (يُستعمل من كل الشاشات — لا حسابات داخل UI):
//   remaining = max(dailyGoal - completed, 0)
//   progress  = dailyGoal > 0 ? min(completed / dailyGoal, 1) : 0
// ---------------------------------------------------------------------------

export type WirdProgress = {
  /** الهدف اليومي المشتق من الهدف المحفوظ (صفحات). */
  dailyGoal: number;
  /** الصفحات المقروءة اليوم فقط (مفتاح YYYY-MM-DD). */
  completed: number;
  /** max(dailyGoal - completed, 0). */
  remaining: number;
  /** dailyGoal > 0 ? min(completed / dailyGoal, 1) : 0 */
  progress: number;
  /** هل أُتم الورد اليوم؟ */
  isComplete: boolean;
  /** هل يوجد هدف محفوظ أصلًا؟ */
  hasGoal: boolean;
};

/** دالة نقية — قابلة للاختبار بلا تخزين، ومصدر الحقيقة الوحيد للحسابات. */
export function computeWirdProgress(
  goal: WirdGoal | null,
  today: WirdDayRecord | null,
): WirdProgress {
  const dailyGoal = goal ? effectiveDailyPages(goal) : 0;
  const completed = today?.pagesRead ?? 0;
  const remaining = Math.max(dailyGoal - completed, 0);
  const progress = dailyGoal > 0 ? Math.min(completed / dailyGoal, 1) : 0;
  return {
    dailyGoal,
    completed,
    remaining,
    progress,
    isComplete: dailyGoal > 0 && remaining === 0,
    hasGoal: goal !== null,
  };
}

/** نفس الحساب لكن مع قراءة التخزين — للشاشات. */
export async function getWirdProgress(): Promise<WirdProgress> {
  const goal = await getWirdGoal();
  const days = await getWirdDays();
  const today = days.find((record) => record.day === localDayKey()) ?? null;
  return computeWirdProgress(goal, today);
}
