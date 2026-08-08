import { NextResponse } from "next/server";
import { implementationFileAttachmentHeader } from "@/lib/implementation-files";
import {
  deleteImplementationCustomerFile,
  readImplementationCustomerFile,
} from "@/lib/implementation-files-server";
import { getVerifiedImplementationPortalAccess } from "@/lib/implementation-portal-server";

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

async function verifiedRequest(
  request: Request,
  context: { params: Promise<{ accessId: string; fileId: string }> },
) {
  const { accessId, fileId } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const token = searchParams.get("token")?.trim() ?? "";
  const tokenVersion = Number(searchParams.get("v") ?? 0);
  const access = await getVerifiedImplementationPortalAccess(accessId, tokenVersion, token);
  return { access, fileId };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ accessId: string; fileId: string }> },
) {
  try {
    const { access, fileId } = await verifiedRequest(request, context);
    if (!access) {
      return jsonResponse({ error: "Deze klantlink is ongeldig, verlopen of ingetrokken." }, 403);
    }
    const stored = await readImplementationCustomerFile(access.implementationId, fileId);
    if (!stored) return jsonResponse({ error: "Bestand niet gevonden." }, 404);

    return new Response(new Uint8Array(stored.data), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": implementationFileAttachmentHeader(stored.file.fileName),
        "Content-Length": String(stored.data.byteLength),
        "Content-Security-Policy": "sandbox",
        "Content-Type": stored.file.mimeType,
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Bestand downloaden mislukt.",
    }, 500);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ accessId: string; fileId: string }> },
) {
  try {
    const { access, fileId } = await verifiedRequest(request, context);
    if (!access) {
      return jsonResponse({ error: "Deze klantlink is ongeldig, verlopen of ingetrokken." }, 403);
    }
    const result = await deleteImplementationCustomerFile(access.implementationId, fileId);
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);
    return jsonResponse({ deleted: true });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Bestand verwijderen mislukt.",
    }, 500);
  }
}
