import type { UserRole } from "@/lib/supabase";

export type AppTabKey = "calculator" | "deals" | "assets" | "testen" | "admin";

export type AppTabConfig = {
  key: AppTabKey;
  label: string;
  href: string;
  pathPrefix: string;
};

export const APP_TABS: AppTabConfig[] = [
  { key: "calculator", label: "Calculator", href: "/calculator", pathPrefix: "/calculator" },
  { key: "deals", label: "Deals", href: "/deals", pathPrefix: "/deals" },
  { key: "assets", label: "Assets", href: "/assets", pathPrefix: "/assets" },
  { key: "testen", label: "Testen", href: "/testen", pathPrefix: "/testen" },
  { key: "admin", label: "Admin", href: "/admin", pathPrefix: "/admin" },
];

export const ROLE_TAB_ACCESS: Record<UserRole, AppTabKey[]> = {
  sales: ["calculator", "deals", "assets"],
  consultant: ["calculator", "deals", "assets"],
  support: ["deals", "assets", "testen"],
  manager: ["calculator", "deals", "assets", "testen"],
  admin: ["calculator", "deals", "assets", "testen", "admin"],
};

export function canAccessTab(role: UserRole | null, tabKey: AppTabKey) {
  if (!role) return false;
  return ROLE_TAB_ACCESS[role]?.includes(tabKey) ?? false;
}

export function getAccessibleTabs(role: UserRole | null) {
  return APP_TABS.filter((tab) => canAccessTab(role, tab.key));
}
