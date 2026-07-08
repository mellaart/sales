import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resetLocalTwoFactorForUser } from "@/lib/local-auth";
import { isSelfHostedMode } from "@/lib/local-db";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { ensureProtectedAdminRole } from "@/lib/protected-admin-server";
import { createLocalServiceClient } from "@/lib/local-service-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return createLocalServiceClient() as unknown as ReturnType<typeof createClient>;
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function verifyAdmin(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return { ok: false, message: "Niet ingelogd." } as const;

  const service = getServiceClient();
  const { data: userData, error: userError } = await service.auth.getUser(token);

  if (userError || !userData.user) return { ok: false, message: "Ongeldige sessie." } as const;

  await ensureProtectedAdminRole(service, userData.user);

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!isProtectedAdminEmail(userData.user.email) && (profileError || !profile || profile.role !== "admin")) {
    return { ok: false, message: "Geen toegang." } as const;
  }

  return { ok: true, service } as const;
}

export async function POST(request: Request) {
  try {
    const verified = await verifyAdmin(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as { userId?: unknown } | null;
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";

    if (!userId) {
      return NextResponse.json({ error: "userId is verplicht." }, { status: 400 });
    }

    if (isSelfHostedMode()) {
      const result = await resetLocalTwoFactorForUser(userId);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    const { error } = await verified.service
      .from("profiles")
      .update({
        two_factor_enabled: false,
        two_factor_secret: null,
        two_factor_enabled_at: null,
        two_factor_last_verified_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "2FA resetten mislukt." }, { status: 500 });
  }
}
