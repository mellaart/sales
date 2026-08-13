import {
  fetchWithSmartTradeTimeout,
  getSmartTradePullConfig,
  getSmartTradePullHeaders,
} from "@/lib/smart-trade-pull-test";
import type { CustomerIntakeData } from "@/lib/customer-intake";

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

  if (typeof body === "string" && body.trim()) {
    if (/<(?:!doctype|html|head|body)\b/i.test(body)) {
      return `Smart Trade API gaf status ${status}; de ingestelde API-route is niet beschikbaar.`;
    }
    return body.trim().slice(0, 700);
  }
  return `Smart Trade API gaf status ${status}.`;
}

type SmartTradeRecord = Record<string, unknown>;

function asRecord(value: unknown): SmartTradeRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as SmartTradeRecord
    : null;
}

function recordsFromResponse(body: unknown) {
  const record = asRecord(body);
  const value = record?.data ?? body;

  if (Array.isArray(value)) {
    return value.map(asRecord).filter((item): item is SmartTradeRecord => Boolean(item));
  }

  const nestedRecord = asRecord(value);
  if (!nestedRecord) return [];

  for (const key of ["items", "results", "addresses", "contactpersons", "contactPersons"]) {
    const list = nestedRecord[key];
    if (Array.isArray(list)) {
      return list.map(asRecord).filter((item): item is SmartTradeRecord => Boolean(item));
    }
  }

  return [nestedRecord];
}

function textFromRecord(record: SmartTradeRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") {
      return String(value).trim();
    }
  }
  return "";
}

function booleanFromRecord(record: SmartTradeRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (value === 1 || value === "1" || value === "true") return true;
    if (value === 0 || value === "0" || value === "false") return false;
  }
  return false;
}

function normalizedMatchValue(value: string) {
  return value.trim().toLocaleLowerCase("nl-NL").replace(/\s+/g, "");
}

function liveApiUrls(path: string) {
  const config = getSmartTradePullConfig("live");
  const cleanPath = path.replace(/^\/+/, "");
  const urls = [
    `${config.baseUrl.replace(/\/+$/, "")}/${cleanPath}`,
    new URL(`/api/v1/${cleanPath}`, config.baseUrl).toString(),
  ];
  return [...new Set(urls)];
}

async function liveApiRequest(url: string, method = "GET", payload?: SmartTradeRecord) {
  const response = await fetchWithSmartTradeTimeout(
    url,
    getSmartTradePullHeaders("live", payload ? { "content-type": "application/json" } : {}),
    "live",
    {
      method,
      body: payload ? JSON.stringify(payload) : undefined,
    },
  );
  const body = await responseBody(response);
  return { response, body };
}

async function getLiveCollection(path: string) {
  let lastError = "";

  for (const url of liveApiUrls(path)) {
    const { response, body } = await liveApiRequest(url);
    if (response.ok) return recordsFromResponse(body);

    lastError = apiErrorMessage(response.status, body);
    if (![404, 405].includes(response.status)) break;
  }

  throw new Error(lastError || "Smart Trade-gegevens ophalen mislukt.");
}

async function createLiveResource(path: string, payload: SmartTradeRecord) {
  let lastError = "";
  const urls = /\/(?:addresses|contactpersons)(?:\/|$)/i.test(path)
    ? liveApiUrls(path).reverse()
    : liveApiUrls(path);

  for (const url of urls) {
    const { response, body } = await liveApiRequest(url, "POST", payload);
    if (response.ok) return body;

    lastError = apiErrorMessage(response.status, body);
    if (![404, 405, 501].includes(response.status)) break;
  }

  throw new Error(lastError || "Smart Trade-gegevens toevoegen mislukt.");
}

async function updateLiveResource(path: string, payload: SmartTradeRecord) {
  let lastError = "";
  const urls = /\/(?:addresses|contactpersons)(?:\/|$)/i.test(path)
    ? liveApiUrls(path).reverse()
    : liveApiUrls(path);

  for (const url of urls) {
    for (const method of ["PATCH", "PUT"]) {
      const { response, body } = await liveApiRequest(url, method, payload);
      if (response.ok) return body;

      lastError = apiErrorMessage(response.status, body);
      if (![404, 405, 500, 501].includes(response.status)) {
        throw new Error(lastError);
      }
    }
  }

  throw new Error(lastError || "Smart Trade-gegevens bijwerken mislukt.");
}

function resourceId(record: SmartTradeRecord) {
  return textFromRecord(record, "id", "addressId", "contactPersonId", "contactpersonId");
}

function addressMatches(record: SmartTradeRecord, payload: SmartTradeRecord) {
  return (
    normalizedMatchValue(textFromRecord(record, "street")) === normalizedMatchValue(String(payload.street ?? "")) &&
    normalizedMatchValue(textFromRecord(record, "number", "houseNumber")) === normalizedMatchValue(String(payload.number ?? "")) &&
    normalizedMatchValue(textFromRecord(record, "postcode", "postalCode")) === normalizedMatchValue(String(payload.postcode ?? "")) &&
    normalizedMatchValue(textFromRecord(record, "city")) === normalizedMatchValue(String(payload.city ?? ""))
  );
}

function addressRoleMatches(
  record: SmartTradeRecord,
  payload: SmartTradeRecord,
  role: "delivery" | "postal",
) {
  if (!addressMatches(record, payload)) return false;
  return role === "delivery"
    ? booleanFromRecord(record, "isDelivery", "delivery")
    : booleanFromRecord(record, "isContact", "contact") &&
      !booleanFromRecord(record, "isDelivery", "delivery");
}

