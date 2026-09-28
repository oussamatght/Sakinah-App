import React, { useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  fetchQuranAudio,
  fetchQuranChapters,
  fetchQuranSurah,
  fetchQuranTafsir,
  reciterNameOf,
  useGetQuranSurahs,
} from '@/lib/api';
import {
  downloadQuran,
  downloadQuranSurah,
  getOfflineQuranState,
  isQuranDownloaded,
  type DownloadProgress,
} from '@/lib/offline/quranDb';
import { ErrorState, IconButton, Screen } from '@/components/ui';
import { radii, spacing, typography } from '@/constants/tokens';
import { useColors } from '@/hooks/useColors';
import { useSettings } from '@/hooks/useAppState';

const PHASE_LABELS: Record<DownloadProgress['phase'], string> = {
  chapters: 'فهارس المصحف',
  surahs: 'السور',
  tafsir: 'التفسير',
  audio: 'صوت القارئ',
};

/**
 * تنزيل القرآن بدون إنترنت — بمرونة: المصحف كاملًا (نص + اختياري تفسير كل
 * آية + صوت كل سورة للقارئ المحدد)، أو سورة واحدة (نصّها + اختياري تفسيرها
 * وصوتها mp3). كل قطعة تُخزَّن فور وصولها والقائمة قابلة للاستئناف؛
 * المراحل اللاحقة تتخطى ما هو محفوظ محليًا وفشلها لا يمنع القراءة.
 */
