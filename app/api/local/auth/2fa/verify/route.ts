import { NextResponse } from "next/server";
import {
  setLocalSessionCookie,
  setLocalTrustedDeviceCookie,
  verifyLocalTwoFactor,
} from "@/lib/local-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    challengeToken?: unknown;
    code?: unknown;
    rememberDevice?: unknown;
  } | null;
  const challengeToken = typeof body?.challengeToken === "string" ? body.challengeToken : "";
  const code = typeof body?.code === "string" ? body.code : "";
  const rememberDevice = body?.rememberDevice === true;

  if (!challengeToken || !code) {
    return jsonResponse({ error: "Vul de 2FA-code in." }, 400);
  }

  const result = await verifyLocalTwoFactor(challengeToken, code, rememberDevice);
  if ("error" in result) {
    return jsonResponse({ error: result.error }, 401);
  }

  const response = jsonResponse({ data: { session: result.session, user: result.session.user } });
  setLocalSessionCookie(response, result.session.access_token, result.session.expires_at);
  if (result.trustedDevice) {
    setLocalTrustedDeviceCookie(response, result.trustedDevice.token, result.trustedDevice.expiresAt);
  }
  return response;
}
