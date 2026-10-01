/**
 * إثراء الدرجة (fawazahmed0/hadith-api عبر jsDelivr): المصدر الأساسي
 * (hadis-api-id) لا يقدّم grade إطلاقًا وهذا يقدّمه لبعض الكتب فقط.
 * القواعد (مُتحقق حيًا 2026-09):
 *  - تغطية الترقيم 1..N كاملة وبنفس الحديث/الرقم لهذين الخماسية:
 *    abu-dawud→ara-abudawud (5274، 100% مدرَّج)، ibnu-majah→ara-ibnmajah
 *    (4343، 100%)، malik→ara-malik (1858، 100%)، nasai→ara-nasai (5765، 99.9%),
 *    tirmidzi→ara-tirmidhi (3998، 98.9%).
 *  - bukhari/muslim: حقل grades موجود لكنه فارغ دائمًا؛ darimi/ahmad غير
 *    موجودين أصلًا → لا إثراء إطلاقًا.
 *  - الشكل: { hadiths: [{ hadithnumber, arabicnumber, grades, reference }] }
 *    وgrades = [{ name: "Al-Albani", grade: "Sahih" }, …] بقيم إنجليزية.
 *
 * قرار العرض: القيمة تُعرض حرفيًا بالإنجليزية كما في المصدر — لا ترجمة ولا
 * توحيد ولا استنتاج؛ أول مُدرِّج فقط، والقيم الفارغة/"-" ليست درجة.
 *
 * الأمان في الربط (مضاد لاختلاف الترقيم بين الطبعات):
 *  - الكتب خارج GRADED_BOOKS لا تُجلب لها ملفات أصلًا.
 *  - ملف الرقم الواحد هو مصدر الحقيقة: غيابه أو غياب حديثه/grades (أو فراغها)
 *    → undefined (يبقى «درجة الحديث غير متوفرة»).
 *  - قبل اعتماد درجة الملف يُجرى فحص تطابق نصي مقتضب (أول ~40 محرفًا بعد
 *    التطبيع الخفيف للمسافات فقط — لا حركات ولا معالجة للنص القرآني)، وتشابه
 *    البداية < 0.5 يعني حديثًا آخر من طبعة أخرى → undefined.
 *  - أي فشل شبكة/تحليل → undefined صامت (الإثراء لا يُعطّل القائمة أبدًا).
 */

const FAWAZ_CDN = "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions";

/** الكتب التي يقدم هذا المصدر لها درجات فعليًا فقط (بقي حيًا). */
const GRADED_BOOKS: Record<string, string> = {
  "abu-dawud": "ara-abudawud",
  "ibnu-majah": "ara-ibnmajah",
  malik: "ara-malik",
  nasai: "ara-nasai",
  tirmidzi: "ara-tirmidhi",
};

/**
 * قاموس موحد (قرار المستخدم): قيم المصدر الإنجليزية → تسمية عربية، مبني على
 * مسح حي لـ1671 قيمة فريدة في الكتب الخمسة؛ الصيغ التخريجية الرقمية نادرة
 * العرض وتقع في الـfallback. الترجمة تُطبق قبل التخزين — GradeBadge يستقبل
 * العربية مباشرة، وهadeethenc يبقى حرفيًا بلا مرور على هذا القاموس.
 */
