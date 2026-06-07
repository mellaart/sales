"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Boxes,
  Calculator,
  CheckCircle2,
  CloudUpload,
  Download,
  FileText,
  LifeBuoy,
  Package,
  SlidersHorizontal,
  Users,
  WalletCards,
} from "lucide-react";
import {
  calculatePricing,
  euro,
  getPaidSelectedModuleCount,
  type PackageConfig,
} from "@/lib/pricing";
import type { SmartConnectPriceTier } from "@/lib/price-config";
import { getUserDisplayName } from "@/lib/supabase";
import { NumberStepper } from "@/components/number-stepper";
import { useAuth } from "@/components/auth-provider";
import { usePricingConfig } from "@/components/pricing-provider";

function getCalculatorPackageForPaidModules(paidModuleCount: number, calculatorPackages: PackageConfig[]) {
  return calculatorPackages.find((packageConfig) => paidModuleCount <= packageConfig.includedModules)
    ?? calculatorPackages[calculatorPackages.length - 1];
}

function formatConnectionCount(count: number) {
  return count === 1 ? "1 connectie" : `${count} connecties`;
}

function getSmartConnectPricing(
  connectionCount: number,
  tiers: SmartConnectPriceTier[],
  extraConnectionPrice: number,
) {
  const safeConnectionCount = Math.max(0, Math.floor(connectionCount));

  if (safeConnectionCount === 0) {
    return {
      connectionCount: 0,
      baseTier: null,
      extraConnections: 0,
      extraMonthly: 0,
      monthlyTotal: 0,
    };
  }

  const baseTier = tiers.find((tier) => safeConnectionCount <= tier.connections)
    ?? tiers[tiers.length - 1];
  const extraConnections = Math.max(0, safeConnectionCount - tiers[tiers.length - 1].connections);
  const extraMonthly = extraConnections * extraConnectionPrice;

  return {
    connectionCount: safeConnectionCount,
    baseTier,
    extraConnections,
    extraMonthly,
    monthlyTotal: baseTier.monthlyPrice + extraMonthly,
  };
}

