import { canReadAllDeals, isLocalAdmin, type LocalUser } from "@/lib/local-auth";
import { query } from "@/lib/local-db";
import {
  normalizeImplementationCustomerWorkApprovals,
  normalizeImplementationWorkItemNotes,
} from "@/lib/implementations";
import { normalizeCustomerIntakeData } from "@/lib/customer-intake";
import { readLocalRoleTabAccess } from "@/lib/role-tab-access-storage";
import { getTabPermission } from "@/lib/role-tabs";
import type { ProfileRecord } from "@/lib/supabase";

const ACTIVITY_WINDOW_DAYS = 90;
const MAX_ACTIVITIES = 100;

export type CustomerActivity = {
  key: string;
  kind:
    | "customer_intake"
    | "deal_approval"
    | "worldline_return_pin"
    | "implementation_approval"
    | "implementation_note"
    | "implementation_file";
  title: string;
  customerName: string;
  detail: string;
  occurredAt: string;
  href: string;
};

type Actor = {
  user: LocalUser;
  profile: ProfileRecord;
};

type DealActivityRow = {
  id: string;
  deal_id: string;
  customer_name: string | null;
  owner_user_id: string;
  assigned_consultant_id: string | null;
  occurred_at: Date | string;
  form_data?: unknown;
  accepted_by_name?: string | null;
};

type WorldlineActivityRow = {
  id: string;
  project_id: string;
  relation_name: string;
  occurred_at: Date | string;
  accepted_by_name: string | null;
};

type ImplementationActivityRow = {
  id: string;
  customer_name: string;
  created_by: string | null;
  assigned_consultant_id: string | null;
  owner_user_id: string;
  approvals: unknown;
  notes: unknown;
};

type FileActivityRow = {
  id: string;
  implementation_id: string;
  customer_name: string;
  created_by: string | null;
  assigned_consultant_id: string | null;
  owner_user_id: string;
  file_name: string;
  category: "branding" | "relations" | "articles";
  event_type: "uploaded" | "deleted" | "checked" | "reopened";
  occurred_at: Date | string;
};

type AcknowledgementRow = {
  activity_key: string;
  seen_event_at: Date | string;
};

