import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
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
  DEFAULT_RECITER_ID,
  fetchAyahAudio,
  groupQuranVersesByPage,
  nextAyahPosition,
  quranKeys,
  useGetAyahAudio,
  useGetQuranAudio,
  useGetQuranReader,
  useGetQuranTafsir,
  type QuranVerse,
} from '@/lib/api';
import {
  FONT_SCALES,
  FONT_SCALE_LABELS,
  getReadingPosition,
  saveReadingPosition,
  type ReadingPosition,
} from '@/lib/storage';
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
import { getQuranAudioLocalUri, isQuranDownloaded, offlineSupported, storeLocalSurah } from '@/lib/offline/quranDb';

/** أرقام عربية للعلامات (عرض فقط — نص الآيات كما هو من الـ API حرفيًا). */
function toArabicDigits(value: number): string {
  return String(value).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
}

/** خط المصحف — حجمه البصري أصغر من Inter فنرفع الأساس قليلًا (٣١ مكافئ). */
const MUSHAF_BASE = Math.round(typography.quranLarge * 1.15);
/** اسم عائلة الخط كما سُجل في useFonts (مفتاح التحميل نفسه). */
const MUSHAF_FONT = 'AmiriQuran_400Regular';
/** لون ذهبي هادئ لعلامة نهاية الآية. */
const MARKER_GOLD = '#B8860B';

/** وضع التلاوة: آية واحدة فقط، أو متتابع حتى آخر السورة، أو السورة كاملة (ملف واحد). */
type PlayMode = 'single' | 'sequential' | 'surah';
/** عنصر قائمة القراءة: إما صف آية أو فاصل صفحة مصحف (عرض فقط، لا يُقسَّم المحتوى). */
type ReadingItem =
  | { key: string; type: 'page'; page: number }
  | { key: string; type: 'verse'; verse: QuranVerse };

/**
 * قارئ المصحف المستمر:
 *  - سورة واحدة = صفحة قراءة واحدة متصلة: كل آياتها 1..N في قائمة رأسية واحدة
 *    (FlatList) بلا تقليب صفحات أفقي وبلا صور صفحات إطلاقًا.
 *  - النص حرفيًا من المصدر (quran-uthmani)؛ الرقم القانوني سورة:آية هو مفتاح
 *    التلاوة والتنقّل والحفظ، والفواصل بين صفحات المصحف للعرض فقط.
 *  - الصوت: آية محددة عند النقر، أو متتابع (استئناف تلقائي إلى آخر السورة)
 *    مع مسبق تحميل الآية التالية؛ السورة الحالية هي الوحيدة المعروضة فلا يُقفز
 *    بين السور تلقائيًا، ولا تتسرّب آيات سورة أخرى مهما حدث.
 *  - الحجم: A−/A+ يكتبان fontScale في المتجر المشترك المُخزَّن، بلا إعادة
 *    تركيب القائمة ولا فقدان الموضع (إعادة تثبيت على آية المرساة بعد إعادة التدفق).
 *  - المتابعة: آخر موضع يُحفظ بترددات (debounce) ويُفرَّغ عند مغادرة الشاشة،
 *    وتُستعاد آية الموضع/رقم الصفحة/الآية المطلوبة عند الفتح.
 */
