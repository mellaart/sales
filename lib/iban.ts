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

function normalizeCandidate(rawCandidate: string) {
  const normalized = normalizeIban(rawCandidate);
  const countryCode = normalized.slice(0, 2);
  const expectedLength = IBAN_LENGTHS[countryCode];
  const candidate = expectedLength ? normalized.slice(0, expectedLength) : normalized;

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(candidate)) return "";
  if (candidate.length < 15 || candidate.length > 34) return "";
  if (expectedLength && candidate.length !== expectedLength) return "";

  return candidate;
}

export function extractIbansFromText(text: string) {
  const matches = text.matchAll(/(?:^|[^A-Z0-9])([A-Z]\s*[A-Z]\s*\d\s*\d(?:[\s./-]*[A-Z0-9]){11,40})/gi);
  const ibans = new Set<string>();

  for (const match of matches) {
    const iban = normalizeCandidate(match[1] ?? "");
    if (iban) ibans.add(iban);
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
