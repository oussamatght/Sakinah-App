/**
 * Hadith data — two direct, auth-free providers:
 *
 * 1. hadeethenc.com/api/v1 — thematic Arabic categories (roots/tree).
 *    Normalization ported from artifacts/api-server hadithService.
 * 2. hadis-api-id.vercel.app — the nine canonical books (Bukhari, Muslim,
 *    Ahmad…) with page/limit pagination. Used for browsing whole books.
 *
 * Both normalize into the same HadithItem shape the screens consume.
 */

import { fetchJson, intString, isJsonRecord, stringProp, type JsonRecord } from "./http";
import type { HadithCategoryNode, HadithItem, HadithPage } from "./types";

const HADEETH_ENC = "https://hadeethenc.com/api/v1";
const HADIS_API = "https://hadis-api-id.vercel.app";


type HadeethCategoryRaw = {
  id?: unknown;
  title?: unknown;
  hadeeths_count?: unknown;
  parent_id?: unknown;
};

type HadithOneRaw = JsonRecord & {
  id?: unknown;
  title?: unknown;
  hadeeth?: unknown;
  attribution?: unknown;
  grade?: unknown;
  explanation?: unknown;
  categories?: unknown;
  reference?: unknown;
};

// ---------------------------------------------------------------------------
// Categories: roots + flat list merged into a two-level tree
// ---------------------------------------------------------------------------

function normalizeCategory(
  raw: HadeethCategoryRaw,
): Omit<HadithCategoryNode, "children"> {
  const id = String(raw.id ?? "");
  return {
    id,
    titleAr: String(raw.title ?? ""),
    count: intString(raw.hadeeths_count, 0) ?? 0,
    parentId:
      raw.parent_id === null || raw.parent_id === undefined
        ? null
        : String(raw.parent_id),
  };
}

export async function fetchHadithCategories(): Promise<HadithCategoryNode[]> {
  const [roots, flat] = await Promise.all([
    fetchJson<HadeethCategoryRaw[]>(
      `${HADEETH_ENC}/categories/roots/?language=ar`,
      "الأحاديث",
    ),
    fetchJson<HadeethCategoryRaw[]>(
      `${HADEETH_ENC}/categories/list/?language=ar`,
      "الأحاديث",
    ),
  ]);

  const rootsNorm = (roots ?? []).map(normalizeCategory);
  const children = (flat ?? []).filter(
    (raw) => raw.parent_id !== null && raw.parent_id !== undefined,
  );
  const childrenByParent = new Map<string, HadithCategoryNode[]>();
  for (const raw of children) {
    const node = normalizeCategory(raw);
    const list = childrenByParent.get(node.parentId!) ?? [];
    list.push({ ...node, children: [] });
    childrenByParent.set(node.parentId!, list);
  }

  return rootsNorm.map((root) => ({
    ...root,
    children: (childrenByParent.get(root.id) ?? []).sort((a, b) =>
      a.titleAr.localeCompare(b.titleAr),
    ),
  }));
}

export async function fetchHadithCategoryChildren(
  categoryId: string,
): Promise<HadithCategoryNode[]> {
  const roots = await fetchHadithCategories();
  const root = roots.find((candidate) => candidate.id === categoryId);
  if (!root) {
    const error = new Error("هذا التصنيف غير موجود") as Error & { code?: string };
    error.code = "HADITH_CATEGORY_NOT_FOUND";
    throw error;
  }
  return root.children;
}

// ---------------------------------------------------------------------------
// Category-title cache (Phase 8): fetchHadithList used to call
// fetchHadithCategories() on EVERY pagination request just to resolve a
// title. Fetch once, map ids → titles, dedupe concurrent callers via one
// in-flight promise. React Query also caches, but this fixes the fetcher
// itself for every consumer.
// ---------------------------------------------------------------------------

let categoriesInFlight: Promise<HadithCategoryNode[]> | null = null;
const categoryTitleCache = new Map<string, string>();

