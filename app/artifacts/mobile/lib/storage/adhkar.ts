import { readJson, removeKey, storageKeys, writeJson } from "./client";
import { localDayKey } from "./wird";

/**
 * حالة اليوم المرجعية للأذكار — مفتاح واحد: العدّاد والمنجَز وموضع المتابعة.
 * كانت مقسومة على مفتاحين بلا ذرّية بينهما، فيقطعها أي تعطّل فيظهر العدّاد ١
 * والورد ٠ في نفس اللحظة (وهو ما بلّغ عنه المستخدم). الورد القرآني في
 * wird.ts منفصل تمامًا عن هذا العدّاد.
 */

/** الحالة اليومية الكاملة: مصدر الحقيقة الوحيد لكل تقدّم اليوم. */
export type AdhkarDailyState = {
  /** مفتاح اليوم المحلي "YYYY-MM-DD" — أي تغيّر فيه يعني يومًا جديدًا. */
  day: string;
  /** رقم الذكر → كم مرّة قيل اليوم (محدود بتكرار الذكر في المصدر). */
  counts: Record<number, number>;
  /** أرقام الأذكار التي بلغ تكرارها المطلوب اليوم (كل ذكر مرة واحدة). */
  doneOrders: number[];
  /** موضع المتابعة داخل ترتيب اليوم (فهرس، 0 = الأول) لزر "متابعة الورد". */
  currentIndex: number;
};

/** هدف الورد: عدد الأذكار التي يحدّدها المستخدم (دائم، لا يُصفَّر يوميًا). */
export type AdhkarWirdGoal = {
  target: number;
  createdAt: string;
};

/** شكل توافق قديم لسجلّ الورد يُستعمل فقط أثناء الترحيل. */
type LegacyWirdDay = {
  day: string;
  target: number;
  doneOrders: number[];
};

/** شكل توافق قديم لتقدّم العدّاد يُستعمل فقط أثناء الترحيل. */
type LegacyProgress = {
  day: string;
  counts: Record<number, number>;
};

/**
 * كل الكتابات في سلسلة واحدة: AsyncStorage غير متزامن، فلو تزامنت نقرتان
 * لقرعتا القيمة القديمة فضاعت زيادة (٧ بدل ٨).
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

function emptyDay(day: string): AdhkarDailyState {
  return { day, counts: {}, doneOrders: [], currentIndex: 0 };
}

function isValidState(value: unknown): value is AdhkarDailyState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<AdhkarDailyState>;
  return (
    typeof state.day === "string" &&
    typeof state.counts === "object" &&
    state.counts !== null &&
    Array.isArray(state.doneOrders)
  );
}

/**
 * ترحيل لمرة واحدة من المفتاحين القديمين، ولا يُرحَّل إلا ما كان يومه هو اليوم
 * المحلي: بيانات يوم ماضٍ تُهمَل ويبدأ اليوم الجديد من الصفر.
 */
async function migrateLegacyDay(today: string): Promise<AdhkarDailyState | null> {
  const [legacyCounts, legacyWird] = await Promise.all([
    readJson<LegacyProgress>(storageKeys.adhkarProgress),
    readJson<LegacyWirdDay>(storageKeys.adhkarWirdDay),
  ]);

  const countsBelongToToday =
    legacyCounts?.day === today &&
    typeof legacyCounts.counts === "object" &&
    legacyCounts.counts !== null;
  const wirdBelongsToToday =
    legacyWird?.day === today && Array.isArray(legacyWird.doneOrders);
  if (!countsBelongToToday && !wirdBelongsToToday) return null;

  const migrated = emptyDay(today);
  if (countsBelongToToday) migrated.counts = { ...legacyCounts.counts };
  if (wirdBelongsToToday) migrated.doneOrders = [...new Set(legacyWird.doneOrders)];
  return migrated;
}

