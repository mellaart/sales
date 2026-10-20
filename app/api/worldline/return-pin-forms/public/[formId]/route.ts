import { NextResponse } from "next/server";
import {
  acceptPublicWorldlineReturnPinForm,
  returnPinDeviceCookie,
  returnPinCookieName,
  returnPinSmsAction,
  getPublicWorldlineReturnPinForm,
} from "@/lib/worldline-return-pin-server";

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

function tokenValues(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  return {
    token: searchParams.get("token")?.trim() ?? "",
    tokenVersion: Number(searchParams.get("v") ?? 0),
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ formId: string }> },
) {
  try {
    const { formId } = await context.params;
    const { token, tokenVersion } = tokenValues(request);
    const result = await getPublicWorldlineReturnPinForm(formId, tokenVersion, token, returnPinDeviceCookie(request, formId));
    if ("error" in result) return jsonResponse({ error: result.error }, 404);
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Retourpinnenformulier laden mislukt.",
    }, 500);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ formId: string }> },
) {
  try {
    const { formId } = await context.params;
    const { token, tokenVersion } = tokenValues(request);
    const body = await request.json().catch(() => null) as {
      action?: unknown;
      code?: unknown;
      formData?: unknown;
      confirmed?: unknown;
    } | null;
    if (body?.action === "send" || body?.action === "verify") {
      const result = await returnPinSmsAction(formId, tokenVersion, token, body.action, typeof body.code === "string" ? body.code : "");
      const response = jsonResponse({ sent: result.sent, verified: result.verified });
      if (result.deviceToken) response.cookies.set({ name: returnPinCookieName(formId), value: result.deviceToken,
        httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: new Date(result.expires) });
      return response;
    }
    const result = await acceptPublicWorldlineReturnPinForm(
      request,
      formId,
      tokenVersion,
      token,
      body?.formData,
      body?.confirmed === true,
    );

    if ("error" in result) return jsonResponse({ error: result.error }, 400);
    return jsonResponse({ form: result.form });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Goedkeuring vastleggen mislukt.",
    }, 500);
  }
}
