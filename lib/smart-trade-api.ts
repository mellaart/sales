export type SmartTradeRelation = {
  id: number | string;
  company?: string | null;
  companyPrefix?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  email?: string | null;
  debtorNumber?: string | number | null;
  street?: string | null;
  postcode?: string | null;
  city?: string | null;
};

type AssetModule = {
  id: string;
  name: string;
  active: boolean;
};

type AssetWithModules = {
  id: string;
  name: string;
  description: string | null;
  serialNumber: string | null;
  modules: AssetModule[];
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return null;
  return value;
}

const DEFAULT_TIMEOUT_MS = 15000;

function normalizeBaseUrl(value?: string | null) {
  const fallback = "https://retail.troublefree.nl/v3/api";
  const raw = value?.trim() || fallback;
  const withoutDocs = raw.replace(/\/documentation\/?$/i, "");
  const withoutTrailingSlash = withoutDocs.replace(/\/$/, "");

  if (/\/v3\/api$/i.test(withoutTrailingSlash)) return withoutTrailingSlash;
  if (/\/v3$/i.test(withoutTrailingSlash)) return `${withoutTrailingSlash}/api`;
  return `${withoutTrailingSlash}/v3/api`;
}

export const SMART_TRADE_CONFIG_ERROR =
  "Smart Trade API is niet geconfigureerd. Voeg SMART_TRADE_API_USER, SMART_TRADE_API_PASSWORD en SMART_TRADE_COMPANY_KEY toe aan je environment variables.";

type SmartTradeConfig = {
  baseUrl: string;
  credentials: string;
  company: string;
  timeoutMs: number;
};

function getConfig(): SmartTradeConfig {
  const user = requiredEnv("SMART_TRADE_API_USER");
  const password = requiredEnv("SMART_TRADE_API_PASSWORD");
  const company = requiredEnv("SMART_TRADE_COMPANY_KEY") ?? "troublefree";

  if (!user || !password || !company) {
    throw new Error(SMART_TRADE_CONFIG_ERROR);
  }

  return {
    baseUrl: normalizeBaseUrl(process.env.SMART_TRADE_API_BASE_URL),
    credentials: Buffer.from(`${user}:${password}`).toString("base64"),
    company,
    timeoutMs: Number(process.env.SMART_TRADE_API_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  };
}

function getHeaders(config: SmartTradeConfig) {
  return {
    Authorization: `Basic ${config.credentials}`,
    Company: config.company,
    company: config.company,
    Accept: "application/json",
  };
}

type SmartTradeRelationApiItem = {
  id?: number | string;
  company?: string | null;
  contactAddress?: {
    data?: {
      street?: string | null;
      postcode?: string | null;
      city?: string | null;
    } | null;
  } | null;
};

type SmartTradeRelationsApiResponse = {
  data?: SmartTradeRelationApiItem[];
};

async function fetchWithTimeout(url: string, headers: Record<string, string>, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS);

  try {
    return await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Smart Trade API timeout na ${timeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function getRelationName(relation: SmartTradeRelation) {
  const company = [relation.companyPrefix, relation.company].filter(Boolean).join(" ").trim();
  const person = [relation.firstname, relation.lastname].filter(Boolean).join(" ").trim();
  return company || person || `Relatie ${relation.id}`;
}

export async function searchRelations(_term?: string) {
  const config = getConfig();
  const url = new URL(`${config.baseUrl}/relations`);
  url.searchParams.set("customFields.smart trade (auto)[exact]", "1");
  url.searchParams.set("include", "contactAddress");
  url.searchParams.set("per_page", "5000");

  const response = await fetchWithTimeout(
    url.toString(),
    getHeaders(config),
    Number.isFinite(config.timeoutMs) ? config.timeoutMs : DEFAULT_TIMEOUT_MS,
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Smart Trade API fout ${response.status}: ${body.slice(0, 700)}`);
  }

  const json = (await response.json()) as SmartTradeRelationsApiResponse;
  const rows = Array.isArray(json.data) ? json.data : [];

  return rows
    .filter((row): row is SmartTradeRelationApiItem & { id: number | string } => row.id !== undefined && row.id !== null)
    .map((row) => ({
      id: row.id,
      company: row.company ?? null,
      email: null,
      debtorNumber: null,
      street: row.contactAddress?.data?.street ?? null,
      postcode: row.contactAddress?.data?.postcode ?? null,
      city: row.contactAddress?.data?.city ?? null,
    }));
}

export async function getAssetsWithModulesForRelation(_relationId: string | number) {
  return [] as AssetWithModules[];
}
