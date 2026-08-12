"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  MailCheck,
  RefreshCw,
  Search,
  ShieldAlert,
  Tags,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { StatusPill } from "@/components/ui";
import {
  ROLE_TAB_ACCESS,
  canAccessTab,
  canWriteTab,
  normalizeRoleTabAccess,
  type RoleTabAccessMap,
} from "@/lib/role-tabs";

type ContactState = "new" | "update" | "unchanged" | "blocked";

type MailchimpContact = {
  email: string;
  company: string;
  tags: string[];
  relationIds: string[];
  sources: Array<"relation" | "contact">;
  conflict: boolean;
  state: ContactState;
  mailchimpStatus: string | null;
};

type MailchimpPreview = {
  configured: boolean;
  audienceSelected: boolean;
  audience: { id: string; name: string; memberCount: number } | null;
  audiences: Array<{ id: string; name: string; memberCount: number }>;
  source: {
    relationCount: number;
    contactPersonCount: number;
    contactPersonErrorCount: number;
    invalidEmailCount: number;
    conflictCount: number;
    tags: string[];
  };
  contacts: MailchimpContact[];
  counts: Record<"total" | "new" | "update" | "unchanged" | "blocked" | "removeTags", number>;
  apiKeyExpiresAt: string | null;
  apiKeyExpiryDays: number | null;
  companyFieldReady: boolean;
  lastSyncAt: string | null;
  lastSyncResult: Record<string, unknown> | null;
  syncResult?: Record<string, unknown>;
};

type StateFilter = "all" | ContactState | "conflict";

type MailchimpRefreshStatus = {
  state: "idle" | "running" | "ready" | "error";
  phase: "idle" | "relations" | "contactpersons" | "complete";
  processed: number;
  total: number | null;
  hasSource: boolean;
  sourceUpdatedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
};

const STATE_LABELS: Record<ContactState, string> = {
  new: "Nieuw",
  update: "Bijwerken",
  unchanged: "Ongewijzigd",
  blocked: "Niet opnieuw inschrijven",
};

function localDate(value: string | null) {
  if (!value) return "Nog niet uitgevoerd";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" });
}

function getToken() {
  return import("@/lib/supabase").then(async ({ getSupabaseClient }) => {
    const { data } = await getSupabaseClient()!.auth.getSession();
    return data.session?.access_token ?? null;
  });
}

