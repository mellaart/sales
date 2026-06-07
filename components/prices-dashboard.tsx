"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, RefreshCw, Save, ShieldAlert, WalletCards } from "lucide-react";
import {
  DEFAULT_PRICE_CONFIG,
  normalizePricingConfig,
  type EditablePricingConfig,
} from "@/lib/price-config";
import { euro, getVisitsForUsers, type ModuleConfig, type PackageConfig } from "@/lib/pricing";
import { canManageRoles, getSupabaseClient } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { NumberStepper } from "@/components/number-stepper";
import { usePricingConfig } from "@/components/pricing-provider";
import { StatusPill } from "@/components/ui";

const EDITABLE_PACKAGE_KEYS = ["starter", "basic", "premium", "enterprise"];

type PricesResponse = {
  error?: string;
  pricingConfig?: unknown;
  persisted?: boolean;
  updatedAt?: string;
};

function clonePricingConfig(config: EditablePricingConfig) {
  return normalizePricingConfig(JSON.parse(JSON.stringify(config)) as unknown);
}

function getEditablePackages(config: EditablePricingConfig) {
  return config.packages.filter((packageConfig) => EDITABLE_PACKAGE_KEYS.includes(packageConfig.key));
}

function formatTierLabel(maxUsers: number) {
  if (maxUsers === 4) return "Admin. tot 4 gebruikers";
  if (maxUsers === Infinity) return "Admin. meer dan 40 gebruikers";

  const minUsers = maxUsers - 4;
  return `Admin. met ${minUsers}-${maxUsers} gebruikers`;
}

function PriceInput({
  label,
  value,
  onChange,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <NumberStepper
      ariaLabel={label}
      className="price-table-stepper"
      inputClassName="price-table-input"
      min={0}
      size="compact"
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={onChange}
    />
  );
}

function TextPriceInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      aria-label={label}
      className="price-table-input text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export default function PricesDashboard() {
  const { role } = useAuth();
  const router = useRouter();
  const supabase = getSupabaseClient();
  const { pricingConfig, refreshPricingConfig } = usePricingConfig();
  const [draftConfig, setDraftConfig] = useState<EditablePricingConfig>(DEFAULT_PRICE_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const editablePackages = useMemo(() => getEditablePackages(draftConfig), [draftConfig]);
  const implementationTiers = editablePackages[0]?.implementationVisits ?? [];
  const updatedLabel = draftConfig.updatedAt
    ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(draftConfig.updatedAt))
    : "Nog niet opgeslagen";

  useEffect(() => {
    setDraftConfig(clonePricingConfig(pricingConfig));
    setLoading(false);
  }, [pricingConfig]);

  function updateDraft(updater: (currentConfig: EditablePricingConfig) => EditablePricingConfig) {
    setDraftConfig((currentConfig) => normalizePricingConfig(updater(clonePricingConfig(currentConfig))));
  }

  function updatePackage(packageKey: string, field: keyof PackageConfig, value: number) {
    updateDraft((currentConfig) => ({
      ...currentConfig,
      packages: currentConfig.packages.map((packageConfig) =>
        packageConfig.key === packageKey ? { ...packageConfig, [field]: value } : packageConfig,
      ),
    }));
  }

  function updatePackageVisits(packageKey: string, tierIndex: number, visits: number) {
    updateDraft((currentConfig) => ({
      ...currentConfig,
      packages: currentConfig.packages.map((packageConfig) =>
        packageConfig.key === packageKey
          ? {
              ...packageConfig,
              implementationVisits: packageConfig.implementationVisits.map((tier, index) =>
                index === tierIndex ? { ...tier, visits: Math.max(0, Math.floor(visits)) } : tier,
              ),
            }
          : packageConfig,
      ),
    }));
  }

  function updateModule(moduleKey: string, field: keyof ModuleConfig, value: string | number | boolean | null) {
    updateDraft((currentConfig) => ({
      ...currentConfig,
      modules: currentConfig.modules.map((moduleConfig) =>
        moduleConfig.key === moduleKey ? { ...moduleConfig, [field]: value } : moduleConfig,
      ),
    }));
  }

  function updateCustomerPortalOption(optionKey: string, monthlyPrice: number) {
    updateDraft((currentConfig) => ({
      ...currentConfig,
      customerPortalOptions: currentConfig.customerPortalOptions.map((option) =>
        option.key === optionKey ? { ...option, monthlyPrice } : option,
      ),
    }));
  }

  function updateSmartConnectTier(index: number, monthlyPrice: number) {
    updateDraft((currentConfig) => ({
      ...currentConfig,
      smartConnectTiers: currentConfig.smartConnectTiers.map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, monthlyPrice } : tier,
      ),
    }));
  }

  function updateServiceCostOption(optionKey: string, annualPrice: number) {
    updateDraft((currentConfig) => ({
      ...currentConfig,
      serviceCostOptions: currentConfig.serviceCostOptions.map((option) =>
        option.key === optionKey ? { ...option, annualPrice } : option,
      ),
    }));
  }

  async function reloadPrices() {
    setLoading(true);
    setStatus("Prijzen worden geladen...");
    await refreshPricingConfig();
    setStatus("Prijzen opnieuw geladen.");
    setLoading(false);
  }

  async function savePrices() {
    if (!supabase) {
      setStatus("Supabase client ontbreekt.");
      return;
    }

    setSaving(true);
    setStatus("Prijzen worden opgeslagen...");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error("Je sessie is verlopen. Log opnieuw in.");
      }

      const response = await fetch("/api/admin/prices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ pricingConfig: draftConfig }),
      });

      const json = (await response.json().catch(() => ({}))) as PricesResponse;

      if (!response.ok) {
        throw new Error(json.error || "Prijzen opslaan mislukt.");
      }

      const savedConfig = normalizePricingConfig(json.pricingConfig ?? draftConfig);
      setDraftConfig(savedConfig);
      window.dispatchEvent(new CustomEvent("pricing-config-updated", { detail: savedConfig }));
      setStatus("Prijzen opgeslagen. Calculator, Deals en Assets gebruiken de bijgewerkte prijslijst.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Prijzen opslaan mislukt.");
    } finally {
      setSaving(false);
    }
  }

  if (!canManageRoles(role)) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="top-row">
              <div>
                <div className="eyebrow">Geen toegang</div>
                <h1>Prijzen</h1>
                <p className="subtext">Alleen admin gebruikers mogen prijzen bekijken en aanpassen.</p>
              </div>
              <div className="icon-badge"><ShieldAlert size={24} /></div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="container prices-page">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Smart Trade</div>
            <h1>Prijzen</h1>
            <p>Beheer licenties, support, implementatie, modules en uitbreidingen vanuit een centrale prijslijst.</p>
          </div>

          <div className="brand-actions">
            <StatusPill tone={loading ? "warning" : "success"}>{loading ? "Laden" : "Admin only"}</StatusPill>
            <button type="button" className="secondary-button" onClick={() => void reloadPrices()} disabled={loading || saving}>
              <RefreshCw size={16} />
              Vernieuwen
            </button>
            <button type="button" className="primary-button" onClick={() => void savePrices()} disabled={loading || saving}>
              <Save size={16} />
              {saving ? "Opslaan..." : "Opslaan"}
            </button>
          </div>
        </header>

        <section className="deals-stat-grid">
          <article className="deals-stat">
            <div className="stat-icon"><WalletCards size={18} /></div>
            <div>
              <span>Dagtarief implementatie</span>
              <strong>{euro.format(draftConfig.implementationDayRate)}</strong>
            </div>
          </article>
          <article className="deals-stat">
            <div className="stat-icon"><Calculator size={18} /></div>
            <div>
              <span>Modules</span>
              <strong>{draftConfig.modules.length}</strong>
            </div>
          </article>
          <article className="deals-stat">
            <div className="stat-icon"><WalletCards size={18} /></div>
            <div>
              <span>Klantportaal</span>
              <strong>{draftConfig.customerPortalOptions.length}</strong>
            </div>
          </article>
          <article className="deals-stat">
            <div className="stat-icon"><RefreshCw size={18} /></div>
            <div>
              <span>Laatst opgeslagen</span>
              <strong>{updatedLabel}</strong>
            </div>
          </article>
        </section>

        {status ? <div className="save-status">{status}</div> : null}

        <section className="card panel prices-card">
          <div className="top-row">
            <div>
              <div className="eyebrow">Licentie</div>
              <h2 className="headline">Pakketprijzen</h2>
            </div>
          </div>

          <div className="price-table-wrap">
            <table className="price-table">
              <thead>
                <tr>
                  <th>Regel</th>
                  {editablePackages.map((packageConfig) => <th key={packageConfig.key}>{packageConfig.name}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="price-section-row"><td colSpan={editablePackages.length + 1}>Licentie</td></tr>
                <tr>
                  <td>Licentie eerste gebruiker</td>
                  {editablePackages.map((packageConfig) => (
                    <td key={`${packageConfig.key}-licenseFirst`}>
                      <PriceInput
                        label={`${packageConfig.name} licentie eerste gebruiker`}
                        value={packageConfig.licenseFirst}
                        onChange={(value) => updatePackage(packageConfig.key, "licenseFirst", value)}
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Per extra gebruiker</td>
                  {editablePackages.map((packageConfig) => (
                    <td key={`${packageConfig.key}-licenseExtra`}>
                      <PriceInput
                        label={`${packageConfig.name} licentie extra gebruiker`}
                        value={packageConfig.licenseExtra}
                        onChange={(value) => updatePackage(packageConfig.key, "licenseExtra", value)}
                      />
                    </td>
                  ))}
                </tr>

                <tr className="price-section-row"><td colSpan={editablePackages.length + 1}>Onbeperkte support</td></tr>
                <tr>
                  <td>Prijs eerste gebruiker</td>
                  {editablePackages.map((packageConfig) => (
                    <td key={`${packageConfig.key}-supportFirst`}>
                      <PriceInput
                        label={`${packageConfig.name} support eerste gebruiker`}
                        value={packageConfig.supportFirst}
                        onChange={(value) => updatePackage(packageConfig.key, "supportFirst", value)}
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Prijs volgende gebruiker</td>
                  {editablePackages.map((packageConfig) => (
                    <td key={`${packageConfig.key}-supportExtra`}>
                      <PriceInput
                        label={`${packageConfig.name} support volgende gebruiker`}
                        value={packageConfig.supportExtra}
                        onChange={(value) => updatePackage(packageConfig.key, "supportExtra", value)}
                      />
                    </td>
                  ))}
                </tr>

                <tr className="price-section-row"><td colSpan={editablePackages.length + 1}>Implementatie & training</td></tr>
                <tr>
                  <td>Dagtarief implementatie</td>
                  <td colSpan={editablePackages.length}>
                    <PriceInput
                      label="Dagtarief implementatie"
                      value={draftConfig.implementationDayRate}
                      onChange={(value) => updateDraft((currentConfig) => ({ ...currentConfig, implementationDayRate: value }))}
                    />
                  </td>
                </tr>
                {implementationTiers.map((tier, tierIndex) => (
                  <Fragment key={`implementation-tier-${tierIndex}`}>
                    <tr key={`implementation-price-${tierIndex}`}>
                      <td>{formatTierLabel(tier.maxUsers)}</td>
                      {editablePackages.map((packageConfig) => {
                        const packageTier = packageConfig.implementationVisits[tierIndex] ?? tier;
                        const amount = getVisitsForUsers(packageConfig, packageTier.maxUsers) * draftConfig.implementationDayRate;

                        return <td key={`${packageConfig.key}-implementation-${tierIndex}`}>{euro.format(amount)}</td>;
                      })}
                    </tr>
                    <tr key={`implementation-visits-${tierIndex}`}>
                      <td>Aantal bezoeken</td>
                      {editablePackages.map((packageConfig) => (
                        <td key={`${packageConfig.key}-visits-${tierIndex}`}>
                          <PriceInput
                            label={`${packageConfig.name} bezoeken ${formatTierLabel(tier.maxUsers)}`}
                            step={1}
                            value={packageConfig.implementationVisits[tierIndex]?.visits ?? 0}
                            onChange={(value) => updatePackageVisits(packageConfig.key, tierIndex, value)}
                          />
                        </td>
                      ))}
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card panel prices-card">
          <div className="top-row">
            <div>
              <div className="eyebrow">Modules</div>
              <h2 className="headline">Moduleprijzen en setup</h2>
            </div>
          </div>

          <div className="price-table-wrap">
            <table className="price-table">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Vereiste</th>
                  <th>Prijs p/m</th>
                  <th>Geen pakketwissel</th>
                  <th>Setupkosten</th>
                </tr>
              </thead>
              <tbody>
                {draftConfig.modules.map((moduleConfig) => (
                  <tr key={moduleConfig.key}>
                    <td>{moduleConfig.name}</td>
                    <td>
                      <TextPriceInput
                        label={`${moduleConfig.name} vereiste`}
                        value={moduleConfig.dependencyNote ?? ""}
                        onChange={(value) => updateModule(moduleConfig.key, "dependencyNote", value || null)}
                      />
                    </td>
                    <td>
                      <PriceInput
                        label={`${moduleConfig.name} maandprijs`}
                        value={moduleConfig.monthlyPrice}
                        onChange={(value) => updateModule(moduleConfig.key, "monthlyPrice", value)}
                      />
                    </td>
                    <td>
                      <label className="price-checkbox">
                        <input
                          type="checkbox"
                          checked={Boolean(moduleConfig.noPackageSwitch)}
                          onChange={(event) => updateModule(moduleConfig.key, "noPackageSwitch", event.target.checked)}
                        />
                        Geen pakketwissel nodig
                      </label>
                    </td>
                    <td>
                      <PriceInput
                        label={`${moduleConfig.name} setupkosten`}
                        value={moduleConfig.setupCost ?? 0}
                        onChange={(value) => updateModule(moduleConfig.key, "setupCost", value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card panel prices-card">
          <div className="top-row">
            <div>
              <div className="eyebrow">Uitbreidingen</div>
              <h2 className="headline">Klantportaal, Smart Connect en overige prijzen</h2>
            </div>
          </div>

          <div className="price-table-wrap">
            <table className="price-table compact">
              <thead>
                <tr>
                  <th>Onderdeel</th>
                  <th>Prijs</th>
                </tr>
              </thead>
              <tbody>
                <tr className="price-section-row"><td colSpan={2}>Klantportaal</td></tr>
                {draftConfig.customerPortalOptions.map((option) => (
                  <tr key={option.key}>
                    <td>{option.name}</td>
                    <td>
                      <PriceInput
                        label={`${option.name} maandprijs`}
                        value={option.monthlyPrice}
                        onChange={(value) => updateCustomerPortalOption(option.key, value)}
                      />
                    </td>
                  </tr>
                ))}

                <tr className="price-section-row"><td colSpan={2}>Smart Connect</td></tr>
                {draftConfig.smartConnectTiers.map((tier, index) => (
                  <tr key={tier.connections}>
                    <td>Smart Connect - {tier.connections} {tier.connections === 1 ? "connectie" : "connecties"}</td>
                    <td>
                      <PriceInput
                        label={`Smart Connect ${tier.connections} connecties`}
                        value={tier.monthlyPrice}
                        onChange={(value) => updateSmartConnectTier(index, value)}
                      />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>Smart Connect extra connectie vanaf 11e connectie</td>
                  <td>
                    <PriceInput
                      label="Smart Connect extra connectie"
                      value={draftConfig.smartConnectExtraConnectionPrice}
                      onChange={(value) => updateDraft((currentConfig) => ({ ...currentConfig, smartConnectExtraConnectionPrice: value }))}
                    />
                  </td>
                </tr>

                <tr className="price-section-row"><td colSpan={2}>Planningapp</td></tr>
                <tr>
                  <td>Planningapp gebruiker</td>
                  <td>
                    <PriceInput
                      label="Planningapp gebruiker"
                      value={draftConfig.planningAppUserMonthly}
                      onChange={(value) => updateDraft((currentConfig) => ({ ...currentConfig, planningAppUserMonthly: value }))}
                    />
                  </td>
                </tr>

                <tr className="price-section-row"><td colSpan={2}>Twinfield</td></tr>
                <tr>
                  <td>Twinfield connectie</td>
                  <td>
                    <PriceInput
                      label="Twinfield connectie"
                      value={draftConfig.twinfieldConnectionMonthly}
                      onChange={(value) => updateDraft((currentConfig) => ({ ...currentConfig, twinfieldConnectionMonthly: value }))}
                    />
                  </td>
                </tr>

                <tr className="price-section-row"><td colSpan={2}>Service kosten per jaar</td></tr>
                {draftConfig.serviceCostOptions.map((option) => (
                  <tr key={option.key}>
                    <td>{option.name}</td>
                    <td>
                      <PriceInput
                        label={`${option.name} servicekosten per jaar`}
                        value={option.annualPrice}
                        onChange={(value) => updateServiceCostOption(option.key, value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
