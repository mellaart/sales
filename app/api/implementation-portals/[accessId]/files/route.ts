import { NextResponse } from "next/server";
import { storeImplementationCustomerFile } from "@/lib/implementation-files-server";
import {
  getImplementationPortalDeviceTokenFromRequest,
  getVerifiedImplementationPortalAccess,
} from "@/lib/implementation-portal-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ accessId: string }> },
) {
  try {
    const { accessId } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const token = searchParams.get("token")?.trim() ?? "";
    const tokenVersion = Number(searchParams.get("v") ?? 0);
    const access = await getVerifiedImplementationPortalAccess(
      accessId,
      tokenVersion,
      token,
      getImplementationPortalDeviceTokenFromRequest(request, accessId),
    );
    if (!access) {
      return jsonResponse({ error: "Deze klantlink is ongeldig, verlopen of ingetrokken." }, 403);
    }

    const formData = await request.formData();
    const category = formData.get("category");
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonResponse({ error: "Kies eerst een bestand." }, 400);
    }

    const result = await storeImplementationCustomerFile(
      access.implementationId,
      category,
      file,
    );
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);
    return jsonResponse({ file: result.file }, 201);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Bestand uploaden mislukt.",
    }, 500);
  }
}
