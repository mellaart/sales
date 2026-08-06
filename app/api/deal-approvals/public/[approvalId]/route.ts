import { NextResponse } from "next/server";
import {
  acceptPublicDealApproval,
  getPublicDealApproval,
} from "@/lib/deal-approval-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function tokenValues(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  return {
    token: searchParams.get("token")?.trim() ?? "",
    tokenVersion: Number(searchParams.get("v") ?? 0),
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ approvalId: string }> },
) {
  try {
    const { approvalId } = await context.params;
    const { token, tokenVersion } = tokenValues(request);
    const result = await getPublicDealApproval(approvalId, tokenVersion, token);
    if ("error" in result) return jsonResponse({ error: result.error }, 404);
    return jsonResponse({ approval: result.approval });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Offerte laden mislukt." },
      500,
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ approvalId: string }> },
) {
  try {
    const { approvalId } = await context.params;
    const { token, tokenVersion } = tokenValues(request);
    const access = await getPublicDealApproval(approvalId, tokenVersion, token);
    if ("error" in access) return jsonResponse({ error: access.error }, 404);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!name) return jsonResponse({ error: "Vul uw naam in." }, 400);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return jsonResponse({ error: "Vul een geldig e-mailadres in." }, 400);
    }
    if (body?.confirmed !== true) {
      return jsonResponse({ error: "Bevestig dat u akkoord gaat met de offerte." }, 400);
    }

    const approval = await acceptPublicDealApproval(
      request,
      approvalId,
      tokenVersion,
      { name, email },
    );
    return jsonResponse({ approval });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Akkoord vastleggen mislukt." },
      409,
    );
  }
}
