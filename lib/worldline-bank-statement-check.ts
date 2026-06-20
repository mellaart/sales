import type { WorldlineCheckResult, WorldlineCheckStatus } from "@/lib/worldline";
import { findIbanInText, normalizeIban } from "@/lib/iban";

const BANK_PATTERNS: Array<{ name: string; patterns: RegExp[] }> = [
  { name: "ABN AMRO", patterns: [/\bABN\s*AMRO\b/i, /\bABNANL2A\b/i] },
  { name: "ASN Bank", patterns: [/\bASN\s*Bank\b/i, /\bASNBNL21\b/i] },
  { name: "Bunq", patterns: [/\bBunq\b/i, /\bBUNQNL2A\b/i] },
  { name: "Deutsche Bank", patterns: [/\bDeutsche\s*Bank\b/i, /\bDEUTNL2A\b/i] },
  { name: "ING", patterns: [/\bING\b/i, /\bINGBNL2A\b/i] },
  { name: "Knab", patterns: [/\bKnab\b/i, /\bKNABNL2H\b/i] },
  { name: "Rabobank", patterns: [/\bRabobank\b/i, /\bRABONL2U\b/i] },
  { name: "RegioBank", patterns: [/\bRegioBank\b/i, /\bRBRBNL21\b/i] },
  { name: "Revolut", patterns: [/\bRevolut\b/i, /\bREVOLT21\b/i] },
  { name: "SNS", patterns: [/\bSNS\b/i, /\bSNSBNL2A\b/i] },
  { name: "Triodos", patterns: [/\bTriodos\b/i, /\bTRIONL2U\b/i] },
  { name: "Van Lanschot", patterns: [/\bVan\s+Lanschot\b/i, /\bFVLBNL22\b/i] },
  { name: "Wise", patterns: [/\bWise\b/i, /\bTRWIBEB1\b/i] },
];

