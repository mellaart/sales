"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Shield, UserRound, Users2, LayoutDashboard } from "lucide-react";
import { canManageRoles, getSupabaseClient } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";

export function AppShellHeader() {
  const { user, role } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const handleLogout = async () => {
    const supabase = getSupabaseClient();

    if (supabase) {
      await supabase.auth.signOut();
    }

    localStorage.clear();
    sessionStorage.clear();

    window.location.href = "/login";
  };

  return (
    <div className="app-nav">
      <div className="app-nav-inner">
        <Link href="/" className="app-nav-brand">
          <span className="brand-dot" />
          Smart Trade
        </Link>

        <div className="app-nav-actions">
          <Link href="/" className={`nav-button ${pathname === "/" ? "active" : ""}`}>
            <LayoutDashboard size={15} />
            Calculator
          </Link>

          <Link href="/deals" className={`nav-button ${pathname.startsWith("/deals") ? "active" : ""}`}>
            Deals
          </Link>

          {canManageRoles(role) ? (
            <Link href="/admin" className={`nav-button ${pathname.startsWith("/admin") ? "active" : ""}`}>
              <Shield size={15} />
              Admin
            </Link>
          ) : null}

          <div className="user-meta">
            <span className="user-chip">
              <Users2 size={13} />
              {role ?? "sales"}
            </span>
            <span className="user-chip email-chip">
              <UserRound size={13} />
              {user.email}
            </span>
          </div>

          <button type="button" className="logout-button" onClick={handleLogout}>
            <LogOut size={15} />
            Uitloggen
          </button>
        </div>
      </div>
    </div>
  );
}
