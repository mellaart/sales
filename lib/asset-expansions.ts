import type { AssetExpansionLine } from "@/lib/supabase";

export type AssetExpansionTotals = {
  monthly: number;
  annual: number;
  once: number;
};

export function getAssetExpansionTotals(lines: AssetExpansionLine[]): AssetExpansionTotals {
  return lines.reduce<AssetExpansionTotals>(
    (totals, line) => {
      const amount = Number(line.amount || 0);

      if (line.cadence === "monthly") totals.monthly += amount;
      if (line.cadence === "annual") totals.annual += amount;
      if (line.cadence === "once") totals.once += amount;

      return totals;
    },
    { monthly: 0, annual: 0, once: 0 },
  );
}

export function getAssetExpansionUnitAmount(line: AssetExpansionLine) {
  const quantity = Math.max(1, Number(line.quantity || 1));

  return Number(line.amount || 0) / quantity;
}
