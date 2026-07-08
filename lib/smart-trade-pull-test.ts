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
  const company = env("SMART_TRADE_COMPANY_KEY") || env("SMART_TRADE_COMPANY");
  const user = env("SMART_TRADE_API_USER");
  const password = env("SMART_TRADE_API_PASSWORD");
  const timeoutMs = Number(env("SMART_TRADE_API_TIMEOUT_MS") || DEFAULT_TIMEOUT_MS);

  if (!company || !user || !password) {
    throw new Error(
      "Smart Trade API is niet geconfigureerd. Vul SMART_TRADE_COMPANY_KEY, SMART_TRADE_API_USER en SMART_TRADE_API_PASSWORD in bij de environment variables.",
    );
  }

  return {
    baseUrl: normalizeRetailApiBaseUrl(process.env.SMART_TRADE_API_BASE_URL),
    company,
    authorization: basicAuthorization(user, password),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  };
}

export function getSmartTradePullHeaders(extraHeaders: Record<string, string> = {}) {
  const config = getSmartTradePullConfig();

  return {
    accept: "application/json, text/plain, */*",
    authorization: config.authorization,
    company: config.company,
    ...extraHeaders,
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

export async function fetchWithSmartTradeTimeout(url: string, headers: Record<string, string>) {
  const config = getSmartTradePullConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

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
      throw new Error(`Smart Trade API timeout na ${config.timeoutMs}ms.`);
    }

    throw new Error(
      `Smart Trade API verbinding mislukt naar ${getSmartTradeHost(url)}: ${getSmartTradeFetchErrorDetail(error)}. Controleer SMART_TRADE_API_BASE_URL, DNS/SSL en firewall vanaf de server.`,
    );
  } finally {
    clearTimeout(timeout);
  }
}
