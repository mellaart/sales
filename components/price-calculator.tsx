"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Boxes,
  Calculator,
  CheckCircle2,
  CloudUpload,
  Code2,
  Download,
  FileText,
  LifeBuoy,
  MapPin,
  Package,
  SlidersHorizontal,
  Users,
  WalletCards,
} from "lucide-react";
import { createDealWithFallback } from "@/lib/deal-storage";
import { exportQuotePdf } from "@/lib/pdf";
import {
  calculatePricing,
  euro,
  getPaidSelectedModuleCount,
  type PackageConfig,
  type PricingResult,
} from "@/lib/pricing";
import { getTravelCostQuoteForPostcode, normalizePostcodePrefix, type SmartConnectPriceTier } from "@/lib/price-config";
import { getSupabaseClient, getUserDisplayName } from "@/lib/supabase";
import { NumberStepper } from "@/components/number-stepper";
import DevelopmentLinesEditor from "@/components/development-lines-editor";
import ExtraUserOffer from "@/components/extra-user-offer";
import { useAuth } from "@/components/auth-provider";
import { usePricingConfig } from "@/components/pricing-provider";
import {
  formatDevelopmentHours,
  getDevelopmentHours,
  getDevelopmentTotal,
  normalizeDevelopmentLines,
  type DevelopmentLine,
} from "@/lib/development-lines";

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

function withDealSaveTimeout<T>(promise: Promise<T>) {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => {
        resolve({ error: "Opslaan duurt te lang. Controleer je verbinding en probeer opnieuw." } as T);
      }, 15000);
    }),
  ]);
}

function getCalculatorPdfResult(
  result: PricingResult,
  supportMonthly: number,
  monthlyTotal: number,
  includeSupport: boolean,
  implementationTotal: number,
  oneTimeTotal: number,
) {
  return {
    ...result,
    supportFirst: includeSupport ? result.supportFirst : 0,
    supportExtra: includeSupport ? result.supportExtra : 0,
    supportMonthly,
    monthlyBase: monthlyTotal,
    monthlyAfterDiscount: monthlyTotal,
    recurringTotalContract: monthlyTotal,
    implementationAfterAdjustment: implementationTotal,
    contractValue: monthlyTotal * 12 + oneTimeTotal,
    annualRecurring: monthlyTotal * 12,
    monthlyInclVat: monthlyTotal * result.vatMultiplier,
    implementationInclVat: implementationTotal * result.vatMultiplier,
    contractValueInclVat: (monthlyTotal * 12 + oneTimeTotal) * result.vatMultiplier,
  };
}

