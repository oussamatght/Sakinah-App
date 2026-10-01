const H = require("./runtime-harness.cjs");

// Correlate every request with its response so we can tell a real second fetch
// apart from fetchJsonRetry re-attempting a failed/flaky upstream call.
(async () => {
  const { browser, page } = await H.launch();

  page.on("requestfinished", (req) => {
    if (!H.API_RE || true) {}
  });

  try {
    await H.boot(page);
    await H.clickText(page, "الكتب");
    await H.sleep(6000);

    // Track request->response pairing by url + ordinal.
    // نمرّر على مصادر الكتب الثلاثة (بما فيها islamic.app) وإلا بدا المشهد
    // كأن islamicapp لا يُطلب أصلًا.
    const BOOKS_API_RE = /api\.turath\.io|api3\.islamhouse\.com|api\.islamic\.app/;
    const shortUrl = (u) =>
      u
        .replace("https://api.turath.io", "TURATH")
        .replace("https://api3.islamhouse.com/v3/paV29H2gm56kvLPy", "IH")
        .replace("https://api.islamic.app/v1/library", "IA");
    const pairs = [];
    page.on("response", (res) => {
      const u = res.url();
      if (!BOOKS_API_RE.test(u)) return;
      pairs.push({ status: res.status(), url: u, at: Date.now() });
    });
    const failed = [];
    page.on("requestfailed", (req) => {
      const u = req.url();
      if (!BOOKS_API_RE.test(u)) return;
      failed.push({ url: u, err: req.failure()?.errorText, at: Date.now() });
    });

    const t0 = Date.now();
    await H.typeInto(page, "ابحث في شجرة الكتب", "العقيدة");
    await H.sleep(14000);
    const t1 = Date.now();

    console.log(`\n=== SIMPLE SEARCH: request/response accounting (${t1 - t0}ms) ===`);
    const reqs = H.state.log.filter((e) => e.t === "req" && e.phase === "simple-search-diag");
    console.log(`total requests seen: ${reqs.length}`);
    console.log(`responses: ${pairs.length}, requestfailed: ${failed.length}`);

    console.log("\n-- responses (status) --");
    const byStatus = {};
    for (const p of pairs) {
      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    }
    console.log(JSON.stringify(byStatus));

    console.log("\n-- failed/errored requests --");
    if (!failed.length) console.log("(none)");
    failed.forEach((f) => console.log(`   ${f.err}  ${f.url.slice(0, 120)}`));

    console.log("\n-- timeline (relative ms) --");
    const all = [
      ...reqs.map((r) => ({ at: r.at ?? 0, kind: "REQ", url: r.url })),
      ...pairs.map((p) => ({ at: p.at - t0, kind: `RES${p.status}`, url: p.url })),
      ...failed.map((f) => ({ at: f.at - t0, kind: `FAIL:${f.err}`, url: f.url })),
    ].sort((a, b) => a.at - b.at);
    all.forEach((e) =>
      console.log(
        `  +${String(e.at).padStart(6)}ms ${e.kind.padEnd(8)} ${shortUrl(e.url).slice(0, 110)}`,
      ),
    );

    // A true React Query duplicate would appear as two REQ entries for the same
    // URL with a successful RES between them. Count sequential successful repeats.
    console.log("\n-- same-URL successful repeats (=> genuine duplicate fetch) --");
    const succ = new Map();
    let dupes = 0;
    for (const p of pairs.sort((a, b) => a.at - b.at)) {
      if (p.status < 400) {
        const c = succ.get(p.url) || 0;
        succ.set(p.url, c + 1);
        if (c > 0) dupes++;
      }
    }
    for (const [u, c] of succ) {
      const tag = c > 1 ? `  <-- ${c}x` : "";
      console.log(`   ${c}x ${shortUrl(u).slice(0, 110)}${tag}`);
    }
    console.log(`\ngenuine successful duplicate fetches: ${dupes}`);
  } finally {
    await browser.close();
  }
})();
