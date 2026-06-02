import { APP_TABS, ROLE_TAB_ACCESS } from "@/lib/role-tabs";
import type { UserRole } from "@/lib/supabase";

const roleDescriptions: Record<UserRole, string> = {
  sales: "Calculator, eigen deals en assets.",
  support: "Deals, assets en testen.",
  consultant: "Calculator, eigen deals en assets.",
  manager: "Calculator, alle deals, assets en testen.",
  admin: "Volledige toegang inclusief admin.",
};

type RoleTabAccessOverviewProps = {
  roles: UserRole[];
};

export function RoleTabAccessOverview({ roles }: RoleTabAccessOverviewProps) {
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
              const checked = ROLE_TAB_ACCESS[role].includes(tab.key);

              return (
                <label key={`${role}-${tab.key}`} className={`secondary-button ${checked ? "active" : ""}`}>
                  <input type="checkbox" checked={checked} readOnly aria-label={`${role} ${tab.label}`} />
                  {tab.label}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
