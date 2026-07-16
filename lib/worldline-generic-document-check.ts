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
  documentName?: string;
  expectedCompanyName?: string;
  expectedIban?: string;
  expectedSignerNames?: string;
  pageCount?: number;
  supportingDocumentNames?: string[];
  supportingOcrTexts?: string[];
  visualSignatureDetected?: boolean;
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
  jui: 7,
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
  return /\b\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4}\b/.test(text) ||
    /\b\d{1,2}\s+(?:jan|feb|mrt|maart|apr|mei|jun|jul|aug|sep|okt|nov|dec)[a-z]*\s+\d{4}\b/i.test(text);
}

function parseDate(day: string, month: string, year: string) {
  const normalizedDay = day.replace(/\s+/g, "").replace(/[OQD]/gi, "0").replace(/[IL]/gi, "1").replace(/S/gi, "5").replace(/Z/gi, "2");
  const normalizedMonth = month.replace(/\s+/g, "").replace(/[OQD]/gi, "0").replace(/[IL]/gi, "1").replace(/S/gi, "5").replace(/Z/gi, "2");
  const normalizedYear = year.replace(/\s+/g, "").replace(/[OQD]/gi, "0").replace(/[IL]/gi, "1").replace(/S/gi, "5").replace(/Z/gi, "2");
  const fullYear = Number(normalizedYear.length === 2 ? `20${normalizedYear}` : normalizedYear);
  const date = new Date(fullYear, Number(normalizedMonth) - 1, Number(normalizedDay));
  if (
    date.getFullYear() !== fullYear ||
    date.getMonth() !== Number(normalizedMonth) - 1 ||
    date.getDate() !== Number(normalizedDay)
  ) {
    return null;
  }

  return date;
}

function normalizeOcrDigits(value: string) {
  return value
    .replace(/[OQD]/gi, "0")
    .replace(/[IL]/gi, "1")
    .replace(/S/gi, "5")
    .replace(/Z/gi, "2");
}

function parseFutureMrzDate(value: string, referenceDate: Date) {
  const digits = normalizeOcrDigits(value);
  if (!/^\d{6}$/.test(digits)) return null;

  const year = 2000 + Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  const date = parseDate(String(day), String(month), String(year));
  if (!date) return null;

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  const maxExpiry = new Date(today);
  maxExpiry.setFullYear(maxExpiry.getFullYear() + 15);

  return date >= today && date <= maxExpiry ? date : null;
}

function formatDateNl(date: Date) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(date);
}

function getMonthNumber(value: string) {
  const key = value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\.$/, "")
    .replace(/1/g, "l")
    .replace(/0/g, "o")
    .replace(/5/g, "s");
  return MONTHS[key];
}

