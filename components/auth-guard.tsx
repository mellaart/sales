"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  const isLoginPage = pathname === "/login";
  const isResetPasswordPage = pathname === "/reset-password";
  const isPublicPage = isLoginPage
    || isResetPasswordPage
    || pathname === "/worldline-test"
    || pathname.startsWith("/klantgegevens/")
    || pathname.startsWith("/implementatie-volgen/")
    || pathname.startsWith("/offerte/")
    || pathname.startsWith("/retourpinnen/");
  const mustSetPassword = Boolean(user?.user_metadata?.must_set_password);

  useEffect(() => {
    if (!loading && !user && !isPublicPage) {
      const returnTo = typeof window === "undefined"
        ? pathname
        : `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }

    if (!loading && user && mustSetPassword && !isResetPasswordPage && !isPublicPage) {
      window.location.replace("/reset-password");
    }
  }, [isPublicPage, isResetPasswordPage, loading, mustSetPassword, pathname, user]);

  if (!isPublicPage && (loading || !user || (mustSetPassword && !isResetPasswordPage))) {
    return (
      <main style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
        <p role="status">{loading ? "Je sessie wordt gecontroleerd…" : "Je wordt doorgestuurd naar het inlogscherm…"}</p>
        <p>Duurt dit te lang? <a href="/login">Open het inlogscherm</a></p>
      </main>
    );
  }

  return <>{children}</>;
}
