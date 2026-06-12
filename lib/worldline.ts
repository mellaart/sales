export type WorldlineProjectStatus = "concept" | "waiting_customer" | "checking" | "complete" | "submitted";
export type WorldlineDocumentType = "kvk" | "agreement" | "identity" | "bank_statement" | "refund";
export type WorldlineCheckStatus = "missing" | "uploaded" | "checking" | "approved" | "rejected";

export type WorldlineAgreementFields = {
  vatNumber: string;
  invoiceEmail: string;
  cardTypes: string;
  refund: string;
  expectedDebitAmount: string;
  expectedDebitTransactions: string;
  accountHolder: string;
  iban: string;
  bic: string;
  placeDate: string;
  signerFunction: string;
  signers: string;
};

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

export const DEFAULT_WORLDLINE_AGREEMENT_FIELDS: WorldlineAgreementFields = {
  vatNumber: "",
  invoiceEmail: "",
  cardTypes: "",
  refund: "",
  expectedDebitAmount: "",
  expectedDebitTransactions: "",
  accountHolder: "",
  iban: "",
  bic: "",
  placeDate: "",
  signerFunction: "",
  signers: "",
};

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
  const source = input && typeof input === "object" ? (input as Partial<Record<keyof WorldlineAgreementFields, unknown>>) : {};

  return Object.entries(DEFAULT_WORLDLINE_AGREEMENT_FIELDS).reduce((fields, [key, fallback]) => {
    const value = source[key as keyof WorldlineAgreementFields];
    fields[key as keyof WorldlineAgreementFields] = typeof value === "string" ? value : fallback;
    return fields;
  }, { ...DEFAULT_WORLDLINE_AGREEMENT_FIELDS });
}

export function getWorldlineDocumentDefinition(documentType: WorldlineDocumentType) {
  return WORLDLINE_DOCUMENT_DEFINITIONS.find((definition) => definition.key === documentType);
}
