import { createClient } from "@supabase/supabase-js";

export type UserRole = "sales" | "manager" | "admin" | "support" | "consultant";

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