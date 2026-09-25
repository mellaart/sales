import type { ActivityBudget, EditablePricingConfig } from "@/lib/price-config";
import type { ImplementationItem } from "@/lib/implementation-items";
import type { BudgetRow } from "@/lib/implementation-planning";
import { getImplementationWorkItemProgressKey, getImplementationWorkItemStatuses, isImplementationItemSelected } from "@/lib/work-activities";

export type EstimateItem = { key: string; label: string; days: number | null; unit: string; started: boolean };

// All customer portal variants share the activities configured in Admin.
export function activityBudgetKey(itemKey: string, label: string) {
  const group = itemKey.startsWith("customer-portal:") ? "customer-portal" : itemKey;
  return getImplementationWorkItemProgressKey(group, label);
}

export function selectedEstimateItems(items: ImplementationItem[], progress: Record<string, boolean>, config: EditablePricingConfig): EstimateItem[] {
  return items.filter(item => isImplementationItemSelected(item, progress)).flatMap(item => {
    const work = getImplementationWorkItemStatuses(item, progress).filter(row => row.selected);
    const candidates = work.length ? work : [{ key: item.key, label: item.label, completed: Boolean(progress[item.key]) }];
    return candidates.map(row => {
      const standard: ActivityBudget | undefined = config.implementationActivityBudgets[activityBudgetKey(item.key, row.label)];
      return { key: row.key, label: work.length ? `${item.label} — ${row.label}` : item.label,
        days: standard?.days ?? null, unit: standard?.unit ?? "", started: row.completed };
    });
  });
}

export function estimateImplementation(items: EstimateItem[], budget: number | null, previous: Record<string, BudgetRow> = {}, hoursPerDay = 6) {
  const missing = items.filter(item => item.days === null).map(item => item.key);
  if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0 || items.some(item => {
    const quantity = item.unit ? previous[item.key]?.quantity ?? 1 : 1;
    return !Number.isInteger(quantity) || quantity < 0 || quantity > 100000 || (item.days !== null && (!Number.isFinite(item.days) || item.days < 0));
  })) return { rows: null, rawDays: null, missing };
  const weights = items.map(item => {
    const quantity = item.unit ? previous[item.key]?.quantity ?? 1 : 1;
    return { item, quantity, days: (item.days ?? 0) * quantity };
  });
  const rawDays = missing.length ? null : weights.reduce((sum, row) => sum + row.days, 0);
  if (budget === null || !Number.isFinite(budget) || budget < 0 || !items.length || rawDays === null || (rawDays === 0 && budget > 0)) {
    return { rows: null, rawDays, missing };
  }
  // Allocate in hundredths of an hour, so displayed/editable hours reconcile.
  const units = Math.round(budget * hoursPerDay * 100);
  const shares = weights.map(row => rawDays ? units * row.days / rawDays : 0);
  const rounded = shares.map(Math.floor);
  const order = shares.map((value, index) => ({ index, fraction: value - rounded[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  const remainder = units - rounded.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < remainder; i++) rounded[order[i % order.length].index]++;
  const rows = Object.fromEntries(weights.map(({ item, quantity }, index) => [item.key, {
    days: rounded[index] / 100 / hoursPerDay,
    started: previous[item.key]?.started ?? item.started,
    quantity,
  }]));
  // Some day budgets equal a fractional hundredth of an hour. Keep that
  // precision without concentrating the rounding correction in one activity.
  const positive = weights.filter(row => rows[row.item.key].days > 0);
  const difference = budget - Object.values(rows).reduce((sum, row) => sum + row.days, 0);
  if (positive.length) {
    for (const row of positive) rows[row.item.key].days += difference / positive.length;
  } else if (budget > 0) {
    const first = weights.find(row => row.days > 0);
    if (first) rows[first.item.key].days = budget;
  }
  return { rows, rawDays, missing };
}
