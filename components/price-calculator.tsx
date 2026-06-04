"use client";

import { useMemo, useState } from "react";
import { Calculator, CheckCircle2, FileText, Package, SlidersHorizontal, Users } from "lucide-react";
import { MODULES, euro } from "@/lib/pricing";
import { NumberStepper } from "@/components/number-stepper";

type PackageKey = "starter" | "basic" | "premium" | "enterprise";

const packages: Record<
  PackageKey,
  {
    name: string;
    license: number;
    support: number;
    implementation: number;
    includedPaidModules: number;
  }
> = {
  starter: {
    name: "Starter",
    license: 84.35,
    support: 58.3,
    implementation: 2880,
    includedPaidModules: 0,
  },
  basic: {
    name: "Basic",
    license: 117.95,
    support: 74.3,
    implementation: 4320,
    includedPaidModules: 1,
  },
  premium: {
    name: "Premium",
    license: 151.55,
    support: 90.6,
    implementation: 5760,
    includedPaidModules: 2,
  },
  enterprise: {
    name: "Enterprise",
    license: 183.1,
    support: 106.6,
    implementation: 7200,
    includedPaidModules: 3,
  },
};

function getRecommendedPackage(paidModuleCount: number): PackageKey {
  if (paidModuleCount <= 0) return "starter";
  if (paidModuleCount === 1) return "basic";
  if (paidModuleCount === 2) return "premium";
  return "enterprise";
}

