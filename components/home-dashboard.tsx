"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Calculator, Euro, FileText, Layers3, RefreshCw, Users } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { listDealsWithFallback } from "@/lib/deal-storage";
import { canViewAllDeals, getSupabaseClient, type DealRecord } from "@/lib/supabase";
import { euro } from "@/lib/pricing";

function getRecentDealMeta(deal: DealRecord) {
  const expansionLines = deal.calculator_inputs?.assetsExpansion?.lines;

  if (deal.calculator_inputs?.quoteLayout === "assets-expansion" && expansionLines?.length) {
    const lineLabel = expansionLines.length === 1 ? "1 regel" : `${expansionLines.length} regels`;
    return `Uitbreiding · ${lineLabel}`;
  }

  return `${deal.package_name || "-"} · ${deal.total_users || 0} gebruikers`;
}

export default function HomeDashboard() {
  const { user, role } = useAuth();
  const supabase = getSupabaseClient();
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const loadStats = useCallback(async () => {
    if (!user) return;
    if (!supabase) {
      setStatus("Supabase keys ontbreken. Vul NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY in.");
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await listDealsWithFallback(supabase, user.id, canViewAllDeals(role), 250);
    if (result.error) {
      setStatus(`Dashboard laden mislukt: ${result.error}`);
      setLoading(false);
      return;
    }

    setDeals(result.deals ?? []);
    setStatus(result.warning ?? "");
    setLoading(false);
  }, [role, user, supabase]);

  useEffect(() => {
    void loadStats();
  }, [user, role, loadStats]);

  const stats = useMemo(() => {
    const totalDeals = deals.length;
    const totalMonthly = deals.reduce((sum, d) => sum + Number(d.monthly_total || 0), 0);
    const avgMonthly = totalDeals ? totalMonthly / totalDeals : 0;
    const totalUsers = deals.reduce((sum, d) => sum + Number(d.total_users || 0), 0);
    const packages = new Set(deals.map((d) => d.package_name).filter(Boolean));

    return { totalDeals, totalMonthly, avgMonthly, totalUsers, activePackages: packages.size };
  }, [deals]);

  const recentDeals = useMemo(() => deals.slice(0, 5), [deals]);

  return (
    <div className="page-shell">
      <div className="container stack-4">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Smart Trade</div>
            <h1>Sales dashboard</h1>
            <p>
              Welkom terug! Hier zie je in één oogopslag de belangrijkste sales cijfers en kan je direct naar de
              calculator, deals en assets.
            </p>
          </div>
          <div className="brand-actions">
            <Link href="/calculator" className="primary-button"><Calculator size={16} /> Nieuwe berekening</Link>
            <button type="button" className="secondary-button" onClick={() => void loadStats()}><RefreshCw size={16} /> Vernieuwen</button>
          </div>
        </header>

        <section className="stats-grid">
          <article className="card panel stat-card"><div className="stat-icon"><FileText size={18} /></div><div><div className="eyebrow">Deals</div><h3>{stats.totalDeals}</h3><p className="subtext">Totaal opgeslagen voorstellen</p></div></article>
          <article className="card panel stat-card"><div className="stat-icon"><Euro size={18} /></div><div><div className="eyebrow">MRR</div><h3>{euro.format(stats.totalMonthly)}</h3><p className="subtext">Som van maandelijkse waarde</p></div></article>
          <article className="card panel stat-card"><div className="stat-icon"><BarChart3 size={18} /></div><div><div className="eyebrow">Gemiddelde</div><h3>{euro.format(stats.avgMonthly)}</h3><p className="subtext">Gemiddelde maandprijs per deal</p></div></article>
          <article className="card panel stat-card"><div className="stat-icon"><Users size={18} /></div><div><div className="eyebrow">Gebruikers</div><h3>{stats.totalUsers}</h3><p className="subtext">Totaal gebruikers in deals</p></div></article>
          <article className="card panel stat-card"><div className="stat-icon"><Layers3 size={18} /></div><div><div className="eyebrow">Pakketten</div><h3>{stats.activePackages}</h3><p className="subtext">Aantal actieve pakkettypes</p></div></article>
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Recent</div>
              <h2 className="headline">Laatste deals</h2>
            </div>
            <Link href="/deals" className="secondary-button">Volledig overzicht</Link>
          </div>
          {loading ? <div className="save-status">Dashboard wordt geladen...</div> : null}
          {status ? <div className="save-status">{status}</div> : null}
          <div className="deal-list">
            {recentDeals.map((deal) => (
              <div key={deal.id} className="deal-row">
                <div>
                  <div className="package-name">{deal.customer_name || "Onbekende klant"}</div>
                  <div className="muted small-gap">{getRecentDealMeta(deal)}</div>
                </div>
                <div className="muted">{euro.format(Number(deal.monthly_total || 0))} p/m</div>
              </div>
            ))}
            {!loading && recentDeals.length === 0 ? <div className="save-status">Nog geen deals gevonden.</div> : null}
          </div>
          {canViewAllDeals(role) ? <p className="subtext">Je bekijkt data op manager/admin niveau.</p> : null}
        </section>
      </div>
    </div>
  );
}
