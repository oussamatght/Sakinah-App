import React, { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { radii, spacing, typography } from "@/constants/tokens";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/hooks/useAppState";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

const PRESS_OPACITY = 0.72;

export function Screen({
  children,
  scroll = true,
  style,
  contentStyle,
}: PropsWithChildren<{
  scroll?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}>) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const paddingTop =
    Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const paddingBottom =
    Platform.OS === "web" ? 34 : Math.max(insets.bottom, spacing.lg);

  const content = (
    <View
      style={[
        styles.screenContent,
        { paddingTop, paddingBottom },
        contentStyle,
      ]}>
      {children}
    </View>
  );

  if (!scroll) {
    return (
      <View
        style={[styles.screen, { backgroundColor: colors.background }, style]}>
        {content}
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }, style]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
      {content}
    </ScrollView>
  );
}

export function AppHeader({
  eyebrow,
  title,
  action,
  onAction,
  actionLabel,
}: {
  eyebrow?: string;
  title: string;
  action?: FeatherName;
  onAction?: () => void;
  actionLabel?: string;
}) {
  const colors = useColors();

  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        {eyebrow ? (
          <Text style={[styles.eyebrow, { color: colors.primary }]}>
            {eyebrow}
          </Text>
        ) : null}

        <Text
          numberOfLines={2}
          style={[styles.headerTitle, { color: colors.foreground }]}>
          {title}
        </Text>
      </View>

      {action && onAction ? (
        <IconButton
          icon={action}
          onPress={onAction}
          label={actionLabel ?? title}
          variant="soft"
        />
      ) : null}
    </View>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  variant = "plain",
}: {
  icon: FeatherName;
  onPress: () => void;
  label: string;
  variant?: "plain" | "soft" | "dark";
}) {
  const colors = useColors();

  const backgroundColor =
    variant === "dark"
      ? colors.primary
      : variant === "soft"
        ? colors.secondary
        : "transparent";

  const iconColor =
    variant === "dark" ? colors.primaryForeground : colors.primary;

  return (
    <Pressable
      testID={`icon-button-${label}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor, opacity: pressed ? PRESS_OPACITY : 1 },
      ]}>
      <Feather name={icon} size={19} color={iconColor} />
    </Pressable>
  );
}

export function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const colors = useColors();

  return (
    <View style={styles.sectionTitle}>
      <Text style={[styles.sectionHeading, { color: colors.foreground }]}>
        {title}
      </Text>

      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          hitSlop={8}
          onPress={onAction}
          style={({ pressed }) => ({
            opacity: pressed ? 0.6 : 1,
            paddingVertical: 4,
            paddingHorizontal: 2,
          })}>
          <Text style={[styles.sectionAction, { color: colors.primary }]}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: FeatherName;
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();

  return (
    <Pressable
      testID={`quick-action-${label}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        { opacity: pressed ? PRESS_OPACITY : 1 },
      ]}>
      <View
        style={[
          styles.quickIcon,
          {
            backgroundColor: colors.secondary,
            borderColor: colors.border,
          },
        ]}>
        <Feather name={icon} size={19} color={colors.primary} />
      </View>

      <Text
        numberOfLines={2}
        style={[styles.quickLabel, { color: colors.foreground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function PrayerCard({ onPress }: { onPress: () => void }) {
  const colors = useColors();

  return (
    <Pressable
      testID="prayer-card"
      accessibilityRole="button"
      accessibilityLabel="فتح مواقيت الصلاة"
      onPress={onPress}
      style={({ pressed }) => [
        styles.prayerCard,
        {
          backgroundColor: colors.primary,
          opacity: pressed ? 0.95 : 1,
        },
      ]}>
      <View pointerEvents="none" style={styles.prayerPattern} />
      <View pointerEvents="none" style={styles.prayerGlow} />

      <View style={styles.prayerTopline}>
        <View style={styles.locationRow}>
          <Feather name="map-pin" size={13} color={colors.primarySoft} />
          <Text
            numberOfLines={1}
            style={[styles.locationText, { color: colors.primarySoft }]}>
            موقعك الحالي
          </Text>
        </View>

        <View style={styles.prayerLabel}>
          <View
            style={[styles.liveDot, { backgroundColor: colors.primarySoft }]}
          />
          <Text style={[styles.prayerEyebrow, { color: colors.primarySoft }]}>
            مواقيت الصلاة
          </Text>
        </View>
      </View>

      <View style={styles.prayerMain}>
        <View style={styles.prayerCopy}>
          <Text
            style={[styles.prayerName, { color: colors.primaryForeground }]}>
            افتح مواقيت اليوم
          </Text>
          <Text
            style={[styles.prayerTime, { color: colors.primaryForeground }]}>
            —
          </Text>
        </View>

        <View
          style={[styles.progressRing, { borderColor: colors.primarySoft }]}>
          <Feather name="clock" size={23} color={colors.primaryForeground} />
        </View>
      </View>

      <View style={styles.prayerBottomline}>
        <Text
          numberOfLines={2}
          style={[styles.prayerMeta, { color: colors.primarySoft }]}>
          استخدم موقع جهازك للحساب الدقيق
        </Text>

        <View
          style={[styles.cardArrow, { backgroundColor: colors.primarySoft }]}>
          <Feather name="arrow-up-left" size={15} color={colors.primary} />
        </View>
      </View>
    </Pressable>
  );
}

export function ReadingCard({
  onPress,
  progress,
  pageLabel,
}: {
  onPress: () => void;
  progress?: number;
  pageLabel?: string;
}) {
  const colors = useColors();
  const hasProgress =
    typeof progress === "number" && Number.isFinite(progress) && progress > 0;

  const safeProgress = hasProgress
    ? Math.min(Math.max(progress as number, 0), 1)
    : 0;

  return (
    <Pressable
      testID="continue-reading"
      accessibilityRole="button"
      accessibilityLabel="متابعة القراءة في المصحف"
      onPress={onPress}
      style={({ pressed }) => [
        styles.readingCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.84 : 1,
        },
      ]}>
      <View style={[styles.readingMark, { backgroundColor: colors.accent }]}>
        <Feather name="book-open" size={19} color={colors.primary} />
      </View>

      <View style={styles.readingCopy}>
        <View style={styles.readingEyebrowRow}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>
            متابعة القراءة
          </Text>

          {pageLabel ? (
            <Text
              style={[styles.readingPage, { color: colors.mutedForeground }]}>
              {pageLabel}
            </Text>
          ) : null}
        </View>

        <Text style={[styles.readingTitle, { color: colors.foreground }]}>
          افتح المصحف
        </Text>

        <Text
          numberOfLines={1}
          style={[styles.readingMeta, { color: colors.mutedForeground }]}>
          {hasProgress
            ? `${Math.round(safeProgress * 100)}٪ من القراءة`
            : "اختر سورة وابدأ القراءة"}
        </Text>

        {hasProgress ? (
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: colors.secondary },
            ]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(safeProgress * 100)}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
        ) : null}
      </View>

      <Feather name="chevron-left" size={20} color={colors.mutedForeground} />
    </Pressable>
  );
}

