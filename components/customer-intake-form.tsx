"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, LockKeyhole, Send } from "lucide-react";
import {
  EMPTY_CUSTOMER_INTAKE_DATA,
  type CustomerIntakeData,
  type CustomerIntakeStatus,
} from "@/lib/customer-intake";
import styles from "@/app/klantgegevens/[intakeId]/customer-intake.module.css";

type PublicIntake = {
  id: string;
  status: CustomerIntakeStatus;
  formData: CustomerIntakeData;
  expiresAt: string;
  submittedAt: string | null;
  customerName: string;
};

type TextFieldProps = {
  label: string;
  field: keyof CustomerIntakeData;
  formData: CustomerIntakeData;
  onChange: (field: keyof CustomerIntakeData, value: string) => void;
  type?: "text" | "email" | "tel";
  required?: boolean;
  autoComplete?: string;
};

function CustomerTextField({
  label,
  field,
  formData,
  onChange,
  type = "text",
  required = true,
  autoComplete,
}: TextFieldProps) {
  return (
    <label className={styles.field}>
      <span>{label}{required ? <b aria-hidden="true"> *</b> : null}</span>
      <input
        type={type}
        value={formData[field]}
        required={required}
        autoComplete={autoComplete}
        onChange={(event) => onChange(field, event.target.value)}
      />
    </label>
  );
}

