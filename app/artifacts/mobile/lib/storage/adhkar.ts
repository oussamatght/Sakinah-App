import { readJson, removeKey, storageKeys, writeJson } from "./client";
import { localDayKey } from "./wird";

/**
 * حفظ حالة أذكار المستخدم محليًا (AsyncStorage) — بلا خادم وبلا حساب.
 *
 * ثلاثة أشياء مستقلّة، كلٌّ في مفتاح واحد:
 *   1. تقدّم العدّ لكل ذكر اليوم  (adhkar.daily.v1) — يُصفَّر بتغيّر اليوم.
 *   2. هدف الورد اليومي           (adhkar.wird.goal.v1) — عدد أذكار يحدّده المستخدم.
 *   3. سجلّ الورد اليومي          (adhkar.wird.day.v1)   — من أتمّ اليوم فعلًا.
 *
 * الورد القرآني في wird.ts منفصل تمامًا (صفحات ومصحف) — ولا نخلط بينهما
 * حتى لا يصير عدّاد الأذكار جزءًا من الورد القرآني أو العكس.
 */

/** تقدّم اليوم: كم مرّة قيل كل ذكر (order → number). */
export type AdhkarDailyProgress = {
  /** مفتاح اليوم المحلي "YYYY-MM-DD" — أي تغيّر فيه يعني يومًا جديدًا. */
  day: string;
  /** رقم الذكر → كم مرّة قيل اليوم. */
  counts: Record<number, number>;
};

/** هدف الورد: عدد الأذكار التي يحدّدها المستخدم لليوم (وليس عددًا تلقائيًا). */
export type AdhkarWirdGoal = {
  /** عدد أذكار يومية. */
  target: number;
  createdAt: string;
};

/** سجلّ اليوم: ما أُنجز فعلًا + الهدف المتّبع اليوم. */
export type AdhkarWirdDay = {
  day: string;
  target: number;
  /** أرقام الأذكار التي بلغ تكرارها المطلوب اليوم (وكل تكرار يُحتسب مرة). */
  doneOrders: number[];
};

/**
 * كل الكتابات محشوّة في سلسلة واحدة.
 *
 * السبب: العدّاد يُكتب عند كل نقرة، وAsyncStorage غير متزامن. لو تزامنت
 * نقرتان، لقرأت كلٌّ منهما القيمة القديمة قبل أن تكتب الأخرى، فتضيع زيادة
 * (عدّاد 7 بدل 8). السلسلة تجعل كل كتابة تنتظر سابقتها، فتتراكم بشكل صحيح.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function getAdhkarDailyProgress(): Promise<AdhkarDailyProgress> {
  const stored = await readJson<AdhkarDailyProgress>(storageKeys.adhkarProgress);
  const today = localDayKey();
  // يوم جديد ⇒ تقدّم صفري (لا يُحذف من القرص حتى لا نكتب في كل قراءة).
  if (!stored || stored.day !== today || typeof stored.counts !== "object") {
    return { day: today, counts: {} };
  }
  return { day: stored.day, counts: stored.counts ?? {} };
}

export async function saveAdhkarDailyProgress(
  progress: AdhkarDailyProgress,
): Promise<void> {
  await writeJson(storageKeys.adhkarProgress, progress);
}

/** يضبط عدّاد ذكر واحد لليوم ويمسحه إن كان 0. */
export async function setAdhkarCount(
  order: number,
  count: number,
): Promise<AdhkarDailyProgress> {
  return enqueueWrite(async () => {
    const current = await getAdhkarDailyProgress();
    const counts = { ...current.counts };
    if (count > 0) {
      counts[order] = count;
    } else {
      delete counts[order];
    }
    const next: AdhkarDailyProgress = { day: current.day, counts };
    await saveAdhkarDailyProgress(next);
    return next;
  });
}

/**
 * يزيد عدّاد ذكر واحد ولا يتجاوز تكراره المطلوب (`target` من المصدر).
 *
 * الفصل بين "زيادة" و"ضبط" مقصود: الزيادة تُحسب من القيمة المخزَّنة داخل
 * السلسلة، فلا تعتمد على حالة React التي قد تكون متأخّرة عند النقر السريع.
 */
export async function incrementAdhkarCount(
  order: number,
  target: number,
  by = 1,
): Promise<AdhkarDailyProgress> {
  return enqueueWrite(async () => {
    const current = await getAdhkarDailyProgress();
    const counts = { ...current.counts };
    const cap = Math.max(1, Math.floor(target));
    const next = Math.min((counts[order] ?? 0) + by, cap);
    if (next > 0) {
      counts[order] = next;
    } else {
      delete counts[order];
    }
    const nextProgress: AdhkarDailyProgress = { day: current.day, counts };
    await saveAdhkarDailyProgress(nextProgress);
    return nextProgress;
  });
}

