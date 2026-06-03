"use client";

import { APP_TABS, type AppTabKey, type RoleTabAccessMap } from "@/lib/role-tabs";
import type { UserRole } from "@/lib/supabase";

const roleDescriptions: Record<UserRole, string> = {
  sales: "Calculator, eigen deals en assets.",
  support: "Deals, assets en testen.",
  consultant: "Calculator, eigen deals en assets.",
  manager: "Calculator, alle deals, assets en testen.",
  admin: "Volledige toegang inclusief admin.",
};

type RoleTabAccessOverviewProps = {
  access: RoleTabAccessMap;
  disabled?: boolean;
  roles: UserRole[];
  savingKey?: string | null;
  onToggle: (role: UserRole, tabKey: AppTabKey) => void;
};

export function RoleTabAccessOverview({
  access,
  disabled = false,
  roles,
  savingKey,
  onToggle,
}: RoleTabAccessOverviewProps) {
  return (
    <div className="admin-user-list">
      {roles.map((role) => (
        <div key={role} className="admin-user-card">
          <div>
            <div className="package-name">{role}</div>
            <div className="subtext">{roleDescriptions[role]}</div>
          </div>

          <div className="button-row">
            {APP_TABS.map((tab) => {
              const checked = access[role].includes(tab.key);
              const isSaving = savingKey === `${role}:${tab.key}`;

              return (
                <label key={`${role}-${tab.key}`} className={`secondary-button ${checked ? "active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    aria-label={`${role} ${tab.label} toegang`}
                    onChange={() => onToggle(role, tab.key)}
                  />
                  {tab.label}
                  {isSaving ? " opslaan..." : null}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
