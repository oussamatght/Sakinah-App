import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { IconButton, LoadingState, Screen } from "@/components/ui";
import { radii, spacing, typography } from "@/constants/tokens";
import { useColors } from "@/hooks/useColors";
import { useFavoritesList, useSettings } from "@/hooks/useAppState";
import { categoryLabel, findAdhkar, useAdhkarProgress, useAdhkarWird, useGetAdhkar } from "@/hooks/useAdhkar";
import type { Dhikr } from "@/lib/api/types";

/** الأرقام الكبيرة جديرة باختصار عملي: هدف ١٠٠ لا يُنجز ضغطةً ضغطة. */
const BIG_STEP_THRESHOLD = 20;

/**
 * شاشة ذكر واحد مع عدّاده.
 *
 * العدّاد قائم على التكرار الحقيقي من المصدر (`count`) — ولا يُطلب منه عدد
 * مخترع. التقدّم يُحفظ محليًا لكل يوم، وعند بلوغ التكرار يُسجَّل الذكر في
 * ورد اليوم. وكل خطوة تُطلق اهتزازًا خفيفًا واحدًا (بلا اهتزاز على الويب).
 */
export default function DhikrPracticeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { settings } = useSettings();
  const fontScale = settings.fontScale;
  const params = useLocalSearchParams<{ order?: string | string[] }>();
  const order = Number(Array.isArray(params.order) ? params.order[0] : params.order);

  const { data, isPending } = useGetAdhkar();
  const { counts, increment, setCount } = useAdhkarProgress();
  const { goal, completeWird } = useAdhkarWird();
  const { isFavorite, toggle } = useFavoritesList();

  const dhikr: Dhikr | undefined = useMemo(
    () => findAdhkar(data, Number.isFinite(order) ? order : -1),
    [data, order],
  );

  const counted = dhikr ? (counts[dhikr.order] ?? 0) : 0;
  const target = dhikr?.count ?? 1;
  const progress = Math.min(counted / target, 1);
  const done = counted >= target;
  const favorite = dhikr ? isFavorite("dhikr", String(dhikr.order)) : false;

  const index = data && dhikr ? data.findIndex((item) => item.order === dhikr.order) : -1;
  const previous = index > 0 && data ? data[index - 1] : undefined;
  const next = data && index >= 0 && index < data.length - 1 ? data[index + 1] : undefined;

  const [justCompleted, setJustCompleted] = useState(false);

  useEffect(() => {
    setJustCompleted(false);
  }, [dhikr?.order]);

  /**
   * كل زيادة تمرّ من هنا: ترفع العدّاد المخزَّن (لا حالة React) وتُقصّ عند
   * التكرار المطلوب، فالنقر السريع لا يضيع، و"زيادة ١٠" تُتمّ الورد تمامًا
   * كما تفعل النقرة الواحدة.
   */
  const advance = useCallback(
    (by: number) => {
      if (!dhikr) return;
      const willComplete = counted + by >= target;
      void increment(dhikr.order, target, by);
      if (Platform.OS !== "web") {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      }
      if (willComplete) {
        setJustCompleted(true);
        if (Platform.OS !== "web") {
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          ).catch(() => undefined);
        }
        void completeWird(dhikr.order, goal?.target ?? 1);
      }
    },
    [completeWird, counted, dhikr, goal?.target, increment, target],
  );

  const tap = useCallback(() => advance(1), [advance]);
  const addTen = useCallback(() => advance(10), [advance]);

  const restart = useCallback(() => {
    if (!dhikr) return;
    void setCount(dhikr.order, 0);
    setJustCompleted(false);
  }, [dhikr, setCount]);

  const go = useCallback(
    (targetOrder?: Dhikr) => {
      if (!targetOrder) return;
      router.setParams({ order: String(targetOrder.order) });
    },
    [router],
  );

  if (isPending) {
    return (
      <Screen scroll={false} contentStyle={styles.centered}>
        <LoadingState label="جارٍ تحميل الذكر" />
      </Screen>
    );
  }

  if (!dhikr) {
    return (
      <Screen scroll={false} contentStyle={styles.centered}>
        <View style={styles.missing}>
          <Text style={[styles.missingTitle, { color: colors.foreground }]}>
            لم نعثر على هذا الذكر
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="العودة إلى الأذكار"
            onPress={() => router.replace("/dhikr")}
            style={[styles.missingButton, { backgroundColor: colors.primary }]}>
            <Text style={[styles.missingButtonText, { color: colors.primaryForeground }]}>
              العودة إلى الأذكار
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-right"
          label="العودة"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/dhikr"))}
          variant="soft"
        />

        <View style={styles.headerCopy}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>
            {categoryLabel(dhikr)}
          </Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            ذكر {dhikr.order}
          </Text>
        </View>

        <IconButton
          icon="heart"
          label={favorite ? "إزالة من المفضلة" : "حفظ في المفضلة"}
          onPress={() =>
            void toggle({
              kind: "dhikr",
              refId: String(dhikr.order),
              title: dhikr.content,
              text: dhikr.content,
              subtitle: dhikr.count_description,
            })
          }
          variant="soft"
        />
      </View>

      <ScrollView
        testID="dhikr-practice-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={[styles.textCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text
            style={[
              styles.contentText,
              {
                color: colors.foreground,
                fontSize: Math.round(21 * fontScale),
                lineHeight: Math.round(40 * fontScale),
              },
            ]}>
            {dhikr.content}
          </Text>
          <Text style={[styles.countDescription, { color: colors.mutedForeground }]}>
            {dhikr.count_description}
          </Text>
        </View>

        {/* العدّاد — هدف واحد كبير يمكن الضغط عليه بيد واحدة. */}
        <Pressable
          testID="dhikr-counter"
          accessibilityRole="button"
          accessibilityLabel={`عدّ الذكر ${counted} من ${target}`}
          accessibilityHint="اضغط لزيادة التكرار واحدًا"
          onPress={tap}
          style={({ pressed }) => [
            styles.counter,
            {
              backgroundColor: pressed ? colors.secondary : colors.card,
              borderColor: done ? colors.primary : colors.border,
            },
          ]}>
          <Text
            style={[
              styles.counterNumber,
              {
                color: done ? colors.primary : colors.foreground,
                fontSize: Math.round(64 * fontScale),
              },
            ]}>
            {counted}
          </Text>
          <Text style={[styles.counterTarget, { color: colors.mutedForeground }]}>
            من {target}
          </Text>

          <View style={[styles.counterTrack, { backgroundColor: colors.secondary }]}>
            <View
              style={[
                styles.counterFill,
                {
                  backgroundColor: colors.primary,
                  width: `${Math.round(progress * 100)}%`,
                },
              ]}
            />
          </View>

          <Text style={[styles.counterHint, { color: colors.mutedForeground }]}>
            {done ? "أتممت الذكر" : "اضغط للعد"}
          </Text>
        </Pressable>

        {justCompleted && done ? (
          <View testID="dhikr-complete" style={[styles.complete, { backgroundColor: colors.secondary }]}>
            <Feather name="check-circle" size={17} color={colors.primary} />
            <Text style={[styles.completeText, { color: colors.foreground }]}>
              أتممت الذكر، تقبّل الله منك.
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            testID="dhikr-reset"
            accessibilityRole="button"
            accessibilityLabel="إعادة العدّ من الصفر"
            onPress={restart}
            style={({ pressed }) => [
              styles.action,
              { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
            ]}>
            <Feather name="rotate-ccw" size={15} color={colors.primary} />
            <Text style={[styles.actionText, { color: colors.foreground }]}>إعادة</Text>
          </Pressable>

          {target >= BIG_STEP_THRESHOLD ? (
            <Pressable
              testID="dhikr-add-ten"
              accessibilityRole="button"
              accessibilityLabel="زيادة عشرة"
              onPress={addTen}
              style={({ pressed }) => [
                styles.action,
                { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
              ]}>
              <Feather name="plus" size={15} color={colors.primary} />
              <Text style={[styles.actionText, { color: colors.foreground }]}>زيادة ١٠</Text>
            </Pressable>
          ) : null}
        </View>

        {/* ما ورد في المصدر فقط — الأقسام الفارغة لا تُعرض إطلاقًا. */}
        {dhikr.fadl ? (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>الفضل</Text>
            <Text style={[styles.sectionText, { color: colors.foreground, fontSize: Math.round(typography.body * fontScale), lineHeight: Math.round(27 * fontScale) }]}>{dhikr.fadl}</Text>
          </View>
        ) : null}

        {dhikr.hadith_text ? (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>نص الحديث</Text>
            <Text style={[styles.sectionText, { color: colors.foreground }]}>
              {dhikr.hadith_text}
            </Text>
          </View>
        ) : null}

        {dhikr.explanation_of_hadith_vocabulary ? (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>شرح المفردات</Text>
            <Text style={[styles.sectionText, { color: colors.foreground }]}>
              {dhikr.explanation_of_hadith_vocabulary}
            </Text>
          </View>
        ) : null}

        {dhikr.source ? (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>المصدر</Text>
            <Text style={[styles.sectionText, { color: colors.mutedForeground }]}>
              {dhikr.source}
            </Text>
          </View>
        ) : null}

        <View style={styles.nav}>
          <Pressable
            testID="dhikr-previous"
            accessibilityRole="button"
            accessibilityLabel="الذكر السابق"
            accessibilityState={{ disabled: !previous }}
            disabled={!previous}
            onPress={() => go(previous)}
            style={({ pressed }) => [
              styles.navButton,
              { borderColor: colors.border, opacity: !previous ? 0.35 : pressed ? 0.65 : 1 },
            ]}>
            <Feather name="chevron-right" size={16} color={colors.primary} />
            <Text style={[styles.navText, { color: colors.foreground }]}>السابق</Text>
          </Pressable>

          <Pressable
            testID="dhikr-next"
            accessibilityRole="button"
            accessibilityLabel="الذكر التالي"
            accessibilityState={{ disabled: !next }}
            disabled={!next}
            onPress={() => go(next)}
            style={({ pressed }) => [
              styles.navButton,
              { borderColor: colors.border, opacity: !next ? 0.35 : pressed ? 0.65 : 1 },
            ]}>
            <Text style={[styles.navText, { color: colors.foreground }]}>التالي</Text>
            <Feather name="chevron-left" size={16} color={colors.primary} />
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1 },
  /** flex: 1 ضروري: بدونه لا يتمدّد ScrollView داخل Screen بلا تمرير. */
  screen: { flex: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  headerCopy: { alignItems: "flex-end", flex: 1 },
  headerEyebrow: { fontSize: typography.bodySmall, fontWeight: "700", textAlign: "right" },
  headerTitle: {
    fontSize: typography.h1,
    fontWeight: "700",
    marginTop: 2,
    textAlign: "right",
  },
  scrollContent: { paddingBottom: spacing.xxl },
  textCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  contentText: {
    fontSize: 21,
    fontWeight: "500",
    lineHeight: 40,
    textAlign: "right",
  },
  countDescription: {
    fontSize: typography.caption,
    fontWeight: "700",
    marginTop: spacing.sm,
    textAlign: "right",
  },
  counter: {
    alignItems: "center",
    borderRadius: radii.lg,
    borderWidth: 2,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  counterNumber: { fontSize: 64, fontWeight: "300" },
  counterTarget: { fontSize: typography.bodySmall, marginTop: 2 },
  counterTrack: {
    borderRadius: radii.pill,
    height: 6,
    marginTop: spacing.md,
    overflow: "hidden",
    width: "100%",
  },
  counterFill: { borderRadius: radii.pill, height: "100%" },
  counterHint: {
    fontSize: typography.bodySmall,
    fontWeight: "600",
    marginTop: spacing.sm,
  },
  complete: {
    alignItems: "center",
    borderRadius: radii.md,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  completeText: { flex: 1, fontSize: typography.bodySmall, fontWeight: "600", textAlign: "right" },
  actions: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
    justifyContent: "center",
    marginTop: spacing.md,
  },
  action: {
    alignItems: "center",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row-reverse",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
  },
  actionText: { fontSize: typography.bodySmall, fontWeight: "600" },
  section: {
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.bodySmall,
    fontWeight: "700",
    marginBottom: spacing.xs,
    textAlign: "right",
  },
  sectionText: { fontSize: typography.body, lineHeight: 27, textAlign: "right" },
  nav: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  navButton: {
    alignItems: "center",
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row-reverse",
    gap: 6,
    justifyContent: "center",
    paddingVertical: 12,
  },
  navText: { fontSize: typography.bodySmall, fontWeight: "600" },
  missing: { alignItems: "center", flex: 1, justifyContent: "center", padding: spacing.xl },
  missingTitle: { fontSize: typography.h3, fontWeight: "700", marginBottom: spacing.md },
  missingButton: { borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  missingButtonText: { fontSize: typography.bodySmall, fontWeight: "700" },
});