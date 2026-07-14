import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createLocalServiceClient } from "@/lib/local-service-client";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { ensureProtectedAdminRole } from "@/lib/protected-admin-server";

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

function createTemporaryPassword() {
  return randomBytes(12).toString("base64url");
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

    const { data: targetUserData, error: targetUserError } = await verified.service.auth.admin.getUserById(userId);
    const targetUser = targetUserData.user;

    if (targetUserError || !targetUser) {
      return NextResponse.json({ error: targetUserError?.message || "Gebruiker niet gevonden." }, { status: 404 });
    }

    if (isProtectedAdminEmail(targetUser.email)) {
      return NextResponse.json(
        { error: "Het wachtwoord van de beschermde admin wijzig je via het accountmenu." },
        { status: 400 },
      );
    }

    const temporaryPassword = createTemporaryPassword();
    const { error } = await verified.service.auth.admin.updateUserById(userId, {
      password: temporaryPassword,
      user_metadata: {
        ...(targetUser.user_metadata ?? {}),
        must_set_password: true,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { success: true, temporaryPassword },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Wachtwoord resetten mislukt." },
      { status: 500 },
    );
  }
}
