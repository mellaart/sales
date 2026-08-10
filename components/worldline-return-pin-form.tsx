"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  EMPTY_WORLDLINE_RETURN_PIN_FORM_DATA,
  WORLDLINE_RETURN_PIN_ACCEPTANCE_TEXT,
  WORLDLINE_RETURN_PIN_RESPONSIBILITY_PARAGRAPHS,
  type PublicWorldlineReturnPinForm,
  type WorldlineReturnPinFormData,
} from "@/lib/worldline-return-pin";
import styles from "@/app/retourpinnen/[formId]/return-pin-form.module.css";

const dateTime = new Intl.DateTimeFormat("nl-NL", {
  dateStyle: "long",
  timeStyle: "short",
});

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateTime.format(date);
}

function newUserId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function WorldlineReturnPinForm({
  formId,
  token,
  tokenVersion,
}: {
  formId: string;
  token: string;
  tokenVersion: number;
}) {
  const [form, setForm] = useState<PublicWorldlineReturnPinForm | null>(null);
  const [formData, setFormData] = useState<WorldlineReturnPinFormData>(EMPTY_WORLDLINE_RETURN_PIN_FORM_DATA);
  const [confirmed, setConfirmed] = useState(false);
  const [visiblePins, setVisiblePins] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const endpoint = `/api/worldline/return-pin-forms/public/${encodeURIComponent(formId)}?v=${encodeURIComponent(String(tokenVersion))}&token=${encodeURIComponent(token)}`;

  useEffect(() => {
    let active = true;

    async function loadForm() {
      if (!token || !Number.isInteger(tokenVersion) || tokenVersion < 1) {
        setError("Deze klantlink is ongeldig.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const json = await response.json().catch(() => ({})) as {
          form?: PublicWorldlineReturnPinForm;
          error?: string;
        };
        if (!active) return;
        if (!response.ok || !json.form) {
          setError(json.error || "Het retourpinnenformulier kon niet worden geladen.");
          return;
        }

        const users = json.form.formData.authorizedUsers.length
          ? json.form.formData.authorizedUsers
          : [{ id: newUserId(), name: "", pinCode: "" }];
        setForm(json.form);
        setFormData({ ...json.form.formData, authorizedUsers: users });
        setConfirmed(json.form.status === "accepted");
      } catch {
        if (active) setError("Het retourpinnenformulier kon niet worden geladen. Probeer het later opnieuw.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadForm();
    return () => {
      active = false;
    };
  }, [endpoint, token, tokenVersion]);

  function setField(field: keyof Omit<WorldlineReturnPinFormData, "authorizedUsers">, value: string) {
    setFormData((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function setUserField(id: string, field: "name" | "pinCode", value: string) {
    setFormData((current) => ({
      ...current,
      authorizedUsers: current.authorizedUsers.map((user) => (
        user.id === id
          ? { ...user, [field]: field === "pinCode" ? value.replace(/\D/g, "").slice(0, 12) : value }
          : user
      )),
    }));
    setError("");
  }

  function addUser() {
    if (formData.authorizedUsers.length >= 16) return;
    setFormData((current) => ({
      ...current,
      authorizedUsers: [...current.authorizedUsers, { id: newUserId(), name: "", pinCode: "" }],
    }));
  }

  function removeUser(id: string) {
    if (formData.authorizedUsers.length <= 1) return;
    setFormData((current) => ({
      ...current,
      authorizedUsers: current.authorizedUsers.filter((user) => user.id !== id),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || form?.status === "accepted") return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formData, confirmed }),
      });
      const json = await response.json().catch(() => ({})) as {
        form?: PublicWorldlineReturnPinForm;
        error?: string;
      };
      if (!response.ok || !json.form) {
        setError(json.error || "Uw goedkeuring kon niet worden vastgelegd.");
        return;
      }

      setForm(json.form);
      setFormData(json.form.formData);
      setConfirmed(true);
      setVisiblePins({});
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Uw goedkeuring kon niet worden vastgelegd. Controleer uw internetverbinding.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.statePanel}>
          <LoaderCircle className={styles.spinner} size={30} aria-hidden="true" />
          <strong>Retourpinnenformulier wordt beveiligd geladen...</strong>
        </div>
      </main>
    );
  }

  if (!form) {
    return (
      <main className={styles.page}>
        <div className={styles.statePanel}>
          <Image src="/smart-trade-logo.png" alt="Smart Trade" width={210} height={146} priority />
          <h1>Link niet beschikbaar</h1>
          <p>{error || "Deze klantlink is niet meer beschikbaar."}</p>
          <a href="mailto:support@smarttrade.nl">support@smarttrade.nl</a>
        </div>
      </main>
    );
  }

  const accepted = form.status === "accepted";

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.logoFrame}>
            <Image
              src="/smart-trade-logo.png"
              alt="Smart Trade"
              width={244}
              height={170}
              className={styles.logo}
              priority
            />
          </div>
          <div className={styles.heading}>
            <span>Worldline</span>
            <h1>Acceptatieformulier retourpinnen</h1>
            <p>{formData.companyName || form.customerName}</p>
          </div>
          <div className={styles.security}>
            <LockKeyhole size={22} aria-hidden="true" />
            <div>
              <strong>Beveiligd formulier</strong>
              <span>Uw gegevens worden rechtstreeks en lokaal bij Smart Trade opgeslagen.</span>
            </div>
          </div>
        </header>

        {accepted ? (
          <div className={styles.successBanner} role="status">
            <CheckCircle2 size={25} aria-hidden="true" />
            <div>
              <strong>Goedkeuring ontvangen</strong>
              <span>{formData.acceptedByName || "Uw goedkeuring"} heeft dit formulier op {formatDate(form.acceptedAt)} goedgekeurd.</span>
            </div>
          </div>
        ) : null}

        <form className={styles.form} onSubmit={handleSubmit}>
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <span>01</span>
              <div>
                <h2>Klantgegevens</h2>
                <p>Gegevens van de organisatie waarvoor retourpinnen wordt geactiveerd.</p>
              </div>
            </div>
            <div className={styles.fields}>
              <label className={styles.field}>
                <span>Bedrijfsnaam *</span>
                <input value={formData.companyName} required disabled={accepted} autoComplete="organization" onChange={(event) => setField("companyName", event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>E-mailadres *</span>
                <input type="email" value={formData.email} required disabled={accepted} autoComplete="email" onChange={(event) => setField("email", event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Telefoonnummer *</span>
                <input type="tel" value={formData.phone} required disabled={accepted} autoComplete="tel" onChange={(event) => setField("phone", event.target.value)} />
              </label>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <span>02</span>
              <div>
                <h2>Instellingen retourpinnen</h2>
                <p>De bedragen worden ingesteld conform de hieronder opgegeven limieten.</p>
              </div>
            </div>
            <div className={styles.fields}>
              <label className={styles.field}>
                <span>Maximaal bedrag per retourpintransactie *</span>
                <div className={styles.moneyInput}><b>EUR</b><input inputMode="decimal" value={formData.maxTransactionAmount} required disabled={accepted} onChange={(event) => setField("maxTransactionAmount", event.target.value)} /></div>
              </label>
              <label className={styles.field}>
                <span>Maximaal totaalbedrag per dag *</span>
                <div className={styles.moneyInput}><b>EUR</b><input inputMode="decimal" value={formData.maxDailyAmount} required disabled={accepted} onChange={(event) => setField("maxDailyAmount", event.target.value)} /></div>
              </label>
              <label className={styles.field}>
                <span>Notificatie vanaf een bedrag van *</span>
                <div className={styles.moneyInput}><b>EUR</b><input inputMode="decimal" value={formData.notificationThreshold} required disabled={accepted} onChange={(event) => setField("notificationThreshold", event.target.value)} /></div>
              </label>
              <label className={styles.field}>
                <span>E-mailadres notificaties en dagrapportage *</span>
                <input type="email" value={formData.notificationEmail} required disabled={accepted} onChange={(event) => setField("notificationEmail", event.target.value)} />
              </label>
              <p className={styles.fieldNote}>Wijzigingen na activering worden apart aangevraagd en mogen alleen door een bevoegde contactpersoon worden doorgegeven.</p>
            </div>
          </section>

          <section className={`${styles.section} ${styles.usersSection}`}>
            <div className={styles.sectionHeading}>
              <span>03</span>
              <div>
                <h2>Geautoriseerde gebruikers</h2>
                <p>Alleen deze gebruikers krijgen toegang tot retourpinnen.</p>
              </div>
            </div>
            <div className={styles.usersContent}>
              <div className={styles.userList}>
                {formData.authorizedUsers.map((user, index) => (
                  <div className={styles.userRow} key={user.id}>
                    <span className={styles.userNumber}>{String(index + 1).padStart(2, "0")}</span>
                    <label className={styles.field}>
                      <span>Naam gebruiker *</span>
                      <input value={user.name} required disabled={accepted} autoComplete="off" onChange={(event) => setUserField(user.id, "name", event.target.value)} />
                    </label>
                    <label className={styles.field}>
                      <span>Pincode *</span>
                      {accepted ? (
                        <span className={styles.lockedPin}><ShieldCheck size={17} aria-hidden="true" /> Veilig vastgelegd</span>
                      ) : (
                        <div className={styles.pinInput}>
                          <input
                            type={visiblePins[user.id] ? "text" : "password"}
                            inputMode="numeric"
                            value={user.pinCode}
                            required
                            minLength={4}
                            maxLength={12}
                            autoComplete="new-password"
                            onChange={(event) => setUserField(user.id, "pinCode", event.target.value)}
                          />
                          <button
                            type="button"
                            title={visiblePins[user.id] ? "Pincode verbergen" : "Pincode tonen"}
                            aria-label={visiblePins[user.id] ? "Pincode verbergen" : "Pincode tonen"}
                            onClick={() => setVisiblePins((current) => ({ ...current, [user.id]: !current[user.id] }))}
                          >
                            {visiblePins[user.id] ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      )}
                    </label>
                    {!accepted ? (
                      <button
                        type="button"
                        className={styles.removeButton}
                        disabled={formData.authorizedUsers.length <= 1}
                        title="Gebruiker verwijderen"
                        aria-label={`Gebruiker ${index + 1} verwijderen`}
                        onClick={() => removeUser(user.id)}
                      >
                        <Trash2 size={18} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {!accepted && formData.authorizedUsers.length < 16 ? (
                <button type="button" className={styles.addButton} onClick={addUser}>
                  <Plus size={18} /> Gebruiker toevoegen
                </button>
              ) : null}
              <p className={styles.fieldNote}>De klant is verantwoordelijk voor het actueel houden van gebruikersrechten en voor het veilig beheren van pincodes.</p>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <span>04</span>
              <div>
                <h2>Verantwoordelijkheden</h2>
                <p>Voorwaarden voor activering en veilig gebruik.</p>
              </div>
            </div>
            <div className={styles.legalText}>
              {WORLDLINE_RETURN_PIN_RESPONSIBILITY_PARAGRAPHS.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          </section>

          <section className={`${styles.section} ${styles.acceptanceSection}`}>
            <div className={styles.sectionHeading}>
              <span>05</span>
              <div>
                <h2>Goedkeuring</h2>
                <p>De datum en technische bewijsgegevens worden automatisch vastgelegd.</p>
              </div>
            </div>
            <div className={styles.acceptanceContent}>
              <div className={styles.fields}>
                <label className={styles.field}>
                  <span>Plaats *</span>
                  <input value={formData.acceptancePlace} required disabled={accepted} autoComplete="address-level2" onChange={(event) => setField("acceptancePlace", event.target.value)} />
                </label>
                <label className={styles.field}>
                  <span>Naam tekenbevoegde *</span>
                  <input value={formData.acceptedByName} required disabled={accepted} autoComplete="name" onChange={(event) => setField("acceptedByName", event.target.value)} />
                </label>
                <label className={styles.field}>
                  <span>Functie *</span>
                  <input value={formData.acceptedByFunction} required disabled={accepted} autoComplete="organization-title" onChange={(event) => setField("acceptedByFunction", event.target.value)} />
                </label>
                <label className={styles.field}>
                  <span>Datum</span>
                  <span className={styles.autoDate}>{accepted ? formatDate(form.acceptedAt) : "Wordt bij goedkeuring automatisch vastgelegd"}</span>
                </label>
              </div>

              <label className={styles.confirmation}>
                <input type="checkbox" checked={confirmed} required disabled={accepted} onChange={(event) => setConfirmed(event.target.checked)} />
                <span>{WORLDLINE_RETURN_PIN_ACCEPTANCE_TEXT}</span>
              </label>

              {error ? <div className={styles.error} role="alert">{error}</div> : null}

              {!accepted ? (
                <button className={styles.submitButton} type="submit" disabled={saving}>
                  <CheckCircle2 size={20} aria-hidden="true" />
                  {saving ? "Goedkeuring wordt vastgelegd..." : "Definitief goedkeuren"}
                </button>
              ) : null}

              <p className={styles.evidenceNote}>Bij goedkeuring registreren wij de ingevulde gegevens, datum, naam, functie, plaats en technische bewijsgegevens.</p>
            </div>
          </section>
        </form>
      </div>
    </main>
  );
}
