import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/supabase";

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);

async function verifyAdmin(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return { ok: false as const, message: "Geen token ontvangen." };
  }

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
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

    const { data: profileRows, error: profileError } = await service
      .from("profiles")
      .select("id,role,full_name,email,created_at")
      .order("email", { ascending: true });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const { data: authData, error: authError } = await service.auth.admin.listUsers();
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    const authById = new Map((authData.users ?? []).map((user) => [user.id, user]));

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
      const authUser = authById.get(profile.id);
      const metadata = authUser?.user_metadata as Record<string, unknown> | undefined;
      const metadataFullName =
        normalizeText(metadata?.full_name) ??
        normalizeText(metadata?.name) ??
        normalizeText(metadata?.display_name);

      const profileEmail = normalizeText(profile.email);
      const authEmail = normalizeText(authUser?.email);
      const displayEmail = profileEmail ?? authEmail;

      return {
        id: profile.id,
        email: displayEmail,
        full_name: normalizeText(profile.full_name) ?? metadataFullName ?? (displayEmail ? displayEmail.split("@")[0] : null),
        role: profile.role ?? "sales",
        created_at: profile.created_at ?? authUser?.created_at ?? null,
        updated_at: authUser?.updated_at ?? null,
      };
    });

    return NextResponse.json({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

