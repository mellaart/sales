import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { removeStoredFiles } from "@/lib/local-storage";
import { WORLDLINE_DOCUMENT_BUCKET } from "@/lib/worldline";
import { getLocalWorldlinePermission } from "@/lib/worldline-access-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const verified = await requireLocalUser(request);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.message }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const body = await request.json().catch(() => null) as { bucket?: unknown; paths?: unknown } | null;
  const bucket = typeof body?.bucket === "string" ? body.bucket : "";
  const paths = Array.isArray(body?.paths) ? body.paths.filter((item): item is string => typeof item === "string") : [];

  if (!bucket || paths.length === 0) {
    return NextResponse.json({ error: "Geen bestanden geselecteerd." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  if (
    bucket === WORLDLINE_DOCUMENT_BUCKET &&
    await getLocalWorldlinePermission(verified.profile) !== "write"
  ) {
    return NextResponse.json({ error: "Geen schrijfrechten voor Worldline." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  try {
    await removeStoredFiles(bucket, paths);
    return NextResponse.json({ data: paths.map((name) => ({ name })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bestand verwijderen mislukt." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