const GRADE_AR: Record<string, string> = {
  Sahih: "صحيح",
  Daif: "ضعيف",
  Hasan: "حسن",
  "Hasan Sahih": "حسن صحيح",
  "Sahih - Agreed Upon": "صحيح متفق عليه",
  "Sahih - Bukhari And Muslim": "صحيح البخاري ومسلم",
  "Isnaad Sahih": "صحيح الإسناد",
  "Isnaad Hasan": "حسن الإسناد",
  "Isnaad Daif": "ضعيف الإسناد",
  "Sahih Isnaad": "صحيح الإسناد",
  "Hasan Isnaad": "حسن الإسناد",
  "Daif Isnaad": "ضعيف الإسناد",
  "Sahih Lighairihi": "صحيح لغيره",
  "Hasan Lighairihi": "حسن لغيره",
  "Sahih Bukhari": "صحيح البخاري",
  "Sahih Muslim": "صحيح مسلم",
  "Mauquf Sahih": "موقوف صحيح",
  "Mauquf Daif": "موقوف ضعيف",
  "Mauquf Hasan": "موقوف حسن",
  "Sahih Muquf": "موقوف صحيح",
  "Daif Muquf": "موقوف ضعيف",
  "Maqtu Sahih": "مقطوع صحيح",
  "Maqtu Daif": "مقطوع ضعيف",
  "Maqtu Hasan": "مقطوع حسن",
  "Sahih Maqtu": "مقطوع صحيح",
  Maqtu: "مقطوع",
  "Very Daif": "ضعيف جدًا",
  "Very Daif Isnaad": "ضعيف جدًا الإسناد",
  Shadh: "شاذ",
  "Shadh, Sahih": "شاذ، صحيح",
  Munkar: "منكر",
  "Munkar Daif": "منكر ضعيف",
  "Daif Munkar": "منكر ضعيف",
  "Mauquf Munkar": "موقوف منكر",
  Mawdu: "موضوع",
  Batil: "باطل",
  Mursal: "مرسل",
  "Mursal Sahih Isnaad": "مرسل صحيح الإسناد",
  "Sahih Isnaad Mursal": "مرسل صحيح الإسناد",
  "Sanad Daif": "ضعيف السند",
  "Isnaad Malool": "معلول الإسناد",
  "Sahih Hadith": "حديث صحيح",
  "Sahih Matn": "متن صحيح",
  "Sahih Mutawatir": "صحيح متواتر",
  "Isnaad Sahih Agreed Upon": "إسناد صحيح متفق عليه",
  "Hasan Sahih Isnaad": "حسن صحيح الإسناد",
  "Sahih Isnaad Maqtu": "مقطوع صحيح الإسناد",
  "Daif Isnaad Maqtu": "مقطوع ضعيف الإسناد",
  "Sahih Isnaad Mauquf": "موقوف صحيح الإسناد",
  "Mauquf Sahih Lighairihi": "موقوف صحيح لغيره",
  "Mauquf Hasan Lighairihi": "موقوف حسن لغيره",
  "Maqtu Sahih Lighairihi": "مقطوع صحيح لغيره",
  "Isnaad Sahih Bukhari And Muslim": "إسناد صحيح البخاري ومسلم",
  "Isnaad Hasan Sahih Muslim": "إسناد حسن صحيح مسلم",
  "Sahih - Isnaad Hasan Bukhari And Muslim": "صحيح إسناده حسن البخاري ومسلم",
};

/** قيم غير معروفة سبق تحذيرها — تحذير واحد لكل قيمة (بلا إزعاج في السجلات). */
const warnedUnknownGrades = new Set<string>();

/**
 * ترجمة قيمة fawaz؛ ما ليس في القاموس (نادر) يُعرض كما هو (fallback آمن) مع
 * تحذير console واحد لكل قيمة — لا حذف صامت.
 */
