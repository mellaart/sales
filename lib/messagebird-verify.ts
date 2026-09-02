const MESSAGEBIRD_VERIFY_URL = "https://rest.messagebird.com/verify";

type MessageBirdVerifyResponse = {
  id?: unknown;
  status?: unknown;
};

type MessageBirdErrorResponse = {
  errors?: Array<{ description?: unknown }>;
};

function apiKey() {
  return process.env.MESSAGEBIRD_API_KEY?.trim() || "";
}

function providerErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "SMS-verificatie mislukt.";
  const errors = (payload as MessageBirdErrorResponse).errors;
  const message = Array.isArray(errors)
    ? errors.find((error) => typeof error?.description === "string")?.description
    : "";
  return typeof message === "string" && message.trim()
    ? message.trim().slice(0, 300)
    : "SMS-verificatie mislukt.";
}

async function responsePayload(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>;
}

function configuredOriginator() {
  const value = (process.env.MESSAGEBIRD_VERIFY_ORIGINATOR || "SmartTrade")
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 11);
  return value || "SmartTrade";
}

function configuredTemplate() {
  const value = process.env.MESSAGEBIRD_VERIFY_TEMPLATE?.trim();
  return value && value.includes("%token")
    ? value.slice(0, 500)
    : "Uw Smart Trade-code is: %token";
}

export function isMessageBirdVerifyConfigured() {
  return Boolean(apiKey());
}

export function normalizeMessageBirdMobileNumber(value: string) {
  const source = value.trim();
  if (!source) return "";

  const compact = source.replace(/[\s().-]/g, "");
  const international = compact.startsWith("+")
    ? compact.slice(1)
    : compact.startsWith("00")
      ? compact.slice(2)
      : compact;
  const digits = international.replace(/\D/g, "");
  const normalized = digits.startsWith("0")
    ? `31${digits.slice(1)}`
    : digits;

  return /^\d{8,15}$/.test(normalized) ? normalized : "";
}

export function maskMessageBirdMobileNumber(value: string) {
  const number = normalizeMessageBirdMobileNumber(value);
  if (!number) return "uw mobiele nummer";
  const prefixLength = Math.min(3, Math.max(2, number.length - 3));
  const hiddenLength = Math.max(0, number.length - prefixLength - 2);
  return `+${number.slice(0, prefixLength)} ${"•".repeat(hiddenLength)}${number.slice(-2)}`;
}

export async function startMessageBirdSmsVerification(input: {
  recipient: string;
  reference: string;
}) {
  const key = apiKey();
  if (!key) throw new Error("SMS-verificatie is nog niet ingesteld.");

  const body = new URLSearchParams({
    recipient: input.recipient,
    originator: configuredOriginator(),
    reference: input.reference.replace(/[^a-zA-Z0-9]/g, "").slice(0, 50) || "SmartTrade",
    type: "sms",
    template: configuredTemplate(),
    datacoding: "auto",
    timeout: "300",
    tokenLength: "6",
    maxAttempts: "5",
  });
  const response = await fetch(MESSAGEBIRD_VERIFY_URL, {
    method: "POST",
    headers: {
      Authorization: `AccessKey ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
  });
  const payload = await responsePayload(response);
  if (!response.ok) throw new Error(providerErrorMessage(payload));

  const responseId = (payload as MessageBirdVerifyResponse | null)?.id;
  const id = typeof responseId === "string" ? responseId.trim() : "";
  if (!id) throw new Error("SMS-verificatie kon niet worden gestart.");
  return { id };
}

export async function verifyMessageBirdSmsCode(verificationId: string, code: string) {
  const key = apiKey();
  if (!key) throw new Error("SMS-verificatie is nog niet ingesteld.");

  const url = new URL(`${MESSAGEBIRD_VERIFY_URL}/${encodeURIComponent(verificationId)}`);
  url.searchParams.set("token", code);
  const response = await fetch(url, {
    headers: {
      Authorization: `AccessKey ${key}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const payload = await responsePayload(response);
  if (!response.ok) throw new Error("De code is onjuist of verlopen.");
  if ((payload as MessageBirdVerifyResponse | null)?.status !== "verified") {
    throw new Error("De code is onjuist of verlopen.");
  }
}