function getCategoriesOnce(): Promise<HadithCategoryNode[]> {
  if (!categoriesInFlight) {
    categoriesInFlight = fetchHadithCategories()
      .then((nodes) => {
        for (const node of nodes) {
          categoryTitleCache.set(node.id, node.titleAr);
          for (const child of node.children) {
            categoryTitleCache.set(child.id, child.titleAr);
          }
        }
        return nodes;
      })
      .catch((error: unknown) => {
        // اسمح بإعادة المحاولة لاحقًا إن فشل الجلب الأول.
        categoriesInFlight = null;
        throw error;
      });
  }
  return categoriesInFlight;
}

async function categoryTitleFor(categoryId: string): Promise<string> {
  if (categoryTitleCache.has(categoryId)) {
    return categoryTitleCache.get(categoryId)!;
  }
  try {
    await getCategoriesOnce();
  } catch {
    return "موسوعة الأحاديث";
  }
  return categoryTitleCache.get(categoryId) ?? "موسوعة الأحاديث";
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * التطبيع (Phase 4):
 *   text = raw.hadeeth (النص الحديث الحقيقي) — وعناصر البحث تستعمل
 *   raw.hadith_text. العنوان (title في HadeethEnc هو بداية متن الحديث نفسه).
 *   ⚠️ raw.explanation لا يُستعمل أبدًا كنص للحديث — هو شرح منفصل (Phase 4).
 *   reference: قائمة HadeethEnc لا تقدم تخريجًا حقيقيًا — فلا نقدم المعرّف
 *   الداخلي كرقم حديث (Phase 5)؛ نتركه فارغًا ويعرض الـUI ما توفر فقط.
 */
function normalizeListItem(
  raw: JsonRecord,
  categoryTitle?: string,
): HadithItem {
  return normalizeListItemForTest(raw, categoryTitle);
}

/**
 * التصدير للفحص الآلي فقط (test-grade-normalization.ts) — نفس المنطق الذي
 * تستعمله كل القوائم، بلا أي مسار منفصل.
 */
export function normalizeListItemForTest(
  raw: JsonRecord,
  categoryTitle?: string,
): HadithItem {
  const text =
    stringProp(raw.hadeeth) ??
    stringProp(raw.hadith_text) ??
    stringProp(raw.title) ??
    "";
  return {
    id: String(raw.id ?? ""),
    text,
    book: categoryTitle ?? "موسوعة الأحاديث",
    // لا تخريج في استجابة القائمة — المعرّف الداخلي ليس مرجعًا (Phase 5).
    reference: "",
    ...(stringProp(raw.attribution) ? { attribution: stringProp(raw.attribution)! } : {}),
    ...(stringProp(raw.grade) ? { grade: stringProp(raw.grade)! } : {}),
    apiSource: "hadeethenc.com",
  };
}

export async function fetchHadithList(
  categoryId: string,
  page: number,
  perPage: number,
): Promise<HadithPage> {
  const safePerPage = Math.min(Math.max(perPage, 1), 50);
  const safePage = Math.max(page, 1);
  const payload = await fetchJson<{ data?: unknown; meta?: unknown }>(
    `${HADEETH_ENC}/hadeeths/list/?language=ar&category_id=${encodeURIComponent(categoryId)}&page=${safePage}&per_page=${safePerPage}`,
    "الأحاديث",
  );
  const data = Array.isArray(payload.data) ? payload.data : [];
  // "book" for thematic hadiths = the category's own title (Phase 8: cached —
  // was re-fetching the whole categories tree on every pagination request).
  const categoryTitle = await categoryTitleFor(categoryId);
  const items = data
    .filter(isJsonRecord)
    .map((raw) => normalizeListItem(raw, categoryTitle))
    .filter((item) => item.id);

  const meta = isJsonRecord(payload.meta) ? payload.meta : null;
  const currentPage = meta ? intString(meta.current_page) : undefined;
  const total = meta ? intString(meta.total_items) : undefined;
  const lastPage = meta ? intString(meta.last_page) : undefined;
  const effectivePage = currentPage ?? safePage;
  const hasMore =
    lastPage !== undefined
      ? effectivePage < lastPage
      : total !== undefined
        ? effectivePage * safePerPage < total
        : false;

  return {
    items,
    page: effectivePage,
    perPage: safePerPage,
    total: total ?? items.length,
    hasMore,
  };
}

/** Full tahrīj string from the source, else the first category title. */
function normalizeReference(raw: HadithOneRaw): string | undefined {
  if (typeof raw.reference === "string" && raw.reference.trim()) {
    return raw.reference.trim().split(/\n+/)[0]?.trim() || raw.reference.trim();
  }
  if (raw.categories !== undefined) {
    const first = Array.isArray(raw.categories) ? raw.categories[0] : undefined;
    if (isJsonRecord(first)) {
      const title = first.title;
      if (typeof title === "string" && title.trim()) return title.trim();
    }
  }
  return undefined;
}

export async function fetchHadithDetail(hadithId: string): Promise<HadithItem> {
  const payload = await fetchJson<HadithOneRaw>(
    `${HADEETH_ENC}/hadeeths/one/?language=ar&id=${encodeURIComponent(hadithId)}`,
    "الأحاديث",
  );
  const title = String(payload.title ?? "").trim();
  if (payload.id == null && !title) {
    const error = new Error("هذا الحديث غير موجود") as Error & { code?: string };
    error.code = "HADITH_NOT_FOUND";
    throw error;
  }
  // Phase 4: text and explanation are DIFFERENT pieces of content — never
  // fall back from hadeeth to explanation (it would show the explanation as
  // if it were the hadith). Missing hadeeth is handled explicitly.
  const text = stringProp(payload.hadeeth) ?? "";
  if (!text.trim()) {
    const error = new Error("نص هذا الحديث غير متاح من المصدر") as Error & {
      code?: string;
    };
    error.code = "HADITH_TEXT_UNAVAILABLE";
    throw error;
  }
  // Phase 5: real tahrīj only — the internal API id is NOT a reference.
  const reference = normalizeReference(payload) ?? "";
  return {
    id: String(payload.id ?? ""),
    text,
    book: "موسوعة الأحاديث",
    reference,
    ...(stringProp(payload.attribution) ? { attribution: stringProp(payload.attribution)! } : {}),
    ...(stringProp(payload.grade) ? { grade: stringProp(payload.grade)! } : {}),
    // Explanation preserved SEPARATELY — the UI renders it under its own heading.
    ...(stringProp(payload.explanation) ? { explanation: stringProp(payload.explanation)! } : {}),
    apiSource: "hadeethenc.com",
  };
}

// ---------------------------------------------------------------------------
// Search (upstream can be slow — callers pass a longer timeout via React Query)
// ---------------------------------------------------------------------------

/**
 * البحث (Phase 9 — شكل الاستجابة الحقيقي مُتحقق منه حيًا):
 * HadeethEnc search يرجع مصفوفة عارية من
 *   { id, title, hadith_text, hadith_text_highlights }
 * — لا {data, meta} إطلاقًا. الشكل القديم كان يقرأ payload.data → undefined
 * → نتائج فارغة دائمًا (خطأ فعلي في الإنتاج).
 * كذلك تحققت حيًا أن page/per_page يُهملهما الخادم (صفحة 1 و2 أعادت نفس
 * الـ26 عنصرًا) — فلا pagination حقيقي هنا: hasMore=false هو السلوك الأصح
 * الموثق، ولا نخترع metadata غير موجودة. عناصر البحث بلا grade — تحترم
 * القاعدة: لا اختراع حكم.
 */
export async function searchHadiths(
  phrase: string,
  page: number,
  perPage: number,
): Promise<HadithPage> {
  const safePerPage = Math.min(Math.max(perPage, 1), 50);
  const safePage = Math.max(page, 1);
  const payload = await fetchJson<unknown>(
    `${HADEETH_ENC}/hadeeths/search/?phrase=${encodeURIComponent(phrase)}&language=ar`,
    "البحث في الأحاديث",
    { timeoutMs: 25_000 },
  );
  const data = Array.isArray(payload) ? payload : [];
  const items = data
    .filter(isJsonRecord)
    .map((raw) => normalizeListItem(raw))
    .filter((item) => item.id);
  return {
    items,
    page: safePage,
    perPage: safePerPage,
    total: items.length,
    // مصدر الحقيقة: الخادم يتجاهل page/per_page في البحث (مُتحقق حيًا) —
    // النتائج كاملة في استجابة واحدة، لا صفحات تالية.
    hasMore: false,
  };
}

// ---------------------------------------------------------------------------
// Canonical books (hadis-api-id.vercel.app) — browse Bukhari, Muslim, etc.
// ---------------------------------------------------------------------------

/** Arabic display names for the nine canonical collections. */
const BOOK_NAMES_AR: Record<string, string> = {
  "abu-dawud": "سنن أبي داود",
  ahmad: "مسند أحمد",
  bukhari: "صحيح البخاري",
  darimi: "سنن الدارمي",
  "ibnu-majah": "سنن ابن ماجه",
  malik: "موطأ مالك",
  muslim: "صحيح مسلم",
  nasai: "سنن النسائي",
  "tirmidzi": "سنن الترمذي",
};

export type HadithBook = {
  slug: string;
  nameAr: string;
  nameEn: string;
  total: number;
};

export async function fetchHadithBooks(): Promise<HadithBook[]> {
  const payload = await fetchJson<unknown>(
    `${HADIS_API}/hadith`,
    "كتب الحديث",
  );
  const list = Array.isArray(payload) ? payload : [];
  return list
    .filter(isJsonRecord)
    .map((raw) => {
      const slug = String(raw.slug ?? "");
      return {
        slug,
        nameEn: String(raw.name ?? slug),
        nameAr: BOOK_NAMES_AR[slug] ?? String(raw.name ?? slug),
        total: intString(raw.total, 0) ?? 0,
      };
    })
    .sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));
}

