import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useGetQuranJuz } from '@/lib/api';
import {
  ErrorState,
  IconButton,
  isOfflineError,
  LoadingState,
  Screen,
} from '@/components/ui';
import { radii, spacing, typography } from '@/constants/tokens';
import { useColors } from '@/hooks/useColors';
import { useSettings } from '@/hooks/useAppState';

/** Juz reader — the real content of one juz (alquran.cloud /juz/{n}): a header
 *  listing each surah's ayah range, then the verses in mushaf order. */
export default function JuzReader() {
  const colors = useColors();
  const router = useRouter();
  // حجم الآيات ديناميكي من fontScale (المتجر المشترك — انظر quran-reader).
  const { settings } = useSettings();
  const verseFontSize = typography.quranMedium * settings.fontScale;
  const verseLineHeight = Math.round(verseFontSize * 1.8);
  const { juz } = useLocalSearchParams<{ juz?: string }>();
  const juzNumber = Number(juz);
  const validJuz = Number.isInteger(juzNumber) && juzNumber >= 1 && juzNumber <= 30;

  const juzQuery = useGetQuranJuz(validJuz ? juzNumber : 0, {
    query: { enabled: validJuz },
  });

  if (!validJuz) {
    return (
      <Screen>
        <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
        <ErrorState />
      </Screen>
    );
  }

  if (juzQuery.isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (juzQuery.isError || !juzQuery.data) {
    return (
      <Screen>
        <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
        <ErrorState
          offline={isOfflineError(juzQuery.error)}
          onRetry={() => void juzQuery.refetch()}
        />
      </Screen>
    );
  }

  const data = juzQuery.data;

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
        <View style={styles.titleCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>الجزء {data.juz}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {data.ayahCount} آية • {data.surahRanges.length} سورة
          </Text>
        </View>
      </View>

      <FlatList
        data={data.verses}
        keyExtractor={(verse) => verse.verseKey}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={[styles.rangesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {data.surahRanges.map((range) => (
              <Pressable
                key={range.surahId}
                accessibilityRole="button"
                accessibilityLabel={`قراءة سورة ${range.nameArabic}`}
                onPress={() =>
                  router.push({
                    pathname: '/quran-reader',
                    params: { surahId: String(range.surahId), surah: range.nameArabic },
                  })
                }
                style={({ pressed }) => [
                  styles.rangeRow,
                  { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text style={[styles.rangeName, { color: colors.primary }]}>{range.nameArabic}</Text>
                <Text style={[styles.rangeMeta, { color: colors.mutedForeground }]}>
                  الآيات {range.fromAyah}–{range.toAyah} • ص {range.startPage}
                </Text>
                <Feather name="chevron-left" size={15} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.verseRow, { borderBottomColor: colors.border }]}>
            <Text
              style={[
                styles.verseText,
                { color: colors.foreground, fontSize: verseFontSize, lineHeight: verseLineHeight },
              ]}>
              {item.text}
            </Text>
            <View style={[styles.verseBadge, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.verseBadgeText, { color: colors.primary }]}>{item.verseKey}</Text>
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row-reverse', gap: spacing.md, marginBottom: spacing.md },
  titleCopy: { alignItems: 'flex-end', flex: 1 },
  title: { fontSize: typography.h1, fontWeight: '700', textAlign: 'right' },
  subtitle: { fontSize: typography.caption, marginTop: 2 },
  list: { paddingBottom: 40 },
  rangesCard: { borderRadius: radii.md, borderWidth: 1, marginBottom: spacing.md, overflow: 'hidden' },
  rangeRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row-reverse', gap: spacing.sm, minHeight: 46, paddingHorizontal: spacing.md },
  rangeName: { fontSize: typography.body, fontWeight: '700', textAlign: 'right' },
  rangeMeta: { flex: 1, fontSize: typography.caption, textAlign: 'left' },
  verseRow: { borderBottomWidth: 1, paddingVertical: spacing.md },
  verseText: { marginBottom: spacing.sm, textAlign: 'right' },
  verseBadge: { alignSelf: 'flex-end', borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3 },
  verseBadgeText: { fontSize: typography.caption, fontWeight: '700' },
});
