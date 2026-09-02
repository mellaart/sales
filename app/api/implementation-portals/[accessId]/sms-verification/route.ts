import { NextResponse } from "next/server";
import {
  getImplementationPortalDeviceCookieName,
  startImplementationPortalSmsVerification,
  verifyImplementationPortalSmsCode,
} from "@/lib/implementation-portal-server";

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

export async function POST(
  request: Request,
  context: { params: Promise<{ accessId: string }> },
) {
  try {
    const { accessId } = await context.params;
    const body = await request.json().catch(() => ({})) as {
      action?: unknown;
      token?: unknown;
      version?: unknown;
      code?: unknown;
    };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const tokenVersion = Number(body.version ?? 0);

    if (body.action === "send") {
      const result = await startImplementationPortalSmsVerification(accessId, tokenVersion, token);
      if (!result.ok) return jsonResponse({ error: result.error }, result.status);
      return jsonResponse({ sent: true, mobilePhone: result.mobilePhone });
    }

    if (body.action === "verify") {
      const result = await verifyImplementationPortalSmsCode(
        accessId,
        tokenVersion,
        token,
        typeof body.code === "string" ? body.code : "",
      );
      if (!result.ok) return jsonResponse({ error: result.error }, result.status);

      const response = jsonResponse({ verified: true });
      response.cookies.set({
        name: getImplementationPortalDeviceCookieName(accessId),
        value: result.deviceToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: new Date(result.expiresAt),
      });
      return response;
    }

    return jsonResponse({ error: "Ongeldige sms-verificatieactie." }, 400);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "SMS-verificatie mislukt.",
    }, 500);
  }
}
