import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Screen, IconButton, SectionTitle, ErrorState } from '@/components/ui';
import { radii, spacing, typography } from '@/constants/tokens';
import { useColors } from '@/hooks/useColors';
import { useSettings } from '@/hooks/useAppState';
import { setThemePreference } from '@/hooks/useTheme';
import { FONT_SCALES, RECITERS, getPrayerTimesCache, type ThemePreference } from '@/lib/storage';
import {
  cancelAdhanNotifications,
  isExpoGo,
  playAdhanTestNotification,
  scheduleAdhanNotifications,
} from '@/lib/notifications/adhan';

// ⚠️ لا استيراد ساكن لexpo-notifications هنا — يرمي خطأ داخل Expo Go (SDK 53+)
// ويسقط الملف كله (سبب تحذير "missing the required default export").
// التحميل الكسول داخل try/catch فقط:
function getNotifications(): typeof import('expo-notifications') | null {
  try {
    return require('expo-notifications');
  } catch {
    return null;
  }
}

const THEME_OPTIONS: Array<{ key: ThemePreference; label: string }> = [
  { key: 'light', label: 'فاتح' },
  { key: 'dark', label: 'داكن' },
  { key: 'system', label: 'تلقائي' },
];

const FONT_LABELS: Record<number, string> = {
  0.85: 'صغير',
  1: 'متوسط',
  1.25: 'كبير',
  1.5: 'أكبر',
};

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { settings, ready, save } = useSettings();
  const [notifError, setNotifError] = useState<string | null>(null);

  // Ask for notification permission when the toggle is first enabled, and
  // reschedule (or cancel) the adhan notifications to match the switch.
  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    // Expo Go: الإشعارات غير مدعومة إطلاقًا — نعرض تنبيهًا ونخرج دون أي نداء.
    if (isExpoGo()) {
      if (settings.prayerNotifications) {
        setNotifError('الإشعارات غير مدعومة في Expo Go — استعمل development build.');
      }
      return;
    }
    const Notifications = getNotifications();
    if (!Notifications) return;
    void (async () => {
      try {
        if (settings.prayerNotifications) {
          const existing = await Notifications.getPermissionsAsync();
          if (!existing.granted && existing.canAskAgain) {
            const result = await Notifications.requestPermissionsAsync();
            if (!result.granted) {
              setNotifError('لم يُمنح إذن الإشعارات — فعّله من إعدادات الجهاز.');
              await save({ prayerNotifications: false });
              return;
            }
          }
          // جدولة يومية: مواقيت اليوم من آخر كاش محفوظ (إن وجد) — والجدولة
          // تعاد عند كل فتح للتطبيق لأن المواقيت تتغير يوميًا.
          const cached = await getPrayerTimesCache();
          if (cached) {
            const result = await scheduleAdhanNotifications({
              date: cached.date,
              hijriDate: cached.hijriDate,
              timezone: '—',
              location: cached.location,
              timings: cached.timings,
            });
            if (result.scheduled === 0 && result.reason) setNotifError(result.reason);
            else setNotifError(null);
          }
        } else {
          await cancelAdhanNotifications();
        }
      } catch {
        // أي فشل إشعارات لا يعطل شاشة الإعدادات.
      }
    })();
  }, [ready, settings.prayerNotifications, save]);

  const [testHint, setTestHint] = useState<string | null>(null);
  const handleTestAdhan = async () => {
    const ok = await playAdhanTestNotification();
    setTestHint(
      ok
        ? 'سيظهر إشعار التجربة بعد ثانيتين — تأكد من سماع الأذان.'
        : 'التجربة تتطلب development build (غير مدعومة في Expo Go).',
    );
  };

  if (!ready) {
    return (
      <Screen>
        <View style={styles.header}>
          <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
          <Text style={[styles.title, { color: colors.foreground }]}>الإعدادات</Text>
        </View>
      </Screen>
    );
  }

  const handleTheme = async (theme: ThemePreference) => {
    await save({ theme });
    await setThemePreference(theme);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
        <Text style={[styles.title, { color: colors.foreground }]}>الإعدادات</Text>
      </View>

      <SectionTitle title="المظهر" />
      <View style={[styles.themeRow, { borderColor: colors.border }]}>
        {THEME_OPTIONS.map(({ key, label }) => (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ selected: settings.theme === key }}
            onPress={() => void handleTheme(key)}
            style={[styles.themeOption, settings.theme === key && { backgroundColor: colors.primary }]}
          >
            <Text
              style={[
                styles.themeText,
                { color: settings.theme === key ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle title="القراءة" />
      <View style={[styles.settingsGroup, { borderColor: colors.border }]}>
        <View style={[styles.row, { borderBottomColor: colors.border }]}>
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>حجم خط المصحف</Text>
            <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
              {FONT_LABELS[settings.fontScale] ?? 'متوسط'}
            </Text>
          </View>
          <View style={styles.fontButtons}>
            {FONT_SCALES.map((scale) => (
              <Pressable
                key={scale}
                accessibilityRole="radio"
                accessibilityState={{ selected: settings.fontScale === scale }}
                onPress={() => void save({ fontScale: scale })}
                style={[
                  styles.fontButton,
                  { backgroundColor: colors.secondary },
                  settings.fontScale === scale && { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={{
                    color: settings.fontScale === scale ? colors.primaryForeground : colors.primary,
                    fontSize: 13 * scale,
                    fontWeight: '700',
                  }}
                >
                  أ
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>الورد اليومي</Text>
            <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>حدد هدفك وتابع تقدمك</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="فتح إعدادات الورد"
            onPress={() => router.push('/wird-settings')}
            style={[styles.linkButton, { backgroundColor: colors.secondary }]}
          >
            <Feather name="target" size={16} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <SectionTitle title="الصوت والإشعارات" />
      <View style={[styles.settingsGroup, { borderColor: colors.border }]}>
        <View style={[styles.row, { borderBottomColor: colors.border, flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm, paddingVertical: spacing.md }]}>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>القارئ الافتراضي</Text>
              <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
                {RECITERS.find((reciter) => reciter.id === settings.reciterId)?.nameAr ?? '—'}
              </Text>
            </View>
          </View>
          <View style={styles.reciterChips}>
            {RECITERS.map((reciter) => (
              <Pressable
                key={reciter.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: settings.reciterId === reciter.id }}
                accessibilityLabel={`اختيار ${reciter.nameAr}`}
                onPress={() => void save({ reciterId: reciter.id })}
                style={[
                  styles.reciterChip,
                  { backgroundColor: colors.secondary },
                  settings.reciterId === reciter.id && { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: settings.reciterId === reciter.id ? colors.primaryForeground : colors.primary,
                    fontSize: 11,
                    fontWeight: '700',
                  }}
                >
                  {reciter.nameAr}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>تنبيهات الصلاة</Text>
            <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
              {notifError ?? 'أذان عند دخول وقت كل صلاة'}
            </Text>
          </View>
          <Switch
            value={settings.prayerNotifications}
            onValueChange={(value) => void save({ prayerNotifications: value })}
            trackColor={{ false: colors.muted, true: colors.primarySoft }}
            thumbColor={colors.card}
          />
        </View>
        {settings.prayerNotifications ? (
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>تجربة صوت الأذان</Text>
              <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
                {testHint ?? 'إشعار فوري للتأكد من عمل الصوت'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="تشغيل تجربة صوت الأذان"
              onPress={() => void handleTestAdhan()}
              style={({ pressed }) => [
                styles.linkButton,
                { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="volume-2" size={16} color={colors.primary} />
            </Pressable>
          </View>
        ) : null}
      </View>

      {notifError ? <ErrorState /> : null}

      <Text style={[styles.privacy, { color: colors.mutedForeground }]}>
        بياناتك ووردك محفوظة على جهازك فقط.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: spacing.lg },
  title: { flex: 1, fontSize: typography.h1, fontWeight: '700', textAlign: 'right' },
  themeRow: { borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row-reverse', padding: 4 },
  themeOption: { alignItems: 'center', borderRadius: 9, flex: 1, paddingVertical: 10 },
  themeText: { fontSize: typography.bodySmall, fontWeight: '600' },
  settingsGroup: { borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' },
  row: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row-reverse', justifyContent: 'space-between', minHeight: 66, paddingHorizontal: spacing.md },
  rowCopy: { alignItems: 'flex-end', flex: 1 },
  rowTitle: { fontSize: typography.body, fontWeight: '600' },
  rowMeta: { fontSize: typography.caption, marginTop: 3 },
  fontButtons: { flexDirection: 'row-reverse', gap: 6 },
  fontButton: { alignItems: 'center', borderRadius: 8, height: 34, justifyContent: 'center', width: 34 },
  linkButton: { alignItems: 'center', borderRadius: radii.sm, height: 36, justifyContent: 'center', width: 36 },
  reciterChips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  reciterChip: { borderRadius: 999, maxWidth: '48%', paddingHorizontal: 10, paddingVertical: 7 },
  privacy: { fontSize: typography.caption, marginTop: spacing.xl, textAlign: 'center' },
});
