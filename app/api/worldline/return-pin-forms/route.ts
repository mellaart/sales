import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { getLocalWorldlinePermission } from "@/lib/worldline-access-server";
import {
  createWorldlineReturnPinForm,
  getWorldlineReturnPinForms,
} from "@/lib/worldline-return-pin-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function projectIdValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function verifyAccess(request: Request, write = false) {
  const verified = await requireLocalUser(request);
  if (!verified.ok) return { error: verified.message, status: 401 } as const;

  const permission = await getLocalWorldlinePermission(verified.profile);
  if (permission === "none" || (write && permission !== "write")) {
    return {
      error: write ? "Geen schrijfrechten voor Worldline." : "Geen toegang tot Worldline.",
      status: 403,
    } as const;
  }

  return { verified, permission } as const;
}

export async function GET(request: Request) {
  try {
    const access = await verifyAccess(request);
    if ("error" in access) return jsonResponse({ error: access.error }, access.status);

    const projectId = projectIdValue(new URL(request.url).searchParams.get("projectId"));
    if (!projectId) return jsonResponse({ error: "Worldline-project ontbreekt." }, 400);

    const result = await getWorldlineReturnPinForms(
      request,
      projectId,
      access.permission === "write",
    );
    if ("error" in result) return jsonResponse({ error: result.error }, 404);
    return jsonResponse({ forms: result.forms });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Retourpinnenformulier laden mislukt.",
    }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const access = await verifyAccess(request, true);
    if ("error" in access) return jsonResponse({ error: access.error }, access.status);

    const body = await request.json().catch(() => null) as {
      projectId?: unknown;
      forceNew?: unknown;
    } | null;
    const projectId = projectIdValue(body?.projectId);
    if (!projectId) return jsonResponse({ error: "Worldline-project ontbreekt." }, 400);

    const result = await createWorldlineReturnPinForm(
      request,
      projectId,
      access.verified.user.id,
      body?.forceNew === true,
    );
    return jsonResponse({ form: result.form });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Retourpinnenlink maken mislukt.",
    }, 500);
  }
}
