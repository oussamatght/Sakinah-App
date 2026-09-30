const H = require("./runtime-harness.cjs");
const fs = require("fs");

const report = [];
function log(...a) {
  const line = a.join(" ");
  report.push(line);
  console.log(line);
}

function shortUrl(u) {
  return u
    .replace("https://api.turath.io", "TURATH")
    .replace("https://api3.islamhouse.com/v3/paV29H2gm56kvLPy", "IH")
    .replace("https://api.hadeethenc.com", "HADEETHENC")
    .replace("https://hadis-api-id", "HADISID");
}

function phaseReqs(mark, name) {
  const reqs = H.requestsSince(mark).map(shortUrl);
  log(`\n### requests [${name}] = ${reqs.length}`);
  reqs.forEach((u, i) => log(`   ${i + 1}. ${u}`));
  const dup = H.summarizeRequests(H.requestsSince(mark)).dupes;
  if (dup.length) {
    log("   !! DUPLICATES:");
    dup.forEach(([u, c]) => log(`      x${c}  ${shortUrl(u)}`));
  }
  return reqs;
}

(async () => {
  const { browser, page } = await H.launch();
  try {
    await H.boot(page);

    // =============== 1. BOOKS ===============
    H.state.phase = "books";
    let m = H.mark();
    await H.clickText(page, "الكتب");
    await H.sleep(6000);
    log("=== 1. Books screen open ===");
    phaseReqs(m, "books open");

    // =============== 2. SIMPLE SEARCH ===============
    H.state.phase = "simple-search";
    m = H.mark();
    await H.typeInto(page, "ابحث في شجرة الكتب", "العقيدة");
    await H.sleep(9000);
    log("\n=== 2. Simple search «العقيدة» ===");
    phaseReqs(m, "simple search");
    log("\nbooks visible after search:");
    log((await H.bodyText(page)).split("\n").slice(-25).join("\n"));

    // =============== 3. ADVANCED SEARCH: category ===============
    H.state.phase = "adv-category";
    m = H.mark();
    await H.clickLabel(page, "بحث متقدم");
    await H.sleep(5000);
    log("\n=== 3. Advanced sheet open ===");
    const sheetText = await H.bodyText(page);
    log(sheetText.split("\n").slice(-60).join("\n"));
    phaseReqs(m, "advanced sheet open");

    // pick a real branch then submit
    m = H.mark();
    const pickedBranch = await H.clickLabel(page, "تصنيف العقيدة");
    await H.sleep(4000);
    log("\n--- clicked branch «العقيدة» (also expands children) ---");
    phaseReqs(m, "pick branch");
    const afterBranch = await H.bodyText(page);
    log(afterBranch.split("\n").slice(-45).join("\n"));

    m = H.mark();
    const submitted = await H.clickText(page, "بحث");
    await H.sleep(9000);
    log("\n=== 3b. Category-only search submitted ====");
    phaseReqs(m, "category search");
    let t = await H.bodyText(page);
    H.dump("20-adv-category.txt", t);
    log(t.split("\n").slice(-60).join("\n"));

    // =============== 4. PAGINATION ===============
    H.state.phase = "pagination";
    m = H.mark();
    const nextOk = await H.clickLabel(page, "الصفحة التالية");
    await H.sleep(9000);
    log(`\n=== 4. Pagination next (clicked=${nextOk}) ===`);
    phaseReqs(m, "page 2");

    // back to page 1 -> should be from cache
    m = H.mark();
    await H.clickLabel(page, "الصفحة السابقة");
    await H.sleep(3500);
    const backReqs = phaseReqs(m, "back to page 1 (cache?)");
    log(`   -> refetch on cached page 1: ${backReqs.length} request(s)`);

    // =============== 5. COMBINED: text + category ===============
    H.state.phase = "adv-combined";
    await H.clickLabel(page, "بحث متقدم");
    await H.sleep(3000);
    await H.typeInto(page, "كلمة البحث", "العقيدة");
    await H.sleep(500);
    m = H.mark();
    await H.clickText(page, "بحث");
    await H.sleep(10000);
    log("\n=== 5. Combined: text + category ===");
    phaseReqs(m, "combined search");
    t = await H.bodyText(page);
    H.dump("21-adv-combined.txt", t);
    log(t.split("\n").slice(-55).join("\n"));

    // =============== 6. SOURCE FILTER ===============
    H.state.phase = "adv-source";
    await H.clickLabel(page, "بحث متقدم");
    await H.sleep(3000);
    await H.clickLabel(page, "مصدر تراث");
    await H.sleep(500);
    m = H.mark();
    await H.clickText(page, "بحث");
    await H.sleep(10000);
    log("\n=== 6. Source = turath only ===");
    phaseReqs(m, "source filter turath");
    t = await H.bodyText(page);
    H.dump("22-source-turath.txt", t);
    log(t.split("\n").slice(-50).join("\n"));

    // =============== 7. RESET ===============
    H.state.phase = "reset";
    m = H.mark();
    const resetOk = await H.clickLabel(page, "مسح الفلاتر");
    await H.sleep(6000);
    log(`\n=== 7. Reset/clear filters (clicked=${resetOk}) ===`);
    phaseReqs(m, "after reset");

    fs.writeFileSync(`${H.OUT}/report-books.txt`, report.join("\n"));
    log("\n\nCONSOLE ISSUES:\n" + (H.state.console.slice(0, 15).join("\n") || "(none)"));
  } finally {
    await browser.close();
  }
})();
