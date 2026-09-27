import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  fetchHadithByNumber,
  getHadithBookSections,
  useGetBookHadiths,
  useGetHadithBooks,
  useGetHadithCategories,
  useGetHadithSearch,
  useGetHadiths,
  type HadithBookSection,
  type HadithItem,
} from '@/lib/api';
import { getOfflineHadiths } from '@/lib/offline/hadithDb';
import {
  AppHeader,
  ErrorState,
  IconButton,
  isOfflineError,
  LoadingState,
  Screen,
} from '@/components/ui';
import { FavoriteButton } from '@/components/FavoriteButton';
import { GradeBadge } from '@/components/GradeBadge';
import { radii, spacing, typography } from '@/constants/tokens';
import { useColors } from '@/hooks/useColors';

/** Entry mode: canonical books (with sections + search) or thematic categories. */
type Mode = 'books' | 'topics';
/** نوع البحث داخل كتاب: نص موضوعي أو رقم حديث. */
type SearchKind = 'text' | 'number';

/**
 * إصلاح التداخل مع الـ Tab Bar: أعمق نقطة هي ListFooterComponent —
 * paddingBottom دائم بحساب التراكب (TabBar 84 + bottom inset).
 */
const TAB_BAR_HEIGHT = 84; // نفس القيمة المضبوطة في (tabs)/_layout.tsx للويب

function toArabicDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
}

/**
 * بطاقة حديث واحدة — قابلة لإعادة الاستخدام في كل القوائم:
 * نص + مفضلة + شارة درجة (أو «غير متوفرة» إن غاب المصدر) + الراوي إن وُجد
 * + التخريج (المصدر: كتاب — رقم الحديث) + دعوة التفصيل لمصدر hadeethenc.
 */
