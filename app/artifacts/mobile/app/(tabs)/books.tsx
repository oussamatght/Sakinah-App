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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useLibraryBookList,
  useLibraryCategories,
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
import { radii, spacing, typography } from "@/constants/tokens";
import { useColors } from "@/hooks/useColors";
import type { IslamicBook } from "@/lib/books/types";

const PAGE_SIZE = 20;
const TAB_BAR_HEIGHT = 84;

function toArabicDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
}

export default function BooksTab() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const bottomOverlap = TAB_BAR_HEIGHT + insets.bottom;

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const categoriesQuery = useLibraryCategories("islamhouse");
  const categories = useMemo(
    () => (categoriesQuery.data ?? []).filter((category) => !category.parentId),
    [categoriesQuery.data],
  );

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [query, selectedCategory]);

  const searching = query.length > 0;

  const listQuery = useLibraryBookList({
    query,
    source: "islamhouse",
    categoryId: searching ? undefined : (selectedCategory ?? undefined),
    page,
    perPage: PAGE_SIZE,
  });

  const books = listQuery.data?.items ?? [];

  const reportedTotal = Number(listQuery.data?.total ?? 0);
  const reportedPerPage = Math.max(1, Number(listQuery.data?.perPage ?? PAGE_SIZE));
  const reportedTotalPages = Math.max(
    0,
    Number((listQuery.data as { totalPages?: number } | undefined)?.totalPages ?? 0),
  );
  const totalPages =
    reportedTotalPages > 0
      ? reportedTotalPages
      : reportedTotal > 0
        ? Math.max(1, Math.ceil(reportedTotal / reportedPerPage))
        : Math.max(1, page);

  const explicitHasMore = listQuery.data?.hasMore;
  const inferredHasMore = books.length >= reportedPerPage;
  const hasMore =
    explicitHasMore === true
      ? true
      : explicitHasMore === false
        ? false
        : page < totalPages || inferredHasMore;

  const canGoPrevious = page > 1 && !listQuery.isPending;
  const canGoNext = !listQuery.isPending && !listQuery.isFetching && hasMore;

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
        <Text style={[styles.pagerText, { color: colors.primary }]}>السابق</Text>
      </Pressable>

      <View
        style={[
          styles.pageIndicator,
          { backgroundColor: colors.card, borderColor: colors.border },
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
        <Text style={[styles.pagerText, { color: colors.primary }]}>التالي</Text>
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
        const selected = selectedCategory === category.id;
        return (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`تصفح ${category.title}`}
            onPress={() => setSelectedCategory(category.id)}
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
          <BookCard book={item} onPress={() => openBook(item)} />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: bottomOverlap + spacing.md },
        ]}
        ListHeaderComponent={
          <View>
            <AppHeader eyebrow="من المكتبة الإسلامية" title="الكتب" />

            <SearchBar
              placeholder={
                searching
                  ? "ابحث في تراث وإسلام هاوس…"
                  : "ابحث في شجرة الكتب…"
              }
              value={search}
              onChangeText={setSearch}
            />

            <Text style={[styles.scopeNote, { color: colors.mutedForeground }]}>
              {searching
                ? "البحث يشمل مكتبة تراث ومكتبة إسلام هاوس."
                : "التصفح عبر تصنيفات إسلام هاوس (تراث لا يقدم نقطة تصفح قائمة)."}
            </Text>

            {!searching ? (
              <>
                {categoriesQuery.isPending ? null : null}
                {renderCategories()}
                {categoriesQuery.isError ? (
                  <Text
                    style={[styles.scopeNote, { color: colors.mutedForeground }]}>
                    تعذر تحميل التصنيفات — يمكنك تصفح قائمة الكتب مباشرة.
                  </Text>
                ) : null}
              </>
            ) : null}

            {listQuery.isError ? (
              <ErrorState
                offline={isOfflineError(listQuery.error)}
                onRetry={() => void listQuery.refetch()}
              />
            ) : null}

            {!listQuery.isPending && books.length > 0 ? renderPager() : null}
          </View>
        }
        ListEmptyComponent={
          listQuery.isPending ? (
            <LoadingState label="جاري تحميل الكتب…" />
          ) : listQuery.isError ? null : (
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
          !listQuery.isPending && books.length > 0 ? renderPager() : null
        }
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