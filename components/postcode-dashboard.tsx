"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, RefreshCw, Save, ShieldAlert, Table2 } from "lucide-react";
import {
  DEFAULT_PRICE_CONFIG,
  normalizePricingConfig,
  type EditablePricingConfig,
  type PostcodeRegion,
} from "@/lib/price-config";
import { euro } from "@/lib/pricing";
import { getSupabaseClient } from "@/lib/supabase";
import {
  ROLE_TAB_ACCESS,
  canAccessTab,
  canWriteTab,
  normalizeRoleTabAccess,
  type RoleTabAccessMap,
} from "@/lib/role-tabs";
import { useAuth } from "@/components/auth-provider";
import { usePricingConfig } from "@/components/pricing-provider";
import { StatusPill } from "@/components/ui";

type PricesResponse = {
  error?: string;
  pricingConfig?: unknown;
};

type PostcodeFilters = {
  postcode: string;
  description: string;
  region: string;
  kilometers: string;
  price: string;
};

const EMPTY_FILTERS: PostcodeFilters = {
  postcode: "",
  description: "",
  region: "",
  kilometers: "",
  price: "",
};

function clonePricingConfig(config: EditablePricingConfig) {
  return normalizePricingConfig(JSON.parse(JSON.stringify(config)) as unknown);
}

function formatFixedNumber(value: number, decimals: number) {
  return new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(value) ? value : 0);
}

function parseFixedNumber(value: string) {
  const compactValue = value.replace(/\s/g, "");
  const normalizedValue = compactValue.includes(",")
    ? compactValue.replace(/\./g, "").replace(",", ".")
    : compactValue;
  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function roundToDecimals(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function NumberCellInput({
  label,
  value,
  onChange,
  decimals = 0,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  decimals?: number;
  disabled?: boolean;
}) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const formattedValue = formatFixedNumber(safeValue, decimals);
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(formattedValue);

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(formatFixedNumber(safeValue, decimals));
    }
  }, [decimals, isEditing, safeValue]);

  function handleBlur() {
    const roundedValue = roundToDecimals(parseFixedNumber(draftValue), decimals);
    setIsEditing(false);
    setDraftValue(formatFixedNumber(roundedValue, decimals));
    onChange(roundedValue);
  }

  return (
    <input
      aria-label={label}
      className="price-table-input price-table-input-number"
      disabled={disabled}
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      type="text"
      value={draftValue}
      onBlur={handleBlur}
      onChange={(event) => setDraftValue(event.target.value)}
      onFocus={() => {
        setIsEditing(true);
        setDraftValue(formattedValue);
      }}
    />
  );
}