function HadithCard({
  item,
  bookTitle,
  onPress,
  colors,
}: {
  item: HadithItem;
  bookTitle: string;
  onPress?: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? 'فتح تفصيل الحديث' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.hadithCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.hadithTop}>
        <Text style={[styles.hadithText, { color: colors.foreground }]}>{item.text}</Text>
        <FavoriteButton
          item={{
            kind: 'hadith',
            refId: item.id,
            title: bookTitle,
            text: item.text.slice(0, 220),
            subtitle: item.book,
          }}
        />
      </View>
      {/* الدرجة: حرفية من المصدر — والكتب الخمسة يحملها الإثراء العربي.
          «غير متوفرة» تعني صراحةً أن المصدر لا يقدم درجة لهذا الحديث. */}
      <View style={styles.hadithMetaRow}>
        <GradeBadge grade={item.grade} showMissing />
        {item.attribution ? (
          <Text style={[styles.hadithMetaText, { color: colors.mutedForeground }]}>
            الراوي: {item.attribution}
          </Text>
        ) : null}
        {onPress ? (
          <Text style={[styles.detailHint, { color: colors.primary }]}>
            التفاصيل والشرح ←
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
  );
}

/**
 * تبويب الأحاديث:
 *  - الكتب التسعة: فهرس أبواب عربي قابل للفتح + شارة درجة عربية (الإثراء
 *    من fawazahmed0) + الراوي إن وُجد + تصفح بالصفحات.
 *  - البحث: داخل كتاب — نص موضوعي (hadeethenc) أو برقم الحديث (جلب مباشر
 *    من hadis-api-id)؛ وفي المواضيع — نص موضوعي + ما هو مخزّن offline.
 *    النطاق يوضح بصريًا في placeholder الحقل.
 */
export default function HadithTab() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomOverlap = TAB_BAR_HEIGHT + insets.bottom;
  const booksQuery = useGetHadithBooks();
  const categoriesQuery = useGetHadithCategories();
  const [mode, setMode] = useState<Mode>('books');
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // فهرس الأبواب: null = قائمة عادية؛ قسم مفتوح = أحاديث ذلك الباب.
  const [openSection, setOpenSection] = useState<HadithBookSection | null>(null);
  const [indexVisible, setIndexVisible] = useState(false);
  // البحث: نصه ونوعه، والبحث النصي يُفعّل بعد submit (لا طلبات أثناء الكتابة).
  const [searchText, setSearchText] = useState('');
  const [submittedText, setSubmittedText] = useState('');
  const [searchKind, setSearchKind] = useState<SearchKind>('text');
  // نتيجة البحث بالرقم: undefined = جارٍ، null = لا يوجد، HadithItem = وُجد.
  const [numberResult, setNumberResult] = useState<HadithItem | null | undefined>(undefined);

  const listQuery = useGetBookHadiths(
    mode === 'books' && selectedBook && !openSection && !submittedText
      ? { bookSlug: selectedBook, page, perPage: 10 }
      : null,
  );
  const topicQuery = useGetHadiths(
    mode === 'topics' && selectedCategory && !submittedText
      ? { categoryId: selectedCategory, page, perPage: 10 }
      : undefined,
    { query: { enabled: mode === 'topics' && Boolean(selectedCategory) && !submittedText } },
  );
  const searchQuery = useGetHadithSearch(
    submittedText.trim().length >= 2 && searchKind === 'text'
      ? submittedText.trim()
      : null,
  );

  const books = booksQuery.data ?? [];
  const currentBook = books.find((candidate) => candidate.slug === selectedBook);
  const sections = selectedBook ? getHadithBookSections(selectedBook) : [];
  const categories = categoriesQuery.data ?? [];
  const activeList = mode === 'books' ? listQuery : topicQuery;

  // البحث بالرقم داخل الكتاب المحدد — جلب مباشر من hadis-api-id.
  useEffect(() => {
    if (searchKind !== 'number' || submittedText.trim() === '') return;
    const parsed = Number.parseInt(submittedText.trim(), 10);
    if (!Number.isInteger(parsed) || parsed < 1 || !selectedBook) {
      setNumberResult(null);
      return;
    }
    let active = true;
    setNumberResult(undefined);
    fetchHadithByNumber(selectedBook, parsed)
      .then((item) => {
        if (active) setNumberResult(item);
      })
      .catch(() => {
        if (active) setNumberResult(null);
      });
    return () => {
      active = false;
    };
  }, [searchKind, selectedBook, submittedText]);

  /** نتائج البحث المحلي (offline cache) — تظهر دائمًا مع البحث النصي. */
  const offlineHits = useMemo(() => {
    if (searchKind !== 'text') return [];
    const needle = submittedText.trim();
    if (needle.length < 2) return [];
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
  };

  const clearSearch = () => {
    setSearchText('');
    setSubmittedText('');
    setNumberResult(undefined);
  };

  const headerTitle =
    mode === 'books'
      ? currentBook?.nameAr ?? 'الأحاديث'
      : categories.find((c) => c.id === selectedCategory)?.titleAr ?? 'المواضيع';

  // ------------------------- القائمة الرئيسية (كتب/مواضيع) -------------------------
  if (!selectedBook && !selectedCategory) {
    return (
      <Screen>
        <AppHeader
          eyebrow="من وحي السنة"
          title="الأحاديث"
          action="sliders"
          actionLabel="الإعدادات"
          onAction={() => router.push('/settings')}
        />
        <View style={styles.modeTabs}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === 'books' }}
            onPress={() => {
              setMode('books');
              backToList();
              clearSearch();
            }}
            style={[styles.modeTab, mode === 'books' && { backgroundColor: colors.primary }]}
          >
            <Text
              style={[
                styles.modeTabText,
                { color: mode === 'books' ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              الكتب
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === 'topics' }}
            onPress={() => {
              setMode('topics');
              backToList();
              clearSearch();
            }}
            style={[styles.modeTab, mode === 'topics' && { backgroundColor: colors.primary }]}
          >
            <Text
              style={[
                styles.modeTabText,
                { color: mode === 'topics' ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              المواضيع
            </Text>
          </Pressable>
        </View>

        {mode === 'books' ? (
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
                contentContainerStyle={[styles.list, { paddingBottom: bottomOverlap + spacing.md }]}
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
                      { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}>
                      <Feather name="book-open" size={19} color={colors.primary} />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.nameAr}</Text>
                      <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
                        {item.total} حديث
                        {getHadithBookSections(item.slug).length > 0
                          ? ` • ${getHadithBookSections(item.slug).length} بابًا`
                          : ''}
                      </Text>
                    </View>
                    <Feather name="chevron-left" size={18} color={colors.mutedForeground} />
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
                contentContainerStyle={[styles.list, { paddingBottom: bottomOverlap + spacing.md }]}
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
                      { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}>
                      <Feather name="tag" size={19} color={colors.primary} />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.titleAr}</Text>
                      <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{item.count} حديث</Text>
                    </View>
                    <Feather name="chevron-left" size={18} color={colors.mutedForeground} />
                  </Pressable>
                )}
              />
            )}
          </>
        )}
      </Screen>
    );
  }

  // ------------------------- داخل كتاب/موضوع -------------------------
  const items = activeList.data?.items ?? [];
  const hasMore = activeList.data?.hasMore ?? false;
  const searchNumberActive = submittedText.trim() !== '' && searchKind === 'number';
  const searchTextActive =
    submittedText.trim().length >= 2 && searchKind === 'text' && mode === 'topics';
  const searchPlaceholder = searchKind === 'number'
    ? `اكتب رقم الحديث داخل ${currentBook?.nameAr ?? 'الكتاب'}…`
    : mode === 'books'
      ? 'بحث نصي موضوعي في كل الكتب (hadeethenc)…'
      : `بحث في ${headerTitle} وفي ما خُزّن للقراءة دون اتصال…`;

  // ملاحظة نطاق البحث — تُوضح للمستخدم أين يبحث فعليًا.
  const searchScopeNote = searchKind === 'number'
    ? `البحث بالرقم داخل: ${currentBook?.nameAr ?? '—'}`
    : mode === 'books'
      ? 'البحث النصي: كل الأحاديث موضوعيًا (موسوعة الأحاديث)'
      : `البحث: ${headerTitle} + المحتوى المخزّن offline`;

  const numberResultView =
    numberResult === undefined ? (
      <LoadingState />
    ) : numberResult === null ? (
      <View style={styles.searchFeedback}>
        <Text style={[styles.searchFeedbackText, { color: colors.mutedForeground }]}>
          لا يوجد حديث بهذا الرقم في {currentBook?.nameAr ?? 'هذا الكتاب'}.
        </Text>
      </View>
    ) : (
      <HadithCard item={numberResult} bookTitle={headerTitle} colors={colors} />
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
          <Text style={[styles.screenTitle, { color: colors.foreground }]}>
            {openSection ? openSection.titleAr : headerTitle}
          </Text>
          <Text style={[styles.screenMeta, { color: colors.mutedForeground }]}>
            {openSection
              ? `${toArabicDigits(openSection.hadiths.length)} حديث في هذا الباب`
              : `الصفحة ${toArabicDigits(activeList.data?.page ?? page)} من ${
                  activeList.data
                    ? toArabicDigits(Math.ceil(activeList.data.total / activeList.data.perPage))
                    : '—'
                }`}
          </Text>
        </View>
        {/* زر الفهرس — للكتب ذات الأبواب فقط */}
        {mode === 'books' && sections.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={indexVisible ? 'العودة لقائمة الأحاديث' : 'فتح فهرس الأبواب'}
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
              ]}
            >
              {indexVisible ? 'الأحاديث' : 'الفهرس'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* شريط البحث: نصي ↔ رقم، مع نطاق مكتوب صراحةً تحت الحقل */}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBar, { backgroundColor: colors.secondary }]}>
          <Feather name="search" size={17} color={colors.mutedForeground} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={() => setSubmittedText(searchText.trim())}
            returnKeyType="search"
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="حقل البحث في الأحاديث"
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {mode === 'books' && selectedBook ? (
            <Pressable
              onPress={() => {
                setSearchKind((kind) => (kind === 'number' ? 'text' : 'number'));
                setSubmittedText('');
                setNumberResult(undefined);
              }}
              accessibilityRole="button"
              accessibilityLabel="تبديل نوع البحث بين النص والرقم"
              style={({ pressed }) => [
                styles.searchKindToggle,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.searchKindText, { color: colors.primaryForeground }]}>
                {searchKind === 'number' ? 'بالرقم' : 'بالنص'}
              </Text>
            </Pressable>
          ) : null}
          {searchText ? (
            <Pressable onPress={clearSearch} accessibilityRole="button" accessibilityLabel="مسح البحث">
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        <Text style={[styles.searchScope, { color: colors.mutedForeground }]}>{searchScopeNote}</Text>
      </View>

      {/* فهرس الأبواب */}
      {indexVisible && !openSection ? (
        <FlatList
          data={sections}
          keyExtractor={(section) => `section-${section.section}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.list, { paddingBottom: bottomOverlap + spacing.md }]}
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
              <Text style={[styles.sectionNumber, { color: colors.primary }]}>
                {toArabicDigits(section.section)}
              </Text>
              <View style={styles.sectionCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  {section.titleAr}
                </Text>
                <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
                  {toArabicDigits(section.hadiths.length)} حديث
                </Text>
              </View>
              <Feather name="chevron-left" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        />
      ) : searchNumberActive ? (
        /* نتيجة البحث بالرقم داخل الكتاب */
        numberResultView
      ) : searchTextActive ? (
        /* نتائج البحث النصي: hadeethenc (كل الكتب) + المخزون offline.
           في وضع الكتب نتائج hadeethenc مخفية — النطاق المعلن موضوعي فقط. */
        <FlatList
          data={[
            ...(mode === 'topics' ? (searchQuery.data?.items ?? []) : []),
            ...offlineHits,
          ]}
          keyExtractor={(item, index) => `search-${item.id}-${index}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.list, { paddingBottom: bottomOverlap + spacing.md }]}
          ListHeaderComponent={
            <View>
              {searchQuery.isPending ? <LoadingState /> : null}
              {searchQuery.isError ? (
                <Text style={[styles.searchFeedbackText, { color: colors.mutedForeground }]}>
                  تعذر البحث الموضوعي — تُعرض النتائج المخزّنة offline فقط.
                </Text>
              ) : null}
              {offlineHits.length > 0 ? (
                <Text style={[styles.searchGroupTitle, { color: colors.mutedForeground }]}>
                  من المحتوى المخزّن offline ({toArabicDigits(offlineHits.length)})
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <HadithCard
              item={item}
              bookTitle={item.book}
              onPress={
                item.apiSource === 'hadeethenc.com'
                  ? () => router.push(`/hadith-detail?hadithId=${encodeURIComponent(item.id)}`)
                  : undefined
              }
              colors={colors}
            />
          )}
          ListEmptyComponent={
            searchQuery.isPending ? null : (
              <View style={styles.searchFeedback}>
                <Text style={[styles.searchFeedbackText, { color: colors.mutedForeground }]}>
                  لا نتائج لهذا البحث.
                </Text>
              </View>
            )
          }
        />
      ) : openSection ? (
        /* أحاديث باب مفتوح من الفهرس */
        <FlatList
          data={openSection.hadiths}
          keyExtractor={(hadith) => `sec-hadith-${hadith}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.list, { paddingBottom: bottomOverlap + spacing.md }]}
          ListHeaderComponent={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="العودة إلى الفهرس"
              onPress={() => setOpenSection(null)}
              style={({ pressed }) => [
                styles.backToIndex,
                { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="arrow-up-right" size={15} color={colors.primary} />
              <Text style={[styles.backToIndexText, { color: colors.primary }]}>الفهرس</Text>
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
        /* قائمة الأحاديث العادية بالصفحات */
        <>
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
              contentContainerStyle={[styles.list, { paddingBottom: bottomOverlap + spacing.md }]}
              renderItem={({ item }) => (
                <HadithCard
                  item={item}
                  bookTitle={headerTitle}
                  onPress={
                    item.apiSource === 'hadeethenc.com'
                      ? () => router.push(`/hadith-detail?hadithId=${encodeURIComponent(item.id)}`)
                      : undefined
                  }
                  colors={colors}
                />
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
                      { backgroundColor: colors.secondary, opacity: page <= 1 ? 0.4 : pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Feather name="chevron-right" size={17} color={colors.primary} />
                    <Text style={[styles.pagerText, { color: colors.primary }]}>السابق</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="الصفحة التالية"
                    disabled={!hasMore || activeList.isPending}
                    onPress={() => setPage((value) => value + 1)}
                    style={({ pressed }) => [
                      styles.pagerButton,
                      { backgroundColor: colors.secondary, opacity: !hasMore ? 0.4 : pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[styles.pagerText, { color: colors.primary }]}>التالي</Text>
                    <Feather name="chevron-left" size={17} color={colors.primary} />
                  </Pressable>
                </View>
              }
            />
          )}
        </>
      )}
    </Screen>
  );
}

/** صف حديث واحد داخل باب مفتوح — يجلب الحديث برقمه ويستخدم HadithCard نفسها. */
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
  const [item, setItem] = useState<HadithItem | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    setItem(undefined);
    fetchHadithByNumber(bookSlug, hadithNumber)
      .then((fetched) => {
        if (active) setItem(fetched);
      })
      .catch(() => {
        if (active) setItem(null);
      });
    return () => {
      active = false;
    };
  }, [bookSlug, hadithNumber]);

  if (item === undefined || item === null) {
    return null; // فشل جلب حديث واحد لا يعطل بقية الباب
  }
  return <HadithCard item={item} bookTitle={bookTitle} colors={colors} />;
}

const styles = StyleSheet.create({
  modeTabs: { backgroundColor: 'transparent', flexDirection: 'row-reverse', gap: 8, marginBottom: spacing.md },
  modeTab: { borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  modeTabText: { fontSize: typography.bodySmall, fontWeight: '700' },
  list: { paddingBottom: 40 },
  listHeader: { alignItems: 'center', flexDirection: 'row-reverse', gap: spacing.md, marginBottom: spacing.md },
  titleCopy: { alignItems: 'flex-end', flex: 1 },
  screenTitle: { fontSize: typography.h1, fontWeight: '700', textAlign: 'right' },
  screenMeta: { fontSize: typography.caption, marginTop: 2 },
  row: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row-reverse', gap: spacing.sm, marginBottom: spacing.sm, padding: spacing.md },
  rowIcon: { alignItems: 'center', borderRadius: radii.sm, height: 42, justifyContent: 'center', width: 42 },
  rowCopy: { alignItems: 'flex-end', flex: 1 },
  rowTitle: { fontSize: typography.body, fontWeight: '700', textAlign: 'right' },
  rowMeta: { fontSize: typography.caption, marginTop: 2 },
  indexButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row-reverse',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  indexButtonText: { fontSize: typography.caption, fontWeight: '700' },
  searchWrap: { marginBottom: spacing.sm },
  searchBar: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, fontSize: typography.body, textAlign: 'right', paddingVertical: 0 },
  searchKindToggle: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  searchKindText: { fontSize: typography.caption, fontWeight: '700' },
  searchScope: { fontSize: typography.caption, marginTop: 4, textAlign: 'right' },
  searchGroupTitle: { fontSize: typography.caption, fontWeight: '700', marginTop: spacing.sm, textAlign: 'right' },
  searchFeedback: { padding: spacing.md },
  searchFeedbackText: { fontSize: typography.bodySmall, textAlign: 'right' },
  backToIndex: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row-reverse',
    gap: 4,
    marginBottom: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  backToIndexText: { fontSize: typography.caption, fontWeight: '700' },
  sectionRow: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  sectionNumber: {
    fontSize: typography.bodySmall,
    fontWeight: '700',
    minWidth: 26,
    textAlign: 'center',
  },
  sectionCopy: { alignItems: 'flex-end', flex: 1 },
  sectionTitle: { fontSize: typography.body, fontWeight: '700', textAlign: 'right' },
  sectionMeta: { fontSize: typography.caption, marginTop: 2 },
  hadithCard: { borderRadius: radii.md, borderWidth: 1, marginBottom: spacing.sm, padding: spacing.md },
  hadithTop: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm },
  hadithText: { flex: 1, fontSize: typography.body, lineHeight: 28, textAlign: 'right' },
  hadithMetaRow: { alignItems: 'center', flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  hadithMetaText: { fontSize: typography.caption },
  detailHint: { fontSize: typography.caption, fontWeight: '700' },
  hadithFooter: { alignItems: 'center', flexDirection: 'row-reverse', gap: 5, marginTop: spacing.sm },
  hadithSource: { flex: 1, fontSize: typography.caption, fontWeight: '600', textAlign: 'right' },
  pager: { flexDirection: 'row-reverse', gap: spacing.sm, justifyContent: 'center', paddingVertical: spacing.lg },
  pagerButton: { alignItems: 'center', borderRadius: radii.pill, flexDirection: 'row-reverse', gap: 5, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  pagerText: { fontSize: typography.bodySmall, fontWeight: '700' },
});
