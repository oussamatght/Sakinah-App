/**
 * Shared types for the Islamic Books module.
 *
 * Sources:
 * - Turath.io
 * - IslamHouse API v3
 */

export type IslamicBookSource = "turath" | "islamhouse";

export type IslamicBook = {
  id: string;
  source: IslamicBookSource;
  title: string;
  author?: string;
  description?: string;
  category?: string;
  language: string;
  url?: string;
  downloadUrl?: string;
  totalPages?: number;
  publishedAt?: string;
  rawId: string | number;
};

export type IslamicBookPage = {
  bookId: string;
  source: IslamicBookSource;
  page: number;
  text: string;
  heading?: string;
  raw?: unknown;
};

export type IslamicBookSearchResult = {
  items: IslamicBook[];
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
};

export type IslamicBookCategory = {
  id: string;
  title: string;
  description?: string;
  source: IslamicBookSource;
  parentId?: string | null;
};

export type IslamicBookAttachment = {
  id: string;
  url: string;
  title?: string;
  size?: string;
  type?: string;
};
