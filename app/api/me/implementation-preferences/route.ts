import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { query } from "@/lib/local-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const preferenceKeys = ["appointmentsOpen", "managementOpen", "sharingOpen", "filesOpen", "dnsOpen", "tasksOpen", "dossierOpen", "implementationDataOpen"] as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const actor = await requireLocalUser(request);
    if (!actor.ok) return json({ error: "Niet ingelogd." }, 401);
    const { rows } = await query<{ payload: Record<string, unknown> }>(
      "select payload from public.app_settings where key = $1",
      [`implementation-preferences:${actor.user.id}`],
    );
    return json(Object.fromEntries(preferenceKeys.map(key => [key, rows[0]?.payload?.[key] !== false])));
  } catch {
    return json({ error: "Weergavevoorkeur laden mislukt." }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireLocalUser(request);
    if (!actor.ok) return json({ error: "Niet ingelogd." }, 401);
    const body = await request.json().catch(() => null);
    const keys = preferenceKeys.filter(key => body != null && Object.hasOwn(body, key));
    if (!keys.length || keys.some(key => typeof body[key] !== "boolean")) {
      return json({ error: "Kies open of ingeklapt." }, 400);
    }
    const preferences = Object.fromEntries(keys.map(key => [key, body[key]]));
    await query(
      `insert into public.app_settings (key, payload) values ($1, $2::jsonb)
       on conflict (key) do update set payload = app_settings.payload || excluded.payload, updated_at = now()`,
      [`implementation-preferences:${actor.user.id}`, JSON.stringify(preferences)],
    );
    return json(preferences);
  } catch {
    return json({ error: "Weergavevoorkeur opslaan mislukt. Probeer opnieuw." }, 500);
  }
}
