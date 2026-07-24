import { NextResponse } from "next/server";
import {
  generateLocalTwoFactorRecoveryCodes,
  getLocalTwoFactorRecoveryCodeStatus,
  requireLocalUser,
} from "@/lib/local-auth";
import { isSelfHostedMode } from "@/lib/local-db";
import { isProtectedAdminEmail } from "@/lib/protected-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function requireProtectedAdmin(request: Request) {
  if (!isSelfHostedMode()) {
    return { ok: false as const, status: 400, message: "Herstelcodes zijn alleen beschikbaar op de eigen server." };
  }

  const verified = await requireLocalUser(request);
  if (!verified.ok) {
    return { ok: false as const, status: 401, message: verified.message };
  }

  if (!isProtectedAdminEmail(verified.user.email)) {
    return { ok: false as const, status: 403, message: "Alleen de beschermde admin heeft toegang." };
  }

  return { ok: true as const, userId: verified.user.id };
}

export async function GET(request: Request) {
  try {
    const verified = await requireProtectedAdmin(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, verified.status);

    const status = await getLocalTwoFactorRecoveryCodeStatus(verified.userId);
    return jsonResponse(status);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Herstelcodes laden mislukt." },
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    const verified = await requireProtectedAdmin(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, verified.status);

    const body = await request.json().catch(() => null) as { currentTwoFactorCode?: unknown } | null;
    const currentTwoFactorCode = typeof body?.currentTwoFactorCode === "string"
      ? body.currentTwoFactorCode
      : "";

    if (!/^\d{6}$/.test(currentTwoFactorCode)) {
      return jsonResponse({ error: "Vul je huidige 6-cijferige 2FA-code in." }, 400);
    }

    const result = await generateLocalTwoFactorRecoveryCodes(verified.userId, currentTwoFactorCode);
    if ("error" in result) return jsonResponse({ error: result.error }, 400);

    return jsonResponse(result);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Herstelcodes maken mislukt." },
      500,
    );
  }
}
