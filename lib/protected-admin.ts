import type { UserRole } from "@/lib/supabase";

export const PROTECTED_ADMIN_EMAILS = ["erik@smarttrade.nl"] as const;

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function isProtectedAdminEmail(email: unknown) {
  const normalizedEmail = normalizeEmail(email);
  return Boolean(normalizedEmail && PROTECTED_ADMIN_EMAILS.includes(normalizedEmail as typeof PROTECTED_ADMIN_EMAILS[number]));
}

export function getEffectiveUserRole(role: UserRole | null | undefined, email: unknown): UserRole | null {
  if (isProtectedAdminEmail(email)) return "admin";
  return role ?? null;
}
