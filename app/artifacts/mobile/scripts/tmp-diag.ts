/**
 * تشخيص: (1) لماذا الدرجة undefined في fetchHadithByNumber؟
 *        (2) لماذا fetchHadithSection("bukhari", 2) تعيد 0؟
 */
import { fetchMatchedGradeFromFawaz } from "../lib/api/hadithGradeEnrichment";
import { fetchHadithBooks } from "../lib/api/hadith";
import { fetchJson, isJsonRecord, intString } from "../lib/api/http";
import indexJson from "../assets/hadith-index/index.json";

const HADIS = "https://hadis-api-id.vercel.app";

async function main() {
  console.log("=== (1) الدرجة المباشرة من fawaz لترمذي#5 ===");
  const tirmidziText = await (await fetch(`${HADIS}/hadith/tirmidzi/5`)).text();
  const tirmidzi = JSON.parse(tirmidziText);
  console.log("hadis text head:", String(tirmidzi.arab).slice(0, 60));
  const grade = await fetchMatchedGradeFromFawaz("tirmidzi", 5, String(tirmidzi.arab));
  console.log("fetchMatchedGradeFromFawaz →", grade);

  console.log("\n=== (2) فهرس البخاري: الأقسام الأولى ===");
  const idx = indexJson as { books: Record<string, Array<{ section: number; titleAr: string; hadiths: number[] }>> };
  const bukhari = idx.books["bukhari"] ?? [];
  for (const s of bukhari.slice(0, 4)) {
    console.log(`section ${s.section}: ${s.titleAr} | hadiths[0..4]=${s.hadiths.slice(0, 5)} | last=${s.hadiths[s.hadiths.length - 1]}`);
  }

  console.log("\n=== (3) صفحات hadis-api للبخاري: هل تغطي 1..50؟ ===");
  const books = await fetchHadithBooks();
  console.log("bukhari total (from books):", books.find((b) => b.slug === "bukhari")?.total);
  const page1 = await fetchJson<{ items?: unknown }>(`${HADIS}/hadith/bukhari?page=1&limit=50`, "كتب", { timeoutMs: 20_000 });
  const items1 = Array.isArray(page1.items) ? page1.items : [];
  const numbers1 = items1
    .filter(isJsonRecord)
    .map((raw) => intString(raw.number, 0) ?? 0);
  console.log("page1 count:", numbers1.length, "| first 10:", numbers1.slice(0, 10), "| last:", numbers1[numbers1.length - 1]);
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exit(1);
});
