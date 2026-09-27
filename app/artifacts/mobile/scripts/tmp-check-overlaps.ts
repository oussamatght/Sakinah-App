const CDN = "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions";

const targets = [
  ["ara-tirmidhi", 37, 38, 39],
  ["ara-ibnmajah", 9, 10, 11],
  ["ara-malik", 1, 2, 3, 4],
] as const;

(async () => {
  for (const [ed, ...nums] of targets) {
    console.log(`=== ${ed} ===`);
    for (const n of nums) {
      const r = await fetch(`${CDN}/${ed}/sections/${n}.json`);
      if (!r.ok) { console.log(`sec ${n}: 404`); continue; }
      const j: any = await r.json();
      const m = j.metadata;
      const d = m.section_detail[n];
      console.log(`sec ${n} "${m.section[n]}" → hadiths ${d.hadithnumber_first}..${d.hadithnumber_last} (موجودة فعليًا: ${j.hadiths?.length ?? 0})`);
    }
  }
})();
