/**
 * التحقق من اكتمال القرآن في القارئ المتصل:
 *  - الشكل القانوني الثابت: 114 سورة، مجموعها 6236 آية بلا تكرار وبلا قفزات.
 *  - المشية الأمامية 1:1 → 114:6 والمشية العكسية كلاهما بطول 6236 ومتطابقتان.
 *  - حالات الحدود في nextAyahPosition / prevAyahPosition.
 *  - اختبارات نقية لـ validateQuranSurah (تكرار/نقص/خارج النطاق/عدم ترتيب).
 *  - جلب كل سورة من المصدر حيًا والتحقق أن الفحص يعيد sortedsVerses كاملًا
 *    (uniqueCount == canonicalCount و orderIsCanonical وبلا issues).
 * السكربت يرفع خطأ (كود خروج غير صفري) عند أي فشل — تشغيل: npx tsx هذا الملف
 */
import {
  SURAH_AYAH_COUNTS,
  nextAyahPosition,
  prevAyahPosition,
  fetchQuranSurah,
  validateQuranSurah,
  type QuranSurah,
  type AyahPosition,
} from "../lib/api/quran";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error("FAIL: " + message);
  console.log("ok  " + message);
}

async function verifyLiveSurah(surahId: number): Promise<void> {
  const surah = await fetchQuranSurah(surahId);
  const validation = validateQuranSurah(surah);
  assert(
    validation.uniqueCount === validation.canonicalCount &&
      validation.orderIsCanonical &&
      validation.issues.length === 0,
    `حي ${surahId} (${surah.nameArabic}): ${validation.uniqueCount}/${validation.canonicalCount} آية مرتبة كاملة بلا تحذيرات`,
  );
}

/** سورة اصطناعية (نص "مزيف") لاختبار الفحص النقي دون اتصال. */
function fakeSurah(surahId: number, verseNumbers: number[], pages?: number[]): QuranSurah {
  return {
    id: surahId,
    nameArabic: "مصنعة للاختبار",
    nameEnglish: "fake",
    revelationPlace: "makkah",
    versesCount: verseNumbers.length,
    verses: verseNumbers.map((verseNumber, i) => ({
      id: verseNumber,
      verseNumber,
      verseKey: `${surahId}:${verseNumber}`,
      text: `﴿${verseNumber}﴾ نص اختبار`,
      juz: 1,
      page: pages ? pages[i] ?? 1 : 1,
    })),
  };
}

function main(): void {
  // 1) الشكل القانوني الثابت.
  const total = SURAH_AYAH_COUNTS.reduce((a, b) => a + b, 0);
  assert(SURAH_AYAH_COUNTS.length === 114, "SURAH_AYAH_COUNTS بطول 114 سورة");
  assert(total === 6236, `المجموع الكلي 6236 آية (وصل: ${total})`);

  // 2) المشية الأمامية الكاملة.
  const forward: string[] = [];
  let pos: AyahPosition | null = { surah: 1, ayah: 1 };
  while (pos) {
    forward.push(`${pos.surah}:${pos.ayah}`);
    pos = nextAyahPosition(pos);
  }
  assert(forward.length === 6236, `المشي الأمامي 6236 خطوة (وصل: ${forward.length})`);
  assert(new Set(forward).size === forward.length, "لا آية مكررة في المشي الأمامي");
  assert(forward[0] === "1:1", "أول آية 1:1");
  assert(forward[forward.length - 1] === "114:6", "آخر آية 114:6");
  assert(
    forward.filter((key) => key.endsWith(":1")).length === 114,
    "114 بداية سور في المشية",
  );

  // 3) المشية العكسية تطابق الأمامية بالانعكاس.
  const backward: string[] = [];
  let back: AyahPosition | null = { surah: 114, ayah: 6 };
  while (back) {
    backward.push(`${back.surah}:${back.ayah}`);
    back = prevAyahPosition(back);
  }
  assert(backward.length === 6236, `المشي العكسي 6236 خطوة (وصل: ${backward.length})`);
  assert(
    backward.every((key, i) => key === forward[forward.length - 1 - i]),
    "المشي العكسي = انعكاس الأمامي تمامًا",
  );

  // 4) حالات الحدود.
  assert(
    JSON.stringify(nextAyahPosition({ surah: 1, ayah: 7 })) === JSON.stringify({ surah: 2, ayah: 1 }),
    "1:7 → 2:1",
  );
  assert(
    JSON.stringify(nextAyahPosition({ surah: 2, ayah: 286 })) === JSON.stringify({ surah: 3, ayah: 1 }),
    "2:286 → 3:1",
  );
  assert(nextAyahPosition({ surah: 114, ayah: 6 }) === null, "114:6 → نهاية القرآن null");
  assert(prevAyahPosition({ surah: 1, ayah: 1 }) === null, "1:1 رجوع → null");
  assert(
    JSON.stringify(prevAyahPosition({ surah: 2, ayah: 1 })) === JSON.stringify({ surah: 1, ayah: 7 }),
    "2:1 رجوع → 1:7",
  );
  assert(nextAyahPosition({ surah: 0, ayah: 1 }) === null, "سورة 0 → null");
  assert(nextAyahPosition({ surah: 5, ayah: 999 }) === null, "آية خارج النطاق → null");

  // 5) اختبارات نقية للفحص.
  const clean = validateQuranSurah(
    fakeSurah(1, Array.from({ length: 7 }, (_, i) => i + 1)),
  );
  assert(clean.orderIsCanonical && clean.issues.length === 0 && clean.uniqueCount === 7, "سورة نظيفة: فحص سليم");

  const messy = validateQuranSurah(fakeSurah(1, [3, 1, 2, 2, 5, 0, 99]));
  assert(
    messy.orderIsCanonical === false &&
      messy.uniqueCount === 4 &&
      JSON.stringify(messy.sortedVerses.map((v) => v.verseNumber)) === JSON.stringify([1, 2, 3, 5]) &&
      messy.duplicates.includes(2) &&
      messy.missing.includes(4) &&
      messy.missing.includes(6) &&
      messy.missing.includes(7) &&
      messy.extra.includes(0) &&
      messy.extra.includes(99),
    "سورة متشابكة: كشف تكرار/نقص/خارج النطاق وترتيب صحيح",
  );

  console.log("PURE_CHECKS=pass");
}

async function liveChecks(): Promise<void> {
  console.log("live: جلب 114 سورة من المصدر والتحقق من اكتمال كل سورة…");
  let failures = 0;
  for (let s = 1; s <= 114; s += 1) {
    try {
      await verifyLiveSurah(s);
    } catch (error) {
      failures += 1;
      console.log("FAIL سورة " + s + " — " + String(error));
    }
  }
  assert(failures === 0, `التحقق الحي: 114/114 سورة كاملة (فشل ${failures})`);
}

void (async () => {
  try {
    main();
    await liveChecks();
    console.log("VERIFY_QURAN_COMPLETENESS=pass");
  } catch (error) {
    console.error("FAIL " + String(error));
    throw error;
  }
})();