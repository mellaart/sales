import { createClient } from "@supabase/supabase-js";

export type UserRole = "sales" | "manager" | "admin" | "support" | "consultant";

export type ProfileRecord = {
  id: string;
  email: string | null;
  role: UserRole;
  created_at?: string | null;
  updated_at?: string | null;
};

let client: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  if (!client) {
    client = createClient(url, anonKey);
  }

  return client;
}

export function canManageRoles(role: UserRole | null) {
  return role === "admin";
}

export function canViewAllDeals(role: UserRole | null) {
  return role === "admin" || role === "manager" || role === "support";
}

export async function fetchProfile(userId: string): Promise<ProfileRecord | null> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,role,created_at,updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    email: data.email,
    role: data.role as UserRole,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}