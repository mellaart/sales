"use client";

import { useRef, useState } from "react";
import { Building2 } from "lucide-react";
import { NumberStepper } from "@/components/number-stepper";
import { euro, type PackageConfig } from "@/lib/pricing";
import { EXTRA_ADMINISTRATION_MONTHLY_PRICES, getExtraAdministrationLines } from "@/lib/extra-administrations";

export default function ExtraAdministrationsEditor({ value, onChange, names, onNamesChange, onSave, packageConfig, includeSupport }: {
  onSave: () => Promise<boolean>;
  names: string[];
  onNamesChange: (names: string[]) => void;
  value: number;
  onChange: (value: number) => void;
  packageConfig: PackageConfig;
  includeSupport: boolean;
}) {
  const [saveStatus, setSaveStatus] = useState("");
  const saveVersion = useRef(0);
  async function saveNames() {
    const version = ++saveVersion.current;
    setSaveStatus("Administratienamen opslaan...");
    try {
      const saved = await onSave();
      if (version === saveVersion.current) setSaveStatus(saved ? "Administratienamen opgeslagen." : "Opslaan mislukt. Probeer opnieuw via Opslaan.");
    } catch {
      if (version === saveVersion.current) setSaveStatus("Opslaan mislukt. Probeer opnieuw via Opslaan.");
    }
  }
  const price = EXTRA_ADMINISTRATION_MONTHLY_PRICES[packageConfig.key];
  const lines = getExtraAdministrationLines(packageConfig, value, price, includeSupport);
  return (
    <div className="section">
      <div className="section-title"><Building2 size={16} /> Extra administraties</div>
      <p className="subtext">Voeg extra administraties toe aan deze klant. Bij support rekenen we één gebruikerssupportcontract per extra administratie.</p>
      <label className="input-wrap">
        <span className="input-label">Aantal extra administraties</span>
        <NumberStepper ariaLabel="Aantal extra administraties" min={0} value={value} onChange={(next) => onChange(Number.isFinite(next) ? Math.min(1000, Math.max(0, Math.floor(next))) : 0)} />
      </label>
      {Array.from({ length: value }, (_, index) => (
        <label className="input-wrap" key={index}>
          <span className="input-label">Administratienaam {index + 1}</span>
          <input className="input" value={names[index] ?? ""} placeholder={`Naam extra administratie ${index + 1}`}
            onBlur={() => void saveNames()}
            onChange={(event) => {
              ++saveVersion.current;
              setSaveStatus("");
              const nextNames = Array.from({ length: value }, (_, position) => names[position] ?? "");
              nextNames[index] = event.target.value;
              onNamesChange(nextNames);
            }} />
        </label>
      ))}
      {saveStatus ? <div className="save-status" role="status">{saveStatus}</div> : null}
      <p className="subtext">Smart Trade {packageConfig.name}: {euro.format(price)} per administratie per maand{includeSupport ? ` + ${euro.format(packageConfig.supportExtra)} support` : ""}.</p>
      {value > 0 ? <div className="summary-list">
        {lines.map((line) => <div key={line.label}><span>{line.quantity}× {line.label}</span><strong>{euro.format(line.amount)} p/m</strong></div>)}
        <div className="total-row"><span>Extra administraties totaal</span><strong>{euro.format(lines.reduce((sum, line) => sum + line.amount, 0))} p/m</strong></div>
      </div> : null}
    </div>
  );
}
