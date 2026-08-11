"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, KeyRound, LogOut, Settings, UserRound, Users2 } from "lucide-react";
import {
  ROLE_LABELS,
  ROLE_TAB_ACCESS,
  getAccessibleTabs,
  normalizeRoleTabAccess,
  type RoleTabAccessMap,
} from "@/lib/role-tabs";
import { useAuth } from "@/components/auth-provider";

const ADMIN_MENU_TAB_KEYS = ["postcode", "testen", "worldlineMcc", "workActivities"] as const;
const ADMIN_MENU_TAB_KEY_SET = new Set<string>(ADMIN_MENU_TAB_KEYS);
const SALES_MENU_TAB_KEYS = ["calculator", "deals", "assets", "implementation", "prices"] as const;
const SALES_MENU_TAB_KEY_SET = new Set<string>(SALES_MENU_TAB_KEYS);

const APPEARANCE_PROFILES = [
  {
    key: "standard",
    name: "Standaard",
    description: "De vertrouwde donkere Smart Trade-opmaak.",
  },
  {
    key: "customer",
    name: "Klantstijl",
    description: "Licht, rustig en zakelijk zoals de klantpagina.",
  },
  {
    key: "neon",
    name: "Neon",
    description: "Donker met heldere cyaan- en groene accenten.",
  },
  {
    key: "corporate-modern",
    name: "Corporate Modern",
    description: "Vertrouwd donkerblauw met een warm oranje accent.",
  },
  {
    key: "modern-tech",
    name: "Modern Tech",
    description: "Strak antraciet met helder blauw en cyaan.",
  },
  {
    key: "warm-b2b",
    name: "Warm B2B",
    description: "Zakelijk blauwgroen met een warme uitstraling.",
  },
] as const;

type AppearanceProfile = (typeof APPEARANCE_PROFILES)[number]["key"];

function normalizeAppearanceProfile(value: string | null): AppearanceProfile {
  return APPEARANCE_PROFILES.some((profile) => profile.key === value)
    ? (value as AppearanceProfile)
    : "standard";
}

