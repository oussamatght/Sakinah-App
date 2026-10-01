import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchAdhkar } from "@/lib/api/adhkar";
import type { Dhikr } from "@/lib/api/types";
import { MIN_SEARCH_LENGTH, normalizeArabic } from "@/lib/arabic";
import {
  clearAdhkarWirdGoal,
  computeAdhkarWirdProgress,
  countDhikr,
  emptyAdhkarProgress,
  getAdhkarWirdSummary,
  localDayKey,
  setAdhkarCount,
  setAdhkarCurrentIndex,
  setAdhkarWirdGoal,
  type AdhkarCountResult,
  type AdhkarWirdGoal,
  type AdhkarWirdProgress,
} from "@/lib/storage";

/**
 * طبقة الأذكار: استعلام واحد + اشتقاق محلي بالكامل — لا طلب شبكة إلّا مرّة واحدة
 * لكل جلسة (كاش React Query بـ Infinity + مُ persister في _layout.tsx).
 */

const ETERNITY = Infinity;

export const adhkarKeys = {
  all: ["adhkar", "all"] as const,
};

export function useGetAdhkar(): UseQueryResult<Dhikr[], Error> {
  return useQuery({
    queryKey: adhkarKeys.all,
    queryFn: fetchAdhkar,
    // ثابت تقريبًا وصغير ⇒ كاش دائم: يُقرأ بعد إطفاء التطبيق وبدون اتصال.
    staleTime: ETERNITY,
    gcTime: ETERNITY,
  });
}

/** يبحث ذكرًا بالرقم (order) في المصفوفة المحمّلة — بلا طلب إضافي. */
export function findAdhkar(adhkar: Dhikr[] | undefined, order: number): Dhikr | undefined {
  return adhkar?.find((item) => item.order === order);
}

// التصنيفات — ثلاثة فقط، مشتقّة من حقل `type` الفعلي: لا نخترع تصنيفًا لا يصدقه المصدر.

export type AdhkarCategoryKey = "all" | "morning" | "evening" | "general";

export type AdhkarCategory = {
  key: AdhkarCategoryKey;
  label: string;
  /** قيمة `type` في المصدر، أو null للكل. */
  type: number | null;
};

export const ADHKAR_CATEGORIES: AdhkarCategory[] = [
  { key: "all", label: "الكل", type: null },
  { key: "morning", label: "أذكار الصباح", type: 1 },
  { key: "evening", label: "أذكار المساء", type: 2 },
  { key: "general", label: "أذكار عامة", type: 0 },
];

/** تصنيف ذكر واحد من حقل `type` (صباح/مساء/عام) — لا أكثر. */
export function categoryOf(dhikr: Dhikr): AdhkarCategoryKey {
  if (dhikr.type === 1) return "morning";
  if (dhikr.type === 2) return "evening";
  return "general";
}

/** اسم التصنيف المختصر — يُعرض كشارة على البطاقة. */
export function categoryLabel(dhikr: Dhikr): string {
  const found = ADHKAR_CATEGORIES.find((category) => category.key === categoryOf(dhikr));
  return found?.label ?? "ذكر";
}

// البحث والتصفية — دوال نقية (قابلة للاختبار بلا React وبلا شبكة).

export type AdhkarFilterOptions = {
  query?: string;
  category?: AdhkarCategoryKey;
};

/**
 * يصفّي محليًا: النصّ أو الفضل أو المصدر أو نص الحديث، بعد التطبيع فيصطاد
 * "الصمد" رغم التشكيل. الأولوية لمطابقة النصّ ثم الفضل/المصدر، وداخل كل
 * مجموعة يبقى ترتيب المصدر.
 */
export function filterAdhkar(
  adhkar: Dhikr[],
  { query = "", category = "all" }: AdhkarFilterOptions = {},
): Dhikr[] {
  const inCategory =
    category === "all"
      ? adhkar
      : adhkar.filter((item) => categoryOf(item) === category);

  const needle = normalizeArabic(query.trim());
  if (needle.length < MIN_SEARCH_LENGTH) return inCategory;

  const primary: Dhikr[] = [];
  const secondary: Dhikr[] = [];
  for (const dhikr of inCategory) {
    const fields = [
      dhikr.content,
      dhikr.fadl,
      dhikr.source,
      dhikr.hadith_text,
      dhikr.explanation_of_hadith_vocabulary,
    ];
    const hits = fields.filter((field) => normalizeArabic(field).includes(needle));
    if (hits.length === 0) continue;
    if (normalizeArabic(dhikr.content).includes(needle)) primary.push(dhikr);
    else secondary.push(dhikr);
  }
  return [...primary, ...secondary];
}

/** ذكر اليوم: ثابت طوال اليوم (لا يتبدّل كل فتح للشاشة) ويدور يومًا بعد يوم. */
export function dailyAdhkar(adhkar: Dhikr[], day: string = localDayKey()): Dhikr | undefined {
  if (adhkar.length === 0) return undefined;
  let seed = 0;
  for (let index = 0; index < day.length; index += 1) {
    seed = (seed * 31 + day.charCodeAt(index)) >>> 0;
  }
  return adhkar[seed % adhkar.length];
}

// تقدّم العدّاد والورد — متجرّ صغير على مستوى الوحدة مع مراقبين.

/**
 * لقطة واحدة على نمط useSettings في hooks/useAppState.ts فتبقى القائمة وشاشة
 * الذكر متزامنتان. كان هنا متجرّان يقرآن مفتاحين، فعرضت الشاشة ٠ والأخرى ١
 * في نفس اللحظة؛ الآن كل كتابة تنبّه الجميع دفعة واحدة.
 */
type Listener = () => void;
const dailyListeners = new Set<Listener>();

