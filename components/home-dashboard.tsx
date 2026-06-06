"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Calculator, CalendarDays, ExternalLink, FileText, Layers3, RefreshCw, WalletCards } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { getDealSalesName, loadDealSalesNames, type SalesNamesByUserId } from "@/lib/deal-sales-names";
import { listDealsWithFallback } from "@/lib/deal-storage";
import { canViewAllDeals, getSupabaseClient, getUserDisplayName, type DealRecord } from "@/lib/supabase";
import { euro } from "@/lib/pricing";
import { StatusPill } from "@/components/ui";

const dashboardDateFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function isExpansionDeal(deal: DealRecord) {
  return deal.calculator_inputs?.quoteLayout === "assets-expansion" && Boolean(deal.calculator_inputs.assetsExpansion?.lines?.length);
}

function getDealTypeLabel(deal: DealRecord) {
  return isExpansionDeal(deal) ? "Uitbreiding" : "Calculator";
}

function getRecentDealMeta(deal: DealRecord) {
  const expansionLines = deal.calculator_inputs?.assetsExpansion?.lines;

  if (deal.calculator_inputs?.quoteLayout === "assets-expansion" && expansionLines?.length) {
    const lineLabel = expansionLines.length === 1 ? "1 regel" : `${expansionLines.length} regels`;
    return `Uitbreiding · ${lineLabel}`;
  }

  return `${deal.package_name || "-"} · ${deal.total_users || 0} gebruikers`;
}

function getDealDateLabel(deal: DealRecord) {
  if (!deal.created_at) return "Geen datum";

  const date = new Date(deal.created_at);
  if (Number.isNaN(date.getTime())) return "Geen datum";

  return dashboardDateFormatter.format(date);
}

export default function HomeDashboard() {
  const { user, profile, role } = useAuth();
  const supabase = getSupabaseClient();
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [salesNamesByUserId, setSalesNamesByUserId] = useState<SalesNamesByUserId>({});
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

    const nextDeals = result.deals ?? [];
    setDeals(nextDeals);
    setSalesNamesByUserId(await loadDealSalesNames(supabase, nextDeals, user, profile));
    setStatus(result.warning ?? "");
    setLoading(false);
  }, [profile, role, user, supabase]);

  useEffect(() => {
    void loadStats();
  }, [user, role, loadStats]);

  const stats = useMemo(() => {
    const totalDeals = deals.length;
    const totalMonthly = deals.reduce((sum, d) => sum + Number(d.monthly_total || 0), 0);
    const avgMonthly = totalDeals ? totalMonthly / totalDeals : 0;
    const expansionDeals = deals.filter(isExpansionDeal).length;
    const latestDeal = deals[0] ?? null;

    return {
      totalDeals,
      totalMonthly,
      avgMonthly,
      expansionDeals,
      calculatorDeals: totalDeals - expansionDeals,
      latestLabel: latestDeal ? getDealDateLabel(latestDeal) : "-",
    };
  }, [deals]);

  const recentDeals = useMemo(() => deals.slice(0, 5), [deals]);
  const currentSalesName = useMemo(() => getUserDisplayName(user, profile), [profile, user]);

  return (
    <div className="page-shell">
      <div className="container dashboard-page">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Smart Trade</div>
            <h1>Sales dashboard</h1>
            <p>
              In één overzicht je saleswaarde, laatste deals en de belangrijkste acties.
            </p>
          </div>
          <div className="brand-actions">
            <Link href="/calculator" className="primary-button"><Calculator size={16} /> Nieuwe berekening</Link>
            <button type="button" className="secondary-button" onClick={() => void loadStats()}><RefreshCw size={16} /> Vernieuwen</button>
          </div>
        </header>

        <section className="deals-stat-grid">
          <article className="deals-stat">
            <div className="stat-icon"><FileText size={18} /></div>
            <div><span>Deals</span><strong>{stats.totalDeals}</strong></div>
          </article>
          <article className="deals-stat">
            <div className="stat-icon"><WalletCards size={18} /></div>
            <div><span>Maandwaarde</span><strong>{euro.format(stats.totalMonthly)}</strong></div>
          </article>
          <article className="deals-stat">
            <div className="stat-icon"><BarChart3 size={18} /></div>
            <div><span>Gemiddelde</span><strong>{euro.format(stats.avgMonthly)}</strong></div>
          </article>
          <article className="deals-stat">
            <div className="stat-icon"><CalendarDays size={18} /></div>
            <div><span>Laatste deal</span><strong>{stats.latestLabel}</strong></div>
          </article>
        </section>

        <section className="dashboard-action-grid">
          <Link href="/deals" className="dashboard-action-card">
            <div className="stat-icon"><FileText size={18} /></div>
            <div>
              <strong>Deals beheren</strong>
              <span>{stats.calculatorDeals} calculator · {stats.expansionDeals} uitbreidingen</span>
            </div>
          </Link>
          <Link href="/assets" className="dashboard-action-card">
            <div className="stat-icon"><Layers3 size={18} /></div>
            <div>
              <strong>Assets bekijken</strong>
              <span>Uitbreidingen selecteren en doorzetten naar deals</span>
            </div>
          </Link>
          <Link href="/calculator" className="dashboard-action-card">
            <div className="stat-icon"><Calculator size={18} /></div>
            <div>
              <strong>Nieuwe offerte</strong>
              <span>Start direct een nieuwe calculatorberekening</span>
            </div>
          </Link>
        </section>

        <section className="deals-results card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Recent</div>
              <h2 className="headline">Laatste deals</h2>
            </div>
            <Link href="/deals" className="secondary-button">Volledig overzicht</Link>
          </div>
          {loading ? <div className="save-status">Dashboard wordt geladen...</div> : null}
          {status ? <div className="save-status">{status}</div> : null}
          <div className="deals-list">
            {recentDeals.map((deal) => (
              <article key={deal.id} className="deal-card-row">
                <div className="deal-card-main">
                  <div className="deal-card-top">
                    <StatusPill tone={isExpansionDeal(deal) ? "success" : "warning"}>{getDealTypeLabel(deal)}</StatusPill>
                    <span className="deal-date">{getDealDateLabel(deal)}</span>
                  </div>
                  <div>
                    <h3>{deal.customer_name || "Onbekende klant"}</h3>
                    <p>{getRecentDealMeta(deal)}</p>
                  </div>
                  <div className="deal-meta-grid">
                    <span>Contact: <strong>{deal.contact_name || "-"}</strong></span>
                    <span>Sales: <strong>{getDealSalesName(deal, salesNamesByUserId, user?.id, currentSalesName)}</strong></span>
                  </div>
                </div>
                <div className="deal-card-side">
                  <div className="deal-amount">
                    <span>Maand</span>
                    <strong>{euro.format(Number(deal.monthly_total || 0))}</strong>
                  </div>
                  <div className="button-row compact deal-actions">
                    <Link href={`/deals/${deal.id}`} className="primary-button"><ExternalLink size={16} /> Open</Link>
                  </div>
                </div>
              </article>
            ))}
            {!loading && recentDeals.length === 0 ? <div className="save-status">Nog geen deals gevonden.</div> : null}
          </div>
          {canViewAllDeals(role) ? <p className="subtext">Je bekijkt data op manager/admin niveau.</p> : null}
        </section>
      </div>
    </div>
  );
}
