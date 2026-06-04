"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

type NumberStepperProps = {
  ariaLabel: string;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
};

function clampValue(value: number, min?: number, max?: number) {
  let nextValue = Number.isFinite(value) ? value : 0;

  if (typeof min === "number") nextValue = Math.max(min, nextValue);
  if (typeof max === "number") nextValue = Math.min(max, nextValue);

  return nextValue;
}

export function NumberStepper({
  ariaLabel,
  className = "",
  min,
  max,
  step = 1,
  value,
  onChange,
}: NumberStepperProps) {
  const canIncrease = typeof max !== "number" || value < max;
  const canDecrease = typeof min !== "number" || value > min;

  const updateValue = (nextValue: number) => {
    onChange(clampValue(nextValue, min, max));
  };

  return (
    <div className={`number-stepper ${className}`.trim()}>
      <input
        aria-label={ariaLabel}
        className="input number-stepper-input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => updateValue(Number(event.target.value || 0))}
      />
      <div className="number-stepper-controls">
        <button
          type="button"
          aria-label={`Verhoog ${ariaLabel}`}
          disabled={!canIncrease}
          tabIndex={-1}
          onClick={() => updateValue(value + step)}
        >
          <ChevronUp size={14} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          aria-label={`Verlaag ${ariaLabel}`}
          disabled={!canDecrease}
          tabIndex={-1}
          onClick={() => updateValue(value - step)}
        >
          <ChevronDown size={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
