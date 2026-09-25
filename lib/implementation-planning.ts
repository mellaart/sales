export type BudgetRow = { days: number; started: boolean; quantity?: number };
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
export function validateBudgetRows(value: unknown, budget: number | null): value is Record<string, BudgetRow> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > 1000) return false;
  let total = 0;
  for (const [key, row] of entries) {
    if (!key || key.length > 250 || !row || typeof row.days !== "number" || !Number.isFinite(row.days) || row.days < 0 || typeof row.started !== "boolean") return false;
    if (row.quantity !== undefined && (typeof row.quantity !== "number" || !Number.isInteger(row.quantity) || row.quantity < 0 || row.quantity > 100000)) return false;
    total += row.days;
  }
  return budget === null || Math.abs(total - budget) < 0.005;
}

// The remainder is an automatic reserve, not an activity or completed work.
// It is derived on every read/edit so it cannot become stale or be approved.
export function budgetWithRemainder(budget: number | null, rows: unknown, hoursPerDay = 6) {
  if (budget === null || !Number.isFinite(budget) || budget < 0 || !validHoursPerDay(hoursPerDay) || !validateBudgetRows(rows, null)) return null;
  const allocatedDays = Object.values(rows).reduce((sum, row) => sum + row.days, 0);
  const remainingDays = Math.max(0, budget - allocatedDays);
  const overBudget = (allocatedDays - budget) * hoursPerDay >= 0.005;
  return { allocatedDays, remainingDays, totalDays: allocatedDays + remainingDays, overBudget };
}

export function weightedProgress(budget: number | null, rows: unknown, approvals: Record<string, unknown>, hoursPerDay = 6): number | null {
  if (budget === null || !Number.isFinite(budget) || budget <= 0 || !validateBudgetRows(rows, null)) return null;
  const balance = budgetWithRemainder(budget, rows, hoursPerDay);
  if (!balance || balance.overBudget) return null;
  const completedDays = Object.entries(rows).reduce((sum, [key, row]) => sum + row.days * (approvals[key] ? 1 : row.started ? 0.5 : 0), 0);
  return Math.min(100, Math.floor(completedDays / budget * 1000 + 1e-8) / 10);
}
