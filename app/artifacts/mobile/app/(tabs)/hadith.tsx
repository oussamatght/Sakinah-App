import React, { useEffect, useMemo, useState } from "react";

import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import {
  fetchHadithByNumber,
  getHadithBookSections,
  useGetBookHadiths,
  useGetHadithBooks,
  useGetHadithByNumber,
  useGetHadithCategories,
  useGetHadithSearch,
  useGetHadiths,
  usePrefetchNextHadithPage,
  type HadithBookSection,
  type HadithItem,
} from "@/lib/api";

import { getOfflineHadiths } from "@/lib/offline/hadithDb";

import {
  AppHeader,
  ErrorState,
  IconButton,
  isOfflineError,
  LoadingState,
  Screen,
} from "@/components/ui";

import { FavoriteButton } from "@/components/FavoriteButton";
import { ItemGrade } from "@/components/GradeBadge";
import { radii, spacing, typography } from "@/constants/tokens";
import { useColors } from "@/hooks/useColors";

type Mode = "books" | "topics";

type SearchKind = "text" | "number";

function toArabicDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

/**
 * بطاقة حديث واحدة. showMissingGrade=true تُظهر الدرجة حتى غير المتوفرة وfalse تُخفي
 * الرسالة (للمواضيع). bookSlug يلزم لأحاديث hadis-api-id لتحميل الدرجة كسولًا من
 * fawaz، ويبقى undefined لمواضيع HadeethEnc.
 */
