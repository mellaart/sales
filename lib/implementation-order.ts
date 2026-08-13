export const IMPLEMENTATION_ARTICLE_ID = 782;

export const TRAVEL_ARTICLE_BY_REGION: Readonly<Record<number, number>> = {
  1: 204,
  2: 205,
  3: 206,
  4: 207,
  5: 208,
  6: 209,
  7: 210,
  8: 211,
  9: 212,
  10: 834,
  11: 835,
  12: 836,
  13: 837,
  14: 838,
};

type ImplementationOrderDeal = {
  package_name?: unknown;
  implementation_total?: unknown;
  calculator_inputs?: unknown;
};

export type ImplementationOrderBreakdown = {
  description: string;
  reference: string;
  implementationAmount: number;
  totalAmount: number;
  travelAmount: number;
  travelArticleId: number | null;
  travelPricePerUnit: number;
  travelQuantity: number;
  travelRegion: number | null;
};

function finiteNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function positiveInteger(value: unknown) {
  const numberValue = finiteNumber(value, 0);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }

  return {};
}

export function getImplementationOrderDescription(packageName: unknown) {
  const normalizedPackage = typeof packageName === "string"
    ? packageName.trim().replace(/^Smart\s+Trade\b[\s-]*/i, "")
    : "";

  return normalizedPackage
    ? `Smart Trade ${normalizedPackage} implementatie`
    : "Smart Trade implementatie";
}

export function getImplementationOrderBreakdown(
  deal: ImplementationOrderDeal,
): ImplementationOrderBreakdown {
  const inputs = objectValue(deal.calculator_inputs);
  const totalAmount = roundCurrency(Math.max(0, finiteNumber(deal.implementation_total)));
  const storedTravelAmount = roundCurrency(Math.max(0, finiteNumber(inputs.travelCostTotal)));
  const travelAmount = Math.min(totalAmount, storedTravelAmount);
  const travelRegion = positiveInteger(inputs.travelRegion);
  const travelArticleId = travelRegion ? TRAVEL_ARTICLE_BY_REGION[travelRegion] ?? null : null;
  const storedTravelPricePerUnit = roundCurrency(Math.max(0, finiteNumber(inputs.travelCostPerDay)));
  const travelPricePerUnit = travelAmount > 0
    ? storedTravelPricePerUnit > 0 ? storedTravelPricePerUnit : travelAmount
    : 0;
  const travelQuantity = travelAmount > 0 && travelPricePerUnit > 0
    ? roundQuantity(travelAmount / travelPricePerUnit)
    : 0;
  const description = getImplementationOrderDescription(deal.package_name);

  return {
    description,
    reference: description,
    implementationAmount: roundCurrency(totalAmount - travelAmount),
    totalAmount,
    travelAmount,
    travelArticleId,
    travelPricePerUnit,
    travelQuantity,
    travelRegion,
  };
}
