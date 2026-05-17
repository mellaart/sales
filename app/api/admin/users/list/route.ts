import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/supabase";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  return createClient(url, anonKey);
}

async function verifyAdmin(request: Request) {
  const service = getServiceClient();
  const anon = getAnonClient();

  if (!service || !anon) {
    return { ok: false as const, message: "Server configuratie ontbreekt." };
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return { ok: false as const, message: "Geen token ontvangen." };
  }

  const { data: userData, error: userError } = await anon.auth.getUser(token);

  if (userError || !userData.user) {
    return { ok: false as const, message: "Ongeldige sessie." };
  }

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "admin") {
    return { ok: false as const, message: "Alleen admins hebben toegang." };
  }

  return { ok: true as const };
}

export async function GET(request: Request) {
  try {
    const verified = await verifyAdmin(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 401 });
    }

    const service = getServiceClient();
    if (!service) {
      return NextResponse.json({ error: "Server configuratie ontbreekt." }, { status: 500 });
    }

    const { data: profileRows, error: profileError } = await service
      .from("profiles")
      .select("id,role,full_name,email,created_at")
      .order("email", { ascending: true });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }


    const normalizeText = (value: unknown): string | null => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const users = (profileRows ?? []).map((profileRow) => {
      const profile = profileRow as {
        id: string;
        role?: UserRole;
        full_name?: string | null;
        email?: string | null;
        created_at?: string | null;
      };

      const email = normalizeText(profile.email);

      return {
        id: profile.id,
        email,
        full_name: normalizeText(profile.full_name) ?? (email ? email.split("@")[0] : null),
        role: profile.role ?? "sales",
        created_at: profile.created_at ?? null,
        updated_at: null,
      };
    });

    return NextResponse.json({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