async function upsertLiveAddress(
  relationId: number,
  existingAddresses: SmartTradeRecord[],
  payload: SmartTradeRecord,
  role: "delivery" | "postal",
) {
  if (existingAddresses.some((address) => addressRoleMatches(address, payload, role))) {
    return "unchanged";
  }

  const roleAddress = existingAddresses.find((address) => (
    role === "delivery"
      ? booleanFromRecord(address, "isDelivery", "delivery")
      : booleanFromRecord(address, "isContact", "contact") &&
        !booleanFromRecord(address, "isDelivery", "delivery")
  ));
  const id = roleAddress ? resourceId(roleAddress) : "";

  if (id) {
    await updateLiveResource(`relations/${relationId}/addresses/${encodeURIComponent(id)}`, payload);
    return "updated";
  }

  await createLiveResource(`relations/${relationId}/addresses`, payload);
  return "created";
}

function contactMatches(record: SmartTradeRecord, email: string) {
  return normalizedMatchValue(textFromRecord(record, "email")) === normalizedMatchValue(email);
}

async function upsertLiveContactPerson(
  relationId: number,
  existingContactPersons: SmartTradeRecord[],
  payload: SmartTradeRecord,
) {
  const email = String(payload.email ?? "");
  const existing = existingContactPersons.find((contact) => contactMatches(contact, email));
  const id = existing ? resourceId(existing) : "";

  if (id) {
    await updateLiveResource(`relations/${relationId}/contactpersons/${encodeURIComponent(id)}`, payload);
    return "updated";
  }

  await createLiveResource(`relations/${relationId}/contactpersons`, payload);
  return "created";
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
  const targetUrl = `${config.baseUrl.replace(/\/+$/, "")}/relations`;
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

export type CustomerIntakeSmartTradeSyncResult = {
  relationId: number;
  deliveryAddress: "created" | "updated" | "unchanged";
  postalAddress: "created" | "updated" | "unchanged" | "skipped";
  contactPerson: "created" | "updated";
  administrationContact: "created" | "updated" | "skipped";
};

export async function syncCustomerIntakeToSmartTrade(
  relationId: number,
  formData: CustomerIntakeData,
): Promise<CustomerIntakeSmartTradeSyncResult> {
  if (!Number.isSafeInteger(relationId) || relationId <= 0) {
    throw new Error("Een geldig Smart Trade-relatienummer ontbreekt.");
  }

  const relationPayload = {
    company: formData.deliveryName,
    phone: formData.phone,
    phoneMobile: formData.mobile,
    email: formData.generalEmail,
    contactEmail: formData.administrationEmail,
    website: formData.website,
    vatNumber: formData.vatNumber,
    chamberOfCommerceNumber: formData.chamberOfCommerceNumber,
    invoiceDigital: formData.invoiceDelivery === "mail",
  };

  await updateLiveResource(`relations/${relationId}`, relationPayload);

  const [existingAddresses, existingContactPersons] = await Promise.all([
    getLiveCollection(`relations/${relationId}/addresses`),
    getLiveCollection(`relations/${relationId}/contactpersons`),
  ]);

  const postalAddressComplete = Boolean(
    formData.postalStreet &&
    formData.postalNumber &&
    formData.postalPostcode &&
    formData.postalCity,
  );
  const postalAddressDiffers = postalAddressComplete && !addressMatches(
    {
      street: formData.deliveryStreet,
      city: formData.deliveryCity,
      number: formData.deliveryNumber,
      postcode: formData.deliveryPostcode,
    },
    {
      street: formData.postalStreet,
      city: formData.postalCity,
      number: formData.postalNumber,
      postcode: formData.postalPostcode,
    },
  );
  const deliveryAddressPayload = {
    street: formData.deliveryStreet,
    city: formData.deliveryCity,
    number: formData.deliveryNumber,
    postcode: formData.deliveryPostcode,
    gln: "",
    country: "NL",
    isContact: !postalAddressDiffers,
    isDelivery: true,
  };
  const postalAddressPayload = {
    street: formData.postalStreet,
    city: formData.postalCity,
    number: formData.postalNumber,
    postcode: formData.postalPostcode,
    gln: "",
    country: "NL",
    isContact: true,
    isDelivery: false,
  };

  const contactPersonPayload = {
    gender: "",
    firstName: formData.contactFirstName,
    lastNamePrefix: "",
    lastName: formData.contactLastName,
    phone: formData.contactPhone,
    phoneMobile: "",
    phoneWork: "",
    email: formData.contactEmail,
    position: "Contactpersoon",
  };
  const administrationContactIsDifferent = Boolean(
    formData.administrationEmail &&
    normalizedMatchValue(formData.administrationEmail) !== normalizedMatchValue(formData.contactEmail),
  );
  const administrationContactPayload = {
    gender: "",
    firstName: formData.administrationFirstName,
    lastNamePrefix: "",
    lastName: formData.administrationLastName,
    phone: formData.administrationPhone,
    phoneMobile: "",
    phoneWork: "",
    email: formData.administrationEmail,
    position: "Administratie",
  };

  const deliveryAddress = await upsertLiveAddress(
    relationId,
    existingAddresses,
    deliveryAddressPayload,
    "delivery",
  );
  const postalAddress = postalAddressDiffers
    ? await upsertLiveAddress(relationId, existingAddresses, postalAddressPayload, "postal")
    : "skipped";
  const contactPerson = await upsertLiveContactPerson(
    relationId,
    existingContactPersons,
    contactPersonPayload,
  );
  const administrationContact = administrationContactIsDifferent
    ? await upsertLiveContactPerson(
        relationId,
        existingContactPersons,
        administrationContactPayload,
      )
    : "skipped";

  return {
    relationId,
    deliveryAddress,
    postalAddress,
    contactPerson,
    administrationContact,
  };
}
