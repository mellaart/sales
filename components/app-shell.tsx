"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, UserRound, Users2 } from "lucide-react";
import {
  ROLE_LABELS,
  ROLE_TAB_ACCESS,
  getAccessibleTabs,
  normalizeRoleTabAccess,
  type RoleTabAccessMap,
} from "@/lib/role-tabs";
import { useAuth } from "@/components/auth-provider";

export function AppShellHeader() {
  const { user, role, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [roleTabAccess, setRoleTabAccess] = useState<RoleTabAccessMap>(ROLE_TAB_ACCESS);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!user) return;

    let active = true;

    async function loadRoleTabAccess() {
      try {
        const response = await fetch("/api/admin/role-tabs", { cache: "no-store" });
        const json = (await response.json().catch(() => ({}))) as { roleTabAccess?: unknown };

        if (active && response.ok) {
          setRoleTabAccess(normalizeRoleTabAccess(json.roleTabAccess));
        }
      } catch {
        if (active) {
          setRoleTabAccess(ROLE_TAB_ACCESS);
        }
      }
    }

    function handleRoleTabAccessUpdated(event: Event) {
      setRoleTabAccess(normalizeRoleTabAccess((event as CustomEvent).detail));
    }

    void loadRoleTabAccess();
    window.addEventListener("role-tab-access-updated", handleRoleTabAccessUpdated);

    return () => {
      active = false;
      window.removeEventListener("role-tab-access-updated", handleRoleTabAccessUpdated);
    };
  }, [user]);

  if (!user) return null;

  const accessibleTabs = getAccessibleTabs(role ?? "sales", roleTabAccess);

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);
    await signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <header className="app-nav">
      <div className="app-nav-inner">
        <Link href="/" className="app-nav-brand">
          <span className="brand-dot" />
          <span className="app-nav-brand-text">Smart Trade</span>
        </Link>

        <nav className="app-nav-tabs" aria-label="Hoofdnavigatie">
          <Link href="/" className={`nav-button ${pathname === "/" ? "active" : ""}`}>
            Dashboard
          </Link>

          {accessibleTabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={`nav-button ${pathname.startsWith(tab.pathPrefix) ? "active" : ""}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="app-nav-account">
          <span className="user-chip">
            <Users2 size={13} />
            <span>{role ? ROLE_LABELS[role] : "Sales"}</span>
          </span>

          <span className="user-chip email-chip">
            <UserRound size={13} />
            <span>{user.email}</span>
          </span>

          <button type="button" className="logout-button nav-logout-button" onClick={handleLogout} disabled={loggingOut}>
            <LogOut size={15} />
            {loggingOut ? "Uitloggen..." : "Uitloggen"}
          </button>
        </div>
      </div>
    </header>
  );
}
