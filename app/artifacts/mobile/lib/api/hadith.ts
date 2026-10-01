/**
 * Hadith data — two direct, auth-free providers: 1) hadeethenc.com/api/v1 —
 * thematic Arabic categories (roots/tree), normalization ported from
 * artifacts/api-server hadithService; 2) hadis-api-id.vercel.app — the nine
 * canonical books with page/limit pagination. Both normalize into HadithItem.
 */

import { fetchJson, intString, isJsonRecord, stringProp, type JsonRecord } from "./http";
import { fetchMatchedGradeFromFawaz } from "./hadithGradeEnrichment";
import hadithIndexJson from "../../assets/hadith-index/index.json";
import type { HadithCategoryNode, HadithItem, HadithPage } from "./types";

/**
 * فهرس أبواب مولّد مسبقًا (scripts/build-hadith-index.ts → assets/hadith-index/
 * index.json): أقسام كل كتاب بأسمائها وأرقام أحاديثه من بيانات المصدر لا المدى المعلن المتداخل.
 */
export type HadithBookSection = {
  section: number;
  titleAr: string;
  titleEn: string;
  hadiths: number[];
};

const HADITH_INDEX = hadithIndexJson as unknown as {
  generatedAt: string;
  books: Record<string, HadithBookSection[]>;
};

/** فهرس أبواب كتاب واحد (خمسة كتب مدعومة فقط). */
export function getHadithBookSections(bookSlug: string): HadithBookSection[] {
  return HADITH_INDEX.books[bookSlug] ?? [];
}

/**
 * أحاديث قسم واحد: تُجلب الصفحات التي تحتوي أرقام القسم فقط ثم تُرشّح بترتيب
 * الفهرس (جلب كل الصفحات يُغرق في طلبات ضخمة)، والدرجات تُحمّل كسولًا عبر
 * useHadithGrade.
 */
export async function fetchHadithSection(
  bookSlug: string,
  sectionNumber: number,
): Promise<HadithItem[]> {
  const sections = getHadithBookSections(bookSlug);
  const section = sections.find((entry) => entry.section === sectionNumber);
  if (!section || section.hadiths.length === 0) return [];
  const numbers = new Set(section.hadiths);
  const pagesNeeded = [
    ...new Set(section.hadiths.map((number) => Math.ceil(number / 50))),
  ];
  const pages = await Promise.all(
    pagesNeeded.map((page) => fetchBookHadithsRaw(bookSlug, page, 50).catch(() => [])),
  );
  return pages
    .flat()
    .filter((item) => {
      const number = Number.parseInt(item.reference, 10);
      return Number.isInteger(number) && numbers.has(number);
    })
    .sort((a, b) => {
      const na = Number.parseInt(a.reference, 10);
      const nb = Number.parseInt(b.reference, 10);
      return na - nb;
    });
}

/**
 * حديث واحد برقمه (hadis-api-id يدعم الجلب المباشر بالرقم — مُتحقق حيًا).
 * الإثراء مطبق نفسه، وفشل الجلب يرمي خطأً يتكفل فيه المستدعي.
 */
export async function fetchHadithByNumber(
  bookSlug: string,
  hadithNumber: number,
): Promise<HadithItem> {
  const books = await fetchHadithBooks();
  const book = books.find((candidate) => candidate.slug === bookSlug);
  const bookName = book?.nameAr ?? bookSlug;
  const payload = await fetchJson<JsonRecord>(
    `${HADIS_API}/hadith/${encodeURIComponent(bookSlug)}/${hadithNumber}`,
    "كتب الحديث",
    { timeoutMs: 20_000 },
  );
  const enriched = await enrichBookGrades([mapHadisApiItem(payload, bookName)], bookSlug);
  return enriched[0];
}

/** جلب خام (بلا إثراء) لـ fetchHadithSection. */
async function fetchBookHadithsRaw(
  bookSlug: string,
  page: number,
  perPage: number,
): Promise<HadithItem[]> {
  const books = await fetchHadithBooks();
  const book = books.find((candidate) => candidate.slug === bookSlug);
  const bookName = book?.nameAr ?? bookSlug;
  const safePerPage = Math.min(Math.max(perPage, 1), 50);
  const safePage = Math.max(page, 1);
  const payload = await fetchJson<{ items?: unknown }>(
    `${HADIS_API}/hadith/${encodeURIComponent(bookSlug)}?page=${safePage}&limit=${safePerPage}`,
    "كتب الحديث",
    { timeoutMs: 20_000 },
  );
  const list = Array.isArray(payload.items) ? payload.items : [];
  return list.filter(isJsonRecord).map((raw) => mapHadisApiItem(raw, bookName));
}

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

// Categories: roots + flat list merged into a two-level tree

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

