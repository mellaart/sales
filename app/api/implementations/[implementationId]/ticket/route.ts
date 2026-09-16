import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { query } from "@/lib/local-db";
import { executeLocalTableQuery } from "@/lib/local-table";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { fetchWithSmartTradeTimeout, getSmartTradePullHeaders } from "@/lib/smart-trade-pull-test";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const positiveId = (value: unknown) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export async function POST(request: Request, context: { params: Promise<{ implementationId: string }> }) {
  try {
    const actor = await requireLocalUser(request);
    if (!actor.ok) return json({ error: "Niet ingelogd." }, 401);
    if (!isProtectedAdminEmail(actor.user.email)) return json({ error: "Je hebt geen rechten om het implementatieticket aan te maken." }, 403);
    const { implementationId } = await context.params;
    const access = await executeLocalTableQuery({
      table: "implementations", action: "select", select: "id,deal_id,assigned_consultant_id",
      filters: [{ column: "id", op: "eq", value: implementationId }], maybeSingle: true,
    }, { user: actor.user, profile: actor.profile });
    const implementation = access.data as { id: string; deal_id: string; assigned_consultant_id: string | null } | null;
    if (!implementation) return json({ error: "Implementatie niet gevonden of niet toegankelijk." }, 404);
    const key = `implementation-ticket:${implementation.id}`;
    const existing = await query<{ payload: { ticketId?: string } }>("select payload from public.app_settings where key = $1", [key]);
    if (existing.rows[0]) {
      const ticketId = existing.rows[0].payload.ticketId;
      return ticketId ? json({ ticketId, alreadyCreated: true }) : json({ error: "Het ticket wordt aangemaakt of de uitkomst is nog onbekend. Controleer eerst in Troublefree of het ticket bestaat voordat je het opnieuw laat aanmaken." }, 409);
    }
    const { rows } = await query<{ smart_trade_relation_id: number | null }>("select smart_trade_relation_id from public.deals where id = $1", [implementation.deal_id]);
    const relation = positiveId(rows[0]?.smart_trade_relation_id);
    if (!implementation.assigned_consultant_id) return json({ error: "Wijs eerst een implementatieconsultant toe voordat je het ticket aanmaakt." }, 400);
    const consultant = await query<{ employee_relation_id: number | null }>(
      "select employee_relation_id from public.profiles where id = $1", [implementation.assigned_consultant_id],
    );
    const employee = positiveId(consultant.rows[0]?.employee_relation_id);
    if (!relation) return json({ error: "Het relatienummer ontbreekt. Koppel eerst de klantrelatie aan deze deal." }, 400);
    if (!employee) return json({ error: "Vul op de Admin-pagina het medewerker relatie-ID van de toegewezen implementatieconsultant in." }, 400);
    const headers = getSmartTradePullHeaders("live", { "content-type": "application/json" });
    const claim = await query("insert into public.app_settings (key, payload) values ($1, $2::jsonb) on conflict (key) do nothing returning key", [key, JSON.stringify({ status: "pending", createdBy: actor.user.id, attemptedAt: new Date().toISOString() })]);
    if (!claim.rows.length) return json({ error: "Dit implementatieticket wordt al aangemaakt. Probeer de status later opnieuw te controleren." }, 409);
    // Retain the claim on network errors or ambiguous replies: a retry must not create a duplicate.
    const response = await fetchWithSmartTradeTimeout("https://my.troublefree.nl/v3/api/ticketing/tickets", headers, "live", {
      method: "POST", body: JSON.stringify({ relation, name: "Implementatie", description: "Consultancy", labels: [100, 99], primaryLabel: 100, employee, priority: 2, mainTask: { assignedTo: { team: 100, relation: employee } } }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500 && response.status !== 408) {
        await query("delete from public.app_settings where key = $1", [key]);
      }
      return json({ error: `Ticket aanmaken mislukt (status ${response.status}). Controleer de ticketrechten en instellingen in Troublefree.` }, 502);
    }
    const ticketId = positiveId(body?.data?.id ?? body?.id ?? body?.data);
    if (!ticketId) return json({ error: "Troublefree heeft het verzoek ontvangen, maar geen herkenbaar ticketnummer teruggegeven. Controleer het ticket in Troublefree; er wordt niet automatisch opnieuw een ticket aangemaakt." }, 502);
    await query("update public.app_settings set payload = $2::jsonb, updated_at = now() where key = $1", [key, JSON.stringify({ ticketId: String(ticketId), createdBy: actor.user.id, createdAt: new Date().toISOString() })]);
    return json({ ticketId: String(ticketId) });
  } catch {
    return json({ error: "Ticket aanmaken kon niet worden bevestigd. Controleer eerst in Troublefree of het ticket is aangemaakt voordat je het opnieuw probeert." }, 502);
  }
}
