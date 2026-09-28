import React, { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import {
  ErrorState,
  IconButton,
  isOfflineError,
  LoadingState,
  Screen,
} from "@/components/ui";
import { radii, spacing, typography } from "@/constants/tokens";
import { useColors } from "@/hooks/useColors";
import {
  useLibraryBookChapters,
  useLibraryBookPage,
} from "@/hooks/useIslamicBooks";
import type { IslamicLibrarySource } from "@/lib/books/types";

function toArabicDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
}

/**
 * تحويل صفحة تراث (HTML خفيف) إلى نص مع محافظة على فواصل الأسطر.
 * لا نعرض وسومًا خامًا ولا نستدعي أي مُحرِّك HTML خارجي.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*\/?\s*(?:p|div|section|article|br|h[1-6]|li|blockquote|tr|table)[^>]*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export default function BookReader() {
  const colors = useColors();
  const router = useRouter();

  const params = useLocalSearchParams<{
    source?: string;
    rawId?: string;
    title?: string;
    page?: string;
    pages?: string;
  }>();

  const source: IslamicLibrarySource =
    params.source === "islamhouse" ? "islamhouse" : "turath";
  const rawId = params.rawId ?? "";
  const totalPages = Number.parseInt(params.pages ?? "", 10);
  const knownTotal = Number.isInteger(totalPages) && totalPages > 0;

  const [page, setPage] = useState(
    Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
  );
  const [indexVisible, setIndexVisible] = useState(false);

  useEffect(() => {
    setIndexVisible(false);
  }, [page]);

  const pageQuery = useLibraryBookPage(source, rawId || undefined, page);
  const chaptersQuery = useLibraryBookChapters(source, rawId || undefined);

  const canGoPrevious = page > 1;
  const canGoNext = !knownTotal || page < totalPages;

  const plainText = pageQuery.data ? htmlToText(pageQuery.data.text) : "";

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-right"
          label="العودة"
          onPress={() => router.back()}
          variant="soft"
        />
        <View style={styles.titleCopy}>
          <Text
            numberOfLines={1}
            style={[styles.title, { color: colors.foreground }]}>
            {params.title ?? "الكتاب"}
          </Text>
        </View>

        {chaptersQuery.data && chaptersQuery.data.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              indexVisible ? "إغلاق الفهرس" : "فتح الفهرس"
            }
            onPress={() => setIndexVisible((visible) => !visible)}
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
                { color: indexVisible ? colors.primaryForeground : colors.primary },
              ]}>
              {indexVisible ? "الإغلاق" : "الفهرس"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {indexVisible && chaptersQuery.data && chaptersQuery.data.length > 0 ? (
        <ScrollView
          style={[styles.indexPanel, { backgroundColor: colors.card, borderColor: colors.border }]}
          contentContainerStyle={styles.indexContent}
          showsVerticalScrollIndicator={false}>
          {chaptersQuery.data.map((chapter) => {
            const selected = chapter.page === page;
            return (
              <Pressable
                key={chapter.id}
                accessibilityRole="button"
                accessibilityLabel={`الانتقال إلى ${chapter.title}`}
                onPress={() => setPage(chapter.page)}
                style={({ pressed }) => [
                  styles.chapterRow,
                  selected && styles.chapterRowSelected,
                  { backgroundColor: selected ? colors.secondary : "transparent", opacity: pressed ? 0.7 : 1 },
                ]}>
                <Text style={[styles.chapterPage, { color: colors.primary }]}>
                  {toArabicDigits(chapter.page)}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.chapterTitle, { color: colors.foreground }]}>
                  {chapter.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {pageQuery.isPending ? <LoadingState label="جاري تحميل الصفحة…" /> : null}
      {pageQuery.isError ? (
        <ErrorState
          offline={isOfflineError(pageQuery.error)}
          onRetry={() => void pageQuery.refetch()}
        />
      ) : null}

      {pageQuery.data ? (
        <>
          {/* شريط الترقيم */}
          <View style={styles.pagerTop}>
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
              <Text style={[styles.pagerText, { color: colors.primary }]}>
                التالي
              </Text>
              <Feather name="chevron-left" size={17} color={colors.primary} />
            </Pressable>
          </View>

          {pageQuery.data.heading ? (
            <Text style={[styles.heading, { color: colors.primary }]}>
              {pageQuery.data.heading}
            </Text>
          ) : null}

          <ScrollView
            style={[styles.pageCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            contentContainerStyle={styles.pageContent}
            showsVerticalScrollIndicator={false}>
            {plainText ? (
              <Text style={[styles.pageText, { color: colors.foreground }]}>
                {plainText}
              </Text>
            ) : (
              <Text style={[styles.pageEmpty, { color: colors.mutedForeground }]}>
                لا يوجد نص في هذه الصفحة.
              </Text>
            )}
          </ScrollView>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  titleCopy: {
    alignItems: "flex-end",
    flex: 1,
  },
  title: {
    fontSize: typography.h1,
    fontWeight: "700",
    textAlign: "right",
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
  indexPanel: {
    borderRadius: radii.md,
    borderWidth: 1,
    maxHeight: 260,
    marginBottom: spacing.sm,
  },
  indexContent: {
    padding: spacing.xs,
  },
  chapterRow: {
    alignItems: "center",
    borderRadius: radii.sm,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  chapterRowSelected: {},
  chapterPage: {
    fontSize: typography.bodySmall,
    fontWeight: "700",
    minWidth: 30,
    textAlign: "center",
  },
  chapterTitle: {
    flex: 1,
    fontSize: typography.bodySmall,
    fontWeight: "600",
    textAlign: "right",
  },
  pagerTop: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
    justifyContent: "center",
    marginBottom: spacing.sm,
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
  heading: {
    fontSize: typography.body,
    fontWeight: "700",
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  pageCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
  },
  pageContent: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  pageText: {
    fontSize: typography.bodyLarge,
    lineHeight: 34,
    textAlign: "right",
  },
  pageEmpty: {
    fontSize: typography.bodySmall,
    textAlign: "center",
    paddingVertical: spacing.xl,
  },
});