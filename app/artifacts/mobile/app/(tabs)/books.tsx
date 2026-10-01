import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import {
  useLibraryAdvancedSearch,
  useLibraryBookList,
  useLibraryCategories,
  useLibraryCategoryBranches,
  usePrefetchNextAdvancedSearchPage,
} from "@/hooks/useIslamicBooks";
import {
  AppHeader,
  EmptyState,
  ErrorState,
  isOfflineError,
  LoadingState,
  SearchBar,
} from "@/components/ui";
import BookCard from "@/components/BookCard";
import BookSearchSheet, {
  type AdvancedSearchValue,
} from "@/components/BookSearchSheet";
import SearchPlanNotice from "@/components/SearchPlanNotice";
import { radii, spacing, typography } from "@/constants/tokens";
import { useColors } from "@/hooks/useColors";
import { providerCapabilities } from "@/lib/books";
import type { IslamicBook, IslamicLibrarySource } from "@/lib/books/types";

const PAGE_SIZE = 20;

const EMPTY_ADVANCED: AdvancedSearchValue = {
  mode: "free",
  query: "",
  author: "",
  categoryId: "",
  source: "all",
};

/**
 * ما ReallyBrowser يمكن للمستخدم فعله بهذا الكتاب.
 * «قراءة» لا تُعرض إلا مع readability=readable: فـhas_text من إسلاميك يكذب على
 * ٥٥ كتابًا تُرجع ‎/text خطأ 413، فوعد القراءة ثم إرساله إلى صفحة بلا نص أسوأ.
 */
function actionLabelFor(book: IslamicBook): string {
  const capabilities = providerCapabilities(book.source);
  if (book.readability === "readable" && capabilities.canReadByPage) {
    return "قراءة";
  }
  if (capabilities.canDownload && (book.attachments?.length || book.downloadUrl)) {
    return "PDF";
  }
  return "تفاصيل";
}

function toArabicDigits(value: number | string): string {
  return String(value).replace(
    /[0-9]/g,
    (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)],
  );
}