export function DailyVerse() {
  const colors = useColors();
  const { settings } = useSettings();

  const verseFontSize = typography.quranMedium * settings.fontScale;

  return (
    <View
      style={[
        styles.dailyCard,
        {
          backgroundColor: colors.accent,
          borderColor: colors.border,
        },
      ]}>
      <View style={styles.dailyHeader}>
        <View style={styles.dailyTitleRow}>
          <View
            style={[styles.dailyIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="book-open" size={15} color={colors.primary} />
          </View>

          <View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>
              آية اليوم
            </Text>
            <Text style={[styles.dailyHint, { color: colors.mutedForeground }]}>
              تدبر وقراءة
            </Text>
          </View>
        </View>

        <IconButton
          icon="bookmark"
          label="حفظ الآية"
          onPress={() => undefined}
          variant="soft"
        />
      </View>

      <Text
        style={[
          styles.verse,
          {
            color: colors.foreground,
            fontSize: verseFontSize,
            lineHeight: Math.round(verseFontSize * 1.85),
          },
        ]}>
        افتح المصحف لقراءة آيات القرآن الكريم
      </Text>

      <View style={styles.verseFooter}>
        <Text style={[styles.verseSource, { color: colors.mutedForeground }]}>
          النص الكامل متاح من مصدر القرآن المباشر
        </Text>

        <Feather name="arrow-left" size={15} color={colors.mutedForeground} />
      </View>
    </View>
  );
}

export function SearchBar({
  placeholder,
  value,
  onChangeText,
}: {
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.searchBar,
        {
          backgroundColor: colors.secondary,
          borderColor: colors.border,
        },
      ]}>
      <Feather name="search" size={18} color={colors.mutedForeground} />

      <TextInput
        testID="search-input"
        accessibilityRole="search"
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        onChangeText={onChangeText}
        value={value}
        returnKeyType="search"
        clearButtonMode={Platform.OS === "ios" ? "while-editing" : "never"}
        style={[styles.searchInput, { color: colors.foreground }]}
      />
    </View>
  );
}

