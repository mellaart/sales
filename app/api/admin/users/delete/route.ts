import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { ensureProtectedAdminRole } from "@/lib/protected-admin-server";
import { createLocalServiceClient } from "@/lib/local-service-client";

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

  return { ok: true, service, requesterId: userData.user.id } as const;
}

export async function POST(request: Request) {
  try {
    const verified = await verifyAdmin(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 403 });
    }

    const body = (await request.json()) as { userId?: string };
    const userId = body.userId?.trim();

    if (!userId) {
      return NextResponse.json({ error: "userId is verplicht." }, { status: 400 });
    }

    if (userId === verified.requesterId) {
      return NextResponse.json({ error: "Je kunt jezelf niet verwijderen." }, { status: 400 });
    }

    const { data: targetProfile } = await verified.service
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    const { data: targetUserData } = await verified.service.auth.admin.getUserById(userId);

    if (
      isProtectedAdminEmail((targetProfile as { email?: string | null } | null)?.email) ||
      isProtectedAdminEmail(targetUserData.user?.email)
    ) {
      return NextResponse.json({ error: "Deze beschermde admin-gebruiker kan niet worden verwijderd." }, { status: 400 });
    }

    const { error } = await verified.service.auth.admin.deleteUser(userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gebruiker verwijderen mislukt." }, { status: 500 });
  }
}
