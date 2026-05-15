"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, LogOut, UserRound, Users2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";

export function AppShellHeader() {
  const { user, role } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const handleLogout = async () => {
    const supabase = getSupabaseClient();

    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (error) {
      console.error("Uitloggen mislukt, lokale sessie wordt alsnog opgeschoond.", error);
    } finally {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/login";
    }
  };

  return (
    <header className="app-nav">
      <div className="app-nav-inner">
        <Link href="/" className="app-nav-brand">
          <span className="brand-dot" />
          Smart Trade
        </Link>

        <nav className="app-nav-actions">
          <Link href="/" className={`nav-button ${pathname === "/" ? "active" : ""}`}>
            Dashboard
          </Link>

          <Link href="/calculator" className={`nav-button ${pathname.startsWith("/calculator") ? "active" : ""}`}>
            Calculator
          </Link>

          <Link href="/deals" className={`nav-button ${pathname.startsWith("/deals") ? "active" : ""}`}>
            Deals
          </Link>

          <Link href="/assets" className={`nav-button ${pathname.startsWith("/assets") ? "active" : ""}`}>
            <Boxes size={15} />
            Assets
          </Link>

          <Link href="/admin" className={`nav-button ${pathname.startsWith("/admin") ? "active" : ""}`}>
            Admin
          </Link>

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
