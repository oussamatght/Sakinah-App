import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Screen, IconButton, SectionTitle } from '@/components/ui';
import { radii, spacing, typography } from '@/constants/tokens';
import { useColors } from '@/hooks/useColors';
import {
  MUSHAF_PAGES,
  effectiveDailyPages,
  getWirdGoal,
  localDayKey,
  setWirdGoal,
  addWirdPages,
  type WirdGoal,
} from '@/lib/storage';
import { useWirdSummary } from '@/hooks/useAppState';

const PAGE_PRESETS = [1, 2, 4, 6, 10];
const KHATMA_PRESETS = [30, 60, 90, 180, 365];

/** صياغة عربية بسيطة للمتبقي (لا أرقام عملاقة ولا كسور). */
function remainingLabel(remaining: number): string {
  if (remaining === 0) return 'لا يوجد متبقٍ';
  if (remaining === 1) return 'صفحة واحدة';
  if (remaining === 2) return 'صفحتان';
  if (remaining <= 10) return `${remaining} صفحات`;
  return `${remaining} صفحة`;
}

/**
 * الورد اليومي — إعادة تصميم (Task 3):
 * كل الأرقام مشتقة من computeWirdProgress (منطق واحد مُختبر) ولا حسابات
 * داخل الواجهة. البنية: بطاقة التقدم أولًا (الهدف/التقدم/المتبقي/الحالة)
 * ثم تعديل الهدف، مع أزرار تسجيل الصفحات المتوافقة مع نفس المخزن الحالي
 * (wird.days.v1) — لا نقاط تخزين جديدة.
 */
