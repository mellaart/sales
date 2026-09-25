import { query } from "@/lib/local-db";
import { getServiceClient } from "@/lib/admin-api";
import { readStoredPricingConfig } from "@/lib/price-settings-storage";
import { getImplementationItems } from "@/lib/implementation-items";
import { normalizeImplementationCustomWorkItems, normalizeImplementationItemProgress, normalizeImplementationCustomerWorkApprovals } from "@/lib/implementations";
import { getConfiguredImplementationTasks, withConfiguredWorkItems, withImplementationCustomWorkItems } from "@/lib/work-activities";
import { approvedDays, validateBudgetRows, type BudgetRow } from "@/lib/implementation-planning";
import { estimateImplementation, selectedEstimateItems } from "@/lib/implementation-estimates";
import { getImplementationHoursPerDay } from "@/lib/implementation-settings";

// The caller must first authorize access to the implementation/customer link.
export async function getImplementationBudgetState(implementationId: string) {
  const [recordResult, settings, { pricingConfig }, hoursPerDay] = await Promise.all([
    query<{ accepted_at: string | null; calculator_inputs: Record<string, unknown>; modules: unknown;
      implementation_item_progress: unknown; implementation_custom_work_items: unknown; implementation_customer_work_approvals: unknown }>(
      `select d.accepted_at,d.calculator_inputs,d.modules,i.implementation_item_progress,
       i.implementation_custom_work_items,i.implementation_customer_work_approvals
       from public.implementations i join public.deals d on d.id=i.deal_id where i.id=$1`, [implementationId]),
    query<{ key: string; payload: { rows?: Record<string, BudgetRow>; version?: string; ticketId?: string } }>(
      "select key,payload from public.app_settings where key=any($1::text[])",
      [[`implementation-budget:${implementationId}`, `implementation-ticket:${implementationId}`]]),
    readStoredPricingConfig(getServiceClient()),
    getImplementationHoursPerDay(),
  ]);
  const record = recordResult.rows[0];
  const budget = approvedDays(record ?? {});
  const progress = normalizeImplementationItemProgress(record?.implementation_item_progress);
  const custom = normalizeImplementationCustomWorkItems(record?.implementation_custom_work_items);
  const configured = [
    ...getConfiguredImplementationTasks(pricingConfig, custom),
    ...(record ? getImplementationItems(record).map(item => withImplementationCustomWorkItems(withConfiguredWorkItems(item, pricingConfig), custom)) : []),
  ];
  const items = selectedEstimateItems(configured, progress, pricingConfig);
  const saved = settings.rows.find(row => row.key === `implementation-budget:${implementationId}`)?.payload;
  const estimate = estimateImplementation(items, budget, saved?.rows, hoursPerDay);
  const keys = new Set(items.map(item => item.key));
  const savedRows = Object.fromEntries(Object.entries(saved?.rows ?? {}).filter(([key]) => keys.has(key)));
  const removedRows = Object.keys(saved?.rows ?? {}).some(key => !keys.has(key));
  // Preserve valid manual budgets. Reallocate if old rows contained extra
  // text activities, which are no longer part of the hours budget.
  const hasSavedHours = !removedRows && items.every(item => Object.hasOwn(savedRows, item.key))
    && Object.values(savedRows).some(row => row.days > 0);
  const rows = hasSavedHours ? savedRows : estimate.rows ?? savedRows;
  const allocationComplete = budget !== null && validateBudgetRows(rows, budget)
    && items.length === Object.keys(rows).length && items.every(item => Object.hasOwn(rows, item.key));
  return { budget, rows, items, version: saved?.version ?? null, automatic: !hasSavedHours,
    allocationComplete,
    hoursPerDay, approvals: normalizeImplementationCustomerWorkApprovals(record?.implementation_customer_work_approvals),
    estimateDays: estimate.rawDays, missingStandards: estimate.missing,
    ticketId: settings.rows.find(row => row.key === `implementation-ticket:${implementationId}`)?.payload.ticketId };
}
