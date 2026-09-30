import { useEffect } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getCategoriesBySource,
  getCategoryBranchesBySource,
  getCategoryChildrenBySource,
  getLibraryAuthor,
  getLibraryBookChapters,
  getLibraryBookDetails,
  getLibraryBookPage,
  getLibraryBooks,
  getLibraryBooksByCategory,
  hasAnySearchFilter,
  searchLibraryBooks,
  searchLibraryBooksAdvanced,
} from "@/lib/books";
import type {
  BookSearchFilters,
  BookSearchMode,
  BookSearchSource,
  IslamicLibrarySource,
} from "@/lib/books/types";

const RESULTS_STALE_TIME = 30_000;
/** الفلاتر تُعدَّل يدويًا؛ نترك نافذة قصيرة ثم نخزّن أطول. */
const SEARCH_STALE_TIME = 2 * 60_000;

/**
 * بحث مشترك بين مصدري المكتبة (تراث + إسلام هاوس).
 * مع استعلام فارغ يُرجع قائمة التصفح (إسلام هاوس فقط — تراث لا يملك
 * نقطة تصفح قائمة، مُتحقق).
 */
export function useSearchLibraryBooks(
  query: string,
  page = 1,
  perPage = 20,
) {
  const normalized = query.trim();

  return useQuery({
    queryKey: ["library-books", "search", normalized, page, perPage],
    queryFn: () =>
      searchLibraryBooks(normalized, { page, perPage }),
    placeholderData: keepPreviousData,
    staleTime: RESULTS_STALE_TIME,
  });
}

/** كتاب أحد المصدرين (تصفح/تصنيف) — الترقيم عبر pager مثل تبويب الأحاديث. */
export function useLibraryBookList({
  query,
  source,
  categoryId,
  page,
  perPage = 20,
}: {
  query: string;
  source: IslamicLibrarySource;
  categoryId?: string;
  page: number;
  perPage?: number;
}) {
  const normalized = query.trim();

  return useQuery({
    queryKey: [
      "library-books",
      "list",
      normalized,
      source,
      categoryId ?? "all",
      page,
      perPage,
    ],
    queryFn: () =>
      normalized
        ? searchLibraryBooks(normalized, { page, perPage })
        : categoryId
          ? getLibraryBooksByCategory(source, categoryId, page, perPage)
          : getLibraryBooks(source, page, perPage),
    placeholderData: keepPreviousData,
    staleTime: RESULTS_STALE_TIME,
  });
}

export function useSourceLibraryBooks(
  source: IslamicLibrarySource,
  categoryId: string | undefined,
  page: number,
  perPage = 20,
) {
  return useQuery({
    queryKey: [
      "library-books",
      "source",
      source,
      categoryId ?? "all",
      page,
      perPage,
    ],
    queryFn: () =>
      categoryId
        ? getLibraryBooksByCategory(source, categoryId, page, perPage)
        : getLibraryBooks(source, page, perPage),
    placeholderData: keepPreviousData,
    staleTime: RESULTS_STALE_TIME,
  });
}

export function useLibraryCategories(source: IslamicLibrarySource) {
  return useQuery({
    queryKey: ["library-categories", source],
    queryFn: () => getCategoriesBySource(source),
    staleTime: 60 * 60 * 1_000,
  });
}

/**
 * فروع المستوى الأول الحقيقية — طلب واحد، مخزَّن ساعة.
 *
 * `enabled` يسمح بتأجيل الجلب حتى تُفتح نافذة البحث فعلًا: النافذة مُركَّبة
 * دائمًا، فبدونه كانت الشاشة تُطلق طلب التصنيفات عند فتح تبويب الكتب.
 */
export function useLibraryCategoryBranches(
  source: IslamicLibrarySource,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["library-categories", source, "branches"],
    queryFn: () => getCategoryBranchesBySource(source),
    enabled: options?.enabled ?? true,
    staleTime: 60 * 60 * 1_000,
  });
}

/**
 * أبناء فرع واحد — مفتاح لكل فرع على حدة. الفروع تُفتح بالطلب فقط، فلا
 * نحمّل شجرة إسلام هاوس (٤٨٩٩ عقدة) دفعة واحدة.
 */
export function useLibraryCategoryChildren(
  source: IslamicLibrarySource,
  nodeId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["library-categories", source, "children", nodeId ?? "none"],
    queryFn: () => getCategoryChildrenBySource(source, nodeId as string),
    enabled: Boolean(nodeId) && (options?.enabled ?? true),
    staleTime: 60 * 60 * 1_000,
  });
}

/**
 * البحث المتقدم — كل تركيبة فلاتر لها مفتاحها الخاص، فالعودة إلى بحث سابق
 * تُعرض من الكاش فورًا. الفلاتر تُطبَّع (trim + "" بدل undefined) حتى لا
 * يتغيّر المفتاح بسبب قيمة فارغة أو فراغ فقط.
 *
 * البحث لا يعمل إلا بفلتر واحد على الأقل (بلا ذلك لا نطلق أي طلب).
 */
export function useLibraryAdvancedSearch(filters: {
  mode: BookSearchMode;
  query: string;
  author: string;
  categoryId: string;
  source: BookSearchSource;
  page: number;
  perPage?: number;
}) {
  const perPage = filters.perPage ?? 20;

  const normalized: BookSearchFilters & { page: number; perPage: number } = {
    mode: filters.mode,
    query: filters.query.trim(),
    author: filters.author.trim(),
    categoryId: filters.categoryId.trim(),
    source: filters.source,
    page: Math.max(1, Math.floor(filters.page) || 1),
    perPage,
  };

  const enabled = hasAnySearchFilter(normalized);

  return useQuery({
    // كائن الفلاتر بعد التطبيع: مفتاح مستقر (React Query يفرز مفاتيح الكائن)
    // ولكل تركيبة صفحة/مصدر/تصنيف مدخلتها الخاصة.
    queryKey: ["library-books", "advanced-search", normalized],
    queryFn: () => searchLibraryBooksAdvanced(normalized),
    enabled,
    // الصفحة السابقة تبقى ظاهرة أثناء جلب التالية (لا شاشة تحميل كاملة).
    placeholderData: keepPreviousData,
    staleTime: SEARCH_STALE_TIME,
  });
}

