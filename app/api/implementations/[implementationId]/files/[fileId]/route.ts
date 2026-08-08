import { NextResponse } from "next/server";
import { requireImplementationAccess } from "@/lib/implementation-access";
import { implementationFileAttachmentHeader } from "@/lib/implementation-files";
import { readImplementationCustomerFile } from "@/lib/implementation-files-server";
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
  context: { params: Promise<{ implementationId: string; fileId: string }> },
) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);
    const { implementationId, fileId } = await context.params;
    const access = await requireImplementationAccess(implementationId, verified);
    if (!access.ok) return jsonResponse({ error: access.error }, access.status);
    const stored = await readImplementationCustomerFile(implementationId, fileId);
    if (!stored) return jsonResponse({ error: "Bestand niet gevonden." }, 404);

    return new Response(new Uint8Array(stored.data), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": implementationFileAttachmentHeader(stored.file.fileName),
        "Content-Length": String(stored.data.byteLength),
        "Content-Security-Policy": "sandbox",
        "Content-Type": stored.file.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Bestand downloaden mislukt.",
    }, 500);
  }
}
