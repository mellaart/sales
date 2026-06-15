import type { WorldlineCheckResult, WorldlineCheckStatus } from "@/lib/worldline";

const LEGAL_ENTITY_PATTERN = /\b(?:b\.?\s*v\.?|n\.?\s*v\.?|holding|stichting|vereniging|co[oö]peratie|c\.?\s*v\.?|v\.?\s*o\.?\s*f\.?)\b/i;
const MANUFACTURED_DATE_PATTERNS = [
  /gegevens\s+zijn\s+vervaardigd\s+op\s+(\d{2})-(\d{2})-(\d{4})/i,
  /uittreksel\s+is\s+vervaardigd\s+op\s+(\d{2})-(\d{2})-(\d{4})/i,
  /vervaardigd\s+op\s+(\d{2})-(\d{2})-(\d{4})/i,
];

export type KvkAnalysis = {
  status: WorldlineCheckStatus;
  result: WorldlineCheckResult;
  message: string;
};

type KvkAnalysisOptions = {
  supportingDocumentNames?: string[];
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeName(value: string) {
  return normalizeWhitespace(value)
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[.;:,]+$/g, "")
    .trim();
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map(normalizeName).filter(Boolean)));
}

function isLegalEntityName(value: string) {
  return LEGAL_ENTITY_PATTERN.test(value);
}

function normalizeEntityKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\bb\.?\s*v\.?\b/g, "bv")
    .replace(/\bn\.?\s*v\.?\b/g, "nv")
    .replace(/[^a-z0-9]+/g, "");
}

function hasSupportingDocumentForEntity(entityName: string, supportingDocumentNames: string[]) {
  const entityKey = normalizeEntityKey(entityName);
  if (entityKey.length < 3) return false;

  return supportingDocumentNames.some((documentName) => {
    const documentKey = normalizeEntityKey(documentName);
    return documentKey.includes(entityKey) || entityKey.includes(documentKey);
  });
}

function parseDutchDate(day: string, month: string, year: string) {
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }

  return date;
}

function formatDateIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateNl(date: Date) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(date);
}

function getTwoMonthCutoff(referenceDate: Date) {
  const cutoff = new Date(referenceDate);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setMonth(cutoff.getMonth() - 2);
  return cutoff;
}

function findManufacturedDate(text: string) {
  for (const pattern of MANUFACTURED_DATE_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    const date = parseDutchDate(match[1], match[2], match[3]);
    if (date) return date;
  }

  return null;
}

function sectionBetween(text: string, startPattern: RegExp, endPattern: RegExp) {
  const startMatch = startPattern.exec(text);
  if (!startMatch) return "";

  const startIndex = startMatch.index + startMatch[0].length;
  const remaining = text.slice(startIndex);
  const endMatch = endPattern.exec(remaining);
  return endMatch ? remaining.slice(0, endMatch.index) : remaining;
}

function extractNames(section: string) {
  const compact = normalizeWhitespace(section);
  const names: string[] = [];
  const namePattern = /\bNaam\s+(.+?)(?=\s+(?:Geboortedatum|Geboorteplaats|Datum\s+in\s+functie|Titel|Bevoegdheid|Alleen\/zelfstandig\s+bevoegd|Gezamenlijk\s+bevoegd|Bezoekadres|Vestigingsadres|Adres|Ingeschreven\s+onder|KvK-nummer|RSIN|Datum\s+akte|Deponering|Enig\s+aandeelhouder\s+sinds|Aandeelhouder\s+sinds|Naam|Gegevens\s+zijn\s+vervaardigd|$))/gi;

  for (const match of compact.matchAll(namePattern)) {
    names.push(match[1]);
  }

  return uniqueValues(names);
}

function extractDirectorNames(text: string) {
  const directorsSection = sectionBetween(
    text,
    /\b(?:Bestuurders|Bestuurder|Gevolmachtigden|Gevolmachtigde)\b/i,
    /\b(?:Aandeelhouder|Enig aandeelhouder|Onderneming|Vestiging|Gegevens zijn vervaardigd|Overige functionarissen)\b/i,
  );
  const hasAuthority = /\bBevoegdheid\b/i.test(directorsSection);

  if (!directorsSection || !hasAuthority) return [];

  return extractNames(directorsSection).filter((name) => !isLegalEntityName(name));
}

function extractLegalShareholders(text: string) {
  const shareholderSection = sectionBetween(
    text,
    /\b(?:Enig aandeelhouder|Aandeelhouders?|Aandeelhouder)\b/i,
    /\b(?:Bestuurders|Bestuurder|Gevolmachtigden|Gevolmachtigde|Onderneming|Vestiging|Gegevens zijn vervaardigd)\b/i,
  );

  return extractNames(shareholderSection).filter(isLegalEntityName);
}

