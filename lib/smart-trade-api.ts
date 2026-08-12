import { readStoredFile, writeStoredFile } from "@/lib/local-storage";

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
  customFields?: SmartTradeRelationCustomField[] | null;
  hidden?: boolean | number | string | null;
  blocked?: boolean | number | string | null;
  includedContactPersons?: Array<Record<string, unknown>> | null;
};

type SmartTradeRelationCustomField = {
  name?: unknown;
  type?: unknown;
  typeId?: unknown;
  value?: unknown;
};

export type SmartTradeMailchimpContact = {
  email: string;
  company: string;
  tags: string[];
  relationIds: string[];
  sources: Array<"relation" | "contact">;
  conflict: boolean;
};

export type SmartTradeMailchimpSource = {
  contacts: SmartTradeMailchimpContact[];
  relationCount: number;
  contactPersonCount: number;
  contactPersonErrorCount: number;
  invalidEmailCount: number;
  conflictCount: number;
  tags: string[];
};

export type MailchimpSourceRefreshStatus = {
  state: "idle" | "running" | "ready" | "error";
  phase: "idle" | "relations" | "contactpersons" | "complete";
  processed: number;
  total: number | null;
  hasSource: boolean;
  sourceUpdatedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
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
    customFields?: SmartTradeRelationCustomField[] | null;
    hidden?: boolean | number | string | null;
    hide?: boolean | number | string | null;
    blocked?: boolean | number | string | null;
    geblokkeerd?: boolean | number | string | null;
    contactPersons?: SmartTradeContactPersonsApiResponse["data"];
    contactpersons?: SmartTradeContactPersonsApiResponse["data"];
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
const MAILCHIMP_RELATION_MAX_PAGES = 100;
const MAILCHIMP_RELATION_PAGE_CONCURRENCY = 6;
const MAILCHIMP_RELATION_INCLUDE_PAGE_SIZE = 250;
const MAILCHIMP_RELATION_PROBE_PAGE_SIZE = 25;
const MAILCHIMP_CONTACT_CONCURRENCY = 48;
const MAILCHIMP_CONTACT_INCLUDE_CANDIDATES = ["contactPersons", "contactpersons"] as const;
const MAILCHIMP_REQUEST_TIMEOUT_MS = 60_000;
const MAILCHIMP_REQUEST_ATTEMPTS = 3;
const MAILCHIMP_SOURCE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAILCHIMP_SOURCE_CACHE_BUCKET = "smart-trade-settings";
const MAILCHIMP_SOURCE_CACHE_FILE = "mailchimp-source-cache.json";
const RELATION_CACHE_TTL_MS = 30 * 60 * 1000;
const ASSET_PAGE_SIZE = 500;
const ASSET_CLASS_PAGE_SIZE = 1000;
const ASSET_CLASS_MAX_PAGES = 5;
const ASSET_CLASS_CACHE_TTL_MS = 10 * 60 * 1000;

let relationCache: {
  cacheKey: string;
  expiresAt: number;
  relations: SmartTradeRelation[];
} | null = null;

let relationCacheLoad: {
  cacheKey: string;
  promise: Promise<SmartTradeRelation[]>;
} | null = null;

let mailchimpSourceCache: {
  cacheKey: string;
  expiresAt: number;
  updatedAt: string;
  source: SmartTradeMailchimpSource;
} | null = null;

let mailchimpSourceLoad: {
  cacheKey: string;
  promise: Promise<void>;
} | null = null;

let mailchimpSourceRestore: Promise<void> | null = null;

let mailchimpSourceRefreshStatus: MailchimpSourceRefreshStatus = {
  state: "idle",
  phase: "idle",
  processed: 0,
  total: null,
  hasSource: false,
  sourceUpdatedAt: null,
  startedAt: null,
  completedAt: null,
  error: null,
};

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
    return ["1", "true", "yes", "ja", "on"].includes(value.trim().toLowerCase());
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

function getMailchimpRequestTimeoutMs(config: SmartTradeConfig) {
  const configured = Number(process.env.SMART_TRADE_MAILCHIMP_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return Math.max(config.timeoutMs, MAILCHIMP_REQUEST_TIMEOUT_MS);
}

function isRetryableSmartTradeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Smart Trade API timeout|Smart Trade API verbinding mislukt|Smart Trade API fout (?:408|425|429|5\d\d)/i.test(message);
}

async function readSmartTradeJsonWithRetry<T>(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAILCHIMP_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, headers, timeoutMs);
      return await readSmartTradeJson<T>(response);
    } catch (error) {
      lastError = error;
      if (attempt === MAILCHIMP_REQUEST_ATTEMPTS || !isRetryableSmartTradeError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }

  throw lastError;
}

