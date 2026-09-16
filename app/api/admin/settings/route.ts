import { getImplementationHoursPerDay } from "@/lib/implementation-settings";
import { validHoursPerDay } from "@/lib/implementation-planning";
import { query } from "@/lib/local-db";
import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { isCustomerSmsRequired, saveCustomerSmsRequired } from "@/lib/customer-sms-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function admin(request: Request) {
  const actor = await requireLocalUser(request);
  if (!actor.ok) return json({ error: "Niet ingelogd." }, 401);
  if (actor.profile.role !== "admin") return json({ error: "Alleen admins mogen instellingen beheren." }, 403);
  return null;
}

export async function GET(request: Request) {
  try {
    const denied = await admin(request);
    if (denied) return denied;
    return json({ smsRequired: await isCustomerSmsRequired(), hoursPerDay: await getImplementationHoursPerDay() });
  } catch {
    return json({ error: "Instellingen laden mislukt." }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const denied = await admin(request);
    if (denied) return denied;
    const body = await request.json().catch(() => null);
    if (body?.hoursPerDay !== undefined) {
      if (!validHoursPerDay(body.hoursPerDay)) return json({ error: "Vul een aantal uren groter dan 0 en maximaal 24 in." }, 400);
      await query("insert into public.app_settings (key,payload) values ($1,$2::jsonb) on conflict (key) do update set payload=excluded.payload,updated_at=now()", ["implementation-settings", JSON.stringify({hoursPerDay:body.hoursPerDay})]);
      return json({hoursPerDay:body.hoursPerDay});
    }
    if (typeof body?.smsRequired !== "boolean") return json({ error: "Kies aan of uit." }, 400);
    await saveCustomerSmsRequired(body.smsRequired);
    return json({ smsRequired: body.smsRequired });
  } catch {
    return json({ error: "Instellingen opslaan mislukt." }, 500);
  }
}
