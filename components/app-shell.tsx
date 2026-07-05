"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, KeyRound, LogOut, UserRound, Users2 } from "lucide-react";
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
  const [roleTabAccessLoaded, setRoleTabAccessLoaded] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) return;

    let active = true;
    setRoleTabAccessLoaded(false);

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
      } finally {
        if (active) setRoleTabAccessLoaded(true);
      }
    }

    function handleRoleTabAccessUpdated(event: Event) {
      setRoleTabAccess(normalizeRoleTabAccess((event as CustomEvent).detail));
      setRoleTabAccessLoaded(true);
    }

    void loadRoleTabAccess();
    window.addEventListener("role-tab-access-updated", handleRoleTabAccessUpdated);

    return () => {
      active = false;
      window.removeEventListener("role-tab-access-updated", handleRoleTabAccessUpdated);
    };
  }, [user]);

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [pathname, user?.id]);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function handleDocumentClick(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  if (!user) return null;

  const accessibleTabs = roleTabAccessLoaded ? getAccessibleTabs(role ?? "sales", roleTabAccess) : [];

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

          <div className="account-menu" ref={accountMenuRef}>
            <button
              type="button"
              className={`user-chip email-chip account-menu-trigger ${accountMenuOpen ? "active" : ""}`}
              onClick={() => setAccountMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
            >
              <UserRound size={13} />
              <span>{user.email}</span>
              <ChevronDown size={13} className="account-menu-chevron" />
            </button>

            {accountMenuOpen ? (
              <div className="account-menu-panel" role="menu">
                <Link href="/reset-password" className="account-menu-item" role="menuitem">
                  <KeyRound size={15} />
                  <span>Wachtwoord wijzigen</span>
                </Link>
              </div>
            ) : null}
          </div>

          <button type="button" className="logout-button nav-logout-button" onClick={handleLogout} disabled={loggingOut}>
            <LogOut size={15} />
            {loggingOut ? "Uitloggen..." : "Uitloggen"}
          </button>
        </div>
      </div>
    </header>
  );
}