/**
 * hadis-api-id item (Phase 7) — verified live fields: { number, arab, id }.
 * text = raw.arab exactly as returned (never modified).
 * grade: the API provides NO grading field — it stays undefined, and the UI
 * must NOT infer a grade from the book name ("صحيح البخاري" is book info,
 * not an authenticity verdict).
 */
function mapHadisApiItem(raw: JsonRecord, bookName: string): HadithItem {
  const number = intString(raw.number, 0) ?? 0;
  return {
    id: `${bookName}:${number}`,
    text: String(raw.arab ?? ""),
    book: bookName,
    reference: String(number),
    apiSource: "hadis-api-id",
  };
}

export async function fetchBookHadiths(
  bookSlug: string,
  page: number,
  perPage: number,
): Promise<HadithPage> {
  const books = await fetchHadithBooks();
  const book = books.find((candidate) => candidate.slug === bookSlug);
  const bookName = book?.nameAr ?? bookSlug;

  const safePerPage = Math.min(Math.max(perPage, 1), 50);
  const safePage = Math.max(page, 1);
  const payload = await fetchJson<{ items?: unknown; pagination?: unknown }>(
    `${HADIS_API}/hadith/${encodeURIComponent(bookSlug)}?page=${safePage}&limit=${safePerPage}`,
    "كتب الحديث",
    { timeoutMs: 20_000 },
  );
  const list = Array.isArray(payload.items) ? payload.items : [];
  const items = list
    .filter(isJsonRecord)
    .map((raw) => mapHadisApiItem(raw, bookName));

  const pagination = isJsonRecord(payload.pagination) ? payload.pagination : {};
  const currentPage = intString(pagination.currentPage, safePage) ?? safePage;
  const totalPages = intString(pagination.totalPages) ?? 1;
  const total = intString(pagination.totalItems) ?? items.length;
  return {
    items,
    page: currentPage,
    perPage: safePerPage,
    total,
    hasMore: currentPage < totalPages,
  };
}