export function analyzeWorldlineKvkText(
  rawText: string,
  kvkNumber: string,
  referenceDate = new Date(),
  options: KvkAnalysisOptions = {},
): KvkAnalysis {
  const text = normalizeWhitespace(rawText);
  const producedDate = findManufacturedDate(text);
  const legalShareholders = extractLegalShareholders(text);
  const authorizedSigners = extractDirectorNames(text);
  const cutoff = getTwoMonthCutoff(referenceDate);
  const isExpired = producedDate ? producedDate < cutoff : true;
  const hasLegalShareholder = legalShareholders.length > 0;
  const hasAuthorizedSigner = authorizedSigners.length > 0;
  const supportingDocumentNames = options.supportingDocumentNames ?? [];
  const missingLegalShareholders = legalShareholders.filter((shareholder) => !hasSupportingDocumentForEntity(shareholder, supportingDocumentNames));
  const hasRequiredFollowUps = !hasLegalShareholder || missingLegalShareholders.length === 0;
  const checklist: NonNullable<WorldlineCheckResult["checklist"]> = [
    {
      text: kvkNumber
        ? `KvK-nummer herkend: ${kvkNumber}`
        : "KvK-nummer kon niet worden herkend uit de bestandsnaam.",
      done: Boolean(kvkNumber),
      tone: kvkNumber ? "success" : "warning",
    },
    {
      text: "Uittreksel is niet ouder dan 2 maanden",
      done: Boolean(producedDate && !isExpired),
      tone: producedDate && !isExpired ? "success" : "danger",
    },
    {
      text: "Bedrijfsnaam komt overeen met de relatie",
      done: false,
      tone: "warning",
    },
    {
      text: "Tekenbevoegde natuurlijke persoon/personen zijn zichtbaar",
      done: hasAuthorizedSigner,
      tone: hasAuthorizedSigner ? "success" : "danger",
    },
    {
      text: "Eventuele vervolguittreksels zijn aanwezig",
      done: hasRequiredFollowUps,
      tone: hasRequiredFollowUps ? "success" : "danger",
    },
  ];

  if (producedDate) {
    checklist.push({
      text: isExpired
        ? `KvK is te oud: vervaardigd op ${formatDateNl(producedDate)}. Worldline accepteert maximaal 2 maanden oud.`
        : `KvK is recent genoeg: vervaardigd op ${formatDateNl(producedDate)}.`,
      done: !isExpired,
      tone: isExpired ? "danger" : "success",
    });
  } else {
    checklist.push({
      text: "Datum 'Gegevens zijn vervaardigd op' kon niet worden gevonden.",
      done: false,
      tone: "danger",
    });
  }

  if (hasAuthorizedSigner) {
    checklist.push({
      text: `Tekenbevoegde persoon/personen gevonden: ${authorizedSigners.join(", ")}.`,
      done: true,
      tone: "success",
    });
  } else {
    checklist.push({
      text: "Geen natuurlijke persoon met tekenbevoegdheid gevonden. Er is minimaal een KvK nodig waarop personen staan die bevoegd zijn om te tekenen.",
      done: false,
      tone: "danger",
    });
  }

  if (hasLegalShareholder) {
    if (missingLegalShareholders.length > 0) {
      checklist.push({
        text: `Aandeelhouder/holding gevonden: ${missingLegalShareholders.join(", ")}. Upload ook de KvK van deze entiteit; zonder die KvK is het contract niet compleet.`,
        done: false,
        tone: "danger",
      });
    } else {
      checklist.push({
        text: `Vervolguittreksel gevonden voor: ${legalShareholders.join(", ")}.`,
        done: true,
        tone: "success",
      });
    }
  } else {
    checklist.push({
      text: "Geen extra aandeelhouder/holding gevonden waarvoor direct een extra KvK nodig is.",
      done: true,
      tone: "success",
    });
  }

  const hasBlockingIssue = checklist.some((item) => item.tone === "danger" && !item.done);
  const result: WorldlineCheckResult = {
    checklist,
    kvkNumber,
    note: hasBlockingIssue
      ? "KvK-controle uitgevoerd: actie nodig voordat dit Worldline-contract compleet is."
      : "KvK-controle uitgevoerd: dit KvK-uittreksel voldoet aan de automatische controles.",
    producedDate: producedDate ? formatDateIso(producedDate) : undefined,
    authorizedSigners,
    legalShareholders,
  };

  return {
    status: hasBlockingIssue ? "rejected" : "approved",
    result,
    message: result.note ?? "KvK-controle uitgevoerd.",
  };
}