function HadithCard({
  item,
  bookTitle,
  onPress,
  colors,
  showMissingGrade = true,
  bookSlug,
}: {
  item: HadithItem;
  bookTitle: string;
  onPress?: () => void;
  colors: ReturnType<typeof useColors>;
  showMissingGrade?: boolean;
  bookSlug?: string | null;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? "فتح تفصيل الحديث" : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.hadithCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}>
      <View style={styles.hadithTop}>
        <Text style={[styles.hadithText, { color: colors.foreground }]}>
          {item.text}
        </Text>

        <FavoriteButton
          item={{
            kind: "hadith",
            refId: item.id,
            title: bookTitle,
            text: item.text.slice(0, 220),
            subtitle: item.book,
          }}
        />
      </View>

      <View style={styles.hadithMetaRow}>
        {/* الدرجة كسولًا حتى لا تُحبس القائمة، وقيمتها من المصدر بلا اختراع. */}
        <ItemGrade
          item={item}
          bookSlug={bookSlug}
          showMissing={showMissingGrade}
        />

        {item.attribution ? (
          <Text
            style={[styles.hadithMetaText, { color: colors.mutedForeground }]}>
            الراوي: {item.attribution}
          </Text>
        ) : null}

        {onPress ? (
          <Text style={[styles.detailHint, { color: colors.primary }]}>
            اضغط على الحديث للتفاصيل والشرح
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
    </Pressable>
  );
}

/** تبويب الأحاديث: الكتب (فهرس أبواب + درجات + صفحات) أو المواضيع (بحث + offline). */
export default function HadithTab() {
  const colors = useColors();
  const router = useRouter();

  const booksQuery = useGetHadithBooks();
  const categoriesQuery = useGetHadithCategories();

  const [mode, setMode] = useState<Mode>("books");

  const [selectedBook, setSelectedBook] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [page, setPage] = useState(1);

  /** فهرس الأبواب المفتوح، أو null للقائمة العادية. */
  const [openSection, setOpenSection] = useState<HadithBookSection | null>(
    null,
  );

  const [indexVisible, setIndexVisible] = useState(false);

  const [searchText, setSearchText] = useState("");

  const [submittedText, setSubmittedText] = useState("");

  const [searchKind, setSearchKind] = useState<SearchKind>("text");

  /** نتيجة البحث بالرقم: undefined جارٍ، null لا يوجد، HadithItem موجود. */
  const [numberResult, setNumberResult] = useState<
    HadithItem | null | undefined
  >(undefined);

  const [moreVisible, setMoreVisible] = useState(false);

  const listQuery = useGetBookHadiths(
    mode === "books" && selectedBook && !openSection && !submittedText
      ? {
          bookSlug: selectedBook,
          page,
          perPage: 10,
        }
      : null,
  );

  const topicQuery = useGetHadiths(
    mode === "topics" && selectedCategory && !submittedText
      ? {
          categoryId: selectedCategory,
          page,
          perPage: 10,
        }
      : undefined,
    {
      query: {
        enabled:
          mode === "topics" && Boolean(selectedCategory) && !submittedText,
      },
    },
  );

  const searchQuery = useGetHadithSearch(
    submittedText.trim().length >= 2 && searchKind === "text"
      ? submittedText.trim()
      : null,
  );

  const books = booksQuery.data ?? [];

  const currentBook = books.find(
    (candidate) => candidate.slug === selectedBook,
  );

  const sections = selectedBook ? getHadithBookSections(selectedBook) : [];

  const categories = categoriesQuery.data ?? [];

  const activeList = mode === "books" ? listQuery : topicQuery;

  /** مسبق جلب الصفحة التالية في الخلفية حتى يفتح "التالي" فورًا بلا انتظار. */
  usePrefetchNextHadithPage({
    enabled:
      Boolean(selectedBook || selectedCategory) &&
      !openSection &&
      submittedText.trim().length === 0,
    bookSlug: mode === "books" ? selectedBook : null,
    categoryId: mode === "topics" ? selectedCategory : null,
    page,
    perPage: 10,
    hasMore: activeList.data?.hasMore ?? false,
  });

  useEffect(() => {
    if (searchKind !== "number" || submittedText.trim() === "") {
      return;
    }

    const parsed = Number.parseInt(submittedText.trim(), 10);

    if (!Number.isInteger(parsed) || parsed < 1 || !selectedBook) {
      setNumberResult(null);
      return;
    }

    let active = true;

    setNumberResult(undefined);

    fetchHadithByNumber(selectedBook, parsed)
      .then((item) => {
        if (active) {
          setNumberResult(item);
        }
      })
      .catch(() => {
        if (active) {
          setNumberResult(null);
        }
      });

    return () => {
      active = false;
    };
  }, [searchKind, selectedBook, submittedText]);

  const offlineHits = useMemo(() => {
    if (searchKind !== "text") {
      return [];
    }

    const needle = submittedText.trim();

    if (needle.length < 2) {
      return [];
    }

    try {
      const cached = getOfflineHadiths(200);

      return cached.filter((item) => item.text.includes(needle)).slice(0, 20);
    } catch {
      return [];
    }
  }, [searchKind, submittedText]);

  const backToList = () => {
    setSelectedBook(null);
    setSelectedCategory(null);
    setOpenSection(null);
    setIndexVisible(false);
    setPage(1);
    setMoreVisible(false);
  };

  const clearSearch = () => {
    setSearchText("");
    setSubmittedText("");
    setNumberResult(undefined);
    setPage(1);
  };

  const headerTitle =
    mode === "books"
      ? (currentBook?.nameAr ?? "الأحاديث")
      : (categories.find((category) => category.id === selectedCategory)
          ?.titleAr ?? "المواضيع");

  if (!selectedBook && !selectedCategory) {
    return (
      <Screen scroll={false}>
        <AppHeader
          eyebrow="من وحي السنة"
          title="الأحاديث"
          action="sliders"
          actionLabel="الإعدادات"
          onAction={() => router.push("/settings")}
        />

        <View style={styles.modeTabs}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{
              selected: mode === "books",
            }}
            onPress={() => {
              setMode("books");
              backToList();
              clearSearch();
            }}
            style={[
              styles.modeTab,
              mode === "books" && {
                backgroundColor: colors.primary,
              },
            ]}>
            <Text
              style={[
                styles.modeTabText,
                {
                  color:
                    mode === "books"
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                },
              ]}>
              الكتب
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityState={{
              selected: mode === "topics",
            }}
            onPress={() => {
              setMode("topics");
              backToList();
              clearSearch();
            }}
            style={[
              styles.modeTab,
              mode === "topics" && {
                backgroundColor: colors.primary,
              },
            ]}>
            <Text
              style={[
                styles.modeTabText,
                {
                  color:
                    mode === "topics"
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                },
              ]}>
              المواضيع
            </Text>
          </Pressable>
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
                contentContainerStyle={styles.list}
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
                      styles.row,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}>
                    <View
                      style={[
                        styles.rowIcon,
                        {
                          backgroundColor: colors.secondary,
                        },
                      ]}>
                      <Feather
                        name="book-open"
                        size={19}
                        color={colors.primary}
                      />
                    </View>

                    <View style={styles.rowCopy}>
                      <Text
                        style={[
                          styles.rowTitle,
                          {
                            color: colors.foreground,
                          },
                        ]}>
                        {item.nameAr}
                      </Text>

                      <Text
                        style={[
                          styles.rowMeta,
                          {
                            color: colors.mutedForeground,
                          },
                        ]}>
                        {item.total} حديث
                        {getHadithBookSections(item.slug).length > 0
                          ? ` • ${
                              getHadithBookSections(item.slug).length
                            } بابًا`
                          : ""}
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
                contentContainerStyle={styles.list}
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
                      styles.row,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}>
                    <View
                      style={[
                        styles.rowIcon,
                        {
                          backgroundColor: colors.secondary,
                        },
                      ]}>
                      <Feather name="tag" size={19} color={colors.primary} />
                    </View>

                    <View style={styles.rowCopy}>
                      <Text
                        style={[
                          styles.rowTitle,
                          {
                            color: colors.foreground,
                          },
                        ]}>
                        {item.titleAr}
                      </Text>

                      <Text
                        style={[
                          styles.rowMeta,
                          {
                            color: colors.mutedForeground,
                          },
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

  const reportedTotal = Number(activeList.data?.total ?? 0);
  const reportedPerPage = Math.max(1, Number(activeList.data?.perPage ?? 10));
  const reportedTotalPages = Math.max(
    0,
    Number(
      (activeList.data as { totalPages?: number } | undefined)?.totalPages ?? 0,
    ),
  );

  /** الـAPI لا يضمن totalPages؛ إن نقصت نحسبها من total/perPage أو نسمح بالصفحة
   *  التالية متى امتلأت الحالية بـperPage عناصر. */
  const totalPages =
    reportedTotalPages > 0
      ? reportedTotalPages
      : reportedTotal > 0
        ? Math.max(1, Math.ceil(reportedTotal / reportedPerPage))
        : Math.max(1, page);

  const explicitHasMore = activeList.data?.hasMore;
  const inferredHasMore = items.length >= reportedPerPage;
  const hasMore =
    explicitHasMore === true
      ? true
      : explicitHasMore === false
        ? false
        : page < totalPages || inferredHasMore;

  const canGoPrevious = page > 1 && !activeList.isPending;

  const canGoNext = !activeList.isPending && !activeList.isFetching && hasMore;

  const searchNumberActive =
    submittedText.trim() !== "" && searchKind === "number";

  const searchTextActive =
    submittedText.trim().length >= 2 &&
    searchKind === "text" &&
    mode === "topics";

  const searchPlaceholder =
    searchKind === "number"
      ? `اكتب رقم الحديث داخل ${currentBook?.nameAr ?? "الكتاب"}…`
      : mode === "books"
        ? "بحث نصي موضوعي في كل الكتب (hadeethenc)…"
        : `بحث في ${headerTitle} وفي ما خُزّن للقراءة دون اتصال…`;

  const searchScopeNote =
    searchKind === "number"
      ? `البحث بالرقم داخل: ${currentBook?.nameAr ?? "—"}`
      : mode === "books"
        ? "البحث النصي: كل الأحاديث موضوعيًا (موسوعة الأحاديث)"
        : `البحث: ${headerTitle} + المحتوى المخزّن offline`;

  const numberResultView =
    numberResult === undefined ? (
      <LoadingState />
    ) : numberResult === null ? (
      <View style={styles.searchFeedback}>
        <Text
          style={[
            styles.searchFeedbackText,
            {
              color: colors.mutedForeground,
            },
          ]}>
          لا يوجد حديث بهذا الرقم في {currentBook?.nameAr ?? "هذا الكتاب"}.
        </Text>
      </View>
    ) : (
      <HadithCard
        item={numberResult}
        bookTitle={headerTitle}
        onPress={
          selectedBook
            ? () =>
                router.push(
                  `/hadith-detail?book=${encodeURIComponent(
                    selectedBook,
                  )}&number=${encodeURIComponent(numberResult.reference)}`,
                )
            : undefined
        }
        colors={colors}
        showMissingGrade={true}
        bookSlug={selectedBook}
      />
    );

  const toggleIndex = () => {
    setIndexVisible((visible) => !visible);
    setOpenSection(null);
    setMoreVisible(false);
  };

  /** شريط pagination مثبت أعلى وأسفل القائمة حتى لا يختفي زر "التالي" بعد آخر حديث. */
  const renderPager = () => (
    <View style={styles.pager}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="الصفحة السابقة"
        disabled={!canGoPrevious}
        onPress={() => setPage((value) => Math.max(value - 1, 1))}
        style={({ pressed }) => [
          styles.pagerButton,
          {
            backgroundColor: colors.secondary,
            opacity: !canGoPrevious ? 0.4 : pressed ? 0.7 : 1,
          },
        ]}>
        <Feather name="chevron-right" size={17} color={colors.primary} />
        <Text style={[styles.pagerText, { color: colors.primary }]}>
          السابق
        </Text>
      </Pressable>

      <View
        style={[
          styles.pageIndicator,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}>
        <Text style={[styles.pageIndicatorText, { color: colors.foreground }]}>
          {toArabicDigits(page)}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="الصفحة التالية"
        disabled={!canGoNext}
        onPress={() => setPage((value) => value + 1)}
        style={({ pressed }) => [
          styles.pagerButton,
          {
            backgroundColor: colors.secondary,
            opacity: !canGoNext ? 0.4 : pressed ? 0.7 : 1,
          },
        ]}>
        <Text style={[styles.pagerText, { color: colors.primary }]}>
          التالي
        </Text>
        <Feather name="chevron-left" size={17} color={colors.primary} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="الانتقال إلى الصفحة التالية"
        disabled={!canGoNext}
        onPress={() => setPage((value) => value + 1)}
        style={({ pressed }) => [
          styles.nextPageArrow,
          {
            backgroundColor: colors.primary,
            opacity: !canGoNext ? 0.35 : pressed ? 0.7 : 1,
          },
        ]}>
        <Feather name="arrow-left" size={20} color={colors.primaryForeground} />
      </Pressable>
    </View>
  );

  return (
    <Screen scroll={false}>
      <View style={styles.listHeader}>
        <IconButton
          icon="arrow-right"
          label="العودة إلى القائمة"
          onPress={() => {
            backToList();
            clearSearch();
          }}
          variant="soft"
        />
        <View style={styles.titleCopy}>
          <Text
            style={[
              styles.screenTitle,
              {
                color: colors.foreground,
              },
            ]}>
            {openSection ? openSection.titleAr : headerTitle}
          </Text>

          <Text
            style={[
              styles.screenMeta,
              {
                color: colors.mutedForeground,
              },
            ]}>
            {openSection
              ? `${toArabicDigits(
                  openSection.hadiths.length,
                )} حديث في هذا الباب`
              : `الصفحة ${toArabicDigits(
                  activeList.data?.page ?? page,
                )} من ${toArabicDigits(totalPages)}`}
          </Text>
        </View>
        {mode === "books" && sections.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              indexVisible ? "العودة لقائمة الأحاديث" : "فتح فهرس الأبواب"
            }
            onPress={toggleIndex}
            style={({ pressed }) => [
              styles.indexButton,
              {
                backgroundColor: indexVisible
                  ? colors.primary
                  : colors.secondary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <Feather
              name="list"
              size={17}
              color={indexVisible ? colors.primaryForeground : colors.primary}
            />

            <Text
              style={[
                styles.indexButtonText,
                {
                  color: indexVisible
                    ? colors.primaryForeground
                    : colors.primary,
                },
              ]}>
              {indexVisible ? "الأحاديث" : "الفهرس"}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="المزيد من الخيارات"
          onPress={() => setMoreVisible((visible) => !visible)}
          style={({ pressed }) => [
            styles.moreButton,
            {
              backgroundColor: moreVisible ? colors.primary : colors.secondary,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <Feather
            name="more-vertical"
            size={19}
            color={moreVisible ? colors.primaryForeground : colors.primary}
          />
        </Pressable>
      </View>
      {moreVisible ? (
        <View
          style={[
            styles.moreMenu,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="مسح البحث"
            onPress={() => {
              clearSearch();
              setMoreVisible(false);
            }}
            style={({ pressed }) => [
              styles.moreMenuItem,
              {
                opacity: pressed ? 0.65 : 1,
              },
            ]}>
            <Feather name="x-circle" size={17} color={colors.primary} />

            <Text
              style={[
                styles.moreMenuText,
                {
                  color: colors.foreground,
                },
              ]}>
              مسح البحث
            </Text>
          </Pressable>

          {mode === "books" && sections.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="فتح الفهرس"
              onPress={() => {
                setIndexVisible(true);
                setOpenSection(null);
                setMoreVisible(false);
              }}
              style={({ pressed }) => [
                styles.moreMenuItem,
                {
                  opacity: pressed ? 0.65 : 1,
                },
              ]}>
              <Feather name="list" size={17} color={colors.primary} />

              <Text
                style={[
                  styles.moreMenuText,
                  {
                    color: colors.foreground,
                  },
                ]}>
                فتح الفهرس
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="العودة للقائمة"
            onPress={() => {
              backToList();
              clearSearch();
            }}
            style={({ pressed }) => [
              styles.moreMenuItem,
              {
                opacity: pressed ? 0.65 : 1,
              },
            ]}>
            <Feather name="arrow-right" size={17} color={colors.primary} />

            <Text
              style={[
                styles.moreMenuText,
                {
                  color: colors.foreground,
                },
              ]}>
              العودة للقائمة
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.secondary,
            },
          ]}>
          <Feather name="search" size={17} color={colors.mutedForeground} />

          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={() => setSubmittedText(searchText.trim())}
            returnKeyType="search"
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="حقل البحث في الأحاديث"
            style={[
              styles.searchInput,
              {
                color: colors.foreground,
              },
            ]}
          />

          {mode === "books" && selectedBook ? (
            <Pressable
              onPress={() => {
                setSearchKind((kind) =>
                  kind === "number" ? "text" : "number",
                );

                setSubmittedText("");
                setNumberResult(undefined);
              }}
              accessibilityRole="button"
              accessibilityLabel="تبديل نوع البحث بين النص والرقم"
              style={({ pressed }) => [
                styles.searchKindToggle,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}>
              <Text
                style={[
                  styles.searchKindText,
                  {
                    color: colors.primaryForeground,
                  },
                ]}>
                {searchKind === "number" ? "بالرقم" : "بالنص"}
              </Text>
            </Pressable>
          ) : null}

          {searchText ? (
            <Pressable
              onPress={clearSearch}
              accessibilityRole="button"
              accessibilityLabel="مسح البحث">
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>

        <Text
          style={[
            styles.searchScope,
            {
              color: colors.mutedForeground,
            },
          ]}>
          {searchScopeNote}
        </Text>
      </View>
      {indexVisible && !openSection ? (
        <FlatList
          data={sections}
          keyExtractor={(section) => `section-${section.section}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
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
              ]}>
              <Text
                style={[
                  styles.sectionNumber,
                  {
                    color: colors.primary,
                  },
                ]}>
                {toArabicDigits(section.section)}
              </Text>

              <View style={styles.sectionCopy}>
                <Text
                  style={[
                    styles.sectionTitle,
                    {
                      color: colors.foreground,
                    },
                  ]}>
                  {section.titleAr}
                </Text>

                <Text
                  style={[
                    styles.sectionMeta,
                    {
                      color: colors.mutedForeground,
                    },
                  ]}>
                  {toArabicDigits(section.hadiths.length)} حديث
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
      ) : searchNumberActive ? (
        numberResultView
      ) : searchTextActive ? (
        /** نتائج البحث النصي: showMissingGrade={false} فلا تظهر رسالة الدرجة غير المتوفرة. */
        <FlatList
          data={[...(searchQuery.data?.items ?? []), ...offlineHits]}
          keyExtractor={(item, index) => `search-${item.id}-${index}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View>
              {searchQuery.isPending ? <LoadingState /> : null}

              {searchQuery.isError ? (
                <Text
                  style={[
                    styles.searchFeedbackText,
                    {
                      color: colors.mutedForeground,
                    },
                  ]}>
                  تعذر البحث الموضوعي — تُعرض النتائج المخزّنة offline فقط.
                </Text>
              ) : null}

              {offlineHits.length > 0 ? (
                <Text
                  style={[
                    styles.searchGroupTitle,
                    {
                      color: colors.mutedForeground,
                    },
                  ]}>
                  من المحتوى المخزّن offline (
                  {toArabicDigits(offlineHits.length)})
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <HadithCard
              item={item}
              bookTitle={item.book}
              onPress={
                item.apiSource === "hadeethenc.com"
                  ? () =>
                      router.push(
                        `/hadith-detail?hadithId=${encodeURIComponent(
                          item.id,
                        )}`,
                      )
                  : undefined
              }
              colors={colors}
              showMissingGrade={false}
            />
          )}
          ListEmptyComponent={
            searchQuery.isPending ? null : (
              <View style={styles.searchFeedback}>
                <Text
                  style={[
                    styles.searchFeedbackText,
                    {
                      color: colors.mutedForeground,
                    },
                  ]}>
                  لا نتائج لهذا البحث.
                </Text>
              </View>
            )
          }
        />
      ) : openSection ? (
        <FlatList
          data={openSection.hadiths}
          keyExtractor={(hadith) => `sec-hadith-${hadith}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="العودة إلى الفهرس"
              onPress={() => setOpenSection(null)}
              style={({ pressed }) => [
                styles.backToIndex,
                {
                  backgroundColor: colors.secondary,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <Feather name="arrow-up-right" size={15} color={colors.primary} />

              <Text
                style={[
                  styles.backToIndexText,
                  {
                    color: colors.primary,
                  },
                ]}>
                الفهرس
              </Text>
            </Pressable>
          }
          renderItem={({ item: hadithNumber }) => (
            <SectionHadithRow
              bookSlug={selectedBook!}
              hadithNumber={hadithNumber}
              bookTitle={headerTitle}
              colors={colors}
            />
          )}
        />
      ) : (
        <>
          {activeList.isPending ? <LoadingState /> : null}

          {activeList.isError ? (
            <ErrorState
              offline={isOfflineError(activeList.error)}
              onRetry={() => void activeList.refetch()}
            />
          ) : (
            <FlatList
              key={`hadith-list-${mode}-${selectedBook ?? selectedCategory ?? "none"}-${page}`}
              data={items}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <HadithCard
                  item={item}
                  bookTitle={headerTitle}
                  onPress={
                    item.apiSource === "hadeethenc.com"
                      ? () =>
                          router.push(
                            `/hadith-detail?hadithId=${encodeURIComponent(
                              item.id,
                            )}`,
                          )
                      : selectedBook
                        ? () =>
                            router.push(
                              `/hadith-detail?book=${encodeURIComponent(
                                selectedBook,
                              )}&number=${encodeURIComponent(item.reference)}`,
                            )
                        : undefined
                  }
                  colors={colors}
                  /** أهم إصلاح: المواضيع تمرّر false حتى لا تظهر رسالة الدرجة غير المتوفرة. */
                  showMissingGrade={mode === "books"}
                />
              )}
              ListHeaderComponent={
                <View>
                  {activeList.isFetching && !activeList.isPending ? (
                    <Text
                      style={[
                        styles.refreshingText,
                        { color: colors.mutedForeground },
                      ]}>
                      جارٍ تحميل الصفحة {toArabicDigits(page)}…
                    </Text>
                  ) : null}
                  {renderPager()}
                </View>
              }
              ListFooterComponent={renderPager()}
              ListEmptyComponent={
                activeList.isPending ? null : (
                  <View style={styles.searchFeedback}>
                    <Text
                      style={[
                        styles.searchFeedbackText,
                        { color: colors.mutedForeground },
                      ]}>
                      لا توجد أحاديث في هذه الصفحة.
                    </Text>
                  </View>
                )
              }
            />
          )}
        </>
      )}
    </Screen>
  );
}

/** صف حديث داخل باب مفتوح عبر useGetHadithByNumber: كاش React Query مشترك مع شاشة
 *  التفصيل، فلا تُنشَّط إلا الصفوف المرئية (virtualization). */
function SectionHadithRow({
  bookSlug,
  hadithNumber,
  bookTitle,
  colors,
}: {
  bookSlug: string;
  hadithNumber: number;
  bookTitle: string;
  colors: ReturnType<typeof useColors>;
}) {
  const router = useRouter();

  const query = useGetHadithByNumber(bookSlug, hadithNumber);
  const item = query.data;

  if (item === undefined || item === null) {
    return null;
  }

  return (
    <HadithCard
      item={item}
      bookTitle={bookTitle}
      onPress={() =>
        router.push(
          `/hadith-detail?book=${encodeURIComponent(
            bookSlug,
          )}&number=${encodeURIComponent(item.reference)}`,
        )
      }
      colors={colors}
      showMissingGrade={true}
      bookSlug={bookSlug}
    />
  );
}

const styles = StyleSheet.create({
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

  modeTabText: {
    fontSize: typography.bodySmall,
    fontWeight: "700",
  },

  list: {
    paddingBottom: 40,
  },

  listHeader: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },

  titleCopy: {
    alignItems: "flex-end",
    flex: 1,
  },

  screenTitle: {
    fontSize: typography.h1,
    fontWeight: "700",
    textAlign: "right",
  },

  screenMeta: {
    fontSize: typography.caption,
    marginTop: 2,
  },

  row: {
    alignItems: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },

  rowIcon: {
    alignItems: "center",
    borderRadius: radii.sm,
    height: 42,
    justifyContent: "center",
    width: 42,
  },

  rowCopy: {
    alignItems: "flex-end",
    flex: 1,
  },

  rowTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    textAlign: "right",
  },

  rowMeta: {
    fontSize: typography.caption,
    marginTop: 2,
  },

  indexButton: {
    alignItems: "center",
    borderRadius: radii.pill,
    flexDirection: "row-reverse",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  indexButtonText: {
    fontSize: typography.caption,
    fontWeight: "700",
  },

  moreButton: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: 38,
    justifyContent: "center",
    width: 38,
  },

  moreMenu: {
    alignSelf: "flex-end",
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
    minWidth: 180,
    overflow: "hidden",
  },

  moreMenuItem: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
    justifyContent: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },

  moreMenuText: {
    fontSize: typography.bodySmall,
    fontWeight: "600",
    textAlign: "right",
  },

  searchWrap: {
    marginBottom: spacing.sm,
  },

  searchBar: {
    alignItems: "center",
    borderRadius: radii.sm,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },

  searchInput: {
    flex: 1,
    fontSize: typography.body,
    textAlign: "right",
    paddingVertical: 0,
  },

  searchKindToggle: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  searchKindText: {
    fontSize: typography.caption,
    fontWeight: "700",
  },

  searchScope: {
    fontSize: typography.caption,
    marginTop: 4,
    textAlign: "right",
  },

  searchGroupTitle: {
    fontSize: typography.caption,
    fontWeight: "700",
    marginTop: spacing.sm,
    textAlign: "right",
  },

  searchFeedback: {
    padding: spacing.md,
  },

  searchFeedbackText: {
    fontSize: typography.bodySmall,
    textAlign: "right",
  },

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

  backToIndexText: {
    fontSize: typography.caption,
    fontWeight: "700",
  },

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

  sectionCopy: {
    alignItems: "flex-end",
    flex: 1,
  },

  sectionTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    textAlign: "right",
  },

  sectionMeta: {
    fontSize: typography.caption,
    marginTop: 2,
  },

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
    alignItems: "center",
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },

  hadithMetaText: {
    fontSize: typography.caption,
  },

  detailHint: {
    fontSize: typography.caption,
    fontWeight: "700",
  },

  hadithFooter: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: 5,
    marginTop: spacing.sm,
  },

  hadithSource: {
    flex: 1,
    fontSize: typography.caption,
    fontWeight: "600",
    textAlign: "right",
  },

  refreshingText: {
    fontSize: typography.caption,
    marginBottom: spacing.xs,
    textAlign: "center",
  },

  pager: {
    alignItems: "center",
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

  pagerText: {
    fontSize: typography.bodySmall,
    fontWeight: "700",
  },

  pageIndicator: {
    alignItems: "center",
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    minWidth: 38,
    paddingHorizontal: 10,
  },

  pageIndicatorText: {
    fontSize: typography.bodySmall,
    fontWeight: "700",
  },

  nextPageArrow: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
});
