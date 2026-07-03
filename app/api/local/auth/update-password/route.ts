import { NextResponse } from "next/server";
import { readBearerToken, updateLocalPassword } from "@/lib/local-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  const result = await updateLocalPassword(readBearerToken(request), password);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ data: true }, { headers: { "Cache-Control": "no-store" } });
}
