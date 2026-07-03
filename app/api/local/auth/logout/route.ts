import { NextResponse } from "next/server";
import { clearLocalSessionCookie, readBearerToken, signOutLocal } from "@/lib/local-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  await signOutLocal(readBearerToken(request));
  const response = NextResponse.json({ data: true }, { headers: { "Cache-Control": "no-store" } });
  clearLocalSessionCookie(response);
  return response;
}
