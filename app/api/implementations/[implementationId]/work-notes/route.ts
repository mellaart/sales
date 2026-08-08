import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { saveConsultantImplementationWorkItemNote } from "@/lib/implementation-portal-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ implementationId: string }> },
) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);
    const { implementationId } = await context.params;
    const body = await request.json().catch(() => ({})) as {
      workItemKey?: unknown;
      text?: unknown;
    };
    const result = await saveConsultantImplementationWorkItemNote(
      implementationId,
      verified,
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
