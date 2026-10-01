import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { Screen, IconButton, ErrorState, LoadingState } from '@/components/ui';
import { radii, spacing, typography } from '@/constants/tokens';
import { useColors } from '@/hooks/useColors';

/**
 * Working Qibla compass: device position + great-circle bearing to the Kaaba
 * (21.4225N, 39.8262E) + magnetometer heading via watchHeadingAsync, with the
 * dial rotated by Animated. On web there is no magnetometer, so only the
 * absolute bearing is shown.
 */

const KAABA = { latitude: 21.4225, longitude: 39.8262 };
const QIBLA_BEARING_FALLBACK = 0;

function bearingToKaaba(latitude: number, longitude: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const lat1 = toRad(latitude);
  const lat2 = toRad(KAABA.latitude);
  const deltaLon = toRad(KAABA.longitude - longitude);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function formatBearing(bearing: number): string {
  const directions = ['ش', 'ج', 'ق', 'غ'];
  const index = Math.round(bearing / 90) % 4;
  return directions[index];
}

export default function QiblaScreen() {
  const colors = useColors();
  const router = useRouter();
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const [sensorError, setSensorError] = useState(false);

  const spin = useRef(new Animated.Value(0)).current;
  // Wrap-aware smoothing in refs (no re-render per sample): dialRef holds the
  // cumulative dial angle so rotations always take the shortest path (359↔1).
  const headingRef = useRef(0);
  const dialRef = useRef(0);

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
        // Guard against GPS hangs: treat >12s as a location error.
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

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let subscription: { remove: () => void } | null = null;
    let active = true;
    void (async () => {
      try {
        const available = await Location.hasServicesEnabledAsync();
        if (!available && active) setSensorError(true);
        const watcher = await Location.watchHeadingAsync((headingInfo) => {
          if (!active) return;
          const value =
            Platform.OS === 'ios'
              ? // trueHeading يحتاج موقعًا، magHeading متاح دائمًا
                headingInfo.trueHeading >= 0
                ? headingInfo.trueHeading
                : headingInfo.magHeading
              : headingInfo.magHeading ?? 0;
          // Low-pass filter with 0°/360° wrap awareness: move 35% toward each raw
          // sample along the SHORT arc so the dial neither flickers nor sweeps back.
          const previous = headingRef.current;
          const delta = ((value - previous + 540) % 360) - 180;
          const smoothed = (previous + delta * 0.35 + 360) % 360;
          headingRef.current = smoothed;
          setHeading(smoothed);
        });
        if (active) {
          subscription = { remove: () => void watcher.remove() };
        } else {
          void watcher.remove();
        }
      } catch {
        if (active) setSensorError(true);
      }
    })();
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  const qiblaBearing = useMemo(
    () =>
      coordinates ? bearingToKaaba(coordinates.latitude, coordinates.longitude) : QIBLA_BEARING_FALLBACK,
    [coordinates],
  );

  // Dial angle so the Kaaba marker sits at (qiblaBearing − heading), advancing
  // the CUMULATIVE angle by the shortest signed difference (no 0°/360° sweep).
  useEffect(() => {
    const absolute = heading !== null ? qiblaBearing - heading : qiblaBearing;
    const delta = ((absolute - dialRef.current + 540) % 360) - 180;
    const next = dialRef.current + delta;
    dialRef.current = next;
    Animated.timing(spin, {
      toValue: next,
      duration: 220,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [qiblaBearing, heading, spin]);

  if (locationError) {
    return (
      <Screen scroll={false} contentStyle={styles.container}>
        <View style={styles.header}>
          <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
          <Text style={[styles.title, { color: colors.foreground }]}>اتجاه القبلة</Text>
        </View>
        <ErrorState />
        <Text style={[styles.helper, { color: colors.mutedForeground, textAlign: 'center' }]}>
          نحتاج إذن الموقع لحساب اتجاه القبلة بدقة. فعّل الإذن ثم أعد فتح الصفحة.
        </Text>
      </Screen>
    );
  }

  if (!coordinates) {
    return (
      <Screen scroll={false} contentStyle={styles.container}>
        <View style={styles.header}>
          <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
          <Text style={[styles.title, { color: colors.foreground }]}>اتجاه القبلة</Text>
        </View>
        <LoadingState />
      </Screen>
    );
  }

  const rotate = spin.interpolate({
    inputRange: [-3600, 0, 3600],
    outputRange: ['-3600deg', '0deg', '3600deg'],
  });
  // Signed shortest difference to the qibla (−180..180) — what the user reads.
  const relative =
    heading !== null ? ((qiblaBearing - heading + 540) % 360) - 180 : null;
  const aligned = relative !== null ? Math.abs(relative) <= 5 : false;

  return (
    <Screen scroll={false} contentStyle={styles.container}>
      <View style={styles.header}>
        <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>اتجاه القبلة</Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            القبلة على بُعد {Math.round(qiblaBearing)}° {formatBearing(qiblaBearing)}
          </Text>
        </View>
      </View>

      <View style={styles.compassArea}>
        <View style={[styles.compassOuter, { borderColor: colors.border }]}>
          <Animated.View
            style={[
              styles.compassInner,
              { backgroundColor: colors.accent, borderColor: aligned ? colors.primary : colors.primarySoft },
              { transform: [{ rotate }] },
            ]}
          >
            <View style={styles.kaabaWrap}>
              <View style={[styles.kaaba, { backgroundColor: colors.primary }]}>
                <View style={[styles.kaabaBand, { backgroundColor: colors.accent }]} />
              </View>
            </View>
            <Text style={[styles.cardinal, { color: colors.mutedForeground }]}>ش</Text>
            <Text style={[styles.cardinalBottom, { color: colors.mutedForeground }]}>ج</Text>
          </Animated.View>
        </View>

        <Text style={[styles.heading, { color: colors.foreground }]}>
          {relative !== null
            ? aligned
              ? 'أنت باتجاه القبلة ✓'
              : `${Math.round(Math.abs(relative))}° عن القبلة ${relative > 0 ? 'يمينًا' : 'يسارًا'}`
            : 'اتجاه القبلة'}
        </Text>
        <Text style={[styles.helper, { color: colors.mutedForeground }]}>
          {Platform.OS === 'web'
            ? 'التجوّل المباشر متاح على الهاتف فقط'
            : 'حرّك الهاتف على شكل رقم ٨ للمعايرة'}
        </Text>
      </View>

      {sensorError ? (
        <View style={[styles.notice, { backgroundColor: colors.secondary }]}>
          <Feather name="alert-circle" size={16} color={colors.primary} />
          <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
            مستشعر البوصلة غير متاح على هذا الجهاز — نعرض زاوية القبلة من الشمال فقط.
          </Text>
        </View>
      ) : (
        <View style={[styles.notice, { backgroundColor: colors.secondary }]}>
          <Feather name="info" size={16} color={colors.primary} />
          <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
            ضع الهاتف أفقياً بعيداً عن المعادن حتى يصطف مؤشر الكعبة مع الأعلى.
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'space-between' },
  header: { alignItems: 'center', flexDirection: 'row-reverse', gap: spacing.md },
  headerCopy: { alignItems: 'flex-end', flex: 1 },
  title: { fontSize: typography.h1, fontWeight: '700' },
  meta: { fontSize: typography.bodySmall, marginTop: 5 },
  compassArea: { alignItems: 'center', justifyContent: 'center' },
  compassOuter: { alignItems: 'center', borderRadius: 180, borderWidth: 1, height: 300, justifyContent: 'center', width: 300 },
  compassInner: { alignItems: 'center', borderRadius: 150, borderWidth: 2, height: 258, justifyContent: 'flex-start', overflow: 'hidden', width: 258 },
  kaabaWrap: { alignItems: 'center', marginTop: 22 },
  kaaba: { alignItems: 'center', borderRadius: 4, height: 30, justifyContent: 'center', width: 30 },
  kaabaBand: { height: 4, width: 30 },
  cardinal: { fontSize: typography.body, fontWeight: '700', position: 'absolute', top: 60 },
  cardinalBottom: { fontSize: typography.body, fontWeight: '700', position: 'absolute', bottom: 14 },
  heading: { fontSize: typography.h2, fontWeight: '700', marginTop: spacing.xl },
  helper: { fontSize: typography.bodySmall, marginTop: 5 },
  notice: { alignItems: 'center', borderRadius: radii.sm, flexDirection: 'row-reverse', gap: spacing.sm, padding: spacing.md },
  noticeText: { flex: 1, fontSize: typography.bodySmall, lineHeight: 20, textAlign: 'right' },
});
