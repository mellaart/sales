import { NextResponse } from "next/server";
import { getLocalSessionFromRequest, setLocalSessionCookie } from "@/lib/local-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getLocalSessionFromRequest(request);
  const response = NextResponse.json(
    { data: { session, user: session?.user ?? null } },
    { headers: { "Cache-Control": "no-store" } },
  );

  if (session) {
    setLocalSessionCookie(response, session.access_token, session.expires_at);
  }

  return response;
}
