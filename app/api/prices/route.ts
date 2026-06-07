import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin-api";
import { readStoredPricingConfig } from "@/lib/price-settings-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const result = await readStoredPricingConfig(getServiceClient());

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