// Category-title cache (Phase 8): used to refetch the whole tree on EVERY
// pagination page for one title — now one fetch + id→title map + one in-flight promise.

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

/**
 * التطبيع (Phase 4): text = raw.hadeeth؛ وعناصر البحث تستعمل raw.hadith_text،
 * وraw.title هو بداية المتن. raw.explanation لا يُستعمل كتك الحديث (شرح منفصل)،
 * والقائمة لا تعطي تخريجًا (Phase 5) فلا يُقدَّم المعرّف الداخلي كرقم حديث.
 */
function normalizeListItem(
  raw: JsonRecord,
  categoryTitle?: string,
): HadithItem {
  return normalizeListItemForTest(raw, categoryTitle);
}

/** التصدير للفحص الآلي فقط (test-grade-normalization.ts) — بلا مسار منفصل. */
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
  // "book" for thematic hadiths = the category's own title (Phase 8: cached).
  const categoryTitle = await categoryTitleFor(categoryId);
  // الدرجات لا تُجلب هنا (N× تفصيل يُحبس الصفحة أمام مصدر بطيء) — تُحمّل كسولًا
  // للبطاقات المرئية عبر useHadithGrade بنفس المصدر والحقل والتطبيع.
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

/** Full tahrīj from the source, else the first category title. */
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
  // Phase 4: text and explanation are DIFFERENT content — never fall back from
  // hadeeth to explanation (it would show the explanation as the hadith text).
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

// Search (upstream can be slow — callers pass a longer timeout via React Query)

/**
 * البحث (Phase 9 — الشكل مُتحقق حيًا): مصفوفة عارية { id, title, hadith_text,
 * hadith_text_highlights } لا {data, meta} — الشكل القديم قرأ payload.data
 * (undefined) فنتائج فارغة دائمًا (خطأ إنتاج). والخادم يُهمل page/per_page
 * (صفحتان أعادتا نفس العناصر) فلا ترقيم: hasMore=false سلوك موثق بلا metadata
 * مخترعة. الدرجات كسولًا عبر useHadithGrade بنفس مصدر التفصيل، والفشل بلا درجة.
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
    // الخادم يتجاهل page/per_page في البحث (مُتحقق حيًا): نتيجة واحدة كاملة.
    hasMore: false,
  };
}

/** Arabic display names for the nine canonical collections (hadis-api-id). */
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

/** قائمة الكتب تسعة ثابتة: تُحل مرة واحدة وتُشارك بالجلسة (مثل كاش التصنيفات) —
 *  كان كل جلب صفحة/حديث يستدعيها من الشبكة من جديد. */
let booksInFlight: Promise<HadithBook[]> | null = null;
let booksCached: HadithBook[] | null = null;

export async function fetchHadithBooks(): Promise<HadithBook[]> {
  if (booksCached) return booksCached;
  if (!booksInFlight) {
    booksInFlight = fetchHadithBooksFromApi()
      .then((books) => {
        booksCached = books;
        return books;
      })
      .catch((error: unknown) => {
        // اسمح بإعادة المحاولة لاحقًا إن فشل الجلب الأول.
        booksInFlight = null;
        throw error;
      });
  }
  return booksInFlight;
}

async function fetchHadithBooksFromApi(): Promise<HadithBook[]> {
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
 * hadis-api-id item (Phase 7) — verified live fields: { number, arab, id };
 * text = raw.arab exactly as returned. The API has NO grading field, so grade
 * stays undefined unless the fawaz enrichment attaches one for the five covered
 * books — never inferred from the book name.
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

/**
 * الإثراء (fawazahmed0 عبر jsDelivr): درجة حرفية برقم الحديث للكتب الخمسة
 * المدعومة فقط، مع فحص تطابق نصي مقتضب ضد اختلاف الترقيم بين الطبعات (تشابه
 * الرأس ≥ 0.5، بلا معالجة للحركات ولا للنص القرآني)؛ أي فشل أو عدم تطابق = بلا
 * درجة، ونص/كتاب/رقم العنصر لا يُمس. مستعمل في المسار الأحادي فقط
 * (fetchHadithByNumber) لأن N× طلبات تُحبس القوائم — الدرجات كسولًا عبر
 * useHadithGrade. التفاصيل في hadithGradeEnrichment.ts.
 */
async function enrichBookGrades(items: HadithItem[], bookSlug: string): Promise<HadithItem[]> {
  return Promise.all(
    items.map(async (item) => {
      const number = Number.parseInt(item.reference, 10);
      if (!Number.isInteger(number) || number < 1) return item;
      try {
        const grade = await fetchMatchedGradeFromFawaz(bookSlug, number, item.text);
        return grade ? { ...item, grade } : item;
      } catch {
        return item; // الإثراء لا يُعطّل القائمة أبدًا
      }
    }),
  );
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
