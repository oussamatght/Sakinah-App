/**
 * اختبار منطق الحالة اليومية للأذكار (مشغَّل بـ Node، بلا متصفح).
 *
 * يربط الملف الحقيقي lib/storage/adhkar.ts بخزّن ذاكرة يحاكي AsyncStorage،
 * فيختبرinvariantات يوم الورد مباشرة بلا واجهة رسومية:
 *   - تصفير اليوم التالي مع بقاء الهدف
 *   - الترحيل من المفتاحين القديمين إلى السجلّ الواحد
 *   - عدم احتساب ذكر بلا هدف
 *   - تراكم النقرات السريعة بلا تضاعف في الورد
 *
 * التشغيل: node scripts\test-adhkar-daily.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const MOBILE = path.resolve(__dirname, "..");
const OUT = path.join(os.tmpdir(), "adhkar-daily-test");

// 1) ترجمة الملف الحقيقي إلى CommonJS (أخطاء الأنواع لا تمنع الإخراج).
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const tsc = path.join(MOBILE, "node_modules", ".bin", "tsc.cmd");
const { spawnSync } = require("child_process");
spawnSync(
  tsc,
  [
    path.join(MOBILE, "lib", "storage", "adhkar.ts"),
    "--outDir", OUT,
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--skipLibCheck",
    "--noEmitOnError", "false",
    "--ignoreConfig",
  ],
  { cwd: MOBILE, shell: true, stdio: "ignore" },
);
const compiled = path.join(OUT, "adhkar.js");
if (!fs.existsSync(compiled)) {
  console.error("FAIL: لم يُترجم lib/storage/adhkar.ts");
  process.exit(1);
}

// 2) خزّن ذاكرة يحاكي AsyncStorage، ويُعادل "./client" قبل أي تحميل.
const mem = new Map();
const client = {
  storageKeys: {
    wirdGoal: "wird.goal.v1",
    adhkarProgress: "adhkar.daily.v1",
    adhkarWirdGoal: "adhkar.wird.goal.v1",
    adhkarWirdDay: "adhkar.wird.day.v1",
    adhkarDailyV2: "adhkar.daily.v2",
  },
  readJson: async (key) => {
    const raw = mem.get(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  writeJson: async (key, value) => {
    mem.set(key, JSON.stringify(value));
  },
  removeKey: async (key) => {
    mem.delete(key);
  },
};

const realLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === "./client") return client;
  return realLoad.call(this, request, parent, isMain);
};

const adhkar = require(compiled);

// 3) أدوات التاريخ: نحاكي "اليوم الحالي" بإزاحة مُنشئ Date، لأن
// localDayKey() يستدعي `new Date()` لا Date.now() — فنزاح المُنشئ نفسه.
const REAL_DATE = Date;
const REAL_NOW = Date.now;
let clockOffset = 0;

function shiftDays(days) {
  clockOffset = days * 86400000;
  global.Date = class extends REAL_DATE {
    constructor(...args) {
      if (args.length === 0) super(REAL_NOW() + clockOffset);
      else super(...args);
    }
    static now() {
      return REAL_NOW() + clockOffset;
    }
  };
}
function restoreClock() {
  clockOffset = 0;
  global.Date = REAL_DATE;
}

function dayKey(offsetDays = 0) {
  const d = new Date(REAL_NOW() + offsetDays * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}  = ${JSON.stringify(actual)}`);
  } else {
    failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    console.log(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function checkThat(name, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name} ${detail}`);
    console.log(`  FAIL ${name} ${detail}`);
  }
}

async function scenario(title, fn) {
  console.log(`\n== ${title} ==`);
  mem.clear();
  await fn();
}

(async () => {
  // ---------------------------------------------------------------- 1) يوم جديد
  await scenario("يوم جديد يصفّر التقدّم ويبقي الهدف", async () => {
    mem.set(client.storageKeys.adhkarWirdGoal, JSON.stringify({ target: 10, createdAt: "x" }));
    mem.set(
      client.storageKeys.adhkarDailyV2,
      JSON.stringify({ day: dayKey(-1), counts: { 1: 1 }, doneOrders: [1], currentIndex: 3 }),
    );

    const summary = await adhkar.getAdhkarWirdSummary();
    check("today is local today", summary.today.day, dayKey());
    check("counts reset for a new day", summary.today.counts, {});
    check("doneOrders reset for a new day", summary.today.doneOrders, []);
    check("currentIndex reset for a new day", summary.today.currentIndex, 0);
    check("permanent goal survives the day change", summary.goal.target, 10);
    // هذا هو البلاغ الأصلي: كان يظهر ١/١٠ بسبب يومٍ لا يطابق، يجب ٠/١٠.
    check("wird shows 0 / 10, not 1 / 10", `${summary.progress.completed}/${summary.progress.dailyGoal}`, "0/10");
    checkThat("not complete", summary.progress.isComplete === false);
  });

  // ------------------------------------------------------------- 2) استعادة اليوم
  await scenario("نفس اليوم: يُستعاد التقدّم بأمانة", async () => {
    mem.set(client.storageKeys.adhkarWirdGoal, JSON.stringify({ target: 10, createdAt: "x" }));
    mem.set(
      client.storageKeys.adhkarDailyV2,
      JSON.stringify({ day: dayKey(), counts: { 1: 1 }, doneOrders: [1], currentIndex: 2 }),
    );

    const summary = await adhkar.getAdhkarWirdSummary();
    check("counts restored", summary.today.counts, { 1: 1 });
    check("wird shows 1 / 10", `${summary.progress.completed}/${summary.progress.dailyGoal}`, "1/10");
    check("currentIndex restored", summary.today.currentIndex, 2);
    checkThat("counter and wird agree", summary.today.counts[1] > 0 && summary.today.doneOrders.includes(1));
  });

  // ------------------------------------------------------- 3) ترحيل المفتاحين
  await scenario("ترحيل من مفتاحين قديمين إلى سجلّ واحد (يوم اليوم)", async () => {
    mem.set(client.storageKeys.adhkarWirdGoal, JSON.stringify({ target: 10, createdAt: "x" }));
    mem.set(
      client.storageKeys.adhkarProgress,
      JSON.stringify({ day: dayKey(), counts: { 1: 1 } }),
    );
    mem.set(
      client.storageKeys.adhkarWirdDay,
      JSON.stringify({ day: dayKey(), target: 10, doneOrders: [1] }),
    );

    const summary = await adhkar.getAdhkarWirdSummary();
    check("legacy counts merged", summary.today.counts, { 1: 1 });
    check("legacy wird merged", summary.today.doneOrders, [1]);
    check("migrated wird is consistent", `${summary.progress.completed}/${summary.progress.dailyGoal}`, "1/10");

    await adhkar.countDhikr(2, 1);
    const afterWrite = JSON.parse(mem.get(client.storageKeys.adhkarDailyV2));
    checkThat("v2 record written", afterWrite !== null);
    check("v2 holds both legacy parts", { counts: Object.keys(afterWrite.counts).length, done: afterWrite.doneOrders.length }, { counts: 2, done: 2 });
  });

  // ---------------------------------------------- 4) ترحيل يتجاهل يومًا ماضى
  await scenario("مفاتيح قديمة من يوم ماضٍ لا تُرحَّل", async () => {
    mem.set(client.storageKeys.adhkarWirdGoal, JSON.stringify({ target: 10, createdAt: "x" }));
    mem.set(client.storageKeys.adhkarProgress, JSON.stringify({ day: dayKey(-1), counts: { 1: 1 } }));
    mem.set(client.storageKeys.adhkarWirdDay, JSON.stringify({ day: dayKey(-1), target: 10, doneOrders: [1] }));

    const summary = await adhkar.getAdhkarWirdSummary();
    check("stale legacy counts ignored", summary.today.counts, {});
    check("stale legacy wird ignored", summary.today.doneOrders, []);
    check("wird is 0 / 10", `${summary.progress.completed}/${summary.progress.dailyGoal}`, "0/10");
  });

  // ------------------------------------------------ 5) لا احتساب بلا هدف سائد
  await scenario("ذكر يُتمّ بلا هدف: لا رصيد خفيّ في الورد", async () => {
    const result = await adhkar.countDhikr(1, 1);
    check("counter reached target", result.state.counts[1], 1);
    checkThat("reported as completed", result.completedNow === true);
    check("no wird credit without a goal", result.state.doneOrders, []);
    check("no wird entry reported", result.wirdCountedNow, false);

    // المستخدم يختار الهدف بعد ذلك ⇒ يجب أن يبدأ من صفر لا من ١.
    await adhkar.setAdhkarWirdGoal(10);
    const summary = await adhkar.getAdhkarWirdSummary();
    check("late goal does not inherit phantom credit", `${summary.progress.completed}/${summary.progress.dailyGoal}`, "0/10");
  });

  // ------------------------------------------------- 6) هدف موجود: يُحتسب مرة
  await scenario("بلوغ الهدف يسجّل الذكر في الورد مرّة واحدة", async () => {
    await adhkar.setAdhkarWirdGoal(10);
    const result = await adhkar.countDhikr(1, 3);
    check("counter partial", result.state.counts[1], 1);
    check("no wird credit yet", result.state.doneOrders, []);

    const result2 = await adhkar.countDhikr(1, 3);
    const result3 = await adhkar.countDhikr(1, 3);
    check("counter capped at target", result3.state.counts[1], 3);
    checkThat("completed exactly once", result3.completedNow === true);
    check("wird counted once", result3.state.doneOrders, [1]);

    // ضغطات إضافية بعد بلوغ التكرار لا تُضاعف الإنجاز.
    const extra = await adhkar.countDhikr(1, 3);
    check("still one wird entry", extra.state.doneOrders, [1]);
    check("counter still capped", extra.state.counts[1], 3);
    check("wird now 1 / 10", `${extra.state.doneOrders.length}/10`, "1/10");
  });

  // ------------------------------------------------ 7) نقرات سريعة متزامنة
  await scenario("عشر ضغطات متزامنة: تراكم صحيح بلا تضاعف", async () => {
    await adhkar.setAdhkarWirdGoal(10);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => adhkar.countDhikr(7, 10)),
    );
    const state = results[results.length - 1].state;
    check("ten concurrent taps summed to 10", state.counts[7], 10);
    check("wird has a single entry for that dhikr", state.doneOrders, [7]);

    const summary = await adhkar.getAdhkarWirdSummary();
    check("stored state matches", summary.today.counts[7], 10);
    check("wird matches storage", `${summary.progress.completed}/${summary.progress.dailyGoal}`, "1/10");
  });

  // ---------------------------------------------------- 8) زيادة ١٠ تُتمّ.Record
  await scenario("زيادة ١٠ تُتمّ الذكر والورد في كتابة واحدة", async () => {
    await adhkar.setAdhkarWirdGoal(3);
    const result = await adhkar.countDhikr(32, 100, 10);
    check("counter advanced by ten", result.state.counts[32], 10);
    checkThat("not complete yet", result.completedNow === false);
    check("wird untouched mid-way", result.state.doneOrders, []);

    const done = await adhkar.countDhikr(32, 100, 10);
    check("counter capped", done.state.counts[32], 20);
    check("wird still untouched", done.state.doneOrders, []);

    // المتابعة حتى 100
    let last = done;
    for (let i = 0; i < 8; i += 1) last = await adhkar.countDhikr(32, 100, 10);
    check("counter exactly 100", last.state.counts[32], 100);
    check("wird counted once at completion", last.state.doneOrders, [32]);
  });

  // ------------------------------------------------------- 9) تغيّر الهدف اليومي
  await scenario("تغيير الهدف يغيّر النسبة ولا يمسّ الإنجاز", async () => {
    await adhkar.setAdhkarWirdGoal(10);
    await adhkar.countDhikr(1, 1);
    await adhkar.countDhikr(2, 1);
    check("two completed", (await adhkar.getAdhkarWirdSummary()).progress.completed, 2);

    await adhkar.setAdhkarWirdGoal(2);
    let summary = await adhkar.getAdhkarWirdSummary();
    check("ratio recomputed against new goal", `${summary.progress.completed}/${summary.progress.dailyGoal}`, "2/2");
    checkThat("now complete", summary.progress.isComplete === true);

    await adhkar.setAdhkarWirdGoal(10);
    summary = await adhkar.getAdhkarWirdSummary();
    check("raising goal reopens the wird", `${summary.progress.completed}/${summary.progress.dailyGoal}`, "2/10");
    checkThat("not complete again", summary.progress.isComplete === false);
  });

  // ------------------------------------------------ 10) إلغاء الهدف يمسح الرصيد
  await scenario("إلغاء الهدف يمسح إنجاز اليوم ولا يمسّ العدّادات", async () => {
    await adhkar.setAdhkarWirdGoal(10);
    await adhkar.countDhikr(1, 1);
    await adhkar.countDhikr(2, 1);
    await adhkar.clearAdhkarWirdGoal();
    const summary = await adhkar.getAdhkarWirdSummary();
    check("goal cleared", summary.goal, null);
    check("no hidden credit left", summary.today.doneOrders, []);
    check("counter preserved", summary.today.counts, { 1: 1, 2: 1 });
    checkThat("hasGoal false", summary.progress.hasGoal === false);
  });

  // ------------------------------------------------ 11) إعادة العدّاد تُخرج من الورد
  await scenario("إعادة العدّاد تُخرج الذكر من سجلّ الورد", async () => {
    await adhkar.setAdhkarWirdGoal(10);
    await adhkar.countDhikr(1, 1);
    check("counted in wird", (await adhkar.getAdhkarWirdSummary()).today.doneOrders, [1]);

    await adhkar.setAdhkarCount(1, 0);
    const summary = await adhkar.getAdhkarWirdSummary();
    check("counter cleared", summary.today.counts[1], undefined);
    check("removed from wird", summary.today.doneOrders, []);
    check("wird back to 0 / 10", `${summary.progress.completed}/${summary.progress.dailyGoal}`, "0/10");
  });

  // ------------------------------------------- 12) تغيّر اليوم أثناء التطبيق
  await scenario("عبور منتصف الليل أثناء فتح التطبيق يصفّر الحالة", async () => {
    await adhkar.setAdhkarWirdGoal(10);
    await adhkar.countDhikr(1, 1);
    check("counted before midnight", (await adhkar.getAdhkarWirdSummary()).progress.completed, 1);

    shiftDays(1); // يوم جديد
    const summary = await adhkar.getAdhkarWirdSummary();
    check("state reset after midnight", summary.progress.completed, 0);
    check("day key advanced", summary.today.day, dayKey(1));
    check("goal still there", summary.progress.dailyGoal, 10);

    const result = await adhkar.countDhikr(1, 1);
    check("new-day write is stamped with the new day", result.state.day, dayKey(1));
    check("counter starts from zero on the new day", result.state.counts[1], 1);
    restoreClock();
  });

  // ---------------------------------------------- 13) بيانات تالفة لا تُعطّل
  await scenario("سجلّ تالف أو مفقود البنية يُقرأ كيوم فارغ", async () => {
    await adhkar.setAdhkarWirdGoal(10);
    mem.set(client.storageKeys.adhkarDailyV2, "{not json");
    let summary = await adhkar.getAdhkarWirdSummary();
    check("corrupt json treated as empty", summary.today.counts, {});

    mem.set(client.storageKeys.adhkarDailyV2, JSON.stringify({ counts: { 1: 1 } }));
    summary = await adhkar.getAdhkarWirdSummary();
    check("record without a day treated as empty", summary.today.counts, {});
    check("day filled from local date", summary.today.day, dayKey());
  });

  // ------------------------------------- 14) لا عدّاد بلا ذكر ولا نسبة بلا هدف
  await scenario("حالات حدّية", async () => {
    const summary = await adhkar.getAdhkarWirdSummary();
    check("no goal ⇒ progress 0", summary.progress.progress, 0);
    checkThat("no goal ⇒ not complete", summary.progress.isComplete === false);
    check("remaining does not go negative", summary.progress.remaining, 0);

    await adhkar.setAdhkarWirdGoal(3);
    await adhkar.countDhikr(1, 1);
    await adhkar.countDhikr(2, 1);
    await adhkar.countDhikr(3, 1);
    const done = await adhkar.getAdhkarWirdSummary();
    check("3 / 3", `${done.progress.completed}/${done.progress.dailyGoal}`, "3/3");
    check("progress capped at 1", done.progress.progress, 1);
    check("remaining clamped at 0", done.progress.remaining, 0);

    // إعادة العدّاد بعد الاكتمال تفتح الورد من جديد
    await adhkar.setAdhkarCount(3, 0);
    const reopened = await adhkar.getAdhkarWirdSummary();
    check("wird reopens after reset", `${reopened.progress.completed}/${reopened.progress.dailyGoal}`, "2/3");
    checkThat("not complete", reopened.progress.isComplete === false);
  });

  restoreClock();
  console.log(`\n==== ${pass} passed, ${failures.length} failed ====`);
  if (failures.length > 0) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
})().catch((error) => {
  restoreClock();
  console.error("test crashed:", error);
  process.exit(1);
});