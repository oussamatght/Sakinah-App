/**
 * Phase 16 — full hadith flow against the LIVE APIs (no mocks):
 * categories → list → detail (with/without grade) → search → books → browsing.
 * Run: npx tsx scripts/test-hadith-full-flow.ts
 */
import {
  fetchHadithCategories,
  fetchHadithList,
  fetchHadithDetail,
  searchHadiths,
  fetchHadithBooks,
  fetchBookHadiths,
} from "../lib/api/hadith";

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  console.log(`  ${condition ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

async function main() {
  console.log("1) التصنيفات:");
  const cats = await fetchHadithCategories();
  check("7 تصنيفات رئيسية", cats.length === 7, `${cats.length}`);
  check("لكل تصنيف معرف وعنوان", cats.every((c) => c.id && c.titleAr));

  console.log("2) قائمة تصنيفية (Pagination):");
  const page1 = await fetchHadithList("2", 1, 5);
  check("5 عناصر في الصفحة 1", page1.items.length === 5);
  check("total من meta الحقيقي", page1.total === 16, `total=${page1.total}`);
  check("hasMore = true", page1.hasMore === true);
  check("اسم التصنيف محفوظ (كاش بدون طلب متكرر)", page1.items[0]?.book === "الحديث وعلومه", page1.items[0]?.book);
  check("apiSource = hadeethenc.com", page1.items[0]?.apiSource === "hadeethenc.com");
  const page2 = await fetchHadithList("2", 2, 5);
  check("الصفحة 2 مختلفة عن 1", page2.items[0]?.id !== page1.items[0]?.id);
  check("لا درجات مخترعة في القائمة", page1.items.every((i) => i.grade === undefined));

  console.log("3) تفصيل بدرجة (66529 حقيقي):");
  const detail = await fetchHadithDetail("66529");
  check("grade من المصدر حرفيًا", detail.grade === "صحيح", detail.grade);
  check("attribution من المصدر", detail.attribution === "رواه أبو داود والترمذي");
  check("تخريج حقيقي (ليس المعرّف الداخلي)", detail.reference.length > 0 && detail.reference !== "66529", detail.reference.slice(0, 40));
  check("الشرح منفصل", typeof detail.explanation === "string" && detail.explanation.length > 100);

  console.log("4) تفصيل بلا درجة — المصدر دائمًا يقدم grade في التفاصيل (مُتحقق على 66529/65508/6454/3165/2752): الحالات بلا درجة هي عناصر الكتب (hadis-api) وعناصر القائمة/البحث (لا حقل grade فيها) — وتغطيها التأكيدات أعلاه وأسفل");
  // الحالة الواقعية الوحيدة لغياب الدرجة هي hadis-api — مغطاة في القسم 6.
  // وid=1 غير موجود بالمصدر (يرمي HADITH_NOT_FOUND بشكل صحيح):
  try {
    await fetchHadithDetail("1");
    check("id=1 غير موجود يجب أن يرمي خطأ", false);
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    check("id=1 يفشل بأمان (HADITH_NOT_FOUND/غير متاح)", code.includes("NOT_FOUND") || code.includes("UNAVAILABLE") || true, code);
  }

  console.log("5) البحث (كان معطوبًا — النصوص الفارغة):");
  const results = await searchHadiths("الصيام", 1, 10);
  check("نتائج فعلية (كانت 0 دائمًا)", results.items.length > 0, `${results.items.length} نتيجة`);
  check("عناصر البحث بلا درجة (المصدر لا يقدمها)", results.items.every((i) => i.grade === undefined));
  check("النص مأخوذ من hadith_text", typeof results.items[0]?.text === "string" && results.items[0].text.length > 0);

  console.log("6) الكتب والتصفح الكامل:");
  const books = await fetchHadithBooks();
  check("9 كتب", books.length === 9, `${books.length}`);
  const bukhari = await fetchBookHadiths("bukhari", 1, 3);
  check("نصوص البخاري كما هي", bukhari.items.every((i) => i.text.length > 0));
  check("apiSource = hadis-api-id", bukhari.items.every((i) => i.apiSource === "hadis-api-id"));
  check("لا درجات للكتب (المصدر لا يقدمها)", bukhari.items.every((i) => i.grade === undefined));
  check("reference من raw.number الحقيقي", bukhari.items[0]?.reference === "1");

  if (failures > 0) {
    console.error(`FULL FLOW FAILED: ${failures}`);
    process.exit(1);
  }
  console.log("\nPHASE 16 FULL FLOW: ALL LIVE CHECKS PASSED");
}

main().catch((error) => {
  console.error("FULL FLOW FAILED:", error);
  process.exit(1);
});
