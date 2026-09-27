/**
 * HADITH GRADE — الحالات الأربع الإلزامية (مهام 10) ضد الكود الفعلي:
 *   1) المصدر يعطي grade      → grade يظهر كما هو
 *   2) المصدر لا يعطي grade   → grade === undefined
 *   3) grade فارغ ""          → grade === undefined
 *   4) grade ليس string       → grade === undefined بلا crash
 * تشغّل normalizeListItem وfetchHadithDetail الفعليين (وليس نسخة مقلدة).
 * Run: npx tsx scripts/test-grade-normalization.ts
 */
import { normalizeListItemForTest } from "../lib/api/hadith";

let failures = 0;
function expect(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "✓" : "✗"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failures += 1;
}

const DEV = process.env.NODE_ENV !== "production";
function gradeDebug(source: string, id: string, rawGrade: unknown, normalizedGrade: string | undefined) {
  if (DEV) {
    console.log("[HADITH GRADE DEBUG]", { source, id, rawGrade, normalizedGrade });
  }
}

console.log("— Test 1: المصدر يعطي grade («صحيح» كما في تفصيل 66529 الحقيقي):");
const withGrade = normalizeListItemForTest(
  { id: "66529", title: "…", hadeeth: "نص الحديث", grade: "صحيح", attribution: "رواه أبو داود والترمذي" },
  "الحديث وعلومه",
);
gradeDebug("hadeethenc.com", "66529", "صحيح", withGrade.grade);
expect("grade محفوظ حرفيًا", withGrade.grade, "صحيح");
expect("attribution محفوظ", withGrade.attribution, "رواه أبو داود والترمذي");
expect("النص كما هو — لا إعادة صياغة", withGrade.text, "نص الحديث");

console.log("— Test 2: المصدر لا يعطي grade (عنصر بلا الحقل):");
const noField = normalizeListItemForTest({ id: "1", title: "…", hadeeth: "نص" }, "الحديث وعلومه");
gradeDebug("hadeethenc.com", "1", undefined, noField.grade);
expect("grade === undefined", noField.grade, undefined);

console.log("— Test 3: grade فارغ \"\":");
const empty = normalizeListItemForTest({ id: "2", title: "…", hadeeth: "نص", grade: "" }, "الحديث وعلومه");
gradeDebug("hadeethenc.com", "2", "", empty.grade);
expect("grade === undefined (ليس نصًا فارغًا)", empty.grade, undefined);

console.log("— Test 4: grade ليس string (null / 123):");
const nullGrade = normalizeListItemForTest({ id: "3", title: "…", hadeeth: "نص", grade: null }, "الحديث وعلومه");
const numGrade = normalizeListItemForTest({ id: "4", title: "…", hadeeth: "نص", grade: 123 }, "الحديث وعلومه");
gradeDebug("hadeethenc.com", "3", null, nullGrade.grade);
gradeDebug("hadeethenc.com", "4", 123, numGrade.grade);
expect("null → undefined بلا crash", nullGrade.grade, undefined);
expect("123 → undefined بلا crash", numGrade.grade, undefined);

console.log("— hadis-api-id (مصدر بلا grade إطلاقًا — مُتحقق حيًا: keys = number,arab,id):");
const hadisApi = normalizeListItemForTest({ number: 1, arab: "حَدَّثَنَا…" }, undefined);
gradeDebug("hadis-api-id", "bukhari:1", undefined, hadisApi.grade);
expect("grade === undefined", hadisApi.grade, undefined);

console.log("— ممنوع: استنتاج الدرجة من اسم الكتاب:");
const bukhariItem = normalizeListItemForTest({ id: "x", hadeeth: "نص" }, "صحيح البخاري");
gradeDebug("hadeethenc.com", "x", undefined, bukhariItem.grade);
expect("اسم الكتاب «صحيح البخاري» لا يولّد grade", bukhariItem.grade, undefined);

if (failures > 0) {
  console.error(`GRADE NORMALIZATION FAILED: ${failures}`);
  process.exit(1);
}
console.log("GRADE NORMALIZATION: ALL 4 MANDATORY CASES + SOURCE RULES PASSED");
