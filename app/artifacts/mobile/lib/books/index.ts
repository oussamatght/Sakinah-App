/**
 * واجهة موحّدة لمزوّدي مكتبة الكتب: تُجمّع تراث وإسلام هاوس
 * خلف دالة واحدة في كل عملية (بحث / قائمة / تفاصيل / صفحات).
 */

import { IslamHouseBooksProvider } from "./islamHouseProvider";
import { IslamicAppBooksProvider } from "./islamicAppProvider";
import {
  safeLimit,
  safePage,
  uniqueById,
  type BookSearchParams,
  type IslamicBooksProvider,
} from "./providers";
import { TurathBooksProvider } from "./turathProvider";
import type {
  BookSearchFilters,
  BookSearchNotice,
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
export const islamicAppBooks = new IslamicAppBooksProvider();

const providers: Record<IslamicLibrarySource, IslamicBooksProvider> = {
  turath: turathBooks,
  islamhouse: islamHouseBooks,
  islamicapp: islamicAppBooks,
};

/** كل المصادر بالترتيب المعروض في الواجهة. */
export const ALL_BOOK_SOURCES: IslamicLibrarySource[] = [
  "turath",
  "islamhouse",
  "islamicapp",
];

export const BOOK_SOURCE_LABELS: Record<IslamicLibrarySource, string> = {
  turath: "تراث",
  islamhouse: "إسلام هاوس",
  islamicapp: "إسلاميك",
};

const VALID_SOURCES = new Set<string>(ALL_BOOK_SOURCES);

/**
 * يقرأ مصدر الكتاب من معاملات التنقّل (نص يمرّ عبر رابط/URL).
 *
 * كان التحويل السابق `params.source === "islamhouse" ? … : "turath"` يطوي أي
 * مصدر جديد على تراث، فيُطلب slug إسلاميك من مزوّد تراث الذي لا يعرفه
 * ويرجع undefined ⇒ "Query data cannot be undefined" وصفحة فارغة. الآن أي
 * مصدر غير معروف يُرفض صراحةً (null) بدل أن يُرسل لمزوّد خاطئ بصمت.
 */
export function parseBookSource(
  value: string | string[] | undefined,
): IslamicLibrarySource | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  return VALID_SOURCES.has(raw) ? (raw as IslamicLibrarySource) : null;
}

export function bookSourceLabel(source: IslamicLibrarySource): string {
  return BOOK_SOURCE_LABELS[source] ?? source;
}

export function getProvider(source: IslamicLibrarySource): IslamicBooksProvider {
  return providers[source];
}

export type { IslamicBooksProvider } from "./providers";

export function providerCapabilities(
  source: IslamicLibrarySource,
): IslamicBookCapabilities {
  return providers[source].capabilities;
}

export function providerSearchCapabilities(source: IslamicLibrarySource) {
  return providers[source].searchCapabilities;
}

export async function getCategoriesBySource(
  source: IslamicLibrarySource,
): Promise<IslamicBookCategory[]> {
  return providers[source].getCategories();
}

/** الفروع الحقيقية (معرّفات صالحة ل get-category-items). */
export async function getCategoryBranchesBySource(
  source: IslamicLibrarySource,
): Promise<IslamicBookCategory[]> {
  return providers[source].getCategoryBranches();
}

