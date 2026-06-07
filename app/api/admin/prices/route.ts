import { NextResponse } from "next/server";
import { getServiceClient, verifyAdmin } from "@/lib/admin-api";
import { normalizePricingConfig } from "@/lib/price-config";
import { readStoredPricingConfig, writeStoredPricingConfig } from "@/lib/price-settings-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const result = await readStoredPricingConfig(getServiceClient());
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

    const body = (await request.json().catch(() => null)) as { pricingConfig?: unknown } | null;
    const pricingConfig = normalizePricingConfig(body?.pricingConfig);
    const saved = await writeStoredPricingConfig(service, pricingConfig);

    return jsonResponse({ ...saved, persisted: true, storageReady: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prijzen opslaan mislukt.";
    return jsonResponse({ error: message }, 500);
  }
}
