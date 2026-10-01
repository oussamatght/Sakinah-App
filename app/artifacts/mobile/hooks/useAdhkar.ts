import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchAdhkar } from "@/lib/api/adhkar";
import type { Dhikr } from "@/lib/api/types";
import { MIN_SEARCH_LENGTH, normalizeArabic } from "@/lib/arabic";
import {
  clearAdhkarWirdGoal,
  completeAdhkarWird,
  getAdhkarDailyProgress,
  getAdhkarWirdSummary,
  incrementAdhkarCount,
  localDayKey,
  setAdhkarCount,
  setAdhkarWirdGoal,
  type AdhkarWirdGoal,
  type AdhkarWirdProgress,
} from "@/lib/storage";

/**
 * طبقة الأذكار: استعلام واحد + اشتقاق محلي بالكامل.
 *
 * القاعدة: لا يُطلب شيء من الشبكة إلّا مرّة واحدة لكل جلسة (كاش React Query
 * المُبَنَّى على Infinity + مُ persister في app/_layout.tsx)، فكل ما يلي
 * — البحث والتصفية والذكر العشوائي والورد — حساب محلي على نفس المصفوفة.
 * الكتابة في البحث لا تُطلق أي طلب.
 */

const ETERNITY = Infinity;

export const adhkarKeys = {
  all: ["adhkar", "all"] as const,
};

/** المصفوفة كاملة، مرّة واحدة. */
export function useGetAdhkar(): UseQueryResult<Dhikr[], Error> {
  return useQuery({
    queryKey: adhkarKeys.all,
    queryFn: fetchAdhkar,
    // نص ثابت تقريبًا، وحجمه صغير (34 ذكرًا) ⇒ يُحفظ في الكاش الدائم
    // فيقرأ بعد إطفاء التطبيق وبدون اتصال، تمامًا كسور المصحف.
    staleTime: ETERNITY,
    gcTime: ETERNITY,
  });
}

/** يبحث ذكرًا بالرقم (order) في المصفوفة المحمّلة — بلا طلب إضافي. */
export function findAdhkar(adhkar: Dhikr[] | undefined, order: number): Dhikr | undefined {
  return adhkar?.find((item) => item.order === order);
}

// ---------------------------------------------------------------------------
// التصنيفات — ثلاثة فقط، وكلها مشتقّة من حقل `type` الموجود فعلًا.
// لا نخترع تصنيفًا لا يصدقه المصدر (لا "أذكار النوم" ولا غيره).
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// البحث والتصفية — دوال نقية (قابلة للاختبار بلا React وبلا شبكة)
// ---------------------------------------------------------------------------

export type AdhkarFilterOptions = {
  query?: string;
  category?: AdhkarCategoryKey;
};

/**
 * يصفّي الأذكار محليًا. البحث يطابق النصّ أو الفضل أو المصدر أو نص الحديث
 * (كلها نصوص حقيقية من المصدر)، بعد التطبيع فيصطاد "الصمد" و"سبحان الله"
 * رغم التشكيل. الترتيب: مطابقة النص أولًا ثم تطابق الفضل/المصدر، وضمن
 * المجموعة يُبقى ترتيب المصدر (order).
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

/**
 * "ذكر اليوم": ثابت طوال اليوم (لا يتبدّل كل فتح للشاشة) ويدور يومًا بعد
 * يوم. المحسوب من تاريخ اليوم المحلي وعدد الأذكار الحقيقي.
 */
export function dailyAdhkar(adhkar: Dhikr[], day: string = localDayKey()): Dhikr | undefined {
  if (adhkar.length === 0) return undefined;
  let seed = 0;
  for (let index = 0; index < day.length; index += 1) {
    seed = (seed * 31 + day.charCodeAt(index)) >>> 0;
  }
  return adhkar[seed % adhkar.length];
}

// ---------------------------------------------------------------------------
// تقدّم العدّاد والورد — متجرّ صغير على مستوى الوحدة مع مراقبين،
// على نمط useSettings في hooks/useAppState.ts، حتى تبقى القائمة وشاشة
// الذكر متزامنتان بلا إعادة تحميل.
// ---------------------------------------------------------------------------

type Listener = () => void;
const progressListeners = new Set<Listener>();
const wirdListeners = new Set<Listener>();

