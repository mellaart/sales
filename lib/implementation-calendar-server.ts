import { normalizeCustomerIntakeData } from "@/lib/customer-intake";
import {
  requireImplementationAccess,
  type ImplementationActor,
} from "@/lib/implementation-access";
import type {
  ImplementationAppointmentStatus,
  ImplementationAppointmentType,
  ImplementationAppointmentWorkItem,
} from "@/lib/implementation-portal";
import { query } from "@/lib/local-db";
import {
  createOutlookCalendarEvent,
  deleteOutlookCalendarEvent,
  getOutlookConnectionStatus,
  OutlookReconnectRequiredError,
  updateOutlookCalendarEvent,
  type OutlookCalendarEventInput,
} from "@/lib/outlook-server";

type CalendarAppointmentRow = {
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
  customer_name: string;
  form_data: unknown;
};

export type AppointmentCalendarSyncResult = {
  synced: boolean;
  warning: string;
  reconnectRequired: boolean;
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character] ?? character,
  );
}

function appointmentWorkItems(value: unknown): ImplementationAppointmentWorkItem[] {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source) as unknown;
    } catch {
      source = [];
    }
  }
  if (!Array.isArray(source)) return [];

  return source.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key.trim() : "";
    const group = typeof row.group === "string" ? row.group.trim() : "";
    const label = typeof row.label === "string" ? row.label.trim() : "";
    return key && label ? [{ key, group, label }] : [];
  });
}

function customerAddress(formData: unknown) {
  const customer = normalizeCustomerIntakeData(formData);
  const street = [customer.deliveryStreet, customer.deliveryNumber].filter(Boolean).join(" ");
  const city = [customer.deliveryPostcode, customer.deliveryCity].filter(Boolean).join(" ");
  return [street, city].filter(Boolean).join(", ");
}

function calendarBody(row: CalendarAppointmentRow) {
  const workItems = appointmentWorkItems(row.work_items);
  const note = row.customer_note?.trim();
  const address = customerAddress(row.form_data);
  const workList = workItems.length > 0
    ? `<p><strong>Werkzaamheden</strong></p><ul>${workItems.map((item) => (
      `<li>${item.group ? `<strong>${escapeHtml(item.group)}:</strong> ` : ""}${escapeHtml(item.label)}</li>`
    )).join("")}</ul>`
    : "<p><strong>Werkzaamheden:</strong> geen werkzaamheden geselecteerd.</p>";

  return [
    `<p><strong>Klant:</strong> ${escapeHtml(row.customer_name)}</p>`,
    row.appointment_type === "on_site"
      ? `<p><strong>Adres klant:</strong> ${escapeHtml(address || "Niet ingevuld in het klantformulier")}</p>`
      : "",
    note
      ? `<p><strong>Toelichting klant</strong><br>${escapeHtml(note).replace(/\r?\n/g, "<br>")}</p>`
      : "<p><strong>Toelichting klant:</strong> geen toelichting.</p>",
    workList,
    `<p><strong>Soort afspraak:</strong> ${row.appointment_type === "on_site" ? "Op locatie" : "Online / op afstand"}</p>`,
  ].join("");
}

function eventInput(row: CalendarAppointmentRow): OutlookCalendarEventInput {
  const address = customerAddress(row.form_data);
  const location = row.appointment_type === "on_site"
    ? address || "Adres ontbreekt in het klantformulier"
    : "Online / op afstand";

  return {
    subject: `${row.title} - ${row.customer_name}`.slice(0, 255),
    appointmentDate: row.appointment_date.slice(0, 10),
    startTime: row.start_time?.slice(0, 5) || "09:00",
    endTime: row.end_time?.slice(0, 5) || "17:00",
    location: location.slice(0, 255),
    htmlBody: calendarBody(row),
    transactionId: row.id,
  };
}

async function appointmentContext(implementationId: string, appointmentId: string) {
  const { rows } = await query<CalendarAppointmentRow>(
    `select ia.*, i.customer_name, ci.form_data
     from public.implementation_appointments ia
     join public.implementations i on i.id = ia.implementation_id
     left join public.customer_intakes ci on ci.deal_id = i.deal_id
     where ia.implementation_id = $1 and ia.id = $2
     limit 1`,
    [implementationId, appointmentId],
  );
  return rows[0] ?? null;
}

async function saveSyncError(appointmentId: string, message: string) {
  try {
    await query(
      `update public.implementation_appointments
       set outlook_sync_error = $2, updated_at = now()
       where id = $1`,
      [appointmentId, message.slice(0, 1_000)],
    );
  } catch {
    // De Sales-afspraak blijft leidend als alleen de agenda-koppeling hapert.
  }
}

