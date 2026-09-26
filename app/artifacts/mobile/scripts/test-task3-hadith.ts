/** Task-3: real hadith data path (no mocks) — same calls the screens make. */
import { fetchHadithBooks, fetchBookHadiths, fetchHadithList, fetchHadithCategories } from "../lib/api/hadith";

async function main() {
  console.log("— الكتب التسعة:");
  const books = await fetchHadithBooks();
  for (const book of books) console.log(`   ${book.slug}: ${book.nameAr} (${book.total})`);

  console.log("— تصفح صحيح البخاري صفحة 1:");
  const page1 = await fetchBookHadiths("bukhari", 1, 5);
  console.log(`   items: ${page1.items.length} | total: ${page1.total} | hasMore: ${page1.hasMore}`);
  console.log(`   أول حديث: ${page1.items[0]?.text.slice(0, 60)}...`);
  console.log(`   المصدر: ${page1.items[0]?.book} — رقم ${page1.items[0]?.reference}`);

  console.log("— صفحة 2 (pagination):");
  const page2 = await fetchBookHadiths("bukhari", 2, 5);
  if (page2.items[0]?.id === page1.items[0]?.id) throw new Error("page2 returned page1 items — pagination broken");
  console.log(`   items: ${page2.items.length} | أول حديث مختلف: ${page2.items[0]?.text.slice(0, 40)}...`);

  console.log("— التصنيفات الموضوعية (hadeethenc):");
  const cats = await fetchHadithCategories();
  console.log(`   roots: ${cats.length} | مثال: ${cats.slice(0, 6).map((c) => c.titleAr).join("، ")}`);

  console.log("— قائمة موضوعية (cat 2):");
  const list = await fetchHadithList("2", 1, 3);
  console.log(`   items: ${list.items.length} | total: ${list.total} | hasMore: ${list.hasMore}`);
  const sample = list.items[0];
  console.log(`   الكتاب: ${sample?.book} | الدرجة: ${sample?.grade ?? "—"} | الراوي: ${sample?.attribution ?? "—"} | المرجع: ${sample?.reference}`);
  if (!sample?.text) throw new Error("hadith list item has no text");

  console.log("TASK3 DATA-PATH: ALL CHECKS PASSED");
}

main().catch((error) => {
  console.error("TASK3 FAILED:", error);
  process.exit(1);
});