export function AppShellHeader() {
  const { user, role, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [roleTabAccess, setRoleTabAccess] = useState<RoleTabAccessMap>(ROLE_TAB_ACCESS);
  const [roleTabAccessLoaded, setRoleTabAccessLoaded] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [salesMenuOpen, setSalesMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [appearanceMenuOpen, setAppearanceMenuOpen] = useState(false);
  const [appearanceProfile, setAppearanceProfile] = useState<AppearanceProfile>("standard");
  const salesMenuRef = useRef<HTMLDivElement | null>(null);
  const adminMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const appearanceMenuRef = useRef<HTMLDivElement | null>(null);
  const isAuthPage = pathname === "/login" || pathname === "/reset-password";
  const isPublicUtilityPage = pathname === "/worldline-test"
    || pathname.startsWith("/klantgegevens/")
    || pathname.startsWith("/implementatie-volgen/")
    || pathname.startsWith("/offerte/")
    || pathname.startsWith("/retourpinnen/");
  const isFocusedDealPage = pathname.startsWith("/dealmail/");
  const userId = user?.id;

  useEffect(() => {
    const root = document.documentElement;

    if (!userId || isAuthPage || isPublicUtilityPage || isFocusedDealPage) {
      delete root.dataset.appTheme;
      return;
    }

    const storageKey = `smart-trade-appearance:${userId}`;
    const storedProfile = normalizeAppearanceProfile(window.localStorage.getItem(storageKey));
    setAppearanceProfile(storedProfile);
    root.dataset.appTheme = storedProfile;
  }, [isAuthPage, isFocusedDealPage, isPublicUtilityPage, userId]);

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
    setSalesMenuOpen(false);
    setAdminMenuOpen(false);
    setAccountMenuOpen(false);
    setAppearanceMenuOpen(false);
  }, [pathname, user?.id]);

  useEffect(() => {
    if (!salesMenuOpen && !adminMenuOpen && !accountMenuOpen && !appearanceMenuOpen) return;

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as Node;
      const clickedSalesMenu = Boolean(salesMenuRef.current?.contains(target));
      const clickedAdminMenu = Boolean(adminMenuRef.current?.contains(target));
      const clickedAccountMenu = Boolean(accountMenuRef.current?.contains(target));
      const clickedAppearanceMenu = Boolean(appearanceMenuRef.current?.contains(target));

      if (!clickedSalesMenu) setSalesMenuOpen(false);
      if (!clickedAdminMenu) setAdminMenuOpen(false);
      if (!clickedAccountMenu) setAccountMenuOpen(false);
      if (!clickedAppearanceMenu) setAppearanceMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSalesMenuOpen(false);
        setAdminMenuOpen(false);
        setAccountMenuOpen(false);
        setAppearanceMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [salesMenuOpen, adminMenuOpen, accountMenuOpen, appearanceMenuOpen]);

  if (!user || isAuthPage || isPublicUtilityPage || isFocusedDealPage) return null;

  const accessibleTabs = roleTabAccessLoaded ? getAccessibleTabs(role ?? "sales", roleTabAccess) : [];
  const salesMenuTabs = SALES_MENU_TAB_KEYS
    .map((tabKey) => accessibleTabs.find((tab) => tab.key === tabKey))
    .filter((tab): tab is (typeof accessibleTabs)[number] => Boolean(tab));
  const adminTab = accessibleTabs.find((tab) => tab.key === "admin") ?? null;
  const adminUtilityTabs = adminTab
    ? ADMIN_MENU_TAB_KEYS
        .map((tabKey) => accessibleTabs.find((tab) => tab.key === tabKey))
        .filter((tab): tab is (typeof accessibleTabs)[number] => Boolean(tab))
    : [];
  const mainTabs = accessibleTabs.filter((tab) => {
    if (SALES_MENU_TAB_KEY_SET.has(tab.key)) return false;
    if (tab.key === "admin") return false;
    if (adminTab && ADMIN_MENU_TAB_KEY_SET.has(tab.key)) return false;
    return true;
  });
  const adminMenuTabs = adminTab ? [adminTab, ...adminUtilityTabs] : [];
  const salesMenuActive = salesMenuTabs.some((tab) => pathname.startsWith(tab.pathPrefix));
  const adminMenuActive = adminMenuTabs.some((tab) => pathname.startsWith(tab.pathPrefix));

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);
    await signOut();
    router.replace("/login");
    router.refresh();
  };

  const selectAppearanceProfile = (profile: AppearanceProfile) => {
    setAppearanceProfile(profile);
    document.documentElement.dataset.appTheme = profile;
    window.localStorage.setItem(`smart-trade-appearance:${user.id}`, profile);
    setAppearanceMenuOpen(false);
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

          {salesMenuTabs.length > 0 ? (
            <div className="nav-menu" ref={salesMenuRef}>
              <button
                type="button"
                className={`nav-button nav-menu-trigger ${salesMenuOpen || salesMenuActive ? "active" : ""}`}
                onClick={() => {
                  setAdminMenuOpen(false);
                  setAccountMenuOpen(false);
                  setSalesMenuOpen((open) => !open);
                }}
                aria-haspopup="menu"
                aria-expanded={salesMenuOpen}
              >
                Sales
                <ChevronDown size={13} className="account-menu-chevron" />
              </button>

              {salesMenuOpen ? (
                <div className="nav-menu-panel nav-menu-panel-start" role="menu">
                  {salesMenuTabs.map((tab) => (
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
                  setSalesMenuOpen(false);
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
                setSalesMenuOpen(false);
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

          <div className="appearance-menu" ref={appearanceMenuRef}>
            <button
              type="button"
              className={`appearance-menu-trigger ${appearanceMenuOpen ? "active" : ""}`}
              onClick={() => {
                setSalesMenuOpen(false);
                setAdminMenuOpen(false);
                setAccountMenuOpen(false);
                setAppearanceMenuOpen((open) => !open);
              }}
              aria-label="Opmaakprofiel kiezen"
              aria-haspopup="menu"
              aria-expanded={appearanceMenuOpen}
              title="Opmaakprofiel kiezen"
            >
              <Settings size={17} aria-hidden="true" />
            </button>

            {appearanceMenuOpen ? (
              <div className="appearance-menu-panel" role="menu" aria-label="Opmaakprofielen">
                <div className="appearance-menu-heading">
                  <strong>Opmaakprofiel</strong>
                  <span>Kies uw gewenste uitstraling.</span>
                </div>

                <div className="appearance-profile-list">
                  {APPEARANCE_PROFILES.map((profile) => {
                    const active = profile.key === appearanceProfile;

                    return (
                      <button
                        type="button"
                        key={profile.key}
                        className={`appearance-profile-option ${active ? "active" : ""}`}
                        onClick={() => selectAppearanceProfile(profile.key)}
                        role="menuitemradio"
                        aria-checked={active}
                      >
                        <span className={`appearance-profile-preview ${profile.key}`} aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                        <span className="appearance-profile-copy">
                          <strong>{profile.name}</strong>
                          <small>{profile.description}</small>
                        </span>
                        <span className="appearance-profile-check" aria-hidden="true">
                          {active ? <Check size={16} /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