/**
 * مزوّدو الكتب يُرجعون `undefined` عند "غير مدعوم/غير موجود" (لأن واجهة
 * `IslamicBooksProvider` تُرجع `T | undefined`)، لكن React Query يرفض
 * `undefined` كبيانات ويطلق:
 *   "Query data cannot be undefined. Please make sure to return a value
 *    other than undefined from your query function."
 * فكل استعلام هنا يحوّل undefined إلى **خطأ صريح** (UnknownBookError) قابل
 * للعرض في الشاشة، أو `null` إن كان الغياب طبيعيًا (فهرس/مؤلف غير موجود).
 */
class UnknownBookError extends Error {
  constructor(source: IslamicLibrarySource, rawId: string, what: string) {
    super(`تعذّر جلب ${what} من المصدر «${source}» (المعرّف: ${rawId})`);
    this.name = "UnknownBookError";
  }
}

export function useLibraryBookDetails(
  source: IslamicLibrarySource,
  rawId: string | undefined,
) {
  return useQuery({
    queryKey: ["library-book", "details", source, rawId],
    queryFn: async () => {
      const details = await getLibraryBookDetails(source, rawId as string);
      if (!details) throw new UnknownBookError(source, String(rawId), "تفاصيل الكتاب");
      return details;
    },
    enabled: Boolean(source) && Boolean(rawId),
    staleTime: 5 * 60 * 1_000,
  });
}

export function useLibraryBookChapters(
  source: IslamicLibrarySource,
  rawId: string | undefined,
) {
  return useQuery({
    queryKey: ["library-book", "chapters", source, rawId],
    queryFn: async () => {
      const chapters = await getLibraryBookChapters(source, rawId as string);
      // الفهرس absence عادية (كتاب بلا فصول) ⇒ null لا undefined.
      return chapters ?? null;
    },
    enabled: Boolean(source) && Boolean(rawId),
    staleTime: 60 * 60 * 1_000,
  });
}

export function useLibraryBookPage(
  source: IslamicLibrarySource,
  rawId: string | undefined,
  page: number,
) {
  return useQuery({
    queryKey: ["library-book", "page", source, rawId, page],
    queryFn: async () => {
      const bookPage = await getLibraryBookPage(source, rawId as string, page);
      if (!bookPage) throw new UnknownBookError(source, String(rawId), `الصفحة ${page}`);
      return bookPage;
    },
    enabled: Boolean(source) && Boolean(rawId) && page > 0,
    staleTime: 24 * 60 * 60 * 1_000,
  });
}

export function useLibraryAuthor(
  source: IslamicLibrarySource,
  authorId: string | undefined,
) {
  return useQuery({
    queryKey: ["library-author", source, authorId],
    queryFn: async () => {
      const author = await getLibraryAuthor(source, authorId as string);
      return author ?? null;
    },
    enabled: Boolean(source) && Boolean(authorId),
    staleTime: 60 * 60 * 1_000,
  });
}

/**
 * جلب صفحة القارئ التالية في الخلفية — صفحة واحدة فقط، بنفس مفتاح الاستعلام
 * الذي سيستخدمه القارئ لاحقًا، فـ prefetchQuery يكتب في نفس المدخل ولا
 * يُطلق طلبًا ثانيًا عند فتح تلك الصفحة.
 */
export function usePrefetchNextBookPage(params: {
  enabled: boolean;
  source: IslamicLibrarySource;
  rawId: string | undefined;
  page: number;
  hasNext: boolean;
}): void {
  const { enabled, source, rawId, page, hasNext } = params;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !hasNext || !rawId || page < 1) return;
    const next = page + 1;
    void queryClient.prefetchQuery({
      queryKey: ["library-book", "page", source, rawId, next],
      queryFn: () => getLibraryBookPage(source, rawId, next),
      staleTime: 24 * 60 * 60 * 1_000,
    });
  }, [enabled, hasNext, page, source, rawId, queryClient]);
}

/** نفس المنطق لصفحة نتائج البحث المتقدم (صفحة واحدة مسبقًا فقط). */
export function usePrefetchNextAdvancedSearchPage(params: {
  enabled: boolean;
  filters: {
    mode: BookSearchMode;
    query: string;
    author: string;
    categoryId: string;
    source: BookSearchSource;
  };
  page: number;
  perPage: number;
  hasMore: boolean;
}): void {
  const { enabled, filters, page, perPage, hasMore } = params;
  const queryClient = useQueryClient();

  const normalized: BookSearchFilters & { page: number; perPage: number } = {
    mode: filters.mode,
    query: filters.query.trim(),
    author: filters.author.trim(),
    categoryId: filters.categoryId.trim(),
    source: filters.source,
    page: page + 1,
    perPage,
  };

  useEffect(() => {
    if (!enabled || !hasMore || page < 1 || !hasAnySearchFilter(normalized)) return;
    void queryClient.prefetchQuery({
      queryKey: ["library-books", "advanced-search", normalized],
      queryFn: () => searchLibraryBooksAdvanced(normalized),
      staleTime: SEARCH_STALE_TIME,
    });
  }, [enabled, hasMore, page, perPage, filters, queryClient]);
}
