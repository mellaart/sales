import { createClient, type User } from "@supabase/supabase-js";
import { getEffectiveUserRole, getProtectedAdminProfile } from "@/lib/protected-admin";
import type { QuoteLayoutKey } from "@/lib/quote-layouts";
import { getLocalBrowserClient } from "@/lib/local-browser-client";

export type UserRole = "sales" | "manager" | "admin" | "support" | "consultant" | "worldline";

export type ProfileRecord = {
  id: string;
  email: string | null;
  full_name?: string | null;
  job_title?: string | null;
  workdays?: string | null;
  mobile_phone?: string | null;
  role: UserRole;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AssetExpansionLine = {
  group: string;
  label: string;
  quantity: number;
  cadence: "monthly" | "annual" | "once";
  amount: number;
  note?: string | null;
};

export type AssetExpansionSummary = {
  source: "assets";
  relationId: string;
  relationName: string;
  currentPackageName?: string | null;
  targetPackageName?: string | null;
  createdAt: string;
  lines: AssetExpansionLine[];
};

export type DealCalculatorInputs = {
  extraUsers: number;
  selectedPackage: string;
  manualImplementationAdjustment: number;
  includeVat: boolean;
  quantities: Record<string, number>;
  includeSupport?: boolean;
  customerPortalOptionKeys?: string[];
  smartConnectConnections?: number;
  includeTravelCosts?: boolean;
  travelPostcodePrefix?: string;
  travelCostPerDay?: number;
  travelCostTotal?: number;
  travelRegion?: number | null;
  quoteLayout?: QuoteLayoutKey;
  assetsExpansion?: AssetExpansionSummary | null;
};

export type DealRecord = {
  id: string;
  user_id?: string | null;

  customer_name?: string | null;
  contact_name?: string | null;
  quote_title?: string | null;

  sales_name?: string | null;
  notes?: string | null;
  valid_until?: string | null;

  package_key?: string | null;
  package_name?: string | null;
  selected_package?: string | null;

  total_users?: number | null;
  extra_users?: number | null;
  contract_months?: number | null;
  discount_pct?: number | null;

  monthly_base?: number | null;
  monthly_price?: number | null;
  monthly_total?: number | null;
  implementation_price?: number | null;
  implementation_base?: number | null;
  implementation_total?: number | null;
  manual_monthly_adjustment?: number | null;
  manual_implementation_adjustment?: number | null;
  contract_value?: number | null;
  annual_recurring?: number | null;

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
    if (typeof window === "undefined") return null;
    return getLocalBrowserClient() as unknown as ReturnType<typeof createClient>;
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

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getEmailFallback(value: unknown) {
  const email = normalizeText(value);
  return email ? email.split("@")[0] : null;
}

export function getProfileDisplayName(profile: Pick<ProfileRecord, "email" | "full_name"> | null | undefined) {
  const protectedProfile = getProtectedAdminProfile(profile?.email);
  if (protectedProfile) return protectedProfile.fullName;

  return normalizeText(profile?.full_name) ?? getEmailFallback(profile?.email);
}

export function getUserDisplayName(
  user: Pick<User, "email" | "user_metadata"> | null | undefined,
  profile?: Pick<ProfileRecord, "email" | "full_name"> | null,
) {
  const metadata = user?.user_metadata ?? {};
  const protectedProfile = getProtectedAdminProfile(user?.email ?? profile?.email);

  if (protectedProfile) return protectedProfile.fullName;

  return (
    normalizeText(metadata.full_name) ??
    normalizeText(metadata.display_name) ??
    normalizeText(metadata.name) ??
    normalizeText(profile?.full_name) ??
    getEmailFallback(user?.email ?? profile?.email)
  );
}

export async function fetchProfile(userId: string): Promise<ProfileRecord | null> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const profileSelects = [
    "id,email,full_name,job_title,workdays,mobile_phone,role,created_at,updated_at",
    "id,email,full_name,job_title,workdays,mobile_phone,role,created_at",
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
        error.message.includes("column profiles.full_name does not exist") ||
        error.message.includes("profiles.job_title does not exist") ||
        error.message.includes("column profiles.job_title does not exist") ||
        error.message.includes("profiles.workdays does not exist") ||
        error.message.includes("column profiles.workdays does not exist") ||
        error.message.includes("profiles.mobile_phone does not exist") ||
        error.message.includes("column profiles.mobile_phone does not exist") ||
        error.message.includes("profiles.updated_at does not exist") ||
        error.message.includes("column profiles.updated_at does not exist");

      if (isSchemaColumnError) {
        continue;
      }

      return null;
    }

    if (!data) {
      return null;
    }

    const profile = data as ProfileRecord;
    const protectedProfile = getProtectedAdminProfile(profile.email);

    return {
      id: profile.id,
      email: profile.email,
      full_name: protectedProfile?.fullName ?? profile.full_name ?? null,
      job_title: protectedProfile?.jobTitle ?? profile.job_title ?? null,
      workdays: protectedProfile?.workdays ?? profile.workdays ?? null,
      mobile_phone: protectedProfile?.mobilePhone ?? profile.mobile_phone ?? null,
      role: getEffectiveUserRole(profile.role, profile.email) ?? profile.role,
      created_at: profile.created_at,
      updated_at: profile.updated_at ?? null,
    };
  }

  return null;
}
