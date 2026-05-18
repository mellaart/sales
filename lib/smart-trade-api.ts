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

export type SmartTradeContractAgreement = {
  id?: number | string;
  startsAt?: string | null;
  endsAt?: string | null;
  article?: {
    id?: number | string;
    code?: string | null;
    name?: string | null;
    description?: string | null;
  } | null;
};

type SmartTradeAsset = {
  id: number | string;
  name?: string | null;
  description?: string | null;
  serialNumber?: string | null;
  owner?: number | string | null;
  contractAgreements?: SmartTradeContractAgreement[];
};

type AssetModule = {
  id: string;
  name: string;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
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

function normalizePath(path: string) {
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return withLeadingSlash.replace(/^\/api\//i, "/");
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

function addParams(url: URL, params: Record<string, string | number | undefined>) {
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && String(value).trim() !== "") {
      url.searchParams.set(key, String(value));
    }
  });
}

async function apiGet(path: string, params: Record<string, string | number | undefined> = {}) {
  const config = getConfig();
  const headers = getHeaders(config);

  const primaryUrl = new URL(`${config.baseUrl}${normalizePath(path)}`);
  addParams(primaryUrl, params);

  let response = await fetchWithTimeout(primaryUrl.toString(), headers, config.timeoutMs);

  if (response.status === 505) {
    const retryUrl = new URL(`${config.baseUrl}/api${normalizePath(path)}`);
    addParams(retryUrl, params);
    response = await fetchWithTimeout(retryUrl.toString(), headers, config.timeoutMs);
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

  return response.json();
}

function toRows<T>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[];
  if (json && typeof json === "object" && "data" in json) {
    const data = (json as { data?: unknown }).data;
    return Array.isArray(data) ? (data as T[]) : [];
  }
  return [];
}

function articleName(agreement: SmartTradeContractAgreement) {
  return agreement.article?.name || agreement.article?.description || agreement.article?.code || "Onbekende module";
}

function isActiveAgreement(agreement: SmartTradeContractAgreement) {
  if (!agreement.endsAt) return true;
  const end = new Date(agreement.endsAt);
  if (Number.isNaN(end.getTime())) return true;
  return end >= new Date();
}

export function getRelationName(relation: SmartTradeRelation) {
  const company = [relation.companyPrefix, relation.company].filter(Boolean).join(" ").trim();
  const person = [relation.firstname, relation.lastname].filter(Boolean).join(" ").trim();
  return company || person || `Relatie ${relation.id}`;
}

export async function searchRelations(term?: string) {
  const query = term?.trim() ?? "";
  const params: Record<string, string | number | undefined> = {
    include: "contactAddress",
    per_page: 5000,
    "customFields.smart trade (auto)[exact]": 1,
  };

  if (query) {
    params.company = query;
  }

  const json = await apiGet("/relations", params);
  const rows = toRows<SmartTradeRelation & { contactAddress?: { data?: { street?: string | null; postcode?: string | null; city?: string | null } | null } | null }>(json);

  return rows
    .filter((row) => row.id !== undefined && row.id !== null)
    .map((row) => ({
      id: row.id,
      company: row.company ?? null,
      companyPrefix: row.companyPrefix ?? null,
      firstname: row.firstname ?? null,
      lastname: row.lastname ?? null,
      email: row.email ?? null,
      debtorNumber: row.debtorNumber ?? null,
      street: row.contactAddress?.data?.street ?? null,
      postcode: row.contactAddress?.data?.postcode ?? null,
      city: row.contactAddress?.data?.city ?? null,
    }));
}

export async function getAssetsWithModulesForRelation(relationId: string | number) {
  const assetsJson = await apiGet("/assets", { owner: relationId });
  const assets = toRows<SmartTradeAsset>(assetsJson);

  return Promise.all(
    assets.map(async (asset) => {
      const detailJson = await apiGet(`/assets/${asset.id}`, { include: "contractAgreements" }).catch(() => asset);
      const detail = detailJson as SmartTradeAsset;
      const agreements = detail.contractAgreements ?? [];

      return {
        id: String(detail.id),
        name: detail.name || detail.description || `Asset ${detail.id}`,
        description: detail.description ?? null,
        serialNumber: detail.serialNumber ?? null,
        modules: agreements.map((agreement) => ({
          id: String(agreement.id ?? `${detail.id}-${articleName(agreement)}`),
          name: articleName(agreement),
          active: isActiveAgreement(agreement),
          startsAt: agreement.startsAt ?? null,
          endsAt: agreement.endsAt ?? null,
        })),
      };
    }),
  ) as Promise<AssetWithModules[]>;
}
