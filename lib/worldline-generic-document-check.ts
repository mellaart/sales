import {
  getWorldlineDocumentDefinition,
  type WorldlineCheckResult,
  type WorldlineCheckStatus,
  type WorldlineDocumentType,
} from "@/lib/worldline";
import { textHasIban } from "@/lib/iban";

export type GenericDocumentAnalysis = {
  status: WorldlineCheckStatus;
  result: WorldlineCheckResult;
  message: string;
};

type GenericDocumentAnalysisOptions = {
  expectedCompanyName?: string;
  expectedIban?: string;
  expectedSignerNames?: string;
  supportingDocumentNames?: string[];
  supportingOcrTexts?: string[];
};

const MONTHS: Record<string, number> = {
  januari: 1,
  jan: 1,
  februari: 2,
  feb: 2,
  maart: 3,
  mrt: 3,
  april: 4,
  apr: 4,
  mei: 5,
  juni: 6,
  jun: 6,
  juli: 7,
  jul: 7,
  juil: 7,
  augustus: 8,
  aug: 8,
  september: 9,
  sep: 9,
  oktober: 10,
  okt: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSearchKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bb\.?\s*v\.?\b/g, "bv")
    .replace(/\bn\.?\s*v\.?\b/g, "nv")
    .replace(/[^a-z0-9]+/g, "");
}

function containsExpectedText(text: string, expectedValue?: string) {
  const expectedKey = normalizeSearchKey(expectedValue ?? "");
  if (expectedKey.length < 3) return false;

  const textKey = normalizeSearchKey(text);
  if (textKey.includes(expectedKey)) return true;

  const significantWords = (expectedValue ?? "")
    .split(/\s+/)
    .map(normalizeSearchKey)
    .filter((word) => word.length >= 4 && !["holding", "groep"].includes(word));

  return significantWords.length > 0 && significantWords.every((word) => textKey.includes(word));
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function findIban(text: string, expectedIban?: string) {
  return textHasIban(text, expectedIban);
}

function findBic(text: string) {
  return /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/i.test(text);
}

function findEmail(text: string) {
  return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text);
}

function findVatNumber(text: string) {
  return /\b(?:NL\s*)?\d{9}\s*B\s*\d{2}\b/i.test(text) || /\bBTW(?:-|\s*)nummer\b/i.test(text);
}

function findDate(text: string) {
  return /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/.test(text) ||
    /\b\d{1,2}\s+(?:jan|feb|mrt|maart|apr|mei|jun|jul|aug|sep|okt|nov|dec)[a-z]*\s+\d{4}\b/i.test(text);
}

function parseDate(day: string, month: string, year: string) {
  const fullYear = Number(year.length === 2 ? `20${year}` : year);
  const date = new Date(fullYear, Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== fullYear ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }

  return date;
}

function formatDateNl(date: Date) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(date);
}

function extractDates(text: string) {
  const dates: Date[] = [];
  const numericPattern = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g;
  const isoPattern = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
  const monthNames = "januari|jan|februari|feb|maart|mrt|april|apr|mei|juni|jun|juli|jul|juil|augustus|aug|september|sep|oktober|okt|november|nov|december|dec";
  const monthNamePattern = new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})\\s+(\\d{4})\\b`, "gi");
  const bilingualMonthNamePattern = new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})\\s*[/|-]\\s*(${monthNames})\\s+(\\d{4})\\b`, "gi");

  for (const match of text.matchAll(numericPattern)) {
    const date = parseDate(match[1], match[2], match[3]);
    if (date) dates.push(date);
  }

  for (const match of text.matchAll(isoPattern)) {
    const date = parseDate(match[3], match[2], match[1]);
    if (date) dates.push(date);
  }

  for (const match of text.matchAll(bilingualMonthNamePattern)) {
    const month = MONTHS[match[2].toLowerCase()] ?? MONTHS[match[3].toLowerCase()];
    const date = month ? parseDate(match[1], String(month), match[4]) : null;
    if (date) dates.push(date);
  }

  for (const match of text.matchAll(monthNamePattern)) {
    const month = MONTHS[match[2].toLowerCase()];
    const date = month ? parseDate(match[1], String(month), match[3]) : null;
    if (date) dates.push(date);
  }

  const seen = new Set<string>();
  return dates
    .filter((date) => {
      const key = date.toISOString().slice(0, 10);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.getTime() - a.getTime());
}

