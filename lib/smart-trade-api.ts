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

export type SmartTradePrimaryContact = {
  id: string | null;
  name: string;
  email: string | null;
};

type SmartTradeAddress = {
  street?: string | null;
  postcode?: string | null;
  city?: string | null;
  isContact?: boolean | null;
};

type SmartTradeRelationDetail = SmartTradeRelation & {
  contactAddress?: {
    data?: SmartTradeAddress | null;
  } | SmartTradeAddress | null;
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
  quantity: number | null;
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
    owner?: unknown;
    quantity?: number | string | null;
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

type SmartTradeRelationAssetIncludeResponse = {
  data?: {
    assets?: { data?: SmartTradeAssetRow[] | null } | SmartTradeAssetRow[] | null;
  } | null;
};

type SmartTradeContactPersonsApiResponse = {
  data?: Array<Record<string, unknown>> | {
    data?: Array<Record<string, unknown>> | null;
  } | null;
};

const DEFAULT_TIMEOUT_MS = 15000;
const RELATION_PAGE_SIZE = 1000;
const RELATION_MAX_PAGES = 5;
const RELATION_MAX_RESULTS = 50;
const RELATION_CACHE_TTL_MS = 5 * 60 * 1000;
const ASSET_PAGE_SIZE = 500;
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

function recordText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const text = readableText(record[key]);
    if (text) return text;
  }

  return null;
}

function booleanValue(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    return ["1", "true", "yes", "ja"].includes(value.trim().toLowerCase());
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return booleanValue(record.value ?? record.data);
  }

  return false;
}

function unwrapContactPersonRow(row: Record<string, unknown>) {
  const nestedData = row.data;
  if (!nestedData || typeof nestedData !== "object" || Array.isArray(nestedData)) return row;
  return { ...row, ...(nestedData as Record<string, unknown>) };
}

function readContactPersonRows(json: SmartTradeContactPersonsApiResponse) {
  if (Array.isArray(json.data)) return json.data.map(unwrapContactPersonRow);
  if (json.data && Array.isArray(json.data.data)) return json.data.data.map(unwrapContactPersonRow);
  return [];
}

