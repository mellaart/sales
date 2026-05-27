"use client";

import { useMemo, useState } from "react";
import { Boxes } from "lucide-react";
import { StatusPill } from "@/components/ui";
import { euro } from "@/lib/pricing";
import styles from "./assets-dashboard.module.css";

const SERVICE_COST_ANNUAL_PRICE = 175.8;
const SERVICE_COST_OPTIONS = [
  { key: "ccv", name: "CCV servicekosten" },
  { key: "worldline", name: "Worldline servicekosten" },
];

function getSafeQuantity(value: string) {
  return Math.max(0, Math.floor(Number(value || 0)));
}

export default function ServiceCostsStep() {
  const [quantities, setQuantities] = useState<Record<string, number>>({
    ccv: 0,
    worldline: 0,
  });

  const selectedRows = useMemo(
    () =>
      SERVICE_COST_OPTIONS.map((option) => ({
        ...option,
        quantity: quantities[option.key] ?? 0,
        annualTotal: (quantities[option.key] ?? 0) * SERVICE_COST_ANNUAL_PRICE,
      })).filter((option) => option.quantity > 0),
    [quantities],
  );

  const annualTotal = selectedRows.reduce((sum, option) => sum + option.annualTotal, 0);

  function handleQuantityChange(optionKey: string, value: string) {
    setQuantities((currentQuantities) => ({
      ...currentQuantities,
      [optionKey]: getSafeQuantity(value),
    }));
  }

  return (
    <div className="page-shell">
      <div className="container stack-4">
        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Stap 7</div>
              <h2 className="headline">Servicekosten</h2>
              <p className="subtext">
                Vul aantallen in voor CCV en Worldline. Beide zijn tegelijk mogelijk en hebben geen implementatiekosten.
              </p>
            </div>
            <div className="icon-badge">
              <Boxes size={26} />
            </div>
          </div>

          <div className={styles.upsellPanel}>
            <div className={styles.upsellSummary}>
              <div>
                <div className={styles.assetTitle}>Servicekosten offerte</div>
                <div className={styles.assetMeta}>{euro.format(SERVICE_COST_ANNUAL_PRICE)} per jaar per stuk</div>
              </div>
              <StatusPill tone={annualTotal > 0 ? "success" : "warning"}>
                {annualTotal > 0 ? "geselecteerd" : "nog niets geselecteerd"}
              </StatusPill>
            </div>

            <div className={styles.moduleSelectionSummary}>
              {SERVICE_COST_OPTIONS.map((option) => {
                const quantity = quantities[option.key] ?? 0;

                return (
                  <div key={option.key}>
                    <span>{option.name}</span>
                    <strong>{euro.format(SERVICE_COST_ANNUAL_PRICE)} per jaar</strong>
                    <label className={styles.upsellUserInput}>
                      <span>Aantal</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        value={quantity}
                        onChange={(event) => handleQuantityChange(option.key, event.target.value)}
                      />
                    </label>
                  </div>
                );
              })}
            </div>

            <div className={styles.quoteRows}>
              {selectedRows.length > 0 ? (
                selectedRows.map((option) => (
                  <div key={`service-${option.key}`} className={styles.quoteRow}>
                    <span>{option.quantity}x</span>
                    <strong>{option.name}</strong>
                    <span>{euro.format(SERVICE_COST_ANNUAL_PRICE)} p/j</span>
                    <strong>{euro.format(option.annualTotal)} p/j</strong>
                  </div>
                ))
              ) : (
                <div className="empty-state">Vul een aantal in voor CCV of Worldline.</div>
              )}
            </div>

            <div className={styles.quoteTotal}>
              <span>Servicekosten per jaar</span>
              <strong>{euro.format(annualTotal)} p/j</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
