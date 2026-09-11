import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { query } from "@/lib/local-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const actor = await requireLocalUser(request);
    if (!actor.ok) return json({ error: "Niet ingelogd." }, 401);
    const { rows } = await query<{ payload: { appointmentsOpen?: boolean } }>(
      "select payload from public.app_settings where key = $1",
      [`implementation-preferences:${actor.user.id}`],
    );
    return json({ appointmentsOpen: rows[0]?.payload?.appointmentsOpen === true });
  } catch {
    return json({ error: "Weergavevoorkeur laden mislukt." }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireLocalUser(request);
    if (!actor.ok) return json({ error: "Niet ingelogd." }, 401);
    const body = await request.json().catch(() => null);
    if (typeof body?.appointmentsOpen !== "boolean") {
      return json({ error: "Kies open of ingeklapt." }, 400);
    }
    await query(
      `insert into public.app_settings (key, payload) values ($1, $2::jsonb)
       on conflict (key) do update set payload = app_settings.payload || excluded.payload, updated_at = now()`,
      [`implementation-preferences:${actor.user.id}`, JSON.stringify({ appointmentsOpen: body.appointmentsOpen })],
    );
    return json({ appointmentsOpen: body.appointmentsOpen });
  } catch {
    return json({ error: "Weergavevoorkeur opslaan mislukt. Probeer opnieuw." }, 500);
  }
}
