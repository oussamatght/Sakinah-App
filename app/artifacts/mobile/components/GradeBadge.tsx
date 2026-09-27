import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

/**
 * شارة درجة الحديث — لون يعكس الدرجة كما طلب المستخدم:
 *   صحيح → أخضر | حسن → أصفر | ضعيف/موضوع/منكر → أحمر | غير ذلك → رمادي محايد.
 * لا تُعرض إطلاقًا إذا لم توجد درجة من المصدر (لا اختراع بيانات).
 */

const GOOD = /^(صحيح|صحيح لغيره|متفق عليه|إسناده قوي|حديث صحيح)/;
const FAIR = /^(حسن|حسن لغيره|حسن صحيح|قوي)/;
const BAD = /^(ضعيف|ضعيف جدًا|موضوع|منكر|باطل|مدلس|لا يصح)/;

export function gradeTone(grade: string): 'good' | 'fair' | 'bad' | 'neutral' {
  const trimmed = grade.trim();
  if (GOOD.test(trimmed)) return 'good';
  if (FAIR.test(trimmed)) return 'fair';
  if (BAD.test(trimmed)) return 'bad';
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
  /** عندما true تعرض شارة "غير متوفر" المحايدة بدل الإخفاء — للمصادر
   *  التي لا تقدم درجة (hadis-api للكتب التسعة). لا نخترع حكمًا أبدًا. */
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