function findIdentityExpiryDate(text: string, referenceDate = new Date()) {
  const compact = normalizeWhitespace(text);
  const labelledPattern = /\b(?:geldig\s*tot|date\s*of\s*expiry|expiry\s*date|expires|valid\s*until|verloopt\s*op|datum\s*verval)\b.{0,90}/gi;
  const labelledDates: Date[] = [];

  for (const match of compact.matchAll(labelledPattern)) {
    labelledDates.push(...extractDates(match[0]));
  }

  if (labelledDates.length > 0) return labelledDates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  return extractDates(compact)
    .filter((date) => date >= today)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}

function splitExpectedNames(value?: string) {
  return (value ?? "")
    .split(/[,;\n]+|\s+en\s+/i)
    .map((name) => name.trim())
    .filter(Boolean);
}

function getSearchWords(value: string) {
  return value
    .split(/[^a-z0-9]+/i)
    .map(normalizeSearchKey)
    .filter(Boolean);
}

function looseWordMatches(textWords: string[], textKey: string, expectedWord: string) {
  if (textKey.includes(expectedWord)) return true;

  const prefix = expectedWord.length >= 5 ? expectedWord.slice(0, 4) : "";
  return textWords.some((word) => {
    if (prefix && word.startsWith(prefix)) return true;
    if (expectedWord.length >= 5 && word.length >= 5 && word.includes(expectedWord.slice(0, 5))) return true;
    return false;
  });
}

function expectedNameMatches(text: string, expectedNames?: string) {
  const textKey = normalizeSearchKey(text);
  const textWords = getSearchWords(text);
  const names = splitExpectedNames(expectedNames);

  for (const name of names) {
    const fullNameKey = normalizeSearchKey(name);
    if (fullNameKey.length >= 4 && textKey.includes(fullNameKey)) return name;

    const words = name
      .split(/[\s,-]+/)
      .map(normalizeSearchKey)
      .filter((word) => word.length >= 3 && !["van", "der", "den", "de", "het", "ten", "ter"].includes(word));

    const matchedWords = words.filter((word) => looseWordMatches(textWords, textKey, word));
    const lastName = words[words.length - 1] ?? "";

    if (words.length >= 2 && matchedWords.length >= 2) return name;
    if (words.length >= 2 && lastName && looseWordMatches(textWords, textKey, lastName) && matchedWords.some((word) => word !== lastName)) return name;
    if (words.length === 1 && looseWordMatches(textWords, textKey, words[0])) return name;
  }

  return "";
}