export function translateFawazGrade(value: string): string {
  const mapped = GRADE_AR[value];
  if (mapped) return mapped;
  if (/\d/.test(value)) {
    // صيغة تخريجية بأرقام — تُعرض كما هي (تحتوي أرقامًا مرجعية مفيدة).
    return value;
  }
  if (!warnedUnknownGrades.has(value)) {
    warnedUnknownGrades.add(value);
    console.warn(
      `[HADITH GRADE] قيمة درجة غير معروفة من fawazahmed0 — أضفها للقاموس: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

/** ملف الرقم الواحد ~1-3KB — كاش module-level للجلسة. */
type FawazRecord = { grades: unknown; text: string | undefined };
const gradeFileCache = new Map<string, FawazRecord | null>();
const inflight = new Map<string, Promise<FawazRecord | null>>();

/**
 * تطبيع للمقارنة فقط: إزالة الحركات (مواضعها تختلف بين طبعتَي fawaz
 * وhadis-api) وعلامات الترقيم والتطويل وتوحيد المسافات — كقاعدة البحث في
 * queries.ts. لا تُلمس بها النصوص المعروضة أو المخزنة أبدًا.
 */
function comparableHead(text: string): string {
  return text
    .slice(0, 100)
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[،؛,;:!؟?"'()\[\]«»<>«»\.]/g, "")
    .replace(/\u0640/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** تشابه تقريبي بين رأسي نصّين (0..1) — لمقارنة بداية الحديث فقط. */
function headSimilarity(a: string, b: string): number {
  const x = comparableHead(a);
  const y = comparableHead(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  let i = 0;
  const min = Math.min(x.length, y.length);
  while (i < min && x[i] === y[i]) i++;
  // التشابه مقابل أطول النصين — تسامح مع اختلاف الترقيم الداخلي للأسطر.
  return i / Math.max(x.length, y.length);
}

/** أول قيمة درجة صالحة حرفيًا من قائمة grades (قرار العرض: أول مُدرِّج). */
function firstLiteralGrade(grades: unknown): string | undefined {
  if (!Array.isArray(grades)) return undefined;
  for (const entry of grades) {
    if (typeof entry !== "object" || entry === null) continue;
    const value = (entry as { grade?: unknown }).grade;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || trimmed === "-") continue; // بيانات ناقصة → ليست درجة
    return trimmed;
  }
  return undefined;
}

async function fetchFawazRecord(
  edition: string,
  hadithNumber: number,
): Promise<FawazRecord | null> {
  const cacheKey = `${edition}/${hadithNumber}`;
  if (gradeFileCache.has(cacheKey)) return gradeFileCache.get(cacheKey) ?? null;
  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const job = (async () => {
    try {
      const response = await fetch(
        `${FAWAZ_CDN}/${encodeURIComponent(edition)}/${hadithNumber}.json`,
      );
      if (!response.ok) {
        gradeFileCache.set(cacheKey, null);
        return null;
      }
      const payload: unknown = await response.json();
      const hadiths = (payload as { hadiths?: unknown } | null)?.hadiths;
      if (!Array.isArray(hadiths)) {
        gradeFileCache.set(cacheKey, null);
        return null;
      }
      // ملف الرقم قد يحوي أكثر من عنصر: نطابق الرقم صراحة (دفاع ضد اختلاف الترتيب).
      const record = hadiths.find(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          (entry as { hadithnumber?: unknown }).hadithnumber === hadithNumber,
      );
      if (!record) {
        gradeFileCache.set(cacheKey, null);
        return null;
      }
      const typed = record as { grades?: unknown; text?: unknown };
      const value: FawazRecord = {
        grades: typed.grades,
        text: typeof typed.text === "string" ? typed.text : undefined,
      };
      gradeFileCache.set(cacheKey, value);
      return value;
    } catch {
      // الإثراء دائمًا صامت — فشله لا يمس القائمة.
      return null;
    } finally {
      inflight.delete(cacheKey);
    }
  })();
  inflight.set(cacheKey, job);
  return job;
}

/**
 * الدرجة الحرفية لثنائية (كتاب، رقم)؛ undefined = لا درجة من هذا المصدر.
 * لا يرمي أبدًا. (للاختبار والمستهلكات البسيطة.)
 */
export async function fetchGradeFromFawaz(
  bookSlug: string,
  hadithNumber: number,
): Promise<string | undefined> {
  const edition = GRADED_BOOKS[bookSlug];
  if (!edition) return undefined; // كتاب بلا درجات في هذا المصدر — بلا أي طلب
  if (!Number.isInteger(hadithNumber) || hadithNumber < 1) return undefined;
  const record = await fetchFawazRecord(edition, hadithNumber);
  const grade = record ? firstLiteralGrade(record.grades) : undefined;
  return grade ? translateFawazGrade(grade) : undefined;
}

/**
 * الدرجة مع فحص تطابق نصي (يستعمله الربط الإنتاجي): تُعاد فقط إن طابق رأس
 * نص fawaz رأس نص hadis-api-id للرقم نفسه؛ اختلاف قاطع (طبعة/ترقيم آخر) →
 * undefined بلا ربط أعمى. وإن لم يوفر fawaz نصًا نعتمد تطابق الرقم وحده.
 */
export async function fetchMatchedGradeFromFawaz(
  bookSlug: string,
  hadithNumber: number,
  primaryText: string,
): Promise<string | undefined> {
  const edition = GRADED_BOOKS[bookSlug];
  if (!edition) return undefined;
  if (!Number.isInteger(hadithNumber) || hadithNumber < 1) return undefined;
  const record = await fetchFawazRecord(edition, hadithNumber);
  if (!record) return undefined;
  if (!isLikelySameHadith(primaryText, record.text)) return undefined;
  const grade = firstLiteralGrade(record.grades);
  return grade ? translateFawazGrade(grade) : undefined;
}

/** تطابق رأس النص: بلا نص من fawaz نعتمد الرقم وحده، وإلا نقبل تشابه ≥ 0.5. */
export function isLikelySameHadith(
  primaryText: string,
  fawazText?: string,
): boolean {
  if (fawazText === undefined) return true;
  return headSimilarity(primaryText, fawazText) >= 0.5;
}