export async function syncImplementationAppointmentCalendar(
  request: Request,
  implementationId: string,
  appointmentId: string,
  actor: ImplementationActor,
): Promise<AppointmentCalendarSyncResult> {
  const access = await requireImplementationAccess(implementationId, actor, "write");
  if (!access.ok) return { synced: false, warning: access.error, reconnectRequired: false };

  let appointment: CalendarAppointmentRow | null;
  try {
    appointment = await appointmentContext(implementationId, appointmentId);
  } catch {
    return {
      synced: false,
      warning: "Afspraak opgeslagen, maar de Outlook-gegevens konden niet worden voorbereid.",
      reconnectRequired: false,
    };
  }
  if (!appointment) {
    return { synced: false, warning: "Afspraak niet gevonden.", reconnectRequired: false };
  }

  const outlookUserId = appointment.outlook_user_id || appointment.created_by || actor.user.id;
  let connection: Awaited<ReturnType<typeof getOutlookConnectionStatus>>;
  try {
    connection = await getOutlookConnectionStatus(outlookUserId);
  } catch {
    const warning = "Afspraak opgeslagen, maar de Outlook-agenda kon niet worden gecontroleerd.";
    await saveSyncError(appointment.id, warning);
    return { synced: false, warning, reconnectRequired: false };
  }
  if (!connection.calendarConnected) {
    const ownCalendar = outlookUserId === actor.user.id;
    const warning = ownCalendar
      ? "Afspraak opgeslagen. Verbind Outlook eenmalig opnieuw om deze ook in je agenda te zetten."
      : "Afspraak opgeslagen, maar de Outlook-agenda van de maker is niet verbonden.";
    await saveSyncError(appointment.id, warning);
    return { synced: false, warning, reconnectRequired: ownCalendar };
  }

  try {
    let eventId = appointment.outlook_event_id;
    if (eventId) {
      await updateOutlookCalendarEvent(request, outlookUserId, eventId, eventInput(appointment));
    } else {
      const event = await createOutlookCalendarEvent(
        request,
        outlookUserId,
        eventInput(appointment),
      );
      eventId = event.id;
    }

    await query(
      `update public.implementation_appointments
       set outlook_event_id = $2,
           outlook_user_id = $3,
           outlook_sync_error = null,
           updated_at = now()
       where id = $1`,
      [appointment.id, eventId, outlookUserId],
    );
    return { synced: true, warning: "", reconnectRequired: false };
  } catch (error) {
    const warning = error instanceof Error
      ? error.message
      : "De afspraak kon niet met Outlook worden gesynchroniseerd.";
    await saveSyncError(appointment.id, warning);
    return {
      synced: false,
      warning: `Afspraak opgeslagen. ${warning}`,
      reconnectRequired: error instanceof OutlookReconnectRequiredError && outlookUserId === actor.user.id,
    };
  }
}

export async function removeImplementationAppointmentCalendarEvent(
  request: Request,
  implementationId: string,
  appointmentId: string,
  actor: ImplementationActor,
): Promise<AppointmentCalendarSyncResult> {
  const access = await requireImplementationAccess(implementationId, actor, "write");
  if (!access.ok) return { synced: false, warning: access.error, reconnectRequired: false };

  let appointment: CalendarAppointmentRow | null;
  try {
    appointment = await appointmentContext(implementationId, appointmentId);
  } catch {
    return {
      synced: false,
      warning: "Sales-afspraak wordt verwijderd, maar het Outlook-item kon niet worden opgezocht.",
      reconnectRequired: false,
    };
  }
  if (!appointment?.outlook_event_id || !appointment.outlook_user_id) {
    return { synced: true, warning: "", reconnectRequired: false };
  }

  try {
    await deleteOutlookCalendarEvent(
      request,
      appointment.outlook_user_id,
      appointment.outlook_event_id,
    );
    return { synced: true, warning: "", reconnectRequired: false };
  } catch (error) {
    const warning = error instanceof Error
      ? error.message
      : "De Outlook-agenda-afspraak kon niet worden verwijderd.";
    return {
      synced: false,
      warning: `Sales-afspraak verwijderd. Verwijder het agenda-item eventueel handmatig: ${warning}`,
      reconnectRequired: error instanceof OutlookReconnectRequiredError
        && appointment.outlook_user_id === actor.user.id,
    };
  }
}
