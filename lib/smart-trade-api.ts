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

type SmartTradeConfig = {
  baseUrl: string;
  company: string;
  user: string;
  password: string;
  timeoutMs: number;
};

type SmartTradeRelationsApiResponse = {
  data?: Array<{
    id?: number | string;
    company?: string | null;
    email?: string | null;
    debtorNumber?: string | number | null;
    contactAddress?: {
      data?: {
        street?: string | null;
        postcode?: string | null;
        city?: string | null;
      } | null;
    } | null;
  }>;
};

const DEFAULT_TIMEOUT_MS = 15000;

export const SMART_TRADE_CONFIG_ERROR =
  "Smart Trade API is niet geconfigureerd. Voeg SMART_TRADE_API_USER, SMART_TRADE_API_PASSWORD en SMART_TRADE_COMPANY_KEY toe aan je environment variables.";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return null;
  return value;
}

function normalizeBaseUrl(value?: string | null) {
  const fallback = "https://retail.troublefree.nl/v3/api";
  const raw = value?.trim() || fallback;
  const withoutDocs = raw.replace(/\/documentation\/?$/i, "");
  const withoutTrailingSlash = withoutDocs.replace(/\/$/, "");

  if (/\/v3\/api$/i.test(withoutTrailingSlash)) return withoutTrailingSlash;
  if (/\/v3$/i.test(withoutTrailingSlash)) return `${withoutTrailingSlash}/api`;

  return `${withoutTrailingSlash}/v3/api`;
}

function getConfig(): SmartTradeConfig {
  const user = requiredEnv("SMART_TRADE_API_USER");
  const password = requiredEnv("SMART_TRADE_API_PASSWORD");
  const company = requiredEnv("SMART_TRADE_COMPANY_KEY") ?? "troublefree";

  if (!user || !password || !company) {
    throw new Error(SMART_TRADE_CONFIG_ERROR);
  }

  return {
    baseUrl: normalizeBaseUrl(process.env.SMART_TRADE_API_BASE_URL),
    company,
    user,
    password,
    timeoutMs: Number(process.env.SMART_TRADE_API_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  };
}

function getHeaders(config: SmartTradeConfig) {
  const credentials = Buffer.from(`${config.user}:${config.password}`).toString("base64");

  return {
    Authorization: `Basic ${credentials}`,
    Company: config.company,
    company: config.company,
    Accept: "application/json",
  };
}

async function fetchWithTimeout(url: string, headers: Record<string, string>, timeoutMs: number) {
  const safeTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), safeTimeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Smart Trade API timeout na ${safeTimeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildRelationsUrl(baseUrl: string, path: "/relations" | "/api/relations") {
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set("customFields.smart trade (auto)[exact]", "1");
  url.searchParams.set("include", "contactAddress");
  url.searchParams.set("per_page", "5000");
  return url;
}

export function getRelationName(relation: SmartTradeRelation) {
  const company = [relation.companyPrefix, relation.company].filter(Boolean).join(" ").trim();
  const person = [relation.firstname, relation.lastname].filter(Boolean).join(" ").trim();
  return company || person || `Relatie ${relation.id}`;
}

export async function searchRelations(_term?: string) {
  void _term;
  const config = getConfig();
  const headers = getHeaders(config);

  const primaryUrl = buildRelationsUrl(config.baseUrl, "/relations");
  let response = await fetchWithTimeout(primaryUrl.toString(), headers, config.timeoutMs);

  if (response.status === 505) {
    const fallbackUrl = buildRelationsUrl(config.baseUrl, "/api/relations");
    response = await fetchWithTimeout(fallbackUrl.toString(), headers, config.timeoutMs);
  }

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 505 && /Error while determining version/i.test(body)) {
      throw new Error(
        "Smart Trade API fout 505: Error while determining version. Gebruik https://retail.troublefree.nl/v3/api, Basic Auth met SMART_TRADE_API_USER/SMART_TRADE_API_PASSWORD, en header company=troublefree.",
      );
    }

    throw new Error(`Smart Trade API fout ${response.status}: ${body.slice(0, 700)}`);
  }

  const json = (await response.json()) as SmartTradeRelationsApiResponse;
  const rows = Array.isArray(json.data) ? json.data : [];

  return rows
    .filter((row): row is (typeof rows)[number] & { id: number | string } => row.id !== undefined && row.id !== null)
    .map((row) => ({
      id: row.id,
      company: row.company ?? null,
      email: row.email ?? null,
      debtorNumber: row.debtorNumber ?? null,
      street: row.contactAddress?.data?.street ?? null,
      postcode: row.contactAddress?.data?.postcode ?? null,
      city: row.contactAddress?.data?.city ?? null,
    }));
}

export async function getAssetsWithModulesForRelation(_relationId: string | number) {
  void _relationId;
  return [] as AssetWithModules[];
}
