export type WorldlineProjectStatus = "concept" | "waiting_customer" | "checking" | "complete" | "submitted";
export type WorldlineDocumentType = "kvk" | "agreement" | "identity" | "bank_statement" | "refund";
export type WorldlineCheckStatus = "missing" | "uploaded" | "checking" | "approved" | "rejected";
export type WorldlineAgreementFieldType = "text" | "textarea" | "checkbox" | "select";

export type WorldlineAgreementFieldDefinition = {
  key: string;
  pdfField: string;
  label: string;
  section: string;
  type: WorldlineAgreementFieldType;
  defaultValue?: string;
  options?: string[];
};

export type WorldlineAgreementFields = Record<string, string>;

export const WORLDLINE_AGREEMENT_TEMPLATE_PATH = "/worldline-aansluitovereenkomst-2026-v6.pdf";

export type WorldlineProject = {
  id: string;
  relation_id: string;
  relation_name: string;
  relation_email?: string | null;
  debtor_number?: string | null;
  status: WorldlineProjectStatus;
  agreement_fields?: Partial<WorldlineAgreementFields> | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type WorldlineDocument = {
  id: string;
  project_id: string;
  document_type: WorldlineDocumentType;
  file_name: string;
  storage_path: string;
  mime_type?: string | null;
  file_size?: number | null;
  version: number;
  check_status: WorldlineCheckStatus;
  check_result?: unknown;
  uploaded_by?: string | null;
  uploaded_at?: string | null;
};

export const WORLDLINE_DOCUMENT_BUCKET = "worldline-documents";

export const WORLDLINE_AGREEMENT_FIELD_DEFINITIONS: WorldlineAgreementFieldDefinition[] = [
  { key: "quoteDate", pdfField: "Offertedatum", label: "Offertedatum", section: "In te vullen door Worldline", type: "text" },
  { key: "salesperson", pdfField: "Salesperson", label: "Salesperson", section: "In te vullen door Worldline", type: "text", defaultValue: "Troublefree NL" },
  { key: "existingCustomer", pdfField: "Bestaande klant", label: "Bestaande klant", section: "In te vullen door Worldline", type: "select", defaultValue: "nee", options: ["nee", "ja"] },
  { key: "allianceCode", pdfField: "Alliance code", label: "Alliance code", section: "In te vullen door Worldline", type: "text", defaultValue: "NL_Troublefree" },
  { key: "mcc", pdfField: "MCC", label: "MCC", section: "In te vullen door Worldline", type: "text" },

  { key: "companyName", pdfField: "Bedrijfsnaam", label: "Bedrijfsnaam", section: "Bedrijfsgegevens", type: "text" },
  { key: "contactPerson", pdfField: "Contactpersoon", label: "Contactpersoon", section: "Bedrijfsgegevens", type: "text" },
  { key: "contactGender", pdfField: "Keuzerondje 2", label: "Contactpersoon M/V", section: "Bedrijfsgegevens", type: "select", options: ["", "M", "V"] },
  { key: "businessAddress", pdfField: "Vestigingsadres", label: "Vestigingsadres", section: "Bedrijfsgegevens", type: "text" },
  { key: "businessPostcode", pdfField: "Postcode 1", label: "Postcode vestiging", section: "Bedrijfsgegevens", type: "text" },
  { key: "businessCity", pdfField: "Plaats 1", label: "Plaats vestiging", section: "Bedrijfsgegevens", type: "text" },
  { key: "phoneNumber", pdfField: "Telefoonnummer", label: "Telefoonnummer", section: "Bedrijfsgegevens", type: "text" },
  { key: "vatNumber", pdfField: "BTW-nummer", label: "BTW-nummer", section: "Bedrijfsgegevens", type: "text" },
  { key: "kvkNumber", pdfField: "KvKnummer", label: "KvK-nummer", section: "Bedrijfsgegevens", type: "text" },
  { key: "companyEmail", pdfField: "Emailadres 1", label: "E-mailadres", section: "Bedrijfsgegevens", type: "text" },
  { key: "invoiceEmail", pdfField: "Emailadres 2", label: "E-mailadres voor factuur", section: "Bedrijfsgegevens", type: "text" },

  { key: "shopName", pdfField: "Winkelnaam", label: "Winkelnaam", section: "Shopgegevens", type: "text" },
  { key: "shopAddress", pdfField: "Adres 2", label: "Adres shop", section: "Shopgegevens", type: "text" },
  { key: "shopPostcode", pdfField: "Postocode 3", label: "Postcode shop", section: "Shopgegevens", type: "text" },
  { key: "shopCity", pdfField: "Plaats_3", label: "Plaats shop", section: "Shopgegevens", type: "text" },
  { key: "terminalCount", pdfField: "Aantal betaalautomaten per shop", label: "Aantal betaalautomaten per shop", section: "Betaalautomaat gegevens", type: "text" },
  { key: "terminalType", pdfField: "type betaalautomaten/maten", label: "Type betaalautomaat/maten", section: "Betaalautomaat gegevens", type: "text" },
  { key: "terminalCodes", pdfField: "Betaalautomaat codes", label: "Betaalautomaat codes", section: "Betaalautomaat gegevens", type: "text" },

  { key: "cardMastercard", pdfField: "Mastercard", label: "Mastercard", section: "Betaalkaarten en tarieven", type: "checkbox" },
  { key: "cardVisa", pdfField: "Visa", label: "Visa", section: "Betaalkaarten en tarieven", type: "checkbox" },
  { key: "cardVisaElectron", pdfField: "Visa Electron", label: "Visa Electron", section: "Betaalkaarten en tarieven", type: "checkbox" },
  { key: "cardUnionPay", pdfField: "UnionPay", label: "UnionPay", section: "Betaalkaarten en tarieven", type: "checkbox" },
  { key: "cardJcb", pdfField: "JCB", label: "JCB", section: "Betaalkaarten en tarieven", type: "checkbox" },
  { key: "cardDinersDiscover", pdfField: "DinersDiscover", label: "Diners/Discover", section: "Betaalkaarten en tarieven", type: "checkbox" },
  { key: "refund", pdfField: "Refund", label: "Refund", section: "Betaalkaarten en tarieven", type: "checkbox" },
  { key: "expectedDebitAmount", pdfField: "Verwacht gemiddeld", label: "Verwacht gemiddeld debit transactiebedrag", section: "Betaalkaarten en tarieven", type: "text" },
  { key: "expectedDebitTransactions", pdfField: "Verwacht aantal", label: "Verwacht aantal debit transacties per jaar", section: "Betaalkaarten en tarieven", type: "text" },

  { key: "accountHolder", pdfField: "Naam rekeninghouder", label: "Naam rekeninghouder", section: "Uitbetaling", type: "text" },
  { key: "iban", pdfField: "Rekeningnr", label: "Rekeningnr. (IBAN)", section: "Uitbetaling", type: "text" },
  { key: "bic", pdfField: "BIC-code", label: "BIC-code", section: "Uitbetaling", type: "text" },

  { key: "signers", pdfField: "Naam tekenbevoegden", label: "Naam tekenbevoegde(n)", section: "Handtekening", type: "text" },
  { key: "placeDate", pdfField: "Plaats & Datum", label: "Plaats & datum", section: "Handtekening", type: "text" },
  { key: "signerFunction", pdfField: "Functie", label: "Functie", section: "Handtekening", type: "text" },
];

export const DEFAULT_WORLDLINE_AGREEMENT_FIELDS: WorldlineAgreementFields = WORLDLINE_AGREEMENT_FIELD_DEFINITIONS.reduce(
  (fields, definition) => {
    fields[definition.key] = definition.defaultValue ?? "";
    return fields;
  },
  {} as WorldlineAgreementFields,
);

export const WORLDLINE_STATUS_LABELS: Record<WorldlineProjectStatus, string> = {
  concept: "Concept",
  waiting_customer: "Wacht op klant",
  checking: "Controleren",
  complete: "Compleet",
  submitted: "Ingediend",
};

export const WORLDLINE_CHECK_STATUS_LABELS: Record<WorldlineCheckStatus, string> = {
  missing: "Ontbreekt",
  uploaded: "Geupload",
  checking: "Controleren",
  approved: "Akkoord",
  rejected: "Afgekeurd",
};

export const WORLDLINE_DOCUMENT_DEFINITIONS: Array<{
  key: WorldlineDocumentType;
  step: string;
  title: string;
  description: string;
  accept: string;
  checklist: string[];
}> = [
  {
    key: "kvk",
    step: "Stap 2",
    title: "KvK",
    description: "Upload een KvK-uittreksel, inclusief eventuele vervolguittreksels.",
    accept: "application/pdf",
    checklist: [
      "Uittreksel is niet ouder dan 2 maanden",
      "Bedrijfsnaam komt overeen met de relatie",
      "Tekenbevoegde natuurlijke persoon/personen zijn zichtbaar",
      "Eventuele vervolguittreksels zijn aanwezig",
    ],
  },
  {
    key: "agreement",
    step: "Stap 3",
    title: "Aansluitovereenkomst",
    description: "Bewaar de door klant ingevulde en nat ondertekende overeenkomst.",
    accept: "application/pdf",
    checklist: [
      "BTW-nummer en facturatie e-mailadres zijn ingevuld",
      "Betaalkaarten, refund en verwachte transacties zijn ingevuld",
      "IBAN, BIC en rekeninghouder zijn ingevuld",
      "Plaats, datum, functie en natte handtekening staan erop",
    ],
  },
  {
    key: "identity",
    step: "Stap 4",
    title: "ID",
    description: "Upload legitimatie van iedere tekenbevoegde persoon.",
    accept: "application/pdf,image/jpeg,image/png",
    checklist: [
      "Legitimatiebewijs is geldig",
      "Naam komt overeen met tekenbevoegde persoon",
      "Alleen BSN is afgeschermd",
      "Bij ID-kaart is ook de achterkant aanwezig",
    ],
  },
  {
    key: "bank_statement",
    step: "Stap 5",
    title: "Bankafschrift",
    description: "Upload een bankafschrift van maximaal 2 maanden oud.",
    accept: "application/pdf,image/jpeg,image/png",
    checklist: [
      "Afschrift is niet ouder dan 2 maanden",
      "Naam van de bank is zichtbaar",
      "Bedrijfsnaam is zichtbaar",
      "IBAN en datum zijn zichtbaar",
    ],
  },
  {
    key: "refund",
    step: "Stap 6",
    title: "Refund",
    description: "Upload het refund formulier als refund is aangevraagd.",
    accept: "application/pdf",
    checklist: [
      "Refund formulier is aanwezig wanneer refund gewenst is",
      "Formulier hoort bij de juiste relatie",
      "Vereiste velden en handtekening zijn ingevuld",
    ],
  },
];

export function normalizeWorldlineAgreementFields(input: unknown): WorldlineAgreementFields {
  const source = input && typeof input === "object" ? (input as Partial<Record<string, unknown>>) : {};
  const legacyAliases: Record<string, string[]> = {
    vatNumber: ["vatNumber"],
    invoiceEmail: ["invoiceEmail"],
    refund: ["refund"],
    expectedDebitAmount: ["expectedDebitAmount"],
    expectedDebitTransactions: ["expectedDebitTransactions"],
    accountHolder: ["accountHolder"],
    iban: ["iban"],
    bic: ["bic"],
    placeDate: ["placeDate"],
    signerFunction: ["signerFunction"],
    signers: ["signers"],
    terminalCodes: ["cardTypes"],
  };

  return WORLDLINE_AGREEMENT_FIELD_DEFINITIONS.reduce((fields, definition) => {
    const directValue = source[definition.key];
    const aliasValue = legacyAliases[definition.key]?.map((alias) => source[alias]).find((value) => typeof value === "string");
    const value = typeof directValue === "string" ? directValue : aliasValue;
    fields[definition.key] = typeof value === "string" ? value : definition.defaultValue ?? "";
    return fields;
  }, { ...DEFAULT_WORLDLINE_AGREEMENT_FIELDS });
}

export function getWorldlineDocumentDefinition(documentType: WorldlineDocumentType) {
  return WORLDLINE_DOCUMENT_DEFINITIONS.find((definition) => definition.key === documentType);
}
