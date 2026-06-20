const IBAN_LENGTHS: Record<string, number> = {
  AD: 24,
  AE: 23,
  AL: 28,
  AT: 20,
  AZ: 28,
  BA: 20,
  BE: 16,
  BG: 22,
  BH: 22,
  BR: 29,
  CH: 21,
  CR: 22,
  CY: 28,
  CZ: 24,
  DE: 22,
  DK: 18,
  DO: 28,
  EE: 20,
  ES: 24,
  FI: 18,
  FO: 18,
  FR: 27,
  GB: 22,
  GE: 22,
  GI: 23,
  GL: 18,
  GR: 27,
  GT: 28,
  HR: 21,
  HU: 28,
  IE: 22,
  IL: 23,
  IS: 26,
  IT: 27,
  KW: 30,
  KZ: 20,
  LB: 28,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  MC: 27,
  MD: 24,
  ME: 22,
  MK: 19,
  MR: 27,
  MT: 31,
  MU: 30,
  NL: 18,
  NO: 15,
  PK: 24,
  PL: 28,
  PS: 29,
  PT: 25,
  QA: 29,
  RO: 24,
  RS: 22,
  SA: 24,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  TN: 24,
  TR: 26,
  VG: 24,
  XK: 20,
};

export function normalizeIban(value: unknown) {
  return typeof value === "string" ? value.replace(/[^A-Z0-9]/gi, "").toUpperCase() : "";
}

function normalizeIbanCandidate(value: string) {
  const compact = normalizeIban(value);
  if (compact.length < 4) return compact;

  const countryCode = compact
    .slice(0, 2)
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/5/g, "S");
  const checkDigits = compact
    .slice(2, 4)
    .replace(/[OQ]/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8");

  return `${countryCode}${checkDigits}${compact.slice(4)}`;
}

function normalizeCandidate(rawCandidate: string) {
  const normalized = normalizeIbanCandidate(rawCandidate);
  const countryCode = normalized.slice(0, 2);
  const expectedLength = IBAN_LENGTHS[countryCode];
  const candidate = expectedLength ? normalized.slice(0, expectedLength) : normalized;

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(candidate)) return "";
  if (candidate.length < 15 || candidate.length > 34) return "";
  if (expectedLength && candidate.length !== expectedLength) return "";

  return candidate;
}

export function extractIbansFromText(text: string) {
  const ibans = new Set<string>();
  const patterns = [
    /(?:^|[^A-Z0-9])([A-Z]\s*[A-Z]\s*[0-9OQILSB]\s*[0-9OQILSB](?:[\s./|_-]*[A-Z0-9]){11,45})/gi,
    /(?:^|[^A-Z0-9])((?:[A-Z]\s*){2}(?:[0-9OQILSB]\s*){2}(?:[A-Z0-9]\s*){11,45})/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const iban = normalizeCandidate(match[1] ?? "");
      if (iban) ibans.add(iban);
    }
  }

  return Array.from(ibans);
}

export function findIbanInText(text: string, preferredIban?: string) {
  const ibans = extractIbansFromText(text);
  const expectedIban = normalizeIban(preferredIban);

  if (expectedIban && ibans.includes(expectedIban)) return expectedIban;
  return ibans[0] ?? "";
}

export function textHasIban(text: string, preferredIban?: string) {
  return Boolean(findIbanInText(text, preferredIban));
}