export default function QuranDownloadScreen() {
  const colors = useColors();
  const router = useRouter();
  const surahsQuery = useGetQuranSurahs();
  const { settings } = useSettings();
  const reciterId = Math.round(settings.reciterId) || 7;
  const surahs = surahsQuery.data ?? [];
  const [state, setState] = useState(() => getOfflineQuranState());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'all' | 'one'>('all');
  const [pickedSurahId, setPickedSurahId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mediaTafsir, setMediaTafsir] = useState(true);
  const [mediaAudio, setMediaAudio] = useState(true);
  const running = useRef(false);

  const pickedSurah = surahs.find((candidate) => candidate.id === pickedSurahId) ?? null;

  const start = async () => {
    if (running.current) return;
    if (scope === 'one' && !pickedSurahId) {
      setError('اختر سورة أولًا.');
      return;
    }
    running.current = true;
    setBusy(true);
    setError(null);
    const media = {
      includeTafsir: mediaTafsir,
      includeAudio: mediaAudio,
      reciterId,
      fetchSurahAudio: (surahId: number, rid: number) => fetchQuranAudio(surahId, rid),
      fetchTafsir: (surahId: number, ayah: number) => fetchQuranTafsir(surahId, ayah),
    };
    try {
      if (scope === 'one' && pickedSurahId) {
        await downloadQuranSurah(
          pickedSurahId,
          (surahId) => fetchQuranSurah(surahId),
          async () => surahsQuery.data ?? (await fetchQuranChapters()),
          (value) => setProgress(value),
          media,
        );
      } else {
        await downloadQuran(
          (surahId) => fetchQuranSurah(surahId),
          async () => surahsQuery.data ?? (await fetchQuranChapters()),
          (value) => setProgress(value),
          media,
        );
      }
      setState(getOfflineQuranState());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تنزيل القرآن');
    } finally {
      setBusy(false);
      running.current = false;
    }
  };

  const downloaded = isQuranDownloaded();
  const percent = progress?.percent ?? 0;
  const phaseLabel = progress ? PHASE_LABELS[progress.phase] : 'السور';
  const hasPartial = state.ayahCount > 0;

  const toggleChip = (
    label: string,
    value: boolean,
    onChange: (next: boolean) => void,
  ) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => onChange(!value)}
      style={[
        styles.chip,
        {
          borderColor: value ? colors.primary : colors.border,
          backgroundColor: value ? colors.secondary : colors.card,
        },
      ]}>
      <Feather
        name={value ? 'check-circle' : 'circle'}
        size={15}
        color={value ? colors.primary : colors.mutedForeground}
      />
      <Text style={[styles.chipText, { color: value ? colors.primary : colors.mutedForeground }]}>
        {label}
      </Text>
    </Pressable>
  );

  const scopeChip = (
    label: string,
    value: 'all' | 'one',
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: scope === value }}
      onPress={() => setScope(value)}
      style={[
        styles.scopeChip,
        {
          backgroundColor: scope === value ? colors.primary : colors.card,
          borderColor: scope === value ? colors.primary : colors.border,
        },
      ]}>
      <Text
        style={[
          styles.scopeChipText,
          { color: scope === value ? colors.primaryForeground : colors.mutedForeground },
        ]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
        <Text style={[styles.title, { color: colors.foreground }]}>القرآن بدون إنترنت</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.secondary }]}>
          <Feather name={downloaded ? 'check-circle' : 'download'} size={26} color={colors.primary} />
        </View>
        {downloaded ? (
          <>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              تم تنزيل القرآن للاستخدام بدون إنترنت
            </Text>
            <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
              {state.ayahCount} آية محفوظة على جهازك — القراءة والأجزاء تعمل دون اتصال.
              {state.tafsirCount > 0 ? ` التفسير (${state.tafsirCount} آية).` : ''}
              {state.surahAudioCount > 0
                ? ` صوت ${reciterNameOf(state.audioReciterId ?? reciterId)} (${state.surahAudioCount} سورة).`
                : ''}
            </Text>
          </>
        ) : busy ? (
          <>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>جارٍ تحميل القرآن...</Text>
            <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
              {phaseLabel} {progress?.done ?? 0} من {progress?.total ?? 114}
            </Text>
            <View style={[styles.track, { backgroundColor: colors.muted }]}>
              <View style={[styles.fill, { backgroundColor: colors.primary, width: `${Math.max(percent, 2)}%` }]} />
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              {scope === 'all'
                ? `حمّل المصحف كاملًا (القارئ المختار)`
                : `حفظ سورة: ${pickedSurah ? pickedSurah.nameArabic : 'اختر السورة أدناه'}`}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
              نص المصحف يُخزَّن محليًا دائمًا. اختر «سورة واحدة» لحفظ سورة بعينها،
              وأضف التفسير وصوت القارئ «{reciterNameOf(reciterId)}» متى شئت.
            </Text>
            {hasPartial ? (
              <Text style={[styles.cardMeta, { color: colors.primary }]}>
                مخزّن حتى الآن: {state.ayahCount} آية
                {state.tafsirCount > 0 ? ` • تفسير ${state.tafsirCount} آية` : ''}
                {state.surahAudioCount > 0 ? ` • صوت ${state.surahAudioCount} سورة` : ''}
              </Text>
            ) : null}
            {error ? (
              <Text style={[styles.errorText, { color: '#B74C43' }]}>{error}</Text>
            ) : null}
          </>
        )}
      </View>

      {!downloaded && !busy ? (
        <View style={styles.options}>
          <View style={styles.scopeRow}>
            {scopeChip('القرآن كاملًا', 'all')}
            {scopeChip('سورة واحدة', 'one')}
          </View>

          {scope === 'one' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="اختيار السورة المراد حفظها"
              onPress={() => setPickerOpen(true)}
              style={({ pressed }) => [
                styles.pickerRow,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <Feather name="book-open" size={17} color={colors.primary} />
              <View style={styles.pickerCopy}>
                <Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>السورة</Text>
                <Text style={[styles.pickerName, { color: colors.foreground }]}>
                  {pickedSurah ? `${pickedSurah.nameArabic} (${pickedSurah.id})` : 'اختر سورة…'}
                </Text>
              </View>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}

          {toggleChip(
            scope === 'all' ? 'التفسير الميسّر كاملًا' : 'تفسير هذه السورة',
            mediaTafsir,
            setMediaTafsir,
          )}
          {toggleChip(
            scope === 'all'
              ? `صوت ${reciterNameOf(reciterId)} (كل السور)`
              : `صوت هذه السورة ${reciterNameOf(reciterId)}`,
            mediaAudio,
            setMediaAudio,
          )}

          <View style={styles.actions}>
            <IconButton
              icon="download"
              label={scope === 'all' ? 'بدء التنزيل' : 'حفظ السورة'}
              onPress={() => void start()}
              variant="dark"
            />
            <Text style={[styles.actionLabel, { color: colors.primary }]}>
              {scope === 'all' ? 'بدء التنزيل' : 'حفظ السورة'}
            </Text>
          </View>
        </View>
      ) : null}
      {busy ? (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          يمكنك مغادرة الصفحة — سيُستأنف التخزين من حيث توقف عند المحاولة القادمة.
        </Text>
      ) : null}
      {error && !busy ? (
        <ErrorState onRetry={() => void start()} />
      ) : null}

      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHead}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>اختر سورة لحفظها</Text>
              <IconButton icon="x" label="إغلاق" onPress={() => setPickerOpen(false)} variant="soft" />
            </View>
            <FlatList
              data={surahs}
              keyExtractor={(candidate) => String(candidate.id)}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`حفظ ${item.nameArabic}`}
                  onPress={() => {
                    setPickedSurahId(item.id);
                    setPickerOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.modalRow,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}>
                  <Text style={[styles.modalNumber, { color: colors.primary }]}>
                    {String(item.id).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)])}
                  </Text>
                  <Text style={[styles.modalName, { color: colors.foreground }]}>{item.nameArabic}</Text>
                  {pickedSurahId === item.id ? (
                    <Feather name="check-circle" size={18} color={colors.primary} />
                  ) : null}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row-reverse', gap: spacing.md, marginBottom: spacing.xl },
  title: { flex: 1, fontSize: typography.h1, fontWeight: '700', textAlign: 'right' },
  card: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.xl },
  iconWrap: { alignItems: 'center', borderRadius: radii.pill, height: 64, justifyContent: 'center', width: 64 },
  cardTitle: { fontSize: typography.h3, fontWeight: '700', textAlign: 'center' },
  cardMeta: { fontSize: typography.bodySmall, lineHeight: 22, textAlign: 'center' },
  track: { borderRadius: radii.pill, height: 8, marginTop: spacing.sm, overflow: 'hidden', width: '100%' },
  fill: { borderRadius: radii.pill, height: '100%' },
  errorText: { fontSize: typography.bodySmall, textAlign: 'center' },
  options: { alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  scopeRow: { flexDirection: 'row-reverse', gap: spacing.sm, alignSelf: 'stretch' },
  scopeChip: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  scopeChipText: { fontSize: typography.bodySmall, fontWeight: '700' },
  pickerRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    padding: spacing.md,
  },
  pickerCopy: { alignItems: 'flex-end', flex: 1 },
  pickerLabel: { fontSize: typography.caption },
  pickerName: { fontSize: typography.body, fontWeight: '700' },
  chip: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  chipText: { fontSize: typography.body, fontWeight: '600' },
  actions: { alignItems: 'center', flexDirection: 'row-reverse', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.sm },
  actionLabel: { fontSize: typography.body, fontWeight: '700' },
  hint: { fontSize: typography.caption, marginTop: spacing.lg, textAlign: 'center' },
  modalOverlay: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    maxHeight: '70%',
    padding: spacing.md,
  },
  modalHead: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  modalTitle: { fontSize: typography.h3, fontWeight: '700', textAlign: 'right' },
  modalRow: {
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    marginBottom: spacing.xs,
    padding: spacing.sm,
  },
  modalNumber: {
    fontSize: typography.bodySmall,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'center',
  },
  modalName: { flex: 1, fontSize: typography.body, textAlign: 'right' },
});