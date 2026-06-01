export type SmartTradeRelation = {
  id: number | string;
  company?: string | null;
  companyPrefix?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  email?: string | null;
  debtorNumber?: string | number | null;
  externalCode?: string | number | null;
  phone?: string | null;
  phoneMobile?: string | null;
  phoneWork?: string | null;
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
  assetClassId: string | null;
  assetClass: string | null;
  description: string | null;
  serialNumber: string | null;
  modules: AssetModule[];
};

export type SmartTradeConfig = {
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
    companyPrefix?: string | null;
    firstname?: string | null;
    lastname?: string | null;
    email?: string | null;
    debtorNumber?: string | number | null;
    externalCode?: string | number | null;
    phone?: string | null;
    phoneMobile?: string | null;
    phoneWork?: string | null;
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
    assetclass?: unknown;
    assetClass?: unknown;
    asset_class?: unknown;
    assetClassName?: unknown;
    class?: unknown;
    classification?: unknown;
    type?: unknown;
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
type SmartTradeAssetRow = NonNullable<SmartTradeAssetsApiResponse["data"]>[number];

type SmartTradeAssetClassesApiResponse = {
  data?: Array<{
    id?: number | string;
    name?: string | null;
    assetNameTemplate?: string | null;
  }>;
};

const DEFAULT_TIMEOUT_MS = 15000;
const RELATION_PAGE_SIZE = 1000;
const RELATION_MAX_PAGES = 5;
const RELATION_MAX_RESULTS = 50;
const RELATION_CACHE_TTL_MS = 5 * 60 * 1000;
const ASSET_CLASS_PAGE_SIZE = 1000;
const ASSET_CLASS_MAX_PAGES = 5;
const ASSET_CLASS_CACHE_TTL_MS = 10 * 60 * 1000;

let relationCache: {
  cacheKey: string;
  expiresAt: number;
  relations: SmartTradeRelation[];
} | null = null;

let assetClassCache: {
  cacheKey: string;
  expiresAt: number;
  classes: Map<string, string>;
} | null = null;

export const SMART_TRADE_CONFIG_ERROR =
  "Smart Trade API is niet geconfigureerd. Voeg SMART_TRADE_COMPANY_KEY, SMART_TRADE_API_USER en SMART_TRADE_API_PASSWORD toe aan je environment variables.";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return null;
  return value;
}

function asString(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function readableText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  }

  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  return (
    readableText(record.data) ??
    readableText(record.name) ??
    readableText(record.description) ??
    readableText(record.label) ??
    readableText(record.title) ??
    null
  );
}

function readableId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  }

  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  return readableId(record.id) ?? readableId(record.data) ?? null;
}

function isNumericText(value: string) {
  return /^\d+$/.test(value.trim());
}

function getAssetClassId(asset: SmartTradeAssetRow) {
  const record = asset as Record<string, unknown>;
  const candidates = [record.assetClass, record.assetclass, record.asset_class];

  for (const candidate of candidates) {
    const id = readableId(candidate);
    if (id) return id;
  }

  return null;
}

function getInlineAssetClassName(asset: SmartTradeAssetRow) {
  const record = asset as Record<string, unknown>;
  const candidates = [
    record.assetClassName,
    record.assetclass,
    record.assetClass,
    record.asset_class,
    record.class,
    record.classification,
    record.type,
  ];

  for (const candidate of candidates) {
    const text = readableText(candidate);
    if (text && !isNumericText(text)) return text;
  }

  return null;
}

function getAssetClassName(asset: SmartTradeAssetRow, assetClasses: Map<string, string>) {
  const assetClassId = getAssetClassId(asset);
  if (assetClassId) {
    const mappedName = assetClasses.get(assetClassId);
    if (mappedName) return mappedName;
  }

  return getInlineAssetClassName(asset);
}

export function normalizeBaseUrl(value?: string | null) {
  const fallback = "https://retail.troublefree.nl/v3/api";
  const raw = value?.trim() || fallback;
  const withoutDocs = raw.replace(/\/documentation\/?$/i, "");
  const withoutTrailingSlash = withoutDocs.replace(/\/$/, "");

  if (/\/v3\/api$/i.test(withoutTrailingSlash)) return withoutTrailingSlash;
  if (/\/v3$/i.test(withoutTrailingSlash)) return `${withoutTrailingSlash}/api`;

  return `${withoutTrailingSlash}/v3/api`;
}