export default function MailchimpDashboard() {
  const { role } = useAuth();
  const [roleTabAccess, setRoleTabAccess] = useState<RoleTabAccessMap>(ROLE_TAB_ACCESS);
  const [accessLoading, setAccessLoading] = useState(true);
  const [preview, setPreview] = useState<MailchimpPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [refreshStatus, setRefreshStatus] = useState<MailchimpRefreshStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [selectedAudienceId, setSelectedAudienceId] = useState("");

  const canView = canAccessTab(role, "mailchimp", roleTabAccess);
  const canWrite = canWriteTab(role, "mailchimp", roleTabAccess);

  useEffect(() => {
    if (!loading) {
      setLoadingSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setLoadingSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (!role) {
      setAccessLoading(false);
      return;
    }
    let active = true;
    fetch("/api/admin/role-tabs", { cache: "no-store" })
      .then((response) => response.json())
      .then((json) => {
        if (active) setRoleTabAccess(normalizeRoleTabAccess(json.roleTabAccess));
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setAccessLoading(false);
      });
    return () => { active = false; };
  }, [role]);

  async function requestPreview(
    method: "GET" | "POST" = "GET",
    body?: Record<string, unknown>,
    query = "",
  ) {
    const token = await getToken();
    if (!token) throw new Error("Je sessie is verlopen. Log opnieuw in.");
    const response = await fetch(`/api/admin/mailchimp${query}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const json = await response.json().catch(() => ({})) as MailchimpPreview & { error?: string };
    if (!response.ok) throw new Error(json.error || "Mailchimp laden mislukt.");
    setPreview(json);
    setSelectedAudienceId(json.audience?.id ?? "");
    return json;
  }

  async function requestRefresh(query: string) {
    const token = await getToken();
    if (!token) throw new Error("Je sessie is verlopen. Log opnieuw in.");
    const response = await fetch(`/api/admin/mailchimp${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = await response.json().catch(() => ({})) as {
      error?: string;
      refresh?: MailchimpRefreshStatus;
    };
    if (!response.ok && response.status !== 202) throw new Error(json.error || "Mailchimp laden mislukt.");
    if (json.refresh) setRefreshStatus(json.refresh);
    return json.refresh ?? null;
  }

  function refreshMessage(refresh: MailchimpRefreshStatus | null) {
    if (!refresh) return "Smart Trade-contacten worden voorbereid...";
    if (refresh.state === "error") return refresh.error || "Smart Trade-contacten ophalen mislukt.";
    if (refresh.state === "ready") return "Smart Trade-contacten zijn gereed; Mailchimp wordt vergeleken...";
    if (refresh.phase === "contactpersons") {
      const total = refresh.total ?? 0;
      return total > 0
        ? `Contactpersonen ophalen: ${refresh.processed} van ${total} relaties verwerkt...`
        : "Contactpersonen worden opgehaald...";
    }
    return `Relaties en klantgroepen ophalen${refresh.processed > 0 ? `: ${refresh.processed} gevonden` : ""}...`;
  }

  async function waitForRefresh() {
    while (true) {
      const refresh = await requestRefresh("?mode=status");
      setStatus(refreshMessage(refresh));
      if (refresh?.state === "ready") return;
      if (refresh?.state === "error") throw new Error(refresh.error || "Smart Trade-contacten ophalen mislukt.");
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }
  }

  async function loadPreview(forceRefresh = false) {
    const startedAt = performance.now();
    setLoading(true);
    setStatus("Mailchimp-verbinding wordt gecontroleerd...");
    try {
      await requestPreview("GET", undefined, "?mode=connection");
      setStatus("Mailchimp is verbonden. Smart Trade-contacten worden voorbereid...");
      const refresh = await requestRefresh(`?mode=start${forceRefresh ? "&refresh=1" : ""}`);
      setStatus(refreshMessage(refresh));
      if (refresh?.hasSource && refresh.state === "running") await requestPreview();
      if (refresh?.state !== "ready") await waitForRefresh();
      await requestPreview();
      const seconds = Math.max(1, Math.round((performance.now() - startedAt) / 1000));
      setStatus(`Vooroverzicht bijgewerkt in ${seconds} seconden.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Vooroverzicht laden mislukt.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accessLoading && canView && !preview && !loading) void loadPreview();
    // De eerste laadactie wordt uitsluitend gestart zodra de rechten bekend zijn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessLoading, canView]);

  async function selectAudience(value: string) {
    setSelectedAudienceId(value);
    setLoading(true);
    setStatus("Mailchimp-publiek wordt geselecteerd...");
    try {
      await requestPreview("POST", { action: "selectAudience", audienceId: value });
      setStatus("Mailchimp-publiek geselecteerd.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Publiek selecteren mislukt.");
    } finally {
      setLoading(false);
    }
  }

  async function synchronize() {
    if (!selectedAudienceId || !preview?.audienceSelected) {
      setStatus("Selecteer eerst een Mailchimp-publiek.");
      return;
    }
    if (!window.confirm(`Synchroniseer ${preview.counts.total} contacten met ${preview.audience?.name ?? "Mailchimp"}?`)) return;
    setSyncing(true);
    setStatus("Mailchimp wordt gesynchroniseerd. Sluit deze pagina nog niet...");
    try {
      const result = await requestPreview("POST", { action: "sync", audienceId: selectedAudienceId });
      const sync = result.syncResult ?? {};
      setStatus(`Synchronisatie klaar: ${sync.created ?? 0} nieuw, ${sync.updated ?? 0} bijgewerkt, ${sync.failed ?? 0} mislukt.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Synchronisatie mislukt.");
    } finally {
      setSyncing(false);
    }
  }

  const filteredContacts = useMemo(() => {
    if (!preview) return [];
    const needle = search.trim().toLowerCase();
    return preview.contacts.filter((contact) => {
      const stateMatches = stateFilter === "all"
        || (stateFilter === "conflict" ? contact.conflict : contact.state === stateFilter);
      const tagMatches = !tagFilter || contact.tags.includes(tagFilter);
      const textMatches = !needle || [contact.company, contact.email, ...contact.tags, ...contact.relationIds]
        .join(" ").toLowerCase().includes(needle);
      return stateMatches && tagMatches && textMatches;
    });
  }, [preview, search, stateFilter, tagFilter]);

  if (accessLoading) return <div className="page-shell"><div className="container"><section className="card panel"><h1>Mailchimp wordt geladen...</h1></section></div></div>;
  if (!canView) return (
    <div className="page-shell"><div className="container"><section className="card panel"><div className="top-row"><div><div className="eyebrow">Geen toegang</div><h1>Mailchimp</h1><p className="subtext">Je rol heeft geen leesrechten voor deze pagina.</p></div><div className="icon-badge"><ShieldAlert size={24} /></div></div></section></div></div>
  );

  return (
    <div className="page-shell">
      <div className="container deals-page mailchimp-page">
        <header className="brand-hero card">
          <div><div className="brand-mark">Admin</div><h1>Mailchimp</h1><p>Controleer welke Smart Trade-contacten en tags naar Mailchimp gaan voordat je synchroniseert.</p></div>
          <div className="brand-actions"><StatusPill tone={canWrite ? "success" : "warning"}>{canWrite ? "Schrijven" : "Lezen"}</StatusPill></div>
        </header>

        {preview?.apiKeyExpiryDays !== null && preview?.apiKeyExpiryDays !== undefined && preview.apiKeyExpiryDays <= 60 ? (
          <div className={`mailchimp-alert ${preview.apiKeyExpiryDays < 0 ? "danger" : "warning"}`}>
            <AlertTriangle size={20} />
            <span>De Mailchimp API-key {preview.apiKeyExpiryDays < 0 ? "is verlopen" : "verloopt binnenkort"}: {preview.apiKeyExpiresAt}.</span>
          </div>
        ) : null}

        {preview?.source.contactPersonErrorCount ? (
          <div className="mailchimp-alert warning">
            <AlertTriangle size={20} />
            <span>Bij {preview.source.contactPersonErrorCount} relaties konden de contactpersonen niet worden opgehaald. Synchroniseer pas nadat dit opnieuw is gecontroleerd.</span>
          </div>
        ) : null}

        {preview?.source.invalidEmailCount ? (
          <div className="mailchimp-alert warning">
            <AlertTriangle size={20} />
            <span>{preview.source.invalidEmailCount} ongeldige e-mailadressen worden overgeslagen.</span>
          </div>
        ) : null}

        {preview?.counts.removeTags ? (
          <div className="mailchimp-alert warning">
            <Tags size={20} />
            <span>Bij {preview.counts.removeTags} contacten die niet meer in de Smart Trade-selectie staan, worden alleen de door deze koppeling beheerde tags verwijderd.</span>
          </div>
        ) : null}

        <section className="deals-stat-grid mailchimp-stat-grid">
          <article className="deals-stat"><div className="stat-icon"><Users size={18} /></div><div><span>Contacten</span><strong>{preview?.counts.total ?? "-"}</strong></div></article>
          <article className="deals-stat"><div className="stat-icon"><MailCheck size={18} /></div><div><span>Nieuw</span><strong>{preview?.counts.new ?? "-"}</strong></div></article>
          <article className="deals-stat"><div className="stat-icon"><RefreshCw size={18} /></div><div><span>Bijwerken</span><strong>{preview?.counts.update ?? "-"}</strong></div></article>
          <article className="deals-stat"><div className="stat-icon"><ShieldAlert size={18} /></div><div><span>Niet herinschrijven</span><strong>{preview?.counts.blocked ?? "-"}</strong></div></article>
        </section>

        <section className="card panel mailchimp-control-panel">
          <div className="top-row">
            <div><div className="eyebrow">Koppeling</div><h2>Synchronisatie voorbereiden</h2><p className="subtext">Laatste synchronisatie: {localDate(preview?.lastSyncAt ?? null)}</p>{refreshStatus?.sourceUpdatedAt ? <p className="subtext">Smart Trade gecontroleerd: {localDate(refreshStatus.sourceUpdatedAt)}</p> : null}</div>
            <div className="mailchimp-actions">
              <button type="button" className="secondary-button" onClick={() => void loadPreview(true)} disabled={loading || syncing}><RefreshCw size={16} />{loading ? "Laden..." : "Voorbeeld vernieuwen"}</button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void synchronize()}
                disabled={
                  !canWrite
                  || loading
                  || syncing
                  || !preview?.configured
                  || !preview.audienceSelected
                  || preview.source.contactPersonErrorCount > 0
                }
              >
                <MailCheck size={17} />
                {syncing ? "Synchroniseren..." : "Synchroniseren met Mailchimp"}
              </button>
            </div>
          </div>

          <div className="mailchimp-settings-grid">
            <label className="input-wrap"><span className="input-label">Mailchimp-publiek</span><select className="input" value={selectedAudienceId} onChange={(event) => void selectAudience(event.target.value)} disabled={loading || syncing || !canWrite}><option value="">Selecteer een publiek</option>{preview?.audiences.map((audience) => <option value={audience.id} key={audience.id}>{audience.name} ({audience.memberCount})</option>)}</select></label>
            <div className="mailchimp-connection-status">
              {!preview ? (
                <span className="warning"><RefreshCw size={18} />API-key controleren</span>
              ) : (
                <span className={preview.configured ? "success" : "danger"}>{preview.configured ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}{preview.configured ? "API-key ingesteld" : "API-key ontbreekt"}</span>
              )}
              <span className={preview?.audienceSelected ? "success" : "warning"}>{preview?.audienceSelected ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}{preview?.audienceSelected ? `Publiek: ${preview.audience?.name}` : "Publiek nog niet gekozen"}</span>
              {preview?.audienceSelected ? <span className={preview.companyFieldReady ? "success" : "warning"}>{preview.companyFieldReady ? <CheckCircle2 size={18} /> : <RefreshCw size={18} />}{preview.companyFieldReady ? "Bedrijfsveld gereed" : "Bedrijfsveld wordt bij synchronisatie aangemaakt"}</span> : null}
            </div>
          </div>
          {status ? <div className="save-status">{status}{loadingSeconds > 0 ? ` (${loadingSeconds} sec.)` : ""}</div> : null}
        </section>

        <section className="card panel">
          <div className="top-row"><div><div className="eyebrow">Vooroverzicht</div><h2>Contacten en tags</h2><p className="subtext">{preview?.source.relationCount ?? 0} relaties, {preview?.source.contactPersonCount ?? 0} geselecteerde contactpersonen en {preview?.source.tags.length ?? 0} tags.</p></div><StatusPill tone={preview?.source.conflictCount ? "warning" : "success"}>{preview?.source.conflictCount ?? 0} conflicten</StatusPill></div>
          <div className="mailchimp-filters">
            <label className="mailchimp-search"><Search size={17} /><input aria-label="Zoek contacten" placeholder="Zoek bedrijf, e-mail, relatie of tag" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <select className="input" aria-label="Filter op status" value={stateFilter} onChange={(event) => setStateFilter(event.target.value as StateFilter)}><option value="all">Alle statussen</option><option value="new">Nieuw</option><option value="update">Bijwerken</option><option value="unchanged">Ongewijzigd</option><option value="blocked">Niet herinschrijven</option><option value="conflict">Conflicten</option></select>
            <select className="input" aria-label="Filter op tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">Alle tags</option>{preview?.source.tags.map((tag) => <option value={tag} key={tag}>{tag}</option>)}</select>
          </div>

          <div className="price-table-wrap">
            <table className="price-table mailchimp-table">
              <thead><tr><th>Bedrijf</th><th>E-mailadres</th><th>Tags</th><th>Bron</th><th>Status</th></tr></thead>
              <tbody>
                {filteredContacts.map((contact) => (
                  <tr key={contact.email}>
                    <td><strong>{contact.company}</strong>{contact.conflict ? <span className="mailchimp-conflict"><AlertTriangle size={13} /> Meerdere bedrijven</span> : null}<small>Relatie {contact.relationIds.join(", ")}</small></td>
                    <td>{contact.email}</td>
                    <td><div className="mailchimp-tags">{contact.tags.map((tag) => <span key={tag}><Tags size={11} />{tag}</span>)}</div></td>
                    <td>{contact.sources.includes("relation") ? "Relatie" : ""}{contact.sources.length > 1 ? " + " : ""}{contact.sources.includes("contact") ? "Contactpersoon" : ""}</td>
                    <td><StatusPill tone={contact.state === "unchanged" ? "success" : "warning"}>{STATE_LABELS[contact.state]}</StatusPill>{contact.mailchimpStatus ? <small>Mailchimp: {contact.mailchimpStatus}</small> : null}</td>
                  </tr>
                ))}
                {!filteredContacts.length ? <tr><td colSpan={5} className="worldline-mcc-empty">Geen contacten gevonden.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
