import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { executeLocalTableQuery, type LocalTableQuery } from "@/lib/local-table";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const verified = await requireLocalUser(request);
  if (!verified.ok) return jsonResponse({ error: verified.message }, 401);

  const body = await request.json().catch(() => null) as LocalTableQuery | null;
  if (!body?.table || !body.action) {
    return jsonResponse({ error: "Databaseverzoek mist gegevens." }, 400);
  }

  try {
    const result = await executeLocalTableQuery(body, {
      user: verified.user,
      profile: verified.profile,
    });

    if (result.error) {
      return jsonResponse({ error: result.error.message }, 400);
    }

    return jsonResponse({ data: result.data });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Databaseverzoek mislukt." }, 500);
  }
}
