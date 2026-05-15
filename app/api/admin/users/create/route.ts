import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/supabase";

const allowedRoles: UserRole[] = ["sales", "support", "consultant", "manager", "admin"];

function isMissingFullNameColumnError(message: string) {
  return (
    message.includes("Could not find the 'full_name' column of 'profiles' in the schema cache") ||
    message.includes("profiles.full_name does not exist")
  );
}

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

  return { ok: true, service } as const;
}

export async function POST(request: Request) {
  try {
    const verified = await verifyAdmin(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 403 });
    }

    const body = (await request.json()) as { email?: string; fullName?: string; role?: UserRole };
    const email = body.email?.trim().toLowerCase();
    const fullName = body.fullName?.trim() || null;
    const role = body.role;

    if (!email || !role) {
      return NextResponse.json({ error: "E-mail en rol zijn verplicht." }, { status: 400 });
    }

    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: "Ongeldige rol." }, { status: 400 });
    }

    const { data, error } = await verified.service.auth.admin.inviteUserByEmail(email, {
      data: { role, full_name: fullName, must_set_password: true },
    });

    if (error || !data.user) {
      return NextResponse.json({ error: error?.message ?? "Gebruiker aanmaken mislukt." }, { status: 400 });
    }

    let { error: profileError } = await verified.service.from("profiles").upsert({
      id: data.user.id,
      email,
      role,
      full_name: fullName,
    });

    if (profileError && isMissingFullNameColumnError(profileError.message)) {
      const fallbackResult = await verified.service.from("profiles").upsert({
        id: data.user.id,
        email,
        role,
      });
      profileError = fallbackResult.error;
    }

    if (profileError) {
      return NextResponse.json({ error: `Gebruiker aangemaakt, profiel bijwerken mislukt: ${profileError.message}` }, { status: 500 });
    }

    return NextResponse.json({ id: data.user.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gebruiker aanmaken mislukt." }, { status: 500 });
  }
}
