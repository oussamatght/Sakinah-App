import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  getCategoriesBySource,
  getLibraryAuthor,
  getLibraryBookChapters,
  getLibraryBookDetails,
  getLibraryBookPage,
  getLibraryBooks,
  getLibraryBooksByCategory,
  searchLibraryBooks,
} from "@/lib/books";
import type { IslamicLibrarySource } from "@/lib/books/types";

const RESULTS_STALE_TIME = 30_000;

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

export function useLibraryBookDetails(
  source: IslamicLibrarySource,
  rawId: string | undefined,
) {
  return useQuery({
    queryKey: ["library-book", "details", source, rawId],
    queryFn: () => getLibraryBookDetails(source, rawId as string),
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
    queryFn: () => getLibraryBookChapters(source, rawId as string),
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
    queryFn: () => getLibraryBookPage(source, rawId as string, page),
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
    queryFn: () => getLibraryAuthor(source, authorId as string),
    enabled: Boolean(source) && Boolean(authorId),
    staleTime: 60 * 60 * 1_000,
  });
}