function getConfig(): SmartTradeConfig {
  const company = requiredEnv("SMART_TRADE_COMPANY_KEY") ?? requiredEnv("SMART_TRADE_COMPANY");
  const user = requiredEnv("SMART_TRADE_API_USER");
  const password = requiredEnv("SMART_TRADE_API_PASSWORD");

  if (!company || !user || !password) {
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

export function resolveSmartTradeConfig(overrides?: Partial<Pick<SmartTradeConfig, "baseUrl" | "company" | "user" | "password" | "timeoutMs">>) {
  if (overrides?.user && overrides?.password) {
    return {
      baseUrl: normalizeBaseUrl(overrides.baseUrl),
      company: overrides.company?.trim() || "troublefree",
      user: overrides.user.trim(),
      password: overrides.password.trim(),
      timeoutMs: Number(overrides.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    } as SmartTradeConfig;
  }

  return getConfig();
}

function getHeaders(config: SmartTradeConfig) {
  const credentials = Buffer.from(`${config.user}:${config.password}`).toString("base64");

  return {
    accept: "application/json, text/plain, */*",
    authorization: `Basic ${credentials}`,
    company: config.company,
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
      redirect: "follow",
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

function buildRelationsUrl(baseUrl: string, page: number) {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/relations`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(RELATION_PAGE_SIZE));
  return url;
}

function buildAssetClassesUrl(baseUrl: string, page: number) {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/asset_classes`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(ASSET_CLASS_PAGE_SIZE));
  return url;
}

function relationSearchText(relation: SmartTradeRelation) {
  return [
    relation.id,
    relation.company,
    relation.companyPrefix,
    relation.firstname,
    relation.lastname,
    relation.email,
    relation.debtorNumber,
    relation.externalCode,
  ]
    .map(asString)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function mapRelationRow(row: NonNullable<SmartTradeRelationsApiResponse["data"]>[number]) {
  if (row.id === undefined || row.id === null) return null;

  return {
    id: row.id,
    company: row.company ?? null,
    companyPrefix: row.companyPrefix ?? null,
    firstname: row.firstname ?? null,
    lastname: row.lastname ?? null,
    email: row.email ?? null,
    debtorNumber: row.debtorNumber ?? row.externalCode ?? null,
    externalCode: row.externalCode ?? null,
    phone: row.phone ?? null,
    phoneMobile: row.phoneMobile ?? null,
    phoneWork: row.phoneWork ?? null,
    street: row.contactAddress?.data?.street ?? null,
    postcode: row.contactAddress?.data?.postcode ?? null,
    city: row.contactAddress?.data?.city ?? null,
  } satisfies SmartTradeRelation;
}

function getRelationCacheKey(config: SmartTradeConfig) {
  return `${config.baseUrl}|${config.company}`;
}

function getAssetClassCacheKey(config: SmartTradeConfig) {
  return `${config.baseUrl}|${config.company}`;
}

async function getCachedRelations(config: SmartTradeConfig, headers: Record<string, string>) {
  const cacheKey = getRelationCacheKey(config);
  const now = Date.now();

  if (relationCache?.cacheKey === cacheKey && relationCache.expiresAt > now) {
    return relationCache.relations;
  }

  const relations = new Map<string, SmartTradeRelation>();

  for (let page = 1; page <= RELATION_MAX_PAGES; page += 1) {
    const relationsUrl = buildRelationsUrl(config.baseUrl, page);
    const response = await fetchWithTimeout(relationsUrl.toString(), headers, config.timeoutMs);
    const json = await readSmartTradeJson<SmartTradeRelationsApiResponse>(response);
    const rows = Array.isArray(json.data) ? json.data : [];

    for (const row of rows) {
      const relation = mapRelationRow(row);
      if (!relation) continue;
      relations.set(String(relation.id), relation);
    }

    if (rows.length < RELATION_PAGE_SIZE) break;
  }

  relationCache = {
    cacheKey,
    expiresAt: now + RELATION_CACHE_TTL_MS,
    relations: Array.from(relations.values()),
  };

  return relationCache.relations;
}

async function getCachedAssetClasses(config: SmartTradeConfig, headers: Record<string, string>) {
  const cacheKey = getAssetClassCacheKey(config);
  const now = Date.now();

  if (assetClassCache?.cacheKey === cacheKey && assetClassCache.expiresAt > now) {
    return assetClassCache.classes;
  }

  const classes = new Map<string, string>();

  for (let page = 1; page <= ASSET_CLASS_MAX_PAGES; page += 1) {
    const assetClassesUrl = buildAssetClassesUrl(config.baseUrl, page);
    const response = await fetchWithTimeout(assetClassesUrl.toString(), headers, config.timeoutMs);
    const json = await readSmartTradeJson<SmartTradeAssetClassesApiResponse>(response);
    const rows = Array.isArray(json.data) ? json.data : [];

    for (const row of rows) {
      if (row.id === undefined || row.id === null) continue;
      const name = row.name?.trim();
      if (!name) continue;
      classes.set(String(row.id), name);
    }

    if (rows.length < ASSET_CLASS_PAGE_SIZE) break;
  }

  assetClassCache = {
    cacheKey,
    expiresAt: now + ASSET_CLASS_CACHE_TTL_MS,
    classes,
  };

  return assetClassCache.classes;
}

export function getRelationName(relation: SmartTradeRelation) {
  const company = [relation.companyPrefix, relation.company].filter(Boolean).join(" ").trim();
  const person = [relation.firstname, relation.lastname].filter(Boolean).join(" ").trim();
  return company || person || `Relatie ${relation.id}`;
}

async function readSmartTradeJson<T>(response: Response) {
  const body = await response.text();

  if (!response.ok) {
    if (response.status === 505 && /Error while determining version/i.test(body)) {
      throw new Error(
        "Smart Trade API fout 505: Error while determining version. De assets-pagina gebruikt nu exact /v3/api met lowercase authorization/company headers.",
      );
    }

    throw new Error(`Smart Trade API fout ${response.status}: ${body.slice(0, 700)}`);
  }

  try {
    return (body ? JSON.parse(body) : {}) as T;
  } catch {
    throw new Error(`Smart Trade API gaf geen geldige JSON terug: ${body.slice(0, 300)}`);
  }
}

export async function searchRelations(term?: string) {
  const config = getConfig();
  const headers = getHeaders(config);
  const normalizedTerm = term?.trim().toLowerCase() ?? "";

  if (/^\d+$/.test(normalizedTerm)) {
    try {
      return [await getRelationById(normalizedTerm)];
    } catch {
      // Als het nummer geen relatie-ID is, zoeken we alsnog in de opgehaalde lijst.
    }
  }

  const relations = await getCachedRelations(config, headers);
  if (!normalizedTerm) return relations.slice(0, RELATION_MAX_RESULTS);

  return relations
    .filter((relation) => relationSearchText(relation).includes(normalizedTerm))
    .slice(0, RELATION_MAX_RESULTS);
}

function isModuleActive(endsAt: string | null | undefined) {
  if (!endsAt) return true;
  const endDate = new Date(endsAt);
  if (Number.isNaN(endDate.getTime())) return true;
  return endDate.getTime() >= Date.now();
}

function mapAssetModules(asset: SmartTradeAssetRow) {
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

function mapAssetRow(asset: SmartTradeAssetRow, assetClasses: Map<string, string>): AssetWithModules | null {
  if (asset.id === undefined || asset.id === null) return null;

  return {
    id: String(asset.id),
    name: asset.name?.trim() || `Asset ${asset.id}`,
    assetClassId: getAssetClassId(asset),
    assetClass: getAssetClassName(asset, assetClasses),
    description: asset.description ?? null,
    serialNumber: asset.serialNumber ?? null,
    modules: mapAssetModules(asset),
  };
}

export async function getAssetsWithModulesForRelation(_relationId: string | number) {
  const relationId = String(_relationId).trim();
  const config = getConfig();
  const headers = getHeaders(config);
  const assetClasses = await getCachedAssetClasses(config, headers).catch(() => new Map<string, string>());

  const assetsUrl = new URL(`${config.baseUrl.replace(/\/+$/, "")}/assets`);
  assetsUrl.searchParams.set("owner", relationId);
  assetsUrl.searchParams.set("onlyRoot", "0");
  assetsUrl.searchParams.set("include", "contractAgreements");
  assetsUrl.searchParams.set("per_page", "500");

  const response = await fetchWithTimeout(assetsUrl.toString(), headers, config.timeoutMs);
  const json = await readSmartTradeJson<SmartTradeAssetsApiResponse>(response);
  const assets = Array.isArray(json.data) ? json.data : [];

  const shouldFallback = assets.some((asset) => !asset.contractAgreements);
  if (shouldFallback) {
    const fallbackAssets: AssetWithModules[] = [];

    for (const asset of assets) {
      if (asset.id === undefined || asset.id === null) continue;
      const detailUrl = new URL(`${config.baseUrl.replace(/\/+$/, "")}/assets/${asset.id}`);
      detailUrl.searchParams.set("include", "contractAgreements");
      const detailResponse = await fetchWithTimeout(detailUrl.toString(), headers, config.timeoutMs);
      if (!detailResponse.ok) continue;

      const detailJson = await readSmartTradeJson<{ data?: SmartTradeAssetRow }>(detailResponse);
      const detailAsset = detailJson.data;
      if (!detailAsset) continue;

      const mappedAsset = mapAssetRow(detailAsset, assetClasses);
      if (mappedAsset) fallbackAssets.push(mappedAsset);
    }

    return fallbackAssets;
  }

  return assets
    .map((asset) => mapAssetRow(asset, assetClasses))
    .filter((asset): asset is AssetWithModules => asset !== null);
}

export async function getRelationById(relationId: string | number, overrides?: Partial<Pick<SmartTradeConfig, "baseUrl" | "company" | "user" | "password" | "timeoutMs">>) {
  const id = String(relationId).trim();
  if (!id) throw new Error("relationId is verplicht.");

  const config = resolveSmartTradeConfig(overrides);
  const headers = getHeaders(config);

  const relationUrl = new URL(`${config.baseUrl.replace(/\/+$/, "")}/relations/${encodeURIComponent(id)}`);
  const response = await fetchWithTimeout(relationUrl.toString(), headers, config.timeoutMs);
  const json = await readSmartTradeJson<{ data?: SmartTradeRelation | null }>(response);

  if (!json.data) throw new Error(`Relatie ${id} niet gevonden.`);

  return json.data;
}
