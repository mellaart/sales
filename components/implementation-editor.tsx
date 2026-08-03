"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Database,
  ExternalLink,
  FileText,
  Globe2,
  LoaderCircle,
  Mail,
  Package,
  RefreshCw,
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

const dateTimeFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const FINANCIAL_PACKAGE_OPTIONS = [
  "Exact Online",
  "Snelstart",
  "Twinfield",
  "King",
  "Overig",
];

function formatDate(value: string | null | undefined) {
  if (!value) return "Geen datum";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Geen datum" : dateFormatter.format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateTimeFormatter.format(date);
}

function getStatusTone(status: ImplementationStatus): "success" | "warning" | "neutral" {
  if (status === "completed") return "success";
  if (status === "new" || status === "waiting_customer") return "warning";
  return "neutral";
}

type CustomerIntakeProgress = {
  status: CustomerIntakeStatus;
  expiresAt: string;
  submittedAt: string | null;
  recipientEmail: string;
  formData: {
    website: string;
    contactFirstName: string;
    contactEmail: string;
  };
};

type ImplementationDetailField =
  | "administration_name"
  | "planned_go_live_date"
  | "financial_package"
  | "website_webshop";

type DnsCheckStatus = "pass" | "fail" | "error";

type DnsCheckItem = {
  status: DnsCheckStatus;
  message: string;
};

type ImplementationDnsCheck = {
  domain: string;
  checkedAt: string;
  checks: {
    spfSmartsoft: DnsCheckItem;
    spfTroublefree: DnsCheckItem;
    dkimSmartsoft: DnsCheckItem;
    dkimTroublefree: DnsCheckItem;
  };
};

function DnsCheckRow({
  label,
  value,
  result,
  loading,
}: {
  label?: string;
  value: string;
  result?: DnsCheckItem;
  loading: boolean;
}) {
  const status = loading ? "loading" : result?.status ?? "pending";

  return (
    <div className={`implementation-dns-row ${status}`}>
      <span className="implementation-dns-status" aria-hidden="true">
        {status === "loading" ? <LoaderCircle className="implementation-dns-spinner" size={17} /> : null}
        {status === "pass" ? <CheckCircle2 size={17} /> : null}
        {status === "fail" || status === "error" ? <AlertTriangle size={17} /> : null}
      </span>
      <div>
        {label ? <span>{label}</span> : null}
        <strong>{value}</strong>
        {!loading && result?.message ? <small>{result.message}</small> : null}
      </div>
    </div>
  );
}

function getWebsiteDomain(website: string) {
  const value = website.trim();
  if (!value) return "";

  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return value
      .replace(/^[a-z][a-z\d+.-]*:\/\//i, "")
      .split("/")[0]
      .split(":")[0]
      .toLowerCase()
      .replace(/^www\./, "");
  }
}

function showOutlookPopupStatus(
  outlookWindow: Window | null,
  title: string,
  description: string,
  tone: "loading" | "error" = "loading",
) {
  if (!outlookWindow || outlookWindow.closed) return;

  try {
    const popupDocument = outlookWindow.document;
    popupDocument.title = title;
    popupDocument.documentElement.lang = "nl";
    popupDocument.body.replaceChildren();
    Object.assign(popupDocument.body.style, {
      margin: "0",
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      padding: "24px",
      boxSizing: "border-box",
      background: "#0b1425",
      color: "#eef4ff",
      fontFamily: "Calibri, Arial, sans-serif",
    });

    const panel = popupDocument.createElement("main");
    Object.assign(panel.style, {
      width: "min(100%, 520px)",
      padding: "28px",
      border: `1px solid ${tone === "error" ? "#7f3540" : "#274a7f"}`,
      borderRadius: "8px",
      background: "#131f34",
      boxSizing: "border-box",
    });

    const heading = popupDocument.createElement("h1");
    heading.textContent = title;
    Object.assign(heading.style, { margin: "0 0 12px", fontSize: "24px", lineHeight: "1.2" });

    const message = popupDocument.createElement("p");
    message.textContent = description;
    Object.assign(message.style, {
      margin: "0",
      color: tone === "error" ? "#fecaca" : "#b9c8df",
      fontSize: "16px",
      lineHeight: "1.5",
    });

    panel.append(heading, message);
    popupDocument.body.append(panel);
  } catch {
    // Het tabblad kan al naar Microsoft zijn genavigeerd.
  }
}

