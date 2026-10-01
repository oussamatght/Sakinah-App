import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
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
  usePrefetchNextBookPage,
} from "@/hooks/useIslamicBooks";
import { parseBookSource, providerCapabilities } from "@/lib/books";
import type { IslamicLibrarySource } from "@/lib/books/types";
import { UpstreamError } from "@/lib/api/types";

function toArabicDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
}

/**
 * المحتوى مرفوض نهائيًا لا مؤقّتًا: 413 (نصّ ضخم) و404/415/501 (لا نقطة نهاية
 * لهذا الكتاب) — إعادة المحاولة لن تنجح، فلا نعرض "حاول مجددًا".
 */
function isContentUnavailable(error: unknown): boolean {
  const status = error instanceof UpstreamError ? error.status : undefined;
  return status === 413 || status === 404 || status === 415 || status === 501;
}

/** تحويل صفحة تراث (HTML خفيف) إلى نص مع حفظ فواصل الأسطر — بلا وسوم خام
 *  ولا مُحرِّك HTML خارجي. */
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

  // نفس قاعدة book-details: مصدر غير معروف ⇒ null لا الطي على "turath" (كان يجعل
  // قارئ تراث يطلب slug إسلاميك فيبقى فارغًا).
  const source = parseBookSource(params.source);
  const rawId = params.rawId ?? "";
  const missingParams = !source || !rawId;
  const totalPages = Number.parseInt(params.pages ?? "", 10);
  const knownTotal = Number.isInteger(totalPages) && totalPages > 0;

  const [page, setPage] = useState(
    Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
  );
  const [indexVisible, setIndexVisible] = useState(false);

  useEffect(() => {
    setIndexVisible(false);
  }, [page]);

  const typedSource = source as IslamicLibrarySource;
  const pageQuery = useLibraryBookPage(typedSource, rawId || undefined, page);
  const chaptersQuery = useLibraryBookChapters(typedSource, rawId || undefined);

  /**
   * تنقّل «فصل-فصل» للمصادر التي وحدها هو الفصل (أرقام صفحاتها متفرّقة، وعرض
   * النص نفسه على ٥ و٦ و٧ يربك القارئ)؛ لمصادر الصفحات يبقى صفحة-بصفحة.
   */
  const chapterPages = useMemo(() => {
    const pages = (chaptersQuery.data ?? [])
      .map((chapter) => chapter.page)
      .filter((value) => Number.isFinite(value) && value > 0);
    return [...new Set(pages)].sort((a, b) => a - b);
  }, [chaptersQuery.data]);

  const navigateByChapter =
    source != null && providerCapabilities(typedSource).readsByChapter === true;

  const nextTarget = useMemo(() => {
    if (navigateByChapter) return chapterPages.find((value) => value > page);
    if (knownTotal && page >= totalPages) return undefined;
    return page + 1;
  }, [navigateByChapter, chapterPages, page, knownTotal, totalPages]);

  const previousTarget = useMemo(() => {
    if (navigateByChapter) {
      const before = chapterPages.filter((value) => value < page);
      return before.length > 0 ? before[before.length - 1] : undefined;
    }
    return page > 1 ? page - 1 : undefined;
  }, [navigateByChapter, chapterPages, page]);

  const canGoPrevious = previousTarget !== undefined;
  const canGoNext = nextTarget !== undefined;

  // جلب صفحة واحدة فقط مسبقًا (لا الكتاب) — نفس مفتاح الاستعلام فلا يتكرر الطلب.
  usePrefetchNextBookPage({
    enabled: rawId.length > 0 && !missingParams && canGoNext,
    source: typedSource,
    rawId: rawId || undefined,
    page,
    hasNext: canGoNext,
  });

  const plainText = useMemo(
    () => (pageQuery.data ? htmlToText(pageQuery.data.text) : ""),
    [pageQuery.data],
  );

  // مصدر لا يُقرأ داخل التطبيق (إسلام هاوس) أو رفض المصدر المحتوى نهائيًا.
  const contentUnavailable =
    source != null &&
    (providerCapabilities(source).canReadByPage === false ||
      isContentUnavailable(pageQuery.error));

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
        // FlatList لا ScrollView+map: فهرس تراث قد يكون آلاف العناوين، وداخل View
        // (لا ScrollView) يُطلق تحذير VirtualizedList متداخل.
        <FlatList
          data={chaptersQuery.data}
          // عناوين مكرّرة في شجرة تراث ⇒ معرّف فريد فعلًا بتركيبة المعرّف والترتيب.
          keyExtractor={(chapter, index) => `${chapter.id}-${index}`}
          style={[
            styles.indexPanel,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          contentContainerStyle={styles.indexContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          windowSize={5}
          removeClippedSubviews
          renderItem={({ item: chapter }) => {
            const selected = chapter.page === page;
            return (
              <Pressable
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
          }}
        />
      ) : null}

      {missingParams ? (
        <ErrorState
          message="رابط الكتاب غير مكتمل (المصدر أو المعرّف مفقود). أعد فتح الكتاب من قائمة الكتب."
          onRetry={() => router.replace("/books")}
        />
      ) : null}
      {!missingParams && pageQuery.isPending ? (
        <LoadingState label="جاري تحميل الصفحة…" />
      ) : null}
      {!missingParams && pageQuery.isError ? (
        contentUnavailable ? (
          <ErrorState
            title="محتوى الكتاب غير متاح للقراءة حاليًا"
            message="لا يوفّر المصدر نصًّا قابلًا للعرض لهذا الكتاب. افتح ملف PDF من صفحة تفاصيل الكتاب أو ارجع إلى المكتبة."
            actionLabel="العودة إلى المكتبة"
            onRetry={() => router.replace("/books")}
          />
        ) : (
          <ErrorState
            offline={isOfflineError(pageQuery.error)}
            // تجاوزتَ نهاية الكتاب (صفحة بلا نص) ⇒ الرجوع للخلف أنفع من تكرار الطلب.
            title={page > 1 ? "لا توجد هذه الصفحة" : undefined}
            message={
              page > 1
                ? "الصفحة المطلوبة فارغة؛ غالبًا تجاوزتَ آخر صفحة في الكتاب. ارجع صفحة للخلف."
                : undefined
            }
            actionLabel={page > 1 ? "الرجوع للخلف" : undefined}
            onRetry={
              previousTarget !== undefined
                ? () => setPage(previousTarget)
                : () => void pageQuery.refetch()
            }
          />
        )
      ) : null}
      {/* صفحة بلا نص (كتاب بلا فهرس) — قبل هذا الشرط كانت الشاشة فارغة بلا رسالة. */}
      {!missingParams &&
      !pageQuery.isPending &&
      !pageQuery.isError &&
      plainText.trim().length === 0 ? (
        <ErrorState
          message={
            contentUnavailable
              ? "محتوى الكتاب غير متاح للقراءة حاليًا من هذا المصدر. افتح ملف PDF من صفحة تفاصيل الكتاب."
              : "لا يوجد نص متاح لهذه الصفحة من هذا المصدر. جرّب فهرس الكتاب أو حمّل ملف PDF."
          }
          actionLabel={contentUnavailable ? "العودة إلى المكتبة" : undefined}
          onRetry={
            contentUnavailable
              ? () => router.replace("/books")
              : () => void pageQuery.refetch()
          }
        />
      ) : null}

      {pageQuery.data && plainText.trim().length > 0 ? (
        <>
          <View style={styles.pagerTop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="الصفحة السابقة"
              disabled={!canGoPrevious}
              onPress={() => {
                if (previousTarget !== undefined) setPage(previousTarget);
              }}
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
              onPress={() => {
                if (nextTarget !== undefined) setPage(nextTarget);
              }}
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
  },  indexContent: {
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