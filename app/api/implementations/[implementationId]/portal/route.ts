import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import {
  createOrRefreshImplementationPortal,
  getImplementationPortalAccess,
  revokeImplementationPortal,
} from "@/lib/implementation-portal-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function actor(request: Request) {
  const verified = await requireLocalUser(request);
  if (!verified.ok) return verified;
  return { ok: true as const, user: verified.user, profile: verified.profile };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ implementationId: string }> },
) {
  try {
    const verified = await actor(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);
    const { implementationId } = await context.params;
    const result = await getImplementationPortalAccess(request, implementationId, verified);
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);
    return jsonResponse({ portalAccess: result.portalAccess });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Klanttoegang laden mislukt.",
    }, 500);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ implementationId: string }> },
) {
  try {
    const verified = await actor(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);
    const { implementationId } = await context.params;
    const body = await request.json().catch(() => ({})) as { regenerate?: unknown };
    const result = await createOrRefreshImplementationPortal(
      request,
      implementationId,
      verified,
      body.regenerate === true,
    );
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);
    return jsonResponse({ portalAccess: result.portalAccess });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Klantlink maken mislukt.",
    }, 500);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ implementationId: string }> },
) {
  try {
    const verified = await actor(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);
    const { implementationId } = await context.params;
    const result = await revokeImplementationPortal(request, implementationId, verified);
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);
    return jsonResponse({ portalAccess: result.portalAccess });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Klantlink intrekken mislukt.",
    }, 500);
  }
}
