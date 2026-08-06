import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import {
  deleteImplementationAppointment,
  updateImplementationAppointment,
} from "@/lib/implementation-portal-server";
import {
  removeImplementationAppointmentCalendarEvent,
  syncImplementationAppointmentCalendar,
} from "@/lib/implementation-calendar-server";
import { getOutlookConnectUrl } from "@/lib/outlook-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ implementationId: string; appointmentId: string }> },
) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);
    const { implementationId, appointmentId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await updateImplementationAppointment(
      implementationId,
      appointmentId,
      verified,
      body,
    );
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);
    const calendar = await syncImplementationAppointmentCalendar(
      request,
      implementationId,
      appointmentId,
      verified,
    );
    return jsonResponse({
      appointment: result.appointment,
      calendar: {
        ...calendar,
        connectUrl: calendar.reconnectRequired
          ? getOutlookConnectUrl(request, `/implementatie/${implementationId}`)
          : "",
      },
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Afspraak opslaan mislukt.",
    }, 500);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ implementationId: string; appointmentId: string }> },
) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);
    const { implementationId, appointmentId } = await context.params;
    const calendar = await removeImplementationAppointmentCalendarEvent(
      request,
      implementationId,
      appointmentId,
      verified,
    );
    const result = await deleteImplementationAppointment(
      implementationId,
      appointmentId,
      verified,
    );
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);
    return jsonResponse({
      deleted: true,
      calendar: {
        ...calendar,
        connectUrl: calendar.reconnectRequired
          ? getOutlookConnectUrl(request, `/implementatie/${implementationId}`)
          : "",
      },
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Afspraak verwijderen mislukt.",
    }, 500);
  }
}
