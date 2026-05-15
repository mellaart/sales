import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/supabase";

const allowedRoles: UserRole[] = ["sales", "support", "consultant", "manager", "admin"];

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server keys ontbreken.");
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

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "admin") {
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

    const body = (await request.json()) as { userId?: string; role?: UserRole };
    const userId = body.userId?.trim();
    const role = body.role;

    if (!userId || !role) {
      return NextResponse.json({ error: "userId en role zijn verplicht." }, { status: 400 });
    }

    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: "Ongeldige rol." }, { status: 400 });
    }

    if (userId === verified.requesterId && role !== "admin") {
      return NextResponse.json({ error: "Je kunt je eigen admin-rol niet verwijderen." }, { status: 400 });
    }

    const { data: existingProfile, error: profileLookupError } = await verified.service
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (profileLookupError) {
      return NextResponse.json({ error: profileLookupError.message }, { status: 500 });
    }

    let profileError: { message: string } | null = null;

    if (existingProfile) {
      const { error } = await verified.service.from("profiles").update({ role }).eq("id", userId);
      profileError = error;
    } else {
      const { data: authUserData, error: authUserError } = await verified.service.auth.admin.getUserById(userId);
      if (authUserError || !authUserData.user) {
        return NextResponse.json({ error: authUserError?.message ?? "Gebruiker niet gevonden." }, { status: 404 });
      }

      const { error } = await verified.service.from("profiles").insert({
        id: userId,
        role,
        email: authUserData.user.email ?? null,
        full_name: (authUserData.user.user_metadata?.full_name as string | undefined) ?? null,
      });
      profileError = error;
    }

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const { error: metadataError } = await verified.service.auth.admin.updateUserById(userId, {
      user_metadata: { role },
    });

    if (metadataError) {
      return NextResponse.json({ error: metadataError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Rol wijzigen mislukt." }, { status: 500 });
  }
}
