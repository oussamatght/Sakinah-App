import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Thin JSON wrapper over AsyncStorage shared by all storage modules, so
 * serialization lives in one place and swapping the backend (SQLite later)
 * touches only this file.
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
    // التخزين ممتلئ أو غير متاح: التطبيق يبقى صالحًا لكن السبب يجب أن يظهر في
    // السجلّ — صمتُ الفشل كان يخفي سبب تعطّل العمل بلا إنترنت.
    console.warn(`[storage] failed to write "${key}"`, error);
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // فشل الحذف غير مؤثّر: نتجاهله ولا نُسقط التطبيق.
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
  adhkarProgress: "adhkar.daily.v1",
  adhkarWirdGoal: "adhkar.wird.goal.v1",
  adhkarWirdDay: "adhkar.wird.day.v1",
  /**
   * الحالة اليومية المرجعية للأذكار (v2): عدّادات اليوم + المنجَز + موضع
   * المتابعة في مفتاح واحد، حلّت محلّ `adhkarProgress` و`adhkarWirdDay` لأن
   * التقسيم على مفتاحين هو مصدر التناقض (عدّاد ١ وورد ٠)؛ يُقرآن للترحيل ثم يُهملان.
   */
  adhkarDailyV2: "adhkar.daily.v2",
} as const;
