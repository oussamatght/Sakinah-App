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
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioPlayer,
} from 'expo-audio';
import { useFonts, AmiriQuran_400Regular } from '@expo-google-fonts/amiri-quran';
import {
  fetchQuranSurah,
  flattenSurahIntoQuranPages,
  nextAyahPosition,
  quranKeys,
  useGetAyahAudio,
  useGetQuranAudio,
  useGetQuranReader,
  useGetQuranSurahs,
  useGetQuranTafsir,
  type QuranPageGroup,
  type QuranSurah,
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

type PageGroup = QuranPageGroup;

/** أدوات مساعدة للتسطيح (كلها من بيانات الصفحات نفسها — لا مصدر ثانٍ). */
function pageSurahId(group: PageGroup): number {
  const first = group.verses[0];
  return first ? Number(first.verseKey.split(':')[0]) : 0;
}
function pageMinSurah(group: PageGroup): number {
  let min = 115;
  for (const verse of group.verses) {
    const s = Number(verse.verseKey.split(':')[0]);
    if (s < min) min = s;
  }
  return min === 115 ? 0 : min;
}
function pageStartsSurah(group: PageGroup): boolean {
  const min = pageMinSurah(group);
  return min > 0 && group.verses.some((v) => Number(v.verseKey.split(':')[0]) === min && v.verseNumber === 1);
}

/**
 * قارئ المصحف المتصل (Mushaf):
 *  - الصفحات: أرقام صفحات المصحف الحقيقية (verse.page من quran-uthmani) —
 *    لا قسمة نصية ولا إعادة تدفّق؛ كل صفحة حاوية ثابت بنفس الموضع على الشاشة
 *    (عرض الشاشة من useWindowDimensions — بلا قياسات onLayout قابلة للفشل).
 *  - الاستمرارية: التسطيح التدريجي (flattenSurahIntoQuranPages) يدمج صفحات
 *    السور مع بعضها في مسار واحد 1..604 — السورة الطويلة تمتد عبر صفحاتها
 *    الطبيعية، ولا تُحشر السورة في صفحة واحدة أبدًا.
 *  - الترتيب: سورة:آية قانوني (مفتاح مستقر verseKey) — الصفحات للعرض فقط.
 *  - التنقل: سحب أفقي صفحة-بصفحة (pagingEnabled)؛ «قلب الصفحة» للأمام يمدّد
 *    المسار للسورة التالية فقط ب نيّة مستخدم صريحة (حارس userIntent) حتى لا
 *    يقفز التلاوة العابرة للسورة صفحاتٍ بنفسها؛ التكملة خلف المواضع المفتوحة
 *    من النهاية (أرقام صفحات مبكرة) تتم تلقائيًا best-effort.
 *  - الضغط على آية → Bottom sheet: الآية + التفسير + صوت الآية + المفضلة +
 *    المشاركة (كلها بمفتاح سورة:آية الصحيح حتى على صفحات سورة أخرى).
 *  - آخر موضع: يُحفظ مع رقم الصفحة (pageNum) ويُعاد فتحه على الصفحة نفسها.
 */
export default function QuranReader() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  // أبعاد الشاشة: متزامنة ومضمونة — بلا قياس onLayout قابل للفشل الصامت.
  const { width: windowWidth } = useWindowDimensions();
  const { surah, surahId, ayah, pageNum, openSheet } = useLocalSearchParams<{
    surah?: string;
    surahId?: string;
    ayah?: string;
    pageNum?: string;
    openSheet?: string;
  }>();
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

  // أسماء السور (عرض الهيدر على الصفحات العابرة للسور).
  const surahsQuery = useGetQuranSurahs();
  const chapterNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const chapter of surahsQuery.data ?? []) map.set(chapter.id, chapter.nameArabic);
    return map;
  }, [surahsQuery.data]);

  // "آية 1" حتى أول ضغط؛ الـ sheet يتبع الآية المختارة.
  const [selectedAyah, setSelectedAyah] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(openSheet === '1');
  // آية التلاوة الحالية (null = صامت) — منفصلة عن الاختيار.
  const [playingAyah, setPlayingAyah] = useState<number | null>(null);
  // آخر موضع محفوظ (يُقرأ مرة للتموضع) ثم يُفعَّل العرض.
  const [resume, setResume] = useState<{ ayah: number } | null>(null);
  const [resumeLoaded, setResumeLoaded] = useState(false);
  // الصفحة المعروضة (للهيدر).
  const [viewedPage, setViewedPage] = useState<number | null>(null);

  // ---------- مسار المصحف المتصل ----------
  // صفحات السورة الهدف (+ ما قبلها من params) — بذرة المسار من العنوان نفسه.
  const targetSurahId = validId ? id : 0;
  const targetAyah = useMemo(() => {
    const n = Number(ayah);
    return Number.isInteger(n) && n >= 1 && n <= 286 ? n : 1;
  }, [ayah]);
  const targetPageNum = useMemo(() => {
    const n = Number(pageNum);
    return Number.isInteger(n) && n >= 1 && n <= 604 ? n : null;
  }, [pageNum]);

  // مسار الصفحات يبدأ فارغًا ويمتلئ بالتسطيح عند وصول بيانات السورة
  // (نفس ذاكرة useQuery — لا طلب ثانٍ ولا مصدر بيانات موازٍ).
  const [pages, setPages] = useState<PageGroup[]>([]);
  const [nextSurahId, setNextSurahId] = useState<number | null>(validId && id < 114 ? id + 1 : null);
  const [targetPageIndex, setTargetPageIndex] = useState<number | null>(null);

  // نيّة المستخدم: heartbeats من السحب الفعلي فقط — يمنع «قلب الصفحة» الآلي
  // أثناء عبور التلاوة لسورة أخرى من أن يمدّد المسار ويقلب صفحات تلقائيًا.
  const userIntentRef = useRef(false);
  // تكملة خلفية best-effort: آخر حد حاولنا تجاوزه (منع تكرار المحاولات).
  const backwardAttemptRef = useRef<number | null>(null);
  // عبور سورة (تلاوة متصلة): {surah} السورة التالية التي سنفتحها.
  const [crossing, setCrossing] = useState<number | null>(null);

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
      // userIntent=false: لا «قلب صفحة» آلي أثناء العبور — الصفحة الأولى
      // للسورة الجديدة تُفتح حيث هي.
      userIntentRef.current = false;
      setPlayingAyah(null);
      setSheetOpen(false);
      setCrossing(next.surah);
      router.replace({
        pathname: '/quran-reader',
        params: { surahId: String(next.surah), ayah: String(next.ayah) },
      });
    } else {
      setPlayingAyah(null);
    }
  }, [audioStatus.didJustFinish, playingAyah, id, router]);

  // تسطيح: عند وصول بيانات السورة الحالية ادمج صفحاتها في مسار المصحف.
  useEffect(() => {
    if (!validId || readerQuery.isPending || readerQuery.isError || !readerQuery.data) return;
    setPages((prev) => flattenSurahIntoQuranPages(prev, readerQuery.data!));
  }, [validId, readerQuery.isPending, readerQuery.isError, readerQuery.data]);

  // القفز الأولي: مرة واحدة — إلى صفحة (pageNum) أو صفحة الآية (ayah/1).
  useEffect(() => {
    if (targetPageIndex !== null || pages.length === 0) return;
    const hasTarget =
      pages.some((p) => pageSurahId(p) === targetSurahId) || targetPageNum !== null;
    if (!hasTarget) return;
    let index = -1;
    if (targetPageNum !== null) {
      index = pages.findIndex((p) => p.page === targetPageNum);
    } else {
      index = pages.findIndex(
        (p) => pageSurahId(p) === targetSurahId && p.verses.some((v) => v.verseNumber === targetAyah),
      );
      if (index < 0) {
        index = pages.findIndex((p) => pageSurahId(p) === targetSurahId);
      }
    }
    if (index < 0) return;
    setTargetPageIndex(index);
  }, [pages, targetPageIndex, targetSurahId, targetAyah, targetPageNum]);

  // تكملة خلفية best-effort: فُتح موضع صفحاته قبل بداية المسار المدموج
  // (pageNum مبكر أو سورة فُتحت من منتصفها) — نستدعي السور السابقة تباعًا
  // حتى تُدمج صفحتها (ولو فشلت الشبكة يبقى المسار الحالي سليمًا).
  useEffect(() => {
    if (pages.length === 0 || targetPageIndex !== null) return;
    const flatMin = Math.min(...pages.map((p) => p.page));
    const wanted =
      targetPageNum !== null && targetPageNum < flatMin
        ? targetPageNum
        : targetPageNum === null && pages[0] && pageMinSurah(pages[0]) !== pageSurahId(pages[0])
          ? flatMin
          : null;
    if (wanted === null || wanted >= flatMin) return;
    if (flatMin <= 1) return;
    const prevSurahId = pageSurahId(pages[0]) - 1;
    if (prevSurahId < 1) return;
    if (backwardAttemptRef.current === prevSurahId) return;
    backwardAttemptRef.current = prevSurahId;
    void queryClient
      .fetchQuery({
        queryKey: quranKeys.surah(prevSurahId),
        queryFn: () => fetchQuranSurah(prevSurahId),
        staleTime: Infinity,
      })
      .then((surah) => setPages((prev) => flattenSurahIntoQuranPages(prev, surah)))
      .catch(() => undefined);
  }, [pages, targetPageIndex, targetPageNum, queryClient]);

  // استئناف التلاوة بعد عبور سورة: عند اكتمال بيانات السورة الجديدة شغّل
  // آية البدء عبر المسار القياسي نفسه (query صوت الآية → replace → play).
  useEffect(() => {
    if (crossing === null) return;
    if (!validId || id !== crossing) return;
    if (readerQuery.isPending || readerQuery.isError || !readerQuery.data) return;
    setCrossing(null);
    finishedAyahRef.current = null;
    setSelectedAyah(1);
    setPlayingAyah(1);
  }, [crossing, validId, id, readerQuery.isPending, readerQuery.isError, readerQuery.data]);

  // آخر موضع: قرأته مرة للتموضع، ثم حفظ تلقائي عند كل فتح/اختيار.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const position = await getReadingPosition();
        if (!active || !position || position.surahId !== id) {
          setResume({ ayah: 1 });
          return;
        }
        setResume({ ayah: position.ayahNumber });
      } catch {
        if (active) setResume({ ayah: 1 });
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
    if (!validId || !resumeLoaded || !resume) return;
    void saveReadingPosition({
      surahId: id,
      surahName: surah,
      ayahNumber: selectedAyah,
      pageNum: viewedPage ?? undefined,
    });
  }, [validId, id, surah, selectedAyah, viewedPage, resumeLoaded, resume]);

  const onAyahPress = useCallback(
    (verseSurahId: number, verseNumber: number) => {
      setSelectedAyah(verseNumber);
      setSheetOpen(true);
      if (verseSurahId !== id) {
        // آية على صفحة سورة أخرى: إعادة تثبيت المسار على سورتها — يبقى
        // التفسير/الصوت/المفضلة بمفاتيح سورة:آية الصحيحة.
        userIntentRef.current = true;
        router.replace({
          pathname: '/quran-reader',
          params: { surahId: String(verseSurahId), ayah: String(verseNumber), openSheet: '1' },
        });
      }
    },
    [id, router],
  );

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
        message: `${verse.text}\n﴿${toArabicDigits(verse.verseNumber)}﴾ ${readerQuery.data?.nameArabic ?? ''} — الآية ${verse.verseNumber}`,
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
    // فشل فتح آخر موضع لا يترك المستخدم في طريق مسدود.
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
  const chapterAudioLabel = chapterAudioQuery.isPending
    ? 'جارٍ تجهيز الصوت'
    : chapterAudioQuery.isError
      ? 'تعذر تحميل الصوت'
      : 'استماع للسورة كاملة';

  // سورة الصفحة المعروضة (للهيدر والبسملة) — قد تختلف عن سورة المسار.
  const viewedGroup = pages.find((p) => p.page === viewedPage);
  const headerSurahId = viewedGroup ? pageMinSurah(viewedGroup) || id : id;
  const headerSurahName = chapterNames.get(headerSurahId) ?? surahData.nameArabic ?? surah ?? 'القرآن الكريم';
  const showBismillahBanner = headerSurahId !== 1 && headerSurahId !== 9;

  // هل آية التلاوة الحالية معروضة على الصفحة الظاهرة؟
  const playedVerse = playingAyah !== null ? verses.find((v) => v.verseNumber === playingAyah) : undefined;
  const isAyahOnViewedPage =
    playingAyah === null || viewedPage === null || playedVerse?.page === viewedPage;

  const renderItem = ({ item }: { item: PageGroup }) => {
    const pageSurah = pageSurahId(item);
    const startsSurah = pageStartsSurah(item);
    return (
      <View style={styles.pageContainer}>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.pageScroll}>
          <View style={styles.pageInner}>
            {/* ترويسة السورة داخل الصفحة: عند بدء سورة في منتصف مسار الصفحات */}
            {startsSurah ? (
              <View style={styles.surahStartBanner}>
                <Text style={[styles.surahStartName, { color: colors.primary }]}>
                  سورة {chapterNames.get(pageSurah) ?? ''}
                </Text>
              </View>
            ) : null}
            {/* نص متصل: آيات متتابعة داخل Text واحد — span لكل آية قابل للضغط */}
            <Text
              style={[
                styles.mushafText,
                { fontSize: mushafSize, lineHeight: mushafLineHeight, color: colors.foreground },
              ]}>
              {item.verses.map((verse) => {
                const verseSurah = Number(verse.verseKey.split(':')[0]);
                const isPlaying = id === verseSurah && playingAyah === verse.verseNumber;
                const isSelected =
                  sheetOpen && id === verseSurah && selectedAyah === verse.verseNumber && !isPlaying;
                return (
                  <Text
                    key={verse.verseKey}
                    testID={`ayah-${verse.verseNumber}`}
                    onPress={() => onAyahPress(verseSurah, verse.verseNumber)}
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
  };

  return (
    <Screen scroll={false} contentStyle={styles.readerContent}>
      <View style={styles.readerHeader}>
        <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
        <View style={styles.readerTitle}>
          <Text style={[styles.surahTitle, { color: colors.foreground }]}>{headerSurahName}</Text>
          <Text style={[styles.readerMeta, { color: colors.mutedForeground }]}>
            {viewedPage ? `صفحة ${toArabicDigits(viewedPage)}` : `${surahData.versesCount} آية`}
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
        <Text style={[styles.statusText, { color: colors.mutedForeground }]}>لا توجد آيات متاحة.</Text>
      ) : (
        <View style={styles.pagesWrap}>
          <FlatListH
            pages={pages}
            windowWidth={windowWidth}
            initialPageIndex={targetPageIndex ?? 0}
            renderItem={renderItem}
            onPageChange={(page) => setViewedPage(page)}
            onNearEnd={() => {
              // «قلب الصفحة» نحو النهاية = نيّة مستخدم صريحة: يُمدّ المسار
              // إلى السورة التالية (مرة واحدة لكل صفحة نهاية).
              userIntentRef.current = true;
              const last = pages[pages.length - 1];
              if (!last || nextSurahId) return;
              const nextId = pageSurahId(last) + 1;
              if (nextId > 114) return;
              setNextSurahId(nextId);
              const apply = (data: QuranSurah) => {
                setPages((prev) => flattenSurahIntoQuranPages(prev, data));
                setNextSurahId(null);
              };
              const cached = queryClient.getQueryData<QuranSurah>(quranKeys.surah(nextId));
              if (cached) {
                apply(cached);
                return;
              }
              void queryClient
                .fetchQuery({
                  queryKey: quranKeys.surah(nextId),
                  queryFn: () => fetchQuranSurah(nextId),
                  staleTime: Infinity,
                })
                .then(apply)
                .catch(() => setNextSurahId(null));
            }}
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
        اضغط أي آية للتفسير والصوت والمفضلة • اسحب لقلب الصفحات
      </Text>
    </Screen>
  );
}

/**
 * FlatList أفقي pagingEnabled للصفحات — virtualization حقيقي: صفحات قليلة
 * فقط في الذاكرة، ولا يوجد أي VirtualizedList داخل ScrollView بنفس الاتجاه.
 * حجم العنصر من useWindowDimensions (متزامن دائمًا) — بلا onLayout إطلاقًا،
 * فلا يمكن أن يفشل القياس ويبقى المصحف فارغًا صامتًا (السبب الجذري للعطل).
 * كل صفحة تشغل نفس الموضع بالضبط: عرض العنصر = عرض الشاشة، والارتفاع يتمدد
 * داخل حاوية القائمة (لا يعتمد موضع صفحةٍ في كثافة نص صفحة أخرى).
 */
function FlatListH({
  pages,
  windowWidth,
  initialPageIndex,
  renderItem,
  onPageChange,
  onNearEnd,
}: {
  pages: PageGroup[];
  windowWidth: number;
  initialPageIndex: number;
  renderItem: (info: { item: PageGroup }) => React.ReactElement;
  onPageChange: (page: number) => void;
  onNearEnd: () => void;
}) {
  const viewedRef = useRef<number | null>(null);
  // RN يمنع تغيير onViewableItemsChanged/viewabilityConfig بين الرندرات —
  // تُثبّتان في refs مرة واحدة (وإلا انهار القارئ بـ Invariant Violation).
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const onNearEndRef = useRef(onNearEnd);
  onNearEndRef.current = onNearEnd;
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
      onEndReached={() => onNearEndRef.current()}
      onEndReachedThreshold={0.35}
      renderItem={(info) => (
        <View style={{ width: windowWidth }}>
          {renderItem(info)}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  // ارتفاع محدد لمحتوى القارئ — بدون flex:1 هنا تنهار منطقة الصفحات إلى صفر.
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
  surahStartBanner: { alignItems: 'center', marginBottom: spacing.xs },
  surahStartName: { fontSize: typography.bodySmall, fontWeight: '700' },
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