export default function BooksTab() {
  const colors = useColors();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  /**
   * التصنيف المختار = (المصدر + المعرّف): معرّفات كل مصدر فضاء منفصل (أرقام
   * إسلام هاوس مقابل slugs إسلاميك)، فاختيارها بلا مصدر يخلطها فيرجع "لا عناصر".
   */
  const [selectedCategory, setSelectedCategory] = useState<{
    source: IslamicLibrarySource;
    id: string;
    title: string;
  } | null>(null);
  const [page, setPage] = useState(1);

  // البحث المتقدم: مسودة منفصلة + نسخة «مُقدَّمة» لا تتغيّر إلا بضغط «بحث» (لا طلب على كل ضغطة مفتاح).
  const [sheetVisible, setSheetVisible] = useState(false);
  const [advanced, setAdvanced] = useState<AdvancedSearchValue>(EMPTY_ADVANCED);
  const [appliedAdvanced, setAppliedAdvanced] =
    useState<AdvancedSearchValue>(EMPTY_ADVANCED);
  const [advancedPage, setAdvancedPage] = useState(1);

  /**
   * شرائح التصفّح: الفروع **الصالحة** وحدها.
   * كانت الشريحة تستخدم categories/showall من إسلام هاوس (٤٣٧ عنصرًا) وهي معرّفات
   * من فضاء مختلف تُرجع "لا عناصر" دائمًا، مع رسم مئات العناصر دفعة واحدة.
   */
  const islamHouseBranchesQuery = useLibraryCategoryBranches("islamhouse");
  const islamicAppGenresQuery = useLibraryCategories("islamicapp");
  const categories = useMemo(() => {
    const ih = (islamHouseBranchesQuery.data ?? []).map((category) => ({
      source: "islamhouse" as const,
      id: category.id,
      title: category.title,
    }));
    const ia = (islamicAppGenresQuery.data ?? []).map((category) => ({
      source: "islamicapp" as const,
      id: category.id,
      title: category.title,
    }));
    return [...ih, ...ia];
  }, [islamHouseBranchesQuery.data, islamicAppGenresQuery.data]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [query, selectedCategory]);

  const advancedActive =
    appliedAdvanced.query.trim().length > 0 ||
    appliedAdvanced.author.trim().length > 0 ||
    appliedAdvanced.categoryId.trim().length > 0;

  const searching = query.length > 0;

  const advancedQuery = useLibraryAdvancedSearch({
    mode: appliedAdvanced.mode,
    query: appliedAdvanced.query,
    author: appliedAdvanced.author,
    categoryId: appliedAdvanced.categoryId,
    source: appliedAdvanced.source,
    page: advancedPage,
    perPage: PAGE_SIZE,
  });

  const listQuery = useLibraryBookList({
    query,
    source: selectedCategory?.source ?? "islamhouse",
    categoryId: searching ? undefined : (selectedCategory?.id ?? undefined),
    page,
    perPage: PAGE_SIZE,
  });

  const books = advancedActive
    ? (advancedQuery.data?.items ?? [])
    : (listQuery.data?.items ?? []);
  const activeQuery = advancedActive ? advancedQuery : listQuery;

  const reportedTotal = Number(activeQuery.data?.total ?? 0);
  const reportedPerPage = Math.max(
    1,
    Number(activeQuery.data?.perPage ?? PAGE_SIZE),
  );
  const reportedTotalPages = Math.max(
    0,
    Number(
      (activeQuery.data as { totalPages?: number } | undefined)?.totalPages ??
        0,
    ),
  );
  const totalPages =
    reportedTotalPages > 0
      ? reportedTotalPages
      : reportedTotal > 0
        ? Math.max(1, Math.ceil(reportedTotal / reportedPerPage))
        : Math.max(1, advancedActive ? advancedPage : page);

  const explicitHasMore = activeQuery.data?.hasMore;
  const inferredHasMore = books.length >= reportedPerPage;
  const hasMore =
    explicitHasMore === true
      ? true
      : explicitHasMore === false
        ? false
        : (advancedActive ? advancedPage : page) < totalPages ||
          inferredHasMore;

  const currentPage = advancedActive ? advancedPage : page;
  const goToPage = (next: number) => {
    const target = Math.max(1, next);
    if (advancedActive) setAdvancedPage(target);
    else setPage(target);
  };

  const canGoPrevious = currentPage > 1 && !activeQuery.isPending;
  const canGoNext =
    !activeQuery.isPending && !activeQuery.isFetching && hasMore;

  // جلب صفحة النتائج التالية فقط — لا يُطلق طلبًا إضافيًا عند فتحها لاحقًا.
  usePrefetchNextAdvancedSearchPage({
    enabled: advancedActive && !activeQuery.isPending,
    filters: {
      mode: appliedAdvanced.mode,
      query: appliedAdvanced.query,
      author: appliedAdvanced.author,
      categoryId: appliedAdvanced.categoryId,
      source: appliedAdvanced.source,
    },
    page: advancedPage,
    perPage: PAGE_SIZE,
    hasMore,
  });

  const submitAdvanced = () => {
    setAppliedAdvanced(advanced);
    setAdvancedPage(1);
    setSheetVisible(false);
  };

  const resetAdvanced = () => {
    setAdvanced(EMPTY_ADVANCED);
    setAppliedAdvanced(EMPTY_ADVANCED);
    setAdvancedPage(1);
    setSheetVisible(false);
  };

  const openBook = (book: IslamicBook) => {
    router.push({
      pathname: "/book-details",
      params: {
        source: book.source,
        rawId: book.rawId,
        title: book.title,
        author: book.author ?? "",
      },
    });
  };

  const selectedCategoryTitle = useMemo(() => {
    if (!selectedCategory) return undefined;
    return categories.find(
      (category) =>
        category.source === selectedCategory.source &&
        category.id === selectedCategory.id,
    )?.title;
  }, [categories, selectedCategory]);

  const renderPager = () => (
    <View style={styles.pager}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="الصفحة السابقة"
        disabled={!canGoPrevious}
        onPress={() => goToPage(currentPage - 1)}
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
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}>
        <Text style={[styles.pageIndicatorText, { color: colors.foreground }]}>
          {toArabicDigits(currentPage)}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="الصفحة التالية"
        disabled={!canGoNext}
        onPress={() => goToPage(currentPage + 1)}
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
    </View>
  );

  const renderCategories = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.categoryRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: selectedCategory === null }}
        onPress={() => setSelectedCategory(null)}
        style={[
          styles.categoryChip,
          selectedCategory === null && { backgroundColor: colors.primary },
        ]}>
        <Text
          style={[
            styles.categoryChipText,
            {
              color:
                selectedCategory === null
                  ? colors.primaryForeground
                  : colors.mutedForeground,
            },
          ]}>
          الكل
        </Text>
      </Pressable>

      {categories.map((category) => {
        const selected =
          selectedCategory?.source === category.source &&
          selectedCategory?.id === category.id;
        return (
          <Pressable
            key={`${category.source}:${category.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`تصفح ${category.title}`}
            onPress={() =>
              setSelectedCategory(
                selected
                  ? null
                  : {
                      source: category.source,
                      id: category.id,
                      title: category.title,
                    },
              )
            }
            style={[
              styles.categoryChip,
              selected && { backgroundColor: colors.primary },
            ]}>
            <Text
              style={[
                styles.categoryChipText,
                {
                  color: selected
                    ? colors.primaryForeground
                    : colors.mutedForeground,
                },
              ]}>
              {category.title}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={books}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <BookCard
            book={item}
            onPress={() => openBook(item)}
            categoryTitle={advancedActive ? undefined : selectedCategoryTitle}
            actionLabel={actionLabelFor(item)}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <AppHeader
              eyebrow="من المكتبة الإسلامية"
              title="الكتب"
              action="sliders"
              actionLabel="الإعدادات"
              onAction={() => router.push("/settings")}
            />

            <SearchBar
              placeholder={
                searching ? "ابحث في تراث وإسلام هاوس…" : "ابحث في شجرة الكتب…"
              }
              value={search}
              onChangeText={setSearch}
            />

            <Pressable
              testID="open-advanced-search"
              accessibilityRole="button"
              accessibilityLabel="بحث متقدم"
              onPress={() => setSheetVisible(true)}
              style={({ pressed }) => [
                styles.advancedButton,
                {
                  backgroundColor: advancedActive
                    ? colors.primary
                    : colors.secondary,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <Feather
                name="sliders"
                size={16}
                color={
                  advancedActive ? colors.primaryForeground : colors.primary
                }
              />
              <Text
                style={[
                  styles.advancedButtonText,
                  {
                    color: advancedActive
                      ? colors.primaryForeground
                      : colors.primary,
                  },
                ]}>
                بحث متقدم
              </Text>
            </Pressable>

            {advancedActive ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="إلغاء الفلاتر المتقدمة"
                onPress={resetAdvanced}
                style={({ pressed }) => [
                  styles.clearButton,
                  {
                    backgroundColor: colors.secondary,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <Text style={[styles.clearText, { color: colors.primary }]}>
                  مسح الفلاتر المتقدمة
                </Text>
              </Pressable>
            ) : null}

            <Text style={[styles.scopeNote, { color: colors.mutedForeground }]}>
              {advancedActive
                ? "نتائج البحث المتقدم — التقرير أدناه يوضّح ما نُفِّذ على خادم كل مصدر."
                : searching
                  ? "البحث يشمل مكتبة تراث ومكتبة إسلام هاوس ومكتبة إسلاميك."
                  : "التصفح عبر تصنيفات إسلام هاوس وتصنيفات إسلاميك (تراث لا يقدم نقطة تصفح قائمة)."}
            </Text>

            {advancedActive ? (
              <SearchPlanNotice notices={advancedQuery.data?.notices} />
            ) : null}

            {!advancedActive && !searching ? (
              <>
                {renderCategories()}
                {islamHouseBranchesQuery.isError &&
                islamicAppGenresQuery.isError ? (
                  <Text
                    style={[
                      styles.scopeNote,
                      { color: colors.mutedForeground },
                    ]}>
                    تعذر تحميل التصنيفات — يمكنك تصفح قائمة الكتب مباشرة.
                  </Text>
                ) : null}
              </>
            ) : null}

            {activeQuery.isError ? (
              <ErrorState
                offline={isOfflineError(activeQuery.error)}
                onRetry={() => void activeQuery.refetch()}
              />
            ) : null}

            {!activeQuery.isPending && books.length > 0 ? renderPager() : null}
          </View>
        }
        ListEmptyComponent={
          activeQuery.isPending ? (
            <LoadingState label="جاري تحميل الكتب…" />
          ) : activeQuery.isError ? null : advancedActive ? (
            <EmptyState
              title="لم نجد نتائج"
              message="جرّب تعديل الفلاتر أو اختر مصدرًا آخر — بعض المصادر لا تدعم كل الفلاتر."
            />
          ) : (
            <EmptyState
              title={searching ? "لم نجد نتائج" : "لا توجد كتب"}
              message={
                searching
                  ? "جرّب عنوانًا أو اسم مؤلف مختلفًا."
                  : "لم يقدم هذا التصنيف كتبًا من إسلام هاوس."
              }
            />
          )
        }
        ListFooterComponent={
          !activeQuery.isPending && books.length > 0 ? renderPager() : null
        }
      />

      <BookSearchSheet
        visible={sheetVisible}
        value={advanced}
        onChange={setAdvanced}
        onClose={() => setSheetVisible(false)}
        onSubmit={submitAdvanced}
        onReset={resetAdvanced}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  scopeNote: {
    fontSize: typography.caption,
    marginTop: spacing.xs,
    textAlign: "right",
  },
  advancedButton: {
    alignItems: "center",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row-reverse",
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    alignSelf: "flex-start",
  },
  advancedButtonText: {
    fontSize: typography.bodySmall,
    fontWeight: "700",
  },
  clearButton: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  clearText: {
    fontSize: typography.caption,
    fontWeight: "700",
  },
  categoryRow: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  categoryChip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  categoryChipText: {
    fontSize: typography.bodySmall,
    fontWeight: "700",
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
});
