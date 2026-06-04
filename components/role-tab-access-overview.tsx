"use client";

import { APP_TABS, type AppTabKey, type RoleTabAccessMap } from "@/lib/role-tabs";
import type { UserRole } from "@/lib/supabase";

type RoleTabAccessOverviewProps = {
  access: RoleTabAccessMap;
  disabled?: boolean;
  roles: UserRole[];
  savingKey?: string | null;
  onToggle: (role: UserRole, tabKey: AppTabKey) => void;
};

function formatTabAccessDescription(tabKeys: AppTabKey[]) {
  const selectedLabels = APP_TABS
    .filter((tab) => tabKeys.includes(tab.key))
    .map((tab) => tab.label);

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
  onToggle,
}: RoleTabAccessOverviewProps) {
  return (
    <div className="admin-user-list">
      {roles.map((role) => (
        <div key={role} className="admin-user-card">
          <div>
            <div className="package-name">{role}</div>
            <div className="subtext">{formatTabAccessDescription(access[role])}</div>
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
