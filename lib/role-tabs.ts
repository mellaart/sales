import type { UserRole } from "@/lib/supabase";

export type AppTabKey = "calculator" | "deals" | "assets" | "testen" | "admin";

export type AppTabConfig = {
  key: AppTabKey;
  label: string;
  href: string;
  pathPrefix: string;
};

export type RoleTabAccessMap = Record<UserRole, AppTabKey[]>;

export const USER_ROLES: UserRole[] = ["sales", "support", "consultant", "manager", "admin"];

export const APP_TABS: AppTabConfig[] = [
  { key: "calculator", label: "Calculator", href: "/calculator", pathPrefix: "/calculator" },
  { key: "deals", label: "Deals", href: "/deals", pathPrefix: "/deals" },
  { key: "assets", label: "Assets", href: "/assets", pathPrefix: "/assets" },
  { key: "testen", label: "Testen", href: "/testen", pathPrefix: "/testen" },
  { key: "admin", label: "Admin", href: "/admin", pathPrefix: "/admin" },
];

export const ROLE_TAB_ACCESS: RoleTabAccessMap = {
  sales: ["calculator", "deals", "assets"],
  consultant: ["calculator", "deals", "assets"],
  support: ["deals", "assets", "testen"],
  manager: ["calculator", "deals", "assets", "testen"],
  admin: ["calculator", "deals", "assets", "testen", "admin"],
};

const VALID_TAB_KEYS = new Set<AppTabKey>(APP_TABS.map((tab) => tab.key));

export function normalizeRoleTabAccess(input: unknown): RoleTabAccessMap {
  const source = input && typeof input === "object" ? (input as Partial<Record<UserRole, unknown>>) : {};

  return USER_ROLES.reduce((access, role) => {
    const rawTabs = Array.isArray(source[role]) ? source[role] : ROLE_TAB_ACCESS[role];
    const seen = new Set<AppTabKey>();

    access[role] = rawTabs.filter((tabKey): tabKey is AppTabKey => {
      if (typeof tabKey !== "string") return false;

      const normalizedKey = tabKey as AppTabKey;
      if (!VALID_TAB_KEYS.has(normalizedKey) || seen.has(normalizedKey)) return false;

      seen.add(normalizedKey);
      return true;
    });

    return access;
  }, {} as RoleTabAccessMap);
}

export function canAccessTab(
  role: UserRole | null,
  tabKey: AppTabKey,
  accessMap: RoleTabAccessMap = ROLE_TAB_ACCESS,
) {
  if (!role) return false;
  return accessMap[role]?.includes(tabKey) ?? false;
}

export function getAccessibleTabs(role: UserRole | null, accessMap: RoleTabAccessMap = ROLE_TAB_ACCESS) {
  return APP_TABS.filter((tab) => canAccessTab(role, tab.key, accessMap));
}