/** يقرأ سجلّ اليوم، مع الترحيل وتصفير يوم جديد — بلا كتابة. */
async function readDailyState(): Promise<AdhkarDailyState> {
  const today = localDayKey();
  const stored = await readJson<AdhkarDailyState>(storageKeys.adhkarDailyV2);
  if (isValidState(stored)) {
    if (stored.day !== today) return emptyDay(today);
    return {
      day: stored.day,
      counts: { ...stored.counts },
      doneOrders: [...new Set(stored.doneOrders)],
      currentIndex:
        Number.isInteger(stored.currentIndex) && stored.currentIndex >= 0
          ? stored.currentIndex
          : 0,
    };
  }
  return (await migrateLegacyDay(today)) ?? emptyDay(today);
}

async function persist(state: AdhkarDailyState): Promise<AdhkarDailyState> {
  await writeJson(storageKeys.adhkarDailyV2, state);
  return state;
}

// الهدف اليومي — دائم عبر الأيام، في مفتاح مستقل عن سجلّ اليوم.

export async function getAdhkarWirdGoal(): Promise<AdhkarWirdGoal | null> {
  const stored = await readJson<AdhkarWirdGoal>(storageKeys.adhkarWirdGoal);
  if (!stored || !Number.isInteger(stored.target) || stored.target <= 0) {
    return null;
  }
  return stored;
}

export async function setAdhkarWirdGoal(
  target: number,
): Promise<AdhkarWirdGoal | null> {
  const clean = Math.max(1, Math.floor(target));
  return enqueueWrite(async () => {
    const goal: AdhkarWirdGoal = {
      target: clean,
      createdAt: new Date().toISOString(),
    };
    await writeJson(storageKeys.adhkarWirdGoal, goal);
    return goal;
  });
}

// يمسح إنجاز اليوم أيضًا، وإلا بقي رصيد "منجز" بلا هدف يُحسب ولا يُحذف ولا يظهر.
export async function clearAdhkarWirdGoal(): Promise<void> {
  return enqueueWrite(async () => {
    await removeKey(storageKeys.adhkarWirdGoal);
    const today = localDayKey();
    const current = await readDailyState();
    if (current.doneOrders.length === 0) return;
    await persist({ ...current, day: today, doneOrders: [] });
  });
}

// العملية الذرّية الواحدة — العدّاد والورد في كتابة واحدة.

export type AdhkarCountResult = {
  state: AdhkarDailyState;
  /** بلغ العدّاد تكراره المطلوب في هذه النقرة (وليس قبلها). */
  completedNow: boolean;
  /** دخل هذا الذكر إلى سجلّ الورد في هذه النقرة. */
  wirdCountedNow: boolean;
};

/**
 * الطريق الوحيد لزيادة العدّاد: العدّاد والورد في كتابة واحدة، والورد مشتقّ من
 * بلوغ التكرار لا من نداء ثانٍ. ولا يُسجَّل ذكر في الورد إلا مع هدف سائد: قبل
 * ذلك كان الإتمام بلا هدف يكتب `doneOrders` تلقائيًا فيرى المستخدم ١/١٠ بلا طلب.
 */
export async function countDhikr(
  order: number,
  target: number,
  by = 1,
): Promise<AdhkarCountResult> {
  return enqueueWrite(async () => {
    const [current, goal] = await Promise.all([
      readDailyState(),
      getAdhkarWirdGoal(),
    ]);

    const cap = Math.max(1, Math.floor(target));
    const previous = current.counts[order] ?? 0;
    const next = Math.min(previous + by, cap);

    const counts = { ...current.counts };
    if (next > 0) counts[order] = next;
    else delete counts[order];

    const completedNow = next >= cap && previous < cap;

    const doneOrders = current.doneOrders;
    const shouldCountInWird =
      goal !== null && completedNow && !doneOrders.includes(order);
    if (shouldCountInWird) doneOrders.push(order);

    const state = await persist({
      day: current.day,
      counts,
      doneOrders: [...new Set(doneOrders)],
      currentIndex: current.currentIndex,
    });

    return { state, completedNow, wirdCountedNow: shouldCountInWird };
  });
}

