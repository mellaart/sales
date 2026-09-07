import { NextResponse } from "next/server";
import { PASSWORD_RESET_MESSAGE, requestLocalPasswordReset } from "@/lib/local-password-reset";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { email?: unknown } | null;
    const result = await requestLocalPasswordReset(typeof body?.email === "string" ? body.email : "");
    return NextResponse.json(result.error ? { error: result.error } : { message: PASSWORD_RESET_MESSAGE }, {
      status: result.error ? 400 : 200, headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Wachtwoordherstel is tijdelijk niet beschikbaar. Probeer het later opnieuw of neem contact op met de beheerder." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
