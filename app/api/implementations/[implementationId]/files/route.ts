import { NextResponse } from "next/server";
import { requireImplementationAccess } from "@/lib/implementation-access";
import {
  listImplementationCustomerFiles,
  updateImplementationCustomerFileStatus,
} from "@/lib/implementation-files-server";
import { requireLocalUser } from "@/lib/local-auth";

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
    const access = await requireImplementationAccess(implementationId, verified);
    if (!access.ok) return jsonResponse({ error: access.error }, access.status);
    return jsonResponse({ files: await listImplementationCustomerFiles(implementationId) });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Bestanden laden mislukt.",
    }, 500);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ implementationId: string }> },
) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);
    const { implementationId } = await context.params;
    const access = await requireImplementationAccess(implementationId, verified, "write");
    if (!access.ok) return jsonResponse({ error: access.error }, access.status);
    const body = await request.json().catch(() => ({})) as {
      fileId?: unknown;
      status?: unknown;
    };
    const fileId = typeof body.fileId === "string" ? body.fileId : "";
    if (!fileId) return jsonResponse({ error: "Bestand ontbreekt." }, 400);
    const result = await updateImplementationCustomerFileStatus(
      implementationId,
      fileId,
      body.status,
      verified.user.id,
    );
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);
    return jsonResponse({ file: result.file });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Bestand bijwerken mislukt.",
    }, 500);
  }
}