export default function PriceCalculator() {
  const [customerName, setCustomerName] = useState("");
  const [contactName, setContactName] = useState("");
  const [quoteTitle, setQuoteTitle] = useState("Prijsvoorstel Smart Trade");
  const [salesName, setSalesName] = useState("Erik");
  const [extraUsers, setExtraUsers] = useState(1);
  const [manualImplementationAdjustment, setManualImplementationAdjustment] = useState(0);
  const [selectedModules, setSelectedModules] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState(
    "Bedragen zijn gebaseerd op het geselecteerde pakket, de gekozen modules en de huidige implementatie-inschatting.",
  );

  const selectedModuleRows = useMemo(
    () => MODULES.filter((module) => selectedModules[module.key]),
    [selectedModules],
  );

  const paidModuleCount = selectedModuleRows.filter((module) => module.monthlyPrice > 0).length;
  const effectivePackage = getRecommendedPackage(paidModuleCount);
  const activePackage = packages[effectivePackage];

  const paidModuleTotal = selectedModuleRows
    .filter((module) => module.monthlyPrice > 0)
    .sort((a, b) => b.monthlyPrice - a.monthlyPrice)
    .slice(activePackage.includedPaidModules)
    .reduce((sum, module) => sum + module.monthlyPrice, 0);

  const totalUsers = 1 + extraUsers;
  const monthlyTotal = activePackage.license + activePackage.support + paidModuleTotal;
  const implementationTotal = activePackage.implementation + manualImplementationAdjustment;

  function toggleModule(key: string) {
    setSelectedModules((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  return (
    <div className="page-shell">
      <div className="container stack-4">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Smart Trade</div>
            <h1>Prijs calculator en offertegenerator</h1>
            <p>Maak automatisch een Smart Trade offerte op basis van pakket, gebruikers en modules.</p>
          </div>

          <div className="brand-actions">
            <span className="status-pill success">PDF-offerte</span>
            <span className="status-pill warning">Versie 10</span>
          </div>
        </header>

        <div className="grid-main">
          <section className="card panel">
            <div className="top-row">
              <div>
                <div className="brand-mark">Sales input</div>
                <h2>Berekening</h2>
                <p className="subtext">Vul alleen de noodzakelijke velden in. De calculator doet de rest.</p>
              </div>
              <div className="icon-badge">
                <Calculator size={26} />
              </div>
            </div>

            <div className="section">
              <div className="section-title">
                <FileText size={16} />
                {" "}Klant en offerte
              </div>

              <div className="field-grid-2">
                <label className="input-wrap">
                  <span className="input-label">Klantnaam</span>
                  <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Bijv. Groenbedrijf Jansen" />
                </label>

                <label className="input-wrap">
                  <span className="input-label">Titel voorstel</span>
                  <input className="input" value={quoteTitle} onChange={(e) => setQuoteTitle(e.target.value)} />
                </label>

                <label className="input-wrap">
                  <span className="input-label">Contactpersoon</span>
                  <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Naam klantcontact" />
                </label>

                <label className="input-wrap">
                  <span className="input-label">Sales consultant</span>
                  <input className="input" value={salesName} onChange={(e) => setSalesName(e.target.value)} />
                </label>
              </div>
            </div>

            <div className="section">
              <div className="section-title">
                <Users size={16} />
                {" "}Basis invoer
              </div>

              <div className="field-grid-2">
                <label className="input-wrap">
                  <span className="input-label">Extra gebruikers</span>
                  <NumberStepper
                    ariaLabel="Extra gebruikers"
                    min={0}
                    value={extraUsers}
                    onChange={(nextValue) => setExtraUsers(Math.max(0, Math.floor(nextValue)))}
                  />
                </label>

                <label className="input-wrap">
                  <span className="input-label">Correctie implementatie (€)</span>
                  <NumberStepper
                    ariaLabel="Correctie implementatie"
                    value={manualImplementationAdjustment}
                    onChange={setManualImplementationAdjustment}
                  />
                </label>
              </div>
            </div>

            <div className="section">
              <div className="section-title">
                <Package size={16} />
                {" "}Pakket automatisch gekozen
              </div>

              <div className="package-grid">
                {(Object.keys(packages) as PackageKey[]).map((key) => (
                  <div key={key} className={`package-button ${effectivePackage === key ? "active" : ""}`}>
                    <div className="package-header">
                      <div>
                        <div className="package-name">{packages[key].name}</div>
                        <div className="subtext">{packages[key].includedPaidModules} betaalde modules inbegrepen</div>
                      </div>
                      {effectivePackage === key ? <CheckCircle2 size={18} /> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="section">
              <div className="section-title">
                <CheckCircle2 size={16} />
                {" "}Support
              </div>

              <div className="soft-card">
                <div className="summary-list">
                  <div><span>Gekozen support-niveau</span>{" "}<strong>{activePackage.name}</strong></div>
                  <div><span>Support tarief p/m</span>{" "}<strong>{euro.format(activePackage.support)}</strong></div>
                  <div><span>Toelichting</span>{" "}<strong>Support is gekoppeld aan het automatisch gekozen pakket.</strong></div>
                </div>
              </div>
            </div>

            <div className="section">
              <div className="section-title">
                <SlidersHorizontal size={16} />
                {" "}Modules aan/uit
              </div>

              <div className="module-grid">
                {MODULES.map((module) => {
                  const active = Boolean(selectedModules[module.key]);

                  return (
                    <label key={module.key} className={`module-list-row ${active ? "active" : ""}`}>
                      <input type="checkbox" checked={active} onChange={() => toggleModule(module.key)} />
                      <div className="module-list-main">
                        <span className="module-list-title">{module.name}</span>
                        <span className="module-list-price">{euro.format(module.monthlyPrice)} p/m</span>
                      </div>
                      <span className="module-list-state">{active ? "Aan" : "Uit"}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="stack-4">
            <div className="card panel">
              <div className="top-row">
                <div>
                  <div className="brand-mark">Actieve berekening</div>
                  <h2>{activePackage.name}</h2>
                </div>
                <span className="status-pill success">Automatisch pakket: {packages[effectivePackage].name}</span>
              </div>

              <div className="kpi-grid">
                <div className="stat-card">
                  <div className="kpi-title">Licentie p/m</div>
                  <div className="kpi-value">{euro.format(activePackage.license)}</div>
                </div>
                <div className="stat-card">
                  <div className="kpi-title">Support p/m</div>
                  <div className="kpi-value">{euro.format(activePackage.support)}</div>
                </div>
                <div className="stat-card">
                  <div className="kpi-title">Modules p/m</div>
                  <div className="kpi-value">{euro.format(paidModuleTotal)}</div>
                </div>
                <div className="stat-card">
                  <div className="kpi-title">Maandprijs</div>
                  <div className="kpi-value">{euro.format(monthlyTotal)}</div>
                </div>
              </div>

              <div className="proposal-grid">
                <div className="soft-card">
                  <div className="section-title">Samenvatting prijsopbouw</div>
                  <div className="summary-list">
                    <div><span>Licentie p/m</span>{" "}<strong>{euro.format(activePackage.license)}</strong></div>
                    <div><span>Support p/m</span>{" "}<strong>{euro.format(activePackage.support)}</strong></div>
                    <div><span>Modules p/m</span>{" "}<strong>{euro.format(paidModuleTotal)}</strong></div>
                    <div className="total-row"><span>Maandprijs</span>{" "}<strong>{euro.format(monthlyTotal)}</strong></div>
                    <div><span>Implementatie basis</span>{" "}<strong>{euro.format(activePackage.implementation)}</strong></div>
                    <div><span>Correctie implementatie</span>{" "}<strong>{euro.format(manualImplementationAdjustment)}</strong></div>
                  </div>
                </div>

                <div className="quote-preview-card">
                  <div className="quote-preview-header">
                    <div>
                      <div className="quote-kicker">Offerte preview</div>
                      <div className="quote-title">{quoteTitle}</div>
                    </div>
                    <span className="status-pill success">{activePackage.name}</span>
                  </div>

                  <div className="quote-customer-line">
                    <strong>{customerName || "Nog geen klant ingevuld"}</strong>
                    <span>{contactName || "Geen contactpersoon"}</span>
                  </div>

                  <div className="quote-price-strip">
                    <div>
                      <span>Maandprijs</span>
                      <strong>{euro.format(monthlyTotal)} p/m</strong>
                    </div>
                    <div>
                      <span>Implementatie</span>
                      <strong>{euro.format(implementationTotal)}</strong>
                    </div>
                  </div>

                  <div className="quote-facts">
                    <div><span>Gebruikers</span>{" "}<strong>{totalUsers}</strong></div>
                    <div><span>Pakket</span>{" "}<strong>{activePackage.name}</strong></div>
                    <div><span>Modules</span>{" "}<strong>{selectedModuleRows.length}</strong></div>
                    <div><span>BTW</span>{" "}<strong>Excl.</strong></div>
                  </div>
                </div>
              </div>

              <label className="input-wrap section">
                <span className="input-label">Opmerkingen voor voorstel</span>
                <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>

              <div className="button-row">
                <button type="button" className="primary-button">Exporteer PDF</button>
                <button type="button" className="secondary-button">Opslaan in Supabase</button>
              </div>
            </div>

          </section>
        </div>
      </div>
    </div>
  );
}
