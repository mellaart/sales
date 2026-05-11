"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Shield, UserRound, Users2 } from "lucide-react";
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
    <header className="app-nav">
      <div className="app-nav-inner">
        <Link href="/" className="app-nav-brand">
          Smart Trade
        </Link>

        <nav className="app-nav-actions">
          <Link href="/" className={`nav-button ${pathname === "/" ? "active" : ""}`}>
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

          <span className="user-chip">
            <Users2 size={13} />
            {role ?? "sales"}
          </span>

          <span className="user-chip email-chip">
            <UserRound size={13} />
            {user.email}
          </span>

          <button type="button" className="logout-button" onClick={handleLogout}>
            <LogOut size={15} />
            Uitloggen
          </button>
        </nav>
      </div>
    </header>
  );
}