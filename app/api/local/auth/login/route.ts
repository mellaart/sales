import { NextResponse } from "next/server";
import { signInLocal } from "@/lib/local-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return jsonResponse({ error: "Vul e-mailadres en wachtwoord in." }, 400);
  }

  const result = await signInLocal(email, password);
  if ("error" in result) {
    return jsonResponse({ error: result.error }, 401);
  }

  if ("twoFactor" in result) {
    return jsonResponse({ data: { twoFactor: result.twoFactor } });
  }

  return jsonResponse({ error: "2FA-controle kon niet gestart worden." }, 500);
}
