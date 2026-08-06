import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import {
  createImplementationAppointment,
  listImplementationAppointments,
} from "@/lib/implementation-portal-server";
import { syncImplementationAppointmentCalendar } from "@/lib/implementation-calendar-server";
import { getOutlookConnectUrl } from "@/lib/outlook-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ implementationId: string }> },
) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);
    const { implementationId } = await context.params;
    const result = await listImplementationAppointments(implementationId, verified);
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);
    return jsonResponse({ appointments: result.appointments });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Afspraken laden mislukt.",
    }, 500);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ implementationId: string }> },
) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);
    const { implementationId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await createImplementationAppointment(implementationId, verified, body);
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);
    const calendar = await syncImplementationAppointmentCalendar(
      request,
      implementationId,
      result.appointment.id,
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
    }, 201);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Afspraak toevoegen mislukt.",
    }, 500);
  }
}