export default function CustomerIntakeForm({
  intakeId,
  token,
  tokenVersion,
}: {
  intakeId: string;
  token: string;
  tokenVersion: number;
}) {
  const [formData, setFormData] = useState<CustomerIntakeData>(EMPTY_CUSTOMER_INTAKE_DATA);
  const [intake, setIntake] = useState<PublicIntake | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const endpoint = `/api/customer-intakes/public/${encodeURIComponent(intakeId)}?v=${encodeURIComponent(String(tokenVersion))}&token=${encodeURIComponent(token)}`;

  useEffect(() => {
    let active = true;

    async function load() {
      if (!token || !Number.isInteger(tokenVersion) || tokenVersion < 1) {
        setError("Deze klantlink is ongeldig.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const json = await response.json().catch(() => ({})) as {
          intake?: PublicIntake;
          error?: string;
        };

        if (!active) return;
        if (!response.ok || !json.intake) {
          setError(json.error || "Klantformulier laden mislukt.");
          return;
        }

        setIntake(json.intake);
        setFormData(json.intake.formData);
        setSaved(json.intake.status === "submitted" || json.intake.status === "processed");
      } catch {
        if (active) setError("Klantformulier laden mislukt. Probeer het later opnieuw.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [endpoint, token, tokenVersion]);

  function setField(field: keyof CustomerIntakeData, value: string) {
    setFormData((current) => ({ ...current, [field]: value }) as CustomerIntakeData);
    setSaved(false);
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formData }),
      });
      const json = await response.json().catch(() => ({})) as {
        error?: string;
        submittedAt?: string;
      };

      if (!response.ok) {
        setError(json.error || "Opslaan mislukt.");
        return;
      }

      setSaved(true);
      setIntake((current) => current
        ? { ...current, status: "submitted", submittedAt: json.submittedAt ?? new Date().toISOString() }
        : current);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Opslaan mislukt. Controleer uw internetverbinding en probeer het opnieuw.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.statePanel}>
          <LoaderCircle className={styles.spinner} size={30} aria-hidden="true" />
          <strong>Klantformulier wordt geladen...</strong>
        </div>
      </main>
    );
  }

  if (error && !intake) {
    return (
      <main className={styles.page}>
        <div className={styles.statePanel}>
          <Image src="/smart-trade-logo.png" alt="Smart Trade" width={210} height={146} priority />
          <h1>Link niet beschikbaar</h1>
          <p>{error}</p>
          <a href="mailto:support@smarttrade.nl">support@smarttrade.nl</a>
        </div>
      </main>
    );
  }

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
            <span>Smart Trade</span>
            <h1>Gegevens nieuwe klanten</h1>
            <p>{intake?.customerName || "Nieuwe klant"}</p>
          </div>
          <div className={styles.security}>
            <LockKeyhole size={22} aria-hidden="true" />
            <div>
              <strong>Beveiligd formulier</strong>
              <span>Uw gegevens worden rechtstreeks bij Smart Trade opgeslagen.</span>
            </div>
          </div>
        </header>

        {saved ? (
          <div className={styles.successBanner} role="status">
            <CheckCircle2 size={24} aria-hidden="true" />
            <div>
              <strong>Gegevens ontvangen</strong>
              <span>U kunt de gegevens hieronder nog controleren en opnieuw opslaan.</span>
            </div>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className={styles.form}>
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <span>01</span>
              <div>
                <h2>Aflever adres</h2>
                <p>Vestigings- en algemene contactgegevens</p>
              </div>
            </div>
            <div className={styles.fields}>
              <CustomerTextField label="Naam" field="deliveryName" formData={formData} onChange={setField} autoComplete="organization" />
              <CustomerTextField label="Straat" field="deliveryStreet" formData={formData} onChange={setField} autoComplete="address-line1" />
              <CustomerTextField label="Nummer" field="deliveryNumber" formData={formData} onChange={setField} autoComplete="address-line2" />
              <CustomerTextField label="Postcode" field="deliveryPostcode" formData={formData} onChange={setField} autoComplete="postal-code" />
              <CustomerTextField label="Plaats" field="deliveryCity" formData={formData} onChange={setField} autoComplete="address-level2" />
              <CustomerTextField label="Telefoonnummer" field="phone" formData={formData} onChange={setField} type="tel" autoComplete="tel" />
              <CustomerTextField label="Mobiel" field="mobile" formData={formData} onChange={setField} type="tel" autoComplete="tel" />
              <CustomerTextField label="E-mail algemeen" field="generalEmail" formData={formData} onChange={setField} type="email" autoComplete="email" />
              <CustomerTextField label="Website" field="website" formData={formData} onChange={setField} autoComplete="url" />
              <CustomerTextField label="BTW-nummer" field="vatNumber" formData={formData} onChange={setField} />
              <CustomerTextField label="KvK-nummer" field="chamberOfCommerceNumber" formData={formData} onChange={setField} />
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <span>02</span>
              <div>
                <h2>Post adres *</h2>
                <p>Alleen invullen indien van toepassing</p>
              </div>
            </div>
            <div className={styles.fields}>
              <CustomerTextField label="Straat" field="postalStreet" formData={formData} onChange={setField} required={false} />
              <CustomerTextField label="Nummer" field="postalNumber" formData={formData} onChange={setField} required={false} />
              <CustomerTextField label="Postcode" field="postalPostcode" formData={formData} onChange={setField} required={false} />
              <CustomerTextField label="Plaats" field="postalCity" formData={formData} onChange={setField} required={false} />
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <span>03</span>
              <div>
                <h2>Contactpersoon</h2>
                <p>Dagelijks aanspreekpunt</p>
              </div>
            </div>
            <div className={styles.fields}>
              <CustomerTextField label="Voornaam" field="contactFirstName" formData={formData} onChange={setField} autoComplete="given-name" />
              <CustomerTextField label="Achternaam" field="contactLastName" formData={formData} onChange={setField} autoComplete="family-name" />
              <CustomerTextField label="Telefoonnummer" field="contactPhone" formData={formData} onChange={setField} type="tel" />
              <CustomerTextField label="E-mail" field="contactEmail" formData={formData} onChange={setField} type="email" />
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <span>04</span>
              <div>
                <h2>Administratie</h2>
                <p>Facturatie en automatische incasso</p>
              </div>
            </div>

            <div className={styles.administrationContent}>
              <fieldset className={styles.choiceField}>
                <legend>Factuur per mail / post *</legend>
                <label>
                  <input
                    type="radio"
                    name="invoiceDelivery"
                    value="mail"
                    required
                    checked={formData.invoiceDelivery === "mail"}
                    onChange={() => setField("invoiceDelivery", "mail")}
                  />
                  <span>Mail</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="invoiceDelivery"
                    value="post"
                    checked={formData.invoiceDelivery === "post"}
                    onChange={() => setField("invoiceDelivery", "post")}
                  />
                  <span>Post</span>
                </label>
              </fieldset>

              <div className={`${styles.fields} ${styles.administrationFields}`}>
                <CustomerTextField label="E-mail" field="administrationEmail" formData={formData} onChange={setField} type="email" />
                <CustomerTextField label="Voornaam" field="administrationFirstName" formData={formData} onChange={setField} autoComplete="given-name" />
                <CustomerTextField label="Achternaam" field="administrationLastName" formData={formData} onChange={setField} autoComplete="family-name" />
                <CustomerTextField label="Telefoon" field="administrationPhone" formData={formData} onChange={setField} type="tel" />
              </div>

              <fieldset className={styles.choiceField}>
                <legend>Automatische incasso ja / nee *</legend>
                <label>
                  <input
                    type="radio"
                    name="directDebit"
                    value="yes"
                    required
                    checked={formData.directDebit === "yes"}
                    onChange={() => setField("directDebit", "yes")}
                  />
                  <span>Ja</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="directDebit"
                    value="no"
                    checked={formData.directDebit === "no"}
                    onChange={() => setField("directDebit", "no")}
                  />
                  <span>Nee</span>
                </label>
              </fieldset>

              <div className={styles.bankAccountField}>
                <CustomerTextField
                  label="Bankrekening voor automatische incasso"
                  field="directDebitBankAccount"
                  formData={formData}
                  onChange={setField}
                  required={formData.directDebit === "yes"}
                />
              </div>
            </div>
          </section>

          {error ? <div className={styles.error} role="alert">{error}</div> : null}

          <footer className={styles.formFooter}>
            <div>
              <strong>Smart Trade</strong>
              <span>Pletterij 1A, 2211 JT Noordwijkerhout</span>
            </div>
            <button type="submit" disabled={saving}>
              {saving ? <LoaderCircle className={styles.spinner} size={19} /> : <Send size={19} />}
              {saving ? "Opslaan..." : "Gegevens opslaan"}
            </button>
          </footer>
        </form>
      </div>
    </main>
  );
}
