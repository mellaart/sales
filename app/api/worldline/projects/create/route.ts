import { NextResponse } from "next/server";
import { getServiceClient, type ServiceClient } from "@/lib/admin-api";
import { ensureProtectedAdminRole } from "@/lib/protected-admin-server";
import { DEFAULT_WORLDLINE_AGREEMENT_FIELDS, type WorldlineProject } from "@/lib/worldline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CreateWorldlineProjectBody = {
  relationId?: unknown;
  relationName?: unknown;
  relationEmail?: unknown;
  debtorNumber?: unknown;
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalizeText(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

async function verifyUser(request: Request, service: ServiceClient) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return { ok: false as const, message: "Niet ingelogd." };

  const { data: userData, error: userError } = await service.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false as const, message: "Ongeldige sessie." };
  }

  await ensureProtectedAdminRole(service, userData.user);

  return {
    ok: true as const,
    userId: userData.user.id,
  };
}

export async function POST(request: Request) {
  try {
    const service = getServiceClient();
    if (!service) {
      return jsonResponse({ error: "Server configuratie ontbreekt." }, 500);
    }

    const verified = await verifyUser(request, service);
    if (!verified.ok) {
      return jsonResponse({ error: verified.message }, 401);
    }

    const body = (await request.json().catch(() => null)) as CreateWorldlineProjectBody | null;
    const relationId = normalizeText(body?.relationId);
    const relationName = normalizeText(body?.relationName);
    const relationEmail = normalizeText(body?.relationEmail);
    const debtorNumber = normalizeText(body?.debtorNumber);

    if (!relationId || !relationName) {
      return jsonResponse({ error: "Relatiegegevens ontbreken." }, 400);
    }

    const { data, error } = await service
      .from("worldline_projects")
      .insert({
        relation_id: relationId,
        relation_name: relationName,
        relation_email: relationEmail || null,
        debtor_number: debtorNumber || null,
        status: "concept",
        agreement_fields: DEFAULT_WORLDLINE_AGREEMENT_FIELDS,
        created_by: verified.userId,
      } as never)
      .select("*")
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ project: data as WorldlineProject });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worldline-project aanmaken mislukt.";
    return jsonResponse({ error: message }, 500);
  }
}
