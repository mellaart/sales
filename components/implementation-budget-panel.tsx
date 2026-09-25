"use client";
import ImplementationForecastCard from "@/components/implementation-forecast";
import { useEffect, useState } from "react";
import { estimateImplementation, withEstimateQuantity, type EstimateItem } from "@/lib/implementation-estimates";
import { budgetWithRemainder, type BudgetRow } from "@/lib/implementation-planning";
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
  const balance = budgetWithRemainder(budget, rows, hours);
  const remaining = balance?.remainingDays ?? 0;
  const balanced = balance !== null && !balance.overBudget;
  const valid = items.every(item => {
    const row = rows[item.key];
    return row && Number.isFinite(row.days) && row.days >= 0 && (row.quantity === undefined || (Number.isInteger(row.quantity) && row.quantity >= 0 && row.quantity <= 100000));
  });
  const ready = loaded && !busy && canEdit && budget !== null;
  function change(key: string, patch: Partial<BudgetRow>) {
    setRows(previous => ({ ...previous, [key]: { ...(previous[key] ?? { days: 0, started: false }), ...patch } }));
    setDirty(true); setMessage("");
  }
  async function applyStandards() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/implementations/${implementationId}/budget`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.version !== version || data.items.map((item: Item) => item.key).sort().join("|") !== selection) throw new Error("De begroting of werkzaamheden zijn intussen gewijzigd. Vernieuw de pagina.");
      const next = estimateImplementation(data.items, data.budget, rows, data.hoursPerDay);
      setStandards(data.items); setBudget(data.budget); setHours(data.hoursPerDay);
      if (!next.rows || !Object.keys(next.rows).length) throw new Error("Geen verdeling mogelijk. Controleer de standaarduren, aantallen en eventuele handmatig ingevulde uren.");
      setRows(next.rows); setDirty(true);
      setMessage(data.budget === null ? "Standaarduren ingevuld. Het goedgekeurde offertebudget ontbreekt nog; opslaan en budgetcontrole zijn daarom nog niet mogelijk."
        : "Standaarduren ongewijzigd ingevuld. Controleer het verschil met de offerte en sla de begroting op. Extra activiteiten tellen niet mee.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Verdelen mislukt."); }
    finally { setBusy(false); }
  }
  function changeQuantity(key: string, quantity: number) {
    const standard = standards.find(item => item.key === key);
    if (!standard) return;
    setRows(previous => withEstimateQuantity(previous, standard, quantity));
    setDirty(true);
    setMessage(standard.days === null ? "Standaarduren ontbreken voor deze activiteit. Vul de begrote uren zelf in." : "");
  }
  async function save() {
    setBusy(true); setMessage("");
    try {
      const current = Object.fromEntries(items.map(item => [item.key, rows[item.key]]));
      const response = await fetch(`/api/implementations/${implementationId}/budget`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget, version, rows: current, draft: !balanced }),
      });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setRows(current); setVersion(data.version); setAutomatic(false); setDirty(false); setMessage(balanced ? "Urenverdeling opgeslagen." : "Begroting als concept opgeslagen. De begrote uren zijn hoger dan het offertebudget; de prognose wacht op een sluitende begroting.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Opslaan mislukt."); }
    finally { setBusy(false); }
  }
  return <section className="card panel implementation-budget-panel">
    <h2>Urenbudget en voortgang</h2>
    <ImplementationForecastCard implementationId={implementationId} refreshKey={version} />
    <p>{!loaded ? "Dagenbudget laden..." : budget === null
      ? "Het dagenbudget uit de goedgekeurde offerte is niet beschikbaar. Controleer de oorspronkelijke offerte; er wordt geen budget geschat."
      : `Goedgekeurde offerte: ${number(budget)} dagen · ${number(budget * hours)} uur · ${number(hours)} uur per dag`}</p>
    <p>Begrote uren zijn de standaarduren uit Admin → Werkzaamheden maal het aantal. Ze worden niet automatisch verhoogd of verlaagd om op het offertebudget uit te komen. Bij herhaalwerk vul je het aantal in (standaard 1). Je kunt de uren aanpassen en als concept bewaren. De regel ‘Nog te verdelen’ vult het resterende offertebudget automatisch aan. Bij een wijziging van het aantal worden de begrote uren direct herberekend. Alleen akkoord van de klant telt als 100% afgerond.</p>
    <p>Extra activiteiten zijn tekstregels en tellen niet mee in de urenbegroting of gewogen voortgang.</p>
    {loaded && estimate.missing.length > 0 ? <p className="save-status">De bekende standaarduren zijn ingevuld. Voor {estimate.missing.length} werkzaamheden ontbreekt nog een standaardbegroting in Admin → Werkzaamheden.</p> : null}
    {loaded && budget === null ? <p className="save-status">Standaarduren worden alvast getoond. Controle tegen het offertebudget en opslaan zijn pas mogelijk zodra het goedgekeurde dagenbudget beschikbaar is.</p> : null}
    {loaded && estimate.rawDays !== null && items.length > 0 ? <p className="save-status">
      Standaardschatting op basis van de aantallen: <strong>{number(estimate.rawDays * hours)} uur ({number(estimate.rawDays)} dagen)</strong>.
      {budget !== null && estimate.rawDays > budget + 0.0001 ? ` Dit is ${number((estimate.rawDays - budget) * hours)} uur meer dan geoffreerd. Bespreek dit verschil; de verdeling hieronder vergroot het offertebudget niet.` : " De standaarduren worden ongewijzigd overgenomen."}
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
          <td><input className="input" aria-label={`Begrote uren ${item.label}`} type="number" min="0" step="0.01" placeholder="Nog invullen" value={rows[item.key] ? Number((row.days * hours).toFixed(2)) : ""}
            disabled={!ready} onChange={event => change(item.key, { days: Number(event.target.value) / hours })} /></td>
          <td><select aria-label={`Status ${item.label}`} value={approved ? "approved" : row.started ? "started" : "todo"}
            disabled={!ready || approved} onChange={event => change(item.key, { started: event.target.value === "started" })}>
            <option value="todo">Niet begonnen · 0%</option><option value="started">Bezig · 50%</option>{approved ? <option value="approved">Akkoord door klant · 100%</option> : null}
          </select></td>
        </tr>;
      })}
      {loaded && budget !== null ? <tr className="budget-remainder">
        <td><strong>Nog te verdelen</strong><br /><small>Neemt automatisch af als je meer uren begroot.</small></td>
        <td>—</td><td>—</td>
        <td><output aria-label="Nog te verdelen uren"><strong>{number(remaining * hours)} uur</strong></output></td>
        <td>Reserve · telt niet als afgerond werk</td>
      </tr> : null}
    </tbody></table></div>
    {loaded && items.length === 0 ? <p>Selecteer eerst de werkzaamheden voor deze implementatie.</p> : null}
    {budget !== null ? <p>Begrote werkzaamheden: <strong>{number(total * hours)} uur</strong> · Nog te verdelen: <strong>{number(remaining * hours)} uur</strong><br />
      Totaal inclusief reserve: <strong>{number((total + remaining) * hours)} van {number(budget * hours)} uur</strong>.
      {balanced && valid ? " Het budget sluit aan (100%)." : balance?.overBudget ? ` ${number((total - budget) * hours)} uur boven het offertebudget.` : " Vul de ontbrekende begrote uren in."}
    </p> : null}
    <div className="button-row">
      <button type="button" className="secondary-button" disabled={!loaded || !canEdit || busy || !items.length} onClick={() => void applyStandards()}>{busy ? "Bezig…" : "Verdelen volgens standaarden"}</button>
      <button type="button" className="primary-button" disabled={!ready || !valid || !items.length} onClick={() => void save()}>{balanced ? "Urenverdeling opslaan" : "Begroting als concept opslaan"}</button>
    </div>
    <p role="status">{message || (dirty ? "Wijzigingen nog niet opgeslagen." : "")}</p>
  </section>;
}
