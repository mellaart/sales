import { NextResponse } from "next/server";
import { savePublicImplementationWorkItemNote } from "@/lib/implementation-portal-server";

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
    const searchParams = new URL(request.url).searchParams;
    const token = searchParams.get("token")?.trim() ?? "";
    const tokenVersion = Number(searchParams.get("v") ?? 0);
    const body = await request.json().catch(() => ({})) as {
      workItemKey?: unknown;
      text?: unknown;
    };
    const result = await savePublicImplementationWorkItemNote(
      accessId,
      tokenVersion,
      token,
      typeof body.workItemKey === "string" ? body.workItemKey : "",
      typeof body.text === "string" ? body.text : "",
    );
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);
    return jsonResponse({ notes: result.notes, noteSet: result.noteSet });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Opmerking opslaan mislukt.",
    }, 500);
  }
}