/** أبناء فرع — يُجلبون عند الطلب ويبقى كل مستوى في مفتاح كاش مستقل. */
export async function getCategoryChildrenBySource(
  source: IslamicLibrarySource,
  nodeId: string,
): Promise<IslamicBookCategory[]> {
  return providers[source].getCategoryChildren(nodeId);
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

/**
 * نتيجة فاشلة كـ«فارغة» بدل رمي الخطأ: مصدر واحد معطّل يجب ألّا يُسقط
 * البحث كله ويُعيد React Query جلب المصادر السليمة من جديد.
 */
function asEmptyOnError(
  result: Promise<IslamicBookSearchResult>,
  source: IslamicLibrarySource,
  page: number,
  perPage: number,
): Promise<IslamicBookSearchResult> {
  return result.catch(
    (error) => ({
      items: [],
      page,
      perPage,
      total: 0,
      hasMore: false,
      notices: [
        {
          source,
          sourceName: BOOK_SOURCE_LABELS[source],
          steps: [],
          limits: [
            error instanceof Error ? error.message : "تعذّر الوصول للمصدر",
          ],
        },
      ],
    }),
  );
}

/**
 * يدمج تقارير المصادر **بالمصدر الواحد** بدل إلحاقها كما هي.
 *
 * السبب: كل مزوّد يُرجع تقريره الخاص (notice.build)،searchLibraryBooksAdvanced
 * يضيف تقريرًا ثانيًا لنفس المصدر ⇒ مفتاحان متساويان لنفس المصدر، وReact
 * ينبّه: "Encountered two children with the same key, turath". الدمج يضمن
 * **مفتاحًا فريدًا لكل مصدر** مع الحفاظ على كل الخطوات والقيود.
 */
function mergeNotices(
  incoming: BookSearchNotice[],
  into: BookSearchNotice[] = [],
): BookSearchNotice[] {
  for (const notice of incoming) {
    const existing = into.find((item) => item.source === notice.source);
    if (!existing) {
      into.push({
        ...notice,
        steps: [...notice.steps],
        limits: [...notice.limits],
      });
      continue;
    }
    for (const step of notice.steps) {
      if (!existing.steps.some((item) => item.label === step.label)) {
        existing.steps.push(step);
      }
    }
    for (const limit of notice.limits) {
      if (!existing.limits.includes(limit)) existing.limits.push(limit);
    }
  }
  return into;
}

export async function searchLibraryBooks(
  query: string,
  params?: BookSearchParams,
): Promise<IslamicBookSearchResult> {
  const page = safePage(params?.page);
  const perPage = safeLimit(params?.perPage);
  // عزل المصادر: فشل واحد لا يُبطل النتائج السليمة ولا يُعيد جلبها.
  const [a, b, c] = await Promise.all([
    asEmptyOnError(providers.turath.searchBooks(query, params), "turath", page, perPage),
    asEmptyOnError(providers.islamhouse.searchBooks(query, params), "islamhouse", page, perPage),
    asEmptyOnError(providers.islamicapp.searchBooks(query, params), "islamicapp", page, perPage),
  ]);
  const merged = uniqueById([...a.items, ...b.items, ...c.items]);
  return {
    items: merged,
    page: a.page,
    perPage: a.perPage,
    total: a.total + b.total + c.total,
    hasMore: a.hasMore || b.hasMore || c.hasMore,
    // دمج بالمصدر: مفتاح فريد لكل مصدر (مفتاح مكرّر ⇒ تحذير React children).
    notices: mergeNotices([
      ...(a.notices ?? []),
      ...(b.notices ?? []),
      ...(c.notices ?? []),
    ]),
  };
}

/** هل الفلاتر المُدخلة تستحق تشغيل البحث أصلًا؟ (بلا طلبات فارغة) */
export function hasAnySearchFilter(
  filters: BookSearchFilters & { page?: number },
): boolean {
  return Boolean(
    str2(filters.query) ||
      str2(filters.author) ||
      str2(filters.categoryId) ||
      filters.mode === "category",
  );
}
function str2(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * البحث المتقدم الموحّد — يوزّع الفلاتر على المزوّدين القادرين عليها فعلًا،
 * ثم يدمج النتائج ويجمع تقارير «خادم vs محلي» من كل مزوّد ليعرضها المستخدم
 * بصراحة. مصدر واحد محدَّد = لا طلب للآخر إطلاقًا.
 *
 * ملاحظة مهمّة (متحقَّق منها حيًا): **معرّفات التصنيف فضاء خاص بكل مزوّد** —
 * فروع إسلام هاوس (viewcat) ليست معرّفات تراث، وإرسالها لـ cat= يعيد 400.
 * لذلك معرّف التصنيف يُمرَّر لإسلام هاوس (صاحبه في شجرة UI) فقط، ويُذكر
 * للمستخدم صراحةً أن التراث لا يشارك في هذا الفلتر.
 */
export async function searchLibraryBooksAdvanced(
  filters: BookSearchFilters & { page?: number; perPage?: number },
): Promise<IslamicBookSearchResult> {
  const page = safePage(filters.page);
  const perPage = safeLimit(filters.perPage);
  const source = filters.source ?? "all";

  const targets: IslamicLibrarySource[] =
    source === "all" ? ALL_BOOK_SOURCES : [source];

  const categoryId = str2(filters.categoryId);
  // كل مصدر يتسلّم معرّف التصنيف فقط إن كان عائدًا منه (أرقام إسلام هاوس،
  // slugs إسلاميك)، فنرسله للجميع ويتجاهل ما لا يخصّه.
  const results = await Promise.all(
    targets.map((id) =>
      asEmptyOnError(
        providers[id].searchWithFilters({
          ...filters,
          categoryId,
          page,
          perPage,
        }),
        id,
        page,
        perPage,
      ),
    ),
  );

  const notices = mergeNotices(
    results.flatMap((result) => result.notices ?? []),
  );

  // إعلان صريح: التصنيف لا يُطبَّق إلا على مصدره (المعرّفات فضاءات منفصلة).
  if (categoryId && source === "all") {
    for (const id of targets) {
      if (id === "islamhouse" || id === "islamicapp") continue;
      mergeNotices(
        [
          {
            source: id,
            sourceName: BOOK_SOURCE_LABELS[id],
            steps: [{ label: "التصنيف", scope: "unsupported" as const }],
            limits: [
              "معرّفات التصنيف خاصة بكل مصدر، فالتصنيف المختار لا يُطبَّق على هذا المصدر.",
            ],
          },
        ],
        notices,
      );
    }
  }

  const merged = uniqueById(results.flatMap((result) => result.items));

  return {
    items: merged,
    page,
    perPage,
    total: results.reduce((sum, result) => sum + result.total, 0),
    hasMore: results.some((result) => result.hasMore),
    notices,
  };
}

export async function getLibraryBooksByAuthor(
  source: IslamicLibrarySource,
  authorId: string,
  page?: number,
  perPage?: number,
): Promise<IslamicBookSearchResult | undefined> {
  return providers[source].getBooksByAuthor(authorId, safePage(page), safeLimit(perPage));
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