function getIdentityDocumentKind(text: string) {
  if (hasAny(text, [/\bpaspoort\b/i, /\bpassport\b/i, /\bpassport\s*no\b/i])) return "paspoort";
  if (hasAny(text, [/\brijbewijs\b/i, /\bdriving\s*licen[cs]e\b/i, /\bdriver'?s\s*licen[cs]e\b/i])) return "rijbewijs";
  if (hasAny(text, [/\bidentiteitskaart\b/i, /\bidentity\s*card\b/i, /\bnational\s*identity\b/i, /\bid\s*card\b/i])) return "identiteitskaart";
  return "";
}

function hasBacksideDocument(options: GenericDocumentAnalysisOptions) {
  const names = options.supportingDocumentNames ?? [];
  if (names.some((name) => /\b(achterzijde|achterkant|back|backside|verso|zijde\s*2|pagina\s*2|page\s*2)\b/i.test(name))) return true;
  return names.length >= 1;
}

function hasVisibleBsn(text: string) {
  return /\b(?:BSN|persoonsnummer|personal\s*number)\b.{0,35}\d(?:[\s.-]?\d){7,8}\b/i.test(text);
}

function item(text: string, done: boolean, successText: string, warningText: string): NonNullable<WorldlineCheckResult["checklist"]>[number] {
  return {
    text: done ? successText : warningText,
    done,
    tone: done ? "success" : "warning",
  };
}

function normalizeChecklistTone(checklist: NonNullable<WorldlineCheckResult["checklist"]>) {
  return checklist.map((check) => ({
    ...check,
    tone: check.done ? "success" as const : check.tone ?? "warning" as const,
  }));
}

function analyzeAgreement(text: string): NonNullable<WorldlineCheckResult["checklist"]> {
  const vatAndEmail = findVatNumber(text) && findEmail(text);
  const cardsAndExpectedTransactions = hasAny(text, [/\b(mastercard|visa|unionpay|jcb|diners|discover)\b/i]) &&
    hasAny(text, [/\brefund\b/i, /\bdebit\b/i, /\btransacties?\b/i, /\bverwacht\b/i]);
  const payout = findIban(text) && (findBic(text) || hasAny(text, [/\bBIC\b/i])) &&
    hasAny(text, [/\brekeninghouder\b/i, /\baccount\s*holder\b/i, /\buitbetaling\b/i]);
  const signatureFields = findDate(text) &&
    hasAny(text, [/\bfunctie\b/i, /\bplaats\b/i, /\bhandtekening\b/i, /\bsignature\b/i]);

  return [
    item(text, vatAndEmail, "BTW-nummer en facturatie e-mailadres lijken ingevuld.", "BTW-nummer en/of facturatie e-mailadres niet duidelijk herkend."),
    item(text, cardsAndExpectedTransactions, "Betaalkaarten/refund/transactiegegevens lijken aanwezig.", "Betaalkaarten, refund of verwachte transacties niet duidelijk herkend."),
    item(text, payout, "IBAN, BIC en rekeninghouder lijken aanwezig.", "IBAN, BIC of rekeninghouder niet duidelijk herkend."),
    item(text, signatureFields, "Plaats, datum, functie en handtekeningvelden lijken aanwezig.", "Plaats, datum, functie of handtekeningvelden niet duidelijk herkend. Controleer natte handtekening visueel."),
  ];
}

function analyzeIdentity(text: string, options: GenericDocumentAnalysisOptions): NonNullable<WorldlineCheckResult["checklist"]> {
  const supportingText = normalizeWhitespace((options.supportingOcrTexts ?? []).join(" "));
  const combinedText = normalizeWhitespace(`${text} ${supportingText}`);
  const documentKind = getIdentityDocumentKind(combinedText);
  const expiryDate = findIdentityExpiryDate(combinedText);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryIsValid = expiryDate ? expiryDate >= today : false;
  const matchedSignerName = expectedNameMatches(combinedText, options.expectedSignerNames);
  const hasExpectedSignerName = splitExpectedNames(options.expectedSignerNames).length > 0;
  const bsnVisible = hasVisibleBsn(combinedText);
  const backsidePresent = hasBacksideDocument(options);

  return [
    {
      text: documentKind && expiryDate
        ? expiryIsValid
          ? `Legitimatiebewijs is geldig: ${documentKind}, geldig tot ${formatDateNl(expiryDate)}.`
          : `Legitimatiebewijs is verlopen: ${documentKind}, geldig tot ${formatDateNl(expiryDate)}.`
        : documentKind
          ? `Legitimatiebewijs herkend: ${documentKind}. Geldigheidsdatum niet duidelijk herkend.`
          : "Legitimatiebewijs of geldigheidsdatum niet duidelijk herkend.",
      done: Boolean(documentKind && expiryIsValid),
      tone: documentKind && expiryIsValid ? "success" : "danger",
    },
    {
      text: matchedSignerName
        ? `Naam komt overeen met bekende tekenbevoegde: ${matchedSignerName}.`
        : hasExpectedSignerName
          ? `Naam tekenbevoegde niet duidelijk herkend in ID-document: ${options.expectedSignerNames}.`
          : "Naam tekenbevoegde niet gecontroleerd omdat er geen tekenbevoegde naam bekend is.",
      done: Boolean(matchedSignerName),
      tone: matchedSignerName ? "success" : "warning",
    },
    {
      text: bsnVisible
        ? "BSN/persoonsnummer lijkt zichtbaar. Scherm alleen het BSN af voordat dit naar Worldline gaat."
        : "BSN/persoonsnummer is niet zichtbaar in de OCR-tekst. Controleer visueel of alleen het BSN is afgeschermd.",
      done: !bsnVisible,
      tone: bsnVisible ? "danger" : "success",
    },
    {
      text: documentKind === "identiteitskaart"
        ? backsidePresent
          ? "Bij ID-kaart is ook een achterzijde/bijlage aanwezig."
          : "Bij ID-kaart is de achterkant nog niet duidelijk aanwezig. Upload ook de achterkant."
        : documentKind
          ? `Achterkant is niet verplicht bij documenttype: ${documentKind}.`
          : backsidePresent
            ? "Extra ID-pagina/bijlage is aanwezig."
            : "Controleer visueel of bij een identiteitskaart ook de achterkant aanwezig is.",
      done: documentKind === "identiteitskaart" ? backsidePresent : Boolean(documentKind || backsidePresent),
      tone: documentKind === "identiteitskaart" && !backsidePresent
        ? "danger"
        : documentKind || backsidePresent
          ? "success"
          : "warning",
    },
  ];
}

function analyzeRefund(text: string, options: GenericDocumentAnalysisOptions): NonNullable<WorldlineCheckResult["checklist"]> {
  const isRefund = hasAny(text, [/\brefund\b/i, /\bterugbetaling\b/i, /\bretourbetaling\b/i]);
  const companyMatches = containsExpectedText(text, options.expectedCompanyName);
  const requiredFields = findIban(text, options.expectedIban) || findEmail(text) || findDate(text);
  const signatureFields = hasAny(text, [/\bhandtekening\b/i, /\bsignature\b/i, /\bondertekend\b/i]) || findDate(text);

  return [
    item(text, isRefund, "Refund formulier lijkt aanwezig.", "Refund formulier niet duidelijk herkend."),
    item(text, companyMatches, `Formulier lijkt bij de juiste relatie te horen: ${options.expectedCompanyName}.`, "Relatienaam niet duidelijk herkend op het refund formulier."),
    item(text, requiredFields && signatureFields, "Vereiste velden en handtekeningvelden lijken aanwezig.", "Vereiste velden of handtekeningvelden niet duidelijk herkend."),
  ];
}

export function analyzeWorldlineGenericDocumentText(
  documentType: WorldlineDocumentType,
  rawText: string,
  options: GenericDocumentAnalysisOptions = {},
): GenericDocumentAnalysis {
  const text = normalizeWhitespace(rawText);
  const definition = getWorldlineDocumentDefinition(documentType);
  const checklist = normalizeChecklistTone(documentType === "agreement"
    ? analyzeAgreement(text)
    : documentType === "identity"
      ? analyzeIdentity(text, options)
      : documentType === "refund"
        ? analyzeRefund(text, options)
        : (definition?.checklist ?? []).map((label) => ({
            text: `${label}: controleer visueel.`,
            done: false,
            tone: "warning" as const,
          })));

  const needsReview = checklist.some((check) => check.tone !== "success" || !check.done);
  const result: WorldlineCheckResult = {
    analysisVersion: 1,
    checklist,
    note: needsReview
      ? `${definition?.title ?? "Document"}-controle uitgevoerd met OCR: controleer de aandachtspunten visueel.`
      : `${definition?.title ?? "Document"}-controle uitgevoerd met OCR: geen aandachtspunten gevonden.`,
  };

  return {
    status: needsReview ? "checking" : "approved",
    result,
    message: result.note ?? `${definition?.title ?? "Document"}-controle uitgevoerd.`,
  };
}