// ضبط العدّاد على قيمة مطلقة؛ ضبطُه على صفر يخرج الذكر من سجلّ الورد أيضًا، وإلا بقي "منجزًا" بعد إعادة العدّاد.
export async function setAdhkarCount(
  order: number,
  count: number,
): Promise<AdhkarCountResult> {
  return enqueueWrite(async () => {
    const current = await readDailyState();
    const clean = Math.max(0, Math.floor(count));
    const counts = { ...current.counts };
    if (clean > 0) counts[order] = clean;
    else delete counts[order];

    const doneOrders =
      clean === 0 ? current.doneOrders.filter((item) => item !== order) : current.doneOrders;

    const state = await persist({
      day: current.day,
      counts,
      doneOrders: [...new Set(doneOrders)],
      currentIndex: current.currentIndex,
    });
    return { state, completedNow: false, wirdCountedNow: false };
  });
}

/** يحفظ موضع المتابعة داخل ترتيب اليوم (لا يمسّ العدّاد ولا الورد). */
export async function setAdhkarCurrentIndex(
  index: number,
): Promise<AdhkarDailyState> {
  return enqueueWrite(async () => {
    const current = await readDailyState();
    const clean = Math.max(0, Math.floor(index));
    if (clean === current.currentIndex) return current;
    return persist({ ...current, currentIndex: clean });
  });
}

/** لقطة اليوم المرجعية كما تراها كل الشاشات. */
export async function getAdhkarDailyState(): Promise<AdhkarDailyState> {
  return readDailyState();
}

// الحسابات — دوال نقية (بلا تخزين) حتى يمكن اختبارها وحدها.

export type AdhkarWirdProgress = {
  dailyGoal: number;
  /** عدد الأذكار المنجزة اليوم = طول doneOrders (مشتقّ، لا مخزَّن مرتين). */
  completed: number;
  /** max(dailyGoal - completed, 0). */
  remaining: number;
  /** dailyGoal > 0 ? min(completed / dailyGoal, 1) : 0. */
  progress: number;
  isComplete: boolean;
  hasGoal: boolean;
  doneOrders: number[];
  /** فهرس المتابعة المحفوظ في السجلّ. */
  currentIndex: number;
};

export function emptyAdhkarProgress(): AdhkarWirdProgress {
  return {
    dailyGoal: 0,
    completed: 0,
    remaining: 0,
    progress: 0,
    isComplete: false,
    hasGoal: false,
    doneOrders: [],
    currentIndex: 0,
  };
}

export function computeAdhkarWirdProgress(
  goal: AdhkarWirdGoal | null,
  today: AdhkarDailyState | null,
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
    currentIndex: today?.currentIndex ?? 0,
  };
}

/** كل ما تحتاجه الشاشات في لقطة واحدة: الهدف + تقدّم اليوم. */
export async function getAdhkarWirdSummary(): Promise<{
  goal: AdhkarWirdGoal | null;
  today: AdhkarDailyState | null;
  progress: AdhkarWirdProgress;
}> {
  const [goal, today] = await Promise.all([getAdhkarWirdGoal(), readDailyState()]);
  return { goal, today, progress: computeAdhkarWirdProgress(goal, today) };
}

// يمسح حالة الأذكار والهدف فقط — لا المفضّلة ولا الإعدادات ولا بقية المقاييس.
export async function clearAdhkarData(): Promise<void> {
  return enqueueWrite(async () => {
    await Promise.all([
      removeKey(storageKeys.adhkarDailyV2),
      removeKey(storageKeys.adhkarWirdGoal),
      removeKey(storageKeys.adhkarProgress),
      removeKey(storageKeys.adhkarWirdDay),
    ]);
  });
}