import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { blobToBuffer, writeStoredFile } from "@/lib/local-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const verified = await requireLocalUser(request);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.message }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const formData = await request.formData().catch(() => null);
  const bucket = typeof formData?.get("bucket") === "string" ? formData.get("bucket") as string : "";
  const filePath = typeof formData?.get("path") === "string" ? formData.get("path") as string : "";
  const file = formData?.get("file");

  if (!bucket || !filePath || !file || typeof file === "string") {
    return NextResponse.json({ error: "Uploadgegevens ontbreken." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    await writeStoredFile(bucket, filePath, await blobToBuffer(file));
    return NextResponse.json({ data: { path: filePath } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bestand uploaden mislukt." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
