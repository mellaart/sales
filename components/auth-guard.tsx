"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isLoginPage = pathname === "/login";
  const isResetPasswordPage = pathname === "/reset-password";
  const isPublicPage = isLoginPage
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
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }

    if (!loading && user && mustSetPassword && !isResetPasswordPage && !isPublicPage) {
      router.replace("/reset-password");
    }
  }, [isPublicPage, isResetPasswordPage, loading, mustSetPassword, pathname, router, user]);

  if (loading && !isPublicPage) {
    return null;
  }

  if (!loading && !user && !isPublicPage) {
    return null;
  }

  if (!loading && user && mustSetPassword && !isResetPasswordPage && !isPublicPage) {
    return null;
  }

  return <>{children}</>;
}
