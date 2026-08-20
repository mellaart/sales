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
  { number: 2, key: "dnsInstructions", label: "DNS-instructies" },
  { number: 3, key: "newCustomerEmail", label: "Nieuwe klantmail" },
  { number: 4, key: "implementationOrder", label: "Implementatieorder" },
  { number: 5, key: "assets", label: "Assets" },
  { number: 6, key: "stats", label: "Stats" },
  { number: 7, key: "adminDemoDisabled", label: "Admintool - Demo uitschakelen" },
  { number: 8, key: "adminModules", label: "Admintool - Modules" },
  { number: 9, key: "adminUserCount", label: "Admintool - Aantal gebruikers" },
  { number: 10, key: "implementationStartInvoice", label: "Factuur start implementatie" },
  { number: 11, key: "implementationStartContract", label: "Contract implementatie starten" },
  { number: 12, key: "implementationEndInvoice", label: "Factuur einde implementatie" },
  { number: 13, key: "goLiveContract", label: "Contract livegang starten" },
] as const;

export type ImplementationProgressKey = typeof IMPLEMENTATION_PROGRESS_ITEMS[number]["key"];
export type ImplementationProgress = Partial<Record<ImplementationProgressKey, boolean>>;
export type ImplementationItemProgress = Record<string, boolean>;
export type ImplementationCustomWorkItems = Record<string, string[]>;
export type ImplementationCustomerWorkApproval = {
  workItemKey: string;
  itemKey: string;
  itemLabel: string;
  workItemLabel: string;
  approvedAt: string;
  accessId: string;
};
export type ImplementationCustomerWorkApprovals = Record<
  string,
  ImplementationCustomerWorkApproval
>;
export type ImplementationWorkItemNote = {
  text: string;
  updatedAt: string;
  authorName: string;
};
export type ImplementationWorkItemNoteSet = {
  consultant?: ImplementationWorkItemNote;
  customer?: ImplementationWorkItemNote;
};
export type ImplementationWorkItemNotes = Record<string, ImplementationWorkItemNoteSet>;

export function normalizeImplementationProgress(value: unknown): ImplementationProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const source = value as Record<string, unknown>;
  return IMPLEMENTATION_PROGRESS_ITEMS.reduce<ImplementationProgress>((progress, item) => {
    progress[item.key] = source[item.key] === true;
    return progress;
  }, {});
}

export function normalizeImplementationItemProgress(value: unknown): ImplementationItemProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value as Record<string, unknown>).reduce<ImplementationItemProgress>(
    (progress, [key, completed]) => {
      progress[key] = completed === true;
      return progress;
    },
    {},
  );
}

export function normalizeImplementationCustomWorkItems(
  value: unknown,
): ImplementationCustomWorkItems {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return {};
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  return Object.entries(source as Record<string, unknown>).reduce<ImplementationCustomWorkItems>(
    (result, [rawKey, rawItems]) => {
      const key = rawKey.trim().slice(0, 180);
      if (!key || !Array.isArray(rawItems)) return result;

      const seen = new Set<string>();
      const items = rawItems.reduce<string[]>((labels, rawItem) => {
        if (typeof rawItem !== "string") return labels;
        const label = rawItem.trim().replace(/\s+/g, " ").slice(0, 300);
        const normalizedLabel = label.toLocaleLowerCase("nl-NL");
        if (!label || seen.has(normalizedLabel) || labels.length >= 50) return labels;
        seen.add(normalizedLabel);
        labels.push(label);
        return labels;
      }, []);

      if (items.length > 0) result[key] = items;
      return result;
    },
    {},
  );
}

export function normalizeImplementationCustomerWorkApprovals(
  value: unknown,
): ImplementationCustomerWorkApprovals {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return {};
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  return Object.entries(source as Record<string, unknown>).reduce<ImplementationCustomerWorkApprovals>(
    (result, [rawKey, rawApproval]) => {
      if (!rawApproval || typeof rawApproval !== "object" || Array.isArray(rawApproval)) return result;
      const approval = rawApproval as Record<string, unknown>;
      const workItemKey = (typeof approval.workItemKey === "string" ? approval.workItemKey : rawKey)
        .trim()
        .slice(0, 240);
      const itemKey = typeof approval.itemKey === "string" ? approval.itemKey.trim().slice(0, 180) : "";
      const itemLabel = typeof approval.itemLabel === "string"
        ? approval.itemLabel.trim().slice(0, 300)
        : "";
      const workItemLabel = typeof approval.workItemLabel === "string"
        ? approval.workItemLabel.trim().slice(0, 300)
        : "";
      const approvedAt = typeof approval.approvedAt === "string" ? approval.approvedAt.trim() : "";
      const accessId = typeof approval.accessId === "string" ? approval.accessId.trim().slice(0, 80) : "";

      if (!workItemKey || !itemKey || !workItemLabel || Number.isNaN(new Date(approvedAt).getTime())) {
        return result;
      }
      result[workItemKey] = {
        workItemKey,
        itemKey,
        itemLabel,
        workItemLabel,
        approvedAt,
        accessId,
      };
      return result;
    },
    {},
  );
}

export function normalizeImplementationWorkItemNotes(
  value: unknown,
): ImplementationWorkItemNotes {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return {};
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  return Object.entries(source as Record<string, unknown>).reduce<ImplementationWorkItemNotes>(
    (result, [rawKey, rawNoteSet]) => {
      const key = rawKey.trim().slice(0, 240);
      if (!key || !rawNoteSet || typeof rawNoteSet !== "object" || Array.isArray(rawNoteSet)) {
        return result;
      }

      const noteSet = rawNoteSet as Record<string, unknown>;
      const normalized: ImplementationWorkItemNoteSet = {};
      for (const role of ["consultant", "customer"] as const) {
        const rawNote = noteSet[role];
        if (!rawNote || typeof rawNote !== "object" || Array.isArray(rawNote)) continue;
        const note = rawNote as Record<string, unknown>;
        const text = typeof note.text === "string"
          ? note.text.replace(/\r\n?/g, "\n").trim().slice(0, 2000)
          : "";
        const updatedAt = typeof note.updatedAt === "string" ? note.updatedAt.trim() : "";
        const authorName = typeof note.authorName === "string"
          ? note.authorName.trim().slice(0, 200)
          : "";
        if (!text || Number.isNaN(new Date(updatedAt).getTime())) continue;
        normalized[role] = {
          text,
          updatedAt,
          authorName: authorName || (role === "consultant" ? "Consultant" : "Klant"),
        };
      }

      if (normalized.consultant || normalized.customer) result[key] = normalized;
      return result;
    },
    {},
  );
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
  implementation_item_progress?: ImplementationItemProgress | null;
  implementation_custom_work_items?: ImplementationCustomWorkItems | null;
  implementation_customer_work_approvals?: ImplementationCustomerWorkApprovals | null;
  implementation_work_item_notes?: ImplementationWorkItemNotes | null;
  administration_name?: string | null;
  implementation_start_date?: string | null;
  planned_go_live_date?: string | null;
  actual_go_live_date?: string | null;
  financial_package?: string | null;
  website_webshop?: string | null;
  dns_domain?: string | null;
  smart_trade_order_id?: string | null;
  smart_trade_order_created_at?: string | null;
  smart_trade_order_pending_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export function isImplementationStatus(value: unknown): value is ImplementationStatus {
  return IMPLEMENTATION_STATUSES.includes(value as ImplementationStatus);
}

export function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getImplementationDateKey(value: string | null | undefined) {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}
