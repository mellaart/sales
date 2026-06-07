"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

type NumberStepperProps = {
  ariaLabel: string;
  className?: string;
  inputClassName?: string;
  min?: number;
  max?: number;
  size?: "default" | "compact";
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

function getStepPrecision(step: number) {
  const [, decimals = ""] = String(step).split(".");
  return decimals.length;
}

export function NumberStepper({
  ariaLabel,
  className = "",
  inputClassName = "",
  min,
  max,
  size = "default",
  step = 1,
  value,
  onChange,
}: NumberStepperProps) {
  const canIncrease = typeof max !== "number" || value < max;
  const canDecrease = typeof min !== "number" || value > min;

  const updateValue = (nextValue: number) => {
    const precision = getStepPrecision(step);
    const roundedValue = precision > 0 ? Number(nextValue.toFixed(precision)) : nextValue;
    onChange(clampValue(roundedValue, min, max));
  };

  return (
    <div className={`number-stepper number-stepper--${size} ${className}`.trim()}>
      <input
        aria-label={ariaLabel}
        className={`input number-stepper-input ${inputClassName}`.trim()}
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
