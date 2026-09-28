/* Temporary live probe #3: IH item-id forms + links shape + Turath retry. */
/* eslint-disable no-console */
import { fetchJsonRetry } from "../lib/books/providers";

const IH = "https://api3.islamhouse.com/v3/paV29H2gm56kvLPy";
const TUR = "https://api.turath.io";

async function probe(label: string, url: string, source: string, tries: number) {
  try {
    const json = await fetchJsonRetry<unknown>(url, source, { timeoutMs: 25_000, tries, retryDelayMs: 3000 });
    return json;
  } catch (e) {
    console.log(`## ${label} FAILED: ${(e as Error).message}`);
    return undefined;
  }
}

async function itemBatch(id: number, label: string) {
  const items = (await probe(
    `IH items id=${id} (${label})`,
    `${IH}/main/get-category-items/${id}/showall/ar/ar/1/5/json`,
    "كتب إسلام هاوس",
    2,
  )) as Record<string, unknown> | undefined;
  if (items && typeof items === "object") {
    const links = items.links as Record<string, unknown> | undefined;
    console.log(`  id=${id} error=${JSON.stringify(items.error)} links=${links ? JSON.stringify(links).slice(0, 500) : "(none)"}`);
    const data = items.data as unknown[] | undefined;
    console.log(`  raw=${JSON.stringify(items).slice(0, 220)}`);
    if (Array.isArray(data) && data[0]) {
      const first = data[0] as Record<string, unknown>;
      console.log(`  first item keys=${Object.keys(first).join(",")}`);
      console.log(`  first: id=${first.id} type=${String(first.type)} title=${String(first.title ? first.title : "").slice(0, 70)} translated_language=${String(first.translated_language)}`);
    }
  }
}

async function main() {
  // A) which id form does get-category-items accept? internal id vs source_id
  //    القرآن الكريم internal=10 source_id=86219 ; العقيدة internal=34 source_id=192525
  await itemBatch(10, "قُرآن internal");
  await itemBatch(86219, "قُرآن source_id");
  await itemBatch(34, "عقيدة internal");
  await itemBatch(192525, "عقيدة source_id");

  // B) links shape for global books
  const g = (await probe(
    "IH global books links",
    `${IH}/main/books/ar/ar/1/2/json`,
    "كتب إسلام هاوس",
    2,
  )) as Record<string, unknown> | undefined;
  if (g && typeof g === "object") {
    console.log(`GLOBAL links=${JSON.stringify(g.links).slice(0, 600)}`);
    const data = g.data as unknown[] | undefined;
    if (data?.[0]) {
      const first = data[0] as Record<string, unknown>;
      console.log(`GLOBAL first keys=${Object.keys(first).join(",")}`);
    }
  }

  // C) Turath retry
  const t = (await probe(
    "TUR search q=العقيدة (retry)",
    `${TUR}/search?q=${encodeURIComponent("العقيدة")}&page=1&ver=3`,
    "كتب تراث",
    3,
  )) as Record<string, unknown> | undefined;
  if (t && typeof t === "object") {
    console.log(`\nTUR count=${t.count}`);
    const arr = Array.isArray(t.data) ? (t.data as unknown[]) : [];
    if (arr[0]) {
      const first = arr[0] as Record<string, unknown>;
      console.log(`TUR item[0] keys=${Object.keys(first).join(",")}`);
      console.log(`TUR item[0].meta=${JSON.stringify(first.meta).slice(0, 320)}`);
      console.log(`TUR item[0].cat_id=${first.cat_id} author_id=${first.author_id}`);
      const authorId = first.author_id as number;
      const catId = first.cat_id as number;
      console.log(`\n  author_id=${authorId} cat_id=${catId}`);
      if (authorId) {
        const t2 = (await probe(
          `TUR author-filter via author=${authorId}`,
          `${TUR}/search?q=a&author=${authorId}&page=1&ver=3`,
          "كتب تراث",
          2,
        )) as Record<string, unknown> | undefined;
        console.log(`  -> author-filter count=${t2 && typeof t2 === "object" ? String((t2 as Record<string, unknown>).count) : "unreachable"}`);
      }
      if (catId) {
        const t3 = (await probe(
          `TUR cat-filter via cat=${catId}`,
          `${TUR}/search?q=a&cat=${catId}&page=1&ver=3`,
          "كتب تراث",
          2,
        )) as Record<string, unknown> | undefined;
        console.log(`  -> cat-filter count=${t3 && typeof t3 === "object" ? String((t3 as Record<string, unknown>).count) : "unreachable"}`);
      }
    } else {
      console.log("TUR: no data items");
    }
  }

  console.log("\nPROBE3 DONE");
}

main().catch((e) => {
  console.error("PROBE3 FAILED:", e);
  process.exit(1);
});