function notify(set: Set<Listener>) {
  for (const listener of set) listener();
}

let sharedCounts: Record<number, number> = {};
let sharedWird: {
  goal: AdhkarWirdGoal | null;
  progress: AdhkarWirdProgress;
} = { goal: null, progress: emptyProgress() };

function emptyProgress(): AdhkarWirdProgress {
  return {
    dailyGoal: 0,
    completed: 0,
    remaining: 0,
    progress: 0,
    isComplete: false,
    hasGoal: false,
    doneOrders: [],
  };
}

/**
 * تقدّم العدّ لكل ذكر اليوم.
 *
 * `increment` هي المستعملة في شاشة الذكر: هي ترفع القيمة المخزَّنة بمقدار
 * واحد/عشرة وتُقصّ عند التكرار المطلوب، فلا تعتمد على حالة React المتأخّرة
 * عند النقر السريع. `setCount` لضبط قيمة مطلقة (إعادة العدّاد مثلًا).
 */
export function useAdhkarProgress(): {
  counts: Record<number, number>;
  increment: (order: number, target: number, by?: number) => Promise<void>;
  setCount: (order: number, count: number) => Promise<void>;
  refresh: () => Promise<void>;
} {
  const [counts, setCounts] = useState<Record<number, number>>(sharedCounts);

  const refresh = useCallback(async () => {
    const stored = await getAdhkarDailyProgress();
    sharedCounts = stored.counts;
    notify(progressListeners);
  }, []);

  useEffect(() => {
    const listener = () => setCounts(sharedCounts);
    progressListeners.add(listener);
    void refresh();
    return () => {
      progressListeners.delete(listener);
    };
  }, [refresh]);

  const increment = useCallback(async (order: number, target: number, by = 1) => {
    const stored = await incrementAdhkarCount(order, target, by);
    sharedCounts = stored.counts;
    notify(progressListeners);
  }, []);

  const setCount = useCallback(async (order: number, count: number) => {
    const stored = await setAdhkarCount(order, count);
    sharedCounts = stored.counts;
    notify(progressListeners);
  }, []);

  return { counts, increment, setCount, refresh };
}

/**
 * ورد الأذكار اليومي: الهدف + ما أُنجز + تغيير الهدف + تسجيل الإتمام.
 *
 * كل تغيير يمرّ بـ `sync` التي تحدّث النسخة المشتركة ثم تنبّه كل الشاشات
 * المشتركة، فلا تبقى القائمة تعرض تقدّمًا قديمًا بعد العودة من شاشة الذكر.
 */
export function useAdhkarWird(): {
  goal: AdhkarWirdGoal | null;
  progress: AdhkarWirdProgress;
  setGoal: (target: number) => Promise<void>;
  clearGoal: () => Promise<void>;
  completeWird: (order: number, defaultTarget: number) => Promise<void>;
  refresh: () => Promise<void>;
} {
  const [goal, setGoalState] = useState<AdhkarWirdGoal | null>(sharedWird.goal);
  const [progress, setProgress] = useState<AdhkarWirdProgress>(sharedWird.progress);

  const refresh = useCallback(async () => {
    const summary = await getAdhkarWirdSummary();
    sharedWird = { goal: summary.goal, progress: summary.progress };
    notify(wirdListeners);
  }, []);

  useEffect(() => {
    const listener = () => {
      setGoalState(sharedWird.goal);
      setProgress(sharedWird.progress);
    };
    wirdListeners.add(listener);
    void refresh();
    return () => {
      wirdListeners.delete(listener);
    };
  }, [refresh]);

  const setGoal = useCallback(
    async (target: number) => {
      await setAdhkarWirdGoal(target);
      await refresh();
    },
    [refresh],
  );

  const clearGoal = useCallback(async () => {
    await clearAdhkarWirdGoal();
    await refresh();
  }, [refresh]);

  /** تسجيل إتمام ذكر في سجلّ الورد اليومي ثم مزامنة كل الشاشات. */
  const completeWird = useCallback(
    async (order: number, defaultTarget: number) => {
      await completeAdhkarWird(order, defaultTarget);
      await refresh();
    },
    [refresh],
  );

  return { goal, progress, setGoal, clearGoal, completeWird, refresh };
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

/** خيارات عددية للهدف اليومي — أرقام بسيطة، والهدف يختاره المستخدم. */
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