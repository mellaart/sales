"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PriceCalculator from "@/components/price-calculator";
import { useAuth } from "@/components/auth-provider";

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, router, user]);

  if (loading) {
    return null;
  }

  if (!user) {
    return null;
  }

  return <PriceCalculator />;
}