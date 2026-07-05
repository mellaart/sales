import { NextResponse } from "next/server";
import { getServiceClient, type ServiceClient } from "@/lib/admin-api";
import { normalizePricingConfig } from "@/lib/price-config";
import { readStoredPricingConfig, writeStoredPricingConfig } from "@/lib/price-settings-storage";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { ensureProtectedAdminRole } from "@/lib/protected-admin-server";
import { ROLE_TAB_ACCESS, canWriteTab, normalizeRoleTabAccess } from "@/lib/role-tabs";
import type { AppTabKey } from "@/lib/role-tabs";
import type { UserRole } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readRoleTabAccess(service: ServiceClient) {
  const { data, error } = await service.storage.from("smart-trade-settings").download("role-tab-access.json");

  if (error || !data) {
    return ROLE_TAB_ACCESS;
  }

  try {
    const parsed = JSON.parse(await data.text()) as unknown;
    const source = parsed && typeof parsed === "object" && "roleTabAccess" in parsed
      ? (parsed as { roleTabAccess?: unknown }).roleTabAccess
      : parsed;

    return normalizeRoleTabAccess(source);
  } catch {
    return ROLE_TAB_ACCESS;
  }
}

type PriceSettingsTabKey = Extract<AppTabKey, "prices" | "postcode">;

function normalizePriceSettingsTabKey(value: unknown): PriceSettingsTabKey {
  return value === "postcode" ? "postcode" : "prices";
}

async function verifyCanWritePriceSettings(request: Request, service: ServiceClient, tabKey: PriceSettingsTabKey) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return { ok: false as const, message: "Niet ingelogd." };

  const { data: userData, error: userError } = await service.auth.getUser(token);

  if (userError || !userData.user) {
    return { ok: false as const, message: "Ongeldige sessie." };
  }

  await ensureProtectedAdminRole(service, userData.user);

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!isProtectedAdminEmail(userData.user.email) && (profileError || !profile)) {
    return { ok: false as const, message: "Geen toegang." };
  }

  const role = isProtectedAdminEmail(userData.user.email)
    ? "admin"
    : ((profile as { role?: UserRole } | null)?.role ?? null);
  const roleTabAccess = await readRoleTabAccess(service);

  if (!canWriteTab(role, tabKey, roleTabAccess)) {
    return { ok: false as const, message: `Geen schrijfrechten voor ${tabKey === "postcode" ? "Postcode" : "Prijzen"}.` };
  }

  return { ok: true as const };
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

    const body = (await request.json().catch(() => null)) as { pricingConfig?: unknown; tabKey?: unknown } | null;
    const tabKey = normalizePriceSettingsTabKey(body?.tabKey);
    const verified = await verifyCanWritePriceSettings(request, service, tabKey);
    if (!verified.ok) {
      return jsonResponse({ error: verified.message }, 403);
    }

    const pricingConfig = normalizePricingConfig(body?.pricingConfig);
    const saved = await writeStoredPricingConfig(service, pricingConfig);

    return jsonResponse({ ...saved, persisted: true, storageReady: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prijzen opslaan mislukt.";
    return jsonResponse({ error: message }, 500);
  }
}
