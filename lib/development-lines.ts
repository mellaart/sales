export const DEFAULT_DEVELOPMENT_HOURLY_RATE = 135;

export type DevelopmentLine = {
  id: string;
  description: string;
  hours: number;
};

function safeNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function createFallbackId(index: number) {
  return `development-${index + 1}`;
}

export function createDevelopmentLine(): DevelopmentLine {
  const randomPart = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id: `development-${randomPart}`,
    description: "",
    hours: 0,
  };
}

export function normalizeDevelopmentLines(input: unknown): DevelopmentLine[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];

    const source = item as Record<string, unknown>;
    const description = typeof source.description === "string"
      ? source.description.slice(0, 500)
      : "";
    const hours = Math.max(0, Math.min(10_000, safeNumber(source.hours, 0)));
    if (!description.trim() && hours === 0) return [];

    return [{
      id: typeof source.id === "string" && source.id.trim()
        ? source.id.slice(0, 120)
        : createFallbackId(index),
      description,
      hours,
    }];
  });
}

export function getDevelopmentHours(lines: DevelopmentLine[]) {
  return lines.reduce((total, line) => total + Math.max(0, safeNumber(line.hours, 0)), 0);
}

export function getDevelopmentTotal(lines: DevelopmentLine[], hourlyRate: number) {
  return getDevelopmentHours(lines) * Math.max(0, safeNumber(hourlyRate, 0));
}

export function getQuotedDevelopmentLines(lines: DevelopmentLine[]) {
  return lines
    .filter((line) => Math.max(0, safeNumber(line.hours, 0)) > 0)
    .map((line) => ({
      ...line,
      description: line.description.trim() || "Ontwikkelwerk",
      hours: Math.max(0, safeNumber(line.hours, 0)),
    }));
}

export function formatDevelopmentHours(hours: number) {
  return new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: Number.isInteger(hours) ? 0 : 1,
    maximumFractionDigits: 2,
  }).format(hours);
}
