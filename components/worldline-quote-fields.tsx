"use client";

import { NumberStepper } from "@/components/number-stepper";
import { euro } from "@/lib/pricing";
import { getAssetExpansionTotals } from "@/lib/asset-expansions";
import { getWorldlineQuoteLines, isWorldlineQuoteValid, type WorldlineQuote } from "@/lib/worldline-quote";
import styles from "./assets-dashboard.module.css";

export function WorldlineQuoteFields({ value, onChange }: { value: WorldlineQuote; onChange: (value: WorldlineQuote) => void }) {
  const totals = getAssetExpansionTotals(getWorldlineQuoteLines(value));
  const fields = [
    ["product", "Product"], ["productPrice", "Prijs apparaat per stuk (€)"],
    ["setupPrice", "Setupkosten plug & play per stuk (€)"],
    ["serviceLabel", "Omschrijving jaarlijkse servicekosten"], ["annualPrice", "Servicekosten per apparaat per jaar (€)"],
  ] as const;
  return <section className="card panel">
    <div className="eyebrow">Worldline offerte</div>
    <h2 className="headline">Producten en servicekosten</h2>
    <p className="subtext">Bedragen uit het aangeleverde RX5000-voorbeeld, exclusief btw. Controleer en pas de prijzen en tarieven aan voor deze offerte.</p>
    <div className={styles.moduleSelectionSummary}>
      <label className="input-wrap"><span className="input-label">Aantal apparaten</span><NumberStepper ariaLabel="Aantal Worldline apparaten" min={1} max={1000} value={value.quantity} onChange={quantity => onChange({ ...value, quantity: Math.floor(quantity) })} /></label>
      {fields.map(([key, label]) => <label className="input-wrap" key={key}>
        <span className="input-label">{label}</span>
        <input className="input" value={value[key]} inputMode={key.endsWith("Price") ? "decimal" : "text"} onChange={event => onChange({ ...value, [key]: event.target.value })} />
      </label>)}
    </div>
    <div className={styles.quoteTotal}><span>Producten en setup eenmalig via Troublefree</span><strong>{euro.format(totals.once)}</strong></div>
    <div className={styles.quoteTotal}><span>Servicekosten jaarlijks via Troublefree</span><strong>{euro.format(totals.annual)}</strong></div>
    <label className="input-wrap"><span><input type="checkbox" checked={value.includeContract} onChange={event => onChange({ ...value, includeContract: event.target.checked })} /> Met PIN-contract via Worldline</span></label>
    {value.includeContract ? <>
      <label className="input-wrap"><span className="input-label">Service Fee Compliancy per jaar, voor 1 pincontract (€)</span><input className="input" inputMode="decimal" value={value.compliancePrice} onChange={event => onChange({ ...value, compliancePrice: event.target.value })} /></label>
      <p className="subtext">Worldline factureert deze fee en transactiekosten rechtstreeks. Ze vallen buiten de Troublefree-totalen.</p>
      <label className="input-wrap"><span className="input-label">Transactietarieven</span><textarea className="textarea" rows={7} value={value.transactionRates} onChange={event => onChange({ ...value, transactionRates: event.target.value })} /></label>
    </> : <p className="subtext">Het transactiecontract en de bijbehorende kosten zijn niet inbegrepen.</p>}
    <p className="subtext">De offerte bevat ook het advies voor een optionele halve dag consultancy op locatie, met prijs op aanvraag.</p>
    {!isWorldlineQuoteValid(value) ? <p role="alert">Vul alle omschrijvingen en geldige bedragen in (maximaal twee decimalen). Kies 1 tot 1000 apparaten.</p> : null}
  </section>;
}
