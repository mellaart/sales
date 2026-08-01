"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  RefreshCw,
  Search,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { StatCard, StatusPill } from "@/components/ui";
import {
  IMPLEMENTATION_STATUSES,
  IMPLEMENTATION_STATUS_LABELS,
  type ImplementationRecord,
  type ImplementationStatus,
} from "@/lib/implementations";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { euro } from "@/lib/pricing";
import {
  ROLE_TAB_ACCESS,
  canAccessTab,
  canWriteTab,
  normalizeRoleTabAccess,
  type RoleTabAccessMap,
} from "@/lib/role-tabs";
import { getSupabaseClient, type ProfileRecord } from "@/lib/supabase";

type StatusFilter = "all" | ImplementationStatus;
type ConsultantFilter = "all" | "unassigned" | string;

const dateFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDate(value: string | null | undefined) {
  if (!value) return "Geen datum";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Geen datum" : dateFormatter.format(date);
}

function getStatusTone(status: ImplementationStatus): "success" | "warning" | "neutral" {
  if (status === "completed") return "success";
  if (status === "new" || status === "waiting_customer") return "warning";
  return "neutral";
}

export default function ImplementationDashboard() {
  const { user, role } = useAuth();
  const supabase = getSupabaseClient();
  const [roleTabAccess, setRoleTabAccess] = useState<RoleTabAccessMap>(ROLE_TAB_ACCESS);
  const [accessLoaded, setAccessLoaded] = useState(false);
  const [implementations, setImplementations] = useState<ImplementationRecord[]>([]);
  const [consultants, setConsultants] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [consultantFilter, setConsultantFilter] = useState<ConsultantFilter>("all");

  const canAssign = isProtectedAdminEmail(user?.email);
  const canView = canAssign || canAccessTab(role, "implementation", roleTabAccess);
  const canEdit = canAssign || canWriteTab(role, "implementation", roleTabAccess);
  const seesAllImplementations = role === "manager" || role === "admin";

  const loadRoleAccess = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/role-tabs", { cache: "no-store" });
      const json = await response.json().catch(() => ({})) as { roleTabAccess?: unknown };
      if (response.ok) setRoleTabAccess(normalizeRoleTabAccess(json.roleTabAccess));
    } finally {
      setAccessLoaded(true);
    }
  }, []);

  const loadImplementations = useCallback(async () => {
    if (!user || !supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("implementations")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      setMessage(`Implementaties laden mislukt: ${error.message}`);
      setLoading(false);
      return;
    }

    setImplementations((data ?? []) as ImplementationRecord[]);

    if (canAssign) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id,email,full_name,role")
        .order("full_name", { ascending: true });

      if (profileError) {
        setMessage(`Consultants laden mislukt: ${profileError.message}`);
      } else {
        setConsultants(
          ((profileData ?? []) as ProfileRecord[]).filter((profile) => profile.role === "consultant"),
        );
      }
    }

    setLoading(false);
  }, [canAssign, supabase, user]);

  useEffect(() => {
    void loadRoleAccess();
  }, [loadRoleAccess]);

  useEffect(() => {
    if (!accessLoaded || !canView) {
      if (accessLoaded) setLoading(false);
      return;
    }
    void loadImplementations();
  }, [accessLoaded, canView, loadImplementations]);

  const filteredImplementations = useMemo(() => {
    const search = query.trim().toLowerCase();

    return implementations.filter((implementation) => {
      if (statusFilter !== "all" && implementation.status !== statusFilter) return false;
      if (consultantFilter === "unassigned" && implementation.assigned_consultant_id) return false;
      if (
        consultantFilter !== "all" &&
        consultantFilter !== "unassigned" &&
        implementation.assigned_consultant_id !== consultantFilter
      ) return false;

      if (!search) return true;
      return [
        implementation.customer_name,
        implementation.contact_name,
        implementation.quote_title,
        implementation.package_name,
        implementation.sales_name,
        implementation.assigned_consultant_name,
        implementation.assigned_consultant_email,
        implementation.notes,
      ].some((value) => String(value ?? "").toLowerCase().includes(search));
    });
  }, [consultantFilter, implementations, query, statusFilter]);

  const stats = useMemo(() => ({
    total: implementations.length,
    unassigned: implementations.filter((implementation) => !implementation.assigned_consultant_id).length,
    active: implementations.filter((implementation) => implementation.status !== "completed").length,
    completed: implementations.filter((implementation) => implementation.status === "completed").length,
  }), [implementations]);

  const consultantFilterOptions = useMemo(() => {
    const options = new Map<string, string>();

    consultants.forEach((consultant) => {
      options.set(consultant.id, consultant.full_name || consultant.email || "Consultant");
    });
    implementations.forEach((implementation) => {
      if (implementation.assigned_consultant_id) {
        options.set(
          implementation.assigned_consultant_id,
          implementation.assigned_consultant_name || implementation.assigned_consultant_email || "Consultant",
        );
      }
    });

    return [...options.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "nl"));
  }, [consultants, implementations]);

  function updateLocalRecord(implementationId: string, patch: Partial<ImplementationRecord>) {
    setImplementations((current) => current.map((implementation) => (
      implementation.id === implementationId ? { ...implementation, ...patch } : implementation
    )));
  }

  async function saveImplementation(
    implementation: ImplementationRecord,
    patch: Partial<ImplementationRecord>,
    successMessage: string,
  ) {
    if (!supabase) return;

    setSavingId(implementation.id);
    setMessage("Implementatie wordt opgeslagen...");

    const { data, error } = await supabase
      .from("implementations")
      .update(patch as never)
      .eq("id", implementation.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Opslaan mislukt: ${error.message}`);
    } else {
      updateLocalRecord(implementation.id, data as ImplementationRecord);
      setMessage(successMessage);
    }

    setSavingId(null);
  }

  async function assignConsultant(implementation: ImplementationRecord, consultantId: string) {
    if (!canAssign) return;

    const consultant = consultants.find((profile) => profile.id === consultantId) ?? null;
    const nextStatus = consultant && implementation.status === "new"
      ? "assigned"
      : !consultant && implementation.status === "assigned"
        ? "new"
        : implementation.status;

    await saveImplementation(implementation, {
      assigned_consultant_id: consultant?.id ?? null,
      assigned_consultant_name: consultant?.full_name || consultant?.email || null,
      assigned_consultant_email: consultant?.email ?? null,
      assigned_by: user?.id ?? null,
      assigned_at: consultant ? new Date().toISOString() : null,
      status: nextStatus,
    }, consultant ? `Implementatie toegewezen aan ${consultant.full_name || consultant.email}.` : "Toewijzing verwijderd.");
  }

  if (!accessLoaded || loading) {
    return (
      <div className="page-shell">
        <div className="container">
          <div className="save-status">Implementaties worden geladen...</div>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="eyebrow">Geen toegang</div>
            <h1>Implementatie</h1>
            <p className="subtext">Je rol heeft geen toegang tot deze pagina.</p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="container">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Smart Trade Sales</div>
            <h1>Implementatie</h1>
            <p>
              {seesAllImplementations
                ? "Overzicht van alle nieuwe klantimplementaties."
                : role === "consultant"
                  ? "Je ziet uitsluitend implementaties die aan jou zijn toegewezen."
                  : "Volg de implementaties die vanuit jouw gewonnen calculator-deals zijn gestart."}
            </p>
          </div>
          <div className="brand-actions">
            <button type="button" className="secondary-button" onClick={() => void loadImplementations()}>
              <RefreshCw size={16} /> Vernieuwen
            </button>
            <StatusPill tone={canEdit ? "success" : "neutral"}>{canEdit ? "Schrijven" : "Lezen"}</StatusPill>
          </div>
        </header>

        <section className="kpi-grid">
          <StatCard title="Implementaties" value={String(stats.total)} icon={ClipboardCheck} sublabel="In jouw overzicht" />
          <StatCard title="Niet toegewezen" value={String(stats.unassigned)} icon={Users} sublabel="Wacht op consultant" />
          <StatCard title="Actief" value={String(stats.active)} icon={UserRoundCheck} sublabel="Nog niet afgerond" />
          <StatCard title="Afgerond" value={String(stats.completed)} icon={CheckCircle2} sublabel="Voltooid" />
        </section>

        <section className="card panel implementation-filters">
          <div>
            <div className="eyebrow">Zoeken en filteren</div>
            <h2 className="headline">Implementaties vinden</h2>
          </div>
          <div className="implementation-filter-grid">
            <label className="input-wrap">
              <span className="input-label">Zoeken</span>
              <span className="search-box implementation-search-box">
                <Search size={16} />
                <input
                  className="search-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Klant, contact, pakket of consultant"
                />
              </span>
            </label>
            <label className="input-wrap">
              <span className="input-label">Status</span>
              <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="all">Alle statussen</option>
                {IMPLEMENTATION_STATUSES.map((status) => (
                  <option key={status} value={status}>{IMPLEMENTATION_STATUS_LABELS[status]}</option>
                ))}
              </select>
            </label>
            {seesAllImplementations ? (
              <label className="input-wrap">
                <span className="input-label">Consultant</span>
                <select className="input" value={consultantFilter} onChange={(event) => setConsultantFilter(event.target.value)}>
                  <option value="all">Alle consultants</option>
                  <option value="unassigned">Niet toegewezen</option>
                  {consultantFilterOptions.map((consultant) => (
                    <option key={consultant.id} value={consultant.id}>{consultant.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Resultaten</div>
              <h2 className="headline">{filteredImplementations.length} implementaties</h2>
            </div>
          </div>

          {message ? <div className="save-status">{message}</div> : null}

          <div className="implementation-list">
            {filteredImplementations.map((implementation) => (
              <article key={implementation.id} className="implementation-row">
                <div className="implementation-row-header">
                  <div>
                    <div className="implementation-title-line">
                      <h3>{implementation.customer_name}</h3>
                      <StatusPill tone={getStatusTone(implementation.status)}>
                        {IMPLEMENTATION_STATUS_LABELS[implementation.status]}
                      </StatusPill>
                    </div>
                    <p>{implementation.quote_title || "Nieuwe Smart Trade-klant"}</p>
                  </div>
                  <Link href={`/deals/${implementation.deal_id}`} className="secondary-button">
                    <ExternalLink size={16} /> Open deal
                  </Link>
                </div>

                <div className="implementation-meta-grid">
                  <span>Contact<strong>{implementation.contact_name || "-"}</strong></span>
                  <span>Pakket<strong>{implementation.package_name || "-"}</strong></span>
                  <span>Implementatie<strong>{euro.format(Number(implementation.implementation_total || 0))}</strong></span>
                  <span>Sales<strong>{implementation.sales_name || "-"}</strong></span>
                  <span>Aangemaakt<strong>{formatDate(implementation.created_at)}</strong></span>
                  <span>Consultant<strong>{implementation.assigned_consultant_name || "Nog niet toegewezen"}</strong></span>
                </div>

                <div className="implementation-controls">
                  {canAssign ? (
                    <label className="input-wrap">
                      <span className="input-label">Toewijzen aan consultant</span>
                      <select
                        className="input"
                        value={implementation.assigned_consultant_id ?? ""}
                        disabled={savingId === implementation.id}
                        onChange={(event) => void assignConsultant(implementation, event.target.value)}
                      >
                        <option value="">Nog niet toegewezen</option>
                        {consultants.map((consultant) => (
                          <option key={consultant.id} value={consultant.id}>{consultant.full_name || consultant.email}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <label className="input-wrap">
                    <span className="input-label">Status</span>
                    <select
                      className="input"
                      value={implementation.status}
                      disabled={!canEdit || savingId === implementation.id}
                      onChange={(event) => void saveImplementation(
                        implementation,
                        { status: event.target.value as ImplementationStatus },
                        "Status bijgewerkt.",
                      )}
                    >
                      {IMPLEMENTATION_STATUSES.map((status) => (
                        <option key={status} value={status}>{IMPLEMENTATION_STATUS_LABELS[status]}</option>
                      ))}
                    </select>
                  </label>

                  <label className="input-wrap implementation-notes">
                    <span className="input-label">Interne notities</span>
                    <textarea
                      className="textarea"
                      value={implementation.notes ?? ""}
                      disabled={!canEdit || savingId === implementation.id}
                      placeholder="Planning, afspraken of aandachtspunten"
                      onChange={(event) => updateLocalRecord(implementation.id, { notes: event.target.value })}
                      onBlur={(event) => void saveImplementation(
                        implementation,
                        { notes: event.currentTarget.value },
                        "Notities opgeslagen.",
                      )}
                    />
                  </label>
                </div>
              </article>
            ))}

            {filteredImplementations.length === 0 ? (
              <div className="save-status">Geen implementaties gevonden.</div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
