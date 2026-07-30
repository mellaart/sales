"use client";

import Image from "next/image";
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

const ADMIN_MENU_TAB_KEYS = ["postcode", "testen", "worldlineMcc"] as const;
const ADMIN_MENU_TAB_KEY_SET = new Set<string>(ADMIN_MENU_TAB_KEYS);

export function AppShellHeader() {
  const { user, role, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [roleTabAccess, setRoleTabAccess] = useState<RoleTabAccessMap>(ROLE_TAB_ACCESS);
  const [roleTabAccessLoaded, setRoleTabAccessLoaded] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const isPublicUtilityPage = pathname === "/worldline-test" || pathname.startsWith("/klantgegevens/");

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
    setAdminMenuOpen(false);
    setAccountMenuOpen(false);
  }, [pathname, user?.id]);

  useEffect(() => {
    if (!adminMenuOpen && !accountMenuOpen) return;

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as Node;
      const clickedAdminMenu = Boolean(adminMenuRef.current?.contains(target));
      const clickedAccountMenu = Boolean(accountMenuRef.current?.contains(target));

      if (!clickedAdminMenu) setAdminMenuOpen(false);
      if (!clickedAccountMenu) setAccountMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAdminMenuOpen(false);
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [adminMenuOpen, accountMenuOpen]);

  if (!user || isPublicUtilityPage) return null;

  const accessibleTabs = roleTabAccessLoaded ? getAccessibleTabs(role ?? "sales", roleTabAccess) : [];
  const adminTab = accessibleTabs.find((tab) => tab.key === "admin") ?? null;
  const adminUtilityTabs = adminTab
    ? ADMIN_MENU_TAB_KEYS
        .map((tabKey) => accessibleTabs.find((tab) => tab.key === tabKey))
        .filter((tab): tab is (typeof accessibleTabs)[number] => Boolean(tab))
    : [];
  const mainTabs = accessibleTabs.filter((tab) => {
    if (tab.key === "admin") return false;
    if (adminTab && ADMIN_MENU_TAB_KEY_SET.has(tab.key)) return false;
    return true;
  });
  const adminMenuTabs = adminTab ? [adminTab, ...adminUtilityTabs] : [];
  const adminMenuActive = adminMenuTabs.some((tab) => pathname.startsWith(tab.pathPrefix));

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
          <Image
            src="/icon.png"
            alt=""
            width={24}
            height={24}
            className="app-nav-brand-logo"
            aria-hidden="true"
            priority
          />
          <span className="app-nav-brand-text">Smart Trade</span>
        </Link>

        <nav className="app-nav-tabs" aria-label="Hoofdnavigatie">
          <Link href="/" className={`nav-button ${pathname === "/" ? "active" : ""}`}>
            Dashboard
          </Link>

          {mainTabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={`nav-button ${pathname.startsWith(tab.pathPrefix) ? "active" : ""}`}
            >
              {tab.label}
            </Link>
          ))}

          {adminMenuTabs.length > 0 ? (
            <div className="nav-menu" ref={adminMenuRef}>
              <button
                type="button"
                className={`nav-button nav-menu-trigger ${adminMenuOpen || adminMenuActive ? "active" : ""}`}
                onClick={() => {
                  setAccountMenuOpen(false);
                  setAdminMenuOpen((open) => !open);
                }}
                aria-haspopup="menu"
                aria-expanded={adminMenuOpen}
              >
                Admin
                <ChevronDown size={13} className="account-menu-chevron" />
              </button>

              {adminMenuOpen ? (
                <div className="nav-menu-panel" role="menu">
                  {adminMenuTabs.map((tab) => (
                    <Link
                      key={tab.key}
                      href={tab.href}
                      className={`nav-menu-item ${pathname.startsWith(tab.pathPrefix) ? "active" : ""}`}
                      role="menuitem"
                    >
                      {tab.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
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
              onClick={() => {
                setAdminMenuOpen(false);
                setAccountMenuOpen((open) => !open);
              }}
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
