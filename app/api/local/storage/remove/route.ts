import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { removeStoredFiles } from "@/lib/local-storage";

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