export async function getAdhkarWirdGoal(): Promise<AdhkarWirdGoal | null> {
  const stored = await readJson<AdhkarWirdGoal>(storageKeys.adhkarWirdGoal);
  if (!stored || !Number.isInteger(stored.target) || stored.target <= 0) {
    return null;
  }
  return stored;
}

export async function setAdhkarWirdGoal(target: number): Promise<AdhkarWirdGoal | null> {
  const clean = Math.max(1, Math.floor(target));
  return enqueueWrite(async () => {
    const goal: AdhkarWirdGoal = { target: clean, createdAt: new Date().toISOString() };
    await writeJson(storageKeys.adhkarWirdGoal, goal);
    return goal;
  });
}

export async function clearAdhkarWirdGoal(): Promise<void> {
  return enqueueWrite(() => removeKey(storageKeys.adhkarWirdGoal));
}

export async function getAdhkarWirdDay(): Promise<AdhkarWirdDay | null> {
  const stored = await readJson<AdhkarWirdDay>(storageKeys.adhkarWirdDay);
  if (!stored || stored.day !== localDayKey() || !Array.isArray(stored.doneOrders)) {
    return null;
  }
  return stored;
}

/**
 * يسجّل إتمام ذكر واحد لليوم ويمسح اليوم بعد تغيّر تاريخه.
 * `doneOrders` قائمة بأرقام فريدة ⇒ تكرار الإتمام لا يُحتسب مرتين.
 */
export async function completeAdhkarWird(
  order: number,
  defaultTarget: number,
): Promise<AdhkarWirdDay> {
  return enqueueWrite(async () => {
    const today = localDayKey();
    const stored = await getAdhkarWirdDay();
    const base: AdhkarWirdDay =
      stored ??
      {
        day: today,
        target: defaultTarget > 0 ? defaultTarget : 1,
        doneOrders: [],
      };
    if (base.doneOrders.includes(order)) return base;
    const next: AdhkarWirdDay = {
      ...base,
      doneOrders: [...base.doneOrders, order],
    };
    await writeJson(storageKeys.adhkarWirdDay, next);
    return next;
  });
}

// ---------------------------------------------------------------------------
// الحسابات — دوال نقية (بلا تخزين) حتى يمكن اختبارها وتدقيقها وحدها.
// نفس النمط المُتّبع في computeWirdProgress().
// ---------------------------------------------------------------------------

export type AdhkarWirdProgress = {
  dailyGoal: number;
  completed: number;
  /** max(dailyGoal - completed, 0). */
  remaining: number;
  /** dailyGoal > 0 ? min(completed / dailyGoal, 1) : 0. */
  progress: number;
  isComplete: boolean;
  hasGoal: boolean;
  /** أرقام أذكار اليوم المنجزة — لعرض "متابعة الورد" على أول ذكر غير منجز. */
  doneOrders: number[];
};

export function computeAdhkarWirdProgress(
  goal: AdhkarWirdGoal | null,
  today: AdhkarWirdDay | null,
): AdhkarWirdProgress {
  const dailyGoal = goal?.target ?? 0;
  const doneOrders = today?.doneOrders ?? [];
  const completed = doneOrders.length;
  const remaining = Math.max(dailyGoal - completed, 0);
  const progress = dailyGoal > 0 ? Math.min(completed / dailyGoal, 1) : 0;
  return {
    dailyGoal,
    completed,
    remaining,
    progress,
    isComplete: dailyGoal > 0 && remaining === 0,
    hasGoal: goal !== null,
    doneOrders,
  };
}

/** قراءة كل شيء في نداء واحد — للشاشة الرئيسية وشاشة الورد. */
export async function getAdhkarWirdSummary(): Promise<{
  goal: AdhkarWirdGoal | null;
  today: AdhkarWirdDay | null;
  progress: AdhkarWirdProgress;
}> {
  const [goal, today] = await Promise.all([getAdhkarWirdGoal(), getAdhkarWirdDay()]);
  return { goal, today, progress: computeAdhkarWirdProgress(goal, today) };
}

/** يمسح كل شيء محفوظ للأذكار (الهدف + سجل اليوم + تقدّم العدّاد). */
export async function clearAdhkarData(): Promise<void> {
  await Promise.all([
    removeKey(storageKeys.adhkarProgress),
    removeKey(storageKeys.adhkarWirdGoal),
    removeKey(storageKeys.adhkarWirdDay),
  ]);
}