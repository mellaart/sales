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

  return { ok: true, service } as const;
}

export async function POST(request: Request) {
  try {
    const verified = await verifyAdmin(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 403 });
    }

    const body = (await request.json()) as { email?: string; password?: string; role?: UserRole };
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const role = body.role;

    if (!email || !password || !role) {
      return NextResponse.json({ error: "E-mail, wachtwoord en rol zijn verplicht." }, { status: 400 });
    }

    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: "Ongeldige rol." }, { status: 400 });
    }

    const { data, error } = await verified.service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
    });

    if (error || !data.user) {
      return NextResponse.json({ error: error?.message ?? "Gebruiker aanmaken mislukt." }, { status: 400 });
    }

    const { error: profileError } = await verified.service.from("profiles").upsert({
      id: data.user.id,
      email,
      role,
    });

    if (profileError) {
      return NextResponse.json({ error: `Gebruiker aangemaakt, profiel bijwerken mislukt: ${profileError.message}` }, { status: 500 });
    }

    return NextResponse.json({ id: data.user.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gebruiker aanmaken mislukt." }, { status: 500 });
  }
}
