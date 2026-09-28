import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioPlayer,
} from 'expo-audio';
import { useFonts, AmiriQuran_400Regular } from '@expo-google-fonts/amiri-quran';
import {
  groupQuranVersesByPage,
  nextAyahPosition,
  useGetAyahAudio,
  useGetQuranReader,
  useGetQuranAudio,
  useGetQuranTafsir,
} from '@/lib/api';
import { getReadingPosition, saveReadingPosition } from '@/lib/storage';
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
import { useSettings } from '@/hooks/useAppState';

/** أرقام عربية للعلامات (عرض فقط — نص الآيات كما هو من الـ API حرفيًا). */
function toArabicDigits(value: number): string {
  return String(value).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
}

/** خط المصحف — حجمه البصري أصغر من Inter فنرفع الأساس قليلًا (٣١ مكافئ). */
const MUSHAF_BASE = Math.round(typography.quranLarge * 1.15);
/** اسم عائلة الخط كما سُجل في useFonts (مفتاح التحميل نفسه). */
const MUSHAF_FONT = 'AmiriQuran_400Regular';

type PageGroup = {
  page: number;
  verses: { verseKey: string; verseNumber: number; text: string }[];
};

/**
 * قارئ المصحف (إعادة بناء):
 *  - نص متصل مثل صفحة المصحف: آيات متتالية في <Text> واحد بعلامات أرقام
 *    الآيات — لا Card لكل آية.
 *  - صفحات حقيقية من الـ API (verse.page) في FlatList أفقي pagingEnabled —
 *    virtualization حقيقي (3 صفحات في الذاكرة) وبلا أي nested VirtualizedList
 *    (محتوى الصفحة نص + ScrollView عمودي بمحور مختلف).
 *  - الضغط على آية → Bottom sheet: الآية + التفسير + تشغيل صوت الآية
 *    (api.quran.com by_ayah — نفس recitation API الحالي) + المفضلة + مشاركة.
 *  - الآية قيد التلاوة تُظلل بلون خلفية فقط — النص لا يتغير أبدًا.
 *  - آخر موضع قراءة والمفضلة: نفس التخزين الحالي (نفس المفاتيح والأشكال).
 *  - fontScale من المتجر المشترك يتحكم بكل النص القرآني ديناميكيًا.
 */