function TextCellInput({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      aria-label={label}
      className="price-table-input text postcode-description-input"
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export default function PostcodeDashboard() {
  const { role } = useAuth();
  const router = useRouter();
  const supabase = getSupabaseClient();
  const { pricingConfig, refreshPricingConfig } = usePricingConfig();
  const [draftConfig, setDraftConfig] = useState<EditablePricingConfig>(DEFAULT_PRICE_CONFIG);
  const [roleTabAccess, setRoleTabAccess] = useState<RoleTabAccessMap>(ROLE_TAB_ACCESS);
  const [roleAccessLoading, setRoleAccessLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [filters, setFilters] = useState<PostcodeFilters>(EMPTY_FILTERS);
  const canViewPostcode = canAccessTab(role, "postcode", roleTabAccess);
  const canEditPostcode = canWriteTab(role, "postcode", roleTabAccess);

  const regionCount = useMemo(
    () => new Set(draftConfig.postcodeRegions.map((row) => row.region)).size,
    [draftConfig.postcodeRegions],
  );
  const travelPriceByRegion = useMemo(
    () => new Map(draftConfig.travelCostRegions.map((travelRegion) => [travelRegion.region, travelRegion.price])),
    [draftConfig.travelCostRegions],
  );
  const filteredPostcodeRows = useMemo(() => {
    return draftConfig.postcodeRegions
      .map((row, index) => ({ row, index, price: travelPriceByRegion.get(row.region) ?? null }))
      .filter(({ row, price }) => {
        const postcodeLabel = String(row.postcode);
        const descriptionLabel = row.description.toLowerCase();
        const regionLabel = String(row.region);
        const kilometersLabel = formatFixedNumber(row.kilometers, 0);
        const priceLabel = price === null ? "" : euro.format(price);

        return (
          postcodeLabel.includes(filters.postcode.trim()) &&
          descriptionLabel.includes(filters.description.trim().toLowerCase()) &&
          regionLabel.includes(filters.region.trim()) &&
          kilometersLabel.includes(filters.kilometers.trim()) &&
          priceLabel.toLowerCase().includes(filters.price.trim().toLowerCase())
        );
      });
  }, [draftConfig.postcodeRegions, filters, travelPriceByRegion]);
  const updatedLabel = draftConfig.updatedAt
    ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(draftConfig.updatedAt))
    : "Nog niet opgeslagen";

  useEffect(() => {
    setDraftConfig(clonePricingConfig(pricingConfig));
    setLoading(false);
  }, [pricingConfig]);

  useEffect(() => {
    if (!role) return;

    let active = true;
    setRoleAccessLoading(true);

    async function loadRoleTabAccess() {
      try {
        const response = await fetch("/api/admin/role-tabs", { cache: "no-store" });
        const json = (await response.json().catch(() => ({}))) as { roleTabAccess?: unknown };

        if (active && response.ok) {
          setRoleTabAccess(normalizeRoleTabAccess(json.roleTabAccess));
        }
      } catch {
        if (active) {
          setRoleTabAccess(ROLE_TAB_ACCESS);
        }
      } finally {
        if (active) setRoleAccessLoading(false);
      }
    }

    function handleRoleTabAccessUpdated(event: Event) {
      setRoleTabAccess(normalizeRoleTabAccess((event as CustomEvent).detail));
    }

    void loadRoleTabAccess();
    window.addEventListener("role-tab-access-updated", handleRoleTabAccessUpdated);

    return () => {
      active = false;
      window.removeEventListener("role-tab-access-updated", handleRoleTabAccessUpdated);
    };
  }, [role]);

  function updateDraft(updater: (currentConfig: EditablePricingConfig) => EditablePricingConfig) {
    setDraftConfig((currentConfig) => normalizePricingConfig(updater(clonePricingConfig(currentConfig))));
  }

  function updatePostcodeRow(index: number, values: Partial<PostcodeRegion>) {
    updateDraft((currentConfig) => ({
      ...currentConfig,
      postcodeRegions: currentConfig.postcodeRegions.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...values } : row,
      ),
    }));
  }

  function updateFilter(filterKey: keyof PostcodeFilters, value: string) {
    setFilters((currentFilters) => ({ ...currentFilters, [filterKey]: value }));
  }

  async function reloadPostcodes() {
    setLoading(true);
    setStatus("Postcodes worden geladen...");
    await refreshPricingConfig();
    setStatus("Postcodes opnieuw geladen.");
    setLoading(false);
  }

  async function savePostcodes() {
    if (!canEditPostcode) {
      setStatus("Je hebt alleen leesrechten voor Postcode.");
      return;
    }

    if (!supabase) {
      setStatus("Supabase client ontbreekt.");
      return;
    }

    setSaving(true);
    setStatus("Postcodes worden opgeslagen...");

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
        body: JSON.stringify({ pricingConfig: draftConfig, tabKey: "postcode" }),
      });

      const json = (await response.json().catch(() => ({}))) as PricesResponse;

      if (!response.ok) {
        throw new Error(json.error || "Postcodes opslaan mislukt.");
      }

      const savedConfig = normalizePricingConfig(json.pricingConfig ?? draftConfig);
      setDraftConfig(savedConfig);
      window.dispatchEvent(new CustomEvent("pricing-config-updated", { detail: savedConfig }));
      setStatus("Postcodes opgeslagen.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Postcodes opslaan mislukt.");
    } finally {
      setSaving(false);
    }
  }

  if (roleAccessLoading) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="top-row">
              <div>
                <div className="eyebrow">Postcode</div>
                <h1>Postcodes worden geladen...</h1>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (!canViewPostcode) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="top-row">
              <div>
                <div className="eyebrow">Geen toegang</div>
                <h1>Postcode</h1>
                <p className="subtext">Je rol heeft geen leesrechten voor deze pagina.</p>
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
            <h1>Postcode</h1>
            <p>Beheer de postcode-indeling voor regio en kilometers vanuit de reiskostenlijst.</p>
          </div>

          <div className="brand-actions">
            <StatusPill tone={loading ? "warning" : "success"}>{loading ? "Laden" : canEditPostcode ? "Schrijven" : "Lezen"}</StatusPill>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void reloadPostcodes()}
              disabled={loading || saving}
            >
              <RefreshCw size={16} />
              Vernieuwen
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => void savePostcodes()}
              disabled={loading || saving || !canEditPostcode}
            >
              <Save size={16} />
              {saving ? "Opslaan..." : "Opslaan"}
            </button>
          </div>
        </header>

        <section className="deals-stat-grid">
          <article className="deals-stat">
            <div className="stat-icon"><Table2 size={18} /></div>
            <div>
              <span>Postcoderegels</span>
              <strong>{draftConfig.postcodeRegions.length}</strong>
            </div>
          </article>
          <article className="deals-stat">
            <div className="stat-icon"><MapPin size={18} /></div>
            <div>
              <span>Regio&apos;s</span>
              <strong>{regionCount}</strong>
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
              <div className="eyebrow">Postcode</div>
              <h2 className="headline">Overzicht eerste 2 cijfers postcode</h2>
            </div>
          </div>

          <div className="price-table-wrap">
            <table className="price-table postcode-table">
              <thead>
                <tr>
                  <th className="price-table-money-cell">Postcode</th>
                  <th>Omschrijving</th>
                  <th className="price-table-money-cell">Regio</th>
                  <th className="price-table-money-cell">Kilometers</th>
                  <th className="price-table-money-cell">Prijs</th>
                </tr>
                <tr className="price-filter-row">
                  <th>
                    <input
                      aria-label="Filter op postcode"
                      className="price-table-filter-input price-table-input-number"
                      placeholder="Filter"
                      value={filters.postcode}
                      onChange={(event) => updateFilter("postcode", event.target.value)}
                    />
                  </th>
                  <th>
                    <input
                      aria-label="Filter op omschrijving"
                      className="price-table-filter-input"
                      placeholder="Filter"
                      value={filters.description}
                      onChange={(event) => updateFilter("description", event.target.value)}
                    />
                  </th>
                  <th>
                    <input
                      aria-label="Filter op regio"
                      className="price-table-filter-input price-table-input-number"
                      placeholder="Filter"
                      value={filters.region}
                      onChange={(event) => updateFilter("region", event.target.value)}
                    />
                  </th>
                  <th>
                    <input
                      aria-label="Filter op kilometers"
                      className="price-table-filter-input price-table-input-number"
                      placeholder="Filter"
                      value={filters.kilometers}
                      onChange={(event) => updateFilter("kilometers", event.target.value)}
                    />
                  </th>
                  <th>
                    <input
                      aria-label="Filter op prijs"
                      className="price-table-filter-input price-table-input-number"
                      placeholder="Filter"
                      value={filters.price}
                      onChange={(event) => updateFilter("price", event.target.value)}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPostcodeRows.map(({ row: postcodeRow, index, price }) => (
                  <tr key={`postcode-row-${index}`}>
                    <td className="price-table-money-cell">
                      <NumberCellInput
                        label={`Postcode regel ${index + 1}`}
                        value={postcodeRow.postcode}
                        disabled={!canEditPostcode}
                        onChange={(value) => updatePostcodeRow(index, { postcode: value })}
                      />
                    </td>
                    <td>
                      <TextCellInput
                        label={`Omschrijving postcode ${postcodeRow.postcode}`}
                        value={postcodeRow.description}
                        disabled={!canEditPostcode}
                        onChange={(value) => updatePostcodeRow(index, { description: value })}
                      />
                    </td>
                    <td className="price-table-money-cell">
                      <NumberCellInput
                        label={`Regio postcode ${postcodeRow.postcode}`}
                        value={postcodeRow.region}
                        disabled={!canEditPostcode}
                        onChange={(value) => updatePostcodeRow(index, { region: value })}
                      />
                    </td>
                    <td className="price-table-money-cell">
                      <NumberCellInput
                        label={`Kilometers postcode ${postcodeRow.postcode}`}
                        value={postcodeRow.kilometers}
                        disabled={!canEditPostcode}
                        onChange={(value) => updatePostcodeRow(index, { kilometers: value })}
                      />
                    </td>
                    <td className="price-table-money-cell price-table-static-money">
                      {price === null ? "Niet gevonden" : euro.format(price)}
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
