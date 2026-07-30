import { isValidIban, normalizeIban } from "@/lib/iban";

export type CustomerIntakeStatus = "open" | "submitted" | "processed" | "revoked";

export const DIRECT_DEBIT_CONSENT_VERSION = "2026-07-29-v1";
export const DEFAULT_DIRECT_DEBIT_CREDITOR_NAME = "Troublefree B.V.";

export function directDebitConsentText(creditorName = DEFAULT_DIRECT_DEBIT_CREDITOR_NAME) {
  return `Ik geef ${creditorName} toestemming om doorlopende incasso-opdrachten naar mijn bank te sturen voor de overeengekomen producten en diensten. Ik geef mijn bank toestemming om deze bedragen volgens de opdrachten van ${creditorName} van mijn rekening af te schrijven. Ik verklaar bevoegd te zijn om deze rekening te gebruiken.`;
}

export type CustomerDirectDebitMandateDetails = {
  mandateReference: string;
  creditorName: string;
  creditorIdentifier: string;
  consentText: string;
  consentVersion: string;
};

export type CustomerDirectDebitMandateEvidence = CustomerDirectDebitMandateDetails & {
  accountHolder: string;
  iban: string;
  acceptedAt: string;
  ipAddress: string;
  userAgent: string;
};

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
  directDebitAccountHolder: string;
  directDebitBankAccount: string;
  directDebitConsent: "" | "accepted";
};

export type CustomerIntakeSummary = {
  id: string;
  dealId: string;
  smartTradeRelationId: number | null;
  status: CustomerIntakeStatus;
  recipientEmail: string;
  formData: CustomerIntakeData;
  directDebitMandate: CustomerDirectDebitMandateEvidence | null;
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
  directDebitAccountHolder: "",
  directDebitBankAccount: "",
  directDebitConsent: "",
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
  directDebitAccountHolder: 180,
  directDebitBankAccount: 60,
  directDebitConsent: 20,
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
  normalized.directDebitBankAccount = normalizeIban(normalized.directDebitBankAccount);
  normalized.invoiceDelivery = input.invoiceDelivery === "mail" || input.invoiceDelivery === "post"
    ? input.invoiceDelivery
    : "";
  normalized.directDebit = input.directDebit === "yes" || input.directDebit === "no"
    ? input.directDebit
    : "";
  normalized.directDebitConsent = input.directDebitConsent === "accepted" ? "accepted" : "";

  if (normalized.directDebit !== "yes") {
    normalized.directDebitAccountHolder = "";
    normalized.directDebitBankAccount = "";
    normalized.directDebitConsent = "";
  }

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

  if (data.directDebit === "yes") {
    if (!data.directDebitAccountHolder) {
      return "Vul de naam van de rekeninghouder voor automatische incasso in.";
    }
    if (!data.directDebitBankAccount) {
      return "Vul het IBAN voor automatische incasso in.";
    }
    if (!isValidIban(data.directDebitBankAccount)) {
      return "Controleer het IBAN voor automatische incasso.";
    }
    if (data.directDebitConsent !== "accepted") {
      return "Bevestig de machtiging voor automatische incasso.";
    }
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
