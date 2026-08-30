import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { executeLocalTableQuery } from "@/lib/local-table";
import {
  getCustomerIntakeForDeal,
} from "@/lib/customer-intake-server";

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

    const result = await getCustomerIntakeForDeal(request, implementation.deal_id, {
      user: verified.user,
      profile: verified.profile,
    });
    if (!("intake" in result)) return jsonResponse({ error: result.error }, 403);

    return jsonResponse({ intake: result.intake });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Status klantformulier laden mislukt.",
    }, 500);
  }
}
