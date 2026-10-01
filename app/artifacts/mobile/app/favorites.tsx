import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { IconButton, Screen, EmptyState } from '@/components/ui';
import { radii, spacing, typography } from '@/constants/tokens';
import { useColors } from '@/hooks/useColors';
import { useFavoritesList } from '@/hooks/useAppState';
import type { FavoriteItem } from '@/lib/storage';

type FilterKey = 'all' | 'ayah' | 'hadith' | 'dhikr';

const KIND_LABELS: Record<FavoriteItem['kind'], string> = {
  ayah: 'آية',
  hadith: 'حديث',
  dhikr: 'ذكر',
};

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'ayah', label: 'الآيات' },
  { key: 'hadith', label: 'الأحاديث' },
  { key: 'dhikr', label: 'الأذكار' },
];

export default function FavoritesScreen() {
  const colors = useColors();
  const router = useRouter();
  const { favorites, toggle } = useFavoritesList();
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? favorites : favorites.filter((item) => item.kind === filter)),
    [favorites, filter],
  );

  const openItem = (item: FavoriteItem) => {
    if (item.kind === 'ayah') {
      // refId = "سورة:آية" (verseKey) — فتح موضع دقيق: الآية داخل صفحتها.
      const [surahIdRaw, ayahRaw] = item.refId.split(':');
      const surahId = Number(surahIdRaw);
      const ayahNumber = Number(ayahRaw);
      if (Number.isInteger(surahId) && surahId >= 1 && surahId <= 114) {
        router.push({
          pathname: '/quran-reader',
          params: {
            surahId: String(surahId),
            ...(Number.isInteger(ayahNumber) && ayahNumber >= 1 ? { ayah: String(ayahNumber) } : {}),
            ...(item.subtitle ? { surah: item.subtitle.split(':')[0].trim() } : {}),
          },
        });
      }
    } else if (item.kind === 'hadith') {
      router.push('/hadith-browser');
    } else if (item.kind === 'dhikr') {
      // refId = رقم الذكر (order) — افتحه في شاشة الذكر مع عدّاده.
      const order = Number(item.refId);
      if (Number.isInteger(order) && order > 0) {
        router.push({ pathname: '/dhikr-practice', params: { order: item.refId } });
      } else {
        router.push('/dhikr');
      }
    }
  };

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
        <Text style={[styles.title, { color: colors.foreground }]}>المفضلة</Text>
      </View>

      {favorites.length > 0 ? (
        <>
          <View style={styles.filters}>
            {FILTERS.map(({ key, label }) => (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: filter === key }}
                onPress={() => setFilter(key)}
                style={[styles.filter, filter === key && { backgroundColor: colors.primary }]}
              >
                <Text
                  style={[
                    styles.filterText,
                    { color: filter === key ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardTop}>
                  <View style={[styles.kindBadge, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.kindText, { color: colors.primary }]}>{KIND_LABELS[item.kind]}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`إزالة ${item.title} من المفضلة`}
                    onPress={() => void toggle({ kind: item.kind, refId: item.refId, title: item.title, text: item.text, subtitle: item.subtitle })}
                    hitSlop={8}
                  >
                    <Feather name="trash-2" size={16} color={colors.mutedForeground} />
                  </Pressable>
                </View>
                <Pressable accessibilityRole="button" onPress={() => openItem(item)}>
                  <Text style={[styles.cardText, { color: colors.foreground }]}>{item.text}</Text>
                </Pressable>
                {item.subtitle ? (
                  <Text style={[styles.cardSubtitle, { color: colors.primary }]}>{item.subtitle}</Text>
                ) : null}
              </View>
            )}
          />
        </>
      ) : (
        <EmptyState
          title="لم تحفظ أي عنصر بعد"
          message="ستظهر هنا الآيات والأحاديث والأذكار التي تختار الاحتفاظ بها."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { flex: 1, fontSize: typography.h1, fontWeight: '700', textAlign: 'right' },
  filters: { flexDirection: 'row-reverse', gap: 8, marginBottom: spacing.sm },
  filter: { borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 7 },
  filterText: { fontSize: typography.bodySmall, fontWeight: '700' },
  list: { paddingBottom: 60 },
  card: { borderRadius: radii.md, borderWidth: 1, marginBottom: spacing.sm, padding: spacing.md },
  cardTop: { alignItems: 'center', flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: spacing.xs },
  kindBadge: { borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 3 },
  kindText: { fontSize: typography.caption, fontWeight: '700' },
  cardText: { fontSize: typography.body, lineHeight: 26, textAlign: 'right' },
  cardSubtitle: { fontSize: typography.caption, marginTop: spacing.xs, textAlign: 'right' },
});
