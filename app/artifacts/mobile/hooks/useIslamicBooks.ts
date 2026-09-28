import { useQuery, useInfiniteQuery } from "@tanstack/react-query";

import {
  fetchIslamHouseAttachments,
  fetchIslamHouseBook,
  fetchIslamHouseBooks,
  fetchIslamHouseCategories,
  fetchIslamicBooks,
  fetchTurathBook,
  fetchTurathPage,
  searchIslamicBooks,
  searchTurathBooks,
} from "./../lib/api/islamicBooksApi";

/**
 * Browse IslamHouse books directly.
 */
export function useIslamicBooks(page = 1, perPage = 20) {
  return useQuery({
    queryKey: ["islamic-books", "browse", page, perPage],
    queryFn: () => fetchIslamicBooks(page, perPage),
  });
}

/**
 * Main Books-screen query.
 *
 * IMPORTANT:
 * When the search box is empty, we MUST browse IslamHouse.
 * The previous version disabled this query for an empty string,
 * which caused the UI to show "لا توجد كتب" immediately.
 *
 * When the user types a query, both Turath and IslamHouse are searched.
 */
export function useSearchIslamicBooks(
  query: string,
  page = 1,
  perPage = 20,
) {
  const normalized = query.trim();

  return useQuery({
    queryKey: ["islamic-books", "search", normalized, page, perPage],
    queryFn: () =>
      normalized.length > 0
        ? searchIslamicBooks(normalized, page, perPage)
        : fetchIslamicBooks(page, perPage),
    enabled: true,
  });
}

/** Search only Turath. */
export function useSearchTurathBooks(
  query: string,
  page = 1,
  perPage = 20,
) {
  const normalized = query.trim();

  return useQuery({
    queryKey: ["islamic-books", "turath-search", normalized, page, perPage],
    queryFn: () => searchTurathBooks(normalized, page, perPage),
    enabled: normalized.length > 0,
  });
}

/** Fetch one Turath book including its index. */
export function useTurathBook(bookId: number | string) {
  const id = Number(bookId);

  return useQuery({
    queryKey: ["islamic-book", "turath", id],
    queryFn: () => fetchTurathBook(id),
    enabled: Number.isInteger(id) && id > 0,
  });
}

/** Fetch one page from a Turath book. */
export function useTurathPage(bookId: number | string, page: number) {
  const id = Number(bookId);

  return useQuery({
    queryKey: ["islamic-book-page", "turath", id, page],
    queryFn: () => fetchTurathPage(id, page),
    enabled:
      Number.isInteger(id) &&
      id > 0 &&
      Number.isInteger(page) &&
      page > 0,
  });
}

/** Fetch one IslamHouse item. */
export function useIslamHouseBook(itemId: number | string) {
  const id = String(itemId);

  return useQuery({
    queryKey: ["islamic-book", "islamhouse", id],
    queryFn: () => fetchIslamHouseBook(id),
    enabled: id.length > 0,
  });
}

/** Fetch PDF/download attachments for an IslamHouse item. */
export function useIslamHouseAttachments(itemId: number | string) {
  const id = String(itemId);

  return useQuery({
    queryKey: ["islamic-book-attachments", id],
    queryFn: () => fetchIslamHouseAttachments(id),
    enabled: id.length > 0,
  });
}

/** Fetch IslamHouse categories. */
export function useIslamHouseBookCategories() {
  return useQuery({
    queryKey: ["islamic-books", "islamhouse-categories"],
    queryFn: fetchIslamHouseCategories,
  });
}

/**
 * Infinite search helper for a Books screen.
 *
 * Empty query browses IslamHouse. A non-empty query searches both sources.
 */
export function useInfiniteIslamicBookSearch(
  query: string,
  perPage = 20,
) {
  const normalized = query.trim();

  return useInfiniteQuery({
    queryKey: ["islamic-books", "infinite-search", normalized, perPage],
    queryFn: ({ pageParam }) =>
      normalized.length > 0
        ? searchIslamicBooks(normalized, pageParam, perPage)
        : fetchIslamicBooks(pageParam, perPage),
    initialPageParam: 1,
    enabled: true,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
  });
}
