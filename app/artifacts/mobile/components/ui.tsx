import React, { PropsWithChildren } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { radii, spacing, typography } from '@/constants/tokens';
import { useColors } from '@/hooks/useColors';
import { useSettings } from '@/hooks/useAppState';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

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
  const paddingTop = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const paddingBottom = Platform.OS === 'web' ? 34 : Math.max(insets.bottom, spacing.lg);

  const content = (
    <View
      style={[
        styles.screenContent,
        { paddingTop, paddingBottom },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  return scroll ? (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }, style]}
      contentContainerStyle={{ flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {content}
    </ScrollView>
  ) : (
    <View style={[styles.screen, { backgroundColor: colors.background }, style]}>
      {content}
    </View>
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
          <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text>
        ) : null}
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
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
  variant = 'plain',
}: {
  icon: FeatherName;
  onPress: () => void;
  label: string;
  variant?: 'plain' | 'soft' | 'dark';
}) {
  const colors = useColors();
  const backgroundColor =
    variant === 'dark'
      ? colors.primary
      : variant === 'soft'
        ? colors.secondary
        : 'transparent';
  const iconColor = variant === 'dark' ? colors.primaryForeground : colors.primary;
  return (
    <Pressable
      testID={`icon-button-${label}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor, opacity: pressed ? 0.72 : 1 },
      ]}
    >
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
      <Text style={[styles.sectionHeading, { color: colors.foreground }]}>{title}</Text>
      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onAction}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={[styles.sectionAction, { color: colors.primary }]}>{action}</Text>
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
      style={({ pressed }) => [styles.quickAction, { opacity: pressed ? 0.68 : 1 }]}
    >
      <View style={[styles.quickIcon, { backgroundColor: colors.secondary }]}>
        <Feather name={icon} size={19} color={colors.primary} />
      </View>
      <Text style={[styles.quickLabel, { color: colors.foreground }]}>{label}</Text>
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
        { backgroundColor: colors.primary, opacity: pressed ? 0.94 : 1 },
      ]}
    >
      <View style={styles.prayerPattern} />
      <View style={styles.prayerTopline}>
        <View style={styles.locationRow}>
          <Feather name="map-pin" size={13} color={colors.primarySoft} />
          <Text style={[styles.locationText, { color: colors.primarySoft }]}>موقعك الحالي</Text>
        </View>
        <Text style={[styles.prayerEyebrow, { color: colors.primarySoft }]}>الصلاة القادمة</Text>
      </View>
      <View style={styles.prayerMain}>
        <View>
          <Text style={[styles.prayerName, { color: colors.primaryForeground }]}>افتح مواقيت اليوم</Text>
          <Text style={[styles.prayerTime, { color: colors.primaryForeground }]}>—</Text>
        </View>
        <View style={[styles.progressRing, { borderColor: colors.primarySoft }]}>
          <Feather name="clock" size={23} color={colors.primaryForeground} />
        </View>
      </View>
      <View style={styles.prayerBottomline}>
        <Text style={[styles.prayerMeta, { color: colors.primarySoft }]}>استخدم موقع جهازك للحساب الدقيق</Text>
        <Feather name="arrow-up-left" size={17} color={colors.primarySoft} />
      </View>
    </Pressable>
  );
}

export function ReadingCard({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      testID="continue-reading"
      accessibilityRole="button"
      accessibilityLabel="متابعة القراءة في المصحف"
      onPress={onPress}
      style={({ pressed }) => [
        styles.readingCard,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <View style={[styles.readingMark, { backgroundColor: colors.accent }]}>
        <Feather name="book-open" size={19} color={colors.primary} />
      </View>
      <View style={styles.readingCopy}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>متابعة القراءة</Text>
        <Text style={[styles.readingTitle, { color: colors.foreground }]}>افتح المصحف</Text>
        <Text style={[styles.readingMeta, { color: colors.mutedForeground }]}>اختر سورة من المحتوى المتصل</Text>
      </View>
      <Feather name="chevron-left" size={20} color={colors.mutedForeground} />
    </Pressable>
  );
}

export function DailyVerse() {
  const colors = useColors();
  // حجم النص القرآني يتبع fontScale من المتجر المشترك (نفس quran-reader).
  const { settings } = useSettings();
  const verseFontSize = typography.quranMedium * settings.fontScale;
  return (
    <View style={[styles.dailyCard, { backgroundColor: colors.accent }]}>
      <View style={styles.dailyHeader}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>آية اليوم</Text>
        <Feather name="bookmark" size={17} color={colors.primary} />
      </View>
      <Text style={[styles.verse, { color: colors.foreground, fontSize: verseFontSize, lineHeight: Math.round(verseFontSize * 1.8) }]}>
        افتح المصحف لقراءة آيات القرآن الكريم
      </Text>
      <Text style={[styles.verseSource, { color: colors.mutedForeground }]}>
        النص الكامل متاح من مصدر القرآن المباشر
      </Text>
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
    <View style={[styles.searchBar, { backgroundColor: colors.secondary }]}>
      <Feather name="search" size={18} color={colors.mutedForeground} />
      <TextInput
        testID="search-input"
        accessibilityRole="search"
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        onChangeText={onChangeText}
        value={value}
        style={[styles.searchInput, { color: colors.foreground }]}
      >
      </TextInput>
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  const colors = useColors();
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
        <Feather name="inbox" size={24} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyMessage, { color: colors.mutedForeground }]}>{message}</Text>
    </View>
  );
}

export function isOfflineError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /network|offline|fetch|internet|connection|timeout/i.test(message);
}

export function ErrorState({
  offline = false,
  onRetry,
}: {
  offline?: boolean;
  onRetry?: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
        <Feather name={offline ? 'wifi-off' : 'alert-circle'} size={24} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        {offline ? 'لا يوجد اتصال' : 'تعذر تحميل المحتوى'}
      </Text>
      <Text style={[styles.emptyMessage, { color: colors.mutedForeground }]}>
        {offline
          ? 'تحقق من اتصالك بالإنترنت وحاول مرة أخرى.'
          : 'حدثت مشكلة مؤقتة. حاول تحديث المحتوى.'}
      </Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="إعادة المحاولة"
          onPress={onRetry}
          style={({ pressed }) => [
            styles.retryButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Text style={[styles.retryText, { color: colors.primaryForeground }]}>إعادة المحاولة</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function LoadingState() {
  const colors = useColors();
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>جارٍ التحميل</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerCopy: { alignItems: 'flex-end', flex: 1 },
  eyebrow: {
    fontSize: typography.bodySmall,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'right',
  },
  headerTitle: {
    fontSize: typography.h1,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'right',
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  sectionTitle: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  sectionHeading: { fontSize: typography.h3, fontWeight: '700', textAlign: 'right' },
  sectionAction: { fontSize: typography.bodySmall, fontWeight: '600' },
  quickAction: { alignItems: 'center', gap: 7, minWidth: 60 },
  quickIcon: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  quickLabel: { fontSize: typography.caption, fontWeight: '600', textAlign: 'center' },
  prayerCard: {
    borderRadius: radii.lg,
    minHeight: 202,
    overflow: 'hidden',
    padding: spacing.lg,
  },
  prayerPattern: {
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 180,
    borderWidth: 1,
    height: 210,
    position: 'absolute',
    right: -78,
    top: -84,
    width: 210,
  },
  prayerTopline: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  locationRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  locationText: { fontSize: typography.caption, textAlign: 'left' },
  prayerEyebrow: { fontSize: typography.bodySmall, textAlign: 'right' },
  prayerMain: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  prayerName: { fontSize: typography.h2, fontWeight: '600', textAlign: 'right' },
  prayerTime: { fontSize: 42, fontWeight: '300', letterSpacing: -1.2, marginTop: 3 },
  progressRing: {
    alignItems: 'center',
    borderRadius: 100,
    borderWidth: 2,
    height: 86,
    justifyContent: 'center',
    width: 86,
  },
  countdownSmall: { fontSize: typography.caption },
  countdown: { fontSize: typography.h3, fontWeight: '700', marginTop: 2 },
  prayerBottomline: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  prayerMeta: { fontSize: typography.caption, textAlign: 'right' },
  readingCard: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    padding: spacing.md,
  },
  readingMark: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  readingCopy: { flex: 1, alignItems: 'flex-end' },
  readingTitle: { fontSize: typography.bodyLarge, fontWeight: '700', marginTop: 2 },
  readingMeta: { fontSize: typography.bodySmall, marginTop: 2 },
  progressTrack: { borderRadius: radii.pill, height: 4, marginTop: 9, overflow: 'hidden', width: '100%' },
  progressFill: { borderRadius: radii.pill, height: '100%' },
  dailyCard: { borderRadius: radii.md, padding: spacing.md },
  dailyHeader: { alignItems: 'center', flexDirection: 'row-reverse', justifyContent: 'space-between' },
  verse: { lineHeight: 40, marginTop: spacing.md, textAlign: 'right' },
  verseSource: { fontSize: typography.bodySmall, marginTop: spacing.sm, textAlign: 'right' },
  searchBar: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, fontSize: typography.body, textAlign: 'right' },
  emptyState: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xxl },
  emptyIcon: { alignItems: 'center', borderRadius: radii.pill, height: 60, justifyContent: 'center', width: 60 },
  emptyTitle: { fontSize: typography.h3, fontWeight: '700', marginTop: spacing.md },
  emptyMessage: { fontSize: typography.bodySmall, marginTop: spacing.xs, textAlign: 'center' },
  retryButton: { borderRadius: radii.pill, marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 11 },
  retryText: { fontSize: typography.bodySmall, fontWeight: '700' },
  loadingState: { alignItems: 'center', gap: spacing.sm, padding: spacing.xxl },
  loadingText: { fontSize: typography.bodySmall },
});