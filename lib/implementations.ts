export const IMPLEMENTATION_STATUSES = [
  "new",
  "assigned",
  "planned",
  "in_progress",
  "waiting_customer",
  "completed",
] as const;

export type ImplementationStatus = typeof IMPLEMENTATION_STATUSES[number];

export const IMPLEMENTATION_STATUS_LABELS: Record<ImplementationStatus, string> = {
  new: "Nieuw - nog toe te wijzen",
  assigned: "Toegewezen",
  planned: "Ingepland",
  in_progress: "In uitvoering",
  waiting_customer: "Wachten op klant",
  completed: "Afgerond",
};

export const IMPLEMENTATION_PROGRESS_ITEMS = [
  { number: 1, key: "confirmation", label: "Bevestiging" },
  { number: 3, key: "dnsInstructions", label: "DNS-instructies" },
  { number: 4, key: "newCustomerEmail", label: "Nieuwe klantmail" },
  { number: 5, key: "implementationOrder", label: "Implementatieorder" },
  { number: 6, key: "assets", label: "Assets" },
  { number: 7, key: "adminDemoDisabled", label: "Admintool - Demo uitschakelen" },
  { number: 8, key: "adminModules", label: "Admintool - Modules" },
  { number: 9, key: "adminUserCount", label: "Admintool - Aantal gebruikers" },
] as const;

export type ImplementationProgressKey = typeof IMPLEMENTATION_PROGRESS_ITEMS[number]["key"];
export type ImplementationProgress = Partial<Record<ImplementationProgressKey, boolean>>;

export function normalizeImplementationProgress(value: unknown): ImplementationProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const source = value as Record<string, unknown>;
  return IMPLEMENTATION_PROGRESS_ITEMS.reduce<ImplementationProgress>((progress, item) => {
    progress[item.key] = source[item.key] === true;
    return progress;
  }, {});
}

export type ImplementationRecord = {
  id: string;
  deal_id: string;
  customer_name: string;
  contact_name?: string | null;
  quote_title?: string | null;
  package_name?: string | null;
  implementation_total?: number | null;
  sales_name?: string | null;
  created_by?: string | null;
  assigned_consultant_id?: string | null;
  assigned_consultant_name?: string | null;
  assigned_consultant_email?: string | null;
  assigned_by?: string | null;
  assigned_at?: string | null;
  status: ImplementationStatus;
  notes?: string | null;
  progress?: ImplementationProgress | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export function isImplementationStatus(value: unknown): value is ImplementationStatus {
  return IMPLEMENTATION_STATUSES.includes(value as ImplementationStatus);
}
