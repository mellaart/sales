"use client";

import { APP_TABS, ROLE_LABELS, type AppTabKey, type RoleTabAccessMap, type TabPermission } from "@/lib/role-tabs";
import type { UserRole } from "@/lib/supabase";

type RoleTabAccessOverviewProps = {
  access: RoleTabAccessMap;
  disabled?: boolean;
  roles: UserRole[];
  savingKey?: string | null;
  onChange: (role: UserRole, tabKey: AppTabKey, permission: TabPermission) => void;
};

const PERMISSION_LABELS: Record<TabPermission, string> = {
  none: "Geen",
  read: "Lezen",
  write: "Schrijven",
};

function formatTabAccessDescription(tabPermissions: RoleTabAccessMap[UserRole]) {
  const selectedLabels = APP_TABS
    .filter((tab) => tabPermissions[tab.key] !== "none")
    .map((tab) => `${tab.label} ${PERMISSION_LABELS[tabPermissions[tab.key]].toLowerCase()}`);

  if (selectedLabels.length === 0) {
    return "Geen tabbladen geselecteerd.";
  }

  if (selectedLabels.length === 1) {
    return `${selectedLabels[0]} geselecteerd.`;
  }

  const lastLabel = selectedLabels[selectedLabels.length - 1];
  const leadingLabels = selectedLabels.slice(0, -1);

  return `${leadingLabels.join(", ")} en ${lastLabel} geselecteerd.`;
}

export function RoleTabAccessOverview({
  access,
  disabled = false,
  roles,
  savingKey,
  onChange,
}: RoleTabAccessOverviewProps) {
  return (
    <div className="admin-user-list">
      {roles.map((role) => (
        <div key={role} className="admin-user-card">
          <div>
            <div className="package-name">{ROLE_LABELS[role]}</div>
            <div className="subtext">{formatTabAccessDescription(access[role])}</div>
          </div>

          <div className="role-access-grid">
            {APP_TABS.map((tab) => {
              const permission = access[role][tab.key];
              const isSaving = savingKey === `${role}:${tab.key}`;

              return (
                <label key={`${role}-${tab.key}`} className="role-access-control">
                  <span>
                    {tab.label}
                    {isSaving ? " opslaan..." : null}
                  </span>
                  <select
                    className="input role-access-select"
                    value={permission}
                    disabled={disabled}
                    aria-label={`${role} ${tab.label} rechten`}
                    onChange={(event) => onChange(role, tab.key, event.target.value as TabPermission)}
                  >
                    {Object.entries(PERMISSION_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