function buildRelationsUrl(
  baseUrl: string,
  page: number,
  contactPersonsInclude?: string | null,
  pageSize = RELATION_PAGE_SIZE,
) {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/relations`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(pageSize));
  url.searchParams.set("include", ["customFields", contactPersonsInclude].filter(Boolean).join(","));
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

function isSoftwareRelation(relation: SmartTradeRelation) {
  return relation.customFields?.some((field) => (
    Number(field.typeId) === 6 && booleanValue(field.value)
  )) ?? false;
}

function readIncludedContactPersonRows(row: Record<string, unknown>) {
  for (const key of MAILCHIMP_CONTACT_INCLUDE_CANDIDATES) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const value = row[key];
    if (Array.isArray(value)) return value.map((item) => unwrapContactPersonRow(item as Record<string, unknown>));
    if (value && typeof value === "object") {
      const data = (value as { data?: unknown }).data;
      if (Array.isArray(data)) return data.map((item) => unwrapContactPersonRow(item as Record<string, unknown>));
    }
    return [];
  }

  return null;
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
    customFields: Array.isArray(row.customFields) ? row.customFields : [],
    hidden: row.hidden ?? row.hide ?? null,
    blocked: row.blocked ?? row.geblokkeerd ?? null,
    includedContactPersons: readIncludedContactPersonRows(row as Record<string, unknown>),
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

  if (relationCacheLoad?.cacheKey === cacheKey) {
    return relationCacheLoad.promise;
  }

  const loadPromise = Promise.all(
    Array.from({ length: RELATION_MAX_PAGES }, (_, index) => index + 1).map(async (page) => {
      const relationsUrl = buildRelationsUrl(config.baseUrl, page);
      const response = await fetchWithTimeout(relationsUrl.toString(), headers, config.timeoutMs);
      const json = await readSmartTradeJson<SmartTradeRelationsApiResponse>(response);
      return Array.isArray(json.data) ? json.data : [];
    }),
  ).then((pages) => {
    const relations = new Map<string, SmartTradeRelation>();

    for (const rows of pages) {
      for (const row of rows) {
        const relation = mapRelationRow(row);
        if (!relation) continue;
        relations.set(String(relation.id), relation);
      }
    }

    const loadedRelations = Array.from(relations.values()).filter(isSoftwareRelation);
    relationCache = {
      cacheKey,
      expiresAt: Date.now() + RELATION_CACHE_TTL_MS,
      relations: loadedRelations,
    };

    return loadedRelations;
  });

  relationCacheLoad = { cacheKey, promise: loadPromise };

  try {
    return await loadPromise;
  } finally {
    if (relationCacheLoad?.promise === loadPromise) relationCacheLoad = null;
  }
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
      const relation = await getRelationById(normalizedTerm);
      return isSoftwareRelation(relation) ? [relation] : [];
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
  relationUrl.searchParams.set("include", "contactAddress,customFields");
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

function normalizeMailchimpEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^\S+@\S+\.\S+$/.test(email) ? email : null;
}

function customFieldTag(field: SmartTradeRelationCustomField) {
  if (!booleanValue(field.value)) return null;
  const nestedTypeName = field.type && typeof field.type === "object" ? readableText(field.type) : null;
  const name = (readableText(field.name) ?? nestedTypeName ?? "").replace(/\s*\(auto\)\s*$/i, "").trim();
  if (name) return name;

  const typeId = readableId(field.typeId)
    ?? (field.type && typeof field.type === "object" ? readableId(field.type) : null)
    ?? readableId(field.type);
  return typeId ? `Vrij veld ${typeId}` : null;
}

function isActiveMailchimpRelation(relation: SmartTradeRelation) {
  return !booleanValue(relation.hidden) && !booleanValue(relation.blocked);
}

function contactPersonIsOnMailingList(row: Record<string, unknown>) {
  const keys = [
    "onMailingList",
    "onMailinglist",
    "on_mailing_list",
    "on_mailinglist",
    "mailingList",
    "mailinglist",
    "isOnMailingList",
  ];
  return keys.some((key) => booleanValue(row[key]));
}

function contactPersonIsDeleted(row: Record<string, unknown>) {
  return Boolean(
    recordText(row, ["deletedAt", "deleted_at"]) ||
    booleanValue(row.deleted) ||
    booleanValue(row.isDeleted),
  );
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await mapper(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return output;
}

async function loadMailchimpContacts(
  config: SmartTradeConfig,
  onProgress?: (phase: "relations" | "contactpersons", processed: number, total: number | null) => void,
): Promise<SmartTradeMailchimpSource> {
  const headers = getHeaders(config);
  const relations = new Map<string, SmartTradeRelation>();
  const seenRelationIds = new Set<string>();
  const requestTimeoutMs = getMailchimpRequestTimeoutMs(config);
  let contactPersonsInclude: string | null = null;

  for (const includeCandidate of MAILCHIMP_CONTACT_INCLUDE_CANDIDATES) {
    try {
      const json = await readSmartTradeJsonWithRetry<SmartTradeRelationsApiResponse>(
        buildRelationsUrl(config.baseUrl, 1, includeCandidate, MAILCHIMP_RELATION_PROBE_PAGE_SIZE).toString(),
        headers,
        requestTimeoutMs,
      );
      const rows = Array.isArray(json.data) ? json.data : [];
      if (rows.some((row) => readIncludedContactPersonRows(row as Record<string, unknown>) !== null)) {
        contactPersonsInclude = includeCandidate;
        break;
      }
    } catch {
      // Niet iedere Smart Trade-versie ondersteunt deze relatie-include.
    }
  }

  for (
    let firstPage = 1;
    firstPage <= MAILCHIMP_RELATION_MAX_PAGES;
    firstPage += MAILCHIMP_RELATION_PAGE_CONCURRENCY
  ) {
    const pageNumbers = Array.from(
      { length: Math.min(MAILCHIMP_RELATION_PAGE_CONCURRENCY, MAILCHIMP_RELATION_MAX_PAGES - firstPage + 1) },
      (_, index) => firstPage + index,
    );
    const pages = await Promise.all(pageNumbers.map(async (page) => {
      const json = await readSmartTradeJsonWithRetry<SmartTradeRelationsApiResponse>(
        buildRelationsUrl(
          config.baseUrl,
          page,
          contactPersonsInclude,
          contactPersonsInclude ? MAILCHIMP_RELATION_INCLUDE_PAGE_SIZE : RELATION_PAGE_SIZE,
        ).toString(),
        headers,
        requestTimeoutMs,
      );
      return Array.isArray(json.data) ? json.data : [];
    }));

    let addedInBatch = 0;
    for (const rows of pages) {
      for (const row of rows) {
        const relation = mapRelationRow(row);
        if (!relation) continue;
        const relationId = String(relation.id);
        if (!seenRelationIds.has(relationId)) addedInBatch += 1;
        seenRelationIds.add(relationId);
        if (isActiveMailchimpRelation(relation)) relations.set(relationId, relation);
      }
    }
    onProgress?.("relations", seenRelationIds.size, null);

    if (pages.some((rows) => rows.length === 0) || addedInBatch === 0) break;
  }

  const taggedRelations = Array.from(relations.values()).filter((relation) =>
    relation.customFields?.some((field) => booleanValue(field.value)),
  );
  const contactsByEmail = new Map<string, {
    companies: Set<string>;
    tags: Set<string>;
    relationIds: Set<string>;
    sources: Set<"relation" | "contact">;
  }>();
  let invalidEmailCount = 0;
  let contactPersonCount = 0;
  let contactPersonErrorCount = 0;
  let processedRelations = 0;

  function addContact(relation: SmartTradeRelation, emailValue: unknown, source: "relation" | "contact") {
    const email = normalizeMailchimpEmail(emailValue);
    if (!email) {
      if (typeof emailValue === "string" && emailValue.trim()) invalidEmailCount += 1;
      return;
    }

    const company = getRelationName(relation);
    const current = contactsByEmail.get(email) ?? {
      companies: new Set<string>(),
      tags: new Set<string>(),
      relationIds: new Set<string>(),
      sources: new Set<"relation" | "contact">(),
    };
    current.companies.add(company);
    current.relationIds.add(String(relation.id));
    current.sources.add(source);
    for (const field of relation.customFields ?? []) {
      const tag = customFieldTag(field);
      if (tag) current.tags.add(tag);
    }
    contactsByEmail.set(email, current);
  }

  for (const relation of taggedRelations) addContact(relation, relation.email, "relation");

  function addContactPersonRows(relation: SmartTradeRelation, rows: Array<Record<string, unknown>>) {
    for (const row of rows) {
      if (!contactPersonIsOnMailingList(row) || contactPersonIsDeleted(row)) continue;
      contactPersonCount += 1;
      addContact(relation, recordText(row, ["email", "emailAddress", "email_address"]), "contact");
    }
  }

  const relationsWithoutIncludedContacts: SmartTradeRelation[] = [];
  for (const relation of taggedRelations) {
    if (relation.includedContactPersons === null || relation.includedContactPersons === undefined) {
      relationsWithoutIncludedContacts.push(relation);
      continue;
    }
    addContactPersonRows(relation, relation.includedContactPersons);
    processedRelations += 1;
    onProgress?.("contactpersons", processedRelations, taggedRelations.length);
  }

  await mapWithConcurrency(relationsWithoutIncludedContacts, MAILCHIMP_CONTACT_CONCURRENCY, async (relation) => {
    const url = new URL(`${config.baseUrl.replace(/\/+$/, "")}/relations/${encodeURIComponent(String(relation.id))}/contactpersons`);
    url.searchParams.set("per_page", "100");

    try {
      const json = await readSmartTradeJsonWithRetry<SmartTradeContactPersonsApiResponse>(
        url.toString(),
        headers,
        requestTimeoutMs,
      );
      const rows = readContactPersonRows(json);
      addContactPersonRows(relation, rows);
    } catch {
      contactPersonErrorCount += 1;
    } finally {
      processedRelations += 1;
      onProgress?.("contactpersons", processedRelations, taggedRelations.length);
    }
  });

  const contacts = Array.from(contactsByEmail.entries())
    .map(([email, value]) => ({
      email,
      company: Array.from(value.companies).sort((a, b) => a.localeCompare(b, "nl")).join(" / "),
      tags: Array.from(value.tags).sort((a, b) => a.localeCompare(b, "nl")),
      relationIds: Array.from(value.relationIds).sort((a, b) => Number(a) - Number(b)),
      sources: Array.from(value.sources),
      conflict: value.companies.size > 1,
    }))
    .sort((a, b) => a.company.localeCompare(b.company, "nl") || a.email.localeCompare(b.email));
  const tags = Array.from(new Set(contacts.flatMap((contact) => contact.tags))).sort((a, b) => a.localeCompare(b, "nl"));

  return {
    contacts,
    relationCount: taggedRelations.length,
    contactPersonCount,
    contactPersonErrorCount,
    invalidEmailCount,
    conflictCount: contacts.filter((contact) => contact.conflict).length,
    tags,
  };
}

export async function getMailchimpContacts(
  options: { forceRefresh?: boolean } = {},
): Promise<SmartTradeMailchimpSource> {
  const config = getConfig();
  const cacheKey = getRelationCacheKey(config);
  const now = Date.now();

  await restoreMailchimpSourceCache(cacheKey);

  if (!options.forceRefresh && mailchimpSourceCache?.cacheKey === cacheKey && mailchimpSourceCache.expiresAt > now) {
    return mailchimpSourceCache.source;
  }

  await startMailchimpContactsRefresh({ forceRefresh: options.forceRefresh });
  if (mailchimpSourceLoad?.cacheKey === cacheKey) await mailchimpSourceLoad.promise;
  if (mailchimpSourceCache?.cacheKey === cacheKey) return mailchimpSourceCache.source;
  throw new Error(mailchimpSourceRefreshStatus.error || "Smart Trade-contacten konden niet worden opgebouwd.");
}

function isMailchimpSource(value: unknown): value is SmartTradeMailchimpSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<SmartTradeMailchimpSource>;
  return Array.isArray(source.contacts) && Array.isArray(source.tags);
}

async function restoreMailchimpSourceCache(cacheKey: string) {
  if (mailchimpSourceCache?.cacheKey === cacheKey) return;
  if (mailchimpSourceRestore) return mailchimpSourceRestore;

  mailchimpSourceRestore = (async () => {
    try {
      const stored = JSON.parse(
        (await readStoredFile(MAILCHIMP_SOURCE_CACHE_BUCKET, MAILCHIMP_SOURCE_CACHE_FILE)).toString("utf8"),
      ) as { cacheKey?: unknown; updatedAt?: unknown; source?: unknown };
      if (stored.cacheKey !== cacheKey || typeof stored.updatedAt !== "string" || !isMailchimpSource(stored.source)) return;

      const updatedAtMs = Date.parse(stored.updatedAt);
      mailchimpSourceCache = {
        cacheKey,
        updatedAt: stored.updatedAt,
        expiresAt: Number.isFinite(updatedAtMs) ? updatedAtMs + MAILCHIMP_SOURCE_CACHE_TTL_MS : 0,
        source: stored.source,
      };
      mailchimpSourceRefreshStatus = {
        state: "ready",
        phase: "complete",
        processed: stored.source.relationCount,
        total: stored.source.relationCount,
        hasSource: true,
        sourceUpdatedAt: stored.updatedAt,
        startedAt: null,
        completedAt: stored.updatedAt,
        error: null,
      };
    } catch {
      // Een ontbrekende of oude cache betekent alleen dat de eerste controle opnieuw wordt opgebouwd.
    }
  })().finally(() => {
    mailchimpSourceRestore = null;
  });

  return mailchimpSourceRestore;
}

function currentMailchimpRefreshStatus(): MailchimpSourceRefreshStatus {
  return {
    ...mailchimpSourceRefreshStatus,
    hasSource: Boolean(mailchimpSourceCache),
    sourceUpdatedAt: mailchimpSourceCache?.updatedAt ?? mailchimpSourceRefreshStatus.sourceUpdatedAt,
  };
}

export async function getMailchimpContactsSnapshot() {
  const config = getConfig();
  const cacheKey = getRelationCacheKey(config);
  await restoreMailchimpSourceCache(cacheKey);
  return mailchimpSourceCache?.cacheKey === cacheKey ? mailchimpSourceCache.source : null;
}

export async function getMailchimpContactsRefreshStatus() {
  const config = getConfig();
  await restoreMailchimpSourceCache(getRelationCacheKey(config));
  return currentMailchimpRefreshStatus();
}

export async function startMailchimpContactsRefresh(
  options: { forceRefresh?: boolean } = {},
): Promise<MailchimpSourceRefreshStatus> {
  const config = getConfig();
  const cacheKey = getRelationCacheKey(config);
  await restoreMailchimpSourceCache(cacheKey);

  if (mailchimpSourceLoad?.cacheKey === cacheKey) return currentMailchimpRefreshStatus();
  if (
    !options.forceRefresh
    && mailchimpSourceCache?.cacheKey === cacheKey
    && mailchimpSourceCache.expiresAt > Date.now()
  ) {
    return currentMailchimpRefreshStatus();
  }

  const startedAt = new Date().toISOString();
  mailchimpSourceRefreshStatus = {
    state: "running",
    phase: "relations",
    processed: 0,
    total: null,
    hasSource: Boolean(mailchimpSourceCache),
    sourceUpdatedAt: mailchimpSourceCache?.updatedAt ?? null,
    startedAt,
    completedAt: null,
    error: null,
  };

  const promise = (async () => {
    try {
      const source = await loadMailchimpContacts(config, (phase, processed, total) => {
        mailchimpSourceRefreshStatus = {
          ...mailchimpSourceRefreshStatus,
          state: "running",
          phase,
          processed,
          total,
          hasSource: Boolean(mailchimpSourceCache),
          error: null,
        };
      });
      const updatedAt = new Date().toISOString();
      mailchimpSourceCache = {
        cacheKey,
        updatedAt,
        expiresAt: Date.now() + MAILCHIMP_SOURCE_CACHE_TTL_MS,
        source,
      };
      try {
        await writeStoredFile(
          MAILCHIMP_SOURCE_CACHE_BUCKET,
          MAILCHIMP_SOURCE_CACHE_FILE,
          JSON.stringify({ cacheKey, updatedAt, source }),
        );
      } catch {
        // De actuele controle blijft in het draaiende proces beschikbaar als opslaan onverhoopt mislukt.
      }
      mailchimpSourceRefreshStatus = {
        state: "ready",
        phase: "complete",
        processed: source.relationCount,
        total: source.relationCount,
        hasSource: true,
        sourceUpdatedAt: updatedAt,
        startedAt,
        completedAt: updatedAt,
        error: null,
      };
    } catch (error) {
      mailchimpSourceRefreshStatus = {
        ...mailchimpSourceRefreshStatus,
        state: "error",
        hasSource: Boolean(mailchimpSourceCache),
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Smart Trade-contacten ophalen mislukt.",
      };
    }
  })();

  mailchimpSourceLoad = { cacheKey, promise };
  void promise.finally(() => {
    if (mailchimpSourceLoad?.promise === promise) mailchimpSourceLoad = null;
  });
  return currentMailchimpRefreshStatus();
}
