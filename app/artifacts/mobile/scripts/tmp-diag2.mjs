/**
 * تشخيص نهائي: لماذا ما زالت الدرجة undefined؟
 * يتتبع كل خطوة في fetchMatchedGradeFromFawaz يدويًا.
 */
const FAWAZ = "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions";
const HADIS = "https://hadis-api-id.vercel.app";

function comparableHead(text) {
  return text
    .slice(0, 80)
    .replace(/[،؛,;:!؟?"'()\[\]«»<>«»\.]/g, "")
    .replace(/\u0640/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function headSimilarity(a, b) {
  const x = comparableHead(a);
  const y = comparableHead(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  let i = 0;
  const min = Math.min(x.length, y.length);
  while (i < min && x[i] === y[i]) i++;
  return i / Math.max(x.length, y.length);
}

async function main() {
  const primary = await (await fetch(`${HADIS}/hadith/tirmidzi/5`)).json();
  const fawaz = await (await fetch(`${FAWAZ}/ara-tirmidhi/5.json`)).json();
  const rec = fawaz.hadiths.find((h) => h.hadithnumber === 5);
  console.log("primary head:", JSON.stringify(comparableHead(primary.arab)).slice(0, 110));
  console.log("fawaz head:  ", JSON.stringify(comparableHead(rec.text)).slice(0, 110));
  const sim = headSimilarity(primary.arab, rec.text);
  console.log("similarity:", sim.toFixed(3), "| pass(>=0.5):", sim >= 0.5);
  console.log("first grade:", rec.grades?.[0]);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