function mapPrimaryContact(row: Record<string, unknown>): SmartTradePrimaryContact | null {
  const firstName = recordText(row, ["firstName", "firstname", "first_name"]);
  const initials = recordText(row, ["initials", "initial"]);
  const lastNamePrefix = recordText(row, ["lastNamePrefix", "lastnamePrefix", "last_name_prefix", "prefix"]);
  const lastName = recordText(row, ["lastName", "lastname", "last_name"]);
  const composedName = [firstName ?? initials, lastNamePrefix, lastName].filter(Boolean).join(" ").trim();
  const directName = recordText(row, ["fullName", "fullname", "full_name", "displayName", "name"]);
  const name = composedName || directName || "";

  if (!name) return null;

  return {
    id: readableId(row.id),
    name,
    email: recordText(row, ["email", "emailAddress", "email_address"]),
  };
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

function getAssetQuantity(asset: SmartTradeAssetRow) {
  const quantity = Number((asset as Record<string, unknown>).quantity ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
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

function getSmartTradeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function getSmartTradeFetchErrorDetail(error: unknown) {
  if (!(error instanceof Error)) return String(error);

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message && cause.message !== error.message) {
    return `${error.message}: ${cause.message}`;
  }

  if (cause && typeof cause === "object") {
    const causeMessage = "message" in cause ? String(cause.message) : "";
    const causeCode = "code" in cause ? String(cause.code) : "";
    const detail = [causeCode, causeMessage].filter(Boolean).join(" ");
    if (detail && detail !== error.message) return `${error.message}: ${detail}`;
  }

  return error.message;
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

    throw new Error(
      `Smart Trade API verbinding mislukt naar ${getSmartTradeHost(url)}: ${getSmartTradeFetchErrorDetail(error)}. Controleer SMART_TRADE_API_BASE_URL, DNS/SSL en firewall vanaf de server.`,
    );
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

function buildAssetsUrl(baseUrl: string, options: { owner?: string; include?: string } = {}) {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/assets`);

  if (options.owner) url.searchParams.set("owner", options.owner);
  if (options.include) url.searchParams.set("include", options.include);

  url.searchParams.set("onlyRoot", "0");
  url.searchParams.set("per_page", String(ASSET_PAGE_SIZE));

  return url;
}

function buildRelationAssetsUrl(baseUrl: string, relationId: string) {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/relations/${encodeURIComponent(relationId)}`);
  url.searchParams.set("include", "assets");
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

function getContactAddress(relation: SmartTradeRelationDetail): SmartTradeAddress | null {
  const contactAddress = relation.contactAddress;
  if (!contactAddress) return null;
  if ("data" in contactAddress) return contactAddress.data ?? null;
  return contactAddress as SmartTradeAddress;
}

function mapRelationDetail(relation: SmartTradeRelationDetail, fallbackAddress?: SmartTradeAddress | null) {
  const contactAddress = getContactAddress(relation) ?? fallbackAddress ?? null;

  return {
    ...relation,
    street: relation.street ?? contactAddress?.street ?? null,
    postcode: relation.postcode ?? contactAddress?.postcode ?? null,
    city: relation.city ?? contactAddress?.city ?? null,
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

async function fetchAssetRows(url: URL, headers: Record<string, string>, timeoutMs: number) {
  const response = await fetchWithTimeout(url.toString(), headers, timeoutMs);
  const json = await readSmartTradeJson<SmartTradeAssetsApiResponse>(response);
  return Array.isArray(json.data) ? json.data : [];
}

function readIncludedAssets(json: SmartTradeRelationAssetIncludeResponse) {
  const assets = json.data?.assets;
  if (Array.isArray(assets)) return assets;
  if (assets && Array.isArray(assets.data)) return assets.data;
  return [];
}

async function fetchRelationIncludedAssets(config: SmartTradeConfig, headers: Record<string, string>, relationId: string) {
  const response = await fetchWithTimeout(buildRelationAssetsUrl(config.baseUrl, relationId).toString(), headers, config.timeoutMs);
  const json = await readSmartTradeJson<SmartTradeRelationAssetIncludeResponse>(response);
  return readIncludedAssets(json);
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
    quantity: getAssetQuantity(asset),
    modules: mapAssetModules(asset),
  };
}

export async function getAssetsWithModulesForRelation(_relationId: string | number) {
  const relationId = String(_relationId).trim();
  const config = getConfig();
  const headers = getHeaders(config);
  const assetClasses = await getCachedAssetClasses(config, headers).catch(() => new Map<string, string>());

  const assetsUrl = buildAssetsUrl(config.baseUrl, { owner: relationId, include: "contractAgreements" });
  let assets = await fetchAssetRows(assetsUrl, headers, config.timeoutMs);

  if (assets.length === 0) {
    assets = await fetchRelationIncludedAssets(config, headers, relationId).catch(() => []);
  }

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
  relationUrl.searchParams.set("include", "contactAddress");
  const response = await fetchWithTimeout(relationUrl.toString(), headers, config.timeoutMs);
  const json = await readSmartTradeJson<{ data?: SmartTradeRelationDetail | null }>(response);

  if (!json.data) throw new Error(`Relatie ${id} niet gevonden.`);

  const mappedRelation = mapRelationDetail(json.data);
  if (mappedRelation.postcode) return mappedRelation;

  const addressesUrl = new URL(`/api/v1/relations/${encodeURIComponent(id)}/addresses`, config.baseUrl);
  const fallbackAddress = await fetchWithTimeout(addressesUrl.toString(), headers, config.timeoutMs)
    .then((addressResponse) => readSmartTradeJson<{ data?: SmartTradeAddress[] | null }>(addressResponse))
    .then((addressJson) => {
      const addresses = Array.isArray(addressJson.data) ? addressJson.data : [];
      return addresses.find((address) => address.isContact !== false) ?? addresses[0] ?? null;
    })
    .catch(() => null);

  return mapRelationDetail(json.data, fallbackAddress);
}

export async function getPrimaryContactPersonForRelation(
  relationId: string | number,
  overrides?: Partial<Pick<SmartTradeConfig, "baseUrl" | "company" | "user" | "password" | "timeoutMs">>,
) {
  const id = String(relationId).trim();
  if (!id) throw new Error("relationId is verplicht.");

  const config = resolveSmartTradeConfig(overrides);
  const headers = getHeaders(config);
  const contactPersonsUrl = new URL(
    `${config.baseUrl.replace(/\/+$/, "")}/relations/${encodeURIComponent(id)}/contactpersons`,
  );
  contactPersonsUrl.searchParams.set("per_page", "100");

  const response = await fetchWithTimeout(contactPersonsUrl.toString(), headers, config.timeoutMs);
  const json = await readSmartTradeJson<SmartTradeContactPersonsApiResponse>(response);
  const primaryRow = readContactPersonRows(json).find((row) => (
    booleanValue(row.isPrimary) ||
    booleanValue(row.isprimary) ||
    booleanValue(row.is_primary)
  ));

  return primaryRow ? mapPrimaryContact(primaryRow) : null;
}
