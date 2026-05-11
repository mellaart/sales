"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BadgePercent,
  Building2,
  Calculator,
  CheckCircle2,
  CloudUpload,
  Download,
  Euro,
  FileText,
  Package,
  SlidersHorizontal,
  Users,
  Wand2,
  Table2,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  MODULES,
  PACKAGES,
  calculatePricing,
  euro,
  getMinimumPackageForPaidModules,
  getPaidSelectedModuleCount,
  IMPLEMENTATION_DAY_RATE,
} from "@/lib/pricing";
import { exportQuotePdf } from "@/lib/pdf";
import { getSupabaseClient } from "@/lib/supabase";
import { NumberInput, StatCard, StatusPill, TextArea, TextInput } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";

export default function PriceCalculator() {
  const { user } = useAuth();
  const [extraUsers, setExtraUsers] = useState(1);
  const [selectedPackage, setSelectedPackage] = useState("starter");
  const [manualImplementationAdjustment, setManualImplementationAdjustment] = useState(0);
  const includeVat = false;
  const [quantities, setQuantities] = useState<Record<string, number>>(Object.fromEntries(MODULES.map((module) => [module.key, 0])));

  const [customerName, setCustomerName] = useState("");
  const [quoteTitle, setQuoteTitle] = useState("Prijsvoorstel Smart Trade");
  const [contactName, setContactName] = useState("");
  const [salesName, setSalesName] = useState("Erik");
  const [notes, setNotes] = useState("Bedragen zijn gebaseerd op het geselecteerde pakket, de gekozen modules en de huidige implementatie-inschatting.");
  const [saveStatus, setSaveStatus] = useState<string>("");

  const totalUsers = extraUsers + 1;
  const paidSelectedModuleCount = useMemo(() => getPaidSelectedModuleCount(quantities), [quantities]);
  const minimumPackageForSelection = useMemo(
    () => getMinimumPackageForPaidModules(paidSelectedModuleCount),
    [paidSelectedModuleCount],
  );

  const results = useMemo(
    () => calculatePricing({ extraUsers, manualImplementationAdjustment, includeVat, quantities }),
    [extraUsers, includeVat, manualImplementationAdjustment, quantities],
  );

  const activeResult = results.find((pkg) => pkg.key === selectedPackage) ?? results[0];
  const selectedPackageConfig = PACKAGES.find((pkg) => pkg.key === selectedPackage) ?? PACKAGES[0];

  const selectedModuleRows = MODULES.filter((module) => (quantities[module.key] ?? 0) > 0).map((module) => ({
    ...module,
    qty: quantities[module.key] ?? 0,
    total: module.monthlyPrice * (quantities[module.key] ?? 0),
  }));

  const handleModuleToggle = (moduleKey: string, checked: boolean) => {
    setQuantities((prev) => {
      const next = {
        ...prev,
        [moduleKey]: checked ? 1 : 0,
      };

      const nextPaidModuleCount = getPaidSelectedModuleCount(next);
      const requiredPackage = getMinimumPackageForPaidModules(nextPaidModuleCount);
      const currentPackage = PACKAGES.find((pkg) => pkg.key === selectedPackage);

      if (currentPackage && currentPackage.includedModules < requiredPackage.includedModules) {
        setSelectedPackage(requiredPackage.key);
      }

      return next;
    });
  };

  const handlePdfExport = () => {
    exportQuotePdf({
      quoteTitle,
      customerName,
      contactName,
      salesName,
      salesEmail: user?.email ?? "erik@smarttrade.nl",
      salesPhone: "+31 630 050 413",
      notes,
      includeVat,
      totalUsers,
      selectedModules: selectedModuleRows,
      result: activeResult,
    });
  };

  const handleSaveDeal = async () => {
    setSaveStatus("");
    const supabase = getSupabaseClient();

    if (!user) {
      setSaveStatus("Je moet ingelogd zijn om een deal op te slaan.");
      return;
    }

    if (!supabase) {
      setSaveStatus("Supabase keys ontbreken. Vul NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY in.");
      return;
    }

    const payload = {
      customer_name: customerName || null,
      quote_title: quoteTitle,
      contact_name: contactName || null,
      sales_name: salesName || null,
      package_key: activeResult.key,
      package_name: activeResult.name,
      total_users: totalUsers,
      contract_months: 1,
      discount_pct: 0,
      include_vat: includeVat,
      manual_monthly_adjustment: 0,
      manual_implementation_adjustment: manualImplementationAdjustment,
      monthly_base: activeResult.monthlyBase,
      monthly_total: activeResult.monthlyAfterDiscount,
      implementation_total: activeResult.implementationAfterAdjustment,
      contract_value: 0,
      annual_recurring: activeResult.annualRecurring,
      user_id: user.id,
      modules: selectedModuleRows,
      notes,
      calculator_inputs: {
        extraUsers,
        selectedPackage,
        manualImplementationAdjustment,
        includeVat,
        quantities,
      },
    };

    const { error } = await supabase.from("deals").insert(payload);

    if (error) {
      setSaveStatus(`Opslaan mislukt: ${error.message}`);
      return;
    }

    setSaveStatus("Deal opgeslagen in Supabase. Open Deal overzicht om hem te beheren.");
  };

  return (
    <div className="page-shell">
      <div className="container">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Smart Trade</div>
            <h1>Smart Trade offerteplatform</h1>
            <p>
              Een modern sales platform voor offertes, deals en uitbreidingen.
            </p>
          </div>
          <div className="brand-actions">
            <StatusPill tone="success">PDF-offerte</StatusPill>
            <StatusPill tone="success">Supabase-ready</StatusPill>
            <StatusPill tone="warning">Versie 10</StatusPill>
            <Link href="/deals" className="secondary-button">
              <Table2 size={16} /> Deal overzicht
            </Link>
          </div>
        </header>

        <div className="grid-main">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card panel">
            <div className="top-row">
              <div>
                <div className="eyebrow">Versie 10</div>
                <h2 className="headline">Sales input</h2>
                <div className="subtext">Vul alleen de noodzakelijke velden in. De calculator doet de rest.</div>
              </div>
              <div className="icon-badge"><Calculator size={28} /></div>
            </div>

            <div className="section">
              <div className="section-title"><Building2 size={16} /> Klant en offerte</div>
              <div className="field-grid-2 compact-fields">
                <TextInput label="Klantnaam" value={customerName} onChange={setCustomerName} placeholder="Bijv. Groenbedrijf Jansen" />
                <TextInput label="Titel voorstel" value={quoteTitle} onChange={setQuoteTitle} placeholder="Prijsvoorstel 2026" />
                <TextInput label="Contactpersoon" value={contactName} onChange={setContactName} placeholder="Naam klantcontact" />
                <TextInput label="Sales consultant" value={salesName} onChange={setSalesName} placeholder="Jouw naam" />
              </div>
            </div>

            <div className="section">
              <div className="section-title"><Users size={16} /> Basis invoer</div>
              <div className="field-grid-2">
                <NumberInput label="Extra gebruikers" value={extraUsers} onChange={(v) => setExtraUsers(Math.max(0, v))} />
                <NumberInput label="Correctie implementatie (€)" value={manualImplementationAdjustment} onChange={setManualImplementationAdjustment} step={0.01} />
              </div>
            </div>

            <div className="section">
              <div className="section-title"><Package size={16} /> Pakket</div>
              <div className="package-grid">
                {PACKAGES.map((pkg) => {
                  const isActive = pkg.key === selectedPackage;
                  const isTooSmall = pkg.includedModules < paidSelectedModuleCount;

                  return (
                    <button
                      key={pkg.key}
                      type="button"
                      className={`package-button ${isActive ? "active" : ""} ${isTooSmall ? "disabled" : ""}`}
                      disabled={isTooSmall}
                      onClick={() => setSelectedPackage(pkg.key)}
                      title={isTooSmall ? `Minimaal ${minimumPackageForSelection.name} vereist bij ${paidSelectedModuleCount} betaalde modules` : undefined}
                    >
                      <div className="package-header">
                        <div>
                          <div className="package-name">{pkg.name}</div>
                          <div className="muted">
                            {pkg.includedModules} betaalde module{pkg.includedModules === 1 ? "" : "s"} inbegrepen
                          </div>
                          {isTooSmall ? <div className="package-warning">Upgrade vereist</div> : null}
                        </div>
                        {isActive ? <CheckCircle2 size={18} /> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="package-rule-note">
                Geselecteerd: {paidSelectedModuleCount} betaalde module{paidSelectedModuleCount === 1 ? "" : "s"}.
                Minimaal pakket: <strong>{minimumPackageForSelection.name}</strong>. Gratis modules zoals PostNL tellen niet mee.
              </div>
            </div>

            <div className="section">
              <div className="section-title"><SlidersHorizontal size={16} /> Modules aan/uit</div>
              <div className="module-grid">
                {MODULES.map((module) => {
                  const enabled = (quantities[module.key] ?? 0) > 0;

                  return (
                    <label key={module.key} className={`module-list-row ${enabled ? "active" : ""}`}>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => handleModuleToggle(module.key, e.target.checked)}
                      />
                      <span className="module-list-main">
                        <span className="module-list-title">{module.name}</span>
                        <span className="module-list-price">{euro.format(module.monthlyPrice)} p/m</span>
                      </span>
                      <span className="module-list-state">{enabled ? "Aan" : "Uit"}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </motion.div>

          <div className="stack-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="kpi-grid">
              <StatCard title="Gebruikers" value={String(totalUsers)} icon={Users} sublabel="1 hoofdgebruiker + extra gebruikers" />
              <StatCard title="Maandprijs" value={euro.format(includeVat ? activeResult.monthlyInclVat : activeResult.monthlyAfterDiscount)} icon={Euro} sublabel={includeVat ? "incl. BTW" : `${selectedPackageConfig.name} ex. BTW`} />
              <StatCard title="Implementatie" value={euro.format(includeVat ? activeResult.implementationInclVat : activeResult.implementationAfterAdjustment)} icon={Package} sublabel={`${activeResult.visits} bezoeken × ${euro.format(IMPLEMENTATION_DAY_RATE)}`} />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card panel">
              <div className="top-row">
                <div>
                  <div className="eyebrow">Actieve berekening</div>
                  <h2 className="headline">{activeResult.name}</h2>
                </div>
              </div>

              <div className="stats-grid">
                <div className="soft-card"><div className="kpi-title">Licentie p/m</div><div className="big-number">{euro.format(activeResult.licenseMonthly)}</div></div>
                <div className="soft-card"><div className="kpi-title">Support p/m</div><div className="big-number">{euro.format(activeResult.supportMonthly)}</div></div>
                <div className="soft-card"><div className="kpi-title">Modules p/m</div><div className="big-number">{euro.format(activeResult.moduleMonthly)}</div></div>
                <div className="soft-card"><div className="kpi-title">Maandprijs</div><div className="big-number">{euro.format(activeResult.monthlyAfterDiscount)}</div></div>
              </div>

              <div className="proposal-grid">
                <div className="soft-card">
                  <div className="section-title"><BadgePercent size={16} /> Samenvatting prijsopbouw</div>
                  <div className="summary-list">
                    <div><span>Licentie p/m</span><strong>{euro.format(activeResult.licenseMonthly)}</strong></div>
                    <div><span>Support p/m</span><strong>{euro.format(activeResult.supportMonthly)}</strong></div>
                    <div><span>Modules p/m</span><strong>{euro.format(activeResult.moduleMonthly)}</strong></div>
                    <div className="total-row"><span>Maandprijs</span><strong>{euro.format(activeResult.monthlyAfterDiscount)}</strong></div>
                    <div><span>Implementatie basis</span><strong>{euro.format(activeResult.implementationBase)}</strong></div>
                    <div><span>Correctie implementatie</span><strong>{euro.format(manualImplementationAdjustment)}</strong></div>
                  </div>
                </div>

                <div className="quote-preview-card">
                  <div className="quote-preview-header">
                    <div>
                      <div className="quote-kicker"><FileText size={14} /> Offerte preview</div>
                      <div className="quote-title">{quoteTitle || "Prijsvoorstel Smart Trade"}</div>
                    </div>
                    <StatusPill tone="success">{activeResult.name}</StatusPill>
                  </div>

                  <div className="quote-customer-line">
                    <strong>{customerName || "Nog geen klant ingevuld"}</strong>
                    <span>{contactName || "Geen contactpersoon"}</span>
                  </div>

                  <div className="quote-price-strip">
                    <div>
                      <span>Maandprijs</span>
                      <strong>{euro.format(includeVat ? activeResult.monthlyInclVat : activeResult.monthlyAfterDiscount)} p/m</strong>
                    </div>
                    <div>
                      <span>Implementatie</span>
                      <strong>{euro.format(includeVat ? activeResult.implementationInclVat : activeResult.implementationAfterAdjustment)}</strong>
                    </div>
                  </div>

                  <div className="quote-facts">
                    <div>
                      <span>Gebruikers</span>
                      <strong>{totalUsers}</strong>
                    </div>
                    <div>
                      <span>Pakket</span>
                      <strong>{activeResult.name}</strong>
                    </div>
                    <div>
                      <span>Modules</span>
                      <strong>{selectedModuleRows.length}</strong>
                    </div>
                    <div>
                      <span>BTW</span>
                      <strong>{includeVat ? "Incl." : "Excl."}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="section">
                <TextArea label="Opmerkingen voor voorstel" value={notes} onChange={setNotes} placeholder="Bijv. prijs is inclusief onboarding, exclusief maatwerkkoppelingen." />
                <div className="button-row">
                  <button type="button" className="primary-button" onClick={handlePdfExport}><Download size={16} /> Maak offerte-PDF</button>
                  <button type="button" className="secondary-button" onClick={handleSaveDeal}><CloudUpload size={16} /> Opslaan in Supabase</button>
                </div>
                {saveStatus ? <div className="save-status">{saveStatus}</div> : null}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card panel">
              <div className="top-row">
                <div>
                  <div className="eyebrow">Pakketvergelijking</div>
                  <h2 className="headline">Alle scenario's naast elkaar</h2>
                </div>
                <StatusPill tone="warning"><Wand2 size={14} /> Slim voor salesgesprek</StatusPill>
              </div>
              <div className="comparison-grid">
                {results.map((result) => {
                  const isActive = result.key === selectedPackage;
                  const isTooSmall = result.includedModules < paidSelectedModuleCount;

                  return (
                    <div key={result.key} className={`comparison-card ${isActive ? "active" : ""} ${isTooSmall ? "muted-card" : ""}`}>
                      <div className="package-header">
                        <div>
                          <div className="kpi-title">Pakket</div>
                          <div className="package-name">{result.name}</div>
                        </div>
                        {isActive ? <CheckCircle2 size={18} /> : null}
                      </div>
                      <div className="summary-list compact">
                        <div><span>Maandprijs</span><strong>{euro.format(result.monthlyAfterDiscount)}</strong></div>
                        <div><span>Implementatie</span><strong>{euro.format(result.implementationAfterAdjustment)}</strong></div>
                        <div><span>Bezoeken</span><strong>{result.visits}</strong></div>
                      </div>
                      {isTooSmall ? <div className="package-warning">Upgrade vereist</div> : null}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
