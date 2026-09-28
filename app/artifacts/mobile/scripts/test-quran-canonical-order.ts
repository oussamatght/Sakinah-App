/** مشية كاملة على الترتيب القانوني 1:1 → 114:6 + رجوع كامل + حالات حدود. */
import { SURAH_AYAH_COUNTS, nextAyahPosition, prevAyahPosition, fetchQuranSurah } from "../lib/api/quran";

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
}
void main();
