import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null = null;

export type UserRole = "sales" | "manager" | "admin";

export type ProfileRecord = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  created_at: string;
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
  user_id: string;
  created_at: string;
  customer_name: string | null;
  quote_title: string;
  contact_name: string | null;
  sales_name: string | null;
  valid_until: string | null;
  package_key: string;
  package_name: string;
  total_users: number;
  contract_months: number;
  discount_pct: number;
  include_vat: boolean;
  manual_monthly_adjustment: number;
  manual_implementation_adjustment: number;
  monthly_base: number;
  monthly_total: number;
  implementation_total: number;
  contract_value: number;
  annual_recurring: number;
  modules: unknown[];
  notes: string | null;
  calculator_inputs?: DealCalculatorInputs | null;
};

function hasSupabaseEnv() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseClient() {
  if (!hasSupabaseEnv()) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
}

export type AuthState = {
  user: User | null;
  session: Session | null;
};

export async function fetchProfile(userId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) {
    throw error;
  }
  return (data as ProfileRecord | null) ?? null;
}

export function canViewAllDeals(role: UserRole | null | undefined) {
  return role === "manager" || role === "admin";
}

export function canManageRoles(role: UserRole | null | undefined) {
  return role === "admin";
}
