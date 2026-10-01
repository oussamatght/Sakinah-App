/** يفحص بنية بيانات الأذكار الحقيقية: عدد العناصر وقيمة type ودلالتها. */
const fs = require("fs");
const URL =
  "https://raw.githubusercontent.com/Seen-Arabic/Morning-And-Evening-Adhkar-DB/main/ar.json";

(async () => {
  const res = await fetch(URL);
  const data = await res.json();
  const out = [];
  out.push(`total: ${data.length}`);
  out.push(`fields: ${Object.keys(data[0]).join(", ")}`);

  const byType = new Map();
  for (const d of data) {
    const key = String(d.type);
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key).push(d);
  }
  out.push(`\ntype values: ${[...byType.keys()].join(", ")}`);

  for (const [type, items] of [...byType.entries()].sort()) {
    out.push(`\n=========== type=${type}  (${items.length} items) ===========`);
    for (const d of items) {
      out.push(`--- order=${d.order} count=${d.count}`);
      out.push(`content: ${String(d.content).slice(0, 220)}`);
      out.push(`count_description: ${String(d.count_description).slice(0, 120)}`);
      out.push(`fadl: ${String(d.fadl).slice(0, 200)}`);
      out.push(`source: ${String(d.source).slice(0, 180)}`);
      out.push(
        `audio: ${JSON.stringify(d.audio)} | hadith_text: ${String(d.hadith_text).slice(0, 120)} | vocab: ${String(d.explanation_of_hadith_vocabulary).slice(0, 80)}`,
      );
    }
  }

  // إحصاءات جودة البيانات
  const stats = {
    emptyContent: data.filter((d) => !String(d.content ?? "").trim()).length,
    emptyFadl: data.filter((d) => !String(d.fadl ?? "").trim()).length,
    emptySource: data.filter((d) => !String(d.source ?? "").trim()).length,
    emptyCountDescription: data.filter(
      (d) => !String(d.count_description ?? "").trim(),
    ).length,
    emptyAudio: data.filter((d) => !String(d.audio ?? "").trim()).length,
    emptyHadith: data.filter((d) => !String(d.hadith_text ?? "").trim()).length,
    distinctCounts: [...new Set(data.map((d) => d.count))].sort((a, b) => a - b),
    ordersAreSequential:
      JSON.stringify(data.map((d) => d.order)) ===
      JSON.stringify(data.map((_, i) => i + 1)),
  };
  out.push("\n=========== DATA QUALITY ===========");
  out.push(JSON.stringify(stats, null, 1));

  const dir = process.env.TEMP || ".";
  const target = `${dir}/adhkar-shape.txt`;
  fs.writeFileSync(target, out.join("\n"), "utf8");
  console.log("written:", target);
})();