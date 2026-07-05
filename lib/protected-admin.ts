import type { UserRole } from "@/lib/supabase";

export const PROTECTED_ADMIN_EMAILS = ["erik@smarttrade.nl"] as const;

export type ProtectedAdminProfile = {
  fullName: string;
  jobTitle?: string;
  workdays?: string;
  mobilePhone?: string;
};

export const PROTECTED_ADMIN_PROFILES: Record<typeof PROTECTED_ADMIN_EMAILS[number], ProtectedAdminProfile> = {
  "erik@smarttrade.nl": {
    fullName: "Erik Mellaart",
    jobTitle: "IT Sales Consultant",
    workdays: "di - wo - do - vr",
    mobilePhone: "+31 630 050 413",
  },
};

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function isProtectedAdminEmail(email: unknown) {
  const normalizedEmail = normalizeEmail(email);
  return Boolean(normalizedEmail && PROTECTED_ADMIN_EMAILS.includes(normalizedEmail as typeof PROTECTED_ADMIN_EMAILS[number]));
}

export function getProtectedAdminProfile(email: unknown) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !isProtectedAdminEmail(normalizedEmail)) return null;

  return PROTECTED_ADMIN_PROFILES[normalizedEmail as typeof PROTECTED_ADMIN_EMAILS[number]];
}

export function getEffectiveUserRole(role: UserRole | null | undefined, email: unknown): UserRole | null {
  if (isProtectedAdminEmail(email)) return "admin";
  return role ?? null;
}
