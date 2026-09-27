import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type FavoriteItem,
  addFavorite,
  getFavorites,
  getSettings,
  getWirdSummary,
  removeFavorite,
  saveSettings,
} from "@/lib/storage";

/**
 * الإعدادات مصدر حقيقة واحد مشترك (Module-level store + observers):
 * كل الشاشات التي تستدعي useSettings تشارك نفس الكائن، وحين تحفظ شاشة
 * (مثل fontScale من settings.tsx) يُبلَّغ كل مستمع فيتحدث كل مكان يعرض نصًا
 * قرآنيًا فورًا — حتى الشاشات المفتوحة تحت الشاشة الحالية في الـ Stack.
 * (السابق: useState محلي لكل شاشة — حفظ الإعدادات لا يُعيد رسم الشاشات
 * الأخرى أبدًا، فبدا تغيير الحجم لا يعمل.)
 */
let sharedSettings: AppSettings = DEFAULT_SETTINGS;
type SettingsListener = (next: AppSettings) => void;
const settingsListeners = new Set<SettingsListener>();

function notifySettingsListeners(next: AppSettings) {
  for (const listener of settingsListeners) listener(next);
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(sharedSettings);
  const [ready, setReady] = useState(false);

  // مزامنة أول تحميل من التخزين مرة واحدة (أول مستخدم يملأ المتجر المشترك).
  useEffect(() => {
    let active = true;
    void (async () => {
      const value = await getSettings();
      if (!active) return;
      sharedSettings = value;
      notifySettingsListeners(value);
      setSettings(value);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  // الاشتراك: أي save() من أي شاشة يبث القيمة الجديدة لكل الشاشات.
  useEffect(() => {
    const listener: SettingsListener = (next) => setSettings(next);
    settingsListeners.add(listener);
    return () => {
      settingsListeners.delete(listener);
    };
  }, []);

  const save = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await saveSettings(patch);
    sharedSettings = next;
    notifySettingsListeners(next);
    // TEMP DEBUG (fontScale) — حذفها بعد التحقق البصري.
    if (__DEV__) console.log("[SETTINGS DEBUG] saved:", JSON.stringify(patch), "→ fontScale =", next.fontScale);
  }, []);

  return { settings, ready, save };
}

/** Live wird summary for the home card; call refresh() after logging pages. */
export function useWirdSummary(): Awaited<ReturnType<typeof getWirdSummary>> & {
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<Awaited<ReturnType<typeof getWirdSummary>>>({
    goal: null,
    today: null,
    streak: { current: 0, longest: 0 },
    totalCompletedDays: 0,
  });

  const refresh = useCallback(async () => {
    const summary = await getWirdSummary();
    setData(summary);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...data, refresh };
}

/** Favorites list with an imperative toggle that keeps state in sync. */
export function useFavoritesList() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  const refresh = useCallback(async () => {
    setFavorites(await getFavorites());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = useCallback(
    async (item: Omit<FavoriteItem, "id" | "createdAt">) => {
      const isFav = favorites.some(
        (candidate) => candidate.kind === item.kind && candidate.refId === item.refId,
      );
      if (isFav) {
        await removeFavorite(item.kind, item.refId);
      } else {
        await addFavorite(item);
      }
      await refresh();
      return !isFav;
    },
    [favorites, refresh],
  );

  const isFavorite = useCallback(
    (kind: FavoriteItem["kind"], refId: string) =>
      favorites.some((candidate) => candidate.kind === kind && candidate.refId === refId),
    [favorites],
  );

  return { favorites, refresh, toggle, isFavorite };
}
