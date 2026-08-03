import { NextResponse } from "next/server";
import { getImplementationItems } from "@/lib/implementation-items";
import { requireLocalUser } from "@/lib/local-auth";
import { query } from "@/lib/local-db";
import { executeLocalTableQuery } from "@/lib/local-table";

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
    const access = await executeLocalTableQuery({
      table: "implementations",
      action: "select",
      select: "id,deal_id",
      filters: [{ column: "id", op: "eq", value: implementationId }],
      maybeSingle: true,
    }, {
      user: verified.user,
      profile: verified.profile,
    });

    const implementation = access.data as { deal_id?: string } | null;
    if (!implementation?.deal_id) {
      return jsonResponse({ error: "Implementatie niet gevonden of niet toegankelijk." }, 404);
    }

    const { rows } = await query<{ modules: unknown; calculator_inputs: unknown }>(
      `select modules, calculator_inputs
       from public.deals
       where id = $1
       limit 1`,
      [implementation.deal_id],
    );
    const deal = rows[0];
    if (!deal) return jsonResponse({ error: "De gekoppelde calculator-deal ontbreekt." }, 404);

    return jsonResponse({ items: getImplementationItems(deal) });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Modules laden mislukt.",
    }, 500);
  }
}
