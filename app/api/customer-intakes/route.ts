import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import {
  createOrRefreshCustomerIntake,
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

function dealIdValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);

    const dealId = dealIdValue(new URL(request.url).searchParams.get("dealId"));
    if (!dealId) return jsonResponse({ error: "Deal-ID ontbreekt." }, 400);

    const result = await getCustomerIntakeForDeal(request, dealId, {
      user: verified.user,
      profile: verified.profile,
    });
    if (!("intake" in result)) return jsonResponse({ error: result.error }, 403);

    return jsonResponse({ intake: result.intake });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Klantformulier laden mislukt." },
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);

    const body = await request.json().catch(() => null) as {
      dealId?: unknown;
      recipientEmail?: unknown;
      regenerate?: unknown;
    } | null;
    const dealId = dealIdValue(body?.dealId);
    if (!dealId) return jsonResponse({ error: "Deal-ID ontbreekt." }, 400);

    const recipientEmail = typeof body?.recipientEmail === "string"
      ? body.recipientEmail.trim().toLowerCase()
      : "";
    if (recipientEmail && !/^\S+@\S+\.\S+$/.test(recipientEmail)) {
      return jsonResponse({ error: "Vul een geldig e-mailadres in." }, 400);
    }

    const result = await createOrRefreshCustomerIntake(
      request,
      dealId,
      { user: verified.user, profile: verified.profile },
      {
        recipientEmail,
        regenerate: body?.regenerate === true,
      },
    );
    if (!("intake" in result)) return jsonResponse({ error: result.error }, 403);

    return jsonResponse({ intake: result.intake });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Klantlink maken mislukt." },
      500,
    );
  }
}
