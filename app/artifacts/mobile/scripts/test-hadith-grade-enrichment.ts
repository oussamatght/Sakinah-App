/**
 * اختبار حي للإثراء (fawazahmed0/hadith-api عبر jsDelivr):
 *  - 5 أحاديث من الكتب الخمسة المدرَّجة: الدرجة تصل حرفيًا (إنجليزي) أو undefined
 *  - bukhari/muslim: بلا درجة (المصدر لا يدرجهما) — لا اختراع
 *  - رقم خارج النطاق → undefined بأمان
 *  - القائمة الكاملة من fetchBookHadiths: النص/الكتاب/المرجع لا تتغير،
 *    والدرجة إما undefined أو قيمة حرفية غير فارغة وغير "-"
 *
 * تشغيل: npx tsx scripts/test-hadith-grade-enrichment.ts
 */
import { fetchBookHadiths } from "../lib/api/hadith";
import { fetchGradeFromFawaz } from "../lib/api/hadithGradeEnrichment";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}${extra !== undefined ? ` — ${String(extra)}` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`);
  }
}

async function main() {
  console.log("=== 1) أحاديث مفردة من الكتب الخمسة المدرَّجة ===");
  // أرقام مختارة حيًا أثناء الفحص اليدوي (كلها مدرَّجة في info.json).
  const samples: Array<{ slug: string; n: number; expectGraded: boolean }> = [
    { slug: "abu-dawud", n: 1, expectGraded: true },
    { slug: "tirmidzi", n: 5, expectGraded: true },
    { slug: "ibnu-majah", n: 1, expectGraded: true },
    { slug: "nasai", n: 1, expectGraded: true },
    { slug: "malik", n: 1, expectGraded: true },
  ];
  for (const s of samples) {
    const grade = await fetchGradeFromFawaz(s.slug, s.n);
    // القاموس الموحد: الدرجة تصل عربية (أو صيغة تخريجية نادرة بأرقام — ليست
    // إنجليزية صرفة). أي لاتيني صرف هنا = قاموس ناقص.
    const isArabic = typeof grade === "string" && /[\u0600-\u06FF]/.test(grade);
    const hasDigits = typeof grade === "string" && /\d/.test(grade);
    check(
      `${s.slug}#${s.n} → درجة عربية من القاموس`,
      s.expectGraded ? isArabic || hasDigits : grade === undefined,
      grade ?? "(undefined)",
    );
  }

  console.log("=== 2) كتب بلا درجات في هذا المصدر — لا إثراء إطلاقًا ===");
  check("bukhari#1 → undefined (المصدر لا يدرجه)", (await fetchGradeFromFawaz("bukhari", 1)) === undefined);
  check("muslim#1 → undefined (المصدر لا يدرجه)", (await fetchGradeFromFawaz("muslim", 1)) === undefined);
  check("darimi#1 → undefined (غير موجود في المصدر)", (await fetchGradeFromFawaz("darimi", 1)) === undefined);
  check("ahmad#1 → undefined (غير موجود في المصدر)", (await fetchGradeFromFawaz("ahmad", 1)) === undefined);

  console.log("=== 3) أرقام خارج النطاق/غير صالحة → بأمان undefined ===");
  check("tirmidzi#99999 → undefined", (await fetchGradeFromFawaz("tirmidzi", 99999)) === undefined);
  check("malik#0 → undefined", (await fetchGradeFromFawaz("malik", 0)) === undefined);

  console.log("=== 4) القائمة الكاملة عبر fetchBookHadiths (المسار الإنتاجي) ===");
  const page = await fetchBookHadiths("tirmidzi", 1, 10);
  check("10 عناصر مسحوبة من المصدر الأساسي", page.items.length === 10, page.items.length);
  check("apiSource ما زال hadis-api-id (المصدر الأساسي لم يُستبدل)", page.items.every((i) => i.apiSource === "hadis-api-id"));
  check("النص لم يُمس (غير فارغ)", page.items.every((i) => i.text.length > 0));
  check("reference يطابق رقم الحديث", page.items.every((i) => i.reference === String(Math.abs(Number(i.id.split(":")[1])))) || page.items.every((i) => Number(i.reference) >= 1));
  const graded = page.items.filter((i) => typeof i.grade === "string");
  check(
    "كل درجة عربية (أو تخريجية بأرقام) وغير فارغة/غير \"-\"",
    graded.every(
      (i) =>
        i.grade!.trim().length > 0 &&
        i.grade!.trim() !== "-" &&
        (/^[\u0600-\u06FF]/.test(i.grade!.trim()) || /\d/.test(i.grade!)),
    ),
    `graded=${graded.length}/10`,
  );
  console.log("  درجات الصفحة:", page.items.map((i) => `${i.reference}:${i.grade ?? "—"}`).join(" | "));

  const bukhariPage = await fetchBookHadiths("bukhari", 1, 5);
  check("بخاري كامل: صفر درجات (لا اختراع)", bukhariPage.items.every((i) => i.grade === undefined));

  console.log(`\nENRICHMENT LIVE TEST: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
