export type CustomerIntakeStatus = "open" | "submitted" | "processed" | "revoked";

export type CustomerIntakeData = {
  deliveryName: string;
  deliveryStreet: string;
  deliveryNumber: string;
  deliveryPostcode: string;
  deliveryCity: string;
  phone: string;
  mobile: string;
  generalEmail: string;
  website: string;
  vatNumber: string;
  chamberOfCommerceNumber: string;
  postalStreet: string;
  postalNumber: string;
  postalPostcode: string;
  postalCity: string;
  contactFirstName: string;
  contactLastName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  invoiceDelivery: "" | "mail" | "post";
  administrationEmail: string;
  administrationFirstName: string;
  administrationLastName: string;
  administrationContact: string;
  administrationPhone: string;
  directDebit: "" | "yes" | "no";
  directDebitBankAccount: string;
};

export type CustomerIntakeSummary = {
  id: string;
  dealId: string;
  status: CustomerIntakeStatus;
  recipientEmail: string;
  formData: CustomerIntakeData;
  publicUrl: string;
  expiresAt: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const EMPTY_CUSTOMER_INTAKE_DATA: CustomerIntakeData = {
  deliveryName: "",
  deliveryStreet: "",
  deliveryNumber: "",
  deliveryPostcode: "",
  deliveryCity: "",
  phone: "",
  mobile: "",
  generalEmail: "",
  website: "",
  vatNumber: "",
  chamberOfCommerceNumber: "",
  postalStreet: "",
  postalNumber: "",
  postalPostcode: "",
  postalCity: "",
  contactFirstName: "",
  contactLastName: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  invoiceDelivery: "",
  administrationEmail: "",
  administrationFirstName: "",
  administrationLastName: "",
  administrationContact: "",
  administrationPhone: "",
  directDebit: "",
  directDebitBankAccount: "",
};

const FIELD_LIMITS: Record<keyof CustomerIntakeData, number> = {
  deliveryName: 180,
  deliveryStreet: 180,
  deliveryNumber: 30,
  deliveryPostcode: 20,
  deliveryCity: 120,
  phone: 80,
  mobile: 80,
  generalEmail: 180,
  website: 240,
  vatNumber: 40,
  chamberOfCommerceNumber: 40,
  postalStreet: 180,
  postalNumber: 30,
  postalPostcode: 20,
  postalCity: 120,
  contactFirstName: 100,
  contactLastName: 180,
  contactName: 180,
  contactPhone: 80,
  contactEmail: 180,
  invoiceDelivery: 10,
  administrationEmail: 180,
  administrationFirstName: 100,
  administrationLastName: 180,
  administrationContact: 180,
  administrationPhone: 80,
  directDebit: 10,
  directDebitBankAccount: 60,
};

function textValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function splitCustomerContactName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() ?? "",
    lastName: parts.join(" "),
  };
}

export function combineCustomerContactName(firstName: string, lastName: string) {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

export function normalizeCustomerIntakeData(value: unknown): CustomerIntakeData {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const normalized = { ...EMPTY_CUSTOMER_INTAKE_DATA };

  for (const key of Object.keys(normalized) as Array<keyof CustomerIntakeData>) {
    normalized[key] = textValue(input[key], FIELD_LIMITS[key]) as never;
  }

  if (!normalized.contactFirstName && !normalized.contactLastName && normalized.contactName) {
    const contact = splitCustomerContactName(normalized.contactName);
    normalized.contactFirstName = contact.firstName;
    normalized.contactLastName = contact.lastName;
  }
  normalized.contactName = combineCustomerContactName(
    normalized.contactFirstName,
    normalized.contactLastName,
  );

  if (
    !normalized.administrationFirstName &&
    !normalized.administrationLastName &&
    normalized.administrationContact
  ) {
    const administrationContact = splitCustomerContactName(normalized.administrationContact);
    normalized.administrationFirstName = administrationContact.firstName;
    normalized.administrationLastName = administrationContact.lastName;
  }
  normalized.administrationContact = combineCustomerContactName(
    normalized.administrationFirstName,
    normalized.administrationLastName,
  );

  normalized.deliveryPostcode = normalized.deliveryPostcode.toUpperCase();
  normalized.postalPostcode = normalized.postalPostcode.toUpperCase();
  normalized.generalEmail = normalized.generalEmail.toLowerCase();
  normalized.vatNumber = normalized.vatNumber.toUpperCase();
  normalized.contactEmail = normalized.contactEmail.toLowerCase();
  normalized.administrationEmail = normalized.administrationEmail.toLowerCase();
  normalized.directDebitBankAccount = normalized.directDebitBankAccount.toUpperCase();
  normalized.invoiceDelivery = input.invoiceDelivery === "mail" || input.invoiceDelivery === "post"
    ? input.invoiceDelivery
    : "";
  normalized.directDebit = input.directDebit === "yes" || input.directDebit === "no"
    ? input.directDebit
    : "";

  return normalized;
}

function isEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value);
}

export function validateCustomerIntakeData(data: CustomerIntakeData) {
  const required: Array<[keyof CustomerIntakeData, string]> = [
    ["deliveryName", "Naam"],
    ["deliveryStreet", "Straat afleveradres"],
    ["deliveryNumber", "Nummer afleveradres"],
    ["deliveryPostcode", "Postcode afleveradres"],
    ["deliveryCity", "Plaats afleveradres"],
    ["phone", "Telefoonnummer"],
    ["mobile", "Mobiel"],
    ["generalEmail", "E-mail algemeen"],
    ["website", "Website"],
    ["vatNumber", "BTW-nummer"],
    ["chamberOfCommerceNumber", "KvK-nummer"],
    ["contactFirstName", "Voornaam contactpersoon"],
    ["contactLastName", "Achternaam contactpersoon"],
    ["contactPhone", "Telefoonnummer contactpersoon"],
    ["contactEmail", "E-mail contactpersoon"],
    ["invoiceDelivery", "Factuur per"],
    ["administrationEmail", "E-mail administratie"],
    ["administrationFirstName", "Voornaam contactpersoon administratie"],
    ["administrationLastName", "Achternaam contactpersoon administratie"],
    ["administrationPhone", "Telefoon administratie"],
    ["directDebit", "Automatische incasso"],
  ];
  const missing = required.filter(([key]) => !data[key]).map(([, label]) => label);

  if (missing.length > 0) {
    return `Vul de verplichte velden in: ${missing.join(", ")}.`;
  }

  const postalValues = [
    data.postalStreet,
    data.postalNumber,
    data.postalPostcode,
    data.postalCity,
  ];
  if (postalValues.some(Boolean) && postalValues.some((value) => !value)) {
    return "Vul het postadres volledig in of laat het hele postadres leeg.";
  }

  if (!isEmail(data.generalEmail) || !isEmail(data.contactEmail) || !isEmail(data.administrationEmail)) {
    return "Controleer de drie e-mailadressen.";
  }

  if (data.directDebit === "yes" && !data.directDebitBankAccount) {
    return "Vul de bankrekening voor automatische incasso in.";
  }

  return null;
}

export function customerIntakeStatusLabel(status: CustomerIntakeStatus, expiresAt?: string) {
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now() && status !== "processed") return "Verlopen";
  if (status === "submitted") return "Ontvangen";
  if (status === "processed") return "Verwerkt";
  if (status === "revoked") return "Ingetrokken";
  return "Wacht op klant";
}