/**
 * Shared status component.
 * Keeps EmptyState and ErrorState visually consistent without duplicating UI.
 */
export function StatusState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  compact = false,
}: {
  icon: FeatherName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  const colors = useColors();

  return (
    <View style={[styles.statusState, compact && styles.statusStateCompact]}>
      <View style={[styles.statusIcon, { backgroundColor: colors.secondary }]}>
        <Feather name={icon} size={24} color={colors.primary} />
      </View>

      <Text style={[styles.statusTitle, { color: colors.foreground }]}>
        {title}
      </Text>

      <Text style={[styles.statusMessage, { color: colors.mutedForeground }]}>
        {message}
      </Text>

      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={({ pressed }) => [
            styles.statusButton,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? PRESS_OPACITY : 1,
            },
          ]}>
          <Text
            style={[
              styles.statusButtonText,
              { color: colors.primaryForeground },
            ]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return <StatusState icon="inbox" title={title} message={message} />;
}

export function isOfflineError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");

  return /network|offline|fetch|internet|connection|timeout/i.test(message);
}

export function ErrorState({
  offline = false,
  onRetry,
}: {
  offline?: boolean;
  onRetry?: () => void;
}) {
  return (
    <StatusState
      icon={offline ? "wifi-off" : "alert-circle"}
      title={offline ? "لا يوجد اتصال" : "تعذر تحميل المحتوى"}
      message={
        offline
          ? "تحقق من اتصالك بالإنترنت وحاول مرة أخرى."
          : "حدثت مشكلة مؤقتة. حاول تحديث المحتوى."
      }
      actionLabel={onRetry ? "إعادة المحاولة" : undefined}
      onAction={onRetry}
    />
  );
}

