import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useHadithGrade, type HadithItem } from '@/lib/api';

/** شارة درجة الحديث: صحيح أخضر، حسن أصفر، ضعيف/موضوع أحمر، وما عداه رمادي
 *  محايد — ولا تُعرض إطلاقًا بلا درجة من المصدر (لا اختراع بيانات). */

const GOOD = /^(صحيح|صحيح لغيره|متفق عليه|إسناده قوي|حديث صحيح)/;
const FAIR = /^(حسن|حسن لغيره|حسن صحيح|قوي)/;
const BAD = /^(ضعيف|ضعيف جدًا|موضوع|منكر|باطل|مدلس|لا يصح)/;

// مصدر الإثراء يردّ الدرجة بالإنجليزية حرفيًا: التصنيف للتلوين فقط، والنص المعروض بلا تعديل أو ترجمة.
const GOOD_EN = /^(sahih|sahih lighairihi|sahih isnaad|hasan sahih|mutawatir|sahih mutawatir|agreed upon|sahih - agreed upon)/i;
const FAIR_EN = /^(hasan|hasan lighairihi|hasan isnaad|isnaad hasan|isnaad sahih)/i;
const BAD_EN = /^(daif|very daif|mau?du|munkar|shadh|mursal|la yastawee)/i;

export function gradeTone(grade: string): 'good' | 'fair' | 'bad' | 'neutral' {
  const trimmed = grade.trim();
  if (GOOD.test(trimmed)) return 'good';
  if (FAIR.test(trimmed)) return 'fair';
  if (BAD.test(trimmed)) return 'bad';
  if (GOOD_EN.test(trimmed)) return 'good';
  if (FAIR_EN.test(trimmed)) return 'fair';
  if (BAD_EN.test(trimmed)) return 'bad';
  return 'neutral';
}

const TONE_STYLES = {
  good: { background: '#E7F3EA', border: '#3E8E5A', text: '#2E6B44' },
  fair: { background: '#FBF3DC', border: '#B8860B', text: '#8A6508' },
  bad: { background: '#FBE7E4', border: '#B74C43', text: '#8E352D' },
  neutral: { background: '#EFEDE6', border: '#8A8A8A', text: '#5A5A5A' },
} as const;

export function GradeBadge({
  grade,
  showMissing = false,
}: {
  grade?: string;
  /** true ⇒ شارة "غير متوفر" المحايدة بدل الإخفاء لمصادر بلا درجة (hadis-api) — ولا نخترع حكمًا. */
  showMissing?: boolean;
}) {
  const trimmed = grade?.trim();
  if (!trimmed) {
    if (!showMissing) return null;
    const palette = TONE_STYLES.neutral;
    return (
      <View
        accessibilityLabel="درجة الحديث غير متوفرة من المصدر"
        style={[
          styles.badge,
          { backgroundColor: palette.background, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.text, { color: palette.text }]}>درجة الحديث غير متوفرة</Text>
      </View>
    );
  }
  const tone = gradeTone(trimmed);
  const palette = TONE_STYLES[tone];
  return (
    <View
      accessibilityLabel={`درجة الحديث: ${trimmed}`}
      style={[
        styles.badge,
        { backgroundColor: palette.background, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.text, { color: palette.text }]}>{trimmed}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  text: { fontSize: 11, fontWeight: '700' },
});

/** الدرجة تُحمَّل **كسولًا** لقائمة: تظهر فورًا، والبطاقات المرئية فقط
 *  (افتراضيّة FlatList) تطلب الدرجة وتُحفظ في كاش React Query؛ وبلا درجة من
 *  المصدر = البادج "غير متوفر" أو مخفية. */
export function ItemGrade({
  item,
  bookSlug,
  showMissing = false,
}: {
  item?: HadithItem | null;
  bookSlug?: string | null;
  showMissing?: boolean;
}) {
  const grade = useHadithGrade(item, bookSlug);
  return <GradeBadge grade={grade} showMissing={showMissing} />;
}
