"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, CloudUpload, Download, FileText, Package, SlidersHorizontal, Users } from "lucide-react";
import { exportQuotePdf } from "@/lib/pdf";
import { calculatePricing, euro, getRecommendation, IMPLEMENTATION_DAY_RATE, MODULES, PACKAGES } from "@/lib/pricing";
import { type DealCalculatorInputs, type DealRecord, getSupabaseClient } from "@/lib/supabase";
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
  };
}

export default function DealEditor({ dealId }: { dealId: string }) {
  const { user } = useAuth();
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

  useEffect(() => {
    async function loadDeal() {
      if (!user) {
        setStatus("Je moet ingelogd zijn om deze deal te openen.");
        setLoading(false);
        return;
      }

      if (!supabase) {
        setStatus("Supabase keys ontbreken. Vul NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY in.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.from("deals").select("*").eq("id", dealId).single();
      if (error || !data) {
        setStatus(`Deal laden mislukt: ${error?.message || "Niet gevonden"}`);
        setLoading(false);
        return;
      }

      const deal = data as DealRecord;
      const inputs = normalizeInputs(deal);

      setCustomerName(deal.customer_name || "");
      setQuoteTitle(deal.quote_title || "Prijsvoorstel Smart Trade");
      setContactName(deal.contact_name || "");
      setSalesName(deal.sales_name || "");
            setNotes(deal.notes || "");
      setExtraUsers(inputs.extraUsers);
      setSelectedPackage(inputs.selectedPackage);
      setManualImplementationAdjustment(inputs.manualImplementationAdjustment);
      setIncludeVat(inputs.includeVat);
      setQuantities(inputs.quantities);
      setStatus("");
      setLoading(false);
    }

    void loadDeal();
  }, [dealId, supabase, user]);

  const totalUsers = extraUsers + 1;
  const results = useMemo(
    () => calculatePricing({ extraUsers, manualImplementationAdjustment, includeVat, quantities }),
    [extraUsers, includeVat, manualImplementationAdjustment, quantities],
  );
  const activeResult = results.find((pkg) => pkg.key === selectedPackage) ?? results[0];
  const recommendation = getRecommendation(results);
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
    if (!supabase) return;

    const payload = {
      user_id: user.id,
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

    const { error } = await supabase.from("deals").update(payload).eq("id", dealId);
    if (error) {
      setStatus(`Opslaan mislukt: ${error.message}`);
      return;
    }
    setStatus("Deal opnieuw berekend en opgeslagen.");
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
            <h1>Deal detail en herberekening</h1>
            <p>Open jouw opgeslagen deal als volledige calculator, wijzig gebruikers, modules of pakket en sla de nieuwe berekening weer op.</p>
          </div>
          <div className="brand-actions">
            <Link href="/deals" className="secondary-button"><ArrowLeft size={16} /> Terug naar deals</Link>
            <StatusPill tone="success">Versie 8</StatusPill>
          </div>
        </header>

        <div className="kpi-grid">
          <StatCard title="Gebruikers" value={String(totalUsers)} icon={Users} sublabel="1 hoofdgebruiker + extra gebruikers" />
          <StatCard title="Maandprijs" value={euro.format(includeVat ? activeResult.monthlyInclVat : activeResult.monthlyAfterDiscount)} icon={FileText} sublabel={includeVat ? "incl. BTW" : "ex. BTW"} />
          <StatCard title="Implementatie" value={euro.format(includeVat ? activeResult.implementationInclVat : activeResult.implementationAfterAdjustment)} icon={Package} sublabel={`${activeResult.visits} bezoeken × ${euro.format(IMPLEMENTATION_DAY_RATE)}`} />
        </div>

        <div className="grid-main">
          <section className="card panel">
            <div className="top-row">
              <div>
                <div className="eyebrow">Deal detail</div>
                <h2 className="headline">Calculator invoer</h2>
                <div className="subtext">Je werkt hier weer vanuit de originele invoervelden, niet alleen op de eindbedragen.</div>
              </div>
              <StatusPill tone="warning">Aanbevolen: {recommendation.name}</StatusPill>
            </div>

            <div className="section">
              <div className="field-grid-2">
                <TextInput label="Klantnaam" value={customerName} onChange={setCustomerName} />
                <TextInput label="Titel voorstel" value={quoteTitle} onChange={setQuoteTitle} />
                <TextInput label="Contactpersoon" value={contactName} onChange={setContactName} />
                <TextInput label="Sales consultant" value={salesName} onChange={setSalesName} />
                             </div>
            </div>

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
          </section>

          <section className="stack-4">
            <div className="card panel">
              <div className="top-row">
                <div>
                  <div className="eyebrow">Herberekend</div>
                  <h2 className="headline">{activeResult.name}</h2>
                </div>
                <StatusPill tone="success">Live berekening</StatusPill>
              </div>

              <div className="stats-grid">
                <div className="soft-card"><div className="kpi-title">Licentie p/m</div><div className="big-number">{euro.format(activeResult.licenseMonthly)}</div></div>
                <div className="soft-card"><div className="kpi-title">Support p/m</div><div className="big-number">{euro.format(activeResult.supportMonthly)}</div></div>
                <div className="soft-card"><div className="kpi-title">Modules p/m</div><div className="big-number">{euro.format(activeResult.moduleMonthly)}</div></div>
                <div className="soft-card"><div className="kpi-title">Maandprijs</div><div className="big-number">{euro.format(activeResult.monthlyAfterDiscount)}</div></div>
              </div>

              <div className="proposal-grid">
                <div className="soft-card">
                  <div className="section-title"><FileText size={16} /> Prijsopbouw</div>
                  <div className="summary-list">
                    <div><span>Licentie p/m</span><strong>{euro.format(activeResult.licenseMonthly)}</strong></div>
                    <div><span>Support p/m</span><strong>{euro.format(activeResult.supportMonthly)}</strong></div>
                    <div><span>Modules p/m</span><strong>{euro.format(activeResult.moduleMonthly)}</strong></div>
                    <div className="total-row"><span>Maandprijs</span><strong>{euro.format(activeResult.monthlyAfterDiscount)}</strong></div>
                    <div><span>Implementatie basis</span><strong>{euro.format(activeResult.implementationBase)}</strong></div>
                    <div><span>Correctie implementatie</span><strong>{euro.format(manualImplementationAdjustment)}</strong></div>
                  </div>
                </div>

                <div className="proposal-card">
                  <div className="proposal-brand">{quoteTitle || "Prijsvoorstel"}</div>
                  <div className="proposal-title">{activeResult.name}</div>
                  <div className="proposal-meta">{customerName || "Nog niet ingevuld"} · {contactName || "Geen contactpersoon"}</div>
                  <div className="proposal-total">{euro.format(includeVat ? activeResult.monthlyInclVat : activeResult.monthlyAfterDiscount)} p/m</div>
                  <div className="proposal-sub">Implementatie: {euro.format(includeVat ? activeResult.implementationInclVat : activeResult.implementationAfterAdjustment)}</div>
                </div>
              </div>

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
