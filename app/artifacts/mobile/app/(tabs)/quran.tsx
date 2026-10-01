import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useGetQuranChapterPages, useGetQuranSurahs } from "@/lib/api";
import {
  searchLocalQuranVerses,
  type LocalQuranVerseHit,
} from "@/lib/offline/quranDb";
import {
  AppHeader,
  ErrorState,
  isOfflineError,
  LoadingState,
  SearchBar,
  Screen,
} from "@/components/ui";
import { radii, spacing, typography } from "@/constants/tokens";
import { useColors } from "@/hooks/useColors";

type TabKey = "surahs" | "juz" | "pages";

/**
 * Real juz starting points (mushaf-order), shown as the subtitle of each juz
 * row. The juz CONTENT itself comes from the API (fetchQuranJuz) — these are
 * only display labels, not approximated ranges.
 */
const JUZ_STARTS: Array<{ juz: number; label: string }> = [
  { juz: 1, label: "الفاتحة ١ – البقرة ١٤١" },
  { juz: 2, label: "البقرة ١٤٢ – ٢٥٢" },
  { juz: 3, label: "البقرة ٢٥٣ – آل عمران ٩٢" },
  { juz: 4, label: "آل عمران ٩٣ – النساء ٢٣" },
  { juz: 5, label: "النساء ٢٤ – ١٤٧" },
  { juz: 6, label: "النساء ١٤٨ – المائدة ٨١" },
  { juz: 7, label: "المائدة ٨٢ – الأنعام ١١٠" },
  { juz: 8, label: "الأنعام ١١١ – الأعراف ٨٧" },
  { juz: 9, label: "الأعراف ٨٨ – الأنفال ٤٠" },
  { juz: 10, label: "الأنفال ٤١ – التوبة ٩٢" },
  { juz: 11, label: "التوبة ٩٣ – هود ٨٣" },
  { juz: 12, label: "هود ٨٤ – يوسف ٥٢" },
  { juz: 13, label: "يوسف ٥٣ – إبراهيم ٥٢" },
  { juz: 14, label: "الحجر – النحل ١٢٨" },
  { juz: 15, label: "الإسراء – الكهف ٧٤" },
  { juz: 16, label: "الكهف ٧٥ – طه ١٣٥" },
  { juz: 17, label: "الأنبياء – الحج ٧٨" },
  { juz: 18, label: "الحج ٧٩ – المؤمنون ١١٨" },
  { juz: 19, label: "الفرقان – النمل ٥٥" },
  { juz: 20, label: "النمل ٥٦ – العنكبوت ٤٥" },
  { juz: 21, label: "العنكبوت ٤٦ – الأحزاب ٣٠" },
  { juz: 22, label: "الأحزاب ٣١ – يس ٢٧" },
  { juz: 23, label: "يس ٢٨ – الزمر ٣١" },
  { juz: 24, label: "الزمر ٣٢ – فصلت ٤٦" },
  { juz: 25, label: "فصلت ٤٧ – الجاثية ٣٧" },
  { juz: 26, label: "الأحقاف – الذاريات ٣٠" },
  { juz: 27, label: "الذاريات ٣١ – الحديد ٢٩" },
  { juz: 28, label: "المجادلة – التحريم ١٢" },
  { juz: 29, label: "المزمل – المرسلات ٥٠" },
  { juz: 30, label: "النبإ – الناس" },
];

