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
  const mustSetPassword = Boolean(user?.user_metadata?.must_set_password);

  useEffect(() => {
    if (!loading && !user && !isLoginPage) {
      router.replace("/login");
      return;
    }

    if (!loading && user && mustSetPassword && !isResetPasswordPage) {
      router.replace("/reset-password");
    }
  }, [loading, user, isLoginPage, isResetPasswordPage, mustSetPassword, router]);

  if (!loading && !user && !isLoginPage) {
    return null;
  }

  if (!loading && user && mustSetPassword && !isResetPasswordPage) {
    return null;
  }

  return <>{children}</>;
}
