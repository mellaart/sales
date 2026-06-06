"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, CloudUpload, Download, FileText, Package, SlidersHorizontal, Users } from "lucide-react";
import { exportQuotePdf } from "@/lib/pdf";
import { getAssetExpansionTotals } from "@/lib/asset-expansions";
import { getDealWithFallback, updateDealWithFallback } from "@/lib/deal-storage";
import { calculatePricing, euro, getRecommendation, IMPLEMENTATION_DAY_RATE, MODULES, PACKAGES } from "@/lib/pricing";
import { QUOTE_LAYOUTS, normalizeQuoteLayout, type QuoteLayoutKey } from "@/lib/quote-layouts";
import { type AssetExpansionLine, type AssetExpansionSummary, type DealCalculatorInputs, type DealRecord, getSupabaseClient, getUserDisplayName } from "@/lib/supabase";
import { NumberInput, StatCard, StatusPill, TextArea, TextInput, Toggle } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";

function toQuantities(modules: DealRecord["modules"] | undefined): Record<string, number> {
  const base = Object.fromEntries(MODULES.map((module) => [module.key, 0]));
  if (!Array.isArray(modules)) return base;
  for (const item of modules as Array<{ key?: string; qty?: number }>) {
    if (item?.key && Object.prototype.hasOwnProperty.call(base, item.key)) {
      base[item.key] = Number(item.qty || 0);
    }
  }
  return base;
}

function normalizeInputs(deal: DealRecord): DealCalculatorInputs {
  return {
    extraUsers: Math.max(0, Number(deal.calculator_inputs?.extraUsers ?? Number(deal.total_users || 1) - 1)),
    selectedPackage: String(deal.calculator_inputs?.selectedPackage || deal.package_key || "enterprise"),
    manualImplementationAdjustment: Number(deal.calculator_inputs?.manualImplementationAdjustment ?? deal.manual_implementation_adjustment ?? 0),
    includeVat: Boolean(deal.calculator_inputs?.includeVat ?? deal.include_vat ?? false),
    quantities: deal.calculator_inputs?.quantities ?? toQuantities(deal.modules),
    quoteLayout: normalizeQuoteLayout(deal.calculator_inputs?.quoteLayout),
    assetsExpansion: deal.calculator_inputs?.assetsExpansion ?? null,
  };
}

function formatExpansionAmount(line: AssetExpansionLine) {
  const suffix = line.cadence === "monthly" ? " p/m" : line.cadence === "annual" ? " p/j" : "";
  return `${euro.format(line.amount)}${suffix}`;
}