export default function QuranScreen() {
  const colors = useColors();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabKey>("surahs");

  const toArabicDigits = (n: number) =>
    String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

  const surahsQuery = useGetQuranSurahs();
  const chapterPagesQuery = useGetQuranChapterPages();
  const surahs = surahsQuery.data ?? [];
  const chapterPages = chapterPagesQuery.data ?? [];

  // بحث مباشر في نص الآيات المحمَّلة على الجهاز (يحتاج تنزيلًا مسبقًا).
  const verseHits = useMemo(
    () =>
      query.trim().length >= 2 ? searchLocalQuranVerses(query.trim(), 60) : [],
    [query],
  );

  const filtered = useMemo(
    () =>
      surahs.filter((item) =>
        `${item.nameArabic} ${item.nameEnglish}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query, surahs],
  );

  // Juz entries are real starting points (labels only) — the actual verses
  // and surah ranges are fetched per juz from the API when opened.
  const juzList = JUZ_STARTS.map(({ juz, label }) => ({ juz, label }));

  // A page entry = the surah whose page range contains it.
  const pageList = useMemo(() => {
    const list: Array<{ page: number; surahId: number; surahName: string }> =
      [];
    for (const chapter of chapterPages) {
      for (let page = chapter.startPage; page <= chapter.endPage; page += 1) {
        if (page > 604) break;
        list.push({ page, surahId: chapter.id, surahName: chapter.nameArabic });
      }
    }
    return list;
  }, [chapterPages]);

  const isLoading = surahsQuery.isPending || chapterPagesQuery.isPending;
  const isError = surahsQuery.isError || chapterPagesQuery.isError;
  const retry = () => {
    void surahsQuery.refetch();
    void chapterPagesQuery.refetch();
  };

  if (isLoading) {
    return (
      <Screen>
        <AppHeader eyebrow="وردك اليومي" title="القرآن الكريم" />
        <LoadingState />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <AppHeader eyebrow="وردك اليومي" title="القرآن الكريم" />
        <ErrorState
          offline={isOfflineError(surahsQuery.error ?? chapterPagesQuery.error)}
          onRetry={retry}
        />
      </Screen>
    );
  }

  const openSurah = (surahId: number, nameArabic?: string) => {
    router.push({
      pathname: "/quran-reader",
      params: {
        surahId: String(surahId),
        ...(nameArabic ? { surah: nameArabic } : {}),
      },
    });
  };

  /** فتح صفحة مصحف محددة: نفس قاموس السور، مع pageNum لتحديد الصفحة بالضبط. */
  const openPage = (page: number, surahId: number, surahName?: string) => {
    router.push({
      pathname: "/quran-reader",
      params: {
        surahId: String(surahId),
        pageNum: String(page),
        ...(surahName ? { surah: surahName } : {}),
      },
    });
  };

  /** فتح آية من نتائج البحث في الآيات: القارئ يفتح مباشرة عند تلك الآية. */
  const openVerseHit = (hit: LocalQuranVerseHit) => {
    router.push({
      pathname: "/quran-reader",
      params: {
        surahId: String(hit.surahId),
        surah: hit.surah,
        ayah: String(hit.ayah),
      },
    });
  };

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "surahs", label: "السور" },
    { key: "juz", label: "الأجزاء" },
    { key: "pages", label: "الصفحات" },
  ];

  return (
    <Screen scroll={false}>
      <AppHeader
        eyebrow="وردك اليومي"
        title="القرآن الكريم"
        actionLabel="الإعدادات"
        action="sliders"
        onAction={() => router.push("/settings")}
      />
      <SearchBar
        placeholder="ابحث عن سورة أو آية..."
        value={query}
        onChangeText={setQuery}
      />
      <View style={styles.tabs}>
        {tabs.map(({ key, label }) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            onPress={() => setTab(key)}
            style={[
              styles.tab,
              tab === key && { backgroundColor: colors.primary },
            ]}>
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    tab === key
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                },
              ]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "surahs" ? (
        <FlatList
          data={filtered}
          style={styles.listViewport}
          keyExtractor={(item) => `surah-${item.id}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View>
              {query.trim().length >= 2 ? (
                verseHits.length > 0 ? (
                  <View style={styles.verseResults}>
                    <Text
                      style={[
                        styles.verseSectionTitle,
                        { color: colors.foreground },
                      ]}>
                      آيات مطابقة ({verseHits.length})
                    </Text>
                    {verseHits.map((hit) => (
                      <Pressable
                        key={`${hit.surahId}-${hit.ayah}`}
                        accessibilityRole="button"
                        accessibilityLabel={`فتح الآية ${hit.ayah} من سورة ${hit.surah}`}
                        onPress={() => openVerseHit(hit)}
                        style={({ pressed }) => [
                          styles.verseRow,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}>
                        <Text
                          numberOfLines={3}
                          style={[
                            styles.verseText,
                            { color: colors.foreground },
                          ]}>
                          {hit.text}
                        </Text>
                        <Text
                          style={[styles.verseMeta, { color: colors.primary }]}>
                          {hit.surah} — الآية {toArabicDigits(hit.ayah)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text
                    style={[
                      styles.verseNoHits,
                      { color: colors.mutedForeground },
                    ]}>
                    لا تطابق في الآيات المحمَّلة على جهازك — نزّل القرآن (كاملًا
                    أو سورة واحدة) من شاشة التنزيل لتشغيل البحث في الآيات.
                  </Text>
                )
              ) : null}
              <View style={styles.listHeader}>
                <Text
                  style={[styles.listCount, { color: colors.mutedForeground }]}>
                  {surahs.length} سورة
                </Text>
                <Text
                  style={[styles.listHint, { color: colors.mutedForeground }]}>
                  بسم الله الرحمن الرحيم
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="search" size={22} color={colors.mutedForeground} />
              <Text
                style={[styles.emptyText, { color: colors.mutedForeground }]}>
                لا توجد نتائج
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`surah-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={`فتح سورة ${item.nameArabic}`}
              onPress={() => openSurah(item.id, item.nameArabic)}
              style={({ pressed }) => [
                styles.surahRow,
                {
                  borderBottomColor: colors.border,
                  opacity: pressed ? 0.65 : 1,
                },
              ]}>
              <View
                style={[styles.number, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.numberText, { color: colors.primary }]}>
                  {String(item.id).padStart(2, "0")}
                </Text>
              </View>
              <View style={styles.surahCopy}>
                <Text style={[styles.surahName, { color: colors.foreground }]}>
                  {item.nameArabic}
                </Text>
                <Text
                  style={[styles.surahMeta, { color: colors.mutedForeground }]}>
                  {item.revelationPlace === "makkah" ? "مكية" : "مدنية"} •{" "}
                  {item.versesCount} آية
                </Text>
              </View>
              <Feather
                name="chevron-left"
                size={18}
                color={colors.mutedForeground}
              />
            </Pressable>
          )}
        />
      ) : null}

      {tab === "juz" ? (
        <FlatList
          data={juzList}
          style={styles.listViewport}
          keyExtractor={(item) => `juz-${item.juz}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text
                style={[styles.emptyText, { color: colors.mutedForeground }]}>
                لا توجد أجزاء متاحة الآن
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`juz-${item.juz}`}
              accessibilityRole="button"
              accessibilityLabel={`فتح الجزء ${item.juz}`}
              onPress={() => router.push(`/juz-reader?juz=${item.juz}`)}
              style={({ pressed }) => [
                styles.surahRow,
                {
                  borderBottomColor: colors.border,
                  opacity: pressed ? 0.65 : 1,
                },
              ]}>
              <View
                style={[styles.number, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.numberText, { color: colors.primary }]}>
                  {String(item.juz).padStart(2, "0")}
                </Text>
              </View>
              <View style={styles.surahCopy}>
                <Text style={[styles.surahName, { color: colors.foreground }]}>
                  الجزء {item.juz}
                </Text>
                <Text
                  style={[styles.surahMeta, { color: colors.mutedForeground }]}>
                  {item.label}
                </Text>
              </View>
              <Feather
                name="chevron-left"
                size={18}
                color={colors.mutedForeground}
              />
            </Pressable>
          )}
        />
      ) : null}

      {tab === "pages" ? (
        <FlatList
          data={pageList}
          style={styles.listViewport}
          keyExtractor={(item) => `page-${item.page}`}
          showsVerticalScrollIndicator={false}
          numColumns={4}
          contentContainerStyle={styles.gridList}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text
                style={[styles.emptyText, { color: colors.mutedForeground }]}>
                لا توجد صفحات متاحة الآن
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`page-${item.page}`}
              accessibilityRole="button"
              accessibilityLabel={`فتح الصفحة ${item.page}`}
              onPress={() => openPage(item.page, item.surahId, item.surahName)}
              style={({ pressed }) => [
                styles.pageCell,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: pressed ? 0.65 : 1,
                },
              ]}>
              <Text style={[styles.pageNumber, { color: colors.primary }]}>
                {item.page}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.pageSurah, { color: colors.mutedForeground }]}>
                {item.surahName}
              </Text>
            </Pressable>
          )}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: {
    backgroundColor: "transparent",
    flexDirection: "row-reverse",
    gap: 8,
    marginTop: spacing.lg,
  },
  tab: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  tabText: { fontSize: typography.bodySmall, fontWeight: "700" },
  listViewport: { flex: 1 },
  list: { paddingBottom: spacing.lg },
  gridList: { paddingBottom: spacing.lg, paddingTop: spacing.md },
  verseResults: { gap: spacing.sm, paddingTop: spacing.lg },
  verseSectionTitle: {
    fontSize: typography.bodyLarge,
    fontWeight: "800",
    marginBottom: spacing.xs,
    textAlign: "right",
  },
  verseRow: {
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.sm,
  },
  verseText: {
    fontSize: typography.bodySmall,
    lineHeight: 22,
    textAlign: "right",
  },
  verseMeta: {
    fontSize: typography.caption,
    fontWeight: "700",
    textAlign: "right",
  },
  verseNoHits: {
    fontSize: typography.bodySmall,
    lineHeight: 22,
    paddingTop: spacing.lg,
    textAlign: "center",
  },
  listHeader: {
    alignItems: "center",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    paddingVertical: spacing.lg,
  },
  listCount: { fontSize: typography.caption },
  listHint: { fontSize: typography.bodySmall, textAlign: "right" },
  surahRow: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    minHeight: 78,
  },
  number: {
    alignItems: "center",
    borderRadius: radii.sm,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  numberText: { fontSize: typography.bodySmall, fontWeight: "700" },
  surahCopy: { alignItems: "flex-end", flex: 1 },
  surahName: { fontSize: typography.bodyLarge, fontWeight: "700" },
  surahMeta: { fontSize: typography.caption, marginTop: 4 },
  pageCell: {
    alignItems: "center",
    borderRadius: radii.sm,
    borderWidth: 1,
    flexGrow: 1,
    margin: 4,
    paddingVertical: 12,
  },
  pageNumber: { fontSize: typography.body, fontWeight: "700" },
  pageSurah: { fontSize: typography.caption, marginTop: 2 },
  empty: { alignItems: "center", gap: spacing.sm, padding: spacing.xxl },
  emptyText: { fontSize: typography.bodySmall, textAlign: "center" },
});
