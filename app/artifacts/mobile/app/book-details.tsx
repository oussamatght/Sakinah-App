import React, { useMemo, useState } from "react";
import {
  Linking,
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
  useLibraryAuthor,
  useLibraryBookDetails,
} from "@/hooks/useIslamicBooks";
import {
  bookSourceLabel,
  parseBookSource,
  providerCapabilities,
} from "@/lib/books";
import type {
  IslamicBookChapter,
  IslamicLibrarySource,
} from "@/lib/books/types";

/** فهرس تراث قد يبلغ آلاف العناوين — نعرض دفعة ونطلب المزيد بالضغط. */
const CHAPTERS_STEP = 25;

function toArabicDigits(value: number | string): string {
  return String(value).replace(
    /[0-9]/g,
    (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)],
  );
}

function sourceLabel(source: IslamicLibrarySource): string {
  return bookSourceLabel(source);
}

export default function BookDetails() {
  const colors = useColors();
  const router = useRouter();

  const params = useLocalSearchParams<{
    source?: string;
    rawId?: string;
    title?: string;
    author?: string;
  }>();

  // مصدر غير معروف ⇒ null لا الطي على "turath" (كان يجعل المزوّدين يُطلبان من تراث ⇒ شاشة فارغة).
  const source = parseBookSource(params.source);
  const rawId = params.rawId ?? "";
  const missingParams = !source || !rawId;

  const detailsQuery = useLibraryBookDetails(
    source as IslamicLibrarySource,
    rawId || undefined,
  );
  const capabilities = providerCapabilities(source as IslamicLibrarySource);

  const book = detailsQuery.data?.book;
  const chapters = detailsQuery.data?.chapters;

  /**
   * القراءة داخل التطبيق متاحة إن كان المزوّد يدعمها **وللكتاب نصّ**: إسلاميك
   * يوفّر has_text لكل كتاب، وكتب PDF فقط يجب ألّا يُعرض لها زر القراءة.
   */
  const canRead = capabilities.canReadByPage && book?.readability === "readable";

  const authorQuery = useLibraryAuthor(
    source as IslamicLibrarySource,
    book?.authorId,
  );
  const authorBio = authorQuery.data?.biography;

  const [chapterLimit, setChapterLimit] = useState(CHAPTERS_STEP);
  // نرسم جزءًا من الفهرس فقط: map كامل داخل ScrollView يجمّد الكتب ذات آلاف
  // العناوين (ولا تضع FlatList داخل ScrollView).
  const visibleChapters = useMemo(
    () => (chapters ?? []).slice(0, chapterLimit),
    [chapters, chapterLimit],
  );
  const remainingChapters = Math.max(
    0,
    (chapters?.length ?? 0) - visibleChapters.length,
  );

  const openUrl = async (url: string | undefined) => {
    if (!url) return;
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
  };

  const openReader = (page = 1) => {
    // مصدر غير معروف ⇒ لا ننتقل: `params.source = null` كان يصبح نص "null" في الرابط.
    if (!source) return;
    // نبدأ من أول صفحة ** فيها نصّ فعلًا (الفهرس قد يبدأ من صفحة 12)، وإلا استقبل
    // القارئ صفحة فارغة كأنها أول صفحة في الكتاب.
    const firstRealPage =
      page > 1
        ? page
        : (visibleChapters.find((chapter) => chapter.page > 0)?.page ?? 1);
    router.push({
      pathname: "/book-reader",
      params: {
        source,
        rawId,
        title: book?.title ?? params.title ?? "",
        page: String(firstRealPage),
        pages: typeof book?.pages === "number" ? String(book.pages) : "",
      },
    });
  };

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
          <Text style={[styles.title, { color: colors.foreground }]}>
            تفاصيل الكتاب
          </Text>
        </View>
      </View>

      {missingParams ? (
        <ErrorState
          message="رابط الكتاب غير مكتمل (المصدر أو المعرّف مفقود). أعد فتح الكتاب من قائمة الكتب."
          onRetry={() => router.replace("/books")}
        />
      ) : null}
      {!missingParams && detailsQuery.isPending ? (
        <LoadingState label="جاري تحميل الكتاب…" />
      ) : null}
      {!missingParams && detailsQuery.isError ? (
        <ErrorState
          offline={isOfflineError(detailsQuery.error)}
          onRetry={() => void detailsQuery.refetch()}
        />
      ) : null}
      {!missingParams &&
      !detailsQuery.isPending &&
      !detailsQuery.isError &&
      !book ? (
        <ErrorState
          message="تعذّر عرض هذا الكتاب من المصدر المحدد."
          onRetry={() => void detailsQuery.refetch()}
        />
      ) : null}

      {book ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}>
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}>
            <View style={styles.bookHead}>
              <View
                style={[
                  styles.bookIcon,
                  {
                    backgroundColor:
                      book.source === "turath"
                        ? colors.accent
                        : colors.secondary,
                  },
                ]}>
                <Feather name="book-open" size={22} color={colors.primary} />
              </View>

              <View style={styles.bookCopy}>
                <Text style={[styles.bookTitle, { color: colors.foreground }]}>
                  {book.title}
                </Text>

                {book.author ? (
                  <Text
                    style={[
                      styles.bookAuthor,
                      { color: colors.mutedForeground },
                    ]}>
                    {book.author}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.badgeRow}>
              <View
                style={[
                  styles.sourceBadge,
                  {
                    backgroundColor: colors.primary,
                  },
                ]}>
                <Text
                  style={[
                    styles.sourceBadgeText,
                    { color: colors.primaryForeground },
                  ]}>
                  {sourceLabel(book.source)}
                </Text>
              </View>

              {typeof book.pages === "number" ? (
                <Text
                  style={[styles.pagesNote, { color: colors.mutedForeground }]}>
                  {toArabicDigits(book.pages)} صفحة
                </Text>
              ) : null}
            </View>
          </View>

          {/* أوصاف فقط إن وردت من المصدر — لا نكتب نصوصًا من عندنا */}
          {book.description || book.infoLong ? (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}>
              <View style={styles.sectionHead}>
                <Feather name="bookmark" size={16} color={colors.primary} />
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}>
                  عن الكتاب
                </Text>
              </View>
              <Text style={[styles.description, { color: colors.foreground }]}>
                {book.infoLong ?? book.description}
              </Text>
            </View>
          ) : null}

          {/* الأفعال حسب قدرات المصدر: تراث قراءة+فهرس، وإسلام هاوس تحميل PDF. */}
          <View style={styles.actions}>
            {capabilities.canDownload &&
            (book.attachments?.length || book.downloadUrl) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="تحميل ملف الكتاب"
                onPress={() =>
                  openUrl(book.attachments?.[0].url ?? book.downloadUrl)
                }
                style={({ pressed }) => [
                  styles.secondaryButton,
                  {
                    backgroundColor: colors.secondary,
                    borderColor: colors.border,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}>
                <Feather name="download" size={19} color={colors.primary} />
                <Text style={[styles.secondaryText, { color: colors.primary }]}>
                  تحميل ملف الكتاب
                </Text>
              </Pressable>
            ) : null}

            {book.sourceUrl ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="فتح المصدر في المتصفح"
                onPress={() => openUrl(book.sourceUrl)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  {
                    backgroundColor: colors.secondary,
                    borderColor: colors.border,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}>
                <Feather
                  name="external-link"
                  size={19}
                  color={colors.primary}
                />
                <Text style={[styles.secondaryText, { color: colors.primary }]}>
                  فتح المصدر
                </Text>
              </Pressable>
            ) : null}

            {canRead && chapters && chapters.length > 0 ? (
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  الفهرس
                </Text>
                {visibleChapters.map((chapter: IslamicBookChapter, index) => (
                  <Pressable
                    // تراث يعيد عناوين مكرّرة ⇒ مفتاح مركّب مع الترتيب.
                    key={`${chapter.id}-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={`الانتقال إلى ${chapter.title}`}
                    onPress={() => openReader(chapter.page)}
                    style={({ pressed }) => [
                      styles.chapterRow,
                      { opacity: pressed ? 0.65 : 1 },
                    ]}>
                    <Text
                      style={[styles.chapterPage, { color: colors.primary }]}>
                      {toArabicDigits(chapter.page)}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.chapterTitle,
                        { color: colors.foreground },
                      ]}>
                      {chapter.title}
                    </Text>
                    <Feather
                      name="chevron-left"
                      size={16}
                      color={colors.mutedForeground}
                    />
                  </Pressable>
                ))}

                {remainingChapters > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="عرض المزيد من الفهرس"
                    onPress={() =>
                      setChapterLimit((limit) => limit + CHAPTERS_STEP)
                    }
                    style={({ pressed }) => [
                      styles.moreButton,
                      {
                        backgroundColor: colors.secondary,
                        borderColor: colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}>
                    <Text style={[styles.moreText, { color: colors.primary }]}>
                      عرض {toArabicDigits(remainingChapters)} عنوانًا آخر
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {!canRead && book?.readability !== "readable" && book?.source !== "turath" ? (
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  المحتوى غير متاح للقراءة داخل التطبيق
                </Text>
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                  هذا الكتاب متاح بصيغة PDF فقط. استخدم زر «تحميل ملف الكتاب»
                  لفتح المحتوى أو «فتح المصدر» لعرضه هناك.
                </Text>
              </View>
            ) : null}
          </View>

          {authorBio ? (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}>
              <View style={styles.sectionHead}>
                <Feather name="user" size={16} color={colors.primary} />
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}>
                  عن المؤلف
                </Text>
              </View>
              <Text style={[styles.description, { color: colors.foreground }]}>
                {authorBio}
              </Text>
            </View>
          ) : null}

          {book.attachments && book.attachments.length > 1 ? (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                المرفقات
              </Text>
              {book.attachments.slice(1).map((attachment) => (
                <Pressable
                  key={attachment.url}
                  accessibilityRole="button"
                  accessibilityLabel={`تحميل ${attachment.title ?? "الملف"}`}
                  onPress={() => openUrl(attachment.url)}
                  style={({ pressed }) => [
                    styles.attachmentRow,
                    { opacity: pressed ? 0.65 : 1 },
                  ]}>
                  <Feather name="file-text" size={17} color={colors.primary} />
                  <View style={styles.attachmentCopy}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.attachmentTitle,
                        { color: colors.foreground },
                      ]}>
                      {attachment.title ?? "ملف الكتاب"}
                    </Text>
                    <Text
                      style={[
                        styles.attachmentMeta,
                        { color: colors.mutedForeground },
                      ]}>
                      {[attachment.size, attachment.type]
                        .filter(Boolean)
                        .join(" • ")}
                    </Text>
                  </View>
                  <Feather
                    name="download"
                    size={16}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* سياسة المصدر المذكورة حرفيًا — لا نعدّل النص */}
          {book.source === "islamhouse" ? (
            <Text
              style={[styles.attribution, { color: colors.mutedForeground }]}>
              النص من إسلام هاوس؛ مسموح التحميل والتخزين مع الإشارة إلى المصدر
              وعدم تغيير النص.
            </Text>
          ) : (
            <Text
              style={[styles.attribution, { color: colors.mutedForeground }]}>
              النص من مكتبة تراث؛ القراءة داخل التطبيق فقط.
            </Text>
          )}
        </ScrollView>
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
  titleCopy: { alignItems: "flex-end", flex: 1 },
  title: { fontSize: typography.h1, fontWeight: "700", textAlign: "right" },
  content: { paddingBottom: spacing.xxl, gap: spacing.md },
  card: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  bookHead: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  bookIcon: {
    alignItems: "center",
    borderRadius: radii.sm,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  bookCopy: {
    alignItems: "flex-end",
    flex: 1,
  },
  bookTitle: {
    fontSize: typography.bodyLarge,
    fontWeight: "700",
    lineHeight: 26,
    textAlign: "right",
    width: "100%",
  },
  bookAuthor: {
    fontSize: typography.bodySmall,
    marginTop: 3,
    textAlign: "right",
    width: "100%",
  },
  badgeRow: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sourceBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sourceBadgeText: {
    fontSize: typography.caption,
    fontWeight: "700",
  },
  pagesNote: {
    fontSize: typography.caption,
  },
  sectionHead: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: typography.body,
    lineHeight: 28,
    textAlign: "right",
  },
  actions: {
    gap: spacing.sm,
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: radii.md,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  primaryText: {
    fontSize: typography.body,
    fontWeight: "800",
  },
  secondaryButton: {
    alignItems: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  secondaryText: {
    fontSize: typography.body,
    fontWeight: "700",
  },
  chapterRow: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
    paddingVertical: 10,
    width: "100%",
  },
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
  metaText: {
    fontSize: typography.bodySmall,
    lineHeight: 24,
    textAlign: "right",
  },
  moreButton: {
    alignItems: "center",
    borderRadius: radii.pill,
    borderWidth: 1,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  moreText: {
    fontSize: typography.caption,
    fontWeight: "700",
  },
  attachmentRow: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
    paddingVertical: 10,
  },
  attachmentCopy: {
    alignItems: "flex-end",
    flex: 1,
  },
  attachmentTitle: {
    fontSize: typography.bodySmall,
    fontWeight: "600",
    textAlign: "right",
    width: "100%",
  },
  attachmentMeta: {
    fontSize: typography.caption,
    marginTop: 1,
    textAlign: "right",
    width: "100%",
  },
  attribution: {
    fontSize: typography.caption,
    lineHeight: 18,
    textAlign: "center",
  },
});
