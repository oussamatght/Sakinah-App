/**
 * يفتح كتابًا من islamic.app ثم «ابدأ القراءة» ويتحقق أن نص الصفحة ظهر فعلًا.
 * الهدف: منع تكرار عطل «الصفحة فارغة + Query data cannot be undefined».
 */
const H = require("./runtime-harness.cjs");

/** كل تحذيرات/أخطاء الـ console كما جمعها الـ harness. */
function consoleLines() {
  return (H.state.console || [])
    .map((entry) => (entry && entry.text) || String(entry))
    .filter((t) => /error|warn/i.test(t));
}

(async () => {
  const { browser, page } = await H.launch();
  try {
    await H.boot(page);

    H.state.phase = "books-search";
    await H.clickText(page, "الكتب");
    await H.sleep(2500);

    // ابحث بكلمة عربية تصل إلى إسلاميك
    H.state.phase = "search";
    await H.typeInto(page, "ابحث في شجرة الكتب", "صحيحة");
    await H.sleep(8000);

    console.log("---- LIST (first 1000) ----");
    console.log((await H.bodyText(page)).slice(0, 1000));

    // افتح أول بطاقة كتاب. تحذير: "فتح " يطابق اختصارات الشاشة الرئيسية
    // («فتح مواقيت الصلاة»…)، فنقتصد بالبطاقة التي تحمل شارة مصدر
    // (تراث / إسلام هاوس / إسلاميك / PDF) — هذه بطاقة كتاب قطعًا.
    H.state.phase = "open-book";
    const cardLabel = await page.evaluate(() => {
      const hit = Array.from(document.querySelectorAll("[aria-label]")).find((n) => {
        const label = n.getAttribute("aria-label") || "";
        const text = n.innerText || "";
        const isCard =
          text.includes("إسلاميك") ||
          text.includes("إسلام هاوس") ||
          text.includes("تراث") ||
          text.includes("PDF");
        return isCard && label.startsWith("فتح ");
      });
      if (!hit) return null;
      hit.scrollIntoView({ block: "center" });
      hit.click();
      return hit.getAttribute("aria-label");
    });
    console.log("\nopened card:", cardLabel);
    await H.sleep(8000);

    const details = await H.bodyText(page);
    H.dump("30-details.txt", details);
    console.log("\n---- DETAILS (first 1500) ----");
    console.log(details.slice(0, 1500));

    const onDetails = /تفاصيل الكتاب/.test(details);
    console.log("\nreached details screen:", onDetails);

    // اضغط «ابدأ القراءة»
    H.state.phase = "reader";
    const read = await H.clickText(page, "ابدأ القراءة");
    console.log("clicked start-reading:", read);
    await H.sleep(10000);

    const readerText = await H.bodyText(page);
    H.dump("31-reader.txt", readerText);
    console.log("\n---- READER (first 2000) ----");
    console.log(readerText.slice(0, 2000));

    const hasError =
      /تعذر تحميل|تعذّر|لا يوجد اتصال|حدثت مشكلة|لا توجد هذه الصفحة|لا يوجد نص متاح|رابط الكتاب غير مكتمل/.test(
        readerText,
      );
    const readerOpen = /الصفحة السابقة|الصفحة التالية|الفهرس/.test(readerText);
    console.log("\nreader screen open:", readerOpen);
    console.log("reader shows error state:", hasError);
    console.log("reader visible text length:", readerText.replace(/\s+/g, " ").trim().length);

    console.log("\n---- DUPLICATE-KEY / UNDEFINED-DATA ----");
    const bad = consoleLines().filter((t) => /same key|cannot be undefined/i.test(t));
    console.log(bad.length ? bad.join("\n") : "(none)");

    console.log("\n---- CONSOLE ERRORS/WARNINGS (last 20) ----");
    console.log(consoleLines().slice(-20).join("\n") || "(none)");

    console.log("\n---- REQUESTS ----");
    console.log(JSON.stringify(H.summarizeRequests(H.requestsSince(0)), null, 1));
  } finally {
    await browser.close();
  }
})();
