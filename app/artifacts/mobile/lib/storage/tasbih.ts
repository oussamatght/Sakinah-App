import { readJson, removeKey, storageKeys, writeJson } from "./client";

/** Tasbih (digital misbaha) persistence — each session keeps the dhikr name, count and creation time; the history screen aggregates totals per dhikr text. */

export type TasbihEntry = {
  id: string;
  dhikr: string;
  count: number;
  createdAt: string; // ISO
};

const MAX_ENTRIES = 500;

export async function getTasbihHistory(): Promise<TasbihEntry[]> {
  return (await readJson<TasbihEntry[]>(storageKeys.tasbih)) ?? [];
}

/** Saves a session and returns the history, newest first. */
export async function saveTasbihEntry(
  dhikr: string,
  count: number,
): Promise<TasbihEntry[]> {
  const trimmed = dhikr.trim() || "تسبيح";
  const entry: TasbihEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dhikr: trimmed,
    count: Math.max(count, 0),
    createdAt: new Date().toISOString(),
  };
  if (entry.count === 0) return getTasbihHistory();
  const history = await getTasbihHistory();
  const next = [entry, ...history].slice(0, MAX_ENTRIES);
  await writeJson(storageKeys.tasbih, next);
  return next;
}

/** Total count per dhikr text, ordered by total (for the history list). */
export async function getTasbihTotals(): Promise<
  Array<{ dhikr: string; total: number; sessions: number }>
> {
  const history = await getTasbihHistory();
  const totals = new Map<string, { total: number; sessions: number }>();
  for (const entry of history) {
    const existing = totals.get(entry.dhikr) ?? { total: 0, sessions: 0 };
    totals.set(entry.dhikr, {
      total: existing.total + entry.count,
      sessions: existing.sessions + 1,
    });
  }
  return [...totals.entries()]
    .map(([dhikr, value]) => ({ dhikr, ...value }))
    .sort((a, b) => b.total - a.total);
}

export async function clearTasbihHistory(): Promise<void> {
  await removeKey(storageKeys.tasbih);
}
