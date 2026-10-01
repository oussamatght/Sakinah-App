/**
 * فحص الأذكار أثناء التشغيل (Chrome/web):
 *   1) شاشة الأذكار تعرض أذكارًا حقيقية (لا نصًّا ثابتًا ولا JSON).
 *   2) البحث المحلي يصفّي بلا أي طلب شبكة إضافي (فهرس الفكرة: "الصمد").
 *   3) التصنيفات الثلاثة مشتقّة من type (صباح/مساء/عام) وتصفّي فعلًا.
 *   4) فتح ذكر → العدّاد يعمل ويحفَظ بعد إعادة التحميل (AsyncStorage).
 *   5) طلب واحد فقط لمصدر الأذكار في الجلسة كلها.
 *   6) لا أخطاء console (nested lists / duplicate keys / undefined data).
 */
const H = require("./runtime-harness.cjs");

const ADHKAR_API = /raw\.githubusercontent\.com\/Seen-Arabic/i;

/**
 * حذف التشكيل فقط — للمقارنة بنصوص الواجهة ("أتممت الذكر" تبقى كما هي).
 */
function stripMarks(text) {
  return String(text).replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "");
}

/**
 * تطبيع كامل (حذف التشكيل + توحيد الهمزات) — لمطابقة ما يكتبه المستخدم
 * بما في المصدر ("الصمد" ↔ "ٱلصَّمَدُ").
 */
