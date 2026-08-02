"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  ExternalLink,
  Package,
  Save,
  UserRoundCheck,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import ImplementationNotesField from "@/components/implementation-notes-field";
import { StatCard, StatusPill } from "@/components/ui";
import {
  customerIntakeStatusLabel,
  type CustomerIntakeStatus,
} from "@/lib/customer-intake";
import {
  IMPLEMENTATION_PROGRESS_ITEMS,
  IMPLEMENTATION_STATUSES,
  IMPLEMENTATION_STATUS_LABELS,
  normalizeImplementationProgress,
  type ImplementationRecord,
  type ImplementationProgressKey,
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

type CustomerIntakeProgress = {
  status: CustomerIntakeStatus;
  expiresAt: string;
};

function getCustomerIntakePresentation(
  loaded: boolean,
  loadFailed: boolean,
  intake: CustomerIntakeProgress | null,
): { label: string; tone: "success" | "warning" | "danger" } {
  if (!loaded) return { label: "Laden...", tone: "warning" };
  if (loadFailed) return { label: "Niet beschikbaar", tone: "danger" };
  if (!intake) return { label: "Niet aangemaakt", tone: "warning" };

  const label = customerIntakeStatusLabel(intake.status, intake.expiresAt);
  if (label === "Ontvangen" || label === "Verwerkt") return { label, tone: "success" };
  if (label === "Verlopen" || label === "Ingetrokken") return { label, tone: "danger" };
  return { label, tone: "warning" };
}

export default function ImplementationEditor({ implementationId }: { implementationId: string }) {
  const { user, role } = useAuth();
  const supabase = getSupabaseClient();
  const [roleTabAccess, setRoleTabAccess] = useState<RoleTabAccessMap>(ROLE_TAB_ACCESS);
  const [accessLoaded, setAccessLoaded] = useState(false);
  const [implementation, setImplementation] = useState<ImplementationRecord | null>(null);
  const [consultants, setConsultants] = useState<ProfileRecord[]>([]);
  const [customerIntake, setCustomerIntake] = useState<CustomerIntakeProgress | null>(null);
  const [customerIntakeLoaded, setCustomerIntakeLoaded] = useState(false);
  const [customerIntakeLoadFailed, setCustomerIntakeLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const canAssign = isProtectedAdminEmail(user?.email);
  const canView = canAssign || canAccessTab(role, "implementation", roleTabAccess);
  const canEdit = canAssign || canWriteTab(role, "implementation", roleTabAccess);

  const loadRoleAccess = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/role-tabs", { cache: "no-store" });
      const json = await response.json().catch(() => ({})) as { roleTabAccess?: unknown };
      if (response.ok) setRoleTabAccess(normalizeRoleTabAccess(json.roleTabAccess));
    } finally {
      setAccessLoaded(true);
    }
  }, []);

  const loadImplementation = useCallback(async () => {
    if (!user || !supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");
    setCustomerIntakeLoaded(false);
    setCustomerIntakeLoadFailed(false);

    const { data, error } = await supabase
      .from("implementations")
      .select("*")
      .eq("id", implementationId)
      .maybeSingle();

    if (error) {
      setMessage(`Implementatie laden mislukt: ${error.message}`);
    } else {
      setImplementation((data as ImplementationRecord | null) ?? null);
    }

    try {
      if (data) {
        const intakeResponse = await fetch(
          `/api/implementations/${encodeURIComponent(implementationId)}/customer-intake`,
          { cache: "no-store" },
        );
        const intakeJson = await intakeResponse.json().catch(() => ({})) as {
          intake?: CustomerIntakeProgress | null;
        };
        setCustomerIntake(intakeResponse.ok ? intakeJson.intake ?? null : null);
        setCustomerIntakeLoadFailed(!intakeResponse.ok);
      } else {
        setCustomerIntake(null);
      }
    } catch {
      setCustomerIntake(null);
      setCustomerIntakeLoadFailed(true);
    } finally {
      setCustomerIntakeLoaded(true);
    }

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
  }, [canAssign, implementationId, supabase, user]);

  useEffect(() => {
    void loadRoleAccess();
  }, [loadRoleAccess]);

  useEffect(() => {
    if (!accessLoaded || !canView) {
      if (accessLoaded) setLoading(false);
      return;
    }
    void loadImplementation();
  }, [accessLoaded, canView, loadImplementation]);

  async function saveImplementation(
    patch: Partial<ImplementationRecord>,
    successMessage: string,
    optimistic = false,
  ) {
    if (!implementation || !supabase || saving) return;

    const previousImplementation = implementation;
    if (optimistic) setImplementation({ ...implementation, ...patch });
    setSaving(true);
    setMessage("Implementatie wordt opgeslagen...");

    const { data, error } = await supabase
      .from("implementations")
      .update(patch as never)
      .eq("id", implementation.id)
      .select("*")
      .single();

    if (error) {
      if (optimistic) setImplementation(previousImplementation);
      setMessage(`Opslaan mislukt: ${error.message}`);
    } else {
      setImplementation(data as ImplementationRecord);
      setMessage(successMessage);
    }

    setSaving(false);
  }

  function updateProgress(key: ImplementationProgressKey, checked: boolean) {
    if (!implementation || !canEdit || saving) return;

    const progress = {
      ...normalizeImplementationProgress(implementation.progress),
      [key]: checked,
    };
    void saveImplementation({ progress }, `${IMPLEMENTATION_PROGRESS_ITEMS.find((item) => item.key === key)?.label ?? "Stap"} bijgewerkt.`, true);
  }

  async function assignConsultant(consultantId: string) {
    if (!implementation || !canAssign) return;

    const consultant = consultants.find((profile) => profile.id === consultantId) ?? null;
    const nextStatus = consultant && implementation.status === "new"
      ? "assigned"
      : !consultant && implementation.status === "assigned"
        ? "new"
        : implementation.status;

    await saveImplementation({
      assigned_consultant_id: consultant?.id ?? null,
      assigned_consultant_name: consultant?.full_name || consultant?.email || null,
      assigned_consultant_email: consultant?.email ?? null,
      assigned_by: user?.id ?? null,
      assigned_at: consultant ? new Date().toISOString() : null,
      status: nextStatus,
    }, consultant
      ? `Implementatie toegewezen aan ${consultant.full_name || consultant.email}.`
      : "Toewijzing verwijderd.");
  }

  if (!accessLoaded || loading) {
    return (
      <div className="page-shell">
        <div className="container">
          <div className="save-status">Implementatie wordt geladen...</div>
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

  if (!implementation) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="eyebrow">Niet gevonden</div>
            <h1>Implementatie niet beschikbaar</h1>
            <p className="subtext">Dit dossier bestaat niet of is niet aan jou toegewezen.</p>
            <Link href="/implementatie" className="secondary-button">
              <ArrowLeft size={16} /> Terug naar implementaties
            </Link>
          </section>
        </div>
      </div>
    );
  }

  const progress = normalizeImplementationProgress(implementation.progress);
  const intakePresentation = getCustomerIntakePresentation(
    customerIntakeLoaded,
    customerIntakeLoadFailed,
    customerIntake,
  );
  const progressRows = [
    ...IMPLEMENTATION_PROGRESS_ITEMS.map((item) => ({ kind: "check" as const, ...item })),
    { kind: "intake" as const, number: 2, key: "customerIntake", label: "Klantgegevensformulier" },
  ].sort((left, right) => left.number - right.number);

  return (
    <div className="page-shell">
      <div className="container">
        <header className="brand-hero card implementation-detail-hero">
          <div>
            <div className="brand-mark">Implementatiedossier</div>
            <h1>{implementation.customer_name}</h1>
            <p>{implementation.quote_title || "Nieuwe Smart Trade-klant"}</p>
          </div>
          <div className="brand-actions">
            <Link href="/implementatie" className="secondary-button">
              <ArrowLeft size={16} /> Terug naar overzicht
            </Link>
            <Link href={`/deals/${implementation.deal_id}`} className="secondary-button">
              <ExternalLink size={16} /> Open deal
            </Link>
            <StatusPill tone={getStatusTone(implementation.status)}>
              {IMPLEMENTATION_STATUS_LABELS[implementation.status]}
            </StatusPill>
          </div>
        </header>

        <section className="kpi-grid">
          <StatCard title="Pakket" value={implementation.package_name || "-"} icon={Package} sublabel="Gekozen pakket" />
          <StatCard
            title="Implementatie"
            value={euro.format(Number(implementation.implementation_total || 0))}
            icon={CircleDollarSign}
            sublabel="Bedrag uit de deal"
          />
          <StatCard
            title="Consultant"
            value={implementation.assigned_consultant_name || "Niet toegewezen"}
            icon={UserRoundCheck}
            sublabel={implementation.assigned_consultant_email || "Nog te plannen"}
          />
          <StatCard title="Aangemaakt" value={formatDate(implementation.created_at)} icon={CalendarDays} sublabel="Start van het dossier" />
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Klant en offerte</div>
              <h2 className="headline">Dossiergegevens</h2>
            </div>
            <ClipboardCheck size={28} aria-hidden="true" />
          </div>
          <div className="implementation-meta-grid implementation-detail-meta">
            <span>Klant<strong>{implementation.customer_name}</strong></span>
            <span>Contactpersoon<strong>{implementation.contact_name || "-"}</strong></span>
            <span>Offerte<strong>{implementation.quote_title || "-"}</strong></span>
            <span>Sales<strong>{implementation.sales_name || "-"}</strong></span>
            <span>Status<strong>{IMPLEMENTATION_STATUS_LABELS[implementation.status]}</strong></span>
            <span>Laatst gewijzigd<strong>{formatDate(implementation.updated_at)}</strong></span>
          </div>
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Planning en voortgang</div>
              <h2 className="headline">Implementatie beheren</h2>
            </div>
            <StatusPill tone={canEdit ? "success" : "neutral"}>{canEdit ? "Schrijven" : "Lezen"}</StatusPill>
          </div>

          <div className="implementation-controls implementation-detail-controls">
            {canAssign ? (
              <label className="input-wrap">
                <span className="input-label">Toewijzen aan consultant</span>
                <select
                  className="input"
                  value={implementation.assigned_consultant_id ?? ""}
                  disabled={saving}
                  onChange={(event) => void assignConsultant(event.target.value)}
                >
                  <option value="">Nog niet toegewezen</option>
                  {consultants.map((consultant) => (
                    <option key={consultant.id} value={consultant.id}>{consultant.full_name || consultant.email}</option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="implementation-readonly-field">
                <span>Toegewezen consultant</span>
                <strong>{implementation.assigned_consultant_name || "Nog niet toegewezen"}</strong>
              </div>
            )}

            <label className="input-wrap">
              <span className="input-label">Status</span>
              <select
                className="input"
                value={implementation.status}
                disabled={!canEdit || saving}
                onChange={(event) => void saveImplementation(
                  { status: event.target.value as ImplementationStatus },
                  "Status bijgewerkt.",
                )}
              >
                {IMPLEMENTATION_STATUSES.map((status) => (
                  <option key={status} value={status}>{IMPLEMENTATION_STATUS_LABELS[status]}</option>
                ))}
              </select>
            </label>

            <ImplementationNotesField
              label="Interne notities"
              value={implementation.notes ?? ""}
              disabled={!canEdit || saving}
              placeholder="Planning, afspraken of aandachtspunten"
              onChange={(value) => setImplementation({ ...implementation, notes: value })}
              onBlur={(value) => void saveImplementation(
                  { notes: value },
                  "Notities opgeslagen.",
                )}
            />
          </div>

          <div className="implementation-progress-block">
            <div className="implementation-progress-heading">
              <div>
                <span>Werkzaamheden</span>
                <strong>Voortgang implementatie</strong>
              </div>
              <span>Automatisch opgeslagen</span>
            </div>
            <div className="implementation-progress-list">
              {progressRows.map((item) => (
                item.kind === "intake" ? (
                  <div key={item.key} className="implementation-progress-row">
                    <span className="implementation-progress-number">{item.number}</span>
                    <strong>{item.label}</strong>
                    <StatusPill tone={intakePresentation.tone}>{intakePresentation.label}</StatusPill>
                  </div>
                ) : (
                  <label
                    key={item.key}
                    className={`implementation-progress-row implementation-progress-check ${progress[item.key] ? "completed" : ""}`}
                  >
                    <span className="implementation-progress-number">{item.number}</span>
                    <strong>{item.label}</strong>
                    <input
                      type="checkbox"
                      checked={Boolean(progress[item.key])}
                      disabled={!canEdit || saving}
                      aria-label={`${item.label} afgerond`}
                      onChange={(event) => updateProgress(item.key, event.target.checked)}
                    />
                  </label>
                )
              ))}
            </div>
          </div>

          <div className="implementation-save-row">
            {message ? <div className="save-status">{message}</div> : <span />}
            {canEdit ? (
              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={() => void saveImplementation(
                  { notes: implementation.notes ?? "" },
                  "Implementatie opgeslagen.",
                )}
              >
                <Save size={16} /> {saving ? "Opslaan..." : "Opslaan"}
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
