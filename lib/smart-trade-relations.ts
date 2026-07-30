import {
  fetchWithSmartTradeTimeout,
  getSmartTradePullConfig,
  getSmartTradePullHeaders,
} from "@/lib/smart-trade-pull-test";

const NEW_CUSTOMER_DEFAULTS = {
  group: 7,
  applyGroupProperties: true,
  types: [2],
  status: {
    active: true,
    verified: true,
    defunct: false,
  },
} as const;

async function responseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function relationIdFromResponse(body: unknown, location: string | null) {
  let value: unknown = null;

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const data = record.data;
    value = data && typeof data === "object"
      ? (data as Record<string, unknown>).id
      : data;
    value ??= record.id;
  }

  if (value === null && location) {
    value = location.match(/\/relations\/([^/?#]+)\/?(?:[?#].*)?$/i)?.[1] ?? null;
  }

  const relationId = Number(value);
  return Number.isSafeInteger(relationId) && relationId > 0 ? relationId : null;
}

function apiErrorMessage(status: number, body: unknown) {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const message = record.message ?? record.error;
    const errors = record.errors;

    if (errors && typeof errors === "object") {
      const details = Object.entries(errors as Record<string, unknown>)
        .flatMap(([field, value]) => (Array.isArray(value) ? value : [value])
          .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
          .map((item) => `${field}: ${item.trim()}`))
        .join(" ");
      if (details) {
        const prefix = typeof message === "string" && message.trim() ? `${message.trim()} ` : "";
        return `${prefix}${details}`.trim();
      }
    }

    if (typeof message === "string" && message.trim()) return message.trim();
  }

  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 700);
  return `Smart Trade API gaf status ${status}.`;
}

export function formatSmartTradeMandateReference(relationId: number, indexNumber = 1) {
  if (!Number.isSafeInteger(relationId) || relationId <= 0) {
    throw new Error("Ongeldig Smart Trade-relatienummer voor het mandaatkenmerk.");
  }
  if (!Number.isSafeInteger(indexNumber) || indexNumber <= 0) {
    throw new Error("Ongeldige mandaatindex.");
  }

  return `R${String(relationId).padStart(6, "0")}D${String(indexNumber).padStart(3, "0")}`;
}

export async function createLiveSmartTradeRelation(companyName: string) {
  const company = companyName.trim().slice(0, 180);
  if (!company) {
    throw new Error("De klantnaam ontbreekt; de Smart Trade-relatie kan niet worden aangemaakt.");
  }

  const config = getSmartTradePullConfig("live");
  const targetUrl = new URL("/api/v1/relations", config.baseUrl).toString();
  const response = await fetchWithSmartTradeTimeout(
    targetUrl,
    getSmartTradePullHeaders("live", { "content-type": "application/json" }),
    "live",
    {
      method: "POST",
      body: JSON.stringify({ company, ...NEW_CUSTOMER_DEFAULTS }),
    },
  );
  const body = await responseBody(response);

  if (!response.ok) {
    throw new Error(`Smart Trade-relatie aanmaken mislukt: ${apiErrorMessage(response.status, body)}`);
  }

  const relationId = relationIdFromResponse(body, response.headers.get("location"));
  if (!relationId) {
    throw new Error(
      "Smart Trade heeft de relatie aangemaakt, maar gaf geen relatienummer terug. Maak geen nieuwe klantlink en controleer de administratie.",
    );
  }

  return { relationId };
}
