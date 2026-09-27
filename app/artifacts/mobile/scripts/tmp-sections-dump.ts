const CDN = "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions";
const EDITIONS: Record<string, string> = {
  "abu-dawud": "ara-abudawud",
  "ibnu-majah": "ara-ibnmajah",
  malik: "ara-malik",
  nasai: "ara-nasai",
  tirmidzi: "ara-tirmidhi",
};

const seen = new Map<string, Set<string>>(); // title → book:sectionNo

(async () => {
  for (const [slug, ed] of Object.entries(EDITIONS)) {
    for (let n = 1; n <= 130; n++) {
      try {
        const r = await fetch(`${CDN}/${ed}/sections/${n}.json`);
        if (!r.ok) continue;
        const j: any = await r.json();
        const sec = j?.metadata?.section ?? {};
        const detail = j?.metadata?.section_detail ?? {};
        for (const key of Object.keys(sec)) {
          const title = String(sec[key]).trim();
          const d = detail[key];
          const range = d ? `${d.hadithnumber_first}-${d.hadithnumber_last}` : "?";
          if (!seen.has(title)) seen.set(title, new Set());
          seen.get(title)!.add(`${slug}#${key}(${range})`);
        }
      } catch {
        // تجاهل — المسح فقط
      }
    }
  }
  const titles = [...seen.keys()].sort();
  console.log(`=== ${titles.length} عنوانًا فريدًا عبر الكتب الخمسة ===`);
  for (const t of titles) {
    console.log(JSON.stringify(t), "→", [...seen.get(t)!].slice(0, 4).join(", "));
  }
})();