export default function QuranReader() {
  const colors = useColors();
  const router = useRouter();
  // أبعاد الشاشة: متزامنة ومضمونة — بلا قياس onLayout قابل للفشل الصامت.
  const { width: windowWidth } = useWindowDimensions();
  const { surah, surahId } = useLocalSearchParams<{ surah?: string; surahId?: string }>();
  const id = Number(surahId);
  const validId = Number.isInteger(id) && id >= 1 && id <= 114;

  // fontScale من المتجر المشترك (الإعدادات تُحدّث هذه الشاشة فورًا).
  const { settings } = useSettings();
  const fontScale = settings.fontScale;
  const mushafSize = Math.round(MUSHAF_BASE * fontScale);
  const mushafLineHeight = Math.round(mushafSize * 2);
  const bannerSize = Math.round(typography.quranMedium * 1.2 * fontScale);
  const sheetVerseSize = Math.round(typography.quranMedium * fontScale);
  const sheetVerseLineHeight = Math.round(sheetVerseSize * 1.9);

  // خط أميري قرآن — يدعم الحركات/الشدة/المد/الهمزات/علامات الوقف كاملة.
  const [fontsLoaded, fontError] = useFonts({ AmiriQuran_400Regular });

  // "آية 1" حتى أول ضغط؛ الـ sheet يتبع الآية المختارة.
  const [selectedAyah, setSelectedAyah] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  // آية التلاوة الحالية (null = صامت) — منفصلة عن الاختيار.
  const [playingAyah, setPlayingAyah] = useState<number | null>(null);
  // آخر موضع محفوظ (يُقرأ مرة لتموضع الصفحة/الآية) ثم يُفعَّل العرض.
  const [resume, setResume] = useState<{ ayah: number; page: number } | null>(null);
  const [resumeLoaded, setResumeLoaded] = useState(false);
  // الصفحة المعروضة (للمؤشر العلوي).
  const [viewedPage, setViewedPage] = useState<number | null>(null);
  // عرض الشاشة: ثابت ومتزامن — يغني عن قياس onLayout الهش الذي كان يترك
  // القارئ فارغًا صامتًا عند فشل القياس الأول (سبب «البسملة ثم فراغ»).

  const readerQuery = useGetQuranReader(validId ? id : 0, {
    query: { enabled: validId },
  });
  const chapterAudioQuery = useGetQuranAudio(validId ? id : 0, {
    query: { enabled: validId },
  });
  const tafsirQuery = useGetQuranTafsir(validId ? id : 0, selectedAyah, {
    query: { enabled: validId && sheetOpen },
  });
  const ayahAudioQuery = useGetAyahAudio(validId ? id : 0, playingAyah);

  // مشغل واحد يُعاد استخدامه لكل الآيات (replace عند تغيير الآية).
  const player: AudioPlayer = useAudioPlayer(undefined);
  const audioStatus = useAudioPlayerStatus(player);

  // وضع الصوت: يعمل حتى في الوضع الصامت (مرة واحدة عند أول تشغيل).
  const audioModeConfigured = useRef(false);
  useEffect(() => {
    if (playingAyah === null || audioModeConfigured.current) return;
    audioModeConfigured.current = true;
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, [playingAyah]);

  // عند وصول رابط صوت الآية: حمّله في المشغل وشغّله فورًا.
  const ayahAudioUrl = ayahAudioQuery.data?.audioUrl ?? null;
  useEffect(() => {
    if (!playingAyah || !ayahAudioUrl) return;
    player.replace({ uri: ayahAudioUrl });
    player.play();
  }, [player, playingAyah, ayahAudioUrl]);

  /**
   * نهاية الآية → التالية في الترتيب القانوني (سورة:آية). حراسة صارمة ضد
   * التنفيذ المزدوج: didJustFinish يبقى true حتى يبدأ صوت الآية الجديدة،
   * فبدون مرجع «آية الانتهاء المنفذة» كان القفز يتم مرتين (تخطي آية).
   * عبور حدود السورة: التالية أول آية من السورة التالية — عبر replace مع
   * استئناف تشغيل آلي من الآية 1؛ نهاية القرآن (114:6) توقف صامت.
   */
  const verses = readerQuery.data?.verses ?? [];
  const finishedAyahRef = useRef<number | null>(null);
  const [crossing, setCrossing] = useState<null | { surah: number; playFromAyah: number }>(null);
  useEffect(() => {
    if (!audioStatus.didJustFinish || playingAyah === null) return;
    if (finishedAyahRef.current === playingAyah) return;
    finishedAyahRef.current = playingAyah;
    const next = nextAyahPosition({ surah: id, ayah: playingAyah });
    if (next && next.surah === id) {
      setPlayingAyah(next.ayah);
      setSelectedAyah(next.ayah);
    } else if (next) {
      // آخر آية في السورة → أول آية من السورة التالية (لا آية تُتخطى).
      setPlayingAyah(null);
      setSheetOpen(false);
      setCrossing({ surah: next.surah, playFromAyah: next.ayah });
      router.replace({
        pathname: '/quran-reader',
        params: { surahId: String(next.surah), surah: '' },
      });
    } else {
      setPlayingAyah(null);
    }
  }, [audioStatus.didJustFinish, playingAyah, id, router]);

  // آخر موضع: قرأته مرة للتموضع، ثم حفظ تلقائي عند كل فتح/اختيار (نفس الشكل).
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const position = await getReadingPosition();
        if (!active || !position || position.surahId !== id) {
          setResume({ ayah: 1, page: 0 });
          return;
        }
        setResume({ ayah: position.ayahNumber, page: 0 });
      } catch {
        if (active) setResume({ ayah: 1, page: 0 });
      } finally {
        if (active) setResumeLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
    // مرة واحدة عند تغيّر السورة.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!validId || !resumeLoaded) return;
    void saveReadingPosition({
      surahId: id,
      surahName: surah,
      ayahNumber: selectedAyah,
    });
  }, [validId, id, surah, selectedAyah, resumeLoaded]);

  // عبور سورة (تلاوة متصلة): عند وصول بيانات السورة الجديدة شغّل آية البدء
  // فورًا عبر المسار القياسي نفسه (query صوت الآية → replace → play).
  useEffect(() => {
    if (!crossing || readerQuery.isPending || readerQuery.isError || !readerQuery.data) return;
    const target = crossing.playFromAyah;
    setCrossing(null);
    finishedAyahRef.current = null;
    setSelectedAyah(target);
    setPlayingAyah(target);
  }, [crossing, readerQuery.isPending, readerQuery.isError, readerQuery.data]);

  // الصفحات الحقيقية من بيانات الـ API (verse.page) — منطق مشترك مُختبر.
  const pages = useMemo<PageGroup[]>(() => groupQuranVersesByPage(verses), [verses]);

  // بعد معرفة الصفحات: قفز أولي لصفحة آخر موضع (فقرة savedAyah).
  const [initialPageIndex, setInitialPageIndex] = useState<number | null>(null);
  useEffect(() => {
    if (!resumeLoaded || !resume || pages.length === 0) return;
    const saved = verses.find((verse) => verse.verseNumber === resume.ayah);
    const index = saved ? pages.findIndex((group) => group.page === saved.page) : -1;
    setInitialPageIndex(index >= 0 ? index : 0);
    setSelectedAyah(resume.ayah);
    // يعمل مرة واحدة بعد أول تحميل للصفحات.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeLoaded, pages.length === 0]);

  const onAyahPress = useCallback((verseNumber: number) => {
    setSelectedAyah(verseNumber);
    setSheetOpen(true);
  }, []);

  const toggleAyahAudio = useCallback(
    (verseNumber: number) => {
      // إعادة تشغيل آية انتهت للتو يجب أن تتقدم طبيعيًا عند انتهائها مجددًا.
      finishedAyahRef.current = null;
      setPlayingAyah((current) => {
        if (current === verseNumber) {
          player.pause();
          return null;
        }
        if (current !== null) player.pause();
        return verseNumber;
      });
    },
    [player],
  );

  const shareAyah = useCallback(async () => {
    const verse = verses.find((item) => item.verseNumber === selectedAyah);
    if (!verse) return;
    try {
      await Share.share({
        message: `${verse.text}\n﴿${toArabicDigits(verse.verseNumber)}﴾ ${surahData_nameArabic(readerQuery.data?.nameArabic)} — الآية ${verse.verseNumber}`,
      });
    } catch {
      // المشاركة اختيارية — إلغاء المستخدم ليس خطأ.
    }
  }, [verses, selectedAyah, readerQuery.data?.nameArabic]);

  // ---------- الشاشات المبكرة (كل الـ hooks أعلاه قبلها — Rules of Hooks) ----------
  if (!validId) {
    return (
      <Screen>
        <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
        <ErrorState />
      </Screen>
    );
  }

  if (readerQuery.isPending || (!fontsLoaded && !fontError)) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (readerQuery.isError || !readerQuery.data) {
    // Fix 9: فشل فتح آخر موضع لا يترك المستخدم في طريق مسدود.
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
  const firstVerse = verses[0];
  const chapterAudioLabel = chapterAudioQuery.isPending
    ? 'جارٍ تجهيز الصوت'
    : chapterAudioQuery.isError
      ? 'تعذر تحميل الصوت'
      : 'استماع للسورة كاملة';
  const showBismillahBanner = id !== 1 && id !== 9; // الفاتحة: البسملة آيتها 1؛ التوبة: لا بسملة
  // هل آية التلاوة الحالية معروضة على الصفحة الظاهرة؟
  const playedVerse = playingAyah !== null ? verses.find((v) => v.verseNumber === playingAyah) : undefined;
  const isAyahOnViewedPage =
    playingAyah === null || viewedPage === null || playedVerse?.page === viewedPage;

  const renderItem = ({ item }: { item: PageGroup }) => (
    <View style={styles.pageContainer}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.pageScroll}>
        <View style={styles.pageInner}>
          {/* نص متصل: آيات متتابعة داخل Text واحد — span لكل آية قابل للضغط */}
          <Text style={[styles.mushafText, { fontSize: mushafSize, lineHeight: mushafLineHeight, color: colors.foreground }]}>
            {item.verses.map((verse) => {
              const isPlaying = playingAyah === verse.verseNumber;
              const isSelected = sheetOpen && selectedAyah === verse.verseNumber && !isPlaying;
              return (
                <Text
                  key={verse.verseKey}
                  testID={`ayah-${verse.verseNumber}`}
                  onPress={() => onAyahPress(verse.verseNumber)}
                  style={[
                    styles.ayahSpan,
                    isPlaying && { backgroundColor: colors.primary, color: colors.primaryForeground },
                    isSelected && { backgroundColor: colors.secondary },
                  ]}
                >
                  {verse.text}
                  <Text style={[styles.ayahMarker, isPlaying && { color: colors.primaryForeground }]}>
                    {' '}﴿{toArabicDigits(verse.verseNumber)}﴾
                  </Text>
                  {' '}
                </Text>
              );
            })}
          </Text>
        </View>
      </ScrollView>
      <Text style={[styles.pageFooter, { color: colors.mutedForeground }]}>
        صفحة {toArabicDigits(item.page)}
      </Text>
    </View>
  );

  return (
    <Screen scroll={false} contentStyle={styles.readerContent}>
      <View style={styles.readerHeader}>
        <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
        <View style={styles.readerTitle}>
          <Text style={[styles.surahTitle, { color: colors.foreground }]}>
            {surahData.nameArabic || surah || 'القرآن الكريم'}
          </Text>
          <Text style={[styles.readerMeta, { color: colors.mutedForeground }]}>
            {surahData.revelationPlace === 'makkah' ? 'مكية' : 'مدنية'} • {surahData.versesCount} آية
            {viewedPage ? ` • صفحة ${toArabicDigits(viewedPage)}` : ''}
          </Text>
          {/* آية قيد التلاوة في صفحة أخرى (قلّب المستخدم الصفحة يدويًا):
              نستمر بالتشغيل بصمت مع مؤشر نصي بسيط — بلا قفز قسري للصفحة. */}
          {playingAyah !== null && !isAyahOnViewedPage ? (
            <Text style={[styles.remoteAudioHint, { color: colors.primary }]}>
              جارٍ تشغيل الآية {toArabicDigits(playingAyah)} — من صفحة أخرى
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={chapterAudioLabel}
          disabled={!chapterAudioQuery.data?.audioUrl}
          onPress={() => {
            const audioUrl = chapterAudioQuery.data?.audioUrl;
            if (audioUrl) void Linking.openURL(audioUrl);
          }}
          style={({ pressed }) => [
            styles.audioButton,
            {
              backgroundColor: colors.secondary,
              opacity: pressed || !chapterAudioQuery.data?.audioUrl ? 0.45 : 1,
            },
          ]}
        >
          <Feather name="headphones" size={18} color={colors.primary} />
          <Text style={[styles.audioText, { color: colors.primary }]}>السورة</Text>
        </Pressable>
      </View>

      {showBismillahBanner ? (
        <View style={[styles.bismillah, { borderColor: colors.border }]}>
          <Text
            style={[
              styles.bismillahText,
              { color: colors.primary, fontSize: bannerSize, fontFamily: MUSHAF_FONT },
            ]}>
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </Text>
        </View>
      ) : null}

      {pages.length === 0 ? (
        <Text style={[styles.statusText, { color: colors.mutedForeground }]}>لا توجد آيات متاحة لهذه السورة.</Text>
      ) : (
        <View style={styles.pagesWrap}>
          <FlatListH
            pages={pages}
            windowWidth={windowWidth}
            initialPageIndex={initialPageIndex ?? 0}
            renderItem={renderItem}
            onPageChange={(page) => setViewedPage(page)}
          />
        </View>
      )}

      {/* Bottom sheet: الآية + صوتها + المفضلة + المشاركة + التفسير */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.background }]}
            onPress={() => undefined}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleCopy}>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                  الآية {toArabicDigits(selectedAyah)}
                </Text>
                <Text style={[styles.sheetSource, { color: colors.primary }]}>
                  {surahData.nameArabic} • {tafsirQuery.data?.resourceName ?? 'التفسير الميسّر'}
                </Text>
              </View>
              <IconButton
                icon="x"
                label="إغلاق"
                onPress={() => setSheetOpen(false)}
                variant="soft"
              />
            </View>

            <View style={[styles.sheetVerse, { backgroundColor: colors.accent }]}>
              <Text
                style={[
                  styles.sheetVerseText,
                  {
                    color: colors.foreground,
                    fontSize: sheetVerseSize,
                    lineHeight: sheetVerseLineHeight,
                    fontFamily: MUSHAF_FONT,
                  },
                ]}>
                {verses.find((verse) => verse.verseNumber === selectedAyah)?.text}
              </Text>
            </View>

            {/* أدوات الآية: تشغيل/إيقاف + مفضلة + مشاركة */}
            <View style={styles.sheetActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  playingAyah === selectedAyah ? 'إيقاف صوت الآية' : 'تشغيل صوت الآية'
                }
                onPress={() => toggleAyahAudio(selectedAyah)}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor:
                      playingAyah === selectedAyah ? colors.primary : colors.secondary,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Feather
                  name={playingAyah === selectedAyah ? 'pause' : 'play'}
                  size={17}
                  color={playingAyah === selectedAyah ? colors.primaryForeground : colors.primary}
                />
                <Text
                  style={[
                    styles.actionText,
                    {
                      color:
                        playingAyah === selectedAyah ? colors.primaryForeground : colors.primary,
                    },
                  ]}>
                  {playingAyah === selectedAyah ? 'إيقاف' : 'تشغيل الآية'}
                </Text>
              </Pressable>
              <FavoriteButton
                item={{
                  kind: 'ayah',
                  refId: `${id}:${selectedAyah}`,
                  title: `${surahData.nameArabic} — آية ${selectedAyah}`,
                  text: verses.find((verse) => verse.verseNumber === selectedAyah)?.text.slice(0, 220) ?? '',
                  subtitle: `${surahData.nameArabic} : ${selectedAyah}`,
                }}
                variant="soft"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="مشاركة الآية"
                onPress={() => void shareAyah()}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: colors.secondary, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Feather name="share-2" size={17} color={colors.primary} />
                <Text style={[styles.actionText, { color: colors.primary }]}>مشاركة</Text>
              </Pressable>
            </View>

            {ayahAudioQuery.isError ? (
              <Text style={[styles.audioStatus, { color: colors.mutedForeground }]}>
                تعذر تحميل صوت هذه الآية — يمكنك متابعة القراءة.
              </Text>
            ) : playingAyah !== null && ayahAudioQuery.isPending ? (
              <Text style={[styles.audioStatus, { color: colors.mutedForeground }]}>جارٍ تجهيز الصوت…</Text>
            ) : null}

            <View style={styles.sheetBody}>
              {tafsirQuery.isPending ? <LoadingState /> : null}
              {tafsirQuery.isError ? (
                <ErrorState
                  offline={isOfflineError(tafsirQuery.error)}
                  onRetry={() => void tafsirQuery.refetch()}
                />
              ) : tafsirQuery.data ? (
                <Text style={[styles.sheetTafsirText, { color: colors.foreground }]}>
                  {tafsirQuery.data.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ||
                    'لا يوجد تفسير متاح لهذه الآية.'}
                </Text>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Text style={[styles.readerHint, { color: colors.mutedForeground }]}>
        اضغط أي آية للتفسير والصوت والمفضلة • اسحب بين الصفحات
      </Text>
    </Screen>
  );
}

/** اسم السورة بأمان (عرض فقط). */
function surahData_nameArabic(name: string | undefined): string {
  return name ?? '';
}

/**
 * FlatList أفقي pagingEnabled للصفحات — virtualization حقيقي: صفحات قليلة
 * فقط في الذاكرة، getItemLayout يجعل القفز الأولي/السريع رخيصًا، ولا يوجد
 * أي VirtualizedList داخل ScrollView بنفس الاتجاه (التحذير السببي مُصلح).
 */
/**
 * FlatList أفقي pagingEnabled للصفحات — virtualization حقيقي: صفحات قليلة
 * فقط في الذاكرة، ولا يوجد أي VirtualizedList داخل ScrollView بنفس الاتجاه.
 * حجم العنصر من useWindowDimensions (متزامن دائمًا) — بلا onLayout إطلاقًا،
 * فلا يمكن أن يفشل القياس ويبقى المصحف فارغًا صامتًا (السبب الجذري للعطل).
 * ارتفاع الصفحة: FlatList الأفقي يمدّد أبناءه تلقائيًا ليملأ ارتفاعه (stretch).
 */
function FlatListH({
  pages,
  windowWidth,
  initialPageIndex,
  renderItem,
  onPageChange,
}: {
  pages: PageGroup[];
  windowWidth: number;
  initialPageIndex: number;
  renderItem: (info: { item: PageGroup }) => React.ReactElement;
  onPageChange: (page: number) => void;
}) {
  const viewedRef = useRef<number | null>(null);
  // RN يمنع تغيير onViewableItemsChanged/viewabilityConfig بين الرندرات —
  // تُثبّتان في refs مرة واحدة (وإلا انهار القارئ بـ Invariant Violation).
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 60 });
  const onViewableItemsChangedRef = useRef(({ viewableItems }: { viewableItems: Array<{ item: unknown }> }) => {
    const first = viewableItems[0]?.item as PageGroup | undefined;
    if (first && viewedRef.current !== first.page) {
      viewedRef.current = first.page;
      onPageChangeRef.current(first.page);
    }
  });

  return (
    <FlatList
      data={pages}
      keyExtractor={(item) => `page-${item.page}`}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      initialNumToRender={1}
      initialScrollIndex={initialPageIndex > 0 ? initialPageIndex : undefined}
      getItemLayout={(_, index) => ({
        length: windowWidth || 1,
        offset: (windowWidth || 1) * index,
        index,
      })}
      onViewableItemsChanged={onViewableItemsChangedRef.current}
      viewabilityConfig={viewabilityConfigRef.current}
      renderItem={(info) => (
        <View style={{ width: windowWidth }}>
          {renderItem(info)}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  // ارتفاع محدد لمحتوى القارئ — بدون flex:1 هنا تنهار منطقة الصفحات إلى
  // صفر (onLayout لا يعود بأبعاد) فتبقى الصفحة فارغة بلا أي خطأ.
  readerContent: { flex: 1 },
  readerHeader: { alignItems: 'center', flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: spacing.md },
  readerTitle: { alignItems: 'center', flex: 1 },
  surahTitle: { fontSize: typography.h2, fontWeight: '700' },
  readerMeta: { fontSize: typography.caption, marginTop: 4 },
  audioButton: { alignItems: 'center', borderRadius: radii.pill, flexDirection: 'row-reverse', gap: 5, paddingHorizontal: 10, paddingVertical: 9 },
  audioText: { fontSize: typography.caption, fontWeight: '700' },
  statusText: { fontSize: typography.bodySmall, lineHeight: 22, marginBottom: spacing.md, textAlign: 'right' },
  bismillah: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, paddingVertical: spacing.md, marginBottom: spacing.sm },
  bismillahText: { textAlign: 'center' },
  pagesWrap: { flex: 1 },
  pageContainer: { flex: 1 },
  pageScroll: { flex: 1 },
  pageInner: { flexGrow: 1, paddingHorizontal: spacing.xs, paddingTop: spacing.sm },
  mushafText: { textAlign: 'right', writingDirection: 'rtl' },
  ayahSpan: {},
  ayahMarker: { color: '#B8860B' },
  pageFooter: { alignSelf: 'center', fontSize: typography.caption, paddingVertical: spacing.xs },
  fallbackHint: { fontSize: typography.bodySmall, marginTop: spacing.sm, textAlign: 'center' },
  surahListButton: { alignItems: 'center', alignSelf: 'center', borderRadius: radii.pill, flexDirection: 'row-reverse', gap: 6, paddingHorizontal: spacing.lg, paddingVertical: 11 },
  surahListText: { fontSize: typography.bodySmall, fontWeight: '700' },
  sheetBackdrop: { backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: '85%',
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sheetHandle: { alignSelf: 'center', borderRadius: radii.pill, height: 4, marginBottom: spacing.md, width: 44 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row-reverse', justifyContent: 'space-between' },
  sheetTitleCopy: { alignItems: 'flex-end', flex: 1 },
  sheetTitle: { fontSize: typography.h3, fontWeight: '700', textAlign: 'right' },
  sheetSource: { fontSize: typography.caption, marginTop: 2, textAlign: 'right' },
  sheetVerse: { borderRadius: radii.sm, marginTop: spacing.md, padding: spacing.md },
  sheetVerseText: { textAlign: 'right' },
  sheetActions: { alignItems: 'center', flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.md },
  actionButton: { alignItems: 'center', borderRadius: radii.pill, flexDirection: 'row-reverse', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 9 },
  actionText: { fontSize: typography.bodySmall, fontWeight: '700' },
  audioStatus: { fontSize: typography.caption, marginTop: spacing.sm, textAlign: 'right' },
  sheetBody: { marginTop: spacing.md },
  sheetTafsirText: { fontSize: typography.body, lineHeight: 28, textAlign: 'right' },
  remoteAudioHint: { fontSize: typography.caption, fontWeight: '700' },
  readerHint: { fontSize: typography.caption, marginTop: spacing.sm, textAlign: 'center' },
});
