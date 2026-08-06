import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import {
  getDealApprovalForActor,
  markDealApprovalDrafted,
  prepareDealApproval,
} from "@/lib/deal-approval-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);

    const dealId = textValue(new URL(request.url).searchParams.get("dealId"));
    if (!dealId) return jsonResponse({ error: "Deal-ID ontbreekt." }, 400);

    const result = await getDealApprovalForActor(request, dealId, {
      user: verified.user,
      profile: verified.profile,
    });
    if ("error" in result) return jsonResponse({ error: result.error }, 403);
    return jsonResponse({ approval: result.approval });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Akkoordstatus laden mislukt." },
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const dealId = textValue(body?.dealId);
    const recipientEmail = textValue(body?.recipientEmail).toLowerCase();
    const contactName = textValue(body?.contactName);
    if (!dealId) return jsonResponse({ error: "Deal-ID ontbreekt." }, 400);
    if (!/^\S+@\S+\.\S+$/.test(recipientEmail)) {
      return jsonResponse({ error: "Vul een geldig e-mailadres van de klant in." }, 400);
    }

    const approval = await prepareDealApproval(
      request,
      dealId,
      { user: verified.user, profile: verified.profile },
      { recipientEmail, contactName },
    );
    return jsonResponse({ approval }, 201);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Akkoordlink maken mislukt." },
      500,
    );
  }
}

export async function PUT(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const dealId = textValue(body?.dealId);
    const approvalId = textValue(body?.approvalId);
    if (!dealId || !approvalId) {
      return jsonResponse({ error: "Deal-ID of akkoord-ID ontbreekt." }, 400);
    }

    const approval = await markDealApprovalDrafted(
      request,
      dealId,
      approvalId,
      { user: verified.user, profile: verified.profile },
    );
    return jsonResponse({ approval });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Akkoordstatus opslaan mislukt." },
      500,
    );
  }
}
