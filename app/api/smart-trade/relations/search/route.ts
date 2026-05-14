import { NextResponse } from "next/server";
import { getRelationName, searchRelations } from "@/lib/smart-trade-api";

const MAX_QUERY_LENGTH = 120;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawQuery = url.searchParams.get("query") ?? "";
    const query = rawQuery.trim();

    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json(
        { error: `query mag maximaal ${MAX_QUERY_LENGTH} tekens bevatten.` },
        { status: 400 },
      );
    }

    const relations = await searchRelations(query);

    return NextResponse.json(
      {
        relations: relations.slice(0, 20).map((relation) => ({
          id: String(relation.id),
          name: getRelationName(relation),
          email: relation.email ?? null,
          debtorNumber: relation.debtorNumber ?? null,
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Relaties zoeken mislukt." },
      { status: 500 },
    );
  }
}
