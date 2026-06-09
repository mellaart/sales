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
import { canManageRoles, getSupabaseClient } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { usePricingConfig } from "@/components/pricing-provider";
import { StatusPill } from "@/components/ui";

type PricesResponse = {
  error?: string;
  pricingConfig?: unknown;
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
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  decimals?: number;
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      aria-label={label}
      className="price-table-input text postcode-description-input"
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const regionCount = useMemo(
    () => new Set(draftConfig.postcodeRegions.map((row) => row.region)).size,
    [draftConfig.postcodeRegions],
  );
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

  function updatePostcodeRow(index: number, values: Partial<PostcodeRegion>) {
    updateDraft((currentConfig) => ({
      ...currentConfig,
      postcodeRegions: currentConfig.postcodeRegions.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...values } : row,
      ),
    }));
  }

  async function reloadPostcodes() {
    setLoading(true);
    setStatus("Postcodes worden geladen...");
    await refreshPricingConfig();
    setStatus("Postcodes opnieuw geladen.");
    setLoading(false);
  }

  async function savePostcodes() {
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
        body: JSON.stringify({ pricingConfig: draftConfig }),
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

  if (!canManageRoles(role)) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="top-row">
              <div>
                <div className="eyebrow">Geen toegang</div>
                <h1>Postcode</h1>
                <p className="subtext">Alleen admin gebruikers mogen postcodes bekijken en aanpassen.</p>
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
            <StatusPill tone={loading ? "warning" : "success"}>{loading ? "Laden" : "Admin only"}</StatusPill>
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
              disabled={loading || saving}
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
                </tr>
              </thead>
              <tbody>
                {draftConfig.postcodeRegions.map((postcodeRow, index) => (
                  <tr key={`postcode-row-${index}`}>
                    <td className="price-table-money-cell">
                      <NumberCellInput
                        label={`Postcode regel ${index + 1}`}
                        value={postcodeRow.postcode}
                        onChange={(value) => updatePostcodeRow(index, { postcode: value })}
                      />
                    </td>
                    <td>
                      <TextCellInput
                        label={`Omschrijving postcode ${postcodeRow.postcode}`}
                        value={postcodeRow.description}
                        onChange={(value) => updatePostcodeRow(index, { description: value })}
                      />
                    </td>
                    <td className="price-table-money-cell">
                      <NumberCellInput
                        label={`Regio postcode ${postcodeRow.postcode}`}
                        value={postcodeRow.region}
                        onChange={(value) => updatePostcodeRow(index, { region: value })}
                      />
                    </td>
                    <td className="price-table-money-cell">
                      <NumberCellInput
                        label={`Kilometers postcode ${postcodeRow.postcode}`}
                        decimals={2}
                        value={postcodeRow.kilometers}
                        onChange={(value) => updatePostcodeRow(index, { kilometers: value })}
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
