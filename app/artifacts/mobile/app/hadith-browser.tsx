import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useGetBookHadiths,
  useGetHadithBooks,
  useGetHadithCategories,
  useGetHadiths,
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

  const listQuery = useGetBookHadiths(
    mode === "books" && selectedBook
      ? { bookSlug: selectedBook, page, perPage: 10 }
      : null,
  );
  const topicQuery = useGetHadiths(
    mode === "topics" && selectedCategory
      ? { categoryId: selectedCategory, page, perPage: 10 }
      : undefined,
    { query: { enabled: mode === "topics" && Boolean(selectedCategory) } },
  );

  const books = booksQuery.data ?? [];
  const currentBook = books.find(
    (candidate) => candidate.slug === selectedBook,
  );
  const categories = categoriesQuery.data ?? [];
  const activeList = mode === "books" ? listQuery : topicQuery;

  const backToList = () => {
    setSelectedBook(null);
    setSelectedCategory(null);
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
            {headerTitle}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            الصفحة {activeList.data?.page ?? page} من{" "}
            {activeList.data
              ? Math.ceil(activeList.data.total / activeList.data.perPage)
              : "—"}
          </Text>
        </View>
      </View>

      {activeList.isPending ? <LoadingState /> : null}
      {activeList.isError ? (
        <ErrorState
          offline={isOfflineError(activeList.error)}
          onRetry={() => void activeList.refetch()}
        />
      ) : (
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
                {item.attribution ? (
                  <Text
                    style={[
                      styles.hadithMetaText,
                      { color: colors.mutedForeground },
                    ]}>
                    الراوي: {item.attribution}
                  </Text>
                ) : null}
                <GradeBadge grade={item.grade} showMissing />
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
      )}
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
  hadithFooter: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: 5,
    marginTop: spacing.sm,
  },
  hadithSource: { fontSize: typography.caption, fontWeight: "600" },
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