function isoString(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function canReadDealActivity(actor: Actor, row: DealActivityRow) {
  return (
    row.owner_user_id === actor.user.id ||
    row.assigned_consultant_id === actor.user.id ||
    canReadAllDeals(actor.profile.role) ||
    isLocalAdmin(actor.profile)
  );
}

function canReadImplementationActivity(
  actor: Actor,
  row: Pick<ImplementationActivityRow, "created_by" | "assigned_consultant_id" | "owner_user_id">,
) {
  return (
    row.created_by === actor.user.id ||
    row.assigned_consultant_id === actor.user.id ||
    row.owner_user_id === actor.user.id ||
    actor.profile.role === "manager" ||
    isLocalAdmin(actor.profile)
  );
}

function canReadWorldlineActivity(actor: Actor, permission: "none" | "read" | "write") {
  return (
    isLocalAdmin(actor.profile) ||
    permission !== "none"
  );
}

function fileCategoryLabel(category: FileActivityRow["category"]) {
  if (category === "branding") return "Briefpapier en logo";
  if (category === "relations") return "Relaties";
  return "Artikelen";
}

export async function listCustomerActivities(actor: Actor) {
  const since = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [intakeResult, approvalResult, worldlineResult, implementationResult, fileResult, acknowledgementResult, roleTabAccess] = await Promise.all([
    query<DealActivityRow>(
      `select ci.id, ci.deal_id, d.customer_name, d.user_id as owner_user_id,
              i.assigned_consultant_id, ci.submitted_at as occurred_at, ci.form_data
       from public.customer_intakes ci
       join public.deals d on d.id = ci.deal_id
       left join public.implementations i on i.deal_id = d.id
       where ci.submitted_at is not null
         and ci.submitted_at >= $1
       order by ci.submitted_at desc
       limit $2`,
      [since, MAX_ACTIVITIES],
    ),
    query<DealActivityRow>(
      `select da.id, da.deal_id, d.customer_name, d.user_id as owner_user_id,
              i.assigned_consultant_id, da.accepted_at as occurred_at,
              da.accepted_by_name
       from public.deal_approvals da
       join public.deals d on d.id = da.deal_id
       left join public.implementations i on i.deal_id = d.id
       where da.status = 'accepted'
         and da.accepted_at is not null
         and da.accepted_at >= $1
       order by da.accepted_at desc
       limit $2`,
      [since, MAX_ACTIVITIES],
    ),
    query<WorldlineActivityRow>(
      `select form.id, form.project_id, project.relation_name,
              form.accepted_at as occurred_at, form.accepted_by_name
       from public.worldline_return_pin_forms form
       join public.worldline_projects project on project.id = form.project_id
       where form.status = 'accepted'
         and form.accepted_at is not null
         and form.accepted_at >= $1
       order by form.accepted_at desc
       limit $2`,
      [since, MAX_ACTIVITIES],
    ),
    query<ImplementationActivityRow>(
      `select i.id, i.customer_name, i.created_by, i.assigned_consultant_id,
              d.user_id as owner_user_id,
              i.implementation_customer_work_approvals as approvals,
              i.implementation_work_item_notes as notes
       from public.implementations i
       join public.deals d on d.id = i.deal_id
       where i.updated_at >= $1
       order by i.updated_at desc
       limit $2`,
      [since, MAX_ACTIVITIES],
    ),
    query<FileActivityRow>(
      `select event.id, event.implementation_id, i.customer_name, i.created_by,
              i.assigned_consultant_id, d.user_id as owner_user_id,
              event.file_name, event.category, event.event_type,
              event.created_at as occurred_at
       from public.implementation_customer_file_events event
       join public.implementations i on i.id = event.implementation_id
       join public.deals d on d.id = i.deal_id
       where event.actor_type = 'customer'
         and event.event_type in ('uploaded', 'deleted')
         and event.created_at >= $1
       order by event.created_at desc
       limit $2`,
      [since, MAX_ACTIVITIES],
    ),
    query<AcknowledgementRow>(
      `select activity_key, seen_event_at
       from public.customer_activity_acknowledgements
       where user_id = $1`,
      [actor.user.id],
    ),
    readLocalRoleTabAccess(),
  ]);

  const activities: CustomerActivity[] = [];

  for (const row of intakeResult.rows) {
    if (!canReadDealActivity(actor, row)) continue;
    const formData = normalizeCustomerIntakeData(row.form_data);
    const occurredAt = isoString(row.occurred_at);
    if (!occurredAt) continue;
    activities.push({
      key: `customer-intake:${row.id}`,
      kind: "customer_intake",
      title: "Klantformulier opgeslagen",
      customerName: row.customer_name || formData.deliveryName || "Onbekende klant",
      detail: "De klant heeft het klantformulier ingevuld en opgeslagen.",
      occurredAt,
      href: `/deals/${row.deal_id}`,
    });
  }

  for (const row of approvalResult.rows) {
    if (!canReadDealActivity(actor, row)) continue;
    const occurredAt = isoString(row.occurred_at);
    if (!occurredAt) continue;
    activities.push({
      key: `deal-approval:${row.id}`,
      kind: "deal_approval",
      title: "Offerte online geaccepteerd",
      customerName: row.customer_name || "Onbekende klant",
      detail: row.accepted_by_name
        ? `Akkoord gegeven door ${row.accepted_by_name}.`
        : "De klant heeft de offerte online geaccepteerd.",
      occurredAt,
      href: `/deals/${row.deal_id}`,
    });
  }

  if (canReadWorldlineActivity(
    actor,
    getTabPermission(actor.profile.role, "worldline", roleTabAccess),
  )) {
    for (const row of worldlineResult.rows) {
      const occurredAt = isoString(row.occurred_at);
      if (!occurredAt) continue;
      activities.push({
        key: `worldline-return-pin:${row.id}`,
        kind: "worldline_return_pin",
        title: "Refundformulier opgeslagen",
        customerName: row.relation_name || "Onbekende relatie",
        detail: row.accepted_by_name
          ? `Het retourpinnenformulier is goedgekeurd door ${row.accepted_by_name}.`
          : "De klant heeft het retourpinnenformulier ingevuld en goedgekeurd.",
        occurredAt,
        href: `/worldline?project=${encodeURIComponent(row.project_id)}`,
      });
    }
  }

  for (const row of implementationResult.rows) {
    if (!canReadImplementationActivity(actor, row)) continue;

    for (const approval of Object.values(normalizeImplementationCustomerWorkApprovals(row.approvals))) {
      const occurredAt = isoString(approval.approvedAt);
      if (!occurredAt || new Date(occurredAt) < since) continue;
      activities.push({
        key: `implementation-approval:${row.id}:${approval.workItemKey}`,
        kind: "implementation_approval",
        title: "Werkzaamheid door klant geaccepteerd",
        customerName: row.customer_name || "Onbekende klant",
        detail: approval.workItemLabel,
        occurredAt,
        href: `/implementatie/${row.id}`,
      });
    }

    for (const [workItemKey, noteSet] of Object.entries(normalizeImplementationWorkItemNotes(row.notes))) {
      const note = noteSet.customer;
      if (!note) continue;
      const occurredAt = isoString(note.updatedAt);
      if (!occurredAt || new Date(occurredAt) < since) continue;
      activities.push({
        key: `implementation-note:${row.id}:${workItemKey}`,
        kind: "implementation_note",
        title: "Klantopmerking opgeslagen",
        customerName: row.customer_name || "Onbekende klant",
        detail: note.text,
        occurredAt,
        href: `/implementatie/${row.id}`,
      });
    }
  }

  for (const row of fileResult.rows) {
    if (!canReadImplementationActivity(actor, row)) continue;
    const occurredAt = isoString(row.occurred_at);
    if (!occurredAt) continue;
    activities.push({
      key: `implementation-file:${row.id}`,
      kind: "implementation_file",
      title: row.event_type === "deleted" ? "Klantbestand verwijderd" : "Klantbestand aangeleverd",
      customerName: row.customer_name || "Onbekende klant",
      detail: `${fileCategoryLabel(row.category)}: ${row.file_name}`,
      occurredAt,
      href: `/implementatie/${row.implementation_id}`,
    });
  }

  const seenByKey = new Map(
    acknowledgementResult.rows.map((row) => [row.activity_key, isoString(row.seen_event_at)]),
  );

  return activities
    .filter((activity) => {
      const seenAt = seenByKey.get(activity.key);
      return !seenAt || new Date(activity.occurredAt).getTime() > new Date(seenAt).getTime();
    })
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, MAX_ACTIVITIES);
}

export async function acknowledgeCustomerActivities(
  userId: string,
  activities: Array<Pick<CustomerActivity, "key" | "occurredAt">>,
) {
  const normalized = activities
    .map((activity) => ({
      key: activity.key.trim().slice(0, 500),
      occurredAt: isoString(activity.occurredAt),
    }))
    .filter((activity) => activity.key && activity.occurredAt)
    .slice(0, MAX_ACTIVITIES);

  await Promise.all(normalized.map((activity) => query(
    `insert into public.customer_activity_acknowledgements
       (user_id, activity_key, seen_event_at)
     values ($1, $2, $3)
     on conflict (user_id, activity_key) do update
       set seen_event_at = greatest(
             public.customer_activity_acknowledgements.seen_event_at,
             excluded.seen_event_at
           ),
           updated_at = now()`,
    [userId, activity.key, activity.occurredAt],
  )));
}
