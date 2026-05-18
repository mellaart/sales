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

type SmartTradeAssetsApiResponse = {
  data?: Array<{
    id?: number | string;
    name?: string | null;
    description?: string | null;
    serialNumber?: string | null;
    contractAgreements?: {
      data?: Array<{
        id?: number | string;
        startsAt?: string | null;
        endsAt?: string | null;
        article?: {
          data?: {
            id?: number | string;
            name?: string | null;
            description?: string | null;
          } | null;
        } | null;
      }>;
    } | null;
  }>;
};

const DEFAULT_TIMEOUT_MS = 15000;

export const SMART_TRADE_CONFIG_ERROR =
  "Smart Trade API is niet geconfigureerd. Voeg SMART_TRADE_API_USER en SMART_TRADE_API_PASSWORD toe aan je environment variables.";

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
  const company = requiredEnv("SMART_TRADE_COMPANY_KEY") ?? requiredEnv("SMART_TRADE_COMPANY") ?? "troublefree";

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

export async function searchRelations(term?: string) {
  const config = getConfig();
  const headers = getHeaders(config);

  const primaryUrl = buildRelationsUrl(config.baseUrl, "/relations");
  if (term?.trim()) {
    primaryUrl.searchParams.set("search", term.trim());
  }
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

function isModuleActive(endsAt: string | null | undefined) {
  if (!endsAt) return true;
  const endDate = new Date(endsAt);
  if (Number.isNaN(endDate.getTime())) return true;
  return endDate.getTime() >= Date.now();
}

function mapAssetModules(asset: NonNullable<SmartTradeAssetsApiResponse["data"]>[number]) {
  const agreements = asset.contractAgreements?.data ?? [];

  return agreements
    .filter((agreement) => agreement.id !== undefined && agreement.id !== null)
    .map((agreement) => {
      const article = agreement.article?.data;
      const moduleName = article?.name?.trim() || article?.description?.trim() || `Module ${agreement.id}`;

      return {
        id: String(agreement.id),
        name: moduleName,
        startsAt: agreement.startsAt ?? null,
        endsAt: agreement.endsAt ?? null,
        active: isModuleActive(agreement.endsAt ?? null),
      };
    });
}

export async function getAssetsWithModulesForRelation(_relationId: string | number) {
  const relationId = String(_relationId).trim();
  const config = getConfig();
  const headers = getHeaders(config);

  const assetsUrl = new URL(`${config.baseUrl}/assets`);
  assetsUrl.searchParams.set("owner", relationId);
  assetsUrl.searchParams.set("include", "contractAgreements");
  assetsUrl.searchParams.set("per_page", "500");

  const response = await fetchWithTimeout(assetsUrl.toString(), headers, config.timeoutMs);
  if (!response.ok) {
    throw new Error(`Smart Trade API fout ${response.status}: ${(await response.text()).slice(0, 700)}`);
  }

  const json = (await response.json()) as SmartTradeAssetsApiResponse;
  const assets = Array.isArray(json.data) ? json.data : [];

  const shouldFallback = assets.some((asset) => !asset.contractAgreements);
  if (shouldFallback) {
    const fallbackAssets: AssetWithModules[] = [];

    for (const asset of assets) {
      if (asset.id === undefined || asset.id === null) continue;
      const detailUrl = new URL(`${config.baseUrl}/assets/${asset.id}`);
      detailUrl.searchParams.set("include", "contractAgreements");
      const detailResponse = await fetchWithTimeout(detailUrl.toString(), headers, config.timeoutMs);
      if (!detailResponse.ok) continue;

      const detailJson = (await detailResponse.json()) as { data?: SmartTradeAssetsApiResponse["data"] extends Array<infer T> ? T : never };
      const detailAsset = detailJson.data;
      if (!detailAsset || detailAsset.id === undefined || detailAsset.id === null) continue;

      fallbackAssets.push({
        id: String(detailAsset.id),
        name: detailAsset.name?.trim() || `Asset ${detailAsset.id}`,
        description: detailAsset.description ?? null,
        serialNumber: detailAsset.serialNumber ?? null,
        modules: mapAssetModules(detailAsset),
      });
    }

    return fallbackAssets;
  }

  return assets
    .filter((asset): asset is (typeof assets)[number] & { id: number | string } =>
      asset.id !== undefined && asset.id !== null,
    )
    .map((asset) => ({
      id: String(asset.id),
      name: asset.name?.trim() || `Asset ${asset.id}`,
      description: asset.description ?? null,
      serialNumber: asset.serialNumber ?? null,
      modules: mapAssetModules(asset),
    }));
}
