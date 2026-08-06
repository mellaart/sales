"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  FileText,
  Inbox,
  RefreshCw,
  Search,
  Trash2,
  WalletCards,
} from "lucide-react";
import { getDealSalesName, loadDealSalesNames, type SalesNamesByUserId } from "@/lib/deal-sales-names";
import { deleteDealWithFallback, listDealsWithFallback, updateDealWithFallback } from "@/lib/deal-storage";
import { euro } from "@/lib/pricing";
import { canViewAllDeals, type DealRecord, getSupabaseClient, getUserDisplayName } from "@/lib/supabase";
import { StatusPill } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";

type DealFilter = "all" | "expansion" | "calculator";
type ArchiveView = "active" | "archived";

const dealDateFormatter = new Intl.DateTimeFormat("nl-NL", {
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

function getDealMeta(deal: DealRecord) {
  const expansionLines = deal.calculator_inputs?.assetsExpansion?.lines;

  if (deal.calculator_inputs?.quoteLayout === "assets-expansion" && expansionLines?.length) {
    const lineLabel = expansionLines.length === 1 ? "1 uitbreidingsregel" : `${expansionLines.length} uitbreidingsregels`;
    return `${deal.quote_title} · Uitbreiding · ${lineLabel}`;
  }

  return `${deal.quote_title} · ${deal.package_name} · ${deal.total_users} gebruikers`;
}

function getDealDateLabel(deal: DealRecord) {
  if (!deal.created_at) return "Geen datum";

  const date = new Date(deal.created_at);
  if (Number.isNaN(date.getTime())) return "Geen datum";

  return dealDateFormatter.format(date);
}

function getArchivedDateLabel(deal: DealRecord) {
  if (!deal.archived_at) return "Geen archiefdatum";

  const date = new Date(deal.archived_at);
  if (Number.isNaN(date.getTime())) return "Geen archiefdatum";

  return `Gearchiveerd ${dealDateFormatter.format(date)}`;
}

function dealApprovalLabel(deal: DealRecord) {
  if (deal.accepted_at) return { label: "Klant akkoord", tone: "success" as const };
  if (!deal.approval_requested_at) return null;

  const expiresAt = deal.approval_expires_at ? new Date(deal.approval_expires_at).getTime() : 0;
  if (expiresAt > 0 && expiresAt <= Date.now()) {
    return { label: "Akkoordlink verlopen", tone: "danger" as const };
  }
  return { label: "Wacht op akkoord", tone: "warning" as const };
}

function getDealSearchValues(deal: DealRecord, salesName: string) {
  return [
    deal.customer_name,
    deal.quote_title,
    deal.contact_name,
    deal.package_name,
    salesName,
    getDealTypeLabel(deal),
    ...(deal.calculator_inputs?.assetsExpansion?.lines ?? []).map((line) => line.label),
  ];
}

export default function DealsDashboard() {
  const { user, profile, role } = useAuth();
  const supabase = getSupabaseClient();
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [salesNamesByUserId, setSalesNamesByUserId] = useState<SalesNamesByUserId>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [dealFilter, setDealFilter] = useState<DealFilter>("all");
  const [archiveView, setArchiveView] = useState<ArchiveView>("active");
  const [status, setStatus] = useState("");

  const loadDeals = useCallback(async () => {
    if (!user) {
      setStatus("Je moet ingelogd zijn om deals te bekijken.");
      setLoading(false);
      return;
    }

    if (!supabase) {
      setStatus("Supabase keys ontbreken. Vul NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY in.");
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await listDealsWithFallback(supabase, user.id, canViewAllDeals(role), undefined, true);
    if (result.error) {
      setStatus(`Deals laden mislukt: ${result.error}`);
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
    void loadDeals();
  }, [user, role, loadDeals]);

  const currentSalesName = useMemo(() => getUserDisplayName(user, profile), [profile, user]);

  const activeDeals = useMemo(() => deals.filter((deal) => !deal.archived_at), [deals]);
  const archivedDeals = useMemo(
    () => deals
      .filter((deal) => Boolean(deal.archived_at))
      .sort((a, b) => String(b.archived_at ?? "").localeCompare(String(a.archived_at ?? ""))),
    [deals],
  );
  const visibleDeals = archiveView === "archived" ? archivedDeals : activeDeals;

  const filteredDeals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visibleDeals.filter((deal) => {
      if (dealFilter === "expansion" && !isExpansionDeal(deal)) return false;
      if (dealFilter === "calculator" && isExpansionDeal(deal)) return false;
      if (!q) return true;

      return getDealSearchValues(deal, getDealSalesName(deal, salesNamesByUserId, user?.id, currentSalesName))
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [currentSalesName, dealFilter, query, salesNamesByUserId, user?.id, visibleDeals]);

  const stats = useMemo(() => {
    const expansionDeals = activeDeals.filter(isExpansionDeal).length;
    const monthlyTotal = activeDeals.reduce((sum, deal) => sum + Number(deal.monthly_total || 0), 0);
    const latestDeal = activeDeals[0] ?? null;

    return {
      totalDeals: activeDeals.length,
      expansionDeals,
      calculatorDeals: activeDeals.length - expansionDeals,
      monthlyTotal,
      latestLabel: latestDeal ? getDealDateLabel(latestDeal) : "-",
    };
  }, [activeDeals]);

  const visibleExpansionDeals = visibleDeals.filter(isExpansionDeal).length;

  const filterOptions: Array<{ key: DealFilter; label: string; count: number }> = [
    { key: "all", label: "Alles", count: visibleDeals.length },
    { key: "expansion", label: "Uitbreidingen", count: visibleExpansionDeals },
    { key: "calculator", label: "Calculator", count: visibleDeals.length - visibleExpansionDeals },
  ];

  const handleDelete = async (deal: DealRecord) => {
    const canDelete = role === "admin" || deal.user_id === user?.id;
    if (!canDelete) {
      setStatus("Je mag alleen je eigen deals verwijderen.");
      return;
    }

    const confirmed = window.confirm(`Weet je zeker dat je deal van ${deal.customer_name || deal.quote_title} wilt verwijderen?`);
    if (!confirmed) return;

    const result = await deleteDealWithFallback(supabase, deal.id);
    if (result.error) {
      setStatus(`Verwijderen mislukt: ${result.error}`);
      return;
    }

    setStatus("Deal verwijderd.");
    await loadDeals();
  };

  const handleRestore = async (deal: DealRecord) => {
    const canRestore = role === "admin" || deal.user_id === user?.id;
    if (!canRestore) {
      setStatus("Je mag deze deal niet terugzetten.");
      return;
    }

    const result = await updateDealWithFallback(supabase, deal.id, { archived_at: null });
    if (result.error) {
      setStatus(`Terugzetten mislukt: ${result.error}`);
      return;
    }

    setStatus("Deal is teruggezet naar actieve deals.");
    await loadDeals();
  };

  return (
    <div className="page-shell">
      <div className="container deals-page">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Smart Trade</div>
            <h1>Deal overzicht</h1>
            <p>
              {canViewAllDeals(role)
                ? "Alle deals, uitbreidingen en offertes overzichtelijk bij elkaar."
                : "Jouw opgeslagen deals, uitbreidingen en offertes overzichtelijk bij elkaar."}
            </p>
          </div>
          <div className="brand-actions">
            <Link href="/" className="secondary-button"><ArrowLeft size={16} /> Terug naar calculator</Link>
            <button type="button" className="primary-button" onClick={() => void loadDeals()}><RefreshCw size={16} /> Vernieuwen</button>
          </div>
        </header>

        <section className="deals-stat-grid">
          <article className="deals-stat">
            <div className="stat-icon"><FileText size={18} /></div>
            <div>
              <span>Deals</span>
              <strong>{stats.totalDeals}</strong>
            </div>
          </article>
          <article className="deals-stat">
            <div className="stat-icon"><WalletCards size={18} /></div>
            <div>
              <span>Maandwaarde</span>
              <strong>{euro.format(stats.monthlyTotal)}</strong>
            </div>
          </article>
          <article className="deals-stat">
            <div className="stat-icon"><ExternalLink size={18} /></div>
            <div>
              <span>Uitbreidingen</span>
              <strong>{stats.expansionDeals}</strong>
            </div>
          </article>
          <article className="deals-stat">
            <div className="stat-icon"><CalendarDays size={18} /></div>
            <div>
              <span>Laatste deal</span>
              <strong>{stats.latestLabel}</strong>
            </div>
          </article>
        </section>

        <section className="deals-toolbar card panel">
          <div>
            <div className="eyebrow">Zoeken en filteren</div>
            <h2 className="headline">Deals vinden</h2>
          </div>
          <div className="deals-archive-switch" role="group" aria-label="Kies actieve of gearchiveerde deals">
            <button
              type="button"
              className={`deals-archive-button ${archiveView === "active" ? "active" : ""}`}
              aria-pressed={archiveView === "active"}
              onClick={() => setArchiveView("active")}
            >
              <Inbox size={17} />
              <span>Actieve deals</span>
              <strong>{activeDeals.length}</strong>
            </button>
            <button
              type="button"
              className={`deals-archive-button ${archiveView === "archived" ? "active" : ""}`}
              aria-pressed={archiveView === "archived"}
              onClick={() => setArchiveView("archived")}
            >
              <Archive size={17} />
              <span>Gearchiveerde deals</span>
              <strong>{archivedDeals.length}</strong>
            </button>
          </div>
          <div className="deals-filter-bar">
            {filterOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`deals-filter-button ${dealFilter === option.key ? "active" : ""}`}
                onClick={() => setDealFilter(option.key)}
              >
                <span>{option.label}</span>
                <strong>{option.count}</strong>
              </button>
            ))}
          </div>
          <div className="search-row deals-search-row">
            <div className="search-box">
              <Search size={16} />
              <input className="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek op klant, voorstel, contact, pakket of sales" />
            </div>
            {query ? (
              <button type="button" className="secondary-button" onClick={() => setQuery("")}>
                Wissen
              </button>
            ) : null}
          </div>
        </section>

        <section className="deals-results card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Resultaten</div>
              <h2 className="headline">
                {filteredDeals.length} {archiveView === "archived" ? "gearchiveerde deals" : "deals"}
              </h2>
            </div>
            <StatusPill tone="neutral">
              {archiveView === "archived"
                ? "Archief"
                : dealFilter === "all"
                  ? "Alle types"
                  : dealFilter === "expansion"
                    ? "Uitbreidingen"
                    : "Calculator"}
            </StatusPill>
          </div>

          {loading ? <div className="save-status">Deals worden geladen...</div> : null}
          {status ? <div className="save-status">{status}</div> : null}

          <div className="deals-list">
            {filteredDeals.map((deal) => {
              const canDelete = role === "admin" || deal.user_id === user?.id;
              const canRestore = role === "admin" || deal.user_id === user?.id;
              const approval = dealApprovalLabel(deal);

              return (
                <article key={deal.id} className="deal-card-row">
                  <div className="deal-card-main">
                    <div className="deal-card-top">
                      <StatusPill tone={isExpansionDeal(deal) ? "success" : "warning"}>{getDealTypeLabel(deal)}</StatusPill>
                      {deal.archived_at ? <StatusPill tone="neutral">Gearchiveerd</StatusPill> : null}
                      {approval ? <StatusPill tone={approval.tone}>{approval.label}</StatusPill> : null}
                      <span className="deal-date">
                        {deal.archived_at ? getArchivedDateLabel(deal) : getDealDateLabel(deal)}
                      </span>
                    </div>
                    <div>
                      <h3>{deal.customer_name || "Onbekende klant"}</h3>
                      <p>{getDealMeta(deal)}</p>
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
                      {archiveView === "archived" && canRestore ? (
                        <button type="button" className="secondary-button" onClick={() => void handleRestore(deal)}>
                          <ArchiveRestore size={16} /> Terugzetten
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button type="button" className="secondary-button danger" onClick={() => void handleDelete(deal)}><Trash2 size={16} /> Verwijder</button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
            {!loading && filteredDeals.length === 0 ? <div className="save-status">Geen deals gevonden.</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
