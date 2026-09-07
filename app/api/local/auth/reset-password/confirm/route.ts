import { NextResponse } from "next/server";
import { completeLocalPasswordReset } from "@/lib/local-password-reset";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { token?: unknown; password?: unknown } | null;
    const result = await completeLocalPasswordReset(
      typeof body?.token === "string" ? body.token : "",
      typeof body?.password === "string" ? body.password : "",
    );
    return NextResponse.json(result.error ? { error: result.error } : { success: true }, {
      status: result.error ? 400 : 200, headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Wachtwoord wijzigen is tijdelijk niet beschikbaar. Probeer het opnieuw." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
