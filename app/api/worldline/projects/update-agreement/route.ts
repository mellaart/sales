import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin-api";
import { normalizeWorldlineAgreementFields, type WorldlineProject } from "@/lib/worldline";
import { verifyWorldlineAccess } from "@/lib/worldline-access-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type UpdateAgreementBody = {
  projectId?: unknown;
  agreementFields?: unknown;
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const service = getServiceClient();
    if (!service) {
      return jsonResponse({ error: "Server configuratie ontbreekt." }, 500);
    }

    const verified = await verifyWorldlineAccess(request, service, "write");
    if (!verified.ok) {
      return jsonResponse({ error: verified.message }, verified.status);
    }

    const body = (await request.json().catch(() => null)) as UpdateAgreementBody | null;
    const projectId = normalizeText(body?.projectId);

    if (!projectId) {
      return jsonResponse({ error: "Geen Worldline-project ontvangen." }, 400);
    }

    const { data: projectRow, error: projectError } = await service
      .from("worldline_projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError || !projectRow) {
      return jsonResponse({ error: projectError?.message ?? "Worldline-project niet gevonden." }, 404);
    }

    const nextAgreementFields = normalizeWorldlineAgreementFields(body?.agreementFields);
    const { data, error } = await service
      .from("worldline_projects")
      .update({
        agreement_fields: nextAgreementFields,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", projectId)
      .select("*")
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ project: data as WorldlineProject });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Aansluitgegevens opslaan mislukt.";
    return jsonResponse({ error: message }, 500);
  }
}
