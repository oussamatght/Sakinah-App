import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { IconButton, Screen } from "@/components/ui";
import { radii, spacing, typography } from "@/constants/tokens";
import { useColors } from "@/hooks/useColors";
import {
  clearTasbihHistory,
  getTasbihHistory,
  getTasbihTotals,
  saveTasbihEntry,
  type TasbihEntry,
} from "@/lib/storage";

const QUICK_DHIKR = [
  "سبحان الله",
  "الحمد لله",
  "الله أكبر",
  "لا إله إلا الله",
  "أستغفر الله",
  "سبحان الله وبحمده",
  "سبحان الله العظيم",
];
const TARGETS = [33, 100, 250, 500, 1000];
const RECENT_LIMIT = 8;

/**
 * التسبيح — تبويب العداد الرقمي (بديل تبويب الأذكار):
 * اسم ذكر حر أو من الأزرار السريعة، دائرة عد كبيرة مع haptic، تصفير，
 * حفظ محلي (AsyncStorage) وسجل مجمع لكل ذكر.
 */
export default function TasbihScreen() {
  const colors = useColors();
  const router = useRouter();
  const [dhikr, setDhikr] = useState("سبحان الله");
  const [count, setCount] = useState(0);
  const [target, setTarget] = useState<number | null>(33);
  const [history, setHistory] = useState<TasbihEntry[]>([]);
  const [totals, setTotals] = useState<
    Array<{ dhikr: string; total: number; sessions: number }>
  >([]);
  const [showHistory, setShowHistory] = useState(false);

  const refreshHistory = useCallback(async () => {
    setTotals(await getTasbihTotals());
    setHistory(await getTasbihHistory());
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useFocusEffect(
    useCallback(() => {
      void refreshHistory();
    }, [refreshHistory]),
  );

  const bump = () => {
    const next = count + 1;
    setCount(next);
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
        () => undefined,
      );
    }
    if (target !== null && next >= target) {
      if (Platform.OS !== "web") {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => undefined);
      }
    }
  };

  const reset = () => setCount(0);

  const save = async () => {
    await saveTasbihEntry(dhikr, count);
    await refreshHistory();
    setCount(0);
  };

  const progress = target ? Math.min(count / target, 1) : 0;

  return (
    <Screen scroll={false} contentStyle={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon={showHistory ? "list" : "bar-chart-2"}
          label={showHistory ? "عرض آخر الجلسات" : "عرض الإجماليات"}
          onPress={() => setShowHistory((value) => !value)}
          variant="soft"
        />
        <Text style={[styles.title, { color: colors.foreground }]}>
          التسبيح
        </Text>
        <IconButton
          icon="trash-2"
          label="حذف السجل"
          onPress={() =>
            void (async () => {
              await clearTasbihHistory();
              setHistory([]);
              setTotals([]);
            })()
          }
          variant="soft"
        />
      </View>

      <View style={styles.chips}>
        {QUICK_DHIKR.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityLabel={`اختيار ${option}`}
            onPress={() => {
              setDhikr(option);
              reset();
            }}
            style={[
              styles.chip,
              dhikr === option && { backgroundColor: colors.primary },
            ]}>
            <Text
              style={[
                styles.chipText,
                {
                  color:
                    dhikr === option
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                },
              ]}>
              {option}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.targetRow}>
        {TARGETS.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`الهدف ${value}`}
            onPress={() => setTarget(target === value ? null : value)}
            style={[
              styles.targetChip,
              target === value && { backgroundColor: colors.primary },
            ]}>
            <Text
              style={[
                styles.targetText,
                {
                  color:
                    target === value
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                },
              ]}>
              {value}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        testID="tasbih-counter"
        accessibilityRole="button"
        accessibilityLabel={`${dhikr}: ${count}`}
        accessibilityHint="اضغط للعد"
        onPress={bump}
        style={({ pressed }) => [
          styles.circle,
          {
            borderColor: colors.primary,
            backgroundColor: pressed ? colors.secondary : colors.card,
          },
        ]}>
        <Text
          style={[styles.dhikrText, { color: colors.foreground }]}
          numberOfLines={1}>
          {dhikr}
        </Text>
        <Text style={[styles.count, { color: colors.primary }]}>{count}</Text>
        {target ? (
          <>
            <Text style={[styles.target, { color: colors.mutedForeground }]}>
              الهدف {target}
            </Text>
            <View
              style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.primary,
                    width: `${progress * 100}%`,
                  },
                ]}
              />
            </View>
          </>
        ) : (
          <Text style={[styles.target, { color: colors.mutedForeground }]}>
            عداد حر
          </Text>
        )}
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="إعادة التصفير"
          onPress={reset}
          style={({ pressed }) => [
            styles.actionButton,
            { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
          ]}>
          <Feather name="rotate-ccw" size={16} color={colors.primary} />
          <Text style={[styles.actionText, { color: colors.foreground }]}>
            تصفير
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="حفظ الجلسة"
          disabled={count === 0}
          onPress={() => void save()}
          style={({ pressed }) => [
            styles.actionButton,
            {
              borderColor: colors.border,
              opacity: count === 0 ? 0.4 : pressed ? 0.65 : 1,
            },
          ]}>
          <Feather name="save" size={16} color={colors.primary} />
          <Text style={[styles.actionText, { color: colors.foreground }]}>
            حفظ
          </Text>
        </Pressable>
      </View>

      {showHistory ? (
        <View style={[styles.historyCard, { borderColor: colors.border }]}>
          <Text style={[styles.historyTitle, { color: colors.foreground }]}>
            السجل — الإجماليات
          </Text>
          {totals.length === 0 ? (
            <Text
              style={[styles.historyEmpty, { color: colors.mutedForeground }]}>
              لا توجد جلسات محفوظة بعد.
            </Text>
          ) : (
            <FlatList
              data={totals}
              keyExtractor={(item) => item.dhikr}
              nestedScrollEnabled
              style={styles.historyList}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.historyRow,
                    { borderBottomColor: colors.border },
                  ]}>
                  <Text
                    style={[styles.historyDhikr, { color: colors.foreground }]}>
                    {item.dhikr}
                  </Text>
                  <Text
                    style={[styles.historyCount, { color: colors.primary }]}>
                    {item.total}
                  </Text>
                </View>
              )}
            />
          )}
          <Text
            style={[
              styles.historyTitle,
              { color: colors.foreground, marginTop: spacing.md },
            ]}>
            آخر الجلسات
          </Text>
          {history.slice(0, RECENT_LIMIT).map((entry) => (
            <View
              key={entry.id}
              style={[styles.historyRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.historyDhikr, { color: colors.foreground }]}>
                {entry.dhikr}
              </Text>
              <Text
                style={[
                  styles.historyCount,
                  { color: colors.mutedForeground },
                ]}>
                {entry.count}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
  title: { fontSize: typography.h1, fontWeight: "700" },
  chips: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginTop: spacing.md,
  },
  chip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: "transparent",
  },
  chipText: { fontSize: typography.bodySmall, fontWeight: "600" },
  targetRow: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: 8,
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  targetChip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  targetText: { fontSize: typography.caption, fontWeight: "700" },
  circle: {
    alignItems: "center",
    borderRadius: 180,
    borderWidth: 2,
    height: 250,
    justifyContent: "center",
    marginTop: spacing.lg,
    width: 250,
    alignSelf: "center",
  },
  dhikrText: {
    fontSize: typography.body,
    fontWeight: "600",
    marginBottom: spacing.xs,
    maxWidth: 180,
  },
  count: { fontSize: 64, fontWeight: "300" },
  target: { fontSize: typography.bodySmall, marginTop: 2 },
  progressTrack: {
    borderRadius: radii.pill,
    height: 5,
    marginTop: spacing.md,
    overflow: "hidden",
    width: 130,
  },
  progressFill: { borderRadius: radii.pill, height: "100%" },
  actions: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  actionButton: {
    alignItems: "center",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row-reverse",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
  },
  actionText: { fontSize: typography.bodySmall, fontWeight: "600" },
  historyCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: spacing.lg,
    maxHeight: 300,
    padding: spacing.md,
  },
  historyTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    marginBottom: spacing.xs,
    textAlign: "right",
  },
  historyEmpty: { fontSize: typography.bodySmall, textAlign: "center" },
  historyList: { maxHeight: 120 },
  historyRow: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    minHeight: 40,
  },
  historyDhikr: { flex: 1, fontSize: typography.bodySmall, textAlign: "right" },
  historyCount: { fontSize: typography.body, fontWeight: "700" },
});
