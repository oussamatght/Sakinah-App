import { fetchJson } from "./http";
import { UpstreamError } from "./types";
import type { Dhikr } from "./types";

/**
 * مصدر الأذكار: مستودع Seen-Arabic (أذكار الصباح والمساء).
 *
 * البنية الفعلية للتحقّق منها حيًّا (scripts/probe-adhkar-shape.cjs):
 *   34 عنصرًا، الحقول:
 *     order, content, count, count_description, fadl, source, type,
 *     audio, hadith_text, explanation_of_hadith_vocabulary
 *
 *   `type` معناه (مُستنتج من نصوص العناصر نفسها، لا مُفترَض):
 *     0 → ذكر عام (لا يختصّ بالصبح ولا المساء)  — 16 عنصرًا
 *     1 → ذكر الصباح (نصوصها "أصبحنا/أصبح…")     — 10 عناصر
 *     2 → ذكر المساء  (نصوصها "أمسينا/أمسى…")     — 8 عناصر
 *
 *   جودة البيانات: content و source و count_description ممتلئة دائمًا،
 *   و`fadl` فارغ في 15 من 34 ⇒ لا يُعرض إلا إن كان نصًّا حقيقيًا.
 *
 *   ملاحظة: `getAdhkar` كان cast بلا تحقّق (`data as Dhikr[]`) فأي تغيير في
 *   المصدر كان يكسر الشاشة بصمت. هنا نُتحقّق صفًّا صفًّا ونُسقط الناقص.
 */

const ADHKAR_API =
  "https://raw.githubusercontent.com/Seen-Arabic/Morning-And-Evening-Adhkar-DB/main/ar.json";

const SOURCE_LABEL = "الأذكار";

/** نص نظيف: يحوّل أي قيمة إلى نص مقصوص بلا فراغات طرفية، "" إن لم يكن نصًّا. */
function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** عدد صحيح موجب، أو القيمة الافتراضية — لا NaN يتسرّب إلى العرض. */
function positiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(text(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** عدد صحيح (يقبل 0) — يُستخدم في `type` الذي قيمته 0/1/2. */
function int(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(text(value), 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

/**
 * يحوّل عنصرًا خامًا إلى Dhikr موحّدة، أو null إن كان ناقصًا لدرجة أنه
 * لا يُعرض (بلا نص ولا ترتيب). الحقول الاختيارية تصبح "" بدل undefined
 * حتى لا تتسرّب "undefined" إلى النصوص العربية على الشاشة.
 */
export function parseDhikr(raw: unknown): Dhikr | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;

  const content = text(row.content);
  const order = int(row.order, 0);
  if (!content || order <= 0) return null;

  const count = positiveInt(row.count, 1);
  const countDescription = text(row.count_description);

  return {
    order,
    content,
    count,
    // الوصف يأتي من المصدر ("مِائَةُ مَرَّةٍ")؛ عند غيابه نصٌّ محايد
    // مبني على العدد الحقيقي — لا رقم مخترع.
    count_description: countDescription || `تكرار ${count}`,
    fadl: text(row.fadl),
    source: text(row.source),
    type: int(row.type, 0),
    audio: text(row.audio),
    hadith_text: text(row.hadith_text),
    explanation_of_hadith_vocabulary: text(row.explanation_of_hadith_vocabulary),
  };
}

/** كل الأذكار من المصدر، مرتّبة بالترتيب الأصلي (order تصاعديًا). */
export async function fetchAdhkar(): Promise<Dhikr[]> {
  const data = await fetchJson<unknown>(ADHKAR_API, SOURCE_LABEL);
  if (!Array.isArray(data)) {
    throw new UpstreamError(SOURCE_LABEL, "بيانات الأذكار غير صالحة.", false);
  }

  const adhkar: Dhikr[] = [];
  const seenOrders = new Set<number>();
  for (const raw of data) {
    const dhikr = parseDhikr(raw);
    if (!dhikr || seenOrders.has(dhikr.order)) continue;
    seenOrders.add(dhikr.order);
    adhkar.push(dhikr);
  }

  if (adhkar.length === 0) {
    throw new UpstreamError(SOURCE_LABEL, "لم يصل أي ذكر من المصدر.", false);
  }

  return adhkar.sort((a, b) => a.order - b.order);
}