const MONTHS: Record<string, number> = {
  januari: 1,
  jan: 1,
  februari: 2,
  feb: 2,
  maart: 3,
  mrt: 3,
  march: 3,
  april: 4,
  apr: 4,
  mei: 5,
  may: 5,
  juni: 6,
  jun: 6,
  juli: 7,
  jul: 7,
  augustus: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  oktober: 10,
  okt: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

export type BankStatementAnalysis = {
  status: WorldlineCheckStatus;
  result: WorldlineCheckResult;
  message: string;
};

type BankStatementAnalysisOptions = {
  expectedCompanyName?: string;
  expectedIban?: string;
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

function parseDate(day: string, month: string, year: string) {
  const normalizedYear = Number(year.length === 2 ? `20${year}` : year);
  const date = new Date(normalizedYear, Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== normalizedYear ||
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

function uniqueDates(dates: Date[]) {
  const seen = new Set<string>();
  return dates.filter((date) => {
    const key = formatDateIso(date);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractDates(text: string) {
  const dates: Date[] = [];
  const numericPattern = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g;
  const isoPattern = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
  const monthNamePattern = /\b(\d{1,2})\s+(januari|jan|februari|feb|maart|mrt|march|april|apr|mei|may|juni|jun|juli|jul|augustus|aug|september|sep|sept|oktober|okt|oct|november|nov|december|dec)\s+(\d{4})\b/gi;

  for (const match of text.matchAll(numericPattern)) {
    const date = parseDate(match[1], match[2], match[3]);
    if (date) dates.push(date);
  }

  for (const match of text.matchAll(isoPattern)) {
    const date = parseDate(match[3], match[2], match[1]);
    if (date) dates.push(date);
  }

  for (const match of text.matchAll(monthNamePattern)) {
    const month = MONTHS[match[2].toLowerCase()];
    const date = month ? parseDate(match[1], String(month), match[3]) : null;
    if (date) dates.push(date);
  }

  return uniqueDates(dates).sort((a, b) => b.getTime() - a.getTime());
}

function findStatementDate(text: string) {
  const compact = normalizeWhitespace(text);
  const labelledDatePattern = /\b(?:afschriftdatum|datum\s+afschrift|datum|printdatum|download(?:datum)?|uitdraaidatum|gemaakt\s+op|periode)\b.{0,160}/gi;
  const labelledDates: Date[] = [];

  for (const match of compact.matchAll(labelledDatePattern)) {
    labelledDates.push(...extractDates(match[0]));
  }

  const candidates = labelledDates.length > 0
    ? uniqueDates(labelledDates).sort((a, b) => b.getTime() - a.getTime())
    : extractDates(compact);
  return candidates[0] ?? null;
}

function findBankName(text: string) {
  for (const bank of BANK_PATTERNS) {
    if (bank.patterns.some((pattern) => pattern.test(text))) return bank.name;
  }

  return "";
}

function companyNameIsVisible(text: string, expectedCompanyName: string) {
  const expectedKey = normalizeSearchKey(expectedCompanyName);
  if (expectedKey.length < 3) return false;

  const textKey = normalizeSearchKey(text);
  if (textKey.includes(expectedKey)) return true;

  const significantWords = expectedCompanyName
    .split(/\s+/)
    .map(normalizeSearchKey)
    .filter((word) => word.length >= 4 && !["holding", "groep"].includes(word));

  return significantWords.length > 0 && significantWords.every((word) => textKey.includes(word));
}

export function analyzeWorldlineBankStatementText(
  rawText: string,
  referenceDate = new Date(),
  options: BankStatementAnalysisOptions = {},
): BankStatementAnalysis {
  const text = normalizeWhitespace(rawText);
  const bankName = findBankName(text);
  const statementDate = findStatementDate(text);
  const expectedIban = normalizeIban(options.expectedIban);
  const iban = findIbanInText(text, expectedIban);
  const cutoff = getTwoMonthCutoff(referenceDate);
  const expectedCompanyName = normalizeWhitespace(options.expectedCompanyName ?? "");
  const companyVisible = expectedCompanyName ? companyNameIsVisible(text, expectedCompanyName) : false;
  const ibanMatchesExpected = Boolean(expectedIban && iban && iban === expectedIban);
  const dateIsRecent = statementDate ? statementDate >= cutoff : false;
  const ibanAndDateVisible = Boolean(iban && statementDate);

  const checklist: NonNullable<WorldlineCheckResult["checklist"]> = [
    {
      text: statementDate
        ? dateIsRecent
          ? `Afschrift is recent genoeg: datum ${formatDateNl(statementDate)}.`
          : `Afschrift is te oud: datum ${formatDateNl(statementDate)}. Worldline accepteert maximaal 2 maanden oud.`
        : "Afschrift is niet ouder dan 2 maanden: datum kon niet worden gevonden.",
      done: dateIsRecent,
      tone: dateIsRecent ? "success" : "danger",
    },
    {
      text: bankName
        ? `Naam van de bank is zichtbaar: ${bankName}.`
        : "Naam van de bank is niet herkend in het bankafschrift.",
      done: Boolean(bankName),
      tone: bankName ? "success" : "danger",
    },
    {
      text: companyVisible
        ? `Bedrijfsnaam is zichtbaar: ${expectedCompanyName}.`
        : expectedCompanyName
          ? `Bedrijfsnaam is niet herkend: ${expectedCompanyName}.`
          : "Bedrijfsnaam is niet gecontroleerd omdat er geen bedrijfsnaam bekend is.",
      done: companyVisible,
      tone: companyVisible ? "success" : "danger",
    },
    {
      text: ibanAndDateVisible
        ? `IBAN en datum zijn zichtbaar: ${iban}${ibanMatchesExpected ? " (komt overeen met ingevulde IBAN)" : ""}.`
        : `IBAN en datum zijn zichtbaar: ${iban ? "IBAN gevonden" : "IBAN ontbreekt"}; ${statementDate ? "datum gevonden" : "datum ontbreekt"}.`,
      done: ibanAndDateVisible,
      tone: ibanAndDateVisible ? "success" : "danger",
    },
  ];

  const hasBlockingIssue = checklist.some((item) => item.tone === "danger" && !item.done);
  const result: WorldlineCheckResult = {
    analysisVersion: 1,
    checklist,
    note: hasBlockingIssue
      ? "Bankafschrift-controle uitgevoerd: actie nodig voordat dit Worldline-contract compleet is."
      : "Bankafschrift-controle uitgevoerd: dit bankafschrift voldoet aan de automatische controles.",
    bankName: bankName || undefined,
    iban: iban || undefined,
    statementDate: statementDate ? formatDateIso(statementDate) : undefined,
  };

  return {
    status: hasBlockingIssue ? "rejected" : "approved",
    result,
    message: result.note ?? "Bankafschrift-controle uitgevoerd.",
  };
}
