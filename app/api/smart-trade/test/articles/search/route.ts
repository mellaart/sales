import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import {
  fetchWithSmartTradeTimeout,
  getSmartTradePullConfig,
  getSmartTradePullHeaders,
} from "@/lib/smart-trade-pull-test";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ArticleOption = {
  id: string;
  code: string;
  description: string;
  price: number | null;
  searchText: string;
};

type ArticleCache = {
  expiresAt: number;
  articles: ArticleOption[];
};

const ARTICLE_CACHE_MS = 5 * 60 * 1000;
const ARTICLE_PAGE_SIZE = 1000;
const ARTICLE_MAX_PAGES = 25;
let articleCache: ArticleCache | null = null;
let articleRequest: Promise<ArticleOption[]> | null = null;

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function articleRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [];
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.results)) return record.results;

  const data = asRecord(record.data);
  if (data && Array.isArray(data.items)) return data.items;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

function articleRecord(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;
  const attributes = asRecord(record.attributes);
  return attributes ? { ...record, ...attributes } : record;
}

function firstValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== null && record[key] !== undefined && record[key] !== "") {
      return record[key];
    }
  }
  return null;
}

function textValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function priceValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  let normalized = value.trim().replace(/[^0-9,.-]/g, "");
  if (!normalized) return null;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("nl-NL");
}

function normalizeArticle(value: unknown): ArticleOption | null {
  const record = articleRecord(value);
  if (!record) return null;

  const id = textValue(firstValue(record, ["id", "articleId", "article_id", "uuid"]));
  const code = textValue(firstValue(record, [
    "articleNumber",
    "article_number",
    "number",
    "code",
    "sku",
    "barcode",
  ]));
  const description = textValue(firstValue(record, [
    "description",
    "name",
    "title",
    "fullName",
    "full_name",
    "shortDescription",
    "short_description",
  ]));
  const rawPrice = firstValue(record, [
    "salesPrice",
    "sales_price",
    "salePrice",
    "sale_price",
    "sellingPrice",
    "selling_price",
    "retailPrice",
    "retail_price",
    "unitPrice",
    "unit_price",
    "price",
  ]);
  const priceRecord = asRecord(rawPrice);
  const price = priceValue(priceRecord
    ? firstValue(priceRecord, ["exclVat", "excl_vat", "amount", "value"])
    : rawPrice);

  if (!description && !code) return null;
  const stableId = id || code || description;
  const resolvedDescription = description || code;

  return {
    id: stableId,
    code,
    description: resolvedDescription,
    price,
    searchText: normalizeSearchText([id, code, resolvedDescription].filter(Boolean).join(" ")),
  };
}

async function apiError(response: Response) {
  const body = await response.text();
  if (!body) return `Smart Trade API gaf status ${response.status}.`;

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const message = parsed.userMessage ?? parsed.message ?? parsed.error;
    if (typeof message === "string" && message.trim()) return message.trim();
  } catch {
    // De API kan ook een korte tekstmelding teruggeven.
  }

  return body.trim().slice(0, 500);
}

async function fetchArticlePage(page: number) {
  const config = getSmartTradePullConfig("test");
  const target = new URL(config.baseUrl);
  target.pathname = `${target.pathname.replace(/\/+$/, "")}/articles`;
  target.searchParams.set("page", String(page));
  target.searchParams.set("per_page", String(ARTICLE_PAGE_SIZE));
  target.searchParams.set("endoflife", "0");

  const response = await fetchWithSmartTradeTimeout(
    target.toString(),
    getSmartTradePullHeaders("test"),
    "test",
  );
  if (!response.ok) throw new Error(await apiError(response));

  return articleRows(await response.json().catch(() => null));
}

async function loadArticleCatalog() {
  if (articleCache && articleCache.expiresAt > Date.now()) return articleCache.articles;
  if (articleRequest) return articleRequest;

  articleRequest = (async () => {
    const articles = new Map<string, ArticleOption>();

    for (let page = 1; page <= ARTICLE_MAX_PAGES; page += 1) {
      const rows = await fetchArticlePage(page);
      if (rows.length === 0) break;

      const previousSize = articles.size;
      rows.forEach((row) => {
        const article = normalizeArticle(row);
        if (!article) return;
        articles.set(`${article.id}:${article.code}`, article);
      });

      if (articles.size === previousSize || rows.length < ARTICLE_PAGE_SIZE) break;
    }

    const result = [...articles.values()].sort((left, right) =>
      left.description.localeCompare(right.description, "nl-NL", { sensitivity: "base" }),
    );
    articleCache = { articles: result, expiresAt: Date.now() + ARTICLE_CACHE_MS };
    return result;
  })();

  try {
    return await articleRequest;
  } finally {
    articleRequest = null;
  }
}

export async function GET(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 401 });
    }

    if (verified.profile.role !== "admin") {
      return NextResponse.json({ error: "Alleen een admin kan testartikelen bekijken." }, { status: 403 });
    }

    const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const normalizedQuery = normalizeSearchText(query);
    const catalog = await loadArticleCatalog();
    const articles = catalog
      .filter((article) => !normalizedQuery || article.searchText.includes(normalizedQuery))
      .sort((left, right) => {
        const leftCode = normalizeSearchText(left.code);
        const rightCode = normalizeSearchText(right.code);
        const leftDescription = normalizeSearchText(left.description);
        const rightDescription = normalizeSearchText(right.description);
        const leftScore = leftCode === normalizedQuery
          ? 0
          : leftCode.startsWith(normalizedQuery)
            ? 1
            : leftDescription.startsWith(normalizedQuery)
              ? 2
              : 3;
        const rightScore = rightCode === normalizedQuery
          ? 0
          : rightCode.startsWith(normalizedQuery)
            ? 1
            : rightDescription.startsWith(normalizedQuery)
              ? 2
              : 3;
        return leftScore - rightScore || left.description.localeCompare(right.description, "nl-NL");
      })
      .slice(0, 40)
      .map((article) => ({
        id: article.id,
        code: article.code,
        description: article.description,
        price: article.price,
      }));

    return NextResponse.json(
      { articles, total: catalog.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Artikelen ophalen mislukt." },
      { status: 500 },
    );
  }
}