function extractDates(text: string) {
  const dates: Date[] = [];
  const compactDateText = text
    .replace(/\b([0-9OQDILSZ])\s+([0-9OQDILSZ])\s+([0-9OQDILSZ])\s+([0-9OQDILSZ])\b/gi, "$1$2$3$4")
    .replace(/\b([0-9OQDILSZ]{2})\s+([0-9OQDILSZ]{2})\b/gi, "$1$2")
    .replace(/\bJ\s*U\s*[I1L]\s*[L1]?\b/gi, "JUL")
    .replace(/J\s*U\s*[I1L]\s*[L1]?\s*[/|\\-]?\s*J\s*U\s*[I1L]\s*[L1]?/gi, "JUL")
    .replace(/JUILJUL|JULJUIL|JULJUL|JUILJUIL/gi, "JUL")
    .replace(/JUL\s*JUIL/gi, "JUL")
    .replace(/\b(JAN|FEB|MRT|MAR|APR|MEI|MAY|JUN|JUL|JUI|AUG|SEP|OKT|OCT|NOV|DEC)\s*[/|\\-]?\s*\1\b/gi, "$1")
    .replace(/\b([a-z])\s+([a-z])\s+([a-z])\b/gi, "$1$2$3");
  const variants = Array.from(new Set([text, compactDateText]));
  const dayToken = "[0-9OQDILSZ]{1,2}";
  const yearToken = "[0-9OQDILSZ](?:\\s*[0-9OQDILSZ]){1,3}";
  const numericPattern = new RegExp(`\\b(${dayToken})[-/.](${dayToken})[-/.](${yearToken})\\b`, "gi");
  const spacedNumericPattern = new RegExp(`\\b(${dayToken})\\s+(${dayToken})\\s+(${yearToken})\\b`, "gi");
  const compactNumericPattern = new RegExp(`\\b([0-9OQDILSZ]{2})([0-9OQDILSZ]{2})([0-9OQDILSZ]{4})\\b`, "gi");
  const isoPattern = new RegExp(`\\b(${yearToken})-(${dayToken})-(${dayToken})\\b`, "gi");
  const monthNames = "september|januari|februari|augustus|oktober|november|december|maart|april|juni|juli|juil|jan|feb|mrt|apr|mei|jun|jul|jui|aug|sep|okt|nov|dec";
  const monthToken = `(?:${monthNames}|ju[il1])\\.?`;
  const monthNamePattern = new RegExp(`\\b(${dayToken})\\s*(${monthToken})\\s*(${yearToken})\\b`, "gi");
  const bilingualSeparator = String.raw`(?:[/|\\-]|[0-9OQDILSZ]{1,2})`;
  const bilingualMonthNamePattern = new RegExp(`\\b(${dayToken})\\s*(${monthToken})\\s*${bilingualSeparator}\\s*(${monthToken})\\s*(${yearToken})\\b`, "gi");
  const doubleMonthNamePattern = new RegExp(`\\b(${dayToken})\\s*(${monthToken})\\s+(${monthToken})\\s*(${yearToken})\\b`, "gi");
  const looseMonthNamePattern = new RegExp(`\\b(${dayToken})\\s*(${monthToken}).{0,18}?(${yearToken})\\b`, "gi");

  for (const value of variants) {
    for (const match of value.matchAll(numericPattern)) {
      const date = parseDate(match[1], match[2], match[3]);
      if (date) dates.push(date);
    }

    for (const match of value.matchAll(spacedNumericPattern)) {
      const date = parseDate(match[1], match[2], match[3]);
      if (date) dates.push(date);
    }

    for (const match of value.matchAll(compactNumericPattern)) {
      const date = parseDate(match[1], match[2], match[3]);
      if (date) dates.push(date);
    }

    for (const match of value.matchAll(isoPattern)) {
      const date = parseDate(match[3], match[2], match[1]);
      if (date) dates.push(date);
    }

    for (const match of value.matchAll(bilingualMonthNamePattern)) {
      const month = getMonthNumber(match[2]) ?? getMonthNumber(match[3]);
      const date = month ? parseDate(match[1], String(month), match[4]) : null;
      if (date) dates.push(date);
    }

    for (const match of value.matchAll(doubleMonthNamePattern)) {
      const month = getMonthNumber(match[2]) ?? getMonthNumber(match[3]);
      const date = month ? parseDate(match[1], String(month), match[4]) : null;
      if (date) dates.push(date);
    }

    for (const match of value.matchAll(monthNamePattern)) {
      const month = getMonthNumber(match[2]);
      const date = month ? parseDate(match[1], String(month), match[3]) : null;
      if (date) dates.push(date);
    }

    for (const match of value.matchAll(looseMonthNamePattern)) {
      const month = getMonthNumber(match[2]);
      const date = month ? parseDate(match[1], String(month), match[3]) : null;
      if (date) dates.push(date);
    }
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
  const labelledPattern = /\b(?:geldig\s*tot|einde\s+geldigheid|datum\s+einde\s+geldigheid|date\s*of\s*expiry|expiry\s*date|expires|valid\s*until|validity|expiration|expiration\s+date|verloopt\s*op|datum\s*verval)\b.{0,140}/gi;
  const labelledDates: Date[] = [];

  for (const match of compact.matchAll(labelledPattern)) {
    labelledDates.push(...extractDates(match[0]));
  }

  if (labelledDates.length > 0) return labelledDates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  const explicitFutureDate = extractDates(compact)
    .filter((date) => date >= today)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  if (explicitFutureDate) return explicitFutureDate;

  const mrzText = compact.replace(/[^A-Z0-9<]/gi, "");
  const mrzDates: Date[] = [];
  for (const match of mrzText.matchAll(/[MF<]([0-9OQDILSZ]{6})[0-9OQDILSZ]/gi)) {
    const date = parseFutureMrzDate(match[1], referenceDate);
    if (date) mrzDates.push(date);
  }

  for (const match of mrzText.matchAll(/([0-9OQDILSZ]{6})/gi)) {
    const date = parseFutureMrzDate(match[1], referenceDate);
    if (date) mrzDates.push(date);
  }

  return mrzDates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
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
    if (matchedWords.some((word) => word.length >= 5)) return name;
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

function hasBacksideDocument(text: string, options: GenericDocumentAnalysisOptions) {
  if ((options.pageCount ?? 0) >= 2) return true;

  const names = options.supportingDocumentNames ?? [];
  if (names.some((name) => /\b(achterzijde|achterkant|back|backside|verso|zijde\s*2|pagina\s*2|page\s*2)\b/i.test(name))) return true;
  if (names.length >= 1) return true;

  return hasAny(text, [
    /\bvervolg\s+naam\b/i,
    /\bcontinue\s+surname\b/i,
    /\bpersoonsnummer\b/i,
    /\bpersonal\s*(?:no|number)\b/i,
    /I\s*<\s*NLD/i,
    /NLD\s*<{2,}/i,
  ]);
}

function hasVisibleBsn(text: string) {
  return /\b(?:BSN|persoonsnummer|personal\s*number)\b.{0,35}\d(?:[\s.-]?\d){7,8}\b/i.test(text);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getValueAfterLabel(text: string, labels: string[]) {
  const compact = normalizeWhitespace(text).replace(/[＿_]{2,}/g, " ");
  const labelPattern = labels.map(escapeRegExp).join("|").replace(/\\ /g, "\\s+");
  const stopLabels = [
    "plaats",
    "place",
    "datum",
    "date",
    "handtekening",
    "signature",
    "naam\\s+tekenbevoegde",
    "naam\\s+ondertekenaar",
    "name",
  ].join("|");
  const match = compact.match(new RegExp(`\\b(?:${labelPattern})\\s*:?\\s*(.{0,120})`, "i"));
  if (!match) return "";

  const stopPattern = new RegExp(`\\b(?:${stopLabels})\\b.*$`, "i");
  const value = normalizeWhitespace(
    (match[1] ?? "")
      .replace(stopPattern, "")
      .replace(/[_—–-]{2,}/g, " ")
      .replace(/^[.:|/\s]+|[.:|/\s]+$/g, ""),
  );

  if (!value || /^(nvt|n\/a|geen|niet ingevuld)$/i.test(value)) return "";
  return /[a-z0-9]{2,}/i.test(value) ? value : "";
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
  const combinedText = normalizeWhitespace(`${text} ${supportingText} ${options.documentName ?? ""}`);
  const nameEvidenceText = normalizeWhitespace(`${combinedText} ${(options.supportingDocumentNames ?? []).join(" ")}`);
  const documentKind = getIdentityDocumentKind(combinedText);
  const expiryDate = findIdentityExpiryDate(combinedText);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryIsValid = expiryDate ? expiryDate >= today : false;
  const matchedSignerName = expectedNameMatches(nameEvidenceText, options.expectedSignerNames);
  const hasExpectedSignerName = splitExpectedNames(options.expectedSignerNames).length > 0;
  const bsnVisible = hasVisibleBsn(combinedText);
  const backsidePresent = hasBacksideDocument(combinedText, options);

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
  const placeValue = getValueAfterLabel(text, ["plaats", "place"]);
  const signatureValue = getValueAfterLabel(text, ["handtekening", "signature"]);
  const signaturePresent = Boolean(signatureValue) || options.visualSignatureDetected === true;
  const signerNameValue = getValueAfterLabel(text, ["naam tekenbevoegde", "naam ondertekenaar", "name"]);
  const missingLeftFields = [
    placeValue ? "" : "Plaats",
    signaturePresent ? "" : "Handtekening",
    signerNameValue ? "" : "Naam tekenbevoegde",
  ].filter(Boolean);

  return [
    item(text, isRefund, "Refund formulier lijkt aanwezig.", "Refund formulier niet duidelijk herkend."),
    item(text, companyMatches, `Formulier lijkt bij de juiste relatie te horen: ${options.expectedCompanyName}.`, "Relatienaam niet duidelijk herkend op het refund formulier."),
    item(text, requiredFields, "Vereiste velden lijken aanwezig.", "Vereiste velden niet duidelijk herkend."),
    {
      text: missingLeftFields.length
        ? `Niet ingevuld aan linkerzijde: ${missingLeftFields.join(", ")}.`
        : "Plaats, handtekening en naam tekenbevoegde lijken ingevuld.",
      done: missingLeftFields.length === 0,
      tone: missingLeftFields.length === 0 ? "success" : "danger",
    },
  ];
}

function hasUboDateAndPlace(text: string) {
  const normalized = normalizeWhitespace(text);
  const focusedMatch = normalized.match(/UBO_DATE_PLACE_START\s*(.*?)\s*UBO_DATE_PLACE_END/i);
  const labelMatch = normalized.match(/(?:datum\s+en\s+plaats|date\s+and\s+place)\s*:?\s*(.{0,140})/i);
  const candidate = normalizeWhitespace(focusedMatch?.[1] ?? labelMatch?.[1] ?? "")
    .replace(/\b(?:wettelijke\s+vertegenwoordiger|legal\s+representative).*$/i, "");

  if (!candidate || !findDate(candidate)) return false;

  const placeText = candidate
    .replace(/\b\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4}\b/g, " ")
    .replace(/\b\d{1,2}\s+(?:jan|feb|mrt|maart|apr|mei|jun|jul|aug|sep|okt|nov|dec)[a-z]*\s+\d{4}\b/gi, " ")
    .replace(/\b(?:datum|date|en|and|plaats|place)\b/gi, " ")
    .replace(/[^a-zA-ZÀ-ÿ' -]+/g, " ");

  return (placeText.match(/[a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ' -]{1,}/g) ?? [])
    .some((value) => value.trim().length >= 2);
}

function analyzeUbo(text: string, options: GenericDocumentAnalysisOptions): NonNullable<WorldlineCheckResult["checklist"]> {
  const dateAndPlacePresent = hasUboDateAndPlace(text);
  const signaturePresent = options.visualSignatureDetected === true;

  return [
    {
      text: dateAndPlacePresent
        ? "Datum en plaats zijn ingevuld."
        : "Datum en plaats zijn niet duidelijk ingevuld.",
      done: dateAndPlacePresent,
      tone: dateAndPlacePresent ? "success" : "danger",
    },
    {
      text: signaturePresent
        ? "Handtekening is aanwezig."
        : "Handtekening is niet duidelijk aanwezig.",
      done: signaturePresent,
      tone: signaturePresent ? "success" : "danger",
    },
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
        : documentType === "ubo"
          ? analyzeUbo(text, options)
        : (definition?.checklist ?? []).map((label) => ({
            text: `${label}: controleer visueel.`,
            done: false,
            tone: "warning" as const,
          })));

  const needsReview = checklist.some((check) => check.tone !== "success" || !check.done);
  const result: WorldlineCheckResult = {
    analysisVersion: documentType === "identity" ? 5 : documentType === "refund" ? 2 : 1,
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
