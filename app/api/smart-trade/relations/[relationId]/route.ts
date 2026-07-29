import { NextResponse } from "next/server";
import {
  getPrimaryContactPersonForRelation,
  getRelationById,
} from "@/lib/smart-trade-api";

export async function GET(
  request: Request,
  context: { params: Promise<{ relationId: string }> },
) {
  try {
    const { relationId } = await context.params;
    const id = relationId?.trim();
    const url = new URL(request.url);

    if (!id) {
      return NextResponse.json({ error: "relationId is verplicht." }, { status: 400 });
    }

    const overrides = {
      baseUrl: url.searchParams.get("baseUrl") ?? undefined,
      company: url.searchParams.get("company") ?? undefined,
      user: url.searchParams.get("user") ?? undefined,
      password: url.searchParams.get("password") ?? undefined,
    };
    const [relation, primaryContactResult] = await Promise.all([
      getRelationById(id, overrides),
      getPrimaryContactPersonForRelation(id, overrides)
        .then((primaryContact) => ({ primaryContact, error: null }))
        .catch((error) => ({
          primaryContact: null,
          error: error instanceof Error ? error.message : "Primaire contactpersoon ophalen mislukt.",
        })),
    ]);

    return NextResponse.json(
      {
        relation,
        primaryContact: primaryContactResult.primaryContact,
        primaryContactError: primaryContactResult.error,
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Relatie ophalen mislukt." },
      { status: 500 },
    );
  }
}
