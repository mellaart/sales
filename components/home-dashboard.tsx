"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Calculator,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Layers3,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { getDealSalesName, loadDealSalesNames, type SalesNamesByUserId } from "@/lib/deal-sales-names";
import { listDealsWithFallback } from "@/lib/deal-storage";
import {
  IMPLEMENTATION_STATUS_LABELS,
  type ImplementationRecord,
} from "@/lib/implementations";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { canViewAllDeals, getSupabaseClient, getUserDisplayName, type DealRecord } from "@/lib/supabase";
import { euro } from "@/lib/pricing";
import {
  ROLE_TAB_ACCESS,
  canAccessTab,
  normalizeRoleTabAccess,
} from "@/lib/role-tabs";
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

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getImplementationDateKey(value: string | null | undefined) {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function getImplementationDateLabel(value: string | null | undefined) {
  const dateKey = getImplementationDateKey(value);
  if (!dateKey) return "Geen datum";

  const [year, month, day] = dateKey.split("-").map(Number);
  return dashboardDateFormatter.format(new Date(year, month - 1, day));
}

export default function HomeDashboard() {
  const { user, profile, role } = useAuth();
  const supabase = getSupabaseClient();
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [implementations, setImplementations] = useState<ImplementationRecord[]>([]);
  const [showImplementationStats, setShowImplementationStats] = useState(false);
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
    const messages: string[] = [];

    let roleTabAccess = ROLE_TAB_ACCESS;
    try {
      const response = await fetch("/api/admin/role-tabs", { cache: "no-store" });
      const json = await response.json().catch(() => ({})) as { roleTabAccess?: unknown };
      if (response.ok) roleTabAccess = normalizeRoleTabAccess(json.roleTabAccess);
    } catch {
      // The default role settings remain available if the custom settings cannot be loaded.
    }

    const canViewImplementations = isProtectedAdminEmail(user.email) || canAccessTab(
      role,
      "implementation",
      roleTabAccess,
    );
    setShowImplementationStats(canViewImplementations);

    const dealResult = await listDealsWithFallback(supabase, user.id, canViewAllDeals(role), 250);
    if (dealResult.error) {
      setDeals([]);
      setSalesNamesByUserId({});
      messages.push(`Deals laden mislukt: ${dealResult.error}`);
    } else {
      const nextDeals = dealResult.deals ?? [];
      setDeals(nextDeals);
      setSalesNamesByUserId(await loadDealSalesNames(supabase, nextDeals, user, profile));
      if (dealResult.warning) messages.push(dealResult.warning);
    }

    if (canViewImplementations) {
      const { data, error } = await supabase
        .from("implementations")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) {
        setImplementations([]);
        messages.push(`Implementaties laden mislukt: ${error.message}`);
      } else {
        setImplementations((data ?? []) as ImplementationRecord[]);
      }
    } else {
      setImplementations([]);
    }

    setStatus(messages.join(" "));
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
  const implementationStats = useMemo(() => {
    const today = new Date();
    const todayKey = getLocalDateKey(today);
    const upcomingLimit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
    const upcomingLimitKey = getLocalDateKey(upcomingLimit);
    const active = implementations.filter((implementation) => implementation.status !== "completed");
    const overdue = active
      .filter((implementation) => {
        const dateKey = getImplementationDateKey(implementation.planned_go_live_date);
        return Boolean(dateKey && dateKey < todayKey);
      })
      .sort((left, right) => (
        (getImplementationDateKey(left.planned_go_live_date) ?? "")
          .localeCompare(getImplementationDateKey(right.planned_go_live_date) ?? "")
      ));
    const upcoming = active.filter((implementation) => {
      const dateKey = getImplementationDateKey(implementation.planned_go_live_date);
      return Boolean(dateKey && dateKey >= todayKey && dateKey <= upcomingLimitKey);
    });
    const withoutDate = active.filter(
      (implementation) => !getImplementationDateKey(implementation.planned_go_live_date),
    );

    return {
      total: implementations.length,
      active: active.length,
      overdue,
      upcoming: upcoming.length,
      withoutDate: withoutDate.length,
    };
  }, [implementations]);
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

        {showImplementationStats ? (
          <section className="dashboard-implementation-overview">
            <div className="top-row">
              <div>
                <div className="eyebrow">Implementatie</div>
                <h2 className="headline">Planning en voortgang</h2>
                <p className="subtext">
                  {role === "manager" || role === "admin"
                    ? "Overzicht van alle implementaties."
                    : "Overzicht van de implementaties die jij mag bekijken."}
                </p>
              </div>
              <Link href="/implementatie" className="secondary-button">Volledig overzicht</Link>
            </div>

            <div className="dashboard-implementation-stat-grid">
              <Link href="/implementatie" className="deals-stat dashboard-implementation-stat-link">
                <div className="stat-icon"><ClipboardCheck size={18} /></div>
                <div><span>Totaal</span><strong>{implementationStats.total}</strong></div>
              </Link>
              <Link href="/implementatie?planning=active" className="deals-stat dashboard-implementation-stat-link">
                <div className="stat-icon"><CalendarClock size={18} /></div>
                <div><span>Actief</span><strong>{implementationStats.active}</strong></div>
              </Link>
              <Link
                href="/implementatie?planning=overdue"
                className={`deals-stat dashboard-implementation-stat-link ${implementationStats.overdue.length ? "dashboard-stat-danger" : "dashboard-stat-success"}`}
              >
                <div className="stat-icon"><AlertTriangle size={18} /></div>
                <div><span>Livegang verstreken</span><strong>{implementationStats.overdue.length}</strong></div>
              </Link>
              <Link href="/implementatie?planning=upcoming" className="deals-stat dashboard-implementation-stat-link dashboard-stat-upcoming">
                <div className="stat-icon"><CalendarDays size={18} /></div>
                <div><span>Binnen 30 dagen</span><strong>{implementationStats.upcoming}</strong></div>
              </Link>
              <Link
                href="/implementatie?planning=missing"
                className={`deals-stat dashboard-implementation-stat-link ${implementationStats.withoutDate ? "dashboard-stat-warning" : ""}`}
              >
                <div className="stat-icon"><CalendarClock size={18} /></div>
                <div><span>Zonder livegang</span><strong>{implementationStats.withoutDate}</strong></div>
              </Link>
            </div>

            <div className="dashboard-implementation-attention">
              <div className="dashboard-implementation-attention-header">
                <div>
                  <strong>Aandacht nodig</strong>
                  <span>Actieve implementaties met een verstreken of ontbrekende livegang</span>
                </div>
                <StatusPill tone={implementationStats.overdue.length ? "danger" : implementationStats.withoutDate ? "warning" : "success"}>
                  {implementationStats.overdue.length
                    ? `${implementationStats.overdue.length} te laat${implementationStats.withoutDate ? ` · ${implementationStats.withoutDate} zonder datum` : ""}`
                    : implementationStats.withoutDate
                      ? `${implementationStats.withoutDate} zonder datum`
                      : "Alles op schema"}
                </StatusPill>
              </div>

              {implementationStats.overdue.length ? (
                <div className="dashboard-overdue-list">
                  {implementationStats.overdue.slice(0, 5).map((implementation) => (
                    <Link
                      key={implementation.id}
                      href={`/implementatie/${implementation.id}`}
                      className="dashboard-overdue-row"
                    >
                      <div>
                        <strong>{implementation.customer_name || "Onbekende klant"}</strong>
                        <span>
                          {IMPLEMENTATION_STATUS_LABELS[implementation.status]} · {implementation.assigned_consultant_name || "Nog niet toegewezen"}
                        </span>
                      </div>
                      <div className="dashboard-overdue-date">
                        <span>Geplande livegang</span>
                        <strong>{getImplementationDateLabel(implementation.planned_go_live_date)}</strong>
                      </div>
                      <ExternalLink size={17} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              ) : null}

              {implementationStats.withoutDate ? (
                <Link
                  href="/implementatie?planning=missing"
                  className="dashboard-implementation-clear dashboard-implementation-warning"
                >
                  <CalendarClock size={18} />
                  {implementationStats.withoutDate} {implementationStats.withoutDate === 1 ? "actieve implementatie heeft" : "actieve implementaties hebben"} nog geen livegang.
                  <ExternalLink size={16} aria-hidden="true" />
                </Link>
              ) : null}

              {!implementationStats.overdue.length && !implementationStats.withoutDate ? (
                <div className="dashboard-implementation-clear">
                  <CheckCircle2 size={18} /> Geen actieve implementaties met een verstreken livegang.
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

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