function navigateOutlookPopup(outlookWindow: Window | null, url: string) {
  if (!outlookWindow || outlookWindow.closed) return false;

  try {
    outlookWindow.location.replace(url);
    return true;
  } catch {
    return false;
  }
}

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
  const [assignableUsers, setAssignableUsers] = useState<ProfileRecord[]>([]);
  const [customerIntake, setCustomerIntake] = useState<CustomerIntakeProgress | null>(null);
  const [customerIntakeLoaded, setCustomerIntakeLoaded] = useState(false);
  const [customerIntakeLoadFailed, setCustomerIntakeLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dnsOutlookBusy, setDnsOutlookBusy] = useState(false);
  const [newCustomerOutlookBusy, setNewCustomerOutlookBusy] = useState(false);
  const [dnsCheck, setDnsCheck] = useState<ImplementationDnsCheck | null>(null);
  const [dnsCheckLoading, setDnsCheckLoading] = useState(false);
  const [dnsCheckError, setDnsCheckError] = useState("");
  const [detailSaveState, setDetailSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [detailSaveMessage, setDetailSaveMessage] = useState("Automatisch opgeslagen");
  const detailSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingDetailSavesRef = useRef(0);
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
        setMessage(`Gebruikers laden mislukt: ${profileError.message}`);
      } else {
        setAssignableUsers((profileData ?? []) as ProfileRecord[]);
      }
    }

    setLoading(false);
  }, [canAssign, implementationId, supabase, user]);

  const loadDnsCheck = useCallback(async () => {
    if (!customerIntake?.submittedAt || !customerIntake.formData.website) {
      setDnsCheck(null);
      setDnsCheckError("");
      return;
    }

    setDnsCheckLoading(true);
    setDnsCheckError("");

    try {
      const response = await fetch(
        `/api/implementations/${encodeURIComponent(implementationId)}/dns-check`,
        { cache: "no-store" },
      );
      const json = await response.json().catch(() => ({})) as ImplementationDnsCheck & { error?: string };
      if (!response.ok) throw new Error(json.error || "DNS-controle mislukt.");
      setDnsCheck(json);
    } catch (error) {
      setDnsCheck(null);
      setDnsCheckError(error instanceof Error ? error.message : "DNS-controle mislukt.");
    } finally {
      setDnsCheckLoading(false);
    }
  }, [customerIntake, implementationId]);

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

  useEffect(() => {
    if (!customerIntakeLoaded) return;
    void loadDnsCheck();
  }, [customerIntakeLoaded, loadDnsCheck]);

  useEffect(() => {
    if (loading || typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("outlook") !== "connected") return;

    setMessage("Outlook is verbonden. Klik nogmaals op 'Klaarzetten in Outlook'.");
    url.searchParams.delete("outlook");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [loading]);

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

    const assignedUser = assignableUsers.find((profile) => profile.id === consultantId) ?? null;
    const nextStatus = assignedUser && implementation.status === "new"
      ? "assigned"
      : !assignedUser && implementation.status === "assigned"
        ? "new"
        : implementation.status;

    await saveImplementation({
      assigned_consultant_id: assignedUser?.id ?? null,
      assigned_consultant_name: assignedUser?.full_name || assignedUser?.email || null,
      assigned_consultant_email: assignedUser?.email ?? null,
      assigned_by: user?.id ?? null,
      assigned_at: assignedUser ? new Date().toISOString() : null,
      status: nextStatus,
    }, assignedUser
      ? `Implementatie toegewezen aan ${assignedUser.full_name || assignedUser.email}.`
      : "Toewijzing verwijderd.");
  }

  function saveImplementationDetail(
    field: ImplementationDetailField,
    rawValue: string,
    label: string,
  ) {
    if (!implementation || !supabase || !canEdit) return;

    const value = field === "planned_go_live_date"
      ? rawValue || null
      : rawValue.trim() || null;
    const implementationIdToSave = implementation.id;

    setImplementation((current) => current ? { ...current, [field]: value } : current);
    pendingDetailSavesRef.current += 1;
    setDetailSaveState("saving");
    setDetailSaveMessage(`${label} wordt opgeslagen...`);

    const persist = async () => {
      try {
        const { data, error } = await supabase
          .from("implementations")
          .update({ [field]: value } as never)
          .eq("id", implementationIdToSave)
          .select("*")
          .single();

        if (error) throw new Error(error.message);
        const persistedValue = (data as ImplementationRecord | null)?.[field] ?? null;
        if (persistedValue !== value) {
          throw new Error("De database heeft de wijziging niet bevestigd.");
        }
        setImplementation((current) => current ? { ...current, [field]: persistedValue } : current);
        setDetailSaveState("saved");
        setDetailSaveMessage(`${label} opgeslagen`);
      } catch (error) {
        setDetailSaveState("error");
        setDetailSaveMessage(
          `${label} opslaan mislukt: ${error instanceof Error ? error.message : "onbekende fout"}`,
        );
      } finally {
        pendingDetailSavesRef.current -= 1;
        if (pendingDetailSavesRef.current > 0) {
          setDetailSaveState("saving");
          setDetailSaveMessage("Wijzigingen worden opgeslagen...");
        }
      }
    };

    detailSaveQueueRef.current = detailSaveQueueRef.current.then(persist, persist);
  }

  async function handleDnsOutlookDraft() {
    if (!implementation || !customerIntake?.submittedAt || dnsOutlookBusy) return;

    const recipientEmail = (
      customerIntake.recipientEmail || customerIntake.formData.contactEmail
    ).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(recipientEmail)) {
      setMessage("In het klantformulier ontbreekt een geldig e-mailadres.");
      return;
    }

    const domain = getWebsiteDomain(customerIntake.formData.website);
    if (!domain) {
      setMessage("In het klantformulier ontbreekt een geldige website.");
      return;
    }

    const outlookWindow = window.open("about:blank", "_blank");
    if (outlookWindow) outlookWindow.opener = null;
    showOutlookPopupStatus(
      outlookWindow,
      "DNS-instructies voorbereiden",
      "Het Outlook-concept met de SPF- en DKIM-instructies wordt gemaakt.",
    );
    setDnsOutlookBusy(true);
    setMessage("Outlook-verbinding wordt gecontroleerd...");

    const returnTo = `/implementatie/${encodeURIComponent(implementation.id)}`;

    try {
      const statusResponse = await fetch(
        `/api/outlook/status?returnTo=${encodeURIComponent(returnTo)}`,
        { cache: "no-store" },
      );
      const statusJson = await statusResponse.json().catch(() => ({})) as {
        connected?: boolean;
        connectUrl?: string;
        error?: string;
      };
      if (!statusResponse.ok) {
        throw new Error(statusJson.error || "Outlook-verbinding controleren mislukt.");
      }
      if (!statusJson.connected) {
        const connectUrl = statusJson.connectUrl || `/api/outlook/connect?returnTo=${encodeURIComponent(returnTo)}`;
        setMessage("Outlook wordt eenmalig verbonden...");
        if (!navigateOutlookPopup(outlookWindow, connectUrl)) window.location.assign(connectUrl);
        return;
      }

      setMessage("DNS-concept wordt gemaakt...");
      const response = await fetch(
        `/api/outlook/drafts?returnTo=${encodeURIComponent(returnTo)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template: "dns-instructions",
            recipientEmail,
            customerName: implementation.customer_name,
            contactName:
              customerIntake.formData.contactFirstName || implementation.contact_name || "",
            domain,
          }),
        },
      );
      const json = await response.json().catch(() => ({})) as {
        webLink?: string;
        reconnectRequired?: boolean;
        connectUrl?: string;
        error?: string;
      };

      if (json.reconnectRequired && json.connectUrl) {
        setMessage("Outlook moet opnieuw worden verbonden...");
        if (!navigateOutlookPopup(outlookWindow, json.connectUrl)) window.location.assign(json.connectUrl);
        return;
      }
      if (!response.ok || !json.webLink) {
        throw new Error(json.error || "DNS-concept maken mislukt.");
      }
      if (!navigateOutlookPopup(outlookWindow, json.webLink)) window.location.assign(json.webLink);
      setMessage(`DNS-concept voor ${domain} is aangemaakt.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "DNS-concept maken mislukt.";
      showOutlookPopupStatus(outlookWindow, "DNS-concept niet gemaakt", errorMessage, "error");
      setMessage(errorMessage);
    } finally {
      setDnsOutlookBusy(false);
    }
  }

  async function handleNewCustomerOutlookDraft() {
    if (!implementation || newCustomerOutlookBusy) return;

    const outlookWindow = window.open("about:blank", "_blank");
    if (outlookWindow) outlookWindow.opener = null;
    showOutlookPopupStatus(
      outlookWindow,
      "Nieuwe klantmail voorbereiden",
      "Het Outlook-concept met alle klant- en implementatiegegevens wordt gemaakt.",
    );
    setNewCustomerOutlookBusy(true);
    setMessage("Outlook-verbinding wordt gecontroleerd...");

    const returnTo = `/implementatie/${encodeURIComponent(implementation.id)}`;

    try {
      const statusResponse = await fetch(
        `/api/outlook/status?returnTo=${encodeURIComponent(returnTo)}`,
        { cache: "no-store" },
      );
      const statusJson = await statusResponse.json().catch(() => ({})) as {
        connected?: boolean;
        connectUrl?: string;
        error?: string;
      };
      if (!statusResponse.ok) {
        throw new Error(statusJson.error || "Outlook-verbinding controleren mislukt.");
      }
      if (!statusJson.connected) {
        const connectUrl = statusJson.connectUrl || `/api/outlook/connect?returnTo=${encodeURIComponent(returnTo)}`;
        setMessage("Outlook wordt eenmalig verbonden...");
        if (!navigateOutlookPopup(outlookWindow, connectUrl)) window.location.assign(connectUrl);
        return;
      }

      setMessage("Nieuwe klantmail wordt gemaakt...");
      const response = await fetch(
        `/api/implementations/${encodeURIComponent(implementation.id)}/new-customer-draft?returnTo=${encodeURIComponent(returnTo)}`,
        { method: "POST" },
      );
      const json = await response.json().catch(() => ({})) as {
        webLink?: string;
        reconnectRequired?: boolean;
        connectUrl?: string;
        error?: string;
      };

      if (json.reconnectRequired && json.connectUrl) {
        setMessage("Outlook moet opnieuw worden verbonden...");
        if (!navigateOutlookPopup(outlookWindow, json.connectUrl)) window.location.assign(json.connectUrl);
        return;
      }
      if (!response.ok || !json.webLink) {
        throw new Error(json.error || "Nieuwe klantmail maken mislukt.");
      }
      if (!navigateOutlookPopup(outlookWindow, json.webLink)) window.location.assign(json.webLink);
      setMessage("Nieuwe klantmail is in Outlook klaargezet.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Nieuwe klantmail maken mislukt.";
      showOutlookPopupStatus(outlookWindow, "Nieuwe klantmail niet gemaakt", errorMessage, "error");
      setMessage(errorMessage);
    } finally {
      setNewCustomerOutlookBusy(false);
    }
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
  const customerDomain = getWebsiteDomain(customerIntake?.formData.website ?? "");
  const customerEmail = customerIntake?.recipientEmail || customerIntake?.formData.contactEmail || "";
  const newCustomerMailMissingFields = [
    !customerIntake?.submittedAt ? "klantformulier" : "",
    !implementation.assigned_consultant_name?.trim() ? "consultant" : "",
    !implementation.administration_name?.trim() ? "administratie" : "",
    !implementation.planned_go_live_date?.trim() ? "livegang" : "",
    !implementation.financial_package?.trim() ? "financieel pakket" : "",
  ].filter(Boolean);
  const newCustomerMailReady = newCustomerMailMissingFields.length === 0;
  const progressRows = [
    ...IMPLEMENTATION_PROGRESS_ITEMS.map((item) => ({ kind: "check" as const, ...item })),
    { kind: "intake" as const, number: 2, key: "customerIntake", label: "Klantformulier" },
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
            title="Toegewezen aan"
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

        <section className="card panel implementation-data-panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Inrichting</div>
              <h2 className="headline">Implementatiegegevens</h2>
            </div>
            <Database size={28} aria-hidden="true" />
          </div>

          <div className="implementation-data-grid">
            <label className="input-wrap">
              <span className="input-label">Administratie</span>
              <input
                className="input"
                type="text"
                maxLength={180}
                value={implementation.administration_name ?? ""}
                disabled={!canEdit}
                placeholder="Databasenaam"
                onChange={(event) => setImplementation({
                  ...implementation,
                  administration_name: event.target.value,
                })}
                onBlur={(event) => saveImplementationDetail(
                  "administration_name",
                  event.currentTarget.value,
                  "Administratie",
                )}
              />
            </label>

            <label className="input-wrap">
              <span className="input-label">Geplande livegang</span>
              <input
                className="input"
                type="date"
                value={implementation.planned_go_live_date ?? ""}
                disabled={!canEdit}
                onChange={(event) => saveImplementationDetail(
                  "planned_go_live_date",
                  event.currentTarget.value,
                  "Geplande livegang",
                )}
                onBlur={(event) => saveImplementationDetail(
                  "planned_go_live_date",
                  event.currentTarget.value,
                  "Geplande livegang",
                )}
              />
            </label>

            <label className="input-wrap">
              <span className="input-label">Financieel pakket</span>
              <select
                className="input"
                value={FINANCIAL_PACKAGE_OPTIONS.includes(implementation.financial_package ?? "")
                  ? implementation.financial_package ?? ""
                  : implementation.financial_package
                    ? "Overig"
                    : ""}
                disabled={!canEdit}
                onChange={(event) => saveImplementationDetail(
                  "financial_package",
                  event.currentTarget.value,
                  "Financieel pakket",
                )}
              >
                <option value="">Selecteer financieel pakket</option>
                {FINANCIAL_PACKAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="input-wrap">
              <span className="input-label">Website/webshop (optioneel)</span>
              <input
                className="input"
                type="text"
                maxLength={180}
                value={implementation.website_webshop ?? ""}
                disabled={!canEdit}
                placeholder="Naam extern pakket"
                onChange={(event) => setImplementation({
                  ...implementation,
                  website_webshop: event.target.value,
                })}
                onBlur={(event) => saveImplementationDetail(
                  "website_webshop",
                  event.currentTarget.value,
                  "Website/webshop",
                )}
              />
            </label>
          </div>

          <div className={`implementation-data-save-state ${detailSaveState}`} aria-live="polite">
            {detailSaveMessage}
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
                <span className="input-label">Toewijzen aan gebruiker</span>
                <select
                  className="input implementation-user-select"
                  value={implementation.assigned_consultant_id ?? ""}
                  disabled={saving}
                  onChange={(event) => void assignConsultant(event.target.value)}
                >
                  <option value="">Nog niet toegewezen</option>
                  {assignableUsers.map((assignableUser) => (
                    <option key={assignableUser.id} value={assignableUser.id}>{assignableUser.full_name || assignableUser.email}</option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="implementation-readonly-field">
                <span>Toegewezen gebruiker</span>
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

          <div className="implementation-communication-stack">
            <article className="implementation-communication-card">
              <div className="implementation-communication-icon"><FileText size={22} /></div>
              <div className="implementation-communication-copy">
                <span>Klantformulier</span>
                <strong>{intakePresentation.label}</strong>
                <p>{customerEmail || "Nog geen e-mailadres beschikbaar"}</p>
              </div>
              <StatusPill tone={intakePresentation.tone}>{intakePresentation.label}</StatusPill>
            </article>

            <article className="implementation-communication-card implementation-dns-card">
              <div className="implementation-communication-icon"><Globe2 size={22} /></div>
              <div className="implementation-communication-copy">
                <span>DNS-instructies</span>
                <strong>{customerDomain || "Website nog niet ontvangen"}</strong>
                <p>Automatische controle van de verplichte SPF- en DKIM-records.</p>
              </div>
              <div className="implementation-dns-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!customerIntake?.submittedAt || !customerDomain || dnsCheckLoading}
                  onClick={() => void loadDnsCheck()}
                >
                  <RefreshCw className={dnsCheckLoading ? "implementation-dns-spinner" : ""} size={16} />
                  {dnsCheckLoading ? "Controleren..." : "Opnieuw controleren"}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!canEdit || !customerIntake?.submittedAt || !customerDomain || dnsOutlookBusy}
                  onClick={() => void handleDnsOutlookDraft()}
                >
                  <Mail size={16} /> {dnsOutlookBusy ? "Concept maken..." : "Klaarzetten in Outlook"}
                </button>
              </div>

              <div className="implementation-dns-results">
                <div className="implementation-dns-group">
                  <h4>SPF-record</h4>
                  <DnsCheckRow
                    value="include:_spf.smartsoft.nu"
                    result={dnsCheck?.checks.spfSmartsoft}
                    loading={dnsCheckLoading}
                  />
                  <DnsCheckRow
                    value="include:_spf.troublefreehosting.nl"
                    result={dnsCheck?.checks.spfTroublefree}
                    loading={dnsCheckLoading}
                  />
                </div>

                <div className="implementation-dns-group">
                  <h4>DKIM-record 1</h4>
                  <DnsCheckRow
                    label="Naam: smtp01-smartsoft._domainkey"
                    value="Type: CNAME | Waarde: smtp01._domainkey.smartsoft.nu"
                    result={dnsCheck?.checks.dkimSmartsoft}
                    loading={dnsCheckLoading}
                  />
                </div>

                <div className="implementation-dns-group">
                  <h4>DKIM-record 2</h4>
                  <DnsCheckRow
                    label="Naam: smtp02-tfh._domainkey"
                    value="Type: CNAME | Waarde: smtp02-tfh._domainkey.troublefreehosting.nl"
                    result={dnsCheck?.checks.dkimTroublefree}
                    loading={dnsCheckLoading}
                  />
                </div>
              </div>

              <div className={`implementation-dns-summary ${dnsCheckError ? "error" : ""}`}>
                {dnsCheckError
                  ? dnsCheckError
                  : dnsCheck?.checkedAt
                    ? `Laatst gecontroleerd: ${formatDateTime(dnsCheck.checkedAt)}`
                    : customerIntake?.submittedAt
                      ? "DNS-controle wordt voorbereid."
                      : "Beschikbaar zodra het klantformulier is ontvangen."}
              </div>
            </article>

            <article className="implementation-communication-card">
              <div className="implementation-communication-icon"><Mail size={22} /></div>
              <div className="implementation-communication-copy">
                <span>Nieuwe klantmail</span>
                <strong>{newCustomerMailReady ? "Klaar om te maken" : "Nog niet compleet"}</strong>
                <p>
                  {newCustomerMailReady
                    ? "Aan martijn@troublefree.nl, met de overige gebruikers in CC."
                    : `Nog nodig: ${newCustomerMailMissingFields.join(", ")}.`}
                </p>
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={!canEdit || !newCustomerMailReady || newCustomerOutlookBusy}
                title={newCustomerMailReady
                  ? "Maak de interne nieuwe klantmail in Outlook"
                  : `Nog nodig: ${newCustomerMailMissingFields.join(", ")}`}
                onClick={() => void handleNewCustomerOutlookDraft()}
              >
                <Mail size={16} /> {newCustomerOutlookBusy ? "Concept maken..." : "Klaarzetten in Outlook"}
              </button>
            </article>
          </div>

          {message ? (
            <div className="implementation-save-row">
              <div className="save-status">{message}</div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
