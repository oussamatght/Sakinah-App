import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  AppHeader,
  EmptyState,
  ErrorState,
  isOfflineError,
  LoadingState,
  Screen,
  SearchBar,
} from "@/components/ui";
import { DhikrCard } from "@/components/DhikrCard";
import { radii, spacing, typography } from "@/constants/tokens";
import { useColors } from "@/hooks/useColors";
import { useFavoritesList } from "@/hooks/useAppState";
import {
  ADHKAR_CATEGORIES,
  dailyAdhkar,
  nextWirdDhikr,
  useAdhkarProgress,
  useAdhkarWird,
  useFilteredAdhkar,
  useGetAdhkar,
  WIRD_TARGET_OPTIONS,
  type AdhkarCategoryKey,
} from "@/hooks/useAdhkar";

const SEARCH_PLACEHOLDER = "ابحث في الأذكار...";

/**
 * شاشة الأذكار — القائمة والمرجع والورد اليومي في مكان واحد. البحث والتصفية
 * محليّان على المصفوفة المحمّلة (استعلام واحد) فلا طلب شبكة مع كل حرف.
 */
export default function AdhkarScreen() {
  const colors = useColors();
  const router = useRouter();
  const { data, isPending, isError, error, refetch } = useGetAdhkar();
  const { counts, refresh: refreshCounts } = useAdhkarProgress();
  const { progress: wird, setGoal, clearGoal } = useAdhkarWird();
  const { favorites, refresh: refreshFavorites, toggle } = useFavoritesList();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AdhkarCategoryKey>("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const favoriteOrders = useMemo(
    () =>
      new Set(
        favorites
          .filter((item) => item.kind === "dhikr")
          .map((item) => Number(item.refId))
          .filter((value) => Number.isFinite(value)),
      ),
    [favorites],
  );

  const filtered = useFilteredAdhkar(data, query, category);
  const visible = useMemo(
    () => (onlyFavorites ? filtered.filter((item) => favoriteOrders.has(item.order)) : filtered),
    [filtered, onlyFavorites, favoriteOrders],
  );

  const todayDhikr = useMemo(() => dailyAdhkar(data ?? []), [data]);
  const nextInWird = useMemo(
    () => (wird.hasGoal ? nextWirdDhikr(data, wird.doneOrders) : undefined),
    [data, wird.hasGoal, wird.doneOrders],
  );

  // العدّاد والمفضلة يتغيّران خارج الشاشة (شاشة الذكر)، فنُعيد القراءة عند العودة.
  useFocusEffect(
    useCallback(() => {
      void refreshCounts();
      void refreshFavorites();
    }, [refreshCounts, refreshFavorites]),
  );

  const openPractice = useCallback(
    (order: number) => router.push({ pathname: "/dhikr-practice", params: { order: String(order) } }),
    [router],
  );

  const onToggleFavorite = useCallback(
    (order: number) => {
      const dhikr = data?.find((item) => item.order === order);
      if (!dhikr) return;
      void toggle({
        kind: "dhikr",
        refId: String(order),
        title: dhikr.content,
        text: dhikr.content,
        subtitle: dhikr.count_description,
      });
    },
    [data, toggle],
  );

  const header = (
    <View>
      <AppHeader
        eyebrow="اذكر الله تطمئن القلوب"
        title="الأذكار"
        action="sliders"
        actionLabel="الإعدادات"
        onAction={() => router.push("/settings")}
      />

      <SearchBar
        placeholder={SEARCH_PLACEHOLDER}
        value={query}
        onChangeText={setQuery}
      />

      {/* الورد اليومي — يظهر فقط إذا حدّد المستخدم هدفًا، ويتابع ما أنجزه فعلًا. */}
      {wird.hasGoal ? (
        <View
          testID="adhkar-wird-card"
          style={[styles.wird, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
          <View style={styles.wirdTop}>
            <Text style={[styles.wirdEyebrow, { color: colors.primarySoft }]}>
              وردك اليوم
            </Text>
            <Text style={[styles.wirdCount, { color: colors.primaryForeground }]}>
              {wird.completed} / {wird.dailyGoal}
            </Text>
          </View>

          <Text style={[styles.wirdTitle, { color: colors.primaryForeground }]}>
            {wird.isComplete
              ? "أتممت وردك اليوم، بارك الله فيك."
              : `بقي ${wird.remaining} من وردك اليوم`}
          </Text>

          <View style={[styles.wirdTrack, { backgroundColor: colors.primarySoft }]}>
            <View
              style={[
                styles.wirdFill,
                {
                  backgroundColor: colors.primaryForeground,
                  width: `${Math.round(wird.progress * 100)}%`,
                },
              ]}
            />
          </View>

          <View style={styles.wirdButtons}>
            <Pressable
              testID="adhkar-wird-resume"
              accessibilityRole="button"
              accessibilityLabel="متابعة الورد"
              disabled={!nextInWird}
              onPress={() => nextInWird && openPractice(nextInWird.order)}
              style={({ pressed }) => [
                styles.wirdButton,
                {
                  backgroundColor: colors.primaryForeground,
                  opacity: !nextInWird ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}>
              <Feather name="play" size={15} color={colors.primary} />
              <Text style={[styles.wirdButtonText, { color: colors.primary }]}>
                {wird.isComplete ? "أتممت الورد" : "متابعة الورد"}
              </Text>
            </Pressable>

            {/* تغيير الهدف هدف يختاره المستخدم، فمَن أراد تعديله لا يُقفل عند أول اختيار. */}
            <Pressable
              testID="adhkar-wird-change"
              accessibilityRole="button"
              accessibilityLabel="تغيير وردك اليومي"
              onPress={() => void clearGoal()}
              style={({ pressed }) => [
                styles.wirdChange,
                { borderColor: colors.primarySoft, opacity: pressed ? 0.7 : 1 },
              ]}>
              <Feather name="edit-2" size={14} color={colors.primaryForeground} />
              <Text style={[styles.wirdChangeText, { color: colors.primaryForeground }]}>
                تغيير الورد
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!wird.hasGoal ? (
        <View style={[styles.goalRow, { borderColor: colors.border }]}>
          <Text style={[styles.goalLabel, { color: colors.mutedForeground }]}>
            حدّد وردك اليومي
          </Text>
          {WIRD_TARGET_OPTIONS.map((target) => (
            <Pressable
              key={target}
              testID={`adhkar-goal-${target}`}
              accessibilityRole="button"
              accessibilityLabel={`هدف ${target} أذكار`}
              onPress={() => void setGoal(target)}
              style={({ pressed }) => [
                styles.goalChip,
                { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
              ]}>
              <Text style={[styles.goalChipText, { color: colors.primary }]}>{target}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* التصنيفات: ثلاثة فقط، كلّها من حقل type الموجود فعلًا في المصدر. */}
      <View style={styles.filters}>
        {ADHKAR_CATEGORIES.map((item) => (
          <Pressable
            key={item.key}
            testID={`adhkar-filter-${item.key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: category === item.key }}
            accessibilityLabel={`تصفية ${item.label}`}
            onPress={() => setCategory(item.key)}
            style={[
              styles.filter,
              category === item.key && { backgroundColor: colors.primary },
            ]}>
            <Text
              style={[
                styles.filterText,
                { color: category === item.key ? colors.primaryForeground : colors.mutedForeground },
              ]}>
              {item.label}
            </Text>
          </Pressable>
        ))}

        <Pressable
          testID="adhkar-filter-favorites"
          accessibilityRole="tab"
          accessibilityState={{ selected: onlyFavorites }}
          accessibilityLabel="عرض المفضلة فقط"
          onPress={() => setOnlyFavorites((value) => !value)}
          style={[
            styles.filter,
            onlyFavorites && { backgroundColor: colors.primary },
          ]}>
          <Feather
            name="heart"
            size={13}
            color={onlyFavorites ? colors.primaryForeground : colors.mutedForeground}
          />
          <Text
            style={[
              styles.filterText,
              { color: onlyFavorites ? colors.primaryForeground : colors.mutedForeground },
            ]}>
            مفضّلتي
          </Text>
        </Pressable>
      </View>

      {todayDhikr ? (
        <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>
          {visible.length} من {data?.length ?? 0} ذكرًا
        </Text>
      ) : null}
    </View>
  );

  if (isPending) {
    return (
      <Screen scroll={false} contentStyle={styles.centered}>
        <LoadingState label="جارٍ تحميل الأذكار" />
      </Screen>
    );
  }

  if (isError || !data) {
    return (
      <Screen scroll={false} contentStyle={styles.centered}>
        <ErrorState
          offline={isOfflineError(error)}
          onRetry={() => void refetch()}
          title="تعذّر تحميل الأذكار"
          message={
            isOfflineError(error)
              ? "تحقق من اتصالك بالإنترنت وحاول مرة أخرى."
              : "تعذّر جلب الأذكار من المصدر. حاول بعد قليل."
          }
          actionLabel="إعادة المحاولة"
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.list}>
      <FlatList
        testID="adhkar-list"
        data={visible}
        keyExtractor={(item) => String(item.order)}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <DhikrCard
            dhikr={item}
            counted={counts[item.order] ?? 0}
            favorite={favoriteOrders.has(item.order)}
            onPress={() => openPractice(item.order)}
            onToggleFavorite={() => onToggleFavorite(item.order)}
          />
        )}
        ListEmptyComponent={
          query.trim().length >= 2 ? (
            <EmptyState
              title="لم نجد ذكرًا بهذا النص"
              message="جرّب كلمة أخرى، أو أزل التصفية الحالية."
            />
          ) : onlyFavorites ? (
            <EmptyState
              title="لا توجد أذكار في المفضلة"
              message="اضغط على القلب في أي بطاقة لحفظها هنا."
            />
          ) : (
            <EmptyState title="لا توجد أذكار" message="لم يصل أي ذكر من المصدر." />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1 },
  list: { flex: 1 },
  listContent: { paddingBottom: 48 },
  filters: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginTop: spacing.md,
  },
  filter: {
    alignItems: "center",
    borderRadius: radii.pill,
    flexDirection: "row-reverse",
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  filterText: { fontSize: typography.bodySmall, fontWeight: "700" },
  resultCount: {
    fontSize: typography.caption,
    fontWeight: "600",
    marginTop: spacing.sm,
    textAlign: "right",
  },
  goalRow: {
    alignItems: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row-reverse",
    gap: 8,
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  goalLabel: { flex: 1, fontSize: typography.bodySmall, textAlign: "right" },
  goalChip: { borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 6 },
  goalChipText: { fontSize: typography.caption, fontWeight: "700" },
  wird: {
    borderRadius: radii.lg,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  wirdTop: {
    alignItems: "center",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
  wirdEyebrow: { fontSize: typography.bodySmall, fontWeight: "700" },
  wirdCount: { fontSize: typography.body, fontWeight: "700" },
  wirdTitle: {
    fontSize: typography.bodyLarge,
    fontWeight: "700",
    marginTop: spacing.xs,
    textAlign: "right",
  },
  wirdTrack: {
    borderRadius: radii.pill,
    height: 5,
    marginTop: spacing.md,
    overflow: "hidden",
    width: "100%",
  },
  wirdFill: { borderRadius: radii.pill, height: "100%" },
  wirdButtons: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  wirdButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    flexDirection: "row-reverse",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  wirdChange: {
    alignItems: "center",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row-reverse",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  wirdChangeText: { fontSize: typography.caption, fontWeight: "700" },
  wirdButtonText: { fontSize: typography.bodySmall, fontWeight: "700" },
});