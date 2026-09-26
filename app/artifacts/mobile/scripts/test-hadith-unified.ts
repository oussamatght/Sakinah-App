/** Unified-hadith verification (live APIs): shape + no empty display fields. */
import { fetchBookHadiths, fetchHadithList, fetchHadithDetail } from "../lib/api/hadith";
import type { HadithItem } from "../lib/api/types";

function assertItem(item: HadithItem, context: string) {
  if (!item.text?.trim()) throw new Error(`${context}: empty text`);
  if (!item.book?.trim() || item.book.includes("undefined"))
    throw new Error(`${context}: bad book "${item.book}"`);
  if (!item.reference?.trim() || item.reference.includes("undefined"))
    throw new Error(`${context}: bad reference "${item.reference}"`);
  if ("source" in (item as Record<string, unknown>))
    throw new Error(`${context}: legacy .source still present`);
  console.log(
    `  ✓ [${context}] الكتاب: ${item.book} | رقم: ${item.reference}` +
      ` | الدرجة: ${item.grade ?? "—"} | الراوي: ${item.attribution ?? "—"}`,
  );
}

async function main() {
  const bukhari = await fetchBookHadiths("bukhari", 1, 3);
  for (const item of bukhari.items) assertItem(item, "كتاب: البخاري");

  const muslim = await fetchBookHadiths("muslim", 2, 2);
  for (const item of muslim.items) assertItem(item, "كتاب: مسلم ص2");

  const topics = await fetchHadithList("2", 1, 3);
  for (const item of topics.items) assertItem(item, "موضوع: cat2");

  const detail = await fetchHadithDetail("66529");
  assertItem(detail, "تفصيل: 66529");
  if (!detail.grade) throw new Error("detail 66529 should carry grade from source");
  if (!detail.attribution) throw new Error("detail 66529 should carry attribution");
  if (detail.apiSource !== "hadeethenc.com")
    throw new Error("apiSource should track the provider for debugging only");

  console.log("UNIFIED HADITH SHAPE: ALL LIVE CHECKS PASSED");
}

main().catch((error) => {
  console.error("UNIFIED HADITH FAILED:", error);
  process.exit(1);
});
