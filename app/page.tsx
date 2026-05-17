"use client";

import Link from "next/link";
import HomeDashboard from "@/components/home-dashboard";
import { useAuth } from "@/components/auth-provider";

export default function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="page-shell">
        <div className="container">
          <div className="save-status">Authenticatie wordt geladen...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page-shell">
        <div className="container stack-4">
          <section className="brand-hero card">
            <div>
              <div className="brand-mark">Smart Trade</div>
              <h1>Welkom</h1>
              <p>Log in om je dashboard en calculator te gebruiken.</p>
            </div>
          </section>

          <Link href="/login" className="primary-button">
            Naar login
          </Link>
        </div>
      </div>
    );
  }

  return <HomeDashboard />;
}
