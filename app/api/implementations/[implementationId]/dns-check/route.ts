import { NextResponse } from "next/server";
import { normalizeCustomerIntakeData } from "@/lib/customer-intake";
import {
  checkImplementationDns,
  implementationWebsiteDomain,
} from "@/lib/implementation-dns";
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
      select: "id,deal_id,dns_domain",
      filters: [{ column: "id", op: "eq", value: implementationId }],
      maybeSingle: true,
    }, {
      user: verified.user,
      profile: verified.profile,
    });

    const implementation = access.data as { deal_id?: string; dns_domain?: string | null } | null;
    if (!implementation?.deal_id) {
      return jsonResponse({ error: "Implementatie niet gevonden of niet toegankelijk." }, 404);
    }

    const { rows } = await query<{ form_data: unknown; submitted_at: string | null }>(
      `select form_data, submitted_at
       from public.customer_intakes
       where deal_id = $1
       limit 1`,
      [implementation.deal_id],
    );
    const requestedDomain = new URL(request.url).searchParams.get("domain") ?? "";
    const intake = rows[0];
    const intakeDomain = intake?.submitted_at
      ? normalizeCustomerIntakeData(intake.form_data).website
      : "";
    const domain = implementationWebsiteDomain(
      requestedDomain || implementation.dns_domain || intakeDomain,
    );
    if (!domain) {
      return jsonResponse({ error: "Vul eerst een geldige domeinnaam in." }, 409);
    }

    return jsonResponse(await checkImplementationDns(domain));
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "DNS-controle mislukt.",
    }, 500);
  }
}
