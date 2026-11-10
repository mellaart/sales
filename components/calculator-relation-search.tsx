"use client";

import { useRef, useState, type FormEvent } from "react";
import { Building2, Search } from "lucide-react";
import styles from "./assets-dashboard.module.css";

export type CalculatorRelation = {
  id: string;
  name: string;
  email: string | null;
  debtorNumber: string | number | null;
  postcode: string | null;
};

export default function CalculatorRelationSearch({ selected, onSelect }: {
  selected: CalculatorRelation | null;
  onSelect: (relation: CalculatorRelation) => void;
}) {
  const [query, setQuery] = useState("");
  const [relations, setRelations] = useState<CalculatorRelation[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const request = useRef(0);

  async function search(event: FormEvent) {
    event.preventDefault();
    const current = ++request.current;
    setRelations([]);
    if (!query.trim()) {
      setBusy(false);
      setStatus("Vul een zoekterm in.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(`/api/smart-trade/relations/search?query=${encodeURIComponent(query.trim())}`);
      const json = await response.json();
      if (current !== request.current) return;
      if (!response.ok) throw new Error(json.error ?? "Relaties zoeken mislukt.");
      setRelations(json.relations ?? []);
      if (!json.relations?.length) setStatus("Geen relaties gevonden.");
    } catch (error) {
      if (current === request.current) setStatus(error instanceof Error ? error.message : "Relaties zoeken mislukt.");
    } finally {
      if (current === request.current) setBusy(false);
    }
  }

  return (
    <div className={styles.assetsSearchPanel}>
      <div>
        <div className="section-title"><Building2 size={16} /> Zoek relatie</div>
        <p className="subtext">Zoek op bedrijfsnaam, contactnaam, e-mail of relatienummer. De offerte voor het extra bedrijf wordt gekoppeld aan de gekozen bestaande klant.</p>
      </div>
      <form className={styles.assetSearchForm} onSubmit={search}>
        <input className="input" aria-label="Zoek relatie" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Bedrijfsnaam, e-mail of relatienummer" />
        <button type="submit" className="button secondary" disabled={busy}><Search size={16} />{busy ? "Zoeken..." : "Zoek relatie"}</button>
      </form>
      {relations.length > 0 ? <div className={styles.relationResultList}>
        {relations.map((relation) => <button key={relation.id} type="button"
          className={`${styles.relationResultCard} ${selected?.id === relation.id ? styles.selectedResultCard : ""}`}
          onClick={() => onSelect(relation)} aria-pressed={selected?.id === relation.id}>
          <Building2 size={18} />
          <span className={styles.relationResultContent}><strong>{relation.name}</strong>
            <span className={styles.relationResultMeta}>ID {relation.id}{relation.debtorNumber ? ` · Debiteur ${relation.debtorNumber}` : ""}{relation.email ? ` · ${relation.email}` : ""}</span>
          </span>
          <span>{selected?.id === relation.id ? "Geselecteerd" : "Selecteer"}</span>
        </button>)}
      </div> : null}
      {selected ? <p className="subtext">Geselecteerde relatie: <strong>{selected.name}</strong> · ID {selected.id}</p> : null}
      {status ? <p role="status" className="save-status">{status}</p> : null}
    </div>
  );
}
