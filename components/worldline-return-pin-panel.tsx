"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardCopy,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  Link2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { StatusPill } from "@/components/ui";
import type { WorldlineReturnPinFormSummary } from "@/lib/worldline-return-pin";
import styles from "@/components/worldline-return-pin-panel.module.css";

const dateTime = new Intl.DateTimeFormat("nl-NL", {
  dateStyle: "long",
  timeStyle: "short",
});

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : dateTime.format(date);
}

function statusTone(form: WorldlineReturnPinFormSummary | null) {
  if (!form) return "neutral" as const;
  if (form.status === "accepted") return "success" as const;
  if (form.status === "open" && new Date(form.expiresAt).getTime() > Date.now()) return "warning" as const;
  return "danger" as const;
}

function statusLabel(form: WorldlineReturnPinFormSummary | null) {
  if (!form) return "Nog niet gemaakt";
  if (form.status === "accepted") return "Goedgekeurd";
  if (form.status === "revoked") return "Ingetrokken";
  if (new Date(form.expiresAt).getTime() <= Date.now()) return "Verlopen";
  return "Wacht op klant";
}

export default function WorldlineReturnPinPanel({
  projectId,
  canWrite,
}: {
  projectId: string;
  canWrite: boolean;
}) {
  const [forms, setForms] = useState<WorldlineReturnPinFormSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showPins, setShowPins] = useState(false);

  const latestForm = forms[0] ?? null;
  const acceptedForms = useMemo(() => forms.filter((form) => form.status === "accepted"), [forms]);

  const loadForms = useCallback(async (showMessage = false) => {
    if (showMessage) setMessage("Status wordt vernieuwd...");
    try {
      const response = await fetch(
        `/api/worldline/return-pin-forms?projectId=${encodeURIComponent(projectId)}`,
        { cache: "no-store" },
      );
      const json = await response.json().catch(() => ({})) as {
        forms?: WorldlineReturnPinFormSummary[];
        error?: string;
      };
      if (!response.ok) {
        setMessage(json.error || "Retourpinnenformulier laden mislukt.");
        return;
      }
      setForms(json.forms ?? []);
      if (showMessage) setMessage("Status is bijgewerkt.");
    } catch {
      setMessage("Retourpinnenformulier laden mislukt.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setForms([]);
    setMessage("");
    setShowPins(false);
    setLoading(true);
    void loadForms(false);

    function refreshOnFocus() {
      void loadForms(false);
    }
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [loadForms]);

  async function createForm(forceNew: boolean) {
    if (busy || !canWrite) return;
    setBusy(true);
    setMessage(forceNew ? "Nieuwe klantlink wordt gemaakt..." : "Klantlink wordt gemaakt...");
    try {
      const response = await fetch("/api/worldline/return-pin-forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, forceNew }),
      });
      const json = await response.json().catch(() => ({})) as {
        form?: WorldlineReturnPinFormSummary;
        error?: string;
      };
      if (!response.ok || !json.form) {
        setMessage(json.error || "Retourpinnenlink maken mislukt.");
        return;
      }
      await loadForms(false);
      setMessage(forceNew ? "Nieuwe klantlink is klaar." : "Klantlink is klaar.");
    } catch {
      setMessage("Retourpinnenlink maken mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!latestForm?.publicUrl) return;
    try {
      await navigator.clipboard.writeText(latestForm.publicUrl);
      setMessage("Klantlink is gekopieerd.");
    } catch {
      setMessage("Klantlink kopieren is niet gelukt.");
    }
  }

  function openForm() {
    if (!latestForm?.publicUrl) return;
    window.open(latestForm.publicUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.icon}><CreditCard size={21} aria-hidden="true" /></span>
          <div>
            <span className={styles.eyebrow}>Retourpinnen</span>
            <h3>Acceptatieformulier retourpinnen</h3>
            <p>De klant vult limieten en geautoriseerde gebruikers in en geeft onderaan definitief akkoord.</p>
          </div>
        </div>
        <StatusPill tone={statusTone(latestForm)}>{loading ? "Laden..." : statusLabel(latestForm)}</StatusPill>
      </div>

      <div className={styles.actions}>
        {!latestForm ? (
          <button type="button" className="primary-button" disabled={busy || loading || !canWrite} onClick={() => void createForm(false)}>
            <Link2 size={16} /> {busy ? "Link maken..." : "Klantformulier maken"}
          </button>
        ) : (
          <>
            <button type="button" className="secondary-button" disabled={busy} onClick={openForm}>
              <ExternalLink size={16} /> Open formulier
            </button>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void copyLink()}>
              <ClipboardCopy size={16} /> Kopieer link
            </button>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void loadForms(true)}>
              <RefreshCw size={16} /> Status vernieuwen
            </button>
            {canWrite ? (
              <button type="button" className="secondary-button" disabled={busy} onClick={() => void createForm(true)}>
                <Link2 size={16} /> Nieuwe versie
              </button>
            ) : null}
          </>
        )}
      </div>

      {latestForm ? (
        <div className={styles.linkRow}>
          <span>Klantlink</span>
          <input value={latestForm.publicUrl} readOnly aria-label="Klantlink retourpinnen" />
        </div>
      ) : null}

      {latestForm?.status === "open" ? (
        <p className={styles.openNote}>De link is geldig tot {formatDate(latestForm.expiresAt)}. Zodra de klant goedkeurt, verschijnt het bewijs hier automatisch.</p>
      ) : null}

      {acceptedForms.map((acceptedForm, index) => (
        <div className={styles.accepted} key={acceptedForm.id}>
          <div className={styles.acceptedHeading}>
            <div>
              <span>Digitale goedkeuring {acceptedForms.length > 1 ? `v${acceptedForm.version}` : ""}</span>
              <strong><ShieldCheck size={19} aria-hidden="true" /> Bewijs lokaal vastgelegd</strong>
            </div>
            {index === 0 && canWrite ? (
              <button type="button" className={styles.pinToggle} onClick={() => setShowPins((shown) => !shown)}>
                {showPins ? <EyeOff size={17} /> : <Eye size={17} />}
                {showPins ? "Pincodes verbergen" : "Pincodes tonen"}
              </button>
            ) : null}
          </div>

          <dl className={styles.evidenceGrid}>
            <div><dt>Bedrijfsnaam</dt><dd>{acceptedForm.formData.companyName || "-"}</dd></div>
            <div><dt>Goedgekeurd door</dt><dd>{acceptedForm.evidence?.acceptedByName || "-"}</dd></div>
            <div><dt>Functie</dt><dd>{acceptedForm.evidence?.acceptedByFunction || "-"}</dd></div>
            <div><dt>Plaats</dt><dd>{acceptedForm.evidence?.acceptedPlace || "-"}</dd></div>
            <div><dt>Datum en tijd</dt><dd>{formatDate(acceptedForm.evidence?.acceptedAt ?? null)}</dd></div>
            <div><dt>IP-adres</dt><dd>{acceptedForm.evidence?.ipAddress || "Niet beschikbaar"}</dd></div>
            <div><dt>Max. per transactie</dt><dd>EUR {acceptedForm.formData.maxTransactionAmount || "-"}</dd></div>
            <div><dt>Max. per dag</dt><dd>EUR {acceptedForm.formData.maxDailyAmount || "-"}</dd></div>
            <div><dt>Notificatie vanaf</dt><dd>EUR {acceptedForm.formData.notificationThreshold || "-"}</dd></div>
            <div><dt>Notificatie naar</dt><dd>{acceptedForm.formData.notificationEmail || "-"}</dd></div>
            <div className={styles.hashRow}><dt>Bewijskenmerk</dt><dd>{acceptedForm.evidence?.evidenceHash || "-"}</dd></div>
          </dl>

          <div className={styles.users}>
            <div className={styles.usersHeading}>
              <CheckCircle2 size={18} aria-hidden="true" />
              <strong>Geautoriseerde gebruikers</strong>
            </div>
            {acceptedForm.formData.authorizedUsers.map((authorizedUser) => (
              <div className={styles.userRow} key={authorizedUser.id}>
                <span>{authorizedUser.name}</span>
                <strong>{index === 0 && canWrite && showPins ? authorizedUser.pinCode : "••••"}</strong>
              </div>
            ))}
          </div>
        </div>
      ))}

      {message ? <div className={styles.message} role="status" aria-live="polite">{message}</div> : null}
    </div>
  );
}
