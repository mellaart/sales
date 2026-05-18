import { NextResponse } from "next/server";
import { getRelationById } from "@/lib/smart-trade-api";

export async function GET(
  request: Request,
  _request: Request,
  context: { params: Promise<{ relationId: string }> },
) {
  try {
    const { relationId } = await context.params;
    const id = relationId?.trim();
    const url = new URL(request.url);

    if (!id) {
      return NextResponse.json({ error: "relationId is verplicht." }, { status: 400 });
    }

    const relation = await getRelationById(id, {
      baseUrl: url.searchParams.get("baseUrl") ?? undefined,
      company: url.searchParams.get("company") ?? undefined,
      user: url.searchParams.get("user") ?? undefined,
      password: url.searchParams.get("password") ?? undefined,
    });

    const relation = await getRelationById(id);
    return NextResponse.json(
      { relation },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Relatie ophalen mislukt." },
      { status: 500 },
    );
  }
}
