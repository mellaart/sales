"use client";

import Link from "next/link";
import { Boxes, ClipboardList, UsersRound } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { StatusPill } from "@/components/ui";

const TEST_MODULES = [
  {
    href: "/testen/relaties",
    title: "Relaties testen",
    description: "Relaties zoeken, openen en de beschikbare relatiegegevens controleren.",
    icon: UsersRound,
  },
  {
    href: "/testen/orders",
    title: "Orders testen",
    description: "Orders en orderdetails afzonderlijk controleren voordat we gaan aanmaken.",
    icon: ClipboardList,
  },
  {
    href: "/testen/assets",
    title: "Assets testen",
    description: "Assets, assetdetails en bijbehorende assetklassen controleren.",
    icon: Boxes,
  },
];

export default function ApiTestHub() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="page-shell"><div className="container"><div className="save-status">Testomgeving laden...</div></div></div>;
  }

  if (!user) {
    return (
      <div className="page-shell">
        <div className="container stack-4">
          <section className="brand-hero card">
            <div><div className="brand-mark">Testen</div><h1>Inloggen</h1><p>Log in om de testomgeving te openen.</p></div>
          </section>
          <Link href="/login" className="primary-button">Naar login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="container stack-4">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Admin · Testen</div>
            <h1>Smart Trade testen</h1>
            <p>Test relaties, orders en assets los van elkaar in de aparte testadministratie.</p>
          </div>
          <div className="brand-actions">
            <StatusPill tone="success">Testadministratie</StatusPill>
            <StatusPill tone="warning">Alleen lezen</StatusPill>
          </div>
        </header>

        <section className="api-test-module-grid" aria-label="Testonderdelen">
          {TEST_MODULES.map(({ href, title, description, icon: Icon }) => (
            <Link key={href} href={href} className="card panel api-test-module-link">
              <span className="icon-badge"><Icon size={26} /></span>
              <span>
                <strong>{title}</strong>
                <span>{description}</span>
              </span>
              <span className="api-test-module-action">Openen</span>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
