import { createHmac, timingSafeEqual } from "node:crypto";
import {
  requireImplementationAccess,
  type ImplementationActor,
} from "@/lib/implementation-access";
import { normalizeCustomerIntakeData } from "@/lib/customer-intake";
import {
  checkImplementationDns,
  implementationWebsiteDomain,
  type ImplementationDnsCheck,
} from "@/lib/implementation-dns";
import { getImplementationItems, type ImplementationItem } from "@/lib/implementation-items";
import { listImplementationCustomerFiles } from "@/lib/implementation-files-server";
import {
  isImplementationAppointmentStatus,
  isImplementationAppointmentType,
  type ImplementationAppointment,
  type ImplementationAppointmentStatus,
  type ImplementationAppointmentType,
  type ImplementationAppointmentWorkItem,
  type ImplementationPortalAccess,
  type PublicImplementationItem,
  type PublicImplementationPortal,
} from "@/lib/implementation-portal";
import {
  IMPLEMENTATION_STATUS_LABELS,
  normalizeImplementationCustomWorkItems,
  normalizeImplementationCustomerWorkApprovals,
  normalizeImplementationItemProgress,
  normalizeImplementationWorkItemNotes,
  type ImplementationCustomerWorkApproval,
  type ImplementationStatus,
  type ImplementationWorkItemNote,
  type ImplementationWorkItemNotes,
} from "@/lib/implementations";
import { createId, query } from "@/lib/local-db";
import { getServiceClient } from "@/lib/admin-api";
import type { EditablePricingConfig } from "@/lib/price-config";
import { readStoredPricingConfig } from "@/lib/price-settings-storage";
import {
  getConfiguredImplementationTasks,
  getImplementationWorkItemStatuses,
  isImplementationItemCompleted,
  isImplementationItemSelected,
  withImplementationCustomWorkItems,
  withConfiguredWorkItems,
} from "@/lib/work-activities";

const IMPLEMENTATION_PORTAL_TTL_DAYS = 365;

