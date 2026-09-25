import type { ActivityBudget, EditablePricingConfig } from "@/lib/price-config";
import type { ImplementationItem } from "@/lib/implementation-items";
import type { BudgetRow } from "@/lib/implementation-planning";
import { getImplementationWorkItemProgressKey, getImplementationWorkItemStatuses, getImplementationWorkItems, isImplementationItemSelected } from "@/lib/work-activities";

export type EstimateItem = { key: string; label: string; days: number | null; unit: string; started: boolean };

// All customer portal variants share the activities configured in Admin.
export function activityBudgetKey(itemKey: string, label: string) {
  const group = itemKey.startsWith("customer-portal:") ? "customer-portal" : itemKey;
  return getImplementationWorkItemProgressKey(group, label);
}

export function selectedEstimateItems(items: ImplementationItem[], progress: Record<string, boolean>, config: EditablePricingConfig): EstimateItem[] {
  return items.filter(item => isImplementationItemSelected(item, progress)).flatMap(item => {
    const configuredLabels = item.key.startsWith("task:")
      ? config.implementationTasks.find(task => `task:${task.key}` === item.key)?.workItems.map(row => row.label) ?? []
      : getImplementationWorkItems(config, item.key);
    const configuredKeys = new Set(configuredLabels.map(label => getImplementationWorkItemProgressKey(item.key, label)));
    // Extra implementation activities are notes, not budgeted work.
    const work = getImplementationWorkItemStatuses(item, progress).filter(row => row.selected && configuredKeys.has(row.key));
    return work.map(row => {
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
  const known = weights.filter(row => row.item.days !== null);
  const knownDays = known.reduce((sum, row) => sum + row.days, 0);
  const rawDays = missing.length ? null : knownDays;
  // Fill known activities even when one custom activity has no standard, or
  // an old offer lacks a verifiable budget. Missing is never a confirmed zero.
  if (budget === null) return { rows: Object.fromEntries(known.map(({item,quantity,days}) => [item.key, {
    days, quantity, started: previous[item.key]?.started ?? item.started,
  }])), rawDays, missing };
  if (!Number.isFinite(budget) || budget < 0 || !items.length || (knownDays === 0 && budget > 0)) {
    return { rows: null, rawDays, missing };
  }
  const manual = weights.filter(row => row.item.days === null && previous[row.item.key] !== undefined);
  const reservedDays = manual.reduce((sum, row) => sum + previous[row.item.key].days, 0);
  if (!Number.isFinite(reservedDays) || reservedDays < 0 || reservedDays > budget) return { rows: null, rawDays, missing };
  const remainingBudget = budget - reservedDays;
  // Allocate in hundredths of an hour, so displayed/editable hours reconcile.
  const units = Math.round(remainingBudget * hoursPerDay * 100);
  const shares = known.map(row => knownDays ? units * row.days / knownDays : 0);
  const rounded = shares.map(Math.floor);
  const order = shares.map((value, index) => ({ index, fraction: value - rounded[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  const remainder = units - rounded.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < remainder; i++) rounded[order[i % order.length].index]++;
  const rows: Record<string, BudgetRow> = Object.fromEntries(known.map(({ item, quantity }, index) => [item.key, {
    days: rounded[index] / 100 / hoursPerDay,
    started: previous[item.key]?.started ?? item.started,
    quantity,
  }]));
  // Some day budgets equal a fractional hundredth of an hour. Keep that
  // precision without concentrating the rounding correction in one activity.
  const positive = known.filter(row => rows[row.item.key].days > 0);
  const difference = remainingBudget - Object.values(rows).reduce((sum, row) => sum + row.days, 0);
  if (positive.length) {
    for (const row of positive) rows[row.item.key].days += difference / positive.length;
  } else if (remainingBudget > 0) {
    const first = known.find(row => row.days > 0);
    if (first) rows[first.item.key].days = remainingBudget;
  }
  for (const row of manual) rows[row.item.key] = previous[row.item.key];
  return { rows, rawDays, missing };
}