export function LoadingState({ label = "جارٍ التحميل" }: { label?: string }) {
  const colors = useColors();

  return (
    <View style={styles.loadingState}>
      <View style={[styles.loadingIcon, { backgroundColor: colors.secondary }]}>
        <ActivityIndicator color={colors.primary} />
      </View>

      <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
  },

  screenContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },

  header: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },

  headerCopy: {
    alignItems: "flex-end",
    flex: 1,
  },

  eyebrow: {
    fontSize: typography.bodySmall,
    fontWeight: "600",
    letterSpacing: 0.2,
    textAlign: "right",
  },

  headerTitle: {
    fontSize: typography.h1,
    fontWeight: "700",
    marginTop: 4,
    textAlign: "right",
  },

  iconButton: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: 42,
    justifyContent: "center",
    width: 42,
  },

  sectionTitle: {
    alignItems: "center",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },

  sectionHeading: {
    fontSize: typography.h3,
    fontWeight: "700",
    textAlign: "right",
  },

  sectionAction: {
    fontSize: typography.bodySmall,
    fontWeight: "600",
  },

  quickAction: {
    alignItems: "center",
    gap: 7,
    minWidth: 64,
  },

  quickIcon: {
    alignItems: "center",
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48,
  },

  quickLabel: {
    fontSize: typography.caption,
    fontWeight: "600",
    maxWidth: 76,
    textAlign: "center",
  },

  prayerCard: {
    borderRadius: radii.lg,
    minHeight: 202,
    overflow: "hidden",
    padding: spacing.lg,
  },

  prayerPattern: {
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 180,
    borderWidth: 1,
    height: 230,
    position: "absolute",
    right: -92,
    top: -94,
    width: 230,
  },

  prayerGlow: {
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 140,
    borderWidth: 1,
    height: 160,
    position: "absolute",
    left: -95,
    bottom: -105,
    width: 160,
  },

  prayerTopline: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },

  locationRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    maxWidth: "55%",
  },

  locationText: {
    fontSize: typography.caption,
    textAlign: "left",
  },

  prayerLabel: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: 6,
  },

  liveDot: {
    borderRadius: radii.pill,
    height: 6,
    width: 6,
  },

  prayerEyebrow: {
    fontSize: typography.bodySmall,
    textAlign: "right",
  },

  prayerMain: {
    alignItems: "center",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginTop: spacing.lg,
  },

  prayerCopy: {
    alignItems: "flex-end",
    flex: 1,
  },

  prayerName: {
    fontSize: typography.h2,
    fontWeight: "600",
    textAlign: "right",
  },

  prayerTime: {
    fontSize: 42,
    fontWeight: "300",
    letterSpacing: -1.2,
    marginTop: 3,
  },

  progressRing: {
    alignItems: "center",
    borderRadius: 100,
    borderWidth: 2,
    height: 86,
    justifyContent: "center",
    marginStart: spacing.md,
    width: 86,
  },

  prayerBottomline: {
    alignItems: "center",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },

  prayerMeta: {
    flex: 1,
    fontSize: typography.caption,
    marginEnd: spacing.sm,
    textAlign: "right",
  },

  cardArrow: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: 30,
    justifyContent: "center",
    opacity: 0.9,
    width: 30,
  },

  readingCard: {
    alignItems: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    padding: spacing.md,
  },

  readingMark: {
    alignItems: "center",
    borderRadius: radii.sm,
    height: 46,
    justifyContent: "center",
    width: 46,
  },

  readingCopy: {
    alignItems: "flex-end",
    flex: 1,
  },

  readingEyebrowRow: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
    width: "100%",
  },

  readingPage: {
    flexShrink: 1,
    fontSize: typography.caption,
  },

  readingTitle: {
    fontSize: typography.bodyLarge,
    fontWeight: "700",
    marginTop: 2,
  },

  readingMeta: {
    fontSize: typography.bodySmall,
    marginTop: 2,
  },

  progressTrack: {
    borderRadius: radii.pill,
    height: 4,
    marginTop: 9,
    overflow: "hidden",
    width: "100%",
  },

  progressFill: {
    borderRadius: radii.pill,
    height: "100%",
  },

  dailyCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
  },

  dailyHeader: {
    alignItems: "center",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },

  dailyTitleRow: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },

  dailyIcon: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: 34,
    justifyContent: "center",
    width: 34,
  },

  dailyHint: {
    fontSize: typography.caption,
    marginTop: 1,
    textAlign: "right",
  },

  verse: {
    fontWeight: "500",
    marginTop: spacing.md,
    textAlign: "right",
  },

  verseFooter: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },

  verseSource: {
    flex: 1,
    fontSize: typography.bodySmall,
    textAlign: "right",
  },

  searchBar: {
    alignItems: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },

  searchInput: {
    flex: 1,
    fontSize: typography.body,
    minHeight: 48,
    paddingVertical: 0,
    textAlign: "right",
  },

  statusState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: spacing.xxl,
  },

  statusStateCompact: {
    padding: spacing.lg,
  },

  statusIcon: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: 60,
    justifyContent: "center",
    width: 60,
  },

  statusTitle: {
    fontSize: typography.h3,
    fontWeight: "700",
    marginTop: spacing.md,
    textAlign: "center",
  },

  statusMessage: {
    fontSize: typography.bodySmall,
    lineHeight: 21,
    marginTop: spacing.xs,
    maxWidth: 320,
    textAlign: "center",
  },

  statusButton: {
    borderRadius: radii.pill,
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },

  statusButtonText: {
    fontSize: typography.bodySmall,
    fontWeight: "700",
  },

  loadingState: {
    alignItems: "center",
    gap: spacing.sm,
    justifyContent: "center",
    padding: spacing.xxl,
  },

  loadingIcon: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: 48,
    justifyContent: "center",
    width: 48,
  },

  loadingText: {
    fontSize: typography.bodySmall,
  },
});
