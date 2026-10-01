import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Thin JSON wrapper over AsyncStorage. All storage modules (wird, favorites,
 * readingPosition) build on this so serialization happens in exactly one place
 * and swapping the backend (SQLite in a later phase) touches only this file.
 */

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt entry: treat as missing rather than crashing the app.
    return null;
  }
}

export async function writeJson<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // التخزين ممتلئ أو غير متاح: التطبيق يبقى صالحًا، لكن يجب أن يظهر السبب
    // في السجلّ: صمتُ الفشل كان يخفي سبب تعطّل "العمل بدون إنترنت"
    // (كاش المواقيت مثلًا لا يُكتب أصلًا فيبقى فارغًا إلى الأبد).
    console.warn(`[storage] failed to write "${key}"`, error);
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

export const storageKeys = {
  wirdGoal: "wird.goal.v1",
  wirdDays: "wird.days.v1",
  favorites: "favorites.v1",
  readingPosition: "reading.position.v1",
  settings: "settings.v1",
  tasbih: "tasbih.history.v1",
  prayerTimes: "prayer.times.cache.v1",
  /** أذكار: تقدّم عدّاد اليوم + هدف الورد اليومي + سجلّ اليوم. */
  adhkarProgress: "adhkar.daily.v1",
  adhkarWirdGoal: "adhkar.wird.goal.v1",
  adhkarWirdDay: "adhkar.wird.day.v1",
} as const;
