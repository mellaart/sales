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
  created_at?: string | null;
  updated_at?: string | null;
};

export function isImplementationStatus(value: unknown): value is ImplementationStatus {
  return IMPLEMENTATION_STATUSES.includes(value as ImplementationStatus);
}
