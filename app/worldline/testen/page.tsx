"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import WorldlineConnectivityTest from "@/components/worldline-connectivity-test";
import { canAccessTab, normalizeRoleTabAccess, type RoleTabAccessMap } from "@/lib/role-tabs";

export default function WorldlineTestPage() {
  const { user, role } = useAuth();
  const [access, setAccess] = useState<RoleTabAccessMap | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setAccess(null);
    setFailed(false);
    async function loadAccess() {
      try {
        const response = await fetch("/api/admin/role-tabs", { cache: "no-store" });
        if (!response.ok) throw new Error("Toegang controleren mislukt");
        const json = await response.json();
        if (active) setAccess(normalizeRoleTabAccess(json.roleTabAccess));
      } catch {
        if (active) setFailed(true);
      }
    }
    void loadAccess();
    return () => { active = false; };
  }, [user]);

  if (failed) return <main className="container"><p>De toegangsrechten konden niet worden gecontroleerd. Vernieuw de pagina om opnieuw te proberen.</p></main>;
  if (!user || !access) return <main className="container"><p role="status">Toegang controleren…</p></main>;
  if (!canAccessTab(role, "worldline", access)) return <main className="container"><p>Geen toegang tot Worldline.</p></main>;

  return (
    <>
      <section className="container" aria-label="Worldline testen">
        <h1>Worldline testen</h1>
        <p>Deel de <a href="/worldline-test" target="_blank" rel="noopener noreferrer">klantpagina voor de Worldline-netwerktest</a> met uw klant. De klant kan deze zonder inloggen openen en de test op het eigen netwerk uitvoeren.</p>
      </section>
      <WorldlineConnectivityTest />
    </>
  );
}