function plain(text) {
  return stripMarks(text)
    .replace(/[ٱأإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

/** يقرأ نصًا من aria-label (placeholder لا يظهر في innerText). */
function labelsOf(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[aria-label]"))
      .map((n) => n.getAttribute("aria-label") || "")
      .join(" | "),
  );
}

function consoleLines() {
  return (H.state.console || [])
    .map((entry) => (entry && entry.text) || String(entry))
    .filter((t) => /error|warn/i.test(t));
}

/** نقر حقيقي بمؤشّر حقيقي — Pressable في RNW يستمع على pointerdown/up. */
async function clickAt(page, selectorFnSource, label) {
  const box = await page.evaluate((src) => {
    const find = new Function("return " + src)();
    const target = find();
    if (!target) return null;
    target.scrollIntoView({ block: "center" });
    const r = target.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, selectorFnSource);
  if (!box) {
    console.log(`  click "${label}": NOT FOUND`);
    return false;
  }
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await H.sleep(120);
  await page.mouse.up();
  console.log(`  click "${label}": ok`);
  return true;
}

const byTestId = (id) =>
  `() => { const n = document.querySelector('[data-testid="${id}"]'); ` +
  `if (n) return n; return Array.from(document.querySelectorAll('div,span,button,a,[role="button"]'))` +
  `.filter(x => (x.innerText||'').includes(${JSON.stringify(id)}))[0] || null; }`;

(async () => {
  const { browser, page } = await H.launch();
  try {
    await H.boot(page);

    // ---------------------------------------------------------------- 1) القائمة
    H.state.phase = "adhkar-tab";
    const opened = await H.clickText(page, "الأذكار");
    console.log("clicked الأذكار tab:", opened);
    await H.sleep(9000);

    const listText = await H.bodyText(page);
    H.dump("40-adhkar-list.txt", listText);
    console.log("\n---- LIST (first 1400) ----");
    console.log(listText.slice(0, 1400));

    const labels = await labelsOf(page);
    const flat = stripMarks(listText);
    const onList = /الأذكار/.test(flat) && /ابحث في الأذكار/.test(labels);
    const showsRealText = /الحمد لله وحده/.test(flat);
    const showsJsonLeak = /"content"|"order"|undefined|\[object/.test(listText);
    const showsPlaceholder = /افتح الأذكار لقرا/.test(flat);
    console.log("\non adhkar screen:", onList);
    console.log("search input present:", /ابحث في الأذكار/.test(labels));
    console.log("shows real Arabic dhikr text:", showsRealText);
    console.log("leaks raw JSON / undefined:", showsJsonLeak);
    console.log("still shows placeholder copy:", showsPlaceholder);
    console.log("dhikr cards in DOM:", (listText.match(/ذكرًا/g) || []).length > 0 ? "list header ok" : "?" );

    // ------------------------------------------------------ 5) طلب واحد للمصدر
    const adhkarReqs = H.state.log.filter(
      (e) => e.t === "req" && ADHKAR_API.test(e.url),
    );
    console.log("adhkar API requests so far:", adhkarReqs.length);

    // ------------------------------------------------- 2b) هدف الورد يختاره المستخدم
    H.state.phase = "wird-goal";
    await clickAt(page, byTestId("adhkar-goal-3"), "هدف ٣ أذكار");
    await H.sleep(1800);
    console.log(
      "wird card appeared after choosing goal:",
      /وردك اليوم/.test(stripMarks(await H.bodyText(page))),
    );

    // --------------------------------------------------------------- 2) البحث
    H.state.phase = "search";
    const markSearch = H.mark();
    await H.typeInto(page, "ابحث في الأذكار", "الصمد");
    await H.sleep(2500);
    const searchText = await H.bodyText(page);
    console.log("\n---- SEARCH \"الصمد\" (first 500) ----");
    console.log(stripMarks(searchText).slice(0, 500));
    const foundSad = /الصمد/.test(plain(searchText));
    console.log("search matched (tashkeel-insensitive):", foundSad);

    const searchReqs = H.requestsSince(markSearch).filter((u) => ADHKAR_API.test(u));
    console.log("network requests caused by typing:", searchReqs.length, "(expect 0)");

    // نتيجة فارغة = لا نتائج
    await H.typeInto(page, "ابحث في الأذكار", "زقزققةلاتميمييز");
    await H.sleep(2000);
    const emptyText = await H.bodyText(page);
    console.log("empty-search message shown:", /لم نجد ذكرا/.test(stripMarks(emptyText)));

    await H.typeInto(page, "ابحث في الأذكار", "");
    await H.sleep(1500);

    // ------------------------------------------------------------ 3) التصنيفات
    H.state.phase = "categories";
    const morningMark = H.mark();
    await clickAt(page, byTestId("adhkar-filter-morning"), "تصفية أذكار الصباح");
    await H.sleep(2000);
    const morningText = await H.bodyText(page);
    const morningOnly = /أذكار الصباح/.test(morningText);
    console.log("\nmorning filter applied:", morningOnly);
    console.log(
      "requests caused by filtering:",
      H.requestsSince(morningMark).filter((u) => ADHKAR_API.test(u)).length,
      "(expect 0)",
    );
    const countsMorning = (morningText.match(/ذكرًا/g) || []).length;
    console.log("morning category label count in body:", countsMorning);
    await clickAt(page, byTestId("adhkar-filter-all"), "تصفية الكل");
    await H.sleep(1500);

    // ------------------------------------------------------- 6) فتح ذكر + عدّاد
    H.state.phase = "practice";
    const openedCard = await clickAt(page, byTestId("dhikr-card-1"), "أول بطاقة ذكر");
    console.log("opened a dhikr card:", openedCard);
    await H.sleep(6000);

    const practiceText = await H.bodyText(page);
    H.dump("41-adhkar-practice.txt", practiceText);
    console.log("\n---- PRACTICE (first 1600) ----");
    console.log(stripMarks(practiceText).slice(0, 1600));

    const flatPractice = stripMarks(practiceText);
    const hasCounter = /من \d+/.test(flatPractice) && /اضغط للعد|أتممت الذكر/.test(flatPractice);
    const showsSource = /المصدر/.test(flatPractice);
    const showsNav = /السابق/.test(flatPractice) && /التالي/.test(flatPractice);
    console.log("\npractice screen with counter:", hasCounter);
    console.log("shows source (تخريج):", showsSource);
    console.log("shows prev/next navigation:", showsNav);

    /** رقم الذكر المطلوب (من التسمية) — التكرار الحقيقي من المصدر. */
    const before = await page.evaluate(() => {
      const n = document.querySelector('[data-testid="dhikr-counter"]');
      const label = n ? n.getAttribute("aria-label") : "";
      const m = label.match(/(\d+)\s+من\s+(\d+)/);
      return m ? { count: Number(m[2]) } : null;
    });
    console.log("counter target from source:", JSON.stringify(before));

    // اضغط العدّاد حتى يبلغ التكرار الحقيقي
    const taps = Math.min(before ? before.count : 1, 6);
    for (let i = 0; i < taps; i += 1) {
      await clickAt(page, byTestId("dhikr-counter"), `عدّاد #${i + 1}`);
      await H.sleep(700);
    }
    let countedText = stripMarks(await H.bodyText(page));
    console.log(`counter after ${taps} taps reached target:`, /أتممت الذكر/.test(countedText));

    // ------------------------------------------------- 4) الثبات بعد إعادة التحميل
    H.state.phase = "persistence";
    await page.reload({ waitUntil: "domcontentloaded" });
    await H.sleep(12000);
    const afterReload = stripMarks(await H.bodyText(page));
    const persisted = /عدّ الذكر|أتممت الذكر/.test(afterReload);
    console.log("\ncounter persisted across reload:", persisted);

    // ------------------------- 5) مزامنة القائمة مع شاشة الذكر (مراقب مشترك)
    // إتمام ذكر في شاشة الذكر يجب أن ينعكس فورًا على القائمة والورد عند العودة،
    // وإلا بقيت القائمة تعرض تقدّمًا قديمًا.
    H.state.phase = "sync-back";
    await page.evaluate(() => {
      window.history.pushState({}, "", "/dhikr");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await H.sleep(6000);
    const backOnList = stripMarks(await H.bodyText(page));
    console.log("\n---- BACK ON LIST ----");
    console.log(backOnList.slice(0, 400));
    const cardSynced = /أتممت الذكر/.test(backOnList);
    const wirdSynced = /1\s*\/\s*3/.test(backOnList);
    console.log("completed dhikr shown as done on the card:", cardSynced);
    console.log('wird counter updated to "1 / 3":', wirdSynced);

    // ------------------------------- 6) زر "زيادة ١٠" يُتمّ الورد كما تفعل النقرة
    // المصدر فيه ثلاثة أذكار تكرارها ١٠٠ (order 32/33/34) ⇒ نختبر 32.
    H.state.phase = "add-ten";
    console.log("\n---- ADD TEN PHASE ----");
    await H.typeInto(page, "ابحث في الأذكار", "");
    await H.sleep(2000);
    await clickAt(page, byTestId("dhikr-card-32"), "بطاقة ذكر ٣٢");
    await H.sleep(5000);
    const bigTarget = await page.evaluate(() => {
      const n = document.querySelector('[data-testid="dhikr-counter"]');
      const m = (n ? n.getAttribute("aria-label") : "").match(/(\d+)\s+من\s+(\d+)/);
      return m ? Number(m[2]) : 0;
    });
    console.log("big dhikr target from source:", bigTarget, "(expect 100)");
    const hasAddTen = await page.evaluate(
      () => !!document.querySelector('[data-testid="dhikr-add-ten"]'),
    );
    console.log('"زيادة ١٠" shown for the 100-count dhikr:', hasAddTen);

    // ١٠ ضغطات × ١٠ = ١٠٠ ⇒ يجب أن يُتمّ الورد مثل النقرة الواحدة تمامًا
    for (let i = 0; i < 10; i += 1) {
      await clickAt(page, byTestId("dhikr-add-ten"), `زيادة ١٠ #${i + 1}`);
      await H.sleep(500);
    }
    await H.sleep(2500);
    const afterTen = stripMarks(await H.bodyText(page));
    const counterNow = (afterTen.match(/(\d+)\s+من\s+(\d+)/) || [])[1] || "?";
    console.log("count after ten add-ten presses:", counterNow, "(expect 100)");
    console.log("add-ten completed the dhikr:", /أتممت الذكر/.test(afterTen));

    await page.evaluate(() => {
      window.history.pushState({}, "", "/dhikr");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await H.sleep(5000);
    const wirdAfter = stripMarks(await H.bodyText(page));
    console.log('wird updated to "2 / 3" after add-ten:', /2\s*\/\s*3/.test(wirdAfter));

    const finalReqs = H.state.log.filter((e) => e.t === "req" && ADHKAR_API.test(e.url));
    console.log("total adhkar API requests in session:", finalReqs.length, "(expect 1)");

    // ---------------------------------------------------------------- الأخطاء
    console.log("\n---- NESTED LIST / DUPLICATE KEY / UNDEFINED DATA ----");
    const structural = consoleLines().filter((t) =>
      /same key|cannot be undefined|VirtualizedLists|nested|nonexhaustive|deprecat/i.test(t),
    );
    console.log(structural.length ? structural.join("\n") : "(none)");

    console.log("\n---- CONSOLE ERRORS/WARNINGS (last 15) ----");
    console.log(consoleLines().slice(-15).join("\n") || "(none)");

    console.log("\n---- REQUESTS ----");
    console.log(JSON.stringify(H.summarizeRequests(H.requestsSince(0)), null, 1));
  } finally {
    await browser.close();
  }
})();