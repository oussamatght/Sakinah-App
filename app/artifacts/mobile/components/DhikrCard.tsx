import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { radii, spacing, typography } from "@/constants/tokens";
import { useColors } from "@/hooks/useColors";
import { categoryLabel } from "@/hooks/useAdhkar";
import type { Dhikr } from "@/lib/api/types";
import { useSettings } from "@/hooks/useAppState";

/**
 * بطاقة ذكر في قائمة الأذكار.
 *
 * تعرض ما في المصدر فقط: النصّ، والتكرار الحقيقي (count_description)،
 * والفضل إن كان موجودًا (فارغ في 15 من 34 فلا يظهر)، وشارة التصنيف
 * المشتقّة من `type`. ولا تُظهر تخريجًا ولا درجة ولا إسنادًا مخترعًا.
 */

const CONTENT_LINES = 4;

export function DhikrCard({
  dhikr,
  counted = 0,
  favorite = false,
  onPress,
  onToggleFavorite,
}: {
  dhikr: Dhikr;
  /** كم مرّة قيل اليوم (0 = لم يبدأ). */
  counted?: number;
  favorite?: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  const colors = useColors();
  const { settings } = useSettings();
  const contentSize = typography.bodyLarge * settings.fontScale;
  const target = dhikr.count;
  const progress = target > 0 ? Math.min(counted / target, 1) : 0;
  const started = counted > 0;
  const done = started && counted >= target;

  /**
   * البنية عمدًا: View خارجي + زرّان شقيقان (الجسم والقلب)، لا زرّ داخل زرّ.
   * كان Card كلّه Pressable وفيه Pressender القلب، فيخرج HTML غير صالح
   * (<button> داخل <button>) ويطلق خطأ hydration على الويب.
   */
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: done ? colors.primarySoft : colors.border,
        },
      ]}>
      <View style={styles.topRow}>
        <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.badgeText, { color: colors.primary }]}>
            {categoryLabel(dhikr)}
          </Text>
        </View>

        <Pressable
          testID={`dhikr-favorite-${dhikr.order}`}
          accessibilityRole="button"
          accessibilityLabel={
            favorite
              ? `إزالة ذكر ${dhikr.order} من المفضلة`
              : `حفظ ذكر ${dhikr.order} في المفضلة`
          }
          hitSlop={10}
          onPress={onToggleFavorite}
          style={({ pressed }) => [styles.favorite, { opacity: pressed ? 0.6 : 1 }]}>
          <Feather
            name="heart"
            size={17}
            color={favorite ? colors.destructive : colors.mutedForeground}
          />
        </Pressable>
      </View>

      <Pressable
        testID={`dhikr-card-${dhikr.order}`}
        accessibilityRole="button"
        accessibilityLabel={`فتح ذكر ${dhikr.order}`}
        accessibilityHint={`التكرار: ${dhikr.count_description}`}
        onPress={onPress}
        style={({ pressed }) => [styles.body, { opacity: pressed ? 0.7 : 1 }]}>
        <Text
          numberOfLines={CONTENT_LINES}
          style={[
            styles.content,
            { color: colors.foreground, fontSize: contentSize, lineHeight: Math.round(contentSize * 1.9) },
          ]}>
          {dhikr.content}
        </Text>

        {dhikr.fadl ? (
          <Text numberOfLines={2} style={[styles.fadl, { color: colors.mutedForeground }]}>
            {dhikr.fadl}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <View style={[styles.count, { backgroundColor: colors.accent }]}>
            <Text style={[styles.countText, { color: colors.accentForeground }]}>
              {dhikr.count_description}
            </Text>
          </View>

          {started ? (
            <Text style={[styles.progress, { color: done ? colors.primary : colors.mutedForeground }]}>
              {done ? "أتممت الذكر" : `${counted} من ${target}`}
            </Text>
          ) : null}

          <Feather name="chevron-left" size={18} color={colors.mutedForeground} />
        </View>

        {started ? (
          <View style={[styles.track, { backgroundColor: colors.secondary }]}>
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: colors.primary,
                  width: `${Math.round(progress * 100)}%`,
                },
              ]}
            />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  topRow: {
    alignItems: "center",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: typography.caption, fontWeight: "700" },
  favorite: { padding: 4 },
  /** الجسم القابل للضغط (شقيق زر القلب، لاابن داخله). */
  body: { marginTop: spacing.xs },
  content: {
    fontWeight: "500",
    textAlign: "right",
  },
  fadl: {
    fontSize: typography.bodySmall,
    lineHeight: 20,
    marginTop: spacing.sm,
    textAlign: "right",
  },
  footer: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  count: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  countText: { fontSize: typography.caption, fontWeight: "700" },
  progress: { flex: 1, fontSize: typography.caption, fontWeight: "600", textAlign: "right" },
  track: {
    borderRadius: radii.pill,
    height: 4,
    marginTop: spacing.sm,
    overflow: "hidden",
    width: "100%",
  },
  fill: { borderRadius: radii.pill, height: "100%" },
});