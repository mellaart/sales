import type { UserRole } from "@/lib/supabase";

export type AppTabKey = "calculator" | "deals" | "assets" | "worldline" | "testen" | "prices" | "postcode" | "admin";

export type AppTabConfig = {
  key: AppTabKey;
  label: string;
  href: string;
  pathPrefix: string;
};

export type TabPermission = "none" | "read" | "write";
export type RoleTabAccessMap = Record<UserRole, Record<AppTabKey, TabPermission>>;

export const USER_ROLES: UserRole[] = ["sales", "support", "consultant", "worldline", "manager", "admin"];

export const ROLE_LABELS: Record<UserRole, string> = {
  sales: "Sales",
  support: "Support",
  consultant: "Consultant",
  worldline: "Worldline",
  manager: "Manager",
  admin: "Admin",
};

export const APP_TABS: AppTabConfig[] = [
  { key: "calculator", label: "Calculator", href: "/calculator", pathPrefix: "/calculator" },
  { key: "deals", label: "Deals", href: "/deals", pathPrefix: "/deals" },
  { key: "assets", label: "Assets", href: "/assets", pathPrefix: "/assets" },
  { key: "worldline", label: "Worldline", href: "/worldline", pathPrefix: "/worldline" },
  { key: "testen", label: "Testen", href: "/testen", pathPrefix: "/testen" },
  { key: "prices", label: "Prijzen", href: "/prijzen", pathPrefix: "/prijzen" },
  { key: "postcode", label: "Postcode", href: "/postcode", pathPrefix: "/postcode" },
  { key: "admin", label: "Admin", href: "/admin", pathPrefix: "/admin" },
];

export const ROLE_TAB_ACCESS: RoleTabAccessMap = {
  sales: buildRoleAccess(["calculator", "deals", "assets"]),
  consultant: buildRoleAccess(["calculator", "deals", "assets"], ["prices", "postcode"]),
  support: buildRoleAccess(["deals", "assets", "testen"]),
  worldline: buildRoleAccess(["worldline"]),
  manager: buildRoleAccess(["calculator", "deals", "assets", "testen"]),
  admin: buildRoleAccess(["calculator", "deals", "assets", "worldline", "testen", "prices", "postcode", "admin"]),
};

const VALID_TAB_KEYS = new Set<AppTabKey>(APP_TABS.map((tab) => tab.key));
const VALID_TAB_PERMISSIONS = new Set<TabPermission>(["none", "read", "write"]);
const PERMISSION_LEVEL: Record<TabPermission, number> = {
  none: 0,
  read: 1,
  write: 2,
};
const MINIMUM_ROLE_TAB_ACCESS: Partial<Record<UserRole, Partial<Record<AppTabKey, TabPermission>>>> = {
  consultant: {
    prices: "read",
    postcode: "read",
  },
};

function buildRoleAccess(writeTabs: AppTabKey[], readTabs: AppTabKey[] = []): Record<AppTabKey, TabPermission> {
  const writeTabSet = new Set(writeTabs);
  const readTabSet = new Set(readTabs);

  return APP_TABS.reduce((access, tab) => {
    access[tab.key] = writeTabSet.has(tab.key) ? "write" : readTabSet.has(tab.key) ? "read" : "none";
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

function maxPermission(currentPermission: TabPermission, minimumPermission: TabPermission) {
  return PERMISSION_LEVEL[currentPermission] >= PERMISSION_LEVEL[minimumPermission]
    ? currentPermission
    : minimumPermission;
}

function applyMinimumRoleTabAccess(access: RoleTabAccessMap) {
  return USER_ROLES.reduce((nextAccess, role) => {
    const minimumAccess = MINIMUM_ROLE_TAB_ACCESS[role];

    if (!minimumAccess) {
      nextAccess[role] = access[role];
      return nextAccess;
    }

    nextAccess[role] = APP_TABS.reduce((roleAccess, tab) => {
      const minimumPermission = minimumAccess[tab.key];
      roleAccess[tab.key] = minimumPermission
        ? maxPermission(access[role][tab.key], minimumPermission)
        : access[role][tab.key];
      return roleAccess;
    }, {} as Record<AppTabKey, TabPermission>);

    return nextAccess;
  }, {} as RoleTabAccessMap);
}

export function normalizeRoleTabAccess(input: unknown): RoleTabAccessMap {
  const source = input && typeof input === "object" ? (input as Partial<Record<UserRole, unknown>>) : {};

  const normalizedAccess = USER_ROLES.reduce((access, role) => {
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

  return applyMinimumRoleTabAccess(normalizedAccess);
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
