"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Shield, UserRound, Users2 } from "lucide-react";
import { canManageRoles } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { getSupabaseClient } from "@/lib/supabase";

export function AppShellHeader() {
  const { user, role, signOut } = useAuth();
  const router = useRouter();
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
      <div className="app-nav-inner container">
        <Link href="/" className="app-nav-brand">
          Smart Trade
        </Link>

        <div className="app-nav-actions">
          <Link href="/" className={`nav-button ${pathname === "/" ? "active" : ""}`}>
            Calculator
          </Link>

          <Link href="/deals" className={`nav-button ${pathname.startsWith("/deals") ? "active" : ""}`}>
            Deals
          </Link>

          {canManageRoles(role) ? (
            <Link href="/admin" className={`nav-button ${pathname.startsWith("/admin") ? "active" : ""}`}>
              <Shield size={14} />
              Admin
            </Link>
          ) : null}

          <div className="user-meta">
            <span className="user-chip">
              <Users2 size={13} />
              {role ?? "sales"}
            </span>
            <span className="user-chip">
              <UserRound size={13} />
              {user.email}
            </span>
          </div>

          <button type="button" className="logout-button" onClick={handleLogout}>
            <LogOut size={14} />
            Uitloggen
          </button>
        </div>
      </div>
    </div>
  );
}
