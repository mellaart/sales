"use client";

import { Plus, Trash2 } from "lucide-react";
import { NumberStepper } from "@/components/number-stepper";
import {
  createDevelopmentLine,
  getDevelopmentTotal,
  type DevelopmentLine,
} from "@/lib/development-lines";
import { euro } from "@/lib/pricing";

export default function DevelopmentLinesEditor({
  lines,
  hourlyRate,
  onChange,
}: {
  lines: DevelopmentLine[];
  hourlyRate: number;
  onChange: (lines: DevelopmentLine[]) => void;
}) {
  function updateLine(lineId: string, changes: Partial<DevelopmentLine>) {
    onChange(lines.map((line) => line.id === lineId ? { ...line, ...changes } : line));
  }

  return (
    <div className="development-lines-editor">
      <div className="development-lines-toolbar">
        <span>{euro.format(hourlyRate)} per uur</span>
        <button
          type="button"
          className="secondary-button development-add-button"
          onClick={() => onChange([...lines, createDevelopmentLine()])}
        >
          <Plus size={17} /> Ontwikkeling toevoegen
        </button>
      </div>

      {lines.length === 0 ? (
        <div className="development-lines-empty">
          Nog geen ontwikkelingen toegevoegd.
        </div>
      ) : (
        <div className="development-lines-list">
          {lines.map((line, index) => (
            <div className="development-line-row" key={line.id}>
              <label className="input-wrap development-description-field">
                <span className="input-label">Omschrijving</span>
                <input
                  className="input"
                  value={line.description}
                  onChange={(event) => updateLine(line.id, { description: event.target.value })}
                  placeholder={`Bijv. maatwerkontwikkeling ${index + 1}`}
                />
              </label>

              <label className="input-wrap development-hours-field">
                <span className="input-label">Aantal uren</span>
                <NumberStepper
                  ariaLabel={`Aantal uren ontwikkeling ${index + 1}`}
                  min={0}
                  step={0.5}
                  value={line.hours}
                  onChange={(hours) => updateLine(line.id, { hours })}
                />
              </label>

              <div className="input-wrap development-line-total">
                <span className="input-label">Bedrag</span>
                <strong>{euro.format(Math.max(0, line.hours) * hourlyRate)}</strong>
              </div>

              <button
                type="button"
                className="development-remove-button"
                title="Ontwikkeling verwijderen"
                aria-label={`Verwijder ontwikkeling ${index + 1}`}
                onClick={() => onChange(lines.filter((item) => item.id !== line.id))}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {lines.length > 0 ? (
        <div className="development-lines-summary">
          <span>Totaal ontwikkelingen</span>
          <strong>{euro.format(getDevelopmentTotal(lines, hourlyRate))}</strong>
        </div>
      ) : null}
    </div>
  );
}
