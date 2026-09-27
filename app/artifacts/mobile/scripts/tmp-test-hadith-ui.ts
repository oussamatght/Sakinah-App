/**
 * اختبار حي سريع لوظائف الأحاديث الجديدة المرتبطة بالواجهة:
 *  - searchHadiths (زر البحث النصي)
 *  - fetchHadithByNumber (بحث بالرقم داخل كتاب)
 *  - fetchHadithSection (فتح باب من الفهرس)
 * تشغيل: npx tsx scripts/tmp-test-hadith-ui.ts
 */
import { searchHadiths, fetchHadithByNumber, fetchHadithSection } from "../lib/api/hadith";

async function main() {
  console.log("=== 1) بحث نصي: «الأمانة» ===");
  const search = await searchHadiths("الأمانة", 1, 50);
  console.log("results:", search.items.length, "| first 40 chars:", search.items[0]?.text.slice(0, 40));

  console.log("\n=== 2) بحث بالرقم: tirmidzi #5 ===");
  const byNumber = await fetchHadithByNumber("tirmidzi", 5);
  console.log("id:", byNumber.id, "| grade:", byNumber.grade, "| ref:", byNumber.reference);
  console.log("text head:", byNumber.text.slice(0, 50));

  console.log("\n=== 3) رقم غير موجود: bukhari #99999 ===");
  try {
    await fetchHadithByNumber("bukhari", 99999);
    console.log("UNEXPECTED: no error");
  } catch {
    console.log("throws as expected → UI shows «لا يوجد»");
  }

  console.log("\n=== 4) قسم: bukhari section 1 (كتاب الإيمان؟) ===");
  const section = await fetchHadithSection("bukhari", 2);
  console.log("count:", section.length, "| grades:", section.slice(0, 5).map((i) => i.grade ?? "-"));
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exit(1);
});
