"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, LockKeyhole, MapPin, Plus, RotateCcw } from "lucide-react";
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
  warning?: string | null;
  error?: string;
  apiResponse?: unknown;
};

type AddressForm = {
  relationId: string;
  street: string;
  number: string;
  postcode: string;
  city: string;
  district: string;
  addressName: string;
  country: string;
  isContact: boolean;
  isDelivery: boolean;
};

type CreateAddressResponse = {
  created?: boolean;
  addressId?: string | null;
  error?: string;
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

const EMPTY_ADDRESS_FORM: AddressForm = {
  relationId: "",
  street: "",
  number: "",
  postcode: "",
  city: "",
  district: "",
  addressName: "Hoofdadres",
  country: "NL",
  isContact: true,
  isDelivery: true,
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
  const [addressForm, setAddressForm] = useState<AddressForm>(EMPTY_ADDRESS_FORM);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressStatus, setAddressStatus] = useState("");
  const [createdAddressId, setCreatedAddressId] = useState<string | null>(null);
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
    setAddressForm((current) => ({ ...current, relationId: "" }));
    setAddressStatus("");
    setCreatedAddressId(null);
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
      if (result.relationId) {
        setAddressForm((current) => ({ ...current, relationId: result.relationId ?? "" }));
      }
      setStatus(
        result.warning
          ? `${result.warning}${result.relationId ? ` Relatie-ID: ${result.relationId}.` : ""}`
          : result.relationId
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
    setAddressForm(EMPTY_ADDRESS_FORM);
    setAddressStatus("");
    setCreatedAddressId(null);
  }

  function updateAddressField<K extends keyof AddressForm>(field: K, value: AddressForm[K]) {
    setAddressForm((current) => ({ ...current, [field]: value }));
    setAddressStatus("");
    setCreatedAddressId(null);
  }

  async function createAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (addressBusy || createdAddressId) return;

    const relationId = addressForm.relationId.trim();
    if (!/^\d+$/.test(relationId)) {
      setAddressStatus("Vul eerst een geldig relatie-ID in.");
      return;
    }

    setAddressBusy(true);
    setAddressStatus(`Adres wordt toegevoegd aan relatie ${relationId}...`);

    try {
      const response = await fetch(`/api/smart-trade/test/relations/${encodeURIComponent(relationId)}/addresses/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addressForm),
      });
      const result = (await response.json().catch(() => null)) as CreateAddressResponse | null;

      if (!response.ok || !result?.created) {
        setAddressStatus(result?.error || "Testadres aanmaken mislukt.");
        return;
      }

      setCreatedAddressId(result.addressId ?? "aangemaakt");
      setAddressStatus(
        result.addressId
          ? `Adres ${result.addressId} is toegevoegd aan relatie ${relationId}.`
          : `Het adres is toegevoegd aan relatie ${relationId}.`,
      );
    } catch (error) {
      setAddressStatus(error instanceof Error ? error.message : "Testadres aanmaken mislukt.");
    } finally {
      setAddressBusy(false);
    }
  }

  return (
    <section className="card panel stack-4 relation-test-create">
      <div className="top-row">
        <div>
          <div className="eyebrow">Stap 1 · Testadministratie</div>
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

      <form onSubmit={createAddress} className="relation-test-step stack-4">
        <div className="top-row">
          <div>
            <div className="eyebrow">Stap 2</div>
            <h2 className="headline"><MapPin size={24} />Adres toevoegen</h2>
            <p className="subtext">Het ID van de zojuist aangemaakte relatie wordt automatisch overgenomen.</p>
          </div>
          <StatusPill tone={createdAddressId ? "success" : "warning"}>
            {createdAddressId ? "Adres aangemaakt" : addressForm.relationId ? `Relatie ${addressForm.relationId}` : "Wacht op relatie"}
          </StatusPill>
        </div>

        <div className="field-grid-2">
          <label className="input-wrap">
            <span className="input-label">Relatie-ID</span>
            <input className="input" inputMode="numeric" value={addressForm.relationId} onChange={(event) => updateAddressField("relationId", event.target.value)} required maxLength={12} />
          </label>
          <label className="input-wrap">
            <span className="input-label">Adresnaam</span>
            <input className="input" value={addressForm.addressName} onChange={(event) => updateAddressField("addressName", event.target.value)} maxLength={120} />
          </label>
          <label className="input-wrap">
            <span className="input-label">Straat</span>
            <input className="input" value={addressForm.street} onChange={(event) => updateAddressField("street", event.target.value)} required maxLength={180} />
          </label>
          <label className="input-wrap">
            <span className="input-label">Huisnummer</span>
            <input className="input" value={addressForm.number} onChange={(event) => updateAddressField("number", event.target.value)} required maxLength={30} />
          </label>
          <label className="input-wrap">
            <span className="input-label">Postcode</span>
            <input className="input" value={addressForm.postcode} onChange={(event) => updateAddressField("postcode", event.target.value.toUpperCase())} required maxLength={20} />
          </label>
          <label className="input-wrap">
            <span className="input-label">Plaats</span>
            <input className="input" value={addressForm.city} onChange={(event) => updateAddressField("city", event.target.value)} required maxLength={120} />
          </label>
          <label className="input-wrap">
            <span className="input-label">Wijk</span>
            <input className="input" value={addressForm.district} onChange={(event) => updateAddressField("district", event.target.value)} maxLength={120} />
          </label>
          <label className="input-wrap">
            <span className="input-label">Landcode</span>
            <input className="input" value={addressForm.country} onChange={(event) => updateAddressField("country", event.target.value.toUpperCase())} required minLength={2} maxLength={2} />
          </label>
        </div>

        <div className="relation-test-address-options">
          <label className="checkbox-row">
            <input type="checkbox" checked={addressForm.isContact} onChange={(event) => updateAddressField("isContact", event.target.checked)} />
            <span>Contactadres</span>
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={addressForm.isDelivery} onChange={(event) => updateAddressField("isDelivery", event.target.checked)} />
            <span>Afleveradres</span>
          </label>
        </div>

        <div className="button-row">
          <button type="submit" className="primary-button" disabled={addressBusy || Boolean(createdAddressId)}>
            <MapPin size={17} />{addressBusy ? "Adres toevoegen..." : createdAddressId ? "Adres toegevoegd" : "Adres toevoegen in test"}
          </button>
        </div>

        {addressStatus ? <div className={`save-status ${createdAddressId ? "success" : ""}`}>{addressStatus}</div> : null}
      </form>
    </section>
  );
}
