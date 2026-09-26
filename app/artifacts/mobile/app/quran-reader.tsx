import React, { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useGetQuranAudio, useGetQuranReader, useGetQuranTafsir } from '@/lib/api';
import { saveReadingPosition } from '@/lib/storage';
import {
  ErrorState,
  IconButton,
  isOfflineError,
  LoadingState,
  Screen,
} from '@/components/ui';
import { FavoriteButton } from '@/components/FavoriteButton';
import { radii, spacing, typography } from '@/constants/tokens';
import { useColors } from '@/hooks/useColors';

export default function QuranReader() {
  const colors = useColors();
  const router = useRouter();
  const { surah, surahId } = useLocalSearchParams<{ surah?: string; surahId?: string }>();
  const id = Number(surahId);
  const validId = Number.isInteger(id) && id >= 1 && id <= 114;
  // "آية 1" until the user taps a verse — the tafsir card then follows the tap.
  const [tafsirAyah, setTafsirAyah] = useState(1);
  // Bottom-sheet visibility; tafsirAyah holds which verse the sheet shows.
  const [tafsirOpen, setTafsirOpen] = useState(false);
  const readerQuery = useGetQuranReader(validId ? id : 0, {
    query: { enabled: validId },
  });
  const audioQuery = useGetQuranAudio(validId ? id : 0, {
    query: { enabled: validId },
  });
  const tafsirQuery = useGetQuranTafsir(validId ? id : 0, tafsirAyah, {
    query: { enabled: validId },
  });

  // Auto-save the open position — no user action needed. Hooks must run on
  // EVERY render (Rules of Hooks), so this lives before any early return.
  useEffect(() => {
    if (!validId) return;
    void saveReadingPosition({
      surahId: id,
      surahName: surah,
      ayahNumber: tafsirAyah,
    });
  }, [validId, id, surah, tafsirAyah]);

  if (!validId) {
    return (
      <Screen>
        <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
        <ErrorState />
      </Screen>
    );
  }

  if (readerQuery.isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (readerQuery.isError || !readerQuery.data) {
    // Fix 9: a failed saved-position open must not strand the user on a dead
    // end — offer going straight to the surah list (the Quran tab).
    return (
      <Screen>
        <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
        <ErrorState offline={isOfflineError(readerQuery.error)} onRetry={() => void readerQuery.refetch()} />
        <Text style={[styles.fallbackHint, { color: colors.mutedForeground }]}>
          تعذر فتح آخر موضع، جرّب اختيار سورة
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="الذهاب إلى قائمة السور"
          onPress={() => router.replace('/(tabs)/quran')}
          style={({ pressed }) => [
            styles.surahListButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Feather name="list" size={17} color={colors.primaryForeground} />
          <Text style={[styles.surahListText, { color: colors.primaryForeground }]}>
            اختيار سورة
          </Text>
        </Pressable>
      </Screen>
    );
  }

  const surahData = readerQuery.data;
  const verses = readerQuery.data?.verses ?? [];
  const firstVerse = verses[0];
  const audioLabel = audioQuery.isPending
    ? 'جارٍ تجهيز الصوت'
    : audioQuery.isError
      ? 'تعذر تحميل الصوت'
      : 'استماع للسورة';

  return (
    <Screen>
      <View style={styles.readerHeader}>
        <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
        <View style={styles.readerTitle}>
          <Text style={[styles.surahTitle, { color: colors.foreground }]}>
            {surahData.nameArabic || surah || 'القرآن الكريم'}
          </Text>
          <Text style={[styles.readerMeta, { color: colors.mutedForeground }]}>
            {firstVerse ? `الجزء ${firstVerse.juz} • الصفحة ${firstVerse.page}` : 'قراءة مباشرة'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={audioLabel}
          disabled={!audioQuery.data?.audioUrl}
          onPress={() => {
            const audioUrl = audioQuery.data?.audioUrl;
            if (audioUrl) void Linking.openURL(audioUrl);
          }}
          style={({ pressed }) => [
            styles.audioButton,
            {
              backgroundColor: colors.secondary,
              opacity: pressed || !audioQuery.data?.audioUrl ? 0.45 : 1,
            },
          ]}
        >
          <Feather name="headphones" size={18} color={colors.primary} />
          <Text style={[styles.audioText, { color: colors.primary }]}>استماع</Text>
        </Pressable>
      </View>
      {audioQuery.isPending ? (
        <Text style={[styles.statusText, { color: colors.mutedForeground }]}>جارٍ تحميل الصوت...</Text>
      ) : null}
      {audioQuery.isError ? (
        <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
          تعذر تحميل الصوت، يمكنك متابعة القراءة دون اتصال صوتي.
        </Text>
      ) : null}
      <View style={[styles.bismillah, { borderColor: colors.border }]}>
        <Text style={[styles.bismillahText, { color: colors.primary }]}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</Text>
      </View>
      {verses.length === 0 ? (
        <Text style={[styles.statusText, { color: colors.mutedForeground }]}>لا توجد آيات متاحة لهذه السورة.</Text>
      ) : (
        verses.map((ayah) => (
          <Pressable
            key={ayah.id}
            testID={`ayah-${ayah.verseNumber}`}
            accessibilityRole="button"
            accessibilityLabel={`الآية ${ayah.verseNumber}`}
            onPress={() => {
              setTafsirAyah(ayah.verseNumber);
              setTafsirOpen(true);
            }}
            style={({ pressed }) => [
              styles.ayah,
              tafsirAyah === ayah.verseNumber && {
                backgroundColor: colors.accent,
              },
              { borderBottomColor: colors.border, opacity: pressed ? 0.72 : 1 },
            ]}
          >
            <View style={[styles.ayahNumber, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.ayahNumberText, { color: colors.primary }]}>{ayah.verseNumber}</Text>
            </View>
            <Text style={[styles.ayahText, { color: colors.foreground }]}>{ayah.text}</Text>
            <FavoriteButton
              item={{
                kind: 'ayah',
                refId: ayah.verseKey,
                title: `${surahData.nameArabic} — آية ${ayah.verseNumber}`,
                text: ayah.text,
                subtitle: `${surahData.nameArabic} : ${ayah.verseNumber}`,
              }}
            />
          </Pressable>
        ))
      )}
      {/* Tafsir bottom sheet — opening/refreshing it never blocks reading:
          the reader stays fully usable when the tafsir API fails. */}
      <Modal
        visible={tafsirOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setTafsirOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setTafsirOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.background }]}
            onPress={() => undefined}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                  تفسير الآية {tafsirAyah}
                </Text>
                <Text style={[styles.sheetSource, { color: colors.primary }]}>
                  {surahData.nameArabic} • {tafsirQuery.data?.resourceName ?? 'التفسير الميسّر'}
                </Text>
              </View>
              <IconButton
                icon="x"
                label="إغلاق التفسير"
                onPress={() => setTafsirOpen(false)}
                variant="soft"
              />
            </View>
            {verses.find((verse) => verse.verseNumber === tafsirAyah) ? (
              <View style={[styles.sheetVerse, { backgroundColor: colors.accent }]}> 
                <Text style={[styles.sheetVerseText, { color: colors.foreground }]}>
                  {verses.find((verse) => verse.verseNumber === tafsirAyah)?.text}
                </Text>
              </View>
            ) : null}
            <View style={styles.sheetBody}>
              {tafsirQuery.isPending ? <LoadingState /> : null}
              {tafsirQuery.isError ? (
                <ErrorState
                  offline={isOfflineError(tafsirQuery.error)}
                  onRetry={() => void tafsirQuery.refetch()}
                />
              ) : (
                <Text style={[styles.sheetTafsirText, { color: colors.foreground }]}>
                  {tafsirQuery.data?.text?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ||
                    'لا يوجد تفسير متاح لهذه الآية.'}
                </Text>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <View style={[styles.readerNote, { backgroundColor: colors.accent }]}>
        <Feather name="bookmark" size={16} color={colors.primary} />
        <Text style={[styles.readerNoteText, { color: colors.foreground }]}>
          اضغط على أي آية لعرض التفسير وحفظ موضع القراءة
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  readerHeader: { alignItems: 'center', flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: spacing.lg },
  readerTitle: { alignItems: 'center', flex: 1 },
  surahTitle: { fontSize: typography.h2, fontWeight: '700' },
  readerMeta: { fontSize: typography.caption, marginTop: 4 },
  audioButton: { alignItems: 'center', borderRadius: radii.pill, flexDirection: 'row-reverse', gap: 5, paddingHorizontal: 10, paddingVertical: 9 },
  audioText: { fontSize: typography.caption, fontWeight: '700' },
  statusText: { fontSize: typography.bodySmall, lineHeight: 22, marginBottom: spacing.md, textAlign: 'right' },
  bismillah: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, paddingVertical: spacing.lg },
  bismillahText: { fontSize: typography.quranMedium, textAlign: 'center' },
  ayah: { alignItems: 'flex-start', borderBottomWidth: 1, flexDirection: 'row-reverse', gap: spacing.sm, paddingVertical: spacing.lg },
  ayahNumber: { alignItems: 'center', borderRadius: radii.pill, height: 28, justifyContent: 'center', marginTop: 5, width: 28 },
  ayahNumberText: { fontSize: typography.caption, fontWeight: '700' },
  ayahText: { flex: 1, fontSize: typography.quranLarge, lineHeight: 50, textAlign: 'right' },
  fallbackHint: { fontSize: typography.bodySmall, marginTop: spacing.sm, textAlign: 'center' },
  surahListButton: { alignItems: 'center', alignSelf: 'center', borderRadius: radii.pill, flexDirection: 'row-reverse', gap: 6, paddingHorizontal: spacing.lg, paddingVertical: 11 },
  surahListText: { fontSize: typography.bodySmall, fontWeight: '700' },
  tafsirCard: { borderRadius: radii.sm, marginTop: spacing.lg, padding: spacing.md },
  sheetBackdrop: { backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: '82%',
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sheetHandle: { alignSelf: 'center', borderRadius: radii.pill, height: 4, marginBottom: spacing.md, width: 44 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row-reverse', justifyContent: 'space-between' },
  sheetTitle: { fontSize: typography.h3, fontWeight: '700', textAlign: 'right' },
  sheetSource: { fontSize: typography.caption, marginTop: 2, textAlign: 'right' },
  sheetVerse: { borderRadius: radii.sm, marginTop: spacing.md, padding: spacing.md },
  sheetVerseText: { fontSize: typography.quranMedium, lineHeight: 38, textAlign: 'right' },
  sheetBody: { marginTop: spacing.md },
  sheetTafsirText: { fontSize: typography.body, lineHeight: 28, textAlign: 'right' },
  readerNote: { alignItems: 'center', borderRadius: radii.sm, flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md },
  readerNoteText: { flex: 1, fontSize: typography.bodySmall, lineHeight: 21, textAlign: 'right' },
});