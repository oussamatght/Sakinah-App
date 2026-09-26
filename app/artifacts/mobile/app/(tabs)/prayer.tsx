import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { useGetPrayerTimes } from '@/lib/api';
import { AppHeader, ErrorState, isOfflineError, LoadingState, Screen } from '@/components/ui';
import { radii, spacing, typography } from '@/constants/tokens';
import { useColors } from '@/hooks/useColors';

const prayerRows = [
  ['الفجر', 'Fajr'],
  ['الشروق', 'Sunrise'],
  ['الظهر', 'Dhuhr'],
  ['العصر', 'Asr'],
  ['المغرب', 'Maghrib'],
  ['العشاء', 'Isha'],
] as const;

function todayForApi() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
}

function minutesFromTime(value: string | undefined) {
  if (!value) return Number.POSITIVE_INFINITY;
  const [hours, minutes] = value.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : Number.POSITIVE_INFINITY;
}

/** تبويب الصلاة — مواقيت اليوم + الصلاة القادمة (نفس تدفق شاشة /prayer). */
export default function PrayerTab() {
  const colors = useColors();
  const router = useRouter();
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!active) return;
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setLocationError(true);
        return;
      }
      try {
        const position = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('location-timeout')), 12_000),
          ),
        ]);
        if (active) {
          setCoordinates({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        }
      } catch {
        if (active) setLocationError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const prayerParams = useMemo(
    () => ({
      latitude: coordinates?.latitude ?? 0,
      longitude: coordinates?.longitude ?? 0,
      date: todayForApi(),
    }),
    [coordinates],
  );
  const prayerQuery = useGetPrayerTimes(prayerParams, {
    query: { enabled: Boolean(coordinates) },
  });

  const nextPrayer = useMemo(() => {
    const timings = prayerQuery.data?.timings ?? {};
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const upcoming = prayerRows
      .map(([name, key]) => ({ name, time: timings[key] }))
      .find(({ time }) => minutesFromTime(time) > currentMinutes);
    if (upcoming) return upcoming;
    return (
      prayerRows
        .map(([name, key]) => ({ name, time: timings[key] }))
        .find(({ time }) => Boolean(time)) ?? null
    );
  }, [prayerQuery.data]);

  const headerBlock = (
    <AppHeader
      eyebrow="مواقيت اليوم"
      title="الصلاة"
      action="sliders"
      actionLabel="الإعدادات"
      onAction={() => router.push('/settings')}
    />
  );

  if (locationError) {
    return (
      <Screen>
        {headerBlock}
        <ErrorState />
        <Text style={[styles.locationHelp, { color: colors.mutedForeground }]}>
          نحتاج إلى موقعك الحالي لحساب مواقيت الصلاة بدقة. فعّل إذن الموقع ثم أعد فتح الصفحة.
        </Text>
      </Screen>
    );
  }

  if (!coordinates || prayerQuery.isPending) {
    return (
      <Screen>
        {headerBlock}
        <LoadingState />
      </Screen>
    );
  }

  if (prayerQuery.isError) {
    return (
      <Screen>
        {headerBlock}
        <ErrorState offline={isOfflineError(prayerQuery.error)} onRetry={() => void prayerQuery.refetch()} />
      </Screen>
    );
  }

  const timings = prayerQuery.data?.timings ?? {};
  // Task 8: when the result came from the offline cache, show a clear notice.
  const fromCache =
    Boolean((prayerQuery.data as { cached?: boolean } | undefined)?.cached);
  if (Object.keys(timings).length === 0) {
    return (
      <Screen>
        {headerBlock}
        <Text style={[styles.locationHelp, { color: colors.mutedForeground }]}>لا توجد مواقيت متاحة لهذا اليوم.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      {headerBlock}
      {fromCache ? (
        <View style={[styles.cacheNotice, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Feather name="wifi-off" size={15} color={colors.primary} />
          <Text style={[styles.cacheNoticeText, { color: colors.foreground }]}>
            هذه آخر مواقيت محفوظة على جهازك، قد لا تعكس اليوم الحالي بدقة — أعد المحاولة عند توفر الإنترنت.
          </Text>
        </View>
      ) : null}
      <View style={[styles.dateCard, { backgroundColor: colors.accent }]}>
        <Text style={[styles.hijri, { color: colors.foreground }]}>{prayerQuery.data?.hijriDate}</Text>
        <Text style={[styles.gregorian, { color: colors.mutedForeground }]}>{prayerQuery.data?.date}</Text>
      </View>
      <View style={[styles.nextCard, { backgroundColor: colors.primary }]}>
        <Text style={[styles.nextLabel, { color: colors.primarySoft }]}>الصلاة القادمة</Text>
        <View style={styles.nextMain}>
          <View>
            <Text style={[styles.nextPrayer, { color: colors.primaryForeground }]}>
              {nextPrayer?.name ?? 'اكتملت صلوات اليوم'}
            </Text>
            <Text style={[styles.nextTime, { color: colors.primaryForeground }]}>{nextPrayer?.time ?? '—'}</Text>
          </View>
          <View style={[styles.nextCircle, { borderColor: colors.primarySoft }]}>
            <Feather name="clock" size={24} color={colors.primaryForeground} />
          </View>
        </View>
      </View>
      <Text style={[styles.section, { color: colors.foreground }]}>مواقيت اليوم</Text>
      <View style={[styles.list, { borderColor: colors.border }]}>
        {prayerRows.map(([name, key]) => {
          const active = name === nextPrayer?.name;
          return (
            <View key={key} style={[styles.row, { borderBottomColor: colors.border }, active && { backgroundColor: colors.accent }]}>
              <View style={styles.rowName}>
                {active ? <View style={[styles.activeDot, { backgroundColor: colors.primary }]} /> : null}
                <Text style={[styles.prayerName, { color: colors.foreground }]}>{name}</Text>
              </View>
              <Text style={[styles.prayerTime, { color: active ? colors.primary : colors.mutedForeground }]}>
                {timings[key] ?? '—'}
              </Text>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cacheNotice: { alignItems: 'center', borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row-reverse', gap: spacing.sm, marginBottom: spacing.md, padding: spacing.md },
  cacheNoticeText: { flex: 1, fontSize: typography.bodySmall, lineHeight: 20, textAlign: 'right' },
  locationHelp: { fontSize: typography.bodySmall, lineHeight: 23, marginTop: spacing.md, textAlign: 'right' },
  dateCard: { alignItems: 'center', borderRadius: radii.md, padding: spacing.md },
  hijri: { fontSize: typography.bodyLarge, fontWeight: '700' },
  gregorian: { fontSize: typography.bodySmall, marginTop: 4 },
  nextCard: { borderRadius: radii.lg, marginTop: spacing.md, padding: spacing.lg },
  nextLabel: { fontSize: typography.bodySmall, textAlign: 'right' },
  nextMain: { alignItems: 'center', flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: spacing.md },
  nextPrayer: { fontSize: typography.h2, fontWeight: '600', textAlign: 'right' },
  nextTime: { fontSize: 42, fontWeight: '300', letterSpacing: -1.2, marginTop: 3 },
  nextCircle: { alignItems: 'center', borderRadius: 100, borderWidth: 2, height: 86, justifyContent: 'center', width: 86 },
  section: { fontSize: typography.h3, fontWeight: '700', marginBottom: spacing.sm, marginTop: spacing.xl, textAlign: 'right' },
  list: { borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' },
  row: { alignItems: 'center', flexDirection: 'row-reverse', justifyContent: 'space-between', minHeight: 56, paddingHorizontal: spacing.md },
  rowName: { alignItems: 'center', flexDirection: 'row-reverse', gap: spacing.sm },
  activeDot: { borderRadius: radii.pill, height: 7, width: 7 },
  prayerName: { fontSize: typography.body },
  prayerTime: { fontSize: typography.body, fontWeight: '700' },
});
