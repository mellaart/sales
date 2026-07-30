import { NextResponse } from "next/server";
import { getServiceClient, verifyAdmin } from "@/lib/admin-api";
import {
  readStoredRoleTabAccess,
  writeStoredRoleTabAccess,
} from "@/lib/role-tab-access-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const service = getServiceClient();
  const result = await readStoredRoleTabAccess(service);

  return jsonResponse(result);
}

export async function POST(request: Request) {
  try {
    const service = getServiceClient();

    if (!service) {
      return jsonResponse({ error: "Server configuratie ontbreekt." }, 500);
    }

    const verified = await verifyAdmin(request, service);
    if (!verified.ok) {
      return jsonResponse({ error: verified.message }, 403);
    }

    const body = (await request.json().catch(() => null)) as { roleTabAccess?: unknown } | null;
    return jsonResponse(await writeStoredRoleTabAccess(service, body?.roleTabAccess));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rolrechten opslaan mislukt.";
    return jsonResponse({ error: message }, 500);
  }
}
