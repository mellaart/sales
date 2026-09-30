"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { ImplementationSelect } from "@/components/implementation-select";
import { getSupabaseClient, type ProfileRecord } from "@/lib/supabase";
import type { ImplementationRecord } from "@/lib/implementations";

const fields = [
  ["administration_name", "Administratie", "text"],
  ["implementation_start_date", "Start implementatie", "date"],
  ["planned_go_live_date", "Geplande livegang", "date"],
  ["actual_go_live_date", "Livegang", "date"],
  ["financial_package", "Financieel pakket", "select"],
  ["website_webshop", "Website/webshop (optioneel)", "text"],
] as const;
type Field = typeof fields[number][0];
const packages = ["Exact Online", "Snelstart", "Twinfield", "King", "Overig"];

export default function DealImplementationDetails({ implementation, canEdit, userId, onSaved }: {
  implementation: ImplementationRecord; canEdit: boolean; userId: string;
  onSaved: (patch: Partial<ImplementationRecord>) => void;
}) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(([key]) => [key, implementation[key] ?? ""])) as Record<Field, string>);
  const [consultant, setConsultant] = useState(implementation.assigned_consultant_id ?? "");
  const [users, setUsers] = useState<ProfileRecord[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const client = getSupabaseClient();
    if (!canEdit || !client) return;
    void (async () => {
      const { data, error } = await client.from("profiles").select("id,email,full_name,role").order("full_name", { ascending: true });
      if (!active) return;
      if (error) setMessage(`Consultants laden mislukt: ${error.message}`);
      else { setUsers((data ?? []) as ProfileRecord[]); setUsersLoaded(true); }
    })();
    return () => { active = false; };
  }, [canEdit]);

  async function save() {
    const client = getSupabaseClient();
    if (!client || !canEdit || busy) return;
    setBusy(true); setMessage("");
    try {
      const patch: Partial<ImplementationRecord> = {};
      for (const [key] of fields) {
        const value = values[key].trim() || null;
        if (value !== (implementation[key] || null)) patch[key] = value;
      }
      if (consultant !== (implementation.assigned_consultant_id ?? "")) {
        const person = users.find(profile => profile.id === consultant);
        if (consultant && !person) throw new Error("Kies een beschikbare consultant.");
        Object.assign(patch, {
          assigned_consultant_id: person?.id ?? null,
          assigned_consultant_name: person?.full_name || person?.email || null,
          assigned_consultant_email: person?.email ?? null,
          assigned_by: userId,
          assigned_at: person ? new Date().toISOString() : null,
          status: person && implementation.status === "new" ? "assigned"
            : !person && implementation.status === "assigned" ? "new" : implementation.status,
        });
      }
      if (!Object.keys(patch).length) { setMessage("Geen wijzigingen om op te slaan."); return; }
      const { data, error } = await client.from("implementations").update(patch as never).eq("id", implementation.id).select("*").single();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("De database heeft het opslaan niet bevestigd.");
      const saved = data as ImplementationRecord;
      const confirmed = Object.fromEntries(Object.keys(patch).map(key => [key, saved[key as keyof ImplementationRecord]]));
      onSaved(confirmed);
      setMessage("Implementatiegegevens opgeslagen. Ze zijn ook bijgewerkt op de implementatiepagina.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Opslaan mislukt.");
    } finally { setBusy(false); }
  }

  return <article className="implementation-communication-card deal-implementation-details">
    <div className="implementation-communication-icon"><SlidersHorizontal size={22} /></div>
    <div className="implementation-communication-copy">
      <h3>Implementatiegegevens</h3>
      <p>Vul de inrichting en planning in en wijs een implementatieconsultant toe.</p>
      <fieldset disabled={!canEdit || busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="implementation-data-grid">
          {fields.map(([key, label, type]) => <label className="input-wrap" key={key}>
            <span className="input-label">{label}</span>
            {type === "select" ? <ImplementationSelect className="input implementation-dark-select" value={values[key]}
              onValueChange={value => setValues(current => ({ ...current, [key]: value }))} disabled={!canEdit || busy}>
              <option value="">Selecteer financieel pakket</option>
              {values[key] && !packages.includes(values[key]) ? <option value={values[key]}>{values[key]}</option> : null}
              {packages.map(name => <option key={name} value={name}>{name}</option>)}
            </ImplementationSelect> : <input className="input" type={type} maxLength={180} value={values[key]}
              placeholder={key === "administration_name" ? "Databasenaam" : key === "website_webshop" ? "Naam extern pakket" : undefined}
              onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} />}
          </label>)}
          <label className="input-wrap">
            <span className="input-label">Implementatieconsultant</span>
            <ImplementationSelect className="input implementation-dark-select" value={consultant}
              disabled={!canEdit || busy || !usersLoaded} onValueChange={setConsultant}>
              <option value="">Nog niet toegewezen</option>
              {consultant && !users.some(profile => profile.id === consultant) ? <option value={consultant}>{implementation.assigned_consultant_name || "Huidige consultant"}</option> : null}
              {users.map(profile => <option key={profile.id} value={profile.id}>{profile.full_name || profile.email}</option>)}
            </ImplementationSelect>
          </label>
        </div>
        <div className="button-row" style={{ marginTop: "1rem" }}>
          <button type="button" className="primary-button" onClick={() => void save()}>{busy ? "Opslaan..." : "Implementatiegegevens opslaan"}</button>
        </div>
      </fieldset>
      {message ? <p role="status">{message}</p> : null}
    </div>
  </article>;
}