export default function DealEditor({ dealId }: { dealId: string }) {
  const { user, profile } = useAuth();
  const supabase = getSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [quoteTitle, setQuoteTitle] = useState("Prijsvoorstel Smart Trade");
  const [contactName, setContactName] = useState("");
  const [salesName, setSalesName] = useState("");
  const [notes, setNotes] = useState("");

  const [extraUsers, setExtraUsers] = useState(1);
  const [selectedPackage, setSelectedPackage] = useState("enterprise");
  const [manualImplementationAdjustment, setManualImplementationAdjustment] = useState(0);
  const [includeVat, setIncludeVat] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>(Object.fromEntries(MODULES.map((module) => [module.key, 0])));
  const [quoteLayout, setQuoteLayout] = useState<QuoteLayoutKey>("standard");
  const [assetsExpansion, setAssetsExpansion] = useState<AssetExpansionSummary | null>(null);

  const currentSalesName = useMemo(() => getUserDisplayName(user, profile), [profile, user]);

  useEffect(() => {
    async function loadDeal() {
      if (!user) {
        setStatus("Je moet ingelogd zijn om deze deal te openen.");
        setLoading(false);
        return;
      }

      const result = await getDealWithFallback(supabase, dealId);
      if (result.error || !result.deal) {
        setStatus(`Deal laden mislukt: ${result.error ?? "Niet gevonden"}`);
        setLoading(false);
        return;
      }

      const deal = result.deal;
      const inputs = normalizeInputs(deal);

      setCustomerName(deal.customer_name || "");
      setQuoteTitle(deal.quote_title || "Prijsvoorstel Smart Trade");
      setContactName(deal.contact_name || "");
      setSalesName(deal.user_id === user.id && currentSalesName ? currentSalesName : deal.sales_name || "");
      setNotes(deal.notes || "");
      setExtraUsers(inputs.extraUsers);
      setSelectedPackage(inputs.selectedPackage);
      setManualImplementationAdjustment(inputs.manualImplementationAdjustment);
      setIncludeVat(inputs.includeVat);
      setQuantities(inputs.quantities);
      setQuoteLayout(normalizeQuoteLayout(inputs.quoteLayout));
      setAssetsExpansion(inputs.assetsExpansion ?? null);
      setStatus(result.warning ?? "");
      setLoading(false);
    }

    void loadDeal();
  }, [currentSalesName, dealId, supabase, user]);

  const totalUsers = extraUsers + 1;
  const results = useMemo(
    () => calculatePricing({ extraUsers, manualImplementationAdjustment, includeVat, quantities }),
    [extraUsers, includeVat, manualImplementationAdjustment, quantities],
  );
  const activeResult = results.find((pkg) => pkg.key === selectedPackage) ?? results[0];
  const recommendation = getRecommendation(results);
  const isAssetsExpansionDeal = quoteLayout === "assets-expansion" && Boolean(assetsExpansion?.lines?.length);
  const expansionTotals = useMemo(() => getAssetExpansionTotals(assetsExpansion?.lines ?? []), [assetsExpansion]);
  const selectedModuleRows = MODULES.filter((module) => (quantities[module.key] ?? 0) > 0).map((module) => ({
    ...module,
    qty: quantities[module.key] ?? 0,
    total: module.monthlyPrice * (quantities[module.key] ?? 0),
  }));

  async function handleSave() {
    if (!user) {
      setStatus("Je moet ingelogd zijn om deze deal op te slaan.");
      return;
    }
    const payload = isAssetsExpansionDeal
      ? {
          user_id: user.id,
          customer_name: customerName || null,
          quote_title: quoteTitle,
          contact_name: contactName || null,
          sales_name: salesName || currentSalesName || null,
          package_key: activeResult.key,
          package_name: "Uitbreiding",
          total_users: totalUsers,
          contract_months: 1,
          discount_pct: 0,
          include_vat: includeVat,
          manual_monthly_adjustment: 0,
          manual_implementation_adjustment: expansionTotals.once,
          monthly_base: expansionTotals.monthly,
          monthly_total: expansionTotals.monthly,
          implementation_total: expansionTotals.once,
          contract_value: expansionTotals.monthly + expansionTotals.annual + expansionTotals.once,
          annual_recurring: expansionTotals.monthly * 12 + expansionTotals.annual,
          modules: selectedModuleRows,
          notes,
          calculator_inputs: {
            extraUsers,
            selectedPackage,
            manualImplementationAdjustment: expansionTotals.once,
            includeVat,
            quantities,
            quoteLayout,
            assetsExpansion,
          },
        }
      : {
      user_id: user.id,
      customer_name: customerName || null,
      quote_title: quoteTitle,
      contact_name: contactName || null,
      sales_name: salesName || currentSalesName || null,
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
      contract_value: activeResult.contractValue,
      annual_recurring: activeResult.annualRecurring,
      modules: selectedModuleRows,
      notes,
      calculator_inputs: {
        extraUsers,
        selectedPackage,
        manualImplementationAdjustment,
        includeVat,
        quantities,
        quoteLayout,
        assetsExpansion,
      },
    };

    const result = await updateDealWithFallback(supabase, dealId, payload);
    if (result.error) {
      setStatus(`Opslaan mislukt: ${result.error}`);
      return;
    }
    setStatus(result.warning ?? "Deal opnieuw berekend en opgeslagen.");
  }

  function handlePdfExport() {
    exportQuotePdf({
      quoteTitle,
      customerName,
      contactName,
      salesName,
      notes,
      includeVat,
      totalUsers,
      selectedModules: selectedModuleRows,
      result: activeResult,
      quoteLayout,
      assetsExpansion,
    });
  }

  if (loading) {
    return <div className="save-status">Deal wordt geladen...</div>;
  }

  return (
    <div className="page-shell">
      <div className="container">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Smart Trade</div>
            <h1>{isAssetsExpansionDeal ? "Uitbreiding detail" : "Deal detail en herberekening"}</h1>
            <p>
              {isAssetsExpansionDeal
                ? "Deze deal bevat alleen de geselecteerde uitbreiding vanuit Assets."
                : "Open jouw opgeslagen deal als volledige calculator, wijzig gebruikers, modules of pakket en sla de nieuwe berekening weer op."}
            </p>
          </div>
          <div className="brand-actions">
            <Link href="/deals" className="secondary-button"><ArrowLeft size={16} /> Terug naar deals</Link>
            <StatusPill tone="success">Versie 8</StatusPill>
          </div>
        </header>

        <div className="kpi-grid">
          {isAssetsExpansionDeal ? (
            <>
              <StatCard title="Regels" value={String(assetsExpansion?.lines.length ?? 0)} icon={FileText} sublabel="Geselecteerde uitbreidingen" />
              <StatCard title="Maandbedrag" value={euro.format(expansionTotals.monthly)} icon={Users} sublabel="Alleen deze uitbreiding" />
              <StatCard title="Setup" value={euro.format(expansionTotals.once)} icon={Package} sublabel="Eenmalige kosten" />
            </>
          ) : (
            <>
              <StatCard title="Gebruikers" value={String(totalUsers)} icon={Users} sublabel="1 hoofdgebruiker + extra gebruikers" />
              <StatCard title="Maandprijs" value={euro.format(includeVat ? activeResult.monthlyInclVat : activeResult.monthlyAfterDiscount)} icon={FileText} sublabel={includeVat ? "incl. BTW" : "ex. BTW"} />
              <StatCard title="Implementatie" value={euro.format(includeVat ? activeResult.implementationInclVat : activeResult.implementationAfterAdjustment)} icon={Package} sublabel={`${activeResult.visits} bezoeken × ${euro.format(IMPLEMENTATION_DAY_RATE)}`} />
            </>
          )}
        </div>

        <div className="grid-main">
          <section className="card panel">
            <div className="top-row">
              <div>
                <div className="eyebrow">Deal detail</div>
                <h2 className="headline">{isAssetsExpansionDeal ? "Uitbreiding invoer" : "Calculator invoer"}</h2>
                <div className="subtext">
                  {isAssetsExpansionDeal
                    ? "Deze deal gebruikt alleen de gekozen uitbreidingsregels uit Assets."
                    : "Je werkt hier weer vanuit de originele invoervelden, niet alleen op de eindbedragen."}
                </div>
              </div>
              <StatusPill tone="warning">{isAssetsExpansionDeal ? "Uitbreiding" : `Aanbevolen: ${recommendation.name}`}</StatusPill>
            </div>

            <div className="section">
              <div className="field-grid-2">
                <TextInput label="Klantnaam" value={customerName} onChange={setCustomerName} />
                <TextInput label="Titel voorstel" value={quoteTitle} onChange={setQuoteTitle} />
                <TextInput label="Contactpersoon" value={contactName} onChange={setContactName} />
                <TextInput label="Sales consultant" value={salesName} onChange={setSalesName} />
                             </div>
            </div>

            {isAssetsExpansionDeal ? (
              <div className="section">
                <div className="section-title"><FileText size={16} /> Geselecteerde uitbreiding</div>
                <div className="summary-list">
                  {assetsExpansion?.lines.map((line, index) => (
                    <div key={`${line.group}-${line.label}-${index}`}>
                      <span>{line.quantity}x {line.label}</span>
                      <strong>{formatExpansionAmount(line)}</strong>
                    </div>
                  ))}
                  <div className="total-row"><span>Totaal per maand</span><strong>{euro.format(expansionTotals.monthly)}</strong></div>
                  {expansionTotals.annual > 0 ? <div className="total-row"><span>Totaal per jaar</span><strong>{euro.format(expansionTotals.annual)}</strong></div> : null}
                  <div className="total-row"><span>Setupkosten</span><strong>{euro.format(expansionTotals.once)}</strong></div>
                </div>
              </div>
            ) : (
              <>
                <div className="section">
                  <div className="field-grid-2">
                    <NumberInput label="Extra gebruikers" value={extraUsers} onChange={(v) => setExtraUsers(Math.max(0, v))} />
                    <Toggle label="Bedragen incl. BTW tonen" checked={includeVat} onChange={setIncludeVat} />
                    <NumberInput label="Correctie implementatie (€)" value={manualImplementationAdjustment} onChange={setManualImplementationAdjustment} step={0.01} />
                  </div>
                </div>

                <div className="section">
                  <div className="section-title"><Package size={16} /> Pakket</div>
                  <div className="package-grid">
                    {PACKAGES.map((pkg) => {
                      const isActive = pkg.key === selectedPackage;
                      return (
                        <button key={pkg.key} type="button" className={`package-button ${isActive ? "active" : ""}`} onClick={() => setSelectedPackage(pkg.key)}>
                          <div className="package-header">
                            <div>
                              <div className="package-name">{pkg.name}</div>
                              <div className="muted">{pkg.includedModules} inbegrepen modules</div>
                            </div>
                            {isActive ? <CheckCircle2 size={18} /> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="section">
                  <div className="section-title"><SlidersHorizontal size={16} /> Modules</div>
                  <div className="module-grid">
                    {MODULES.map((module) => (
                      <div key={module.key} className="module-card">
                        <div className="package-name">{module.name}</div>
                        <div className="muted small-gap">{euro.format(module.monthlyPrice)} per stuk / maand</div>
                        <input
                          className="input small-gap"
                          type="number"
                          min={0}
                          value={quantities[module.key] ?? 0}
                          onChange={(e) => setQuantities((prev) => ({ ...prev, [module.key]: Math.max(0, Number(e.target.value || 0)) }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="stack-4">
            <div className="card panel">
              <div className="top-row">
                <div>
                  <div className="eyebrow">Herberekend</div>
                  <h2 className="headline">{isAssetsExpansionDeal ? "Uitbreiding" : activeResult.name}</h2>
                </div>
                <StatusPill tone="success">{isAssetsExpansionDeal ? "Assets offerte" : "Live berekening"}</StatusPill>
              </div>

              <div className="stats-grid">
                {isAssetsExpansionDeal ? (
                  <>
                    <div className="soft-card"><div className="kpi-title">Maand</div><div className="big-number">{euro.format(expansionTotals.monthly)}</div></div>
                    <div className="soft-card"><div className="kpi-title">Jaar</div><div className="big-number">{euro.format(expansionTotals.annual)}</div></div>
                    <div className="soft-card"><div className="kpi-title">Setup</div><div className="big-number">{euro.format(expansionTotals.once)}</div></div>
                    <div className="soft-card"><div className="kpi-title">Regels</div><div className="big-number">{assetsExpansion?.lines.length ?? 0}</div></div>
                  </>
                ) : (
                  <>
                    <div className="soft-card"><div className="kpi-title">Licentie p/m</div><div className="big-number">{euro.format(activeResult.licenseMonthly)}</div></div>
                    <div className="soft-card"><div className="kpi-title">Support p/m</div><div className="big-number">{euro.format(activeResult.supportMonthly)}</div></div>
                    <div className="soft-card"><div className="kpi-title">Modules p/m</div><div className="big-number">{euro.format(activeResult.moduleMonthly)}</div></div>
                    <div className="soft-card"><div className="kpi-title">Maandprijs</div><div className="big-number">{euro.format(activeResult.monthlyAfterDiscount)}</div></div>
                  </>
                )}
              </div>

              <div className="proposal-grid">
                <div className="soft-card">
                  <div className="section-title"><FileText size={16} /> Prijsopbouw</div>
                  <div className="summary-list">
                    {isAssetsExpansionDeal ? (
                      <>
                        <div className="total-row"><span>Totaal per maand</span><strong>{euro.format(expansionTotals.monthly)}</strong></div>
                        {expansionTotals.annual > 0 ? <div><span>Totaal per jaar</span><strong>{euro.format(expansionTotals.annual)}</strong></div> : null}
                        <div><span>Setupkosten</span><strong>{euro.format(expansionTotals.once)}</strong></div>
                      </>
                    ) : (
                      <>
                        <div><span>Licentie p/m</span><strong>{euro.format(activeResult.licenseMonthly)}</strong></div>
                        <div><span>Support p/m</span><strong>{euro.format(activeResult.supportMonthly)}</strong></div>
                        <div><span>Modules p/m</span><strong>{euro.format(activeResult.moduleMonthly)}</strong></div>
                        <div className="total-row"><span>Maandprijs</span><strong>{euro.format(activeResult.monthlyAfterDiscount)}</strong></div>
                        <div><span>Implementatie basis</span><strong>{euro.format(activeResult.implementationBase)}</strong></div>
                        <div><span>Correctie implementatie</span><strong>{euro.format(manualImplementationAdjustment)}</strong></div>
                      </>
                    )}
                  </div>
                </div>

                <div className="proposal-card">
                  <div className="proposal-brand">{quoteTitle || "Prijsvoorstel"}</div>
                  <div className="proposal-title">{isAssetsExpansionDeal ? "Geselecteerde uitbreiding" : activeResult.name}</div>
                  <div className="proposal-meta">{customerName || "Nog niet ingevuld"} · {contactName || "Geen contactpersoon"}</div>
                  <div className="proposal-total">{euro.format(isAssetsExpansionDeal ? expansionTotals.monthly : includeVat ? activeResult.monthlyInclVat : activeResult.monthlyAfterDiscount)} p/m</div>
                  <div className="proposal-sub">Setup: {euro.format(isAssetsExpansionDeal ? expansionTotals.once : includeVat ? activeResult.implementationInclVat : activeResult.implementationAfterAdjustment)}</div>
                </div>
              </div>

              <div className="section">
                <div className="section-title"><FileText size={16} /> Offerte layout</div>
                <div className="quote-layout-grid">
                  {QUOTE_LAYOUTS.map((layout) => {
                    const active = layout.key === quoteLayout;

                    return (
                      <button
                        key={layout.key}
                        type="button"
                        className={`quote-layout-option ${active ? "active" : ""}`}
                        onClick={() => setQuoteLayout(layout.key)}
                      >
                        <strong>{layout.name}</strong>
                        <span>{layout.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {!isAssetsExpansionDeal && assetsExpansion?.lines?.length ? (
                <div className="section">
                  <div className="section-title"><FileText size={16} /> Uitbreidingen vanuit Assets</div>
                  <div className="summary-list">
                    {assetsExpansion.lines.map((line, index) => (
                      <div key={`${line.group}-${line.label}-${index}`}>
                        <span>{line.quantity}x {line.label}</span>
                        <strong>{formatExpansionAmount(line)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="section">
                <TextArea label="Notities" value={notes} onChange={setNotes} placeholder="Interne of commerciële notities" />
                <div className="button-row">
                  <button type="button" className="primary-button" onClick={() => void handleSave()}><CloudUpload size={16} /> Opslaan en herberekenen</button>
                  <button type="button" className="secondary-button" onClick={handlePdfExport}><Download size={16} /> Exporteer PDF</button>
                </div>
                {status ? <div className="save-status">{status}</div> : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