function formatDays(days: number) {
  const roundedDays = Math.round(days * 100) / 100;
  const label = roundedDays === 1 ? "dag" : "dagen";
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(roundedDays)} ${label}`;
}

export default function PriceCalculator() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { pricingConfig } = usePricingConfig();
  const supabase = getSupabaseClient();
  const modules = pricingConfig.modules;
  const calculatorPackages = useMemo(
    () => pricingConfig.packages.filter((packageConfig) => packageConfig.key !== "lite"),
    [pricingConfig.packages],
  );
  const [customerName, setCustomerName] = useState("");
  const [customerPostcode, setCustomerPostcode] = useState("");
  const [contactName, setContactName] = useState("");
  const [quoteTitle, setQuoteTitle] = useState("Prijsvoorstel Smart Trade");
  const [salesName, setSalesName] = useState("");
  const [extraUsers, setExtraUsers] = useState(1);
  const [chauffeurExtraUsers, setChauffeurExtraUsers] = useState(0);
  const [planningAppUsers, setPlanningAppUsers] = useState(0);
  const [selectedPackage, setSelectedPackage] = useState("starter");
  const [manualImplementationAdjustment, setManualImplementationAdjustment] = useState(0);
  const [includeTravelCosts, setIncludeTravelCosts] = useState(true);
  const [travelPostcodePrefix, setTravelPostcodePrefix] = useState("");
  const [includeSupport, setIncludeSupport] = useState(true);
  const [selectedCustomerPortalOptionKeys, setSelectedCustomerPortalOptionKeys] = useState<string[]>([]);
  const [smartConnectConnections, setSmartConnectConnections] = useState(0);
  const [developmentLines, setDevelopmentLines] = useState<DevelopmentLine[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(modules.map((module) => [module.key, 0])),
  );
  const [notes, setNotes] = useState(
    "Bedragen zijn gebaseerd op het gekozen pakket, support, gekozen modules, uitbreidingen en de huidige implementatie-inschatting.",
  );
  const [savingDeal, setSavingDeal] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [status, setStatus] = useState("");

  const currentSalesName = useMemo(() => getUserDisplayName(user, profile), [profile, user]);
  const currentSalesEmail = useMemo(() => user?.email ?? profile?.email ?? "", [profile, user]);
  const currentSalesTitle = profile?.job_title ?? "";
  const currentSalesWorkdays = profile?.workdays ?? "";
  const currentSalesPhone = profile?.mobile_phone ?? "";

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
  const selectedPackageIndex = calculatorPackages.findIndex((packageConfig) => packageConfig.key === selectedPackage);
  const recommendedPackageIndex = calculatorPackages.findIndex((packageConfig) => packageConfig.key === recommendedPackage.key);
  const activePackage = calculatorPackages[
    Math.max(selectedPackageIndex, recommendedPackageIndex, 0)
  ] ?? recommendedPackage;
  const smartTradeExtraUsers = extraUsers + chauffeurExtraUsers;
  const pricingResults = useMemo(
    () => calculatePricing({ extraUsers: smartTradeExtraUsers, manualImplementationAdjustment, quantities }, pricingConfig),
    [manualImplementationAdjustment, pricingConfig, quantities, smartTradeExtraUsers],
  );
  const activeResult = pricingResults.find((result) => result.key === activePackage.key) ?? pricingResults[0];
  const packageWasManuallyRaised = selectedPackageIndex > recommendedPackageIndex;
  const totalUsers = smartTradeExtraUsers + 1;
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
  const planningAppMonthlyTotal = planningAppUsers * pricingConfig.planningAppUserMonthly;
  const licenseWithModulesMonthly = activeResult.licenseMonthly + activeResult.moduleMonthly + planningAppMonthlyTotal;
  const customerPortalMonthlyTotal = selectedCustomerPortalOptions.reduce((sum, option) => sum + option.monthlyPrice, 0);
  const expansionMonthlyTotal = customerPortalMonthlyTotal + smartConnectPricing.monthlyTotal;
  const monthlyTotal = Math.max(
    0,
    activeResult.monthlyAfterDiscount
      - activeResult.supportMonthly
      + supportMonthly
      + expansionMonthlyTotal
      + planningAppMonthlyTotal,
  );
  const implementationDays = pricingConfig.implementationDayRate > 0
    ? Math.max(0, activeResult.implementationAfterAdjustment / pricingConfig.implementationDayRate)
    : 0;
  const travelImplementationDays = pricingConfig.implementationDayRate > 0
    ? Math.max(0, activeResult.travelEligibleImplementationAfterAdjustment / pricingConfig.implementationDayRate)
    : 0;
  const travelCostQuote = useMemo(
    () => getTravelCostQuoteForPostcode(pricingConfig, travelPostcodePrefix),
    [pricingConfig, travelPostcodePrefix],
  );
  const travelCostTotal = includeTravelCosts && travelCostQuote
    ? travelImplementationDays * travelCostQuote.pricePerDay
    : 0;
  const implementationTotal = activeResult.implementationAfterAdjustment + travelCostTotal;
  const developmentHourlyRate = pricingConfig.developmentHourlyRate;
  const developmentHours = getDevelopmentHours(developmentLines);
  const developmentTotal = getDevelopmentTotal(developmentLines, developmentHourlyRate);
  const oneTimeTotal = implementationTotal + developmentTotal;
  const selectedExpansionCount = selectedCustomerPortalOptions.length + (smartConnectPricing.connectionCount > 0 ? 1 : 0);
  const extraMonthlyRows = useMemo(() => {
    const rows = selectedCustomerPortalOptions.map((option) => ({
      amount: "1x",
      description: `Smart Trade - ${option.name}`,
      price: option.monthlyPrice,
      total: option.monthlyPrice,
    }));

    if (smartConnectPricing.baseTier) {
      rows.push({
        amount: "1x",
        description: `Smart Connect - ${formatConnectionCount(smartConnectPricing.baseTier.connections)}`,
        price: smartConnectPricing.baseTier.monthlyPrice,
        total: smartConnectPricing.baseTier.monthlyPrice,
      });
    }

    if (smartConnectPricing.extraConnections > 0) {
      rows.push({
        amount: `${smartConnectPricing.extraConnections}x`,
        description: "Smart Connect extra connectie",
        price: pricingConfig.smartConnectExtraConnectionPrice,
        total: smartConnectPricing.extraMonthly,
      });
    }

    return rows;
  }, [pricingConfig.smartConnectExtraConnectionPrice, selectedCustomerPortalOptions, smartConnectPricing]);
  const pdfResult = useMemo(
    () => getCalculatorPdfResult(
      activeResult,
      supportMonthly,
      monthlyTotal,
      includeSupport,
      implementationTotal,
      oneTimeTotal,
    ),
    [activeResult, implementationTotal, includeSupport, monthlyTotal, oneTimeTotal, supportMonthly],
  );

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

  function handleCustomerPostcodeChange(value: string) {
    const nextPostcode = value.toUpperCase();
    setCustomerPostcode(nextPostcode);
    setTravelPostcodePrefix(normalizePostcodePrefix(nextPostcode));
  }

  async function handleSaveCalculation() {
    if (!user) {
      setStatus("Je moet ingelogd zijn om deze berekening op te slaan.");
      return;
    }

    setSavingDeal(true);
    setStatus("Berekening wordt opgeslagen...");

    try {
      const payload = {
        user_id: user.id,
        customer_name: customerName.trim() || null,
        quote_title: quoteTitle.trim() || "Prijsvoorstel Smart Trade",
        contact_name: contactName.trim() || null,
        sales_name: salesName.trim() || currentSalesName || null,
        package_key: activeResult.key,
        package_name: activeResult.name,
        total_users: totalUsers,
        contract_months: 1,
        discount_pct: 0,
        include_vat: false,
        manual_monthly_adjustment: 0,
        manual_implementation_adjustment: manualImplementationAdjustment,
        monthly_base: monthlyTotal,
        monthly_total: monthlyTotal,
        implementation_total: implementationTotal,
        contract_value: monthlyTotal * 12 + oneTimeTotal,
        annual_recurring: monthlyTotal * 12,
        modules: selectedModuleRows,
        notes: notes.trim() || null,
        calculator_inputs: {
          extraUsers,
          chauffeurExtraUsers,
          planningAppUsers,
          selectedPackage: activeResult.key,
          manualImplementationAdjustment,
          includeVat: false,
          includeSupport,
          includeTravelCosts,
          customerPostcode: customerPostcode.trim(),
          travelPostcodePrefix,
          travelCostPerDay: travelCostQuote?.pricePerDay ?? 0,
          travelCostTotal,
          travelRegion: travelCostQuote?.postcodeRow?.region ?? null,
          customerPortalOptionKeys: selectedCustomerPortalOptionKeys,
          customerPortalOptions: selectedCustomerPortalOptions.map((option) => ({
            key: option.key,
            name: option.name,
            monthlyPrice: option.monthlyPrice,
          })),
          smartConnectConnections,
          smartConnectPricing,
          developmentLines: normalizeDevelopmentLines(developmentLines),
          developmentHourlyRate,
          quantities,
          quoteLayout: "standard" as const,
          assetsExpansion: null,
        },
      };

      const result = await withDealSaveTimeout(createDealWithFallback(supabase, payload));

      if (result.error || !result.deal?.id) {
        setStatus(`Opslaan mislukt: ${result.error ?? "Geen deal aangemaakt."}`);
        return;
      }

      setStatus(result.warning ?? "Berekening opgeslagen als deal.");
      router.push(`/deals/${result.deal.id}`);
    } catch (error) {
      setStatus(error instanceof Error ? `Opslaan mislukt: ${error.message}` : "Opslaan mislukt.");
    } finally {
      setSavingDeal(false);
    }
  }

  async function handlePdfExport() {
    setExportingPdf(true);
    setStatus("PDF wordt gemaakt...");

    try {
      await exportQuotePdf({
        quoteTitle,
        customerName,
        contactName,
        salesName: currentSalesName || salesName,
        salesEmail: currentSalesEmail,
        salesPhone: currentSalesPhone,
        salesTitle: currentSalesTitle,
        salesWorkdays: currentSalesWorkdays,
        notes,
        includeVat: false,
        totalUsers,
        extraUsers,
        chauffeurExtraUsers,
        planningAppUsers,
        planningAppUserMonthly: pricingConfig.planningAppUserMonthly,
        selectedModules: selectedModuleRows,
        extraMonthlyRows,
        developmentLines: normalizeDevelopmentLines(developmentLines),
        developmentHourlyRate,
        result: pdfResult,
        includeTravelCosts,
        travelPostcodePrefix,
        travelRegion: travelCostQuote?.postcodeRow?.region ?? null,
        travelDescription: travelCostQuote?.postcodeRow?.description ?? "",
        travelCostPerDay: travelCostQuote?.pricePerDay ?? 0,
        travelCostTotal,
        implementationDays,
        quoteLayout: "standard",
        assetsExpansion: null,
        expansionWorkItems: pricingConfig.expansionWorkItems,
        moduleWorkItems: pricingConfig.modules,
      });
      setStatus("PDF is gemaakt.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "PDF maken mislukt.");
    } finally {
      setExportingPdf(false);
    }
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
              <span>{developmentTotal > 0 ? "Eenmalig" : "Implementatie"}</span>
              <strong>{euro.format(oneTimeTotal)}</strong>
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
                  <span className="input-label">Postcode klant</span>
                  <input
                    className="input"
                    value={customerPostcode}
                    onChange={(event) => handleCustomerPostcodeChange(event.target.value)}
                    placeholder="Bijv. 2211 JT"
                  />
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
              <ExtraUserOffer
                packageName={activeResult.name}
                licenseExtra={activeResult.licenseExtra}
                supportExtra={activeResult.supportExtra}
                includeSupport={includeSupport}
                extraUsers={extraUsers}
                chauffeurExtraUsers={chauffeurExtraUsers}
                planningAppUsers={planningAppUsers}
                planningAppUserMonthly={pricingConfig.planningAppUserMonthly}
                onExtraUsersChange={setExtraUsers}
                onChauffeurExtraUsersChange={setChauffeurExtraUsers}
                onPlanningAppUsersChange={setPlanningAppUsers}
              />
              <div className="field-grid-2 extra-user-correction">
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
              <div className="section-title"><MapPin size={16} /> Reiskosten</div>
              <div className="calculator-module-grid travel-toggle-grid">
                <label className={`calculator-module-card travel-toggle-card ${includeTravelCosts ? "active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={includeTravelCosts}
                    onChange={(event) => setIncludeTravelCosts(event.target.checked)}
                  />
                  <span className="calculator-module-main">
                    <strong>Prijs implementatie inclusief reiskosten</strong>
                    <span>{formatDays(travelImplementationDays)} x {euro.format(travelCostQuote?.pricePerDay ?? 0)}</span>
                  </span>
                  <span className="calculator-module-state">{includeTravelCosts ? "Aan" : "Uit"}</span>
                </label>
              </div>

              <div className="travel-cost-layout">
                <label className="input-wrap travel-postcode-field">
                  <span className="input-label">Postcode eerste 2 cijfers</span>
                  <input
                    className="input"
                    inputMode="numeric"
                    maxLength={2}
                    value={travelPostcodePrefix}
                    onChange={(event) => setTravelPostcodePrefix(normalizePostcodePrefix(event.target.value))}
                    placeholder="Bijv. 22"
                  />
                </label>

                <div className="input-wrap travel-price-summary">
                  <span className="input-label">Prijs</span>
                  <div className="summary-list">
                    <div>
                      <span>Regio</span>
                      <strong>{travelCostQuote?.postcodeRow ? travelCostQuote.postcodeRow.region : "-"}</strong>
                    </div>
                    <div>
                      <span>Omschrijving</span>
                      <strong>{travelCostQuote?.postcodeRow?.description ?? "Geen postcode gekozen"}</strong>
                    </div>
                    <div>
                      <span>Prijs per dag</span>
                      <strong>{euro.format(travelCostQuote?.pricePerDay ?? 0)}</strong>
                    </div>
                    <div className="total-row">
                      <span>Reiskosten</span>
                      <strong>{euro.format(travelCostTotal)}</strong>
                    </div>
                  </div>
                </div>
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
              <div className="section-title"><Package size={16} /> Pakket</div>
              <div className="calculator-package-grid">
                {calculatorPackages.map((packageConfig) => {
                  const active = packageConfig.key === activeResult.key;

                  return (
                    <button
                      key={packageConfig.key}
                      type="button"
                      className={`package-button ${active ? "active" : ""}`}
                      aria-pressed={active}
                      onClick={() => setSelectedPackage(packageConfig.key)}
                    >
                      <div className="package-header">
                        <div>
                          <div className="package-name">{packageConfig.name}</div>
                          <div className="subtext">{packageConfig.includedModules} betaalde modules inbegrepen</div>
                        </div>
                        {active ? <CheckCircle2 size={18} /> : null}
                      </div>
                    </button>
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

            <div className="section">
              <div className="section-title"><Code2 size={16} /> Ontwikkelingen</div>
              <DevelopmentLinesEditor
                lines={developmentLines}
                hourlyRate={developmentHourlyRate}
                onChange={setDevelopmentLines}
              />
            </div>
          </section>

          <section className="deals-results card panel">
            <div className="top-row">
              <div>
                <div className="eyebrow">Resultaat</div>
                <h2 className="headline">{activeResult.name}</h2>
              </div>
              <span className="status-pill success">
                {packageWasManuallyRaised ? "Handmatig gekozen" : "Automatisch pakket"}
              </span>
            </div>

            <div className="stats-grid">
              <div className="soft-card"><div className="kpi-title">Licentie p/m</div><div className="big-number">{euro.format(licenseWithModulesMonthly)}</div></div>
              <div className="soft-card"><div className="kpi-title">Support p/m</div><div className="big-number">{euro.format(supportMonthly)}</div></div>
              <div className="soft-card"><div className="kpi-title">Uitbreidingen p/m</div><div className="big-number">{euro.format(expansionMonthlyTotal)}</div></div>
            </div>

            <div className="proposal-grid">
              <div className="soft-card">
                <div className="section-title"><FileText size={16} /> Prijsopbouw</div>
                <div className="summary-list">
                  <div><span>Licentie p/m</span><strong>{euro.format(licenseWithModulesMonthly)}</strong></div>
                  <div><span>Support p/m</span><strong>{euro.format(supportMonthly)}</strong></div>
                  {customerPortalMonthlyTotal > 0 ? (
                    <div><span>Klantportaal p/m</span><strong>{euro.format(customerPortalMonthlyTotal)}</strong></div>
                  ) : null}
                  {smartConnectPricing.monthlyTotal > 0 ? (
                    <div><span>Smart Connect p/m</span><strong>{euro.format(smartConnectPricing.monthlyTotal)}</strong></div>
                  ) : null}
                  <div className="total-row"><span>Maandprijs</span><strong>{euro.format(monthlyTotal)}</strong></div>
                  <div><span>Implementatie</span><strong>{euro.format(activeResult.implementationBase)}</strong></div>
                  <div><span>Correctie implementatie</span><strong>{euro.format(manualImplementationAdjustment)}</strong></div>
                  {includeTravelCosts && travelCostQuote && travelImplementationDays > 0 ? (
                    <div>
                      <span>
                        Reiskosten ({Math.ceil(travelImplementationDays)} {Math.ceil(travelImplementationDays) === 1 ? "afspraak" : "afspraken"} op locatie)
                      </span>
                      <strong>{euro.format(travelCostTotal)}</strong>
                    </div>
                  ) : null}
                  <div className="total-row"><span>Implementatie totaal</span><strong>{euro.format(implementationTotal)}</strong></div>
                  {developmentTotal > 0 ? (
                    <>
                      <div>
                        <span>Ontwikkelingen ({formatDevelopmentHours(developmentHours)} uur)</span>
                        <strong>{euro.format(developmentTotal)}</strong>
                      </div>
                      <div className="total-row"><span>Eenmalig totaal</span><strong>{euro.format(oneTimeTotal)}</strong></div>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="proposal-card">
                <div className="proposal-brand">Offerte preview</div>
                <div className="proposal-title">{quoteTitle || "Prijsvoorstel"}</div>
                <div className="proposal-meta">{customerName || "Nog geen klant ingevuld"} · {contactName || "Geen contactpersoon"}</div>
                <div className="proposal-total">{euro.format(monthlyTotal)} p/m</div>
                <div className="proposal-sub">Eenmalig: {euro.format(oneTimeTotal)} · {totalUsers} gebruikers · {includeSupport ? "met support" : "zonder support"} · {selectedExpansionCount} uitbreidingen</div>
              </div>
            </div>

            <div className="section">
              <label className="input-wrap">
                <span className="input-label">Opmerkingen voor voorstel</span>
                <textarea className="textarea" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>
            </div>

            <div className="button-row">
              <button type="button" className="primary-button" onClick={() => void handlePdfExport()} disabled={exportingPdf}>
                <Download size={16} /> {exportingPdf ? "PDF maken..." : "Exporteer PDF"}
              </button>
              <button type="button" className="secondary-button" onClick={() => void handleSaveCalculation()} disabled={savingDeal}>
                <CloudUpload size={16} /> {savingDeal ? "Opslaan..." : "Opslaan in Deals"}
              </button>
            </div>
            {status ? <div className="save-status">{status}</div> : null}
          </section>
        </div>
      </div>
    </div>
  );
}
