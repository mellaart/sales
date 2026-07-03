import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { readStoredFile } from "@/lib/local-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const verified = await requireLocalUser(request);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.message }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const url = new URL(request.url);
  const bucket = url.searchParams.get("bucket") || "";
  const filePath = url.searchParams.get("path") || "";

  if (!bucket || !filePath) {
    return NextResponse.json({ error: "Bestand ontbreekt." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const file = await readStoredFile(bucket, filePath);
    return new NextResponse(file, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/octet-stream",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bestand downloaden mislukt." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
}