type AdhkarSnapshot = {
  counts: Record<number, number>;
  goal: AdhkarWirdGoal | null;
  progress: AdhkarWirdProgress;
};

let shared: AdhkarSnapshot = {
  counts: {},
  goal: null,
  progress: emptyAdhkarProgress(),
};

function notify() {
  for (const listener of dailyListeners) listener();
}

/**
 * يثبّت اللقطة على الحالة التي أعادتها الكتابة نفسها لا على `shared` السابقة:
 * قراءة الإنجاز من الذاكرة هي بالضبط التناقض الذي نُصلحه.
 */
function adopt(
  state: { counts: Record<number, number>; doneOrders: number[]; currentIndex: number; day: string },
  goal: AdhkarWirdGoal | null,
): void {
  shared = {
    counts: state.counts,
    goal,
    progress: computeAdhkarWirdProgress(goal, state),
  };
  notify();
}

async function refreshShared(): Promise<void> {
  const summary = await getAdhkarWirdSummary();
  shared = {
    counts: summary.today?.counts ?? {},
    goal: summary.goal,
    progress: summary.progress,
  };
  notify();
}

/** مراقب تغيّر اليوم: بلاه بقيت الشاشة تعرض تقدّم الأمس حتى يُفتح التطبيق من جديد. */
let dayWatcher: ReturnType<typeof setInterval> | null = null;
let watchedDay = localDayKey();
let watcherSubscribers = 0;

function acquireDayWatcher() {
  watcherSubscribers += 1;
  if (dayWatcher) return;
  watchedDay = localDayKey();
  dayWatcher = setInterval(() => {
    const today = localDayKey();
    if (today === watchedDay) return;
    watchedDay = today;
    void refreshShared();
  }, 30_000);
}

function releaseDayWatcher() {
  watcherSubscribers = Math.max(0, watcherSubscribers - 1);
  if (watcherSubscribers > 0 || !dayWatcher) return;
  clearInterval(dayWatcher);
  dayWatcher = null;
}

/** الاشتراك في اللقطة المشتركة مع الإبقاء على مراقب اليوم حيًّا. */
function useAdhkarSnapshot(): AdhkarSnapshot {
  const [snapshot, setSnapshot] = useState(shared);

  useEffect(() => {
    const listener = () => setSnapshot(shared);
    dailyListeners.add(listener);
    acquireDayWatcher();
    void refreshShared();
    return () => {
      dailyListeners.delete(listener);
      releaseDayWatcher();
    };
  }, []);

  return snapshot;
}

/**
 * `increment` ترفع القيمة المخزَّنة (لا حالة React المتأخّرة) وتُتمّ الورد في
 * الكتابة نفسها، فلا تضيع زيادة عند النقر السريع؛ `setCount` لضبط قيمة مطلقة.
 */
export function useAdhkarProgress(): {
  counts: Record<number, number>;
  increment: (order: number, target: number, by?: number) => Promise<AdhkarCountResult>;
  setCount: (order: number, count: number) => Promise<void>;
  refresh: () => Promise<void>;
} {
  const { counts } = useAdhkarSnapshot();

  const increment = useCallback(
    async (order: number, target: number, by = 1) => {
      const result = await countDhikr(order, target, by);
      adopt(result.state, shared.goal);
      return result;
    },
    [],
  );

  const setCount = useCallback(async (order: number, count: number) => {
    const result = await setAdhkarCount(order, count);
    adopt(result.state, shared.goal);
  }, []);

  return { counts, increment, setCount, refresh: refreshShared };
}

/**
 * الهدف فقط: الإنجاز يأتي مع كل عدّاد من `useAdhkarProgress().increment` في
 * كتابة واحدة، فلا ينفصل الورد عن العدّاد.
 */
export function useAdhkarWird(): {
  goal: AdhkarWirdGoal | null;
  progress: AdhkarWirdProgress;
  setGoal: (target: number) => Promise<void>;
  clearGoal: () => Promise<void>;
  setCurrentIndex: (index: number) => Promise<void>;
  refresh: () => Promise<void>;
} {
  const { goal, progress } = useAdhkarSnapshot();

  const setGoal = useCallback(async (target: number) => {
    await setAdhkarWirdGoal(target);
    // لا نكتفي بتعديل الذاكرة: الهدف يُطبَّق على إنجاز اليوم المحفوظ.
    await refreshShared();
  }, []);

  const clearGoal = useCallback(async () => {
    await clearAdhkarWirdGoal();
    await refreshShared();
  }, []);

  const setCurrentIndex = useCallback(async (index: number) => {
    const state = await setAdhkarCurrentIndex(index);
    adopt(state, shared.goal);
  }, []);

  return { goal, progress, setGoal, clearGoal, setCurrentIndex, refresh: refreshShared };
}

/** أول ذكر في ترتيب المصدر لم يُنجَز اليوم — زر "متابعة الورد" يفتح عليه. */
export function nextWirdDhikr(
  adhkar: Dhikr[] | undefined,
  doneOrders: number[],
): Dhikr | undefined {
  if (!adhkar || adhkar.length === 0) return undefined;
  const done = new Set(doneOrders);
  return adhkar.find((item) => !done.has(item.order));
}

export const WIRD_TARGET_OPTIONS = [3, 5, 10, 15] as const;

/** يستعمل useMemo لتفادي إعادة الحساب في كل رسم. */
export function useFilteredAdhkar(
  adhkar: Dhikr[] | undefined,
  query: string,
  category: AdhkarCategoryKey,
): Dhikr[] {
  return useMemo(
    () => (adhkar ? filterAdhkar(adhkar, { query, category }) : []),
    [adhkar, query, category],
  );
}