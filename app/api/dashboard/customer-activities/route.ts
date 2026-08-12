import { NextResponse } from "next/server";
import {
  acknowledgeCustomerActivities,
  listCustomerActivities,
  type CustomerActivity,
} from "@/lib/customer-activity-server";
import { requireLocalUser } from "@/lib/local-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);

    const activities = await listCustomerActivities({
      user: verified.user,
      profile: verified.profile,
    });
    return jsonResponse({ activities });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Klantacties laden mislukt.",
    }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);

    const body = await request.json().catch(() => null) as {
      activities?: Array<Pick<CustomerActivity, "key" | "occurredAt">>;
    } | null;
    if (!Array.isArray(body?.activities) || body.activities.length === 0) {
      return jsonResponse({ error: "Kies minimaal één klantactie." }, 400);
    }

    await acknowledgeCustomerActivities(verified.user.id, body.activities);
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Klantactie afhandelen mislukt.",
    }, 500);
  }
}