export default function PriceCalculator() {
  const { user, profile } = useAuth();
  const { pricingConfig } = usePricingConfig();
  const modules = pricingConfig.modules;
  const calculatorPackages = useMemo(
    () => pricingConfig.packages.filter((packageConfig) => packageConfig.key !== "lite"),
    [pricingConfig.packages],
  );
  const [customerName, setCustomerName] = useState("");
  const [contactName, setContactName] = useState("");
  const [quoteTitle, setQuoteTitle] = useState("Prijsvoorstel Smart Trade");
  const [salesName, setSalesName] = useState("");
  const [extraUsers, setExtraUsers] = useState(1);
  const [manualImplementationAdjustment, setManualImplementationAdjustment] = useState(0);
  const [includeSupport, setIncludeSupport] = useState(true);
  const [selectedCustomerPortalOptionKeys, setSelectedCustomerPortalOptionKeys] = useState<string[]>([]);
  const [smartConnectConnections, setSmartConnectConnections] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(modules.map((module) => [module.key, 0])),
  );
  const [notes, setNotes] = useState(
    "Bedragen zijn gebaseerd op het automatisch gekozen pakket, support, gekozen modules, uitbreidingen en de huidige implementatie-inschatting.",
  );

  const currentSalesName = useMemo(() => getUserDisplayName(user, profile), [profile, user]);

  useEffect(() => {
    if (currentSalesName && !salesName) {
      setSalesName(currentSalesName);
    }
  }, [currentSalesName, salesName]);

  const selectedModuleRows = useMemo(
    () =>
      modules.filter((module) => (quantities[module.key] ?? 0) > 0).map((module) => ({
        ...module,
        qty: quantities[module.key] ?? 0,
        total: module.monthlyPrice * (quantities[module.key] ?? 0),
      })),
    [modules, quantities],
  );

  const paidModuleCount = getPaidSelectedModuleCount(quantities, modules);
  const recommendedPackage = getCalculatorPackageForPaidModules(paidModuleCount, calculatorPackages);
  const pricingResults = useMemo(
    () => calculatePricing({ extraUsers, manualImplementationAdjustment, quantities }, pricingConfig),
    [extraUsers, manualImplementationAdjustment, pricingConfig, quantities],
  );
  const activeResult = pricingResults.find((result) => result.key === recommendedPackage.key) ?? pricingResults[0];
  const totalUsers = extraUsers + 1;
  const selectedCustomerPortalOptions = useMemo(
    () => pricingConfig.customerPortalOptions.filter((option) => selectedCustomerPortalOptionKeys.includes(option.key)),
    [pricingConfig.customerPortalOptions, selectedCustomerPortalOptionKeys],
  );
  const smartConnectPricing = useMemo(
    () => getSmartConnectPricing(
      smartConnectConnections,
      pricingConfig.smartConnectTiers,
      pricingConfig.smartConnectExtraConnectionPrice,
    ),
    [pricingConfig.smartConnectExtraConnectionPrice, pricingConfig.smartConnectTiers, smartConnectConnections],
  );
  const supportMonthly = includeSupport ? activeResult.supportMonthly : 0;
  const customerPortalMonthlyTotal = selectedCustomerPortalOptions.reduce((sum, option) => sum + option.monthlyPrice, 0);
  const expansionMonthlyTotal = customerPortalMonthlyTotal + smartConnectPricing.monthlyTotal;
  const monthlyTotal = Math.max(0, activeResult.monthlyAfterDiscount - activeResult.supportMonthly + supportMonthly + expansionMonthlyTotal);
  const selectedExpansionCount = selectedCustomerPortalOptions.length + (smartConnectPricing.connectionCount > 0 ? 1 : 0);

  function setModuleChecked(moduleKey: string, checked: boolean) {
    setQuantities((currentQuantities) => ({
      ...currentQuantities,
      [moduleKey]: checked ? 1 : 0,
    }));
  }

  function toggleCustomerPortalOption(optionKey: string, checked: boolean) {
    setSelectedCustomerPortalOptionKeys((currentKeys) => {
      if (checked) {
        return currentKeys.includes(optionKey) ? currentKeys : [...currentKeys, optionKey];
      }

      return currentKeys.filter((key) => key !== optionKey);
    });
  }

  return (
    <div className="page-shell">
      <div className="container calculator-page">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Smart Trade</div>
            <h1>Calculator</h1>
            <p>Maak een Smart Trade berekening met dezelfde rustige opbouw als dashboard en deals.</p>
          </div>

          <div className="brand-actions">
            <Link href="/deals" className="secondary-button"><FileText size={16} /> Deals</Link>
            <span className="status-pill success">Live berekening</span>
          </div>
        </header>

        <section className="deals-stat-grid">
          <article className="deals-stat">
            <div className="stat-icon"><WalletCards size={18} /></div>
            <div>
              <span>Maandprijs</span>
              <strong>{euro.format(monthlyTotal)}</strong>
            </div>
          </article>
          <article className="deals-stat">
            <div className="stat-icon"><Package size={18} /></div>
            <div>
              <span>Pakket</span>
              <strong>{activeResult.name}</strong>
            </div>
          </article>
          <article className="deals-stat">
            <div className="stat-icon"><Users size={18} /></div>
            <div>
              <span>Gebruikers</span>
              <strong>{totalUsers}</strong>
            </div>
          </article>
          <article className="deals-stat">
            <div className="stat-icon"><BarChart3 size={18} /></div>
            <div>
              <span>Implementatie</span>
              <strong>{euro.format(activeResult.implementationAfterAdjustment)}</strong>
            </div>
          </article>
        </section>

        <section className="dashboard-action-grid">
          <div className="dashboard-action-card">
            <div className="stat-icon"><Package size={18} /></div>
            <div>
              <strong>{activeResult.name}</strong>
              <span>{activeResult.includedModules} betaalde modules inbegrepen</span>
            </div>
          </div>
          <div className="dashboard-action-card">
            <div className="stat-icon"><SlidersHorizontal size={18} /></div>
            <div>
              <strong>{selectedModuleRows.length} modules aan</strong>
              <span>{euro.format(activeResult.moduleMonthly)} modulebedrag per maand</span>
            </div>
          </div>
          <div className="dashboard-action-card">
            <div className="stat-icon"><Boxes size={18} /></div>
            <div>
              <strong>{includeSupport ? "Support aan" : "Support uit"}</strong>
              <span>{selectedExpansionCount} extra opties · {euro.format(expansionMonthlyTotal)} p/m</span>
            </div>
          </div>
        </section>

        <div className="calculator-workspace">
          <section className="card panel">
            <div className="top-row">
              <div>
                <div className="eyebrow">Invoer</div>
                <h2 className="headline">Offertegegevens</h2>
                <div className="subtext">Vul klant, gebruikers en modules in. Het pakket wordt automatisch gekozen.</div>
              </div>
              <span className="status-pill warning">Calculator</span>
            </div>

            <div className="section">
              <div className="section-title"><FileText size={16} /> Klant en offerte</div>
              <div className="field-grid-2">
                <label className="input-wrap">
                  <span className="input-label">Klantnaam</span>
                  <input className="input" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Bijv. Groenbedrijf Jansen" />
                </label>
                <label className="input-wrap">
                  <span className="input-label">Titel voorstel</span>
                  <input className="input" value={quoteTitle} onChange={(event) => setQuoteTitle(event.target.value)} />
                </label>
                <label className="input-wrap">
                  <span className="input-label">Contactpersoon</span>
                  <input className="input" value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Naam klantcontact" />
                </label>
                <label className="input-wrap">
                  <span className="input-label">Sales consultant</span>
                  <input className="input" value={salesName} onChange={(event) => setSalesName(event.target.value)} />
                </label>
              </div>
            </div>

            <div className="section">
              <div className="section-title"><Users size={16} /> Basis invoer</div>
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
              <div className="section-title"><LifeBuoy size={16} /> Support</div>
              <div className="calculator-module-grid">
                <label className={`calculator-module-card ${includeSupport ? "active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={includeSupport}
                    onChange={(event) => setIncludeSupport(event.target.checked)}
                  />
                  <span className="calculator-module-main">
                    <strong>Supportcontract Smart Trade {activeResult.name}</strong>
                    <span>{euro.format(activeResult.supportMonthly)} p/m voor {totalUsers} gebruikers</span>
                  </span>
                  <span className="calculator-module-state">{includeSupport ? "Aan" : "Uit"}</span>
                </label>
              </div>
            </div>

            <div className="section">
              <div className="section-title"><Boxes size={16} /> Klantportaal</div>
              <div className="calculator-module-grid">
                {pricingConfig.customerPortalOptions.map((option) => {
                  const active = selectedCustomerPortalOptionKeys.includes(option.key);

                  return (
                    <label key={option.key} className={`calculator-module-card ${active ? "active" : ""}`}>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(event) => toggleCustomerPortalOption(option.key, event.target.checked)}
                      />
                      <span className="calculator-module-main">
                        <strong>{option.name}</strong>
                        <span>{euro.format(option.monthlyPrice)} p/m</span>
                      </span>
                      <span className="calculator-module-state">{active ? "Aan" : "Uit"}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="section">
              <div className="section-title"><Calculator size={16} /> Smart Connect</div>
              <div className="field-grid-2">
                <label className="input-wrap">
                  <span className="input-label">Connecties</span>
                  <NumberStepper
                    ariaLabel="Smart Connect connecties"
                    min={0}
                    value={smartConnectConnections}
                    onChange={(nextValue) => setSmartConnectConnections(Math.max(0, Math.floor(nextValue)))}
                  />
                </label>

                <div className="input-wrap">
                  <span className="input-label">Prijs</span>
                  <div className="summary-list">
                    <div><span>Aantal</span><strong>{formatConnectionCount(smartConnectPricing.connectionCount)}</strong></div>
                    {smartConnectPricing.baseTier ? (
                      <div>
                        <span>Staffel {formatConnectionCount(smartConnectPricing.baseTier.connections)}</span>
                        <strong>{euro.format(smartConnectPricing.baseTier.monthlyPrice)} p/m</strong>
                      </div>
                    ) : null}
                    {smartConnectPricing.extraConnections > 0 ? (
                      <div>
                        <span>{smartConnectPricing.extraConnections} extra connecties</span>
                        <strong>{euro.format(smartConnectPricing.extraMonthly)} p/m</strong>
                      </div>
                    ) : null}
                    <div className="total-row"><span>Smart Connect</span><strong>{euro.format(smartConnectPricing.monthlyTotal)} p/m</strong></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="section">
              <div className="section-title"><Package size={16} /> Pakket automatisch gekozen</div>
              <div className="calculator-package-grid">
                {calculatorPackages.map((packageConfig) => {
                  const active = packageConfig.key === activeResult.key;

                  return (
                    <div key={packageConfig.key} className={`package-button ${active ? "active" : ""}`}>
                      <div className="package-header">
                        <div>
                          <div className="package-name">{packageConfig.name}</div>
                          <div className="subtext">{packageConfig.includedModules} betaalde modules inbegrepen</div>
                        </div>
                        {active ? <CheckCircle2 size={18} /> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="section">
              <div className="section-title"><SlidersHorizontal size={16} /> Modules aan/uit</div>
              <div className="calculator-module-grid">
                {modules.map((module) => {
                  const active = (quantities[module.key] ?? 0) > 0;

                  return (
                    <label key={module.key} className={`calculator-module-card ${active ? "active" : ""}`}>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(event) => setModuleChecked(module.key, event.target.checked)}
                      />
                      <span className="calculator-module-main">
                        <strong>{module.name}</strong>
                        <span>{euro.format(module.monthlyPrice)} p/m</span>
                      </span>
                      <span className="calculator-module-state">{active ? "Aan" : "Uit"}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="deals-results card panel">
            <div className="top-row">
              <div>
                <div className="eyebrow">Resultaat</div>
                <h2 className="headline">{activeResult.name}</h2>
              </div>
              <span className="status-pill success">Automatisch pakket</span>
            </div>

            <div className="stats-grid">
              <div className="soft-card"><div className="kpi-title">Licentie p/m</div><div className="big-number">{euro.format(activeResult.licenseMonthly)}</div></div>
              <div className="soft-card"><div className="kpi-title">Support p/m</div><div className="big-number">{euro.format(supportMonthly)}</div></div>
              <div className="soft-card"><div className="kpi-title">Modules p/m</div><div className="big-number">{euro.format(activeResult.moduleMonthly)}</div></div>
              <div className="soft-card"><div className="kpi-title">Uitbreidingen p/m</div><div className="big-number">{euro.format(expansionMonthlyTotal)}</div></div>
            </div>

            <div className="proposal-grid">
              <div className="soft-card">
                <div className="section-title"><FileText size={16} /> Prijsopbouw</div>
                <div className="summary-list">
                  <div><span>Licentie p/m</span><strong>{euro.format(activeResult.licenseMonthly)}</strong></div>
                  <div><span>Support p/m</span><strong>{euro.format(supportMonthly)}</strong></div>
                  <div><span>Modules p/m</span><strong>{euro.format(activeResult.moduleMonthly)}</strong></div>
                  {customerPortalMonthlyTotal > 0 ? (
                    <div><span>Klantportaal p/m</span><strong>{euro.format(customerPortalMonthlyTotal)}</strong></div>
                  ) : null}
                  {smartConnectPricing.monthlyTotal > 0 ? (
                    <div><span>Smart Connect p/m</span><strong>{euro.format(smartConnectPricing.monthlyTotal)}</strong></div>
                  ) : null}
                  <div className="total-row"><span>Maandprijs</span><strong>{euro.format(monthlyTotal)}</strong></div>
                  <div><span>Implementatie basis</span><strong>{euro.format(activeResult.implementationBase)}</strong></div>
                  <div><span>Correctie implementatie</span><strong>{euro.format(manualImplementationAdjustment)}</strong></div>
                </div>
              </div>

              <div className="proposal-card">
                <div className="proposal-brand">Offerte preview</div>
                <div className="proposal-title">{quoteTitle || "Prijsvoorstel"}</div>
                <div className="proposal-meta">{customerName || "Nog geen klant ingevuld"} · {contactName || "Geen contactpersoon"}</div>
                <div className="proposal-total">{euro.format(monthlyTotal)} p/m</div>
                <div className="proposal-sub">Setup: {euro.format(activeResult.implementationAfterAdjustment)} · {totalUsers} gebruikers · {includeSupport ? "met support" : "zonder support"} · {selectedExpansionCount} uitbreidingen</div>
              </div>
            </div>

            <div className="section">
              <label className="input-wrap">
                <span className="input-label">Opmerkingen voor voorstel</span>
                <textarea className="textarea" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>
            </div>

            <div className="button-row">
              <button type="button" className="primary-button"><Download size={16} /> Exporteer PDF</button>
              <button type="button" className="secondary-button"><CloudUpload size={16} /> Opslaan in Supabase</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
