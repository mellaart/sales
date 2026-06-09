import type { UserRole } from "@/lib/supabase";

export type AppTabKey = "calculator" | "deals" | "assets" | "testen" | "prices" | "postcode" | "admin";

export type AppTabConfig = {
  key: AppTabKey;
  label: string;
  href: string;
  pathPrefix: string;
};

export type TabPermission = "none" | "read" | "write";
export type RoleTabAccessMap = Record<UserRole, Record<AppTabKey, TabPermission>>;

export const USER_ROLES: UserRole[] = ["sales", "support", "consultant", "manager", "admin"];

export const APP_TABS: AppTabConfig[] = [
  { key: "calculator", label: "Calculator", href: "/calculator", pathPrefix: "/calculator" },
  { key: "deals", label: "Deals", href: "/deals", pathPrefix: "/deals" },
  { key: "assets", label: "Assets", href: "/assets", pathPrefix: "/assets" },
  { key: "testen", label: "Testen", href: "/testen", pathPrefix: "/testen" },
  { key: "prices", label: "Prijzen", href: "/prijzen", pathPrefix: "/prijzen" },
  { key: "postcode", label: "Postcode", href: "/postcode", pathPrefix: "/postcode" },
  { key: "admin", label: "Admin", href: "/admin", pathPrefix: "/admin" },
];

export const ROLE_TAB_ACCESS: RoleTabAccessMap = {
  sales: buildRoleAccess(["calculator", "deals", "assets"]),
  consultant: buildRoleAccess(["calculator", "deals", "assets"]),
  support: buildRoleAccess(["deals", "assets", "testen"]),
  manager: buildRoleAccess(["calculator", "deals", "assets", "testen"]),
  admin: buildRoleAccess(["calculator", "deals", "assets", "testen", "prices", "postcode", "admin"]),
};

const VALID_TAB_KEYS = new Set<AppTabKey>(APP_TABS.map((tab) => tab.key));
const VALID_TAB_PERMISSIONS = new Set<TabPermission>(["none", "read", "write"]);

function buildRoleAccess(writeTabs: AppTabKey[]): Record<AppTabKey, TabPermission> {
  const writeTabSet = new Set(writeTabs);

  return APP_TABS.reduce((access, tab) => {
    access[tab.key] = writeTabSet.has(tab.key) ? "write" : "none";
    return access;
  }, {} as Record<AppTabKey, TabPermission>);
}

function normalizePermission(value: unknown): TabPermission {
  if (typeof value === "string" && VALID_TAB_PERMISSIONS.has(value as TabPermission)) {
    return value as TabPermission;
  }

  if (value === true) return "write";
  return "none";
}

export function normalizeRoleTabAccess(input: unknown): RoleTabAccessMap {
  const source = input && typeof input === "object" ? (input as Partial<Record<UserRole, unknown>>) : {};

  return USER_ROLES.reduce((access, role) => {
    const rawRoleAccess = source[role];

    if (Array.isArray(rawRoleAccess)) {
      const writeTabs = rawRoleAccess.filter((tabKey): tabKey is AppTabKey => {
        if (typeof tabKey !== "string") return false;
        return VALID_TAB_KEYS.has(tabKey as AppTabKey);
      });

      access[role] = buildRoleAccess(writeTabs);
      return access;
    }

    const rawPermissions =
      rawRoleAccess && typeof rawRoleAccess === "object"
        ? (rawRoleAccess as Partial<Record<AppTabKey, unknown>>)
        : ROLE_TAB_ACCESS[role];

    access[role] = APP_TABS.reduce((roleAccess, tab) => {
      const rawPermission = rawPermissions[tab.key];
      roleAccess[tab.key] =
        rawPermission === undefined ? ROLE_TAB_ACCESS[role][tab.key] : normalizePermission(rawPermission);
      return roleAccess;
    }, {} as Record<AppTabKey, TabPermission>);

    return access;
  }, {} as RoleTabAccessMap);
}

export function getTabPermission(
  role: UserRole | null,
  tabKey: AppTabKey,
  accessMap: RoleTabAccessMap = ROLE_TAB_ACCESS,
): TabPermission {
  if (!role) return "none";
  return accessMap[role]?.[tabKey] ?? "none";
}

export function canAccessTab(
  role: UserRole | null,
  tabKey: AppTabKey,
  accessMap: RoleTabAccessMap = ROLE_TAB_ACCESS,
) {
  return getTabPermission(role, tabKey, accessMap) !== "none";
}

export function canWriteTab(
  role: UserRole | null,
  tabKey: AppTabKey,
  accessMap: RoleTabAccessMap = ROLE_TAB_ACCESS,
) {
  return getTabPermission(role, tabKey, accessMap) === "write";
}

export function getAccessibleTabs(role: UserRole | null, accessMap: RoleTabAccessMap = ROLE_TAB_ACCESS) {
  return APP_TABS.filter((tab) => canAccessTab(role, tab.key, accessMap));
}