export default function WirdSettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const summary = useWirdSummary();
  const existing: WirdGoal | null = summary.goal;
  const [mode, setMode] = useState<'pages' | 'khatma'>(existing?.mode ?? 'pages');
  const [pages, setPages] = useState(existing?.targetPages ?? 4);
  const [days, setDays] = useState(existing?.targetDays ?? 60);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(!existing);

  // الحسابات الوحيدة في الصفحة — كلها من الدالة النقية المُختبرة:
  const currentDailyGoal = existing ? effectiveDailyPages(existing) : 0;
  const completed = summary.today?.pagesRead ?? 0;
  const remaining = Math.max(currentDailyGoal - completed, 0);
  const progress = currentDailyGoal > 0 ? Math.min(completed / currentDailyGoal, 1) : 0;
  const isComplete = currentDailyGoal > 0 && remaining === 0;

  const percent = useMemo(() => Math.round(progress * 100), [progress]);

  const handleSave = async () => {
    await setWirdGoal(mode === 'pages' ? { mode, targetPages: pages } : { mode, targetDays: days });
    await summary.refresh();
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleLog = async (delta: number) => {
    await addWirdPages(delta);
    await summary.refresh();
  };

  const startEdit = async () => {
    // نبدأ التحرير من القيم الحالية المحفوظة فعلًا (وليس قيم افتراضية).
    const goal = await getWirdGoal();
    if (goal) {
      setMode(goal.mode);
      setPages(goal.targetPages ?? 4);
      setDays(goal.targetDays ?? 60);
    }
    setEditing(true);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
        <View style={styles.titleCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>الورد اليومي</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            وردك من القرآن — محفوظ على جهازك
          </Text>
        </View>
      </View>

      <SectionTitle
        title="تقدم اليوم"
        action={!editing && existing ? 'تعديل الهدف' : undefined}
        onAction={!editing && existing ? () => void startEdit() : undefined}
      />

      {existing ? (
        <View style={[styles.progressCard, { backgroundColor: colors.accent }]}>
          {/* الهدف اليومي */}
          <Text style={[styles.goalLine, { color: colors.mutedForeground }]}>
            الهدف اليومي: {currentDailyGoal} {currentDailyGoal === 1 ? 'صفحة' : 'صفحات'}
          </Text>

          {/* حالة اليوم الواضحة */}
          {isComplete ? (
            <Text style={[styles.statusLine, { color: colors.primary }]}>
              أتممت وردك اليوم ✅
            </Text>
          ) : (
            <Text style={[styles.statusLine, { color: colors.foreground }]}>
              بقي لك {remainingLabel(remaining)} لإكمال وردك
            </Text>
          )}

          {/* التقدم: 3/5 + نسبة */}
          <Text style={[styles.progressTitle, { color: colors.foreground }]}>
            التقدم: {completed} / {currentDailyGoal} صفحات — {percent}%
          </Text>

          {/* Progress Bar */}
          <View style={[styles.track, { backgroundColor: colors.muted }]}>
            <View
              style={[
                styles.fill,
                { backgroundColor: colors.primary, width: `${Math.max(percent, completed > 0 ? 3 : 0)}%` },
              ]}
            />
          </View>

          {/* المتبقي */}
          <Text style={[styles.remainingLine, { color: colors.mutedForeground }]}>
            المتبقي: {remainingLabel(remaining)}
          </Text>

          {/* أزرار تسجيل التقدم — نفس المخزن الحالي */}
          <View style={styles.progressActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="تسجيل صفحة مقروءة"
              onPress={() => void handleLog(1)}
              style={({ pressed }) => [styles.logButton, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            >
              <Feather name="plus" size={15} color={colors.primaryForeground} />
              <Text style={[styles.logText, { color: colors.primaryForeground }]}>صفحة</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="تسجيل خمس صفحات"
              onPress={() => void handleLog(5)}
              style={({ pressed }) => [styles.logButton, { backgroundColor: colors.secondary, opacity: pressed ? 0.8 : 1 }]}
            >
              <Feather name="plus" size={15} color={colors.primary} />
              <Text style={[styles.logTextSecondary, { color: colors.primary }]}>5 صفحات</Text>
            </Pressable>
          </View>

          <Text style={[styles.streakLine, { color: colors.mutedForeground }]}>
            🔥 {summary.streak.current} يوم متتالي • الأطول: {summary.streak.longest} • تم إنجاز {summary.totalCompletedDays} يوم
          </Text>
        </View>
      ) : (
        <View style={[styles.progressCard, { backgroundColor: colors.accent }]}>
          <Text style={[styles.statusLine, { color: colors.foreground }]}>
            لم تحدد وردك اليومي بعد
          </Text>
          <Text style={[styles.remainingLine, { color: colors.mutedForeground }]}>
            اختر هدفًا بالأسفل — صفحات يومية أو ختمة كاملة خلال مدة.
          </Text>
        </View>
      )}

      {editing ? (
        <>
          <SectionTitle title="نوع الورد" />
          <View style={[styles.modeRow, { borderColor: colors.border }]}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: mode === 'pages' }}
              onPress={() => setMode('pages')}
              style={[styles.modeOption, mode === 'pages' && { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.modeText, { color: mode === 'pages' ? colors.primaryForeground : colors.mutedForeground }]}>
                صفحات يوميًا
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: mode === 'khatma' }}
              onPress={() => setMode('khatma')}
              style={[styles.modeOption, mode === 'khatma' && { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.modeText, { color: mode === 'khatma' ? colors.primaryForeground : colors.mutedForeground }]}>
                ختمة كاملة
              </Text>
            </Pressable>
          </View>

          {mode === 'pages' ? (
            <>
              <SectionTitle title="الصفحات يوميًا" />
              <View style={styles.presets}>
                {PAGE_PRESETS.map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: pages === value }}
                    onPress={() => setPages(value)}
                    style={[
                      styles.preset,
                      { borderColor: colors.border, backgroundColor: colors.card },
                      pages === value && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.presetText,
                        { color: pages === value ? colors.primaryForeground : colors.foreground },
                      ]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                {pages} صفحة يوميًا = ختمة في {Math.ceil(MUSHAF_PAGES / pages)} يوم
              </Text>
            </>
          ) : (
            <>
              <SectionTitle title="أنهي المصحف خلال" />
              <View style={styles.presets}>
                {KHATMA_PRESETS.map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: days === value }}
                    onPress={() => setDays(value)}
                    style={[
                      styles.preset,
                      { borderColor: colors.border, backgroundColor: colors.card },
                      days === value && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.presetText,
                        { color: days === value ? colors.primaryForeground : colors.foreground },
                      ]}
                    >
                      {value} يوم
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                حوالي {effectiveDailyPages({ mode, targetDays: days, createdAt: '' })} صفحة يوميًا
              </Text>
            </>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="حفظ الورد"
            onPress={() => void handleSave()}
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.saveText, { color: colors.primaryForeground }]}>
              {saved ? 'تم الحفظ ✓' : 'حفظ الورد'}
            </Text>
          </Pressable>
        </>
      ) : null}

      <Text style={[styles.privacy, { color: colors.mutedForeground }]}>
        تقدمك محفوظ على جهازك فقط • اليوم: {localDayKey()}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: spacing.lg },
  titleCopy: { alignItems: 'flex-end', flex: 1 },
  title: { fontSize: typography.h1, fontWeight: '700', textAlign: 'right' },
  subtitle: { fontSize: typography.caption, marginTop: 3 },
  progressCard: { borderRadius: radii.md, padding: spacing.md },
  goalLine: { fontSize: typography.bodySmall, fontWeight: '600', textAlign: 'right' },
  statusLine: { fontSize: typography.h3, fontWeight: '700', marginTop: spacing.xs, textAlign: 'right' },
  progressTitle: { fontSize: typography.bodyLarge, fontWeight: '700', marginTop: spacing.sm, textAlign: 'right' },
  track: { borderRadius: radii.pill, height: 8, marginTop: spacing.sm, overflow: 'hidden' },
  fill: { borderRadius: radii.pill, height: '100%' },
  remainingLine: { fontSize: typography.bodySmall, marginTop: spacing.sm, textAlign: 'right' },
  progressActions: { flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.md },
  logButton: { alignItems: 'center', borderRadius: radii.pill, flexDirection: 'row-reverse', gap: 4, paddingHorizontal: spacing.md, paddingVertical: 9 },
  logText: { fontSize: typography.bodySmall, fontWeight: '700' },
  logTextSecondary: { fontSize: typography.bodySmall, fontWeight: '700' },
  streakLine: { fontSize: typography.caption, marginTop: spacing.md, textAlign: 'right' },
  modeRow: { borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row-reverse', padding: 4 },
  modeOption: { alignItems: 'center', borderRadius: 9, flex: 1, paddingVertical: 11 },
  modeText: { fontSize: typography.bodySmall, fontWeight: '700' },
  presets: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  preset: { alignItems: 'center', borderRadius: radii.sm, borderWidth: 1, flexGrow: 1, paddingVertical: 13, width: '18%' },
  presetText: { fontSize: typography.bodySmall, fontWeight: '700' },
  hint: { fontSize: typography.caption, marginTop: spacing.sm, textAlign: 'right' },
  saveButton: { alignItems: 'center', borderRadius: radii.pill, marginTop: spacing.xl, paddingVertical: 15 },
  saveText: { fontSize: typography.body, fontWeight: '700' },
  privacy: { fontSize: typography.caption, marginTop: spacing.md, textAlign: 'center' },
});
