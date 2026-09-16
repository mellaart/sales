export type BudgetRow = { days: number; started: boolean };
export function validHoursPerDay(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 24;
}
export function approvedDays(deal: { accepted_at?: unknown; calculator_inputs?: Record<string, unknown> | null }): number | null {
  if (!deal.accepted_at) return null;
  const input = deal.calculator_inputs;
  if (typeof input?.implementationDays === "number" && Number.isFinite(input.implementationDays) && input.implementationDays >= 0) return input.implementationDays;
  const cost = Number(input?.travelCostTotal), rate = Number(input?.travelCostPerDay);
  return Number.isFinite(cost) && Number.isFinite(rate) && cost > 0 && rate > 0 ? Math.round(cost / rate * 100) / 100 : null;
}
export function validateBudgetRows(value: unknown, budget: number): value is Record<string, BudgetRow> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > 1000) return false;
  let total = 0;
  for (const [key, row] of entries) {
    if (!key || key.length > 250 || !row || typeof row.days !== "number" || !Number.isFinite(row.days) || row.days < 0 || typeof row.started !== "boolean") return false;
    total += row.days;
  }
  return Math.abs(total - budget) < 0.005;
}
