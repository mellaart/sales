"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, LockKeyhole, Plus, RotateCcw } from "lucide-react";
import { StatusPill } from "@/components/ui";

type RelationForm = {
  company: string;
  phone: string;
  email: string;
  contactEmail: string;
  website: string;
  vatNumber: string;
  chamberOfCommerceNumber: string;
};

type CreateRelationResponse = {
  ok?: boolean;
  created?: boolean;
  apiStatus?: number;
  relationId?: string | null;
  error?: string;
  apiResponse?: unknown;
};

const EMPTY_FORM: RelationForm = {
  company: "",
  phone: "",
  email: "",
  contactEmail: "",
  website: "",
  vatNumber: "",
  chamberOfCommerceNumber: "",
};

const FIXED_VALUES = [
  ["Relatiegroep", "Klanten (7)"],
  ["Soort relatie", "2"],
  ["Mailinglist", "Aan"],
  ["Status", "3"],
] as const;

function displayValue(value: string) {
  return value.trim() || "-";
}

export default function RelationCreateTestForm() {
  const [form, setForm] = useState<RelationForm>(EMPTY_FORM);
  const [previewReady, setPreviewReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [createdRelationId, setCreatedRelationId] = useState<string | null>(null);
  const previewRows = useMemo(
    () => [
      ["Bedrijf", displayValue(form.company)],
      ["Telefoon", displayValue(form.phone)],
      ["Mailadres", displayValue(form.email)],
      ["Administratief mailadres", displayValue(form.contactEmail)],
      ["Website", displayValue(form.website)],
      ["Btw-nummer", displayValue(form.vatNumber)],
      ["KvK", displayValue(form.chamberOfCommerceNumber)],
      ...FIXED_VALUES,
    ],
    [form],
  );

  function updateField(field: keyof RelationForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setPreviewReady(false);
    setCreatedRelationId(null);
    setStatus("");
  }

  function preparePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPreviewReady(true);
    setStatus("Gegevens gecontroleerd. Controleer het overzicht voordat je de testrelatie aanmaakt.");
  }

  async function createRelation() {
    if (busy || !previewReady || createdRelationId) return;
    setBusy(true);
    setStatus("Testrelatie wordt aangemaakt...");

    try {
      const response = await fetch("/api/smart-trade/test/relations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = (await response.json().catch(() => null)) as CreateRelationResponse | null;

      if (!response.ok || !result?.created) {
        setStatus(result?.error || "Testrelatie aanmaken mislukt.");
        return;
      }

      setCreatedRelationId(result.relationId ?? "onbekend");
      setStatus(
        result.relationId
          ? `Testrelatie is aangemaakt met ID ${result.relationId}.`
          : "Testrelatie is aangemaakt, maar de API gaf geen relatie-ID terug. Maak deze relatie niet opnieuw aan.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Testrelatie aanmaken mislukt.");
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setPreviewReady(false);
    setCreatedRelationId(null);
    setStatus("");
  }

  return (
    <section className="card panel stack-4 relation-test-create">
      <div className="top-row">
        <div>
          <div className="eyebrow">Testadministratie</div>
          <h2 className="headline">Nieuwe relatie</h2>
          <p className="subtext">Maak alleen een testrelatie aan. Adres en contactpersoon volgen in de volgende stappen.</p>
        </div>
        <StatusPill tone="warning">troublefree_erik</StatusPill>
      </div>

      <form onSubmit={preparePreview} className="stack-4">
        <div className="field-grid-2">
          <label className="input-wrap">
            <span className="input-label">Bedrijf</span>
            <input className="input" value={form.company} onChange={(event) => updateField("company", event.target.value)} required maxLength={180} />
          </label>
          <label className="input-wrap">
            <span className="input-label">Telefoon</span>
            <input className="input" type="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} maxLength={80} />
          </label>
          <label className="input-wrap">
            <span className="input-label">Mailadres</span>
            <input className="input" type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} maxLength={180} />
          </label>
          <label className="input-wrap">
            <span className="input-label">Administratief mailadres</span>
            <input className="input" type="email" value={form.contactEmail} onChange={(event) => updateField("contactEmail", event.target.value)} maxLength={180} />
          </label>
          <label className="input-wrap">
            <span className="input-label">Website</span>
            <input className="input" value={form.website} onChange={(event) => updateField("website", event.target.value)} maxLength={240} />
          </label>
          <label className="input-wrap">
            <span className="input-label">Btw-nummer</span>
            <input className="input" value={form.vatNumber} onChange={(event) => updateField("vatNumber", event.target.value)} maxLength={60} />
          </label>
          <label className="input-wrap">
            <span className="input-label">KvK</span>
            <input className="input" inputMode="numeric" value={form.chamberOfCommerceNumber} onChange={(event) => updateField("chamberOfCommerceNumber", event.target.value)} maxLength={60} />
          </label>
        </div>

        <div className="relation-test-fixed-values">
          <div className="section-title"><LockKeyhole size={17} />Vaste instellingen</div>
          <div className="summary-list">
            {FIXED_VALUES.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
        </div>

        <div className="button-row">
          <button type="submit" className="primary-button" disabled={busy}><CheckCircle2 size={17} />Gegevens controleren</button>
          <button type="button" className="secondary-button" onClick={resetForm} disabled={busy}><RotateCcw size={17} />Leegmaken</button>
        </div>
      </form>

      {previewReady ? (
        <div className="relation-test-preview">
          <div className="top-row">
            <div>
              <div className="eyebrow">Controle</div>
              <h3>Gegevens voor Smart Trade</h3>
            </div>
            {createdRelationId ? <StatusPill tone="success">Aangemaakt</StatusPill> : <StatusPill tone="warning">Nog niet aangemaakt</StatusPill>}
          </div>
          <div className="summary-list relation-test-preview-list">
            {previewRows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
          <div className="button-row" style={{ marginTop: 20 }}>
            <button type="button" className="primary-button" onClick={() => void createRelation()} disabled={busy || Boolean(createdRelationId)}>
              <Plus size={17} />{busy ? "Aanmaken..." : createdRelationId ? `Relatie ${createdRelationId}` : "Relatie aanmaken in test"}
            </button>
          </div>
        </div>
      ) : null}

      {status ? <div className={`save-status ${createdRelationId ? "success" : ""}`}>{status}</div> : null}
    </section>
  );
}
