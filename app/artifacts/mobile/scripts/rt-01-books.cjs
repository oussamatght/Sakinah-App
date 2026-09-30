const H = require("./runtime-harness.cjs");

(async () => {
  const { browser, page } = await H.launch();
  try {
    await H.boot(page);

    // ---------- BOOKS TAB ----------
    H.state.phase = "books-open";
    let m = H.mark();
    const opened = await H.clickText(page, "الكتب");
    await H.sleep(7000);
    let txt = await H.bodyText(page);
    H.dump("10-books-open.txt", txt);
    console.log("clicked الكتب:", opened);
    console.log("---- BOOKS TEXT ----");
    console.log(txt.slice(0, 1500));

    const s = H.summarizeRequests(H.requestsSince(m));
    console.log("\nrequests on books open:", JSON.stringify(s, null, 1));

    // what clickable things exist?
    const labels = await page.evaluate(() => {
      const set = new Set();
      document.querySelectorAll("[aria-label]").forEach((n) => set.add(n.getAttribute("aria-label")));
      return [...set].slice(0, 60);
    });
    console.log("\n--- aria-labels on books screen ---");
    console.log(labels.join("\n"));
  } finally {
    await browser.close();
  }
})();
