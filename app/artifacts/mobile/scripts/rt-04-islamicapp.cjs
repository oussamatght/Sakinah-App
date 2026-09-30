const H = require("./runtime-harness.cjs");

(async () => {
  const { browser, page } = await H.launch();
  try {
    await H.boot(page);

    // ---------- BOOKS: advanced search with islamicapp ----------
    H.state.phase = "books-advanced";
    await H.clickText(page, "الكتب");
    await H.sleep(3000);

    const mark = H.mark();
    await H.clickText(page, "بحث متقدم");
    await H.sleep(2500);

    // type a term and submit
    await H.typeInto(page, "بحث في الكتب أو المؤلف", "العقيدة");
    await H.sleep(600);
    await H.clickText(page, "بحث");
    await H.sleep(9000);

    const txt = await H.bodyText(page);
    H.dump("20-islamicapp-search.txt", txt);
    console.log("---- TEXT (first 2200) ----");
    console.log(txt.slice(0, 2200));

    const s = H.summarizeRequests(H.requestsSince(mark));
    console.log("\n---- REQUESTS ----");
    console.log(JSON.stringify(s, null, 1));

    console.log("\n---- PHASE-BOUND REQUESTS ----");
    console.log(
      (H.state.requests || []).slice(0, 40).map((r) => `  ${r.url}`).join("\n") || "(none)",
    );
  } finally {
    await browser.close();
  }
})();
