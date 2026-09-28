/** مشية كاملة على الترتيب القانوني 1:1 → 114:6 + رجوع كامل + حالات حدود + استمرارية الصفحات المتصلة. */
import {
  SURAH_AYAH_COUNTS,
  nextAyahPosition,
  prevAyahPosition,
  fetchQuranSurah,
  flattenSurahIntoQuranPages,
  type QuranPageGroup,
} from "../lib/api/quran";

async function main() {
  const total = SURAH_AYAH_COUNTS.reduce((a, b) => a + b, 0);
  console.log("total_ayahs=" + total + (total === 6236 ? " ✓(6236)" : " ✗ يجب 6236!"));

  const visited: string[] = [];
  let pos: { surah: number; ayah: number } | null = { surah: 1, ayah: 1 };
  while (pos) { visited.push(pos.surah + ":" + pos.ayah); pos = nextAyahPosition(pos); }
  const noDupes = new Set(visited).size === visited.length;
  console.log("walk_forward=" + visited.length + " unique=" + noDupes);
  console.log("first3=" + visited.slice(0, 3).join(",") + " … last3=" + visited.slice(-3).join(","));
  const surahStarts = visited.filter((k) => k.endsWith(":1")).length;
  console.log("surah_starts=" + surahStarts + " (متوقع 114)");

  const back: string[] = [];
  let p: { surah: number; ayah: number } | null = { surah: 114, ayah: 6 };
  while (p) { back.push(p.surah + ":" + p.ayah); p = prevAyahPosition(p); }
  const reverseMatch = back.length === visited.length && back[0] === "114:6" && back[back.length - 1] === "1:1" && back.every((k, i) => k === visited[visited.length - 1 - i]);
  console.log("walk_back=" + back.length + " reverse_match=" + reverseMatch);

  console.log("1:7→" + JSON.stringify(nextAyahPosition({ surah: 1, ayah: 7 })));
  console.log("2:286→" + JSON.stringify(nextAyahPosition({ surah: 2, ayah: 286 })));
  console.log("9:129→" + JSON.stringify(nextAyahPosition({ surah: 9, ayah: 129 })));
  console.log("113:5→" + JSON.stringify(nextAyahPosition({ surah: 113, ayah: 5 })));
  console.log("114:6→" + JSON.stringify(nextAyahPosition({ surah: 114, ayah: 6 })));
  console.log("1:1 prev→" + JSON.stringify(prevAyahPosition({ surah: 1, ayah: 1 })));
  console.log("18:1 prev→" + JSON.stringify(prevAyahPosition({ surah: 18, ayah: 1 })));
  console.log("2:255 prev→" + JSON.stringify(prevAyahPosition({ surah: 2, ayah: 255 })));
  console.log("invalid: " + JSON.stringify(nextAyahPosition({ surah: 0, ayah: 1 })) + " " + JSON.stringify(nextAyahPosition({ surah: 115, ayah: 1 })) + " " + JSON.stringify(nextAyahPosition({ surah: 5, ayah: 999 })));

  for (const s of [1, 2, 18, 112, 114]) {
    const surah = await fetchQuranSurah(s);
    const ok = surah.verses.length === SURAH_AYAH_COUNTS[s - 1];
    console.log("surah " + s + ": live=" + surah.verses.length + " canonical=" + SURAH_AYAH_COUNTS[s - 1] + (ok ? " ✓" : " ✗"));
  }

  // ---- استمرارية المصحف المتصل: دمج سورتين متجاورتين حيًا ثم فحص التتابع ----
  // القاعدة: آخر آية في مسار الصفحات المدموج يجب أن تليها آية الترتيب القانوني
  // التالية تمامًا (لا تخطي ولا ازدواج عبر حدود الصفحات/السور).
  const tirmidhiPair = [112, 113] as const; // الإخلاص (صفحة 604) ثم الفلق
  const s1 = await fetchQuranSurah(tirmidhiPair[0]);
  const s2 = await fetchQuranSurah(tirmidhiPair[1]);
  let flat: QuranPageGroup[] = [];
  flat = flattenSurahIntoQuranPages(flat, s1);
  flat = flattenSurahIntoQuranPages(flat, s2);
  const orderedVerses = flat.flatMap((g) => g.verses);
  const keys = orderedVerses.map((v) => v.verseKey);
  const uniqueKeys = new Set(keys).size === keys.length;
  const expectedChain: string[] = [];
  let pos2: { surah: number; ayah: number } | null = { surah: tirmidhiPair[0], ayah: 1 };
  const endPos = { surah: tirmidhiPair[1], ayah: SURAH_AYAH_COUNTS[tirmidhiPair[1] - 1] };
  while (pos2) {
    expectedChain.push(pos2.surah + ":" + pos2.ayah);
    if (pos2.surah === endPos.surah && pos2.ayah === endPos.ayah) break;
    pos2 = nextAyahPosition(pos2);
  }
  const chainMatch = keys.length === expectedChain.length && keys.every((k, i) => k === expectedChain[i]);
  console.log("flatten_112_113: pages=" + flat.map((g) => g.page).join(",") + " verses=" + keys.length + " unique=" + uniqueKeys + " chain=" + (chainMatch ? "✓" : "✗"));
  if (!chainMatch) {
    console.log("  expected=" + expectedChain.join(","));
    console.log("  actual  =" + keys.join(","));
  }
  // صفحة 604: نهاية القرآن — 4 آيات إخلاص + 5 فلق = 9 (هكذا في مصحف المدenery)
  const p604 = flat.find((g) => g.page === 604);
  const p604keys = p604 ? p604.verses.map((v) => v.verseKey).join(",") : "";
  const p604ok = p604keys === "112:1,112:2,112:3,112:4,113:1,113:2,113:3,113:4,113:5";
  console.log("page604=" + (p604 ? p604.verses.length + " ayahs ترتيب=" + (p604ok ? "✓" : "✗ " + p604keys) : "مفقودة ✗"));
}
void main();
