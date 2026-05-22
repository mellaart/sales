const DEFAULT_TIMEOUT_MS = 15000;

type SmartTradePullConfig = {
  baseUrl: string;
  company: string;
  authorization: string;
  timeoutMs: number;
};

function env(name: string) {
  return process.env[name]?.trim() || "";
}

export function normalizeRetailApiBaseUrl(value?: string | null) {
  const fallback = "https://retail.troublefree.nl/v3/api";
  const raw = value?.trim() || fallback;
  const withoutDocs = raw.replace(/\/documentation\/?$/i, "");
  const withoutTrailingSlash = withoutDocs.replace(/\/$/, "");

  if (/\/v3\/api$/i.test(withoutTrailingSlash)) return withoutTrailingSlash;
  if (/\/v3$/i.test(withoutTrailingSlash)) return `${withoutTrailingSlash}/api`;

  return `${withoutTrailingSlash}/v3/api`;
}

function basicAuthorization(user: string, password: string) {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

export function getSmartTradePullConfig(): SmartTradePullConfig {
  const company = env("SMART_TRADE_COMPANY_KEY") || env("SMART_TRADE_COMPANY") || "troublefree";
  const user = env("SMART_TRADE_API_USER");
  const password = env("SMART_TRADE_API_PASSWORD");
  const token = env("SMART_TRADE_API_TOKEN");
  const authMode = (env("SMART_TRADE_AUTH_MODE") || "basic").toLowerCase();
  const timeoutMs = Number(env("SMART_TRADE_API_TIMEOUT_MS") || DEFAULT_TIMEOUT_MS);

  let authorization = "";

  if (user && password) {
    authorization = basicAuthorization(user, password);
  } else if (token && authMode === "bearer") {
    authorization = `Bearer ${token}`;
  } else if (token) {
    authorization = `Basic ${Buffer.from(token).toString("base64")}`;
  }

  if (!authorization || !company) {
    throw new Error("Smart Trade API is niet geconfigureerd. Vul API user/password of token en Company in bij de environment variables.");
  }

  return {
    baseUrl: normalizeRetailApiBaseUrl(process.env.SMART_TRADE_API_BASE_URL),
    company,
    authorization,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  };
}

export function getSmartTradePullHeaders(extraHeaders: Record<string, string> = {}) {
  const config = getSmartTradePullConfig();

  return {
    Authorization: config.authorization,
    Company: config.company,
    company: config.company,
    Accept: "application/json, text/plain, */*",
    ...extraHeaders,
  };
}

export async function fetchWithSmartTradeTimeout(url: string, headers: Record<string, string>) {
  const config = getSmartTradePullConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Smart Trade API timeout na ${config.timeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
