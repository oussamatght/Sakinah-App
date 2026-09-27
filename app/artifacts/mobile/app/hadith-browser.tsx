import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  fetchHadithSection,
  getHadithBookSections,
  useGetBookHadiths,
  useGetHadithBooks,
  useGetHadithCategories,
  useGetHadithSearch,
  useGetHadiths,
  type HadithBookSection,
  type HadithItem,
} from "@/lib/api";
import {
  AppHeader,
  ErrorState,
  IconButton,
  isOfflineError,
  LoadingState,
  Screen,
} from "@/components/ui";
import { FavoriteButton } from "@/components/FavoriteButton";
import { GradeBadge } from "@/components/GradeBadge";
import { radii, spacing, typography } from "@/constants/tokens";
import { useColors } from "@/hooks/useColors";

/** Entry mode: canonical books or thematic categories (hadeethenc). */
type Mode = "books" | "topics";

/** أحاديث باب واحد — جلب واحد بدرجاته المُثراة، مع إعادة المحاولة. */
function SectionHadiths({
  bookSlug,
  sectionNumber,
  sectionTitle,
  onBack,
}: {
  bookSlug: string;
  sectionNumber: number;
  sectionTitle: string;
  onBack: () => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const [items, setItems] = useState<HadithItem[] | null>(null);
  const [error, setError] = useState(false);

  const load = React.useCallback(() => {
    let active = true;
    setItems(null);
    setError(false);
    fetchHadithSection(bookSlug, sectionNumber)
      .then((fetched) => {
        if (active) setItems(fetched);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [bookSlug, sectionNumber]);

  React.useEffect(() => load(), [load]);

  if (error) {
    return (
      <ErrorState
        offline={false}
        onRetry={() => {
          load();
        }}
      />
    );
  }
  if (items === null) return <LoadingState />;
  if (items.length === 0) {
    return (
      <Text style={[styles.searchScope, { color: colors.mutedForeground }]}>
        تعذر جلب أحاديث هذا الباب من المصدر.
      </Text>
    );
  }
  return (
    <FlatList
      data={items}
      keyExtractor={(item, index) => `sec-${sectionNumber}-${item.id}-${index}`}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.hadithList}
      ListHeaderComponent={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="العودة إلى الفهرس"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backToIndex,
            { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Feather name="arrow-up-right" size={15} color={colors.primary} />
          <Text style={[styles.backToIndexText, { color: colors.primary }]}>
            الفهرس
          </Text>
        </Pressable>
      }
      renderItem={({ item }) => (
        <View
          style={[
            styles.hadithCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}>
          <View style={styles.hadithTop}>
            <Text style={[styles.hadithText, { color: colors.foreground }]}>
              {item.text}
            </Text>
            <FavoriteButton
              item={{
                kind: "hadith",
                refId: item.id,
                title: sectionTitle,
                text: item.text.slice(0, 220),
                subtitle: item.book,
              }}
            />
          </View>
          <View style={styles.hadithMetaRow}>
            <GradeBadge grade={item.grade} showMissing />
            {item.attribution ? (
              <Text
                style={[
                  styles.hadithMetaText,
                  { color: colors.mutedForeground },
                ]}>
                الراوي: {item.attribution}
              </Text>
            ) : null}
          </View>
          <View style={styles.hadithFooter}>
            <Feather name="bookmark" size={14} color={colors.primary} />
            <Text
              style={[styles.hadithSource, { color: colors.primary }]}
              numberOfLines={1}>
              المصدر: {item.book}
              {item.reference ? ` — رقم الحديث ${item.reference}` : ""}
            </Text>
          </View>
        </View>
      )}
    />
  );
}

/**
 * Hadith browser: pick one of the nine canonical books, then page through its
 * ahadith. Opened from the "more" tab with an optional ?book=slug.
 */
export default function HadithBrowser() {
  const colors = useColors();
  const router = useRouter();
  const { book } = useLocalSearchParams<{ book?: string }>();
  const booksQuery = useGetHadithBooks();
  const categoriesQuery = useGetHadithCategories();
  const [mode, setMode] = useState<Mode>("books");
  const [selectedBook, setSelectedBook] = useState<string | null>(book ?? null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // فهرس الأبواب: null = قائمة الأحاديث العادية؛ قسم مفتوح = أحاديث ذلك الباب
  const [openSection, setOpenSection] = useState<HadithBookSection | null>(null);
  const [indexVisible, setIndexVisible] = useState(false);
  // البحث النصي (يُفعّل عند submit فقط — لا طلبات أثناء الكتابة)
  const [searchText, setSearchText] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");

  const listQuery = useGetBookHadiths(
    mode === "books" && selectedBook
      ? { bookSlug: selectedBook, page, perPage: 10 }
      : null,
  );
  const topicQuery = useGetHadiths(
    mode === "topics" && selectedCategory && !submittedSearch
      ? { categoryId: selectedCategory, page, perPage: 10 }
      : undefined,
    {
      query: {
        enabled: mode === "topics" && Boolean(selectedCategory) && !submittedSearch,
      },
    },
  );
  const searchQuery = useGetHadithSearch(
    submittedSearch.trim().length >= 2 ? submittedSearch.trim() : null,
  );

  const books = booksQuery.data ?? [];
  const currentBook = books.find(
    (candidate) => candidate.slug === selectedBook,
  );
  const sections = selectedBook ? getHadithBookSections(selectedBook) : [];
  const categories = categoriesQuery.data ?? [];
  const activeList = mode === "books" ? listQuery : topicQuery;

  const backToList = () => {
    setSelectedBook(null);
    setSelectedCategory(null);
    setOpenSection(null);
    setIndexVisible(false);
    setSubmittedSearch("");
    setSearchText("");
    setPage(1);
  };

  if (!selectedBook && !selectedCategory) {
    return (
      <Screen scroll={false}>
        <View style={styles.header}>
          <IconButton
            icon="arrow-right"
            label="العودة"
            onPress={() => router.back()}
            variant="soft"
          />
          <Text style={[styles.title, { color: colors.foreground }]}>
            الأحاديث
          </Text>
        </View>

        <View style={styles.modeTabs}>
          {(
            [
              { key: "books", label: "الكتب" },
              { key: "topics", label: "المواضيع" },
            ] as const
          ).map(({ key, label }) => (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === key }}
              onPress={() => {
                setMode(key);
                backToList();
              }}
              style={[
                styles.modeTab,
                mode === key && { backgroundColor: colors.primary },
              ]}>
              <Text
                style={[
                  styles.modeTabText,
                  {
                    color:
                      mode === key
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                  },
                ]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === "books" ? (
          <>
            {booksQuery.isPending ? <LoadingState /> : null}
            {booksQuery.isError ? (
              <ErrorState
                offline={isOfflineError(booksQuery.error)}
                onRetry={() => void booksQuery.refetch()}
              />
            ) : (
              <FlatList
                data={books}
                keyExtractor={(item) => item.slug}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.bookList}
                renderItem={({ item }) => (
                  <Pressable
                    testID={`book-${item.slug}`}
                    accessibilityRole="button"
                    accessibilityLabel={`فتح ${item.nameAr}`}
                    onPress={() => {
                      setSelectedBook(item.slug);
                      setPage(1);
                    }}
                    style={({ pressed }) => [
                      styles.bookRow,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}>
                    <View
                      style={[
                        styles.bookIcon,
                        { backgroundColor: colors.secondary },
                      ]}>
                      <Feather
                        name="book-open"
                        size={19}
                        color={colors.primary}
                      />
                    </View>
                    <View style={styles.bookCopy}>
                      <Text
                        style={[styles.bookName, { color: colors.foreground }]}>
                        {item.nameAr}
                      </Text>
                      <Text
                        style={[
                          styles.bookMeta,
                          { color: colors.mutedForeground },
                        ]}>
                        {item.total} حديث
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
            )}
          </>
        ) : (
          <>
            {categoriesQuery.isPending ? <LoadingState /> : null}
            {categoriesQuery.isError ? (
              <ErrorState
                offline={isOfflineError(categoriesQuery.error)}
                onRetry={() => void categoriesQuery.refetch()}
              />
            ) : (
              <FlatList
                data={categories}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.bookList}
                renderItem={({ item }) => (
                  <Pressable
                    testID={`category-${item.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`فتح ${item.titleAr}`}
                    onPress={() => {
                      setSelectedCategory(item.id);
                      setPage(1);
                    }}
                    style={({ pressed }) => [
                      styles.bookRow,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}>
                    <View
                      style={[
                        styles.bookIcon,
                        { backgroundColor: colors.secondary },
                      ]}>
                      <Feather name="tag" size={19} color={colors.primary} />
                    </View>
                    <View style={styles.bookCopy}>
                      <Text
                        style={[styles.bookName, { color: colors.foreground }]}>
                        {item.titleAr}
                      </Text>
                      <Text
                        style={[
                          styles.bookMeta,
                          { color: colors.mutedForeground },
                        ]}>
                        {item.count} حديث
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
            )}
          </>
        )}
      </Screen>
    );
  }

  const items = activeList.data?.items ?? [];
  const hasMore = activeList.data?.hasMore ?? false;
  const searchActive = submittedSearch.trim().length >= 2;
  const headerTitle =
    mode === "books"
      ? (currentBook?.nameAr ?? "الأحاديث")
      : (categories.find((c) => c.id === selectedCategory)?.titleAr ??
        "المواضيع");

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-right"
          label="العودة إلى القائمة"
          onPress={backToList}
          variant="soft"
        />
        <View style={styles.titleCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {openSection ? openSection.titleAr : headerTitle}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {openSection
              ? `${openSection.hadiths.length} حديث في هذا الباب`
              : `الصفحة ${activeList.data?.page ?? page} من ${
                activeList.data
                  ? Math.ceil(activeList.data.total / activeList.data.perPage)
                  : "—"
              }`}
          </Text>
        </View>
        {/* زر الفهرس — للكتب ذات الأبواب فقط (الخمسة المدرجة في الفهرس) */}
        {mode === "books" && selectedBook && sections.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              indexVisible ? "العودة لقائمة الأحاديث" : "فتح فهرس الأبواب"
            }
            onPress={() => {
              setIndexVisible((visible) => !visible);
              setOpenSection(null);
            }}
            style={({ pressed }) => [
              styles.indexButton,
              {
                backgroundColor: indexVisible ? colors.primary : colors.secondary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather
              name="list"
              size={17}
              color={indexVisible ? colors.primaryForeground : colors.primary}
            />
            <Text
              style={[
                styles.indexButtonText,
                { color: indexVisible ? colors.primaryForeground : colors.primary },
              ]}>
              {indexVisible ? "الأحاديث" : "الفهرس"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* شريط بحث نصي — يبحث موضوعيًا عبر hadeethenc في كل الأحاديث */}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBar, { backgroundColor: colors.secondary }]}>
          <Feather name="search" size={17} color={colors.mutedForeground} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={() => setSubmittedSearch(searchText.trim())}
            returnKeyType="search"
            placeholder="بحث نصي موضوعي في كل الأحاديث…"
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="حقل البحث في الأحاديث"
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {searchText ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="مسح البحث"
              onPress={() => {
                setSearchText("");
                setSubmittedSearch("");
              }}
            >
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        <Text style={[styles.searchScope, { color: colors.mutedForeground }]}>
          البحث النصي: كل الأحاديث موضوعيًا (موسوعة الأحاديث)
        </Text>
      </View>

      {/* نتائج البحث النصي (تتقدم على القوائم أثناء تفعيله) */}
      {searchActive ? (
        <FlatList
          data={searchQuery.data?.items ?? []}
          keyExtractor={(item, index) => `search-${item.id}-${index}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.hadithList}
          ListHeaderComponent={
            <View>
              {searchQuery.isPending ? <LoadingState /> : null}
              {searchQuery.isError ? (
                <Text style={[styles.searchScope, { color: colors.mutedForeground }]}>
                  تعذر البحث — حاول مرة أخرى.
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="فتح تفصيل الحديث"
              onPress={() =>
                router.push(`/hadith-detail?hadithId=${encodeURIComponent(item.id)}`)
              }
              style={[
                styles.hadithCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}>
              <View style={styles.hadithTop}>
                <Text style={[styles.hadithText, { color: colors.foreground }]}>
                  {item.text}
                </Text>
                <FavoriteButton
                  item={{
                    kind: "hadith",
                    refId: item.id,
                    title: item.book,
                    text: item.text.slice(0, 220),
                    subtitle: item.book,
                  }}
                />
              </View>
              <View style={styles.hadithMetaRow}>
                <GradeBadge grade={item.grade} showMissing />
                {item.attribution ? (
                  <Text
                    style={[
                      styles.hadithMetaText,
                      { color: colors.mutedForeground },
                    ]}>
                    الراوي: {item.attribution}
                  </Text>
                ) : null}
                <Text style={[styles.detailHint, { color: colors.primary }]}>
                  التفاصيل والشرح ←
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            searchQuery.isPending ? null : (
              <Text style={[styles.searchScope, { color: colors.mutedForeground }]}>
                لا نتائج لهذا البحث.
              </Text>
            )
          }
        />
      ) : indexVisible && !openSection ? (
        <FlatList
          data={sections}
          keyExtractor={(section) => `section-${section.section}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.hadithList}
          renderItem={({ item: section }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`فتح باب ${section.titleAr}`}
              onPress={() => setOpenSection(section)}
              style={({ pressed }) => [
                styles.sectionRow,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={[styles.sectionNumber, { color: colors.primary }]}>
                {section.section}
              </Text>
              <View style={styles.sectionCopy}>
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}>
                  {section.titleAr}
                </Text>
                <Text
                  style={[
                    styles.sectionMeta,
                    { color: colors.mutedForeground },
                  ]}>
                  {section.hadiths.length} حديث
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
      ) : openSection ? (
        /* أحاديث الباب المفتوح — بدرجاتها المُثراة عربيًا */
        <SectionHadiths
          bookSlug={selectedBook!}
          sectionNumber={openSection.section}
          sectionTitle={openSection.titleAr}
          onBack={() => setOpenSection(null)}
        />
      ) : activeList.isPending ? <LoadingState /> : null}
      {!indexVisible && !openSection && !searchActive && activeList.isError ? (
        <ErrorState
          offline={isOfflineError(activeList.error)}
          onRetry={() => void activeList.refetch()}
        />
      ) : null}
      {!indexVisible && !openSection && !searchActive ? (
        <FlatList
          data={items}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.hadithList}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="فتح تفصيل الحديث"
              // HadeethEnc فقط: تفصيله هو المصدر الوحيد للدرجة الحرفية —
              // بطاقات hadis-api-id (الكتب) لا تفتح تفصيلًا غير موجود.
              onPress={
                item.apiSource === "hadeethenc.com"
                  ? () =>
                    router.push(
                      `/hadith-detail?hadithId=${encodeURIComponent(item.id)}`,
                    )
                  : undefined
              }
              disabled={item.apiSource !== "hadeethenc.com"}
              style={[
                styles.hadithCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}>
              <View style={styles.hadithTop}>
                <Text style={[styles.hadithText, { color: colors.foreground }]}>
                  {item.text}
                </Text>
                <FavoriteButton
                  item={{
                    kind: "hadith",
                    refId: item.id,
                    title: headerTitle,
                    text: item.text.slice(0, 220),
                    subtitle: item.book,
                  }}
                />
              </View>
              <View style={styles.hadithMetaRow}>
                {/* الدرجة: حرفية من المصدر (الإثراء العربي للكتب الخمسة) —
                    "غير متوفرة" تعني أن المصدر لا يقدم درجة لهذا الحديث.
                    hadeethenc فقط له تفصيل — دعوة الضغط تفتحه. */}
                <GradeBadge grade={item.grade} showMissing />
                {item.apiSource === "hadeethenc.com" ? (
                  <Text
                    style={[
                      styles.detailHint,
                      { color: colors.primary },
                    ]}>
                    التفاصيل والدرجة ←
                  </Text>
                ) : null}
                {item.attribution ? (
                  <Text
                    style={[
                      styles.hadithMetaText,
                      { color: colors.mutedForeground },
                    ]}>
                    الراوي: {item.attribution}
                  </Text>
                ) : null}
              </View>
              <View style={styles.hadithFooter}>
                <Feather name="bookmark" size={14} color={colors.primary} />
                <Text style={[styles.hadithSource, { color: colors.primary }]} numberOfLines={1}>
                  المصدر: {item.book}
                  {item.reference ? ` — رقم الحديث ${item.reference}` : ''}
                </Text>
              </View>
            </Pressable>
          )}
          ListFooterComponent={
            <View style={styles.pager}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="الصفحة السابقة"
                disabled={page <= 1 || activeList.isPending}
                onPress={() => setPage((value) => Math.max(value - 1, 1))}
                style={({ pressed }) => [
                  styles.pagerButton,
                  {
                    backgroundColor: colors.secondary,
                    opacity: page <= 1 ? 0.4 : pressed ? 0.7 : 1,
                  },
                ]}>
                <Feather
                  name="chevron-right"
                  size={17}
                  color={colors.primary}
                />
                <Text style={[styles.pagerText, { color: colors.primary }]}>
                  السابق
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="الصفحة التالية"
                disabled={!hasMore || activeList.isPending}
                onPress={() => setPage((value) => value + 1)}
                style={({ pressed }) => [
                  styles.pagerButton,
                  {
                    backgroundColor: colors.secondary,
                    opacity: !hasMore ? 0.4 : pressed ? 0.7 : 1,
                  },
                ]}>
                <Text style={[styles.pagerText, { color: colors.primary }]}>
                  التالي
                </Text>
                <Feather name="chevron-left" size={17} color={colors.primary} />
              </Pressable>
            </View>
          }
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  modeTabs: {
    backgroundColor: "transparent",
    flexDirection: "row-reverse",
    gap: 8,
    marginBottom: spacing.md,
  },
  modeTab: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  modeTabText: { fontSize: typography.bodySmall, fontWeight: "700" },
  titleCopy: { alignItems: "flex-end", flex: 1 },
  title: { fontSize: typography.h1, fontWeight: "700", textAlign: "right" },
  subtitle: { fontSize: typography.caption, marginTop: 2 },
  bookList: { paddingBottom: 40 },
  bookRow: {
    alignItems: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  bookIcon: {
    alignItems: "center",
    borderRadius: radii.sm,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  bookCopy: { alignItems: "flex-end", flex: 1 },
  bookName: {
    fontSize: typography.body,
    fontWeight: "700",
    textAlign: "right",
  },
  bookMeta: { fontSize: typography.caption, marginTop: 2 },
  hadithList: { paddingBottom: 40 },
  hadithCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  hadithTop: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  hadithText: {
    flex: 1,
    fontSize: typography.body,
    lineHeight: 28,
    textAlign: "right",
  },
  hadithMetaRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  hadithMetaText: { fontSize: typography.caption },
  detailHint: { fontSize: typography.caption, fontWeight: "700" },
  searchWrap: { marginBottom: spacing.sm },
  searchBar: {
    alignItems: "center",
    borderRadius: radii.sm,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, fontSize: typography.body, textAlign: "right", paddingVertical: 0 },
  searchScope: { fontSize: typography.caption, marginTop: 4, textAlign: "right" },
  backToIndex: {
    alignSelf: "flex-start",
    alignItems: "center",
    borderRadius: radii.pill,
    flexDirection: "row-reverse",
    gap: 4,
    marginBottom: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  backToIndexText: { fontSize: typography.caption, fontWeight: "700" },
  hadithFooter: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: 5,
    marginTop: spacing.sm,
  },
  hadithSource: { fontSize: typography.caption, fontWeight: "600" },
  indexButton: {
    alignItems: "center",
    borderRadius: radii.pill,
    flexDirection: "row-reverse",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  indexButtonText: { fontSize: typography.caption, fontWeight: "700" },
  sectionRow: {
    alignItems: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  sectionNumber: {
    fontSize: typography.bodySmall,
    fontWeight: "700",
    minWidth: 26,
    textAlign: "center",
  },
  sectionCopy: { alignItems: "flex-end", flex: 1 },
  sectionTitle: { fontSize: typography.body, fontWeight: "700", textAlign: "right" },
  sectionMeta: { fontSize: typography.caption, marginTop: 2 },
  pager: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
    justifyContent: "center",
    paddingVertical: spacing.lg,
  },
  pagerButton: {
    alignItems: "center",
    borderRadius: radii.pill,
    flexDirection: "row-reverse",
    gap: 5,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  pagerText: { fontSize: typography.bodySmall, fontWeight: "700" },
});
