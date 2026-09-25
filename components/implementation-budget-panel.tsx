"use client";
import ImplementationForecastCard from "@/components/implementation-forecast";
import { useEffect, useState } from "react";
import { estimateImplementation, type EstimateItem } from "@/lib/implementation-estimates";
import type { BudgetRow } from "@/lib/implementation-planning";
type Item = { key: string; label: string };
const number = (n: number) => n.toLocaleString("nl-NL", { maximumFractionDigits: 2 });

export default function ImplementationBudgetPanel({ implementationId, items, canEdit, approvals }: {
  implementationId: string; items: Item[]; canEdit: boolean; approvals: Record<string, unknown>;
}) {
  const [rows, setRows] = useState<Record<string, BudgetRow>>({});
  const [standards, setStandards] = useState<EstimateItem[]>([]);
  const [budget, setBudget] = useState<number | null>(null);
  const [hours, setHours] = useState(6);
  const [version, setVersion] = useState<string | null>(null);
  const [automatic, setAutomatic] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const selection = items.map(item => item.key).sort().join("|");
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false); setRows({}); setMessage(""); setDirty(false);
    void fetch(`/api/implementations/${implementationId}/budget`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      if (controller.signal.aborted) return;
      setRows(data.rows); setStandards(data.items); setBudget(data.budget); setHours(data.hoursPerDay);
      setVersion(data.version); setAutomatic(data.automatic); setLoaded(true);
    }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [implementationId, selection]);

  const estimate = estimateImplementation(standards, budget, rows, hours);
  const total = items.reduce((sum, item) => sum + (rows[item.key]?.days ?? 0), 0);
  const balanced = budget !== null && Math.abs((total - budget) * hours) < 0.005;
  const valid = items.every(item => {
    const row = rows[item.key];
    return row && Number.isFinite(row.days) && row.days >= 0 && (row.quantity === undefined || (Number.isInteger(row.quantity) && row.quantity >= 0 && row.quantity <= 100000));
  });
  const ready = loaded && !busy && canEdit && budget !== null;
  function change(key: string, patch: Partial<BudgetRow>) {
    setRows(previous => ({ ...previous, [key]: { ...(previous[key] ?? { days: 0, started: false }), ...patch } }));
    setDirty(true); setMessage("");
  }
  function applyStandards() {
    if (!estimate.rows) return;
    setRows(estimate.rows); setDirty(true);
    setMessage("Verdeling opnieuw berekend. Sla op om deze te gebruiken voor de voortgang en prognose.");
  }
  function changeQuantity(key: string, quantity: number) {
    const next = { ...rows, [key]: { ...(rows[key] ?? { days: 0, started: false }), quantity } };
    setRows(next); setDirty(true);
    setMessage("Aantal aangepast. Klik op ‘Verdelen volgens standaarden’ om de uren opnieuw te berekenen, of pas de uren zelf aan.");
  }
  async function save() {
    setBusy(true); setMessage("");
    try {
      const current = Object.fromEntries(items.map(item => [item.key, rows[item.key]]));
      const response = await fetch(`/api/implementations/${implementationId}/budget`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget, version, rows: current }),
      });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setRows(current); setVersion(data.version); setAutomatic(false); setDirty(false); setMessage("Urenverdeling opgeslagen.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Opslaan mislukt."); }
    finally { setBusy(false); }
  }
  return <section className="card panel implementation-budget-panel">
    <h2>Dagenbudget en voortgang</h2>
    <ImplementationForecastCard implementationId={implementationId} refreshKey={version} />
    <p>{!loaded ? "Dagenbudget laden..." : budget === null
      ? "Het dagenbudget uit de goedgekeurde offerte is niet beschikbaar. Controleer de oorspronkelijke offerte; er wordt geen budget geschat."
      : `Goedgekeurde offerte: ${number(budget)} dagen · ${number(budget * hours)} uur · ${number(hours)} uur per dag`}</p>
    <p>De standaarduren uit Admin → Werkzaamheden bepalen de verdeling van het offertebudget. Bij herhaalwerk vul je het aantal in (standaard 1). Je kunt de uren aanpassen zolang het totaal gelijk blijft aan de deal. Alleen akkoord van de klant telt als 100% afgerond.</p>
    {loaded && estimate.missing.length > 0 ? <p className="save-status">Voor {estimate.missing.length} werkzaamheden ontbreekt een standaardbegroting. Laat deze invullen bij Admin → Werkzaamheden. Voor eigen toegevoegde taken kun je hier zelf uren verdelen.</p> : null}
    {loaded && estimate.rawDays !== null && items.length > 0 ? <p className="save-status">
      Standaardschatting op basis van de aantallen: <strong>{number(estimate.rawDays * hours)} uur ({number(estimate.rawDays)} dagen)</strong>.
      {budget !== null && estimate.rawDays > budget + 0.0001 ? ` Dit is ${number((estimate.rawDays - budget) * hours)} uur meer dan geoffreerd. Bespreek dit verschil; de verdeling hieronder vergroot het offertebudget niet.` : " De uren worden naar verhouding verdeeld over het offertebudget."}
      {estimate.rawDays === 0 && budget !== null && budget > 0 ? " Stel eerst positieve standaarduren in voor de werkzaamheden die consultancytijd kosten." : ""}
    </p> : null}
    {loaded && automatic && !dirty && estimate.rows ? <p>Automatisch berekend uit de actuele standaarden. Na opslaan blijft deze verdeling bewaard.</p> : null}
    <div className="implementation-budget-table"><table><thead><tr><th>Onderdeel</th><th>Standaard</th><th>Aantal</th><th>Begrote uren</th><th>Status</th></tr></thead><tbody>
      {items.map(item => {
        const row = rows[item.key] ?? { days: 0, started: false };
        const standard = standards.find(value => value.key === item.key);
        const approved = Boolean(approvals[item.key]);
        return <tr key={item.key}>
          <td>{item.label}</td>
          <td>{standard?.days !== null && standard?.days !== undefined ? `${number(standard.days * hours)} uur${standard.unit ? ` / ${standard.unit}` : ""}` : "Niet ingesteld"}</td>
          <td>{standard?.unit ? <label className="budget-quantity"><input className="input" type="number" min="0" max="100000" step="1" value={row.quantity ?? 1}
            aria-label={`Aantal ${standard.unit} — ${item.label}`} disabled={!ready} onChange={event => changeQuantity(item.key, Number(event.target.value))} /><small>{standard.unit}</small></label> : "Eenmalig"}</td>
          <td><input className="input" aria-label={`Begrote uren ${item.label}`} type="number" min="0" step="0.01" value={Number((row.days * hours).toFixed(2))}
            disabled={!ready} onChange={event => change(item.key, { days: Number(event.target.value) / hours })} /></td>
          <td><select aria-label={`Status ${item.label}`} value={approved ? "approved" : row.started ? "started" : "todo"}
            disabled={!ready || approved} onChange={event => change(item.key, { started: event.target.value === "started" })}>
            <option value="todo">Niet begonnen · 0%</option><option value="started">Bezig · 50%</option>{approved ? <option value="approved">Akkoord door klant · 100%</option> : null}
          </select></td>
        </tr>;
      })}
    </tbody></table></div>
    {loaded && items.length === 0 ? <p>Selecteer eerst de werkzaamheden voor deze implementatie.</p> : null}
    {budget !== null ? <p>Verdeeld: <strong>{number(total * hours)} van {number(budget * hours)} uur</strong> ({number(total)} van {number(budget)} dagen). {balanced ? "De verdeling klopt." : `Verschil: ${number((budget - total) * hours)} uur.`}</p> : null}
    <div className="button-row">
      <button type="button" className="secondary-button" disabled={!ready || !estimate.rows} onClick={applyStandards}>Verdelen volgens standaarden</button>
      <button type="button" className="primary-button" disabled={!ready || !balanced || !valid || !items.length} onClick={() => void save()}>Urenverdeling opslaan</button>
    </div>
    <p role="status">{message || (dirty ? "Wijzigingen nog niet opgeslagen." : "")}</p>
  </section>;
}
