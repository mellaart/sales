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
  // Standards are absolute hours (stored as days), never weights to scale
  // to the offer. Any remaining offer budget stays visibly unallocated.
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) return { rows: null, rawDays, missing };
  const rows: Record<string, BudgetRow> = Object.fromEntries(known.map(({ item, quantity, days }) => [item.key, {
    days, quantity, started: previous[item.key]?.started ?? item.started,
  }]));
  for (const { item } of weights.filter(row => row.item.days === null)) {
    const manual = previous[item.key];
    if (manual && Number.isFinite(manual.days) && manual.days >= 0) rows[item.key] = manual;
  }
  return { rows: items.length ? rows : null, rawDays, missing };
}
