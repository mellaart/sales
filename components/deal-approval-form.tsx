"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, FileCheck2, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import type { PublicDealApproval } from "@/lib/deal-approval";
import styles from "@/app/offerte/[approvalId]/deal-approval.module.css";

const euro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

const dateTime = new Intl.DateTimeFormat("nl-NL", {
  dateStyle: "long",
  timeStyle: "short",
});

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateTime.format(date);
}

export default function DealApprovalForm({
  approvalId,
  token,
  tokenVersion,
}: {
  approvalId: string;
  token: string;
  tokenVersion: number;
}) {
  const [approval, setApproval] = useState<PublicDealApproval | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const endpoint = `/api/deal-approvals/public/${encodeURIComponent(approvalId)}?v=${encodeURIComponent(String(tokenVersion))}&token=${encodeURIComponent(token)}`;

  useEffect(() => {
    let active = true;

    async function loadApproval() {
      if (!token || !Number.isInteger(tokenVersion) || tokenVersion < 1) {
        setError("Deze akkoordlink is ongeldig.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const json = await response.json().catch(() => ({})) as {
          approval?: PublicDealApproval;
          error?: string;
        };
        if (!active) return;
        if (!response.ok || !json.approval) {
          setError(json.error || "De offerte kon niet worden geladen.");
          return;
        }

        setApproval(json.approval);
        setName(json.approval.acceptedByName || json.approval.contactName);
        setEmail(json.approval.acceptedByEmail || json.approval.recipientEmail);
        setConfirmed(json.approval.status === "accepted");
      } catch {
        if (active) setError("De offerte kon niet worden geladen. Probeer het later opnieuw.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadApproval();
    return () => {
      active = false;
    };
  }, [endpoint, token, tokenVersion]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || approval?.status === "accepted") return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, confirmed }),
      });
      const json = await response.json().catch(() => ({})) as {
        approval?: PublicDealApproval;
        error?: string;
      };
      if (!response.ok || !json.approval) {
        setError(json.error || "Uw akkoord kon niet worden vastgelegd.");
        return;
      }

      setApproval(json.approval);
      setName(json.approval.acceptedByName);
      setEmail(json.approval.acceptedByEmail);
      setConfirmed(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Uw akkoord kon niet worden vastgelegd. Controleer uw internetverbinding.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.statePanel}>
          <LoaderCircle className={styles.spinner} size={30} aria-hidden="true" />
          <strong>Offerte wordt beveiligd geladen...</strong>
        </div>
      </main>
    );
  }

  if (!approval) {
    return (
      <main className={styles.page}>
        <div className={styles.statePanel}>
          <Image src="/smart-trade-logo.png" alt="Smart Trade" width={190} height={132} priority />
          <h1>Link niet beschikbaar</h1>
          <p>{error || "Deze akkoordlink is niet meer beschikbaar."}</p>
          <a href="mailto:support@smarttrade.nl">support@smarttrade.nl</a>
        </div>
      </main>
    );
  }

  const accepted = approval.status === "accepted";

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Image
            src="/smart-trade-logo.png"
            alt="Smart Trade"
            width={230}
            height={160}
            className={styles.logo}
            priority
          />
          <div className={styles.heading}>
            <span>Smart Trade</span>
            <h1>Offerte bevestigen</h1>
            <p>{approval.quote.customerName || "Uw Smart Trade-offerte"}</p>
          </div>
          <div className={styles.secureLabel}>
            <LockKeyhole size={21} aria-hidden="true" />
            <div>
              <strong>Beveiligde akkoordlink</strong>
              <span>Persoonlijk en niet openbaar</span>
            </div>
          </div>
        </header>

        {accepted ? (
          <section className={styles.successBanner} aria-live="polite">
            <CheckCircle2 size={28} aria-hidden="true" />
            <div>
              <strong>Akkoord ontvangen</strong>
              <span>
                {approval.acceptedByName || "Uw akkoord"} is op {formatDate(approval.acceptedAt)} vastgelegd.
              </span>
            </div>
          </section>
        ) : null}

        <div className={styles.content}>
          <section className={styles.quoteSection}>
            <div className={styles.sectionTitle}>
              <FileCheck2 size={23} aria-hidden="true" />
              <div>
                <span>Offerte</span>
                <h2>{approval.quote.quoteTitle}</h2>
              </div>
            </div>

            <dl className={styles.summary}>
              <div>
                <dt>Klant</dt>
                <dd>{approval.quote.customerName || "-"}</dd>
              </div>
              <div>
                <dt>Pakket</dt>
                <dd>{approval.quote.packageName || "Smart Trade"}</dd>
              </div>
              <div>
                <dt>Gebruikers</dt>
                <dd>{approval.quote.totalUsers || "-"}</dd>
              </div>
              <div>
                <dt>Maandbedrag</dt>
                <dd>{euro.format(approval.quote.monthlyTotal)} p/m</dd>
              </div>
              <div>
                <dt>Implementatie</dt>
                <dd>{euro.format(approval.quote.implementationTotal)}</dd>
              </div>
              <div>
                <dt>Sales consultant</dt>
                <dd>{approval.quote.salesName || "Smart Trade"}</dd>
              </div>
            </dl>

            <p className={styles.referenceText}>
              De volledige specificatie, voorwaarden en prijsopbouw staan in de offerte-PDF die u per e-mail heeft ontvangen.
            </p>
          </section>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.formHeading}>
              <ShieldCheck size={24} aria-hidden="true" />
              <div>
                <span>Bevestiging</span>
                <h2>{accepted ? "Akkoord vastgelegd" : "Geef akkoord op de offerte"}</h2>
              </div>
            </div>

            <label className={styles.field}>
              <span>Naam</span>
              <input
                value={name}
                required
                disabled={accepted}
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>E-mailadres</span>
              <input
                type="email"
                value={email}
                required
                disabled={accepted}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label className={styles.confirmation}>
              <input
                type="checkbox"
                checked={confirmed}
                required
                disabled={accepted}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                Ik heb de offerte ontvangen en ga akkoord met de inhoud, prijzen en voorwaarden uit de bijgevoegde offerte.
              </span>
            </label>

            {error ? <div className={styles.error} role="alert">{error}</div> : null}

            {!accepted ? (
              <button className={styles.submitButton} type="submit" disabled={saving}>
                <CheckCircle2 size={20} aria-hidden="true" />
                {saving ? "Akkoord wordt vastgelegd..." : "Akkoord geven"}
              </button>
            ) : null}

            <p className={styles.evidenceNote}>
              Bij akkoord registreren wij de datum, naam, het e-mailadres en technische gegevens van deze bevestiging.
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