export default function QuranReader() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  // fontScale من المتجر المشترك (الإعدادات تحدّث هذه الشاشة فورًا وبلا إعادة تركيب).
  const { settings, save } = useSettings();
  const fontScale = settings.fontScale;
  const mushafSize = Math.round(MUSHAF_BASE * fontScale);
  const mushafLineHeight = Math.round(mushafSize * 2);
  const bannerSize = Math.round(typography.quranMedium * 1.2 * fontScale);
  const sheetVerseSize = Math.round(typography.quranMedium * fontScale);
  const sheetVerseLineHeight = Math.round(sheetVerseSize * 1.9);

  const params = useLocalSearchParams<{
    surah?: string;
    surahId?: string;
    ayah?: string;
    pageNum?: string;
  }>();
  const { surah, surahId, ayah, pageNum } = params;
  const id = Number(surahId);
  const validId = Number.isInteger(id) && id >= 1 && id <= 114;
  const surahName = surah ?? '';
  // القارئ المختار من الإعدادات — يُمرَّر لكل طلب صوت (تغييره يُغيّر مفتاح
  // الكاش فيعيد جلب الصوت وعزفه بالقارئ الجديد فعلًا).
  const reciterId = Math.round(settings.reciterId) || DEFAULT_RECITER_ID;

  // خط أميري قرآن — يدعم الحركات/الشدة/المد/الهمزات/علامات الوقف كاملة.
  const [fontsLoaded, fontError] = useFonts({ AmiriQuran_400Regular });

  const readerQuery = useGetQuranReader(validId ? id : 0, {
    query: { enabled: validId },
  });

  // ---------- حالة القراءة ----------
  // الآية المختارة (بداية التلاوة الافتراضية = 1 حتى أول اختيار فعلي).
  const [selectedAyah, setSelectedAyah] = useState(1);
  // آية لوحة التفاصيل (تظهر عند الضغط المطول). منفصلة عن التلاوة.
  const [sheetAyah, setSheetAyah] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  // آية التلاوة الحالية (null = صامت) — منفصلة تمامًا عن حالة القراءة.
  const [playingAyah, setPlayingAyah] = useState<number | null>(null);
  const [mode, setMode] = useState<PlayMode>('single');
  // آخر موضع محفوظ (يُقرأ مرة للتموضع).
  const [resumeLoaded, setResumeLoaded] = useState(false);
  // القائمة جاهزة للعرض بعد تحديد آية الفتح (تمنع وميض "أول السورة").
  const [listReady, setListReady] = useState(false);
  // الآية/الصفحة المعروضة في الهيدر (تتحدث عند تغيير أول آية ظاهرة).
  const [viewInfo, setViewInfo] = useState({ ayah: 1, page: 0 });

  const listRef = useRef<FlatList<ReadingItem> | null>(null);
  const resumeRef = useRef<ReadingPosition | null>(null);
  const readyIndexRef = useRef<number | null>(null);
  // مراسي التنقل داخل القائمة بلا إعادة تركيب.
  const viewedAyahNumberRef = useRef(1);
  const lastVisibleRef = useRef(1);
  const lastVisiblePageRef = useRef(0);
  const visibleAyahsRef = useRef<Set<number>>(new Set());
  const retryIndexRef = useRef<number | null>(null);
  const pendingAnchorRef = useRef<number | null>(null);
  const prevFontScaleRef = useRef(settings.fontScale);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // جواز الحفظ: يظل مغلقًا حتى تظهر آية المرساة (موضع الفتح) في الرؤية فعليًا.
  // يمنع تسريب "آية 1" الابتدائية إلى آخر موضع محفوظ أثناء نافذة الاستعادة
  // (المشهد يُركَّب أعلى القائمة ثم يُمرَّر إلى المرساة بعد قياس الصفوف).
  const persistReadyRef = useRef(false);
  // آية المرساة المطلوب استعادتها — تُصفَّر بمجرد وصولها إلى الرؤية.
  const restoreTargetRef = useRef<number | null>(null);
  const audioModeConfigured = useRef(false);

  // آية تعليق التلاوة الحالية (لكل الآيات المعروضة داخل الصفوف المعلّمة).
  const playingAyahRef = useRef<number | null>(null);
  useEffect(() => {
    playingAyahRef.current = playingAyah;
  }, [playingAyah]);

  // مشغل واحد يُعاد استخدامه لكل الآيات (replace عند تغيير الآية).
  const player: AudioPlayer = useAudioPlayer(undefined);
  const audioStatus = useAudioPlayerStatus(player);
  // حالة مصدر الصوت المُحمَّل في المشغّل: {مفتاح الآية, الرابط}.
  const playerStateRef = useRef<{ key: string; url: string } | null>(null);
  // هل بدأ الصوت الحالي فعليًا في اللعب؟ (يمنع قبول didJustFinish الزائف القديم
  // فور تحميل مصدر جديد — سبب قفزة "الآية بعد التالية" في الوضع المتتابع).
  const armedRef = useRef(false);
  // حراسة النهاية: didJustFinish يبقى true حتى بداية صوت جديد — نمنع القفز المزدوج.
  const finishedAyahRef = useRef<number | null>(null);
  // كشف حافة صعود didJustFinish: لا نعالج إلا الانتقال من false إلى true، فبعد
  // replace+play يبقى القديم true مؤقتًا ولا نعتبره نهاية صوت جديد.
  const prevDidJustFinishRef = useRef(false);

  // صوت الآية الجارية وصوت الآية المطلوبة في لوحة التفاصيل.
  const ayahAudioQuery = useGetAyahAudio(validId ? id : 0, playingAyah, reciterId);
  const tafsirQuery = useGetQuranTafsir(validId ? id : 0, sheetAyah, {
    query: { enabled: validId && sheetOpen },
  });
  // صوت السورة كاملة (ملف واحد) لوضع "السورة".
  const surahAudioQuery = useGetQuranAudio(validId ? id : 0, reciterId, {
    query: { enabled: validId },
  });
  const [surahPlaying, setSurahPlaying] = useState(false);
  /** رسالة فشل الصوت (انقطاع/رابط فاسد) بدل استثناء مرفوض صامت. */
  const [audioError, setAudioError] = useState<string | null>(null);

  // عمل المشغّل في الوضع الصامت (مرة واحدة عند أول تشغيل).
  useEffect(() => {
    if ((playingAyah === null && !surahPlaying) || audioModeConfigured.current) return;
    audioModeConfigured.current = true;
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, [playingAyah, surahPlaying]);

  /**
   * فشل جلب رابط الصوت: نُظهر رسالة بدل ترك الاستثناء مرفوضًا.
   *Offline نُميّزه ليقول "بدون إنترنت" بدل رسالة عامة.
   */
  useEffect(() => {
    if (!ayahAudioQuery.isError) return;
    setAudioError(
      isOfflineError(ayahAudioQuery.error)
        ? 'لا يوجد اتصال — التلاوة بالآية تحتاج إنترنت. صوت السورة الكامل يعمل بدون إنترنت إن كان منزَّلًا.'
        : 'تعذّر جلب صوت هذه الآية، حاول مجددًا.',
    );
  }, [ayahAudioQuery.isError, ayahAudioQuery.error]);

  /** زر إعادة المحاولة الصامت: نفس المفتاح ⇒ يعيد الجلب من جديد. */
  const retryAyahAudio = useCallback(() => {
    setAudioError(null);
    void ayahAudioQuery.refetch().catch(() => undefined);
  }, [ayahAudioQuery]);

  // البيانات الآمنة: آيات مُفرزة وخالية من التكرار (تحقق fetchQuranSurah).
  const readerData = readerQuery.data;
  const verses = readerData?.verses ?? [];

  // عناصر القائمة: فاصل صفحة مصحف ("— صفحة N —") ثم آياتها بالترتيب، فالقائمة
  // رأسية واحدة مستمرة (لا تقليب ولا صور صفحات) وفواصل العرض لا تقسّم المحتوى.
  const listItems = useMemo<ReadingItem[]>(() => {
    const items: ReadingItem[] = [];
    for (const group of groupQuranVersesByPage(verses)) {
      items.push({ key: `page-${group.page}`, type: 'page', page: group.page });
      for (const verse of group.verses) {
        items.push({ key: verse.verseKey, type: 'verse', verse });
      }
    }
    return items;
  }, [verses]);
  // فهرس الآية داخل عناصر القائمة (إزاحات فواصل الصفحات تُحسب هنا تلقائيًا).
  const indexOfAyah = useCallback(
    (n: number) =>
      listItems.findIndex(
        (item) => item.type === 'verse' && item.verse.verseNumber === n,
      ),
    [listItems],
  );

  // ---------- التلاوة ----------
  // عند وصول رابط صوت الآية: حمّله في المشغّل وشغّله فورًا. شرط المفتاح يمنع
  // تشغيل رابط آية سابقة مع آية جديدة (استقرار الحالة، لا إعادة تركيب).
  useEffect(() => {
    if (playingAyah === null || surahPlaying) return;
    const key = `${reciterId}:${id}:${playingAyah}`;
    if (playerStateRef.current?.key === key) return;
    if (ayahAudioQuery.isPending || !ayahAudioQuery.data) return;
    playerStateRef.current = { key, url: ayahAudioQuery.data.audioUrl };
    finishedAyahRef.current = null;
    armedRef.current = false;
    prevDidJustFinishRef.current = false;
    setAudioError(null);
    player.replace({ uri: ayahAudioQuery.data.audioUrl });
    player.play();
  }, [player, playingAyah, id, reciterId, surahPlaying, ayahAudioQuery.isPending, ayahAudioQuery.data, setAudioError]);

  // صوت السورة كاملة: شغّل الملف المحلي إن كان منزَّلًا (تلاوة كاملة بلا إنترنت)،
  // وإلا فحمّل رابط السورة من الشبكة وشغّله. كان التأثير ينتظر نجاح
  // surahAudioQuery أولًا، فسورة mp3 منزَّلة كانت لا تزال تتطلب اتصالًا حيًّا —
  // أي أن مسار "التشغيل بدون إنترنت" كان موجودًا في التخزين لكنه غير مستخدم.
  useEffect(() => {
    if (!surahPlaying) return;
    const key = `surah:${reciterId}:${id}`;
    if (playerStateRef.current?.key === key) return;

    const localUri = offlineSupported() ? getQuranAudioLocalUri(id, reciterId) : null;
    if (localUri) {
      playerStateRef.current = { key, url: localUri };
      finishedAyahRef.current = null;
      armedRef.current = false;
      prevDidJustFinishRef.current = false;
      player.replace({ uri: localUri });
      player.play();
      return;
    }

    if (surahAudioQuery.isPending || !surahAudioQuery.data) return;
    playerStateRef.current = { key, url: surahAudioQuery.data.audioUrl };
    finishedAyahRef.current = null;
    armedRef.current = false;
    prevDidJustFinishRef.current = false;
    player.replace({ uri: surahAudioQuery.data.audioUrl });
    player.play();
  }, [player, surahPlaying, id, reciterId, surahAudioQuery.isPending, surahAudioQuery.data]);

  // هل بدأ الصوت الحالي في اللعب فعلًا؟ (نُسلّح حراسة النهاية عند أول خرج فعلي).
  useEffect(() => {
    if (audioStatus.playing) armedRef.current = true;
  }, [audioStatus.playing]);

  // مسبق تحميل الآية التالية في الوضع المتتابع — لا انقطاع بين الآيات.
  useEffect(() => {
    if (mode !== 'sequential' || playingAyah === null) return;
    const next = nextAyahPosition({ surah: id, ayah: playingAyah });
    if (next && next.surah === id) {
      // prefetchQuery يرفض الوعد عند فشل الشبكة، و`void` وحده يترك رفضًا
      // بلا مُعالج ⇒ "Uncaught (in promise)". نُسكته صراحةً.
      void queryClient
        .prefetchQuery({
          queryKey: quranKeys.ayahAudio(id, next.ayah, reciterId),
          queryFn: () => fetchAyahAudio(id, next.ayah, reciterId),
          staleTime: 12 * 60 * 60 * 1000,
          retry: 0,
        })
        .catch(() => undefined);
    }
  }, [mode, playingAyah, id, reciterId, queryClient]);

  /**
   * نهاية الصوت: نعالج حافة الصعود فقط didJustFinish (false→true) بعد أن بدأ
   * الصوت فعلًا (armed). في وضع "الآية" نتوقف؛ في "متتابع" ننتقل إلى الآية
   * التالية قانونيًا (سورة:آية) حتى آخر آية في السورة ثم نتوقف؛ في "السورة"
   * نُنهي تلاوة الملف كاملًا. لا عبور تلقائي بين السور أبدًا.
   */
  useEffect(() => {
    const didFinish = audioStatus.didJustFinish;
    if (didFinish === prevDidJustFinishRef.current) return;
    prevDidJustFinishRef.current = didFinish;
    if (!didFinish) return;
    if (!armedRef.current) return;
    if (surahPlaying) {
      setSurahPlaying(false);
      return;
    }
    if (playingAyah === null) return;
    if (finishedAyahRef.current === playingAyah) return;
    finishedAyahRef.current = playingAyah;
    if (mode === 'single') {
      setPlayingAyah(null);
      return;
    }
    const next = nextAyahPosition({ surah: id, ayah: playingAyah });
    if (next && next.surah === id) {
      setPlayingAyah(next.ayah);
      setSelectedAyah(next.ayah);
    } else {
      setPlayingAyah(null);
    }
  }, [audioStatus.didJustFinish, surahPlaying, playingAyah, mode, id]);

  // بدء/إيقاف تلاوة آية — قارئ مستقر: يقرأ player.playing مباشرة (بلا اشتراك
  // متكرر) فيبقى النداء ثابت الهوية فلا تشتغل ذاكرة الصفوف بلا داعٍ.
  const toggleAyahAudio = useCallback(
    (n: number) => {
      setSelectedAyah(n);
      if (surahPlaying) {
        player.pause();
        setSurahPlaying(false);
      }
      const key = `${reciterId}:${id}:${n}`;
      const current = playingAyahRef.current;
      if (current === n && playerStateRef.current?.key === key) {
        if (player.playing) {
          player.pause();
          return;
        }
        finishedAyahRef.current = null;
        armedRef.current = false;
        prevDidJustFinishRef.current = false;
        player.play();
        return;
      }
      if (current !== null) player.pause();
      playerStateRef.current = null;
      finishedAyahRef.current = null;
      armedRef.current = false;
      prevDidJustFinishRef.current = false;
      setPlayingAyah(n);
    },
    [id, reciterId, player, surahPlaying],
  );

  // تشغيل/إيقاف السورة كاملة (وضع "السورة"): عند البدء نُنهي أي تلاوة آية.
  const toggleSurahAudio = useCallback(() => {
    if (surahPlaying) {
      if (player.playing) {
        player.pause();
        return;
      }
      armedRef.current = false;
      prevDidJustFinishRef.current = false;
      player.play();
      return;
    }
    if (playingAyahRef.current !== null) player.pause();
    playerStateRef.current = null;
    setPlayingAyah(null);
    setSurahPlaying(true);
  }, [player, surahPlaying]);

  const stopAudio = useCallback(() => {
    player.pause();
    playerStateRef.current = null;
    finishedAyahRef.current = null;
    armedRef.current = false;
    prevDidJustFinishRef.current = false;
    setPlayingAyah(null);
    setSurahPlaying(false);
  }, [player]);

  // تبديل وضع التلاوة: يُوقف أي تلاوة جارية قبل الانتقال (مشترك واحد للصوت).
  const selectMode = useCallback(
    (m: PlayMode) => {
      if (m === mode) return;
      if (playingAyah !== null || surahPlaying) {
        player.pause();
        playerStateRef.current = null;
        finishedAyahRef.current = null;
        armedRef.current = false;
        prevDidJustFinishRef.current = false;
        setPlayingAyah(null);
        setSurahPlaying(false);
      }
      setMode(m);
    },
    [mode, playingAyah, surahPlaying, player],
  );

  // ---------- تفاعلات الآية ----------
  // نقرة = تشغيل الآية نفسها تمامًا (بداية دقيقة من الآية المختارة).
  const handleAyahPress = useCallback(
    (n: number) => {
      toggleAyahAudio(n);
    },
    [toggleAyahAudio],
  );
  // ضغطة مطولة = لوحة التفاصيل (تفسير/مفضلة/مشاركة) — بلا تشغيل قسري.
  const handleAyahLongPress = useCallback((n: number) => {
    setSelectedAyah(n);
    setSheetAyah(n);
    setSheetOpen(true);
  }, []);

  // ---------- حجم الخط ----------
  const fontScaleIndex = FONT_SCALES.indexOf(settings.fontScale as (typeof FONT_SCALES)[number]);
  const stepFont = useCallback(
    (direction: -1 | 1) => {
      const base = fontScaleIndex >= 0 ? fontScaleIndex : FONT_SCALES.indexOf(1);
      const next = Math.min(FONT_SCALES.length - 1, Math.max(0, base + direction));
      if (next !== base) void save({ fontScale: FONT_SCALES[next] });
    },
    [fontScaleIndex, save],
  );

  // تغيير الحجم: لا إعادة تركيب ولا قفز للأول — نثبّت المشهد على آية المرساة
  // بعد إعادة التدفق (onContentSizeChange) بما أن ارتفاع الصفوف يتغير.
  useEffect(() => {
    if (prevFontScaleRef.current === settings.fontScale) return;
    prevFontScaleRef.current = settings.fontScale;
    if (!listReady) return;
    pendingAnchorRef.current = viewedAyahNumberRef.current;
  }, [settings.fontScale, listReady]);

  // ---------- آخر موضع (استئناف) ----------
  useEffect(() => {
    let active = true;
    setResumeLoaded(false);
    void (async () => {
      let position: ReadingPosition | null = null;
      try {
        position = await getReadingPosition();
      } catch {
        position = null;
      }
      if (!active) return;
      resumeRef.current = position;
      setResumeLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  // حساب آية الفتح مرة واحدة: pageNum ← أول آية في الصفحة، ثم ayah، ثم آخر موضع.
  useEffect(() => {
    if (!validId) return;
    if (readerQuery.isPending || readerQuery.isError || !readerQuery.data) return;
    if (!fontsLoaded && !fontError) return;
    if (!resumeLoaded) return;
    if (listReady) return;

    const verseList = readerQuery.data.verses;
    if (verseList.length === 0) {
      setListReady(true);
      return;
    }
    let target = 1;
    const page = Number(pageNum);
    if (Number.isInteger(page) && page >= 1 && page <= 604) {
      // الصفحات: خريطة صفحة → أول آية تقع عليها (لا نفتح صفحة فارغة).
      const match = verseList.find((verse) => verse.page === page);
      target = match ? match.verseNumber : 1;
    } else {
      const ayahNum = Number(ayah);
      if (Number.isInteger(ayahNum) && ayahNum >= 1) {
        target = Math.min(ayahNum, readerQuery.data.versesCount || ayahNum);
      } else if (
        resumeRef.current &&
        resumeRef.current.surahId === id &&
        resumeRef.current.ayahNumber >= 1
      ) {
        target = Math.min(resumeRef.current.ayahNumber, readerQuery.data.versesCount || 1);
      }
    }

    const idx = indexOfAyah(target);
    const anchorVerse = verseList.find((verse) => verse.verseNumber === target);
    readyIndexRef.current = idx;
    viewedAyahNumberRef.current = anchorVerse?.verseNumber ?? 1;
    lastVisibleRef.current = anchorVerse?.verseNumber ?? 1;
    lastVisiblePageRef.current = anchorVerse?.page ?? 0;
    // قفل الحفظ حتى تظهر المرساة فعلًا (استئناف موثوق — لا كتابة فوق الموضع).
    persistReadyRef.current = false;
    restoreTargetRef.current = anchorVerse?.verseNumber ?? 1;
    setSelectedAyah(anchorVerse?.verseNumber ?? 1);
    setViewInfo({ ayah: anchorVerse?.verseNumber ?? 1, page: anchorVerse?.page ?? 0 });
    setListReady(true);
  }, [
    validId,
    pageNum,
    ayah,
    id,
    readerQuery.isPending,
    readerQuery.isError,
    readerQuery.data,
    fontsLoaded,
    fontError,
    resumeLoaded,
    listReady,
  ]);

  // التمرير الأول الدقيق إلى آية الفتح (مرة واحدة بعد تركيب القائمة).
  useEffect(() => {
    if (!listReady) return;
    const idx = readyIndexRef.current;
    if (idx === null || idx <= 0) return;
    readyIndexRef.current = null;
    if (idx < listItems.length) {
      listRef.current?.scrollToIndex({ index: idx, viewPosition: 0, animated: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listReady]);

  // حفظ الموضع بتردد ثم فراغ فوري عند مغادرة الشاشة (بلا سجلّات متكررة).
  const persistPosition = useCallback(() => {
    // بلا موضع فتح ظاهر لا يُكتب أي موضع (حماية آخر موضع أثناء الاستعادة).
    if (!persistReadyRef.current) return;
    void saveReadingPosition({
      surahId: id,
      surahName,
      ayahNumber: viewedAyahNumberRef.current,
      pageNum: lastVisiblePageRef.current || undefined,
    });
  }, [id, surahName]);

  useEffect(() => {
    if (!validId || !listReady) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persistPosition(), 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [validId, listReady, viewInfo.ayah, selectedAyah, persistPosition]);

  // فراغ عند الإزالة النهائية (بلا كتابة فوق موضع الاستعادة أثناء نافذة الفتح).
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!persistReadyRef.current) return;
      void saveReadingPosition({
        surahId: id,
        surahName,
        ayahNumber: viewedAyahNumberRef.current,
        pageNum: lastVisiblePageRef.current || undefined,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, surahName]);

  // ---------- المتابعة التلقائية للآية الجارية ----------
  useEffect(() => {
    if (playingAyah === null || !listReady) return;
    const idx = indexOfAyah(playingAyah);
    if (idx < 0) return;
    if (visibleAyahsRef.current.has(playingAyah)) return;
    listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.35, animated: true });
  }, [playingAyah, listReady, indexOfAyah]);

  // ---------- معالجات القائمة (مراجع ثابتة — RN يمنع تغييرها بين الرندرات) ----------
  const rowEstimateRef = useRef(120);
  rowEstimateRef.current = mushafLineHeight + spacing.md;

  const onViewableItemsChangedRef = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: unknown }> }) => {
      if (!viewableItems || viewableItems.length === 0) return;
      const visible = new Set<number>();
      let firstVerse: QuranVerse | undefined;
      for (const entry of viewableItems) {
        const reading = entry.item as ReadingItem | undefined;
        if (reading?.type !== 'verse') continue;
        if (!firstVerse) firstVerse = reading.verse;
        visible.add(reading.verse.verseNumber);
      }
      visibleAyahsRef.current = visible;
      // المرساة ظهرت → فُتح الموضع المطلوب فعلًا → يُسمح بالحفظ من الآن.
      if (restoreTargetRef.current !== null && visible.has(restoreTargetRef.current)) {
        restoreTargetRef.current = null;
        persistReadyRef.current = true;
      }
      if (!firstVerse) return;
      if (viewedAyahNumberRef.current === firstVerse.verseNumber) return;
      viewedAyahNumberRef.current = firstVerse.verseNumber;
      lastVisibleRef.current = firstVerse.verseNumber;
      lastVisiblePageRef.current = firstVerse.page;
      setViewInfo({ ayah: firstVerse.verseNumber, page: firstVerse.page });
    },
  );
  const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 60 });

  const onScrollToIndexFailedRef = useRef(({ index }: { index: number }) => {
    // بدون getItemLayout (صفوف بارتفاعات متنوعة): نقترب بالتمرير ثم نعيد الدقة
    // عبر onContentSizeChange بعد قياس الصفوف المتاخمة.
    retryIndexRef.current = index;
    listRef.current?.scrollToOffset({
      offset: Math.max(0, index - 2) * rowEstimateRef.current,
      animated: false,
    });
  });

  const handleContentSizeChange = () => {
    if (retryIndexRef.current !== null) {
      const index = retryIndexRef.current;
      retryIndexRef.current = null;
      if (index < listItems.length) {
        listRef.current?.scrollToIndex({ index, viewPosition: 0, animated: false });
      }
      return;
    }
    if (pendingAnchorRef.current !== null) {
      const anchor = pendingAnchorRef.current;
      pendingAnchorRef.current = null;
      const index = indexOfAyah(anchor);
      if (index > 0) listRef.current?.scrollToIndex({ index, viewPosition: 0, animated: false });
    }
  };

  const shareAyah = useCallback(async () => {
    const verse = verses.find((item) => item.verseNumber === sheetAyah);
    if (!verse) return;
    try {
      await Share.share({
        message: `${verse.text}\n﴿${toArabicDigits(verse.verseNumber)}﴾ ${readerData?.nameArabic ?? ''} — الآية ${verse.verseNumber}`,
      });
    } catch {
      // المشاركة اختيارية — إلغاء المستخدم ليس خطأ.
    }
  }, [verses, sheetAyah, readerData?.nameArabic]);

  // ---------- بحث/انتقال داخل السورة (آية أو صفحة) ----------
  const [jumpTarget, setJumpTarget] = useState('');
  const [jumpMode, setJumpMode] = useState<'ayah' | 'page'>('ayah');
  const [jumpError, setJumpError] = useState<string | null>(null);
  const jumpInputRef = useRef<TextInput>(null);

  const jumpTo = useCallback(() => {
    const raw = Number(jumpTarget);
    const maxAyah = readerData?.versesCount ?? verses.length;
    if (!Number.isInteger(raw) || raw < 1) {
      setJumpError('أدخل رقمًا صحيحًا');
      return;
    }
    if (jumpMode === 'ayah') {
      if (raw > maxAyah) {
        setJumpError(`أكبر آية في هذه السورة ${maxAyah}`);
        return;
      }
      const index = indexOfAyah(raw);
      if (index >= 0) {
        setJumpError(null);
        setSelectedAyah(raw);
        setJumpTarget('');
        jumpInputRef.current?.blur();
        listRef.current?.scrollToIndex({ index, viewPosition: 0.1, animated: true });
      }
      return;
    }
    const first = verses.find((verse) => verse.page === raw);
    if (!first) {
      setJumpError('لا توجد آيات من هذه الصفحة في السورة');
      return;
    }
    const index = indexOfAyah(first.verseNumber);
    if (index >= 0) {
      setJumpError(null);
      setSelectedAyah(first.verseNumber);
      setJumpTarget('');
      jumpInputRef.current?.blur();
      listRef.current?.scrollToIndex({ index, viewPosition: 0.1, animated: true });
    }
  }, [jumpTarget, jumpMode, indexOfAyah, readerData?.versesCount, verses]);

  // ---------- حفظ السورة للتلاوة بدون إنترنت (تنزيل سورة واحدة) ----------
  const [savedLabel, setSavedLabel] = useState<string | null>(null);
  const savedLabelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSurah = useCallback(() => {
    if (!readerData) return;
    storeLocalSurah(readerData);
    setSavedLabel('حُفظت السورة للتلاوة بدون إنترنت');
    if (savedLabelTimer.current) clearTimeout(savedLabelTimer.current);
    savedLabelTimer.current = setTimeout(() => setSavedLabel(null), 3500);
  }, [readerData]);
  const goFullDownload = useCallback(() => {
    router.push('/quran-download');
  }, [router]);

  // ---------- أوصاف العرض ----------
  const revelationLabel = readerData
    ? readerData.revelationPlace === 'makkah'
      ? 'مكية'
      : 'مدنية'
    : '';
  const showBismillahBanner = validId && id !== 1 && id !== 9;
  const playingNow = playingAyah !== null || surahPlaying;
  const audioStatusLabel = surahPlaying
    ? surahAudioQuery.isPending
      ? 'جارٍ تجهيز صوت السورة…'
      : audioStatus.playing
        ? 'جارٍ التشغيل…'
        : 'متوقف مؤقتًا'
    : playingAyah !== null
      ? ayahAudioQuery.isPending
        ? 'جارٍ تجهيز الصوت…'
        : audioStatus.playing
          ? 'جارٍ التشغيل…'
          : 'متوقف مؤقتًا'
      : mode === 'surah'
        ? 'السورة كاملة من البداية'
        : mode === 'sequential'
          ? 'متتابع حتى آخر السورة'
          : 'تشغيل الآية فقط';

  // ---------- عارض القائمة (يُعرَّف قبل أي عودة مبكرة — ثبات الـ hooks) ----------
  // صف الآية: نص المصحف حرفيًا + رقم، والتمييز: جاري التلاوة / مختار اللوحة.
  const renderVerse = useCallback(
    ({ item }: { item: ReadingItem }) => {
      if (item.type === 'page') {
        return (
          <View style={styles.pageMarker}>
            <Text style={[styles.pageMarkerText, { color: colors.mutedForeground }]}>
              — صفحة {toArabicDigits(item.page)} —
            </Text>
          </View>
        );
      }
      const verse = item.verse;
      const isPlaying = playingAyah === verse.verseNumber;
      const isShownInSheet = sheetOpen && sheetAyah === verse.verseNumber && !isPlaying;
      return (
        <VerseRow
          verse={verse}
          fontSize={mushafSize}
          lineHeight={mushafLineHeight}
          textColor={colors.foreground}
          highlightColor={colors.accent}
          selectedColor={colors.secondary}
          markerColor={MARKER_GOLD}
          isPlaying={isPlaying}
          isSheetSelected={isShownInSheet}
          onPress={handleAyahPress}
          onLongPress={handleAyahLongPress}
        />
      );
    },
    [
      playingAyah,
      sheetOpen,
      sheetAyah,
      mushafSize,
      mushafLineHeight,
      colors.foreground,
      colors.accent,
      colors.secondary,
      handleAyahPress,
      handleAyahLongPress,
    ],
  );

  const isSheetAyahPlaying = playingAyah === sheetAyah && audioStatus.playing;

  // ---------- قيود العرض المبكرة (كل الـ hooks أعلاه قبلها) ----------
  if (!validId) {
    return (
      <Screen>
        <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
        <ErrorState />
      </Screen>
    );
  }

  if (readerQuery.isError && !readerQuery.data) {
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

  if (readerQuery.isPending || (!fontsLoaded && !fontError) || !resumeLoaded || !listReady) {
    return (
      <Screen>
        <LoadingState label={readerQuery.isPending ? 'جارٍ فتح السورة…' : 'تحضير القراءة…'} />
      </Screen>
    );
  }

  const surahData = readerQuery.data;

  return (
    <Screen scroll={false} contentStyle={styles.readerContent}>
      {/* ترويسة السورة */}
      <View style={styles.readerHeader}>
        <IconButton icon="arrow-right" label="العودة" onPress={() => router.back()} variant="soft" />
        <View style={styles.readerTitle}>
          <Text style={[styles.surahTitle, { color: colors.foreground }]}>{surahData.nameArabic}</Text>
          <Text style={[styles.readerMeta, { color: colors.mutedForeground }]}>
            سورة {toArabicDigits(surahData.id)} • {surahData.versesCount} آية • {revelationLabel}
          </Text>
          <Text style={[styles.positionText, { color: colors.primary }]}>
            الآية {toArabicDigits(viewInfo.ayah)}
            {viewInfo.page > 0 ? ` • صفحة ${toArabicDigits(viewInfo.page)}` : ''}
          </Text>
        </View>
      </View>

      {/* شريط حجم الخط: A− / A+ يكتبان في المتجر المشترك المُخزَّن فورًا */}
      <View style={[styles.fontBar, { backgroundColor: colors.secondary }]}>
        <Text style={[styles.fontLabel, { color: colors.mutedForeground }]}>حجم الخط</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="تصغير خط المصحف"
          onPress={() => stepFont(-1)}
          style={({ pressed }) => [
            styles.fontButton,
            { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.fontButtonText, { color: colors.primary }]}>A−</Text>
        </Pressable>
        <Text style={[styles.fontValue, { color: colors.foreground }]}>
          {FONT_SCALE_LABELS[settings.fontScale] ?? 'متوسط'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="تكبير خط المصحف"
          onPress={() => stepFont(1)}
          style={({ pressed }) => [
            styles.fontButton,
            { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.fontButtonText, { color: colors.primary }]}>A+</Text>
        </Pressable>
      </View>

      {/* بحث/انتقال داخل السورة: اكتب رقم آية أو صفحة ثم اختر النوع */}
      <View style={[styles.jumpBar, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <TextInput
          ref={jumpInputRef}
          style={[styles.jumpInput, { color: colors.foreground }]}
          value={jumpTarget}
          onChangeText={(text) => setJumpTarget(text.replace(/[^0-9]/g, ''))}
          placeholder={`بحث عن ${jumpMode === 'ayah' ? 'آية' : 'صفحة'}…`}
          placeholderTextColor={colors.mutedForeground}
          keyboardType="number-pad"
          returnKeyType="go"
          onSubmitEditing={jumpTo}
          accessibilityLabel="الانتقال إلى آية أو صفحة في السورة"
        />
        <View style={[styles.jumpModeSwitch, { backgroundColor: colors.card }]}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: jumpMode === 'ayah' }}
            accessibilityLabel="الانتقال إلى رقم آية"
            onPress={() => setJumpMode('ayah')}
            style={[styles.jumpModePill, jumpMode === 'ayah' && { backgroundColor: colors.primary }]}
          >
            <Text
              style={[
                styles.jumpModeText,
                {
                  color:
                    jumpMode === 'ayah' ? colors.primaryForeground : colors.mutedForeground,
                },
              ]}>
              آية
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: jumpMode === 'page' }}
            accessibilityLabel="الانتقال إلى رقم صفحة"
            onPress={() => setJumpMode('page')}
            style={[styles.jumpModePill, jumpMode === 'page' && { backgroundColor: colors.primary }]}
          >
            <Text
              style={[
                styles.jumpModeText,
                {
                  color:
                    jumpMode === 'page' ? colors.primaryForeground : colors.mutedForeground,
                },
              ]}>
              صفحة
            </Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="انتقال إلى الآية أو الصفحة"
          onPress={jumpTo}
          style={[styles.jumpButton, { backgroundColor: colors.primary }]}
        >
          <Feather name="search" size={16} color={colors.primaryForeground} />
          <Text style={[styles.jumpButtonText, { color: colors.primaryForeground }]}>انتقال</Text>
        </Pressable>
      </View>
      {jumpError ? <Text style={styles.jumpErrorText}>{jumpError}</Text> : null}

      {/* تنزيل السورة الحالية أو المصحف كاملًا للاستخدام بدون إنترنت */}
      <View style={[styles.downloadBar, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        {offlineSupported() ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="حفظ هذه السورة للتلاوة بدون إنترنت"
            onPress={saveSurah}
            style={({ pressed }) => [styles.downloadAction, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="download" size={15} color={colors.primary} />
            <Text style={[styles.downloadActionText, { color: colors.primary }]}>حفظ السورة</Text>
          </Pressable>
        ) : (
          <Text style={[styles.downloadActionText, { color: colors.mutedForeground }]}>
            الحفظ بدون إنترنت متاح على الهاتف
          </Text>
        )}
        {isQuranDownloaded() ? (
          <Text style={[styles.downloadActionText, { color: colors.mutedForeground }]}>
            القرآن كامل محفوظ ✓
          </Text>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="تنزيل المصحف كاملًا"
            onPress={goFullDownload}
            style={({ pressed }) => [styles.downloadAction, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="download-cloud" size={15} color={colors.primary} />
            <Text style={[styles.downloadActionText, { color: colors.primary }]}>تنزيل المصحف كاملًا</Text>
          </Pressable>
        )}
      </View>
      {savedLabel ? (
        <Text style={[styles.savedText, { color: colors.primary }]}>{savedLabel}</Text>
      ) : null}

      {/* البسملة حيث يقتضيها مصحف المصدر (لا تُدمج في الآية 1). */}
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

      {/* قارئ المصحف المستمر: سورة واحدة = كل الآيات في حاوية تمرير رأسية واحدة */}
      <FlatList
        ref={listRef}
        style={styles.listStyle}
        data={listItems}
        extraData={renderVerse}
        keyExtractor={(item) => item.key}
        renderItem={renderVerse}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        initialNumToRender={12}
        maxToRenderPerBatch={14}
        windowSize={15}
        onViewableItemsChanged={onViewableItemsChangedRef.current}
        viewabilityConfig={viewabilityConfigRef.current}
        onScrollToIndexFailed={onScrollToIndexFailedRef.current}
        onContentSizeChange={handleContentSizeChange}
      />

      {/* شريط التلاوة: آية محددة أو متتابع أو السورة كاملة، مع إيقاف مؤقت/نهائي */}
      <View style={[styles.audioBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.audioBarMain}>
          <View style={[styles.modeSwitch, { backgroundColor: colors.secondary }]}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: mode === 'single' }}
              accessibilityLabel="تشغيل الآية فقط"
              onPress={() => selectMode('single')}
              style={[styles.modePill, mode === 'single' && { backgroundColor: colors.primary }]}
            >
              <Text
                style={[
                  styles.modePillText,
                  { color: mode === 'single' ? colors.primaryForeground : colors.mutedForeground },
                ]}>
                الآية
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: mode === 'sequential' }}
              accessibilityLabel="تشغيل متتابع من الآية المختارة حتى آخر السورة"
              onPress={() => selectMode('sequential')}
              style={[styles.modePill, mode === 'sequential' && { backgroundColor: colors.primary }]}
            >
              <Text
                style={[
                  styles.modePillText,
                  {
                    color: mode === 'sequential' ? colors.primaryForeground : colors.mutedForeground,
                  },
                ]}>
                متتابع
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: mode === 'surah' }}
              accessibilityLabel="تشغيل السورة كاملة من البداية"
              onPress={() => selectMode('surah')}
              style={[styles.modePill, mode === 'surah' && { backgroundColor: colors.primary }]}
            >
              <Text
                style={[
                  styles.modePillText,
                  { color: mode === 'surah' ? colors.primaryForeground : colors.mutedForeground },
                ]}>
                السورة
              </Text>
            </Pressable>
          </View>

          <View style={styles.audioBarCopy}>
            <Text style={[styles.ayahLabel, { color: colors.foreground }]}>
              {mode === 'surah'
                ? 'السورة كاملة'
                : `الآية ${toArabicDigits(selectedAyah)} من ${toArabicDigits(surahData.versesCount)}`}
            </Text>
            <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
              {audioStatusLabel}
            </Text>
          </View>

          <View style={styles.audioBarButtons}>
            <IconButton
              icon={playingNow && audioStatus.playing ? 'pause' : 'play'}
              label={playingNow && audioStatus.playing ? 'إيقاف مؤقت' : 'تشغيل'}
              onPress={() => (mode === 'surah' ? toggleSurahAudio() : toggleAyahAudio(selectedAyah))}
              variant="dark"
            />
            <IconButton icon="square" label="إيقاف التلاوة" onPress={stopAudio} variant="soft" />
          </View>
        </View>
        <Text style={[styles.audioHint, { color: colors.mutedForeground }]}>
          اضغط أي آية للتشغيل من موضعها • اضغط مطولًا للتفسير والمفضلة والمشاركة
        </Text>
      </View>

      {/* لوحة التفاصيل: التفسير + المفضلة + المشاركة */}
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
                  الآية {toArabicDigits(sheetAyah)}
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
                {verses.find((verse) => verse.verseNumber === sheetAyah)?.text}
              </Text>
            </View>

            {/* أدوات الآية: تشغيل/إيقاف + مفضلة + مشاركة */}
            <View style={styles.sheetActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isSheetAyahPlaying ? 'إيقاف صوت الآية' : 'تشغيل صوت الآية'}
                onPress={() => toggleAyahAudio(sheetAyah)}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: isSheetAyahPlaying ? colors.primary : colors.secondary,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Feather
                  name={isSheetAyahPlaying ? 'pause' : 'play'}
                  size={17}
                  color={isSheetAyahPlaying ? colors.primaryForeground : colors.primary}
                />
                <Text
                  style={[
                    styles.actionText,
                    {
                      color: isSheetAyahPlaying ? colors.primaryForeground : colors.primary,
                    },
                  ]}>
                  {isSheetAyahPlaying ? 'إيقاف' : 'تشغيل الآية'}
                </Text>
              </Pressable>
              <FavoriteButton
                item={{
                  kind: 'ayah',
                  refId: `${id}:${sheetAyah}`,
                  title: `${surahData.nameArabic} — آية ${sheetAyah}`,
                  text: verses.find((verse) => verse.verseNumber === sheetAyah)?.text.slice(0, 220) ?? '',
                  subtitle: `${surahData.nameArabic} : ${sheetAyah}`,
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

            {playingNow && ayahAudioQuery.isPending ? (
              <Text style={[styles.audioStatus, { color: colors.mutedForeground }]}>
                جارٍ تجهيز الصوت…
              </Text>
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
    </Screen>
  );
}

/**
 * صف آية واحدة — مُعلَّم بـ React.memo: لا يُعاد رسمه إلا إذا تغيّرت قيمه
 * فعليًا (النص، الحجم، التمييز) فلا يعاد تركيب القائمة كاملة عند تغيّر شريط
 * التلاوة أو التمرير. النص يُعرض حرفيًا كما ورد من المصدر.
 */
const VerseRow = React.memo(function VerseRow({
  verse,
  fontSize,
  lineHeight,
  textColor,
  highlightColor,
  selectedColor,
  markerColor,
  isPlaying,
  isSheetSelected,
  onPress,
  onLongPress,
}: {
  verse: QuranVerse;
  fontSize: number;
  lineHeight: number;
  textColor: string;
  highlightColor: string;
  selectedColor: string;
  markerColor: string;
  isPlaying: boolean;
  isSheetSelected: boolean;
  onPress: (verseNumber: number) => void;
  onLongPress: (verseNumber: number) => void;
}) {
  const background = isPlaying
    ? highlightColor
    : isSheetSelected
      ? selectedColor
      : 'transparent';
  return (
    <Pressable
      testID={`ayah-${verse.verseNumber}`}
      accessibilityRole="button"
      accessibilityLabel={`الآية ${verse.verseNumber}`}
      onPress={() => onPress(verse.verseNumber)}
      onLongPress={() => onLongPress(verse.verseNumber)}
      delayLongPress={450}
      style={[styles.verseRow, background !== 'transparent' && { backgroundColor: background }]}
    >
      <Text
        style={[
          styles.verseText,
          { color: textColor, fontSize, lineHeight, fontFamily: MUSHAF_FONT },
        ]}>
        {verse.text}
        <Text style={[styles.ayahMarker, { color: markerColor }]}>
          {' '}﴿{toArabicDigits(verse.verseNumber)}﴾
        </Text>
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // الارتفاع محدد للمحتوى — بدون flex:1 تنهار منطقة القائمة إلى صفر.
  readerContent: { flex: 1 },
  readerHeader: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  readerTitle: { alignItems: 'center', flex: 1 },
  surahTitle: { fontSize: typography.h2, fontWeight: '700' },
  readerMeta: { fontSize: typography.caption, marginTop: 4 },
  positionText: { fontSize: typography.caption, fontWeight: '700', marginTop: 2 },

  fontBar: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  fontLabel: { fontSize: typography.caption, fontWeight: '700' },
  fontButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    minWidth: 40,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  fontButtonText: { fontSize: typography.bodySmall, fontWeight: '800' },
  fontValue: { fontSize: typography.bodySmall, fontWeight: '700', textAlign: 'center' },

  jumpBar: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    marginBottom: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  jumpInput: {
    flex: 1,
    fontSize: typography.body,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    textAlign: 'right',
  },
  jumpModeSwitch: { borderRadius: radii.pill, flexDirection: 'row-reverse', padding: 3 },
  jumpModePill: { alignItems: 'center', borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  jumpModeText: { fontSize: typography.bodySmall, fontWeight: '700' },
  jumpButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row-reverse',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  jumpButtonText: { fontSize: typography.bodySmall, fontWeight: '800' },
  jumpErrorText: { color: '#B74C43', fontSize: typography.caption, marginBottom: spacing.sm, textAlign: 'right' },

  downloadBar: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  downloadAction: { alignItems: 'center', flexDirection: 'row-reverse', gap: 6 },
  downloadActionText: { fontSize: typography.caption, fontWeight: '700' },
  savedText: { fontSize: typography.caption, fontWeight: '700', marginBottom: spacing.sm, textAlign: 'center' },

  bismillah: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderTopWidth: 1,
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
  },
  bismillahText: { textAlign: 'center' },

  listStyle: { flex: 1 },
  listContent: { paddingBottom: 160, paddingHorizontal: spacing.xs },

  pageMarker: { alignItems: 'center', paddingVertical: spacing.xs },
  pageMarkerText: { fontSize: typography.caption, fontWeight: '600' },

  verseRow: { borderRadius: 6, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  verseText: { textAlign: 'right', writingDirection: 'rtl' },
  ayahMarker: { color: MARKER_GOLD },

  fallbackHint: { fontSize: typography.bodySmall, marginTop: spacing.sm, textAlign: 'center' },
  surahListButton: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row-reverse',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
  },
  surahListText: { fontSize: typography.bodySmall, fontWeight: '700' },

  audioBar: {
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
    borderWidth: 1,
    bottom: 0,
    left: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    position: 'absolute',
    right: 0,
  },
  audioBarMain: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },
  modeSwitch: {
    borderRadius: radii.pill,
    flexDirection: 'row-reverse',
    padding: 3,
  },
  modePill: { alignItems: 'center', borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 7 },
  modePillText: { fontSize: typography.bodySmall, fontWeight: '700' },
  audioBarCopy: { alignItems: 'center', flex: 1 },
  ayahLabel: { fontSize: typography.bodySmall, fontWeight: '800', textAlign: 'center' },
  statusText: { fontSize: typography.caption, marginTop: 2, textAlign: 'center' },
  audioBarButtons: { alignItems: 'center', flexDirection: 'row-reverse', gap: spacing.xs },
  audioHint: { fontSize: typography.caption, marginTop: spacing.xs, paddingBottom: spacing.sm, textAlign: 'center' },

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
});