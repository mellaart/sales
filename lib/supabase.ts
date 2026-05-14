import { createClient } from "@supabase/supabase-js";

export type UserRole = "sales" | "manager" | "admin" | "support" | "consultant";

export type ProfileRecord = {
  id: string;
  email: string | null;
  full_name?: string | null;
  role: UserRole;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DealCalculatorInputs = {
  extraUsers: number;
  selectedPackage: string;
  manualImplementationAdjustment: number;
  includeVat: boolean;
  quantities: Record<string, number>;
};

export type DealRecord = {
  id: string;
  user_id?: string | null;

  customer_name?: string | null;
  contact_name?: string | null;
  quote_title?: string | null;

  sales_name?: string | null;
notes?: string | null;

  package_key?: string | null;
  package_name?: string | null;
  selected_package?: string | null;

  total_users?: number | null;
  extra_users?: number | null;

  monthly_price?: number | null;
  monthly_total?: number | null;
  implementation_price?: number | null;
  implementation_base?: number | null;
  manual_implementation_adjustment?: number | null;

  include_vat?: boolean | null;

  calculator_inputs?: DealCalculatorInputs | null;
  modules?: Array<{ key?: string; qty?: number }> | null;

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

  const profileSelects = [
    "id,email,full_name,role,created_at,updated_at",
    "id,email,full_name,role,created_at",
    "id,email,role,created_at,updated_at",
    "id,email,role,created_at",
  ];

  for (const selectFields of profileSelects) {
    const { data, error } = await supabase
      .from("profiles")
      .select(selectFields)
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      const isSchemaColumnError =
        error.message.includes("profiles.full_name does not exist") ||
        error.message.includes("profiles.updated_at does not exist");

      if (isSchemaColumnError) {
        continue;
      }

      return null;
    }

    if (!data) {
      return null;
    }

    const profile = data as ProfileRecord;

    return {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name ?? null,
      role: profile.role,
      created_at: profile.created_at,
      updated_at: profile.updated_at ?? null,
    };
  }

  return null;

}
