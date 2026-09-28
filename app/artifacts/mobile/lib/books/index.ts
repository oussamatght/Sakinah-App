/**
 * واجهة موحّدة لمزوّدي مكتبة الكتب: تُجمّع تراث وإسلام هاوس
 * خلف دالة واحدة في كل عملية (بحث / قائمة / تفاصيل / صفحات).
 */

import { IslamHouseBooksProvider } from "./islamHouseProvider";
import {
  safeLimit,
  safePage,
  uniqueById,
  type BookSearchParams,
  type IslamicBooksProvider,
} from "./providers";
import { TurathBooksProvider } from "./turathProvider";
import type {
  IslamicBook,
  IslamicBookAuthor,
  IslamicBookCapabilities,
  IslamicBookCategory,
  IslamicBookChapter,
  IslamicBookDetails,
  IslamicBookPage,
  IslamicBookSearchResult,
  IslamicLibrarySource,
} from "./types";

export const turathBooks = new TurathBooksProvider();
export const islamHouseBooks = new IslamHouseBooksProvider();

const providers: Record<IslamicLibrarySource, IslamicBooksProvider> = {
  turath: turathBooks,
  islamhouse: islamHouseBooks,
};

export function getProvider(source: IslamicLibrarySource): IslamicBooksProvider {
  return providers[source];
}

export type { IslamicBooksProvider } from "./providers";

export function providerCapabilities(
  source: IslamicLibrarySource,
): IslamicBookCapabilities {
  return providers[source].capabilities;
}

export async function getCategoriesBySource(
  source: IslamicLibrarySource,
): Promise<IslamicBookCategory[]> {
  return providers[source].getCategories();
}

export async function getLibraryBooksByCategory(
  source: IslamicLibrarySource,
  categoryId: string,
  page?: number,
  perPage?: number,
): Promise<IslamicBookSearchResult> {
  return providers[source].getBooks({
    categoryId,
    page: safePage(page),
    perPage: safeLimit(perPage),
  });
}

export async function getLibraryBooks(
  source: IslamicLibrarySource,
  page?: number,
  perPage?: number,
): Promise<IslamicBookSearchResult> {
  return providers[source].getBooks({
    page: safePage(page),
    perPage: safeLimit(perPage),
  });
}

export async function searchLibraryBooks(
  query: string,
  params?: BookSearchParams,
): Promise<IslamicBookSearchResult> {
  const [a, b] = await Promise.all([
    providers.turath.searchBooks(query, params),
    providers.islamhouse.searchBooks(query, params),
  ]);
  const merged = uniqueById([...a.items, ...b.items]);
  return {
    items: merged,
    page: a.page,
    perPage: a.perPage,
    total: a.total + b.total,
    hasMore: a.hasMore || b.hasMore,
  };
}

export async function getLibraryBook(
  source: IslamicLibrarySource,
  rawId: string,
): Promise<IslamicBook | undefined> {
  return providers[source].getBook(rawId);
}

export async function getLibraryBookDetails(
  source: IslamicLibrarySource,
  rawId: string,
): Promise<IslamicBookDetails | undefined> {
  return providers[source].getBookDetails(rawId);
}

export async function getLibraryBookChapters(
  source: IslamicLibrarySource,
  rawId: string,
): Promise<IslamicBookChapter[] | undefined> {
  return providers[source].getBookChapters(rawId);
}

export async function getLibraryBookPage(
  source: IslamicLibrarySource,
  rawId: string,
  pageNumber: number,
): Promise<IslamicBookPage | undefined> {
  return providers[source].getBookPage(rawId, pageNumber);
}

export async function getLibraryAuthor(
  source: IslamicLibrarySource,
  authorId: string,
): Promise<IslamicBookAuthor | undefined> {
  return providers[source].getAuthor(authorId);
}

export async function searchInsideLibraryBook(
  source: IslamicLibrarySource,
  rawId: string,
  query: string,
): Promise<IslamicBookSearchResult | undefined> {
  return providers[source].searchInsideBook(rawId, query);
}