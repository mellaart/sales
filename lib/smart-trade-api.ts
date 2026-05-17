export type SmartTradeRelation = {
  id: number | string;
  company?: string | null;
  companyPrefix?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  email?: string | null;
  debtorNumber?: string | number | null;
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

export type SmartTradeAsset = {
  id: number | string;
  name?: string | null;
  description?: string | null;
  serialNumber?: string | null;
  owner?: number | string | null;
  contractAgreements?: SmartTradeContractAgreement[];
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) return null;
  return value;
}

const DEFAULT_TIMEOUT_MS = 15000;

export const SMART_TRADE_CONFIG_ERROR =
  "Smart Trade API is niet geconfigureerd. Voeg SMART_TRADE_COMPANY_KEY toe (bijv. troublefree) en stel auth in via SMART_TRADE_API_TOKEN of SMART_TRADE_API_USER + SMART_TRADE_API_PASSWORD.";

function getConfig() {
  const user = requiredEnv("SMART_TRADE_API_USER");
  const password = requiredEnv("SMART_TRADE_API_PASSWORD");
  const tokenFromPair = user && password ? `${user}:${password}` : null;
  const token = requiredEnv("SMART_TRADE_API_TOKEN") ?? tokenFromPair;
  const company = requiredEnv("SMART_TRADE_COMPANY_KEY") ?? "troublefree";

  if (!token || !company) {
    throw new Error(SMART_TRADE_CONFIG_ERROR);
  }

  return {
    baseUrl: process.env.SMART_TRADE_API_BASE_URL ?? "https://my.troublefree.nl/v3/api",
    token,
    company,
    authMode: process.env.SMART_TRADE_AUTH_MODE ?? (token.includes(":") ? "basic" : "bearer"),
    timeoutMs: Number(process.env.SMART_TRADE_API_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  };
}

function getHeaders() {
  const config = getConfig();

  const authorization =
    config.authMode === "basic"
      ? `Basic ${Buffer.from(config.token).toString("base64")}`
      : `Bearer ${config.token}`;

  return {
    Authorization: authorization,
    Company: config.company,
    company: config.company,
    Accept: "application/json",
  };
}

function arrayFromApi<T>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[];

  if (json && typeof json === "object" && "data" in json) {
    const data = (json as { data?: unknown }).data;
    return Array.isArray(data) ? (data as T[]) : [];
  }

  return [];
}

function objectFromApi<T>(json: unknown): T | null {
  if (!json || typeof json !== "object") return null;

  if ("data" in json) {
    return ((json as { data?: unknown }).data ?? null) as T | null;
  }

  return json as T;
}

async function apiGet<T>(path: string, params: Record<string, string | number | undefined> = {}) {
  const config = getConfig();
  const url = new URL(`${config.baseUrl.replace(/\/$/, "")}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && String(value).trim() !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const configTimeout = Number.isFinite(config.timeoutMs) && config.timeoutMs > 0
    ? config.timeoutMs
    : DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), configTimeout);

  let response: Response;

  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: getHeaders(),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Smart Trade API timeout na ${configTimeout}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    const snippet = body.slice(0, 700);

    if (response.status === 505 && /Error while determining version/i.test(body)) {
      throw new Error(
        "Smart Trade API fout 505: Error while determining version. Gebruik https://retail.troublefree.nl/v3/api, Basic Auth (SMART_TRADE_AUTH_MODE=basic) met SMART_TRADE_API_TOKEN=username:password of SMART_TRADE_API_USER/SMART_TRADE_API_PASSWORD, en header company=troublefree.",
      );
    }

    throw new Error(`Smart Trade API fout ${response.status}: ${snippet}`);
  }

  return (await response.json()) as T;
}

export function getRelationName(relation: SmartTradeRelation) {
  const company = [relation.companyPrefix, relation.company].filter(Boolean).join(" ").trim();
  const person = [relation.firstname, relation.lastname].filter(Boolean).join(" ").trim();
  return company || person || `Relatie ${relation.id}`;
}

export async function searchRelations(term: string) {
  const params: Record<string, string> = {};
  const normalized = term.trim().slice(0, 120);

  if (normalized) params["company[partial]"] = normalized;

  const json = await apiGet<unknown>("/api/relations", params);
  return arrayFromApi<SmartTradeRelation>(json);
}

export async function getAssetsForRelation(relationId: string | number) {
  const json = await apiGet<unknown>("/api/assets", { owner: relationId });
  return arrayFromApi<SmartTradeAsset>(json);
}

export async function getAssetWithContractAgreements(assetId: string | number) {
  const json = await apiGet<unknown>(`/api/assets/${assetId}`, {
    include: "contractAgreements",
  });

  return objectFromApi<SmartTradeAsset>(json);
}

function isActive(agreement: SmartTradeContractAgreement) {
  if (!agreement.endsAt) return true;

  const endDate = new Date(agreement.endsAt);
  if (Number.isNaN(endDate.getTime())) return true;

  return endDate >= new Date();
}

function articleName(agreement: SmartTradeContractAgreement) {
  return (
    agreement.article?.name ||
    agreement.article?.description ||
    agreement.article?.code ||
    "Onbekende module"
  );
}

export async function getAssetsWithModulesForRelation(relationId: string | number) {
  const assets = await getAssetsForRelation(relationId);

  return Promise.all(
    assets.map(async (asset) => {
      const detail = (await getAssetWithContractAgreements(asset.id).catch(() => asset)) ?? asset;
      const agreements = detail.contractAgreements ?? [];

      return {
        id: String(detail.id),
        name: detail.name || detail.description || `Asset ${detail.id}`,
        description: detail.description ?? null,
        serialNumber: detail.serialNumber ?? null,
        modules: agreements.map((agreement) => ({
          id: String(agreement.id ?? `${detail.id}-${articleName(agreement)}`),
          name: articleName(agreement),
          code: agreement.article?.code ?? null,
          startsAt: agreement.startsAt ?? null,
          endsAt: agreement.endsAt ?? null,
          active: isActive(agreement),
        })),
      };
    }),
  );
}
