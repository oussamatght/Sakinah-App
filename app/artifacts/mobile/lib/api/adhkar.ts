import { fetchJson } from "./http";
import { UpstreamError } from "./types";
import type { Dhikr } from "./types";

/**
 * مصدر الأذكار: مستودع Seen-Arabic. البنية متحقَّق منها حيًّا
 * (scripts/probe-adhkar-shape.cjs): 34 عنصرًا بالحقول order, content, count,
 * count_description, fadl, source, type, audio, hadith_text,
 * explanation_of_hadith_vocabulary.
 *
 *   `type` مستنتج من نصوص العناصر لا مُفترَض: 0 ذكر عام (16)، 1 صباح (10)، 2 مساء (8).
 *   جودة البيانات: content و source و count_description ممتلئة دائمًا، و`fadl`
 *   فارغ في 15 من 34 ⇒ لا يُعرض إلا إن كان نصًّا حقيقيًا.
 *
 *   getAdhkar كان cast بلا تحقّق فأي تغيير في المصدر كان يكسر الشاشة بصمت،
 *   فصار التحقّق صفًّا صفًّا مع إسقاط الناقص.
 */

const ADHKAR_API =
  "https://raw.githubusercontent.com/Seen-Arabic/Morning-And-Evening-Adhkar-DB/main/ar.json";

const SOURCE_LABEL = "الأذكار";

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** عدد صحيح موجب أو الافتراضي — لا NaN يتسرّب إلى العرض. */
function positiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(text(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** عدد صحيح يقبل 0 — لقيمة `type` (0/1/2). */
function int(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(text(value), 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

/**
 * عنصر خام → Dhikr موحّدة، أو null إن كان ناقصًا لدرجة عدم عرضه (بلا نص ولا
 * ترتيب)؛ والحقول الاختيارية تصبح "" حتى لا تتسرّب "undefined" إلى النصوص.
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
    // الوصف من المصدر، وعند غيابه نص محايد مبني على العدد الحقيقي — لا رقم مخترع.
    count_description: countDescription || `تكرار ${count}`,
    fadl: text(row.fadl),
    source: text(row.source),
    type: int(row.type, 0),
    audio: text(row.audio),
    hadith_text: text(row.hadith_text),
    explanation_of_hadith_vocabulary: text(row.explanation_of_hadith_vocabulary),
  };
}

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