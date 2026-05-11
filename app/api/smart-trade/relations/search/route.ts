import { NextResponse } from "next/server";
import { getRelationName, searchRelations } from "@/lib/smart-trade-api";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("query") ?? "";

    const relations = await searchRelations(query);

    return NextResponse.json({
      relations: relations.slice(0, 20).map((relation) => ({
        id: String(relation.id),
        name: getRelationName(relation),
        email: relation.email ?? null,
        debtorNumber: relation.debtorNumber ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Relaties zoeken mislukt." },
      { status: 500 },
    );
  }
}