type PortalAccessRow = {
  id: string;
  implementation_id: string;
  token_version: number;
  expires_at: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type AppointmentRow = {
  id: string;
  implementation_id: string;
  appointment_date: string;
  start_time: string | null;
  end_time: string | null;
  appointment_type: ImplementationAppointmentType;
  title: string;
  customer_note: string | null;
  work_items: unknown;
  status: ImplementationAppointmentStatus;
  created_by: string | null;
  outlook_event_id: string | null;
  outlook_user_id: string | null;
  outlook_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

type PortalImplementationRow = {
  deal_id: string;
  customer_name: string;
  quote_title: string | null;
  package_name: string | null;
  status: ImplementationStatus;
  assigned_consultant_name: string | null;
  assigned_consultant_email: string | null;
  implementation_start_date: string | null;
  planned_go_live_date: string | null;
  actual_go_live_date: string | null;
  dns_domain: string | null;
  progress: unknown;
  implementation_item_progress: unknown;
  implementation_custom_work_items: unknown;
  implementation_customer_work_approvals: unknown;
  implementation_work_item_notes: unknown;
  updated_at: string;
};

type PortalDealRow = {
  modules: unknown;
  calculator_inputs: unknown;
};

type AppointmentInput = {
  appointmentDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  appointmentType?: unknown;
  title?: unknown;
  customerNote?: unknown;
  workItems?: unknown;
  status?: unknown;
};

function signingKey() {
  const key = (
    process.env.SALES_CUSTOMER_FORM_SIGNING_KEY ||
    process.env.SALES_2FA_ENCRYPTION_KEY ||
    ""
  ).trim();

  if (!key) {
    throw new Error(
      "Sleutel voor de klantpagina ontbreekt. Voeg SALES_CUSTOMER_FORM_SIGNING_KEY toe aan .env.local.",
    );
  }
  return key;
}

function signaturePayload(id: string, tokenVersion: number) {
  return `smart-trade-implementation-portal:${id}:${tokenVersion}`;
}

function signImplementationPortal(id: string, tokenVersion: number) {
  return createHmac("sha256", signingKey())
    .update(signaturePayload(id, tokenVersion))
    .digest("base64url");
}

function verifyImplementationPortalToken(id: string, tokenVersion: number, token: string) {
  if (!token || !Number.isInteger(tokenVersion) || tokenVersion < 1) return false;

  const expected = Buffer.from(signImplementationPortal(id, tokenVersion));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function normalizeOrigin(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const url = new URL(request.url);
  const host = forwardedHost || request.headers.get("host") || url.host;
  const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const protocol = process.env.NODE_ENV === "production" && !isLocalHost
    ? "https"
    : forwardedProto || url.protocol.replace(":", "") || "https";
  return `${protocol}://${host}`;
}

function publicUrl(request: Request, row: Pick<PortalAccessRow, "id" | "token_version">) {
  const url = new URL(`/implementatie-volgen/${row.id}`, normalizeOrigin(request));
  url.searchParams.set("v", String(row.token_version));
  url.searchParams.set("token", signImplementationPortal(row.id, row.token_version));
  return url.toString();
}

function accessIsActive(row: PortalAccessRow) {
  return !row.revoked_at && new Date(row.expires_at).getTime() > Date.now();
}

async function verifiedPortalAccess(
  accessId: string,
  tokenVersion: number,
  token: string,
) {
  const { rows } = await query<PortalAccessRow>(
    `select *
     from public.implementation_customer_access
     where id = $1 and token_version = $2
     limit 1`,
    [accessId, tokenVersion],
  );
  const access = rows[0];
  if (
    !access ||
    !accessIsActive(access) ||
    !verifyImplementationPortalToken(accessId, tokenVersion, token)
  ) {
    return null;
  }
  return access;
}

export async function getVerifiedImplementationPortalAccess(
  accessId: string,
  tokenVersion: number,
  token: string,
) {
  const access = await verifiedPortalAccess(accessId, tokenVersion, token);
  if (!access) return null;
  return {
    id: access.id,
    implementationId: access.implementation_id,
  };
}

function publicImplementationItem(
  item: ImplementationItem,
  itemProgress: Record<string, boolean>,
  approvals: ReturnType<typeof normalizeImplementationCustomerWorkApprovals>,
  notes: ImplementationWorkItemNotes,
  scheduledWorkItemKeys: ReadonlySet<string>,
): PublicImplementationItem {
  const workItems = getImplementationWorkItemStatuses(item, itemProgress).map((workItem) => ({
    ...workItem,
    selected: workItem.selected || scheduledWorkItemKeys.has(workItem.key),
    customerApprovedAt: approvals[workItem.key]?.approvedAt ?? null,
    notes: notes[workItem.key] ?? {},
  }));
  const selectedWorkItems = workItems.filter((workItem) => workItem.selected);

  return {
    ...item,
    selected: workItems.length > 0
      ? selectedWorkItems.length > 0
      : isImplementationItemSelected(item, itemProgress) || scheduledWorkItemKeys.has(item.key),
    customerApprovedAt: workItems.length === 0 ? approvals[item.key]?.approvedAt ?? null : null,
    notes: notes[item.key] ?? {},
    workItems,
    completed: workItems.length > 0
      ? selectedWorkItems.length > 0 && selectedWorkItems.every((workItem) => workItem.completed)
      : isImplementationItemCompleted(item, itemProgress),
  };
}

function visiblePublicImplementationItem(item: PublicImplementationItem) {
  if (item.workItems.length > 0) {
    const visibleWorkItems = item.workItems.filter((workItem) => (
      workItem.selected || Boolean(workItem.customerApprovedAt) ||
      Boolean(workItem.notes.consultant) || Boolean(workItem.notes.customer)
    ));
    if (visibleWorkItems.length === 0) return null;

    return {
      ...item,
      selected: true,
      workItems: visibleWorkItems,
      completed: visibleWorkItems.every((workItem) => workItem.completed),
    };
  }

  if (
    !item.selected && !item.customerApprovedAt &&
    !item.notes.consultant && !item.notes.customer
  ) return null;
  return item;
}

function publicImplementationItems(
  deal: PortalDealRow | undefined,
  pricingConfig: EditablePricingConfig,
  itemProgressValue: unknown,
  customWorkItemsValue: unknown,
  approvalsValue: unknown,
  notesValue: unknown,
  scheduledWorkItemKeys: ReadonlySet<string> = new Set<string>(),
) {
  const itemProgress = normalizeImplementationItemProgress(itemProgressValue);
  const customWorkItems = normalizeImplementationCustomWorkItems(customWorkItemsValue);
  const approvals = normalizeImplementationCustomerWorkApprovals(approvalsValue);
  const notes = normalizeImplementationWorkItemNotes(notesValue);
  const items = deal
    ? getImplementationItems(deal).map((item) => {
      const configuredItem = withImplementationCustomWorkItems(
        withConfiguredWorkItems(item, pricingConfig),
        customWorkItems,
      );
      return publicImplementationItem(
        configuredItem.key === "planning-app"
          ? { ...configuredItem, label: "Planningsapp" }
          : configuredItem,
        itemProgress,
        approvals,
        notes,
        scheduledWorkItemKeys,
      );
    }).flatMap((item) => {
      const visibleItem = visiblePublicImplementationItem(item);
      return visibleItem ? [visibleItem] : [];
    })
    : [];
  const tasks = getConfiguredImplementationTasks(pricingConfig, customWorkItems).flatMap((task) => {
    const publicTask = publicImplementationItem(
      task,
      itemProgress,
      approvals,
      notes,
      scheduledWorkItemKeys,
    );
    const visibleTask = visiblePublicImplementationItem(publicTask);
    return visibleTask ? [visibleTask] : [];
  });

  return { tasks, items };
}

function publicWorkItemCandidates(tasks: PublicImplementationItem[], items: PublicImplementationItem[]) {
  return [...tasks, ...items].flatMap((item) => (
    item.workItems.length > 0
      ? item.workItems.map((workItem) => ({
        key: workItem.key,
        itemKey: item.key,
        itemLabel: item.label,
        label: workItem.label,
        completed: workItem.completed,
      }))
      : [{
        key: item.key,
        itemKey: item.key,
        itemLabel: item.label,
        label: item.label,
        completed: item.completed,
      }]
  ));
}

function normalizeWorkItemNoteInput(requestedWorkItemKey: string, requestedText: string) {
  const workItemKey = requestedWorkItemKey.trim().slice(0, 240);
  if (!workItemKey) throw new Error("Kies een geldige werkzaamheid.");
  const text = requestedText.replace(/\r\n?/g, "\n").trim().slice(0, 2000);
  return { workItemKey, text };
}

async function persistImplementationWorkItemNote(
  implementationId: string,
  workItemKey: string,
  role: "consultant" | "customer",
  text: string,
  authorName: string,
) {
  const note: ImplementationWorkItemNote | null = text
    ? {
      text,
      updatedAt: new Date().toISOString(),
      authorName: authorName.trim().slice(0, 200) || (role === "consultant" ? "Consultant" : "Klant"),
    }
    : null;
  const { rows } = await query<{ implementation_work_item_notes: unknown }>(
    note
      ? `update public.implementations
         set implementation_work_item_notes = jsonb_set(
               coalesce(implementation_work_item_notes, '{}'::jsonb),
               array[$2]::text[],
               coalesce(implementation_work_item_notes -> ($2::text), '{}'::jsonb) ||
                 jsonb_build_object($3::text, $4::jsonb),
               true
             ),
             updated_at = now()
         where id = $1
         returning implementation_work_item_notes`
      : `update public.implementations
         set implementation_work_item_notes =
               coalesce(implementation_work_item_notes, '{}'::jsonb) #- array[$2, $3]::text[],
             updated_at = now()
         where id = $1
         returning implementation_work_item_notes`,
    note
      ? [implementationId, workItemKey, role, JSON.stringify(note)]
      : [implementationId, workItemKey, role],
  );
  if (!rows[0]) throw new Error("De opmerking kon niet worden opgeslagen.");
  return normalizeImplementationWorkItemNotes(rows[0].implementation_work_item_notes);
}

export async function saveConsultantImplementationWorkItemNote(
  implementationId: string,
  actor: ImplementationActor,
  requestedWorkItemKey: string,
  requestedText: string,
) {
  const access = await requireImplementationAccess(implementationId, actor, "write");
  if (!access.ok) return access;

  let normalized: ReturnType<typeof normalizeWorkItemNoteInput>;
  try {
    normalized = normalizeWorkItemNoteInput(requestedWorkItemKey, requestedText);
  } catch (error) {
    return {
      ok: false as const,
      status: 400,
      error: error instanceof Error ? error.message : "Ongeldige opmerking.",
    };
  }

  const notes = await persistImplementationWorkItemNote(
    implementationId,
    normalized.workItemKey,
    "consultant",
    normalized.text,
    actor.profile.full_name || actor.user.email || "Consultant",
  );
  return {
    ok: true as const,
    notes,
    noteSet: notes[normalized.workItemKey] ?? {},
  };
}

function toAccess(request: Request, row: PortalAccessRow): ImplementationPortalAccess {
  return {
    id: row.id,
    implementationId: row.implementation_id,
    publicUrl: publicUrl(request, row),
    active: accessIsActive(row),
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastViewedAt: row.last_viewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function timeValue(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

function toAppointment(row: AppointmentRow): ImplementationAppointment {
  return {
    id: row.id,
    implementationId: row.implementation_id,
    appointmentDate: row.appointment_date.slice(0, 10),
    startTime: timeValue(row.start_time),
    endTime: timeValue(row.end_time),
    appointmentType: row.appointment_type,
    title: row.title,
    customerNote: row.customer_note ?? "",
    workItems: normalizeAppointmentWorkItems(row.work_items),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeAppointmentWorkItems(value: unknown): ImplementationAppointmentWorkItem[] {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source) as unknown;
    } catch {
      source = [];
    }
  }
  if (!Array.isArray(source)) return [];

  const seen = new Set<string>();
  return source.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const key = textValue(row.key, 240);
    const group = textValue(row.group, 180);
    const label = textValue(row.label, 300);
    if (!key || !label || seen.has(key)) return [];
    seen.add(key);
    return [{ key, group, label }];
  }).slice(0, 150);
}

function requiredDate(value: unknown) {
  const date = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Kies een geldige datum.");
  return date;
}

function optionalTime(value: unknown) {
  const time = typeof value === "string" ? value.trim() : "";
  if (!time) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Vul een geldige tijd in.");
  return time;
}

function textValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeAppointmentInput(input: AppointmentInput, partial = false) {
  const normalized: {
    appointmentDate?: string;
    startTime?: string | null;
    endTime?: string | null;
    appointmentType?: ImplementationAppointmentType;
    title?: string;
    customerNote?: string | null;
    workItems?: ImplementationAppointmentWorkItem[];
    status?: ImplementationAppointmentStatus;
  } = {};

  if (!partial || input.appointmentDate !== undefined) {
    normalized.appointmentDate = requiredDate(input.appointmentDate);
  }
  if (!partial || input.startTime !== undefined) normalized.startTime = optionalTime(input.startTime);
  if (!partial || input.endTime !== undefined) normalized.endTime = optionalTime(input.endTime);

  if (!partial || input.appointmentType !== undefined) {
    normalized.appointmentType = isImplementationAppointmentType(input.appointmentType)
      ? input.appointmentType
      : "on_site";
  }
  if (!partial || input.title !== undefined) {
    normalized.title = textValue(input.title, 180) || "Implementatieafspraak";
  }
  if (!partial || input.customerNote !== undefined) {
    normalized.customerNote = textValue(input.customerNote, 5_000) || null;
  }
  if (!partial || input.workItems !== undefined) {
    normalized.workItems = normalizeAppointmentWorkItems(input.workItems);
  }
  if (!partial || input.status !== undefined) {
    normalized.status = isImplementationAppointmentStatus(input.status)
      ? input.status
      : "planned";
  }

  const startTime = normalized.startTime;
  const endTime = normalized.endTime;
  if (startTime && endTime && endTime <= startTime) {
    throw new Error("De eindtijd moet na de starttijd liggen.");
  }

  return normalized;
}

export async function getImplementationPortalAccess(
  request: Request,
  implementationId: string,
  actor: ImplementationActor,
) {
  const access = await requireImplementationAccess(implementationId, actor);
  if (!access.ok) return access;

  const { rows } = await query<PortalAccessRow>(
    `select *
     from public.implementation_customer_access
     where implementation_id = $1
     limit 1`,
    [implementationId],
  );
  return { ok: true as const, portalAccess: rows[0] ? toAccess(request, rows[0]) : null };
}

export async function createOrRefreshImplementationPortal(
  request: Request,
  implementationId: string,
  actor: ImplementationActor,
  regenerate: boolean,
) {
  const access = await requireImplementationAccess(implementationId, actor, "write");
  if (!access.ok) return access;

  const { rows } = await query<PortalAccessRow>(
    `insert into public.implementation_customer_access
       (id, implementation_id, created_by, token_version, expires_at)
     values ($1, $2, $3, 1, now() + ($4::integer * interval '1 day'))
     on conflict (implementation_id) do update
       set token_version = case
             when $5
               or public.implementation_customer_access.revoked_at is not null
               or public.implementation_customer_access.expires_at <= now()
             then public.implementation_customer_access.token_version + 1
             else public.implementation_customer_access.token_version
           end,
           expires_at = now() + ($4::integer * interval '1 day'),
           revoked_at = null,
           updated_at = now()
     returning *`,
    [createId(), implementationId, actor.user.id, IMPLEMENTATION_PORTAL_TTL_DAYS, regenerate],
  );
  return { ok: true as const, portalAccess: toAccess(request, rows[0]) };
}

export async function revokeImplementationPortal(
  request: Request,
  implementationId: string,
  actor: ImplementationActor,
) {
  const access = await requireImplementationAccess(implementationId, actor, "write");
  if (!access.ok) return access;

  const { rows } = await query<PortalAccessRow>(
    `update public.implementation_customer_access
     set revoked_at = now(), token_version = token_version + 1, updated_at = now()
     where implementation_id = $1
     returning *`,
    [implementationId],
  );
  return {
    ok: true as const,
    portalAccess: rows[0] ? toAccess(request, rows[0]) : null,
  };
}

export async function listImplementationAppointments(
  implementationId: string,
  actor: ImplementationActor,
) {
  const access = await requireImplementationAccess(implementationId, actor);
  if (!access.ok) return access;

  const { rows } = await query<AppointmentRow>(
    `select *
     from public.implementation_appointments
     where implementation_id = $1
     order by appointment_date asc, start_time asc nulls last, created_at asc`,
    [implementationId],
  );
  return { ok: true as const, appointments: rows.map(toAppointment) };
}

export async function createImplementationAppointment(
  implementationId: string,
  actor: ImplementationActor,
  input: AppointmentInput,
) {
  const access = await requireImplementationAccess(implementationId, actor, "write");
  if (!access.ok) return access;
  const appointment = normalizeAppointmentInput(input);

  const { rows } = await query<AppointmentRow>(
    `insert into public.implementation_appointments
       (id, implementation_id, appointment_date, start_time, end_time,
        appointment_type, title, customer_note, work_items, status, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning *`,
    [
      createId(),
      implementationId,
      appointment.appointmentDate,
      appointment.startTime,
      appointment.endTime,
      appointment.appointmentType,
      appointment.title,
      appointment.customerNote,
      JSON.stringify(appointment.workItems ?? []),
      appointment.status,
      actor.user.id,
    ],
  );
  return { ok: true as const, appointment: toAppointment(rows[0]) };
}

export async function updateImplementationAppointment(
  implementationId: string,
  appointmentId: string,
  actor: ImplementationActor,
  input: AppointmentInput,
) {
  const access = await requireImplementationAccess(implementationId, actor, "write");
  if (!access.ok) return access;
  const appointment = normalizeAppointmentInput(input, true);
  const fields = Object.entries(appointment);
  if (fields.length === 0) throw new Error("Geen afspraakgegevens ontvangen.");

  const columnMap: Record<string, string> = {
    appointmentDate: "appointment_date",
    startTime: "start_time",
    endTime: "end_time",
    appointmentType: "appointment_type",
    title: "title",
    customerNote: "customer_note",
    workItems: "work_items",
    status: "status",
  };
  const values = fields.map(([key, value]) => key === "workItems" ? JSON.stringify(value) : value);
  const setClause = fields
    .map(([key], index) => `${columnMap[key]} = $${index + 1}`)
    .join(", ");
  values.push(implementationId, appointmentId);

  const { rows } = await query<AppointmentRow>(
    `update public.implementation_appointments
     set ${setClause}, updated_at = now()
     where implementation_id = $${fields.length + 1}
       and id = $${fields.length + 2}
     returning *`,
    values,
  );
  if (!rows[0]) {
    return { ok: false as const, status: 404, error: "Afspraak niet gevonden." };
  }
  return { ok: true as const, appointment: toAppointment(rows[0]) };
}

export async function deleteImplementationAppointment(
  implementationId: string,
  appointmentId: string,
  actor: ImplementationActor,
) {
  const access = await requireImplementationAccess(implementationId, actor, "write");
  if (!access.ok) return access;

  const { rowCount } = await query(
    `delete from public.implementation_appointments
     where implementation_id = $1 and id = $2`,
    [implementationId, appointmentId],
  );
  if (!rowCount) return { ok: false as const, status: 404, error: "Afspraak niet gevonden." };
  return { ok: true as const };
}

async function publicAppointments(implementationId: string) {
  const { rows } = await query<AppointmentRow>(
    `select *
     from public.implementation_appointments
     where implementation_id = $1
     order by appointment_date asc, start_time asc nulls last, created_at asc`,
    [implementationId],
  );
  return rows.map(toAppointment);
}

export async function getPublicImplementationPortal(
  accessId: string,
  tokenVersion: number,
  token: string,
) {
  const access = await verifiedPortalAccess(accessId, tokenVersion, token);
  if (!access) {
    return { ok: false as const, error: "Deze klantlink is ongeldig, verlopen of ingetrokken." };
  }

  const { rows } = await query<PortalImplementationRow>(
    `select deal_id, customer_name, quote_title, package_name, status,
            assigned_consultant_name, assigned_consultant_email,
            implementation_start_date, planned_go_live_date, actual_go_live_date,
            dns_domain,
            progress, implementation_item_progress, implementation_custom_work_items,
            implementation_customer_work_approvals, implementation_work_item_notes, updated_at
     from public.implementations
     where id = $1
     limit 1`,
    [access.implementation_id],
  );
  const implementation = rows[0];
  if (!implementation) {
    return { ok: false as const, error: "Deze implementatie is niet meer beschikbaar." };
  }

  const [
    { rows: dealRows },
    { rows: intakeRows },
    appointments,
    { pricingConfig },
    files,
  ] = await Promise.all([
    query<PortalDealRow>(
      "select modules, calculator_inputs from public.deals where id = $1 limit 1",
      [implementation.deal_id],
    ),
    query<{ status: string; submitted_at: string | null; form_data: unknown }>(
      "select status, submitted_at, form_data from public.customer_intakes where deal_id = $1 limit 1",
      [implementation.deal_id],
    ),
    publicAppointments(access.implementation_id),
    readStoredPricingConfig(getServiceClient()),
    listImplementationCustomerFiles(access.implementation_id),
  ]);

  const intake = intakeRows[0];
  const { tasks, items } = publicImplementationItems(
    dealRows[0],
    pricingConfig,
    implementation.implementation_item_progress,
    implementation.implementation_custom_work_items,
    implementation.implementation_customer_work_approvals,
    implementation.implementation_work_item_notes,
    new Set(appointments.flatMap((appointment) => (
      appointment.workItems.map((workItem) => workItem.key)
    ))),
  );
  const implementationSteps = [...tasks, ...items].flatMap((item) => (
    item.workItems.length > 0 ? item.workItems : [{ completed: item.completed }]
  ));
  const completedSteps = implementationSteps.filter((step) => step.completed).length;
  const dnsDomain = implementationWebsiteDomain(implementation.dns_domain ?? "") || (
    intake?.submitted_at
      ? implementationWebsiteDomain(normalizeCustomerIntakeData(intake.form_data).website)
      : ""
  );
  let dnsCheck: ImplementationDnsCheck | null = null;
  let dnsCheckMessage = "Domeinnaam is nog niet ingesteld.";

  if (dnsDomain) {
    try {
      dnsCheck = await checkImplementationDns(dnsDomain);
      dnsCheckMessage = "";
    } catch (error) {
      dnsCheckMessage = error instanceof Error ? error.message : "DNS-controle mislukt.";
    }
  }

  await query(
    "update public.implementation_customer_access set last_viewed_at = now() where id = $1",
    [access.id],
  );

  const portal: PublicImplementationPortal = {
    customerName: implementation.customer_name,
    quoteTitle: implementation.quote_title ?? "Smart Trade implementatie",
    packageName: implementation.package_name ?? "Smart Trade",
    statusLabel: IMPLEMENTATION_STATUS_LABELS[implementation.status] ?? "In behandeling",
    consultantName: implementation.assigned_consultant_name ?? "Nog niet toegewezen",
    consultantEmail: implementation.assigned_consultant_email ?? "",
    implementationStartDate: implementation.implementation_start_date,
    plannedGoLiveDate: implementation.planned_go_live_date,
    actualGoLiveDate: implementation.actual_go_live_date,
    updatedAt: implementation.updated_at,
    progressPercentage: implementationSteps.length > 0
      ? Math.round((completedSteps / implementationSteps.length) * 100)
      : 0,
    dnsDomain,
    dnsCheck,
    dnsCheckMessage,
    tasks,
    items,
    appointments,
    files,
  };
  return { ok: true as const, portal };
}

export async function approvePublicImplementationWorkItem(
  accessId: string,
  tokenVersion: number,
  token: string,
  requestedWorkItemKey: string,
) {
  const workItemKey = requestedWorkItemKey.trim().slice(0, 240);
  if (!workItemKey) {
    return { ok: false as const, status: 400, error: "Kies een geldige werkzaamheid." };
  }

  const access = await verifiedPortalAccess(accessId, tokenVersion, token);
  if (!access) {
    return {
      ok: false as const,
      status: 404,
      error: "Deze klantlink is ongeldig, verlopen of ingetrokken.",
    };
  }

  const { rows } = await query<Pick<PortalImplementationRow,
    "deal_id" |
    "implementation_item_progress" |
    "implementation_custom_work_items" |
    "implementation_customer_work_approvals" |
    "implementation_work_item_notes"
  >>(
    `select deal_id, implementation_item_progress, implementation_custom_work_items,
            implementation_customer_work_approvals, implementation_work_item_notes
     from public.implementations
     where id = $1
     limit 1`,
    [access.implementation_id],
  );
  const implementation = rows[0];
  if (!implementation) {
    return { ok: false as const, status: 404, error: "Deze implementatie is niet meer beschikbaar." };
  }

  const [{ rows: dealRows }, { pricingConfig }, appointments] = await Promise.all([
    query<PortalDealRow>(
      "select modules, calculator_inputs from public.deals where id = $1 limit 1",
      [implementation.deal_id],
    ),
    readStoredPricingConfig(getServiceClient()),
    publicAppointments(access.implementation_id),
  ]);
  const { tasks, items } = publicImplementationItems(
    dealRows[0],
    pricingConfig,
    implementation.implementation_item_progress,
    implementation.implementation_custom_work_items,
    implementation.implementation_customer_work_approvals,
    implementation.implementation_work_item_notes,
    new Set(appointments.flatMap((appointment) => (
      appointment.workItems.map((workItem) => workItem.key)
    ))),
  );
  const candidate = publicWorkItemCandidates(tasks, items)
    .find((workItem) => workItem.key === workItemKey);

  if (!candidate) {
    return { ok: false as const, status: 404, error: "Deze werkzaamheid is niet meer beschikbaar." };
  }
  if (!candidate.completed) {
    return {
      ok: false as const,
      status: 409,
      error: "De consultant heeft deze werkzaamheid nog niet als afgerond gemarkeerd.",
    };
  }

  const existingApprovals = normalizeImplementationCustomerWorkApprovals(
    implementation.implementation_customer_work_approvals,
  );
  if (existingApprovals[workItemKey]) {
    return { ok: true as const, approval: existingApprovals[workItemKey] };
  }

  const approval: ImplementationCustomerWorkApproval = {
    workItemKey,
    itemKey: candidate.itemKey,
    itemLabel: candidate.itemLabel,
    workItemLabel: candidate.label,
    approvedAt: new Date().toISOString(),
    accessId,
  };
  const { rows: updatedRows } = await query<{ implementation_customer_work_approvals: unknown }>(
    `update public.implementations
     set implementation_customer_work_approvals = case
           when coalesce(implementation_customer_work_approvals, '{}'::jsonb) ? ($2::text)
             then coalesce(implementation_customer_work_approvals, '{}'::jsonb)
           else jsonb_set(
             coalesce(implementation_customer_work_approvals, '{}'::jsonb),
             array[$2]::text[],
             $3::jsonb,
             true
           )
         end,
         updated_at = case
           when coalesce(implementation_customer_work_approvals, '{}'::jsonb) ? ($2::text)
             then updated_at
           else now()
         end
     where id = $1
     returning implementation_customer_work_approvals`,
    [access.implementation_id, workItemKey, JSON.stringify(approval)],
  );
  const savedApprovals = normalizeImplementationCustomerWorkApprovals(
    updatedRows[0]?.implementation_customer_work_approvals,
  );
  const savedApproval = savedApprovals[workItemKey];
  if (!savedApproval) {
    return { ok: false as const, status: 500, error: "Het akkoord kon niet worden vastgelegd." };
  }

  return { ok: true as const, approval: savedApproval };
}

export async function savePublicImplementationWorkItemNote(
  accessId: string,
  tokenVersion: number,
  token: string,
  requestedWorkItemKey: string,
  requestedText: string,
) {
  let normalized: ReturnType<typeof normalizeWorkItemNoteInput>;
  try {
    normalized = normalizeWorkItemNoteInput(requestedWorkItemKey, requestedText);
  } catch (error) {
    return {
      ok: false as const,
      status: 400,
      error: error instanceof Error ? error.message : "Ongeldige opmerking.",
    };
  }

  const access = await verifiedPortalAccess(accessId, tokenVersion, token);
  if (!access) {
    return {
      ok: false as const,
      status: 404,
      error: "Deze klantlink is ongeldig, verlopen of ingetrokken.",
    };
  }

  const { rows } = await query<Pick<PortalImplementationRow,
    "deal_id" |
    "customer_name" |
    "implementation_item_progress" |
    "implementation_custom_work_items" |
    "implementation_customer_work_approvals" |
    "implementation_work_item_notes"
  >>(
    `select deal_id, customer_name, implementation_item_progress,
            implementation_custom_work_items, implementation_customer_work_approvals,
            implementation_work_item_notes
     from public.implementations
     where id = $1
     limit 1`,
    [access.implementation_id],
  );
  const implementation = rows[0];
  if (!implementation) {
    return { ok: false as const, status: 404, error: "Deze implementatie is niet meer beschikbaar." };
  }

  const [{ rows: dealRows }, { pricingConfig }, appointments] = await Promise.all([
    query<PortalDealRow>(
      "select modules, calculator_inputs from public.deals where id = $1 limit 1",
      [implementation.deal_id],
    ),
    readStoredPricingConfig(getServiceClient()),
    publicAppointments(access.implementation_id),
  ]);
  const { tasks, items } = publicImplementationItems(
    dealRows[0],
    pricingConfig,
    implementation.implementation_item_progress,
    implementation.implementation_custom_work_items,
    implementation.implementation_customer_work_approvals,
    implementation.implementation_work_item_notes,
    new Set(appointments.flatMap((appointment) => (
      appointment.workItems.map((workItem) => workItem.key)
    ))),
  );
  const candidate = publicWorkItemCandidates(tasks, items)
    .find((workItem) => workItem.key === normalized.workItemKey);
  if (!candidate) {
    return { ok: false as const, status: 404, error: "Deze werkzaamheid is niet meer beschikbaar." };
  }

  const notes = await persistImplementationWorkItemNote(
    access.implementation_id,
    normalized.workItemKey,
    "customer",
    normalized.text,
    implementation.customer_name || "Klant",
  );
  return {
    ok: true as const,
    notes,
    noteSet: notes[normalized.workItemKey] ?? {},
  };
}
