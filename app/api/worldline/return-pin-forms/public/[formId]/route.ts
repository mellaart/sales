import { NextResponse } from "next/server";
import {
  acceptPublicWorldlineReturnPinForm,
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
    const result = await getPublicWorldlineReturnPinForm(formId, tokenVersion, token);
    if ("error" in result) return jsonResponse({ error: result.error }, 404);
    return jsonResponse({ form: result.form });
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
      formData?: unknown;
      confirmed?: unknown;
    } | null;
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
