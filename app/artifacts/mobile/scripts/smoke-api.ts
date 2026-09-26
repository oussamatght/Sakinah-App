/**
 * Smoke test for the serverless data layer — run with:
 *   npx tsx scripts/smoke-api.ts
 * Exercises every fetcher/normalizer exactly as the screens will.
 */
import {
  fetchQuranChapters,
  fetchQuranSurah,
  fetchQuranAudio,
  fetchQuranTafsir,
} from "../lib/api/quran";
import { fetchHadithList, fetchHadithCategories } from "../lib/api/hadith";
import { fetchPrayerTimes } from "../lib/api/prayer";
import { computeNextPrayer, searchQuranVerses } from "../lib/api/queries";
import {
  setWirdGoal,
  addWirdPages,
  getWirdSummary,
  saveReadingPosition,
  getReadingPosition,
  toggleFavorite,
  getFavorites,
} from "../lib/storage";

// AsyncStorage is a native module — under plain tsx (Node) it's unavailable,
// so storage writes fail silently and reads return null. That's expected:
// this smoke run validates network fetchers/normalizers for real and merely
// verifies the storage modules don't crash outside React Native.

async function main() {
  console.log("— Quran chapters:");
  const chapters = await fetchQuranChapters();
  console.log("  count:", chapters.length, "| #1:", chapters[0].nameArabic, "| #114:", chapters[113].nameArabic);

  console.log("— Surah 112 (bismillah stripped?):");
  const surah = await fetchQuranSurah(112);
  console.log("  verses:", surah.verses.length, "| v1:", surah.verses[0].text.slice(0, 35));
  console.log("— Surah 1 v1 keeps bismillah:", (await fetchQuranSurah(1)).verses[0].text.slice(0, 25));

  console.log("— Audio 112:");
  const audio = await fetchQuranAudio(112);
  console.log("  ", audio.reciter, "|", audio.audioUrl.slice(0, 60));

  console.log("— Tafsir 112:2:");
  const tafsir = await fetchQuranTafsir(112, 2);
  console.log("  ", tafsir.resourceName, "| len:", tafsir.text.length);

  console.log("— Hadith list (cat 2):");
  const hadithPage = await fetchHadithList("2", 1, 2);
  console.log("  items:", hadithPage.items.length, "| text?", Boolean(hadithPage.items[0]?.text), "| book:", hadithPage.items[0]?.book);

  console.log("— Hadith categories:");
  const cats = await fetchHadithCategories();
  console.log("  roots:", cats.length);

  console.log("— Prayer times (Rabat):");
  const prayer = await fetchPrayerTimes(34.02, -6.83);
  console.log("  Fajr:", prayer.timings.Fajr, "| hijri:", prayer.hijriDate);
  console.log("  next prayer:", JSON.stringify(computeNextPrayer(prayer.timings)));

  console.log("— Search (in-memory, base-letter match):");
  const hits = searchQuranVerses([surah], "الصمد");
  console.log("  hits:", hits.length, "| first key:", hits[0]?.verseKey);

  console.log("— Storage (graceful no-op under Node — validated in-app later):");
  await setWirdGoal({ mode: "pages", targetPages: 4 });
  await addWirdPages(4);
  const summary = await getWirdSummary();
  console.log("  no crash; summary returned:", JSON.stringify(summary).length > 0 ? "yes" : "no");
  await saveReadingPosition({ surahId: 112, surahName: "الإخلاص", ayahNumber: 2 });
  await getReadingPosition();
  await toggleFavorite({ kind: "ayah", refId: "112:1", title: "الإخلاص", text: "قل هو الله أحد" });
  await getFavorites();
  console.log("  storage modules exercised without throwing");
}

main()
  .then(() => {
    console.log("\n✅ ALL SMOKE TESTS PASSED");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ FAILED:", error);
    process.exit(1);
  });
