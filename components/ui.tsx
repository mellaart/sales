"use client";

import type { ReactNode } from "react";
import { NumberStepper } from "@/components/number-stepper";

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="input-wrap">
      <span className="input-label">{label}</span>
      <input
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="input-wrap">
      <span className="input-label">{label}</span>
      <NumberStepper
        ariaLabel={label}
        value={value}
        step={step}
        onChange={onChange}
      />
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="input-wrap">
      <span className="input-label">{label}</span>
      <textarea
        className="textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="toggle-row">
      <span className="toggle-label">{label}</span>
      <button
        type="button"
        className={`toggle-button ${checked ? "active" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-dot" />
      </button>
    </div>
  );
}

export function StatusPill({
  children,
  tone = "success",
}: {
  children: ReactNode;
  tone?: "success" | "warning" | "danger" | "neutral";
}) {
  const safeTone = tone === "neutral" ? "success" : tone;
  return <span className={`status-pill ${safeTone}`}>{children}</span>;
}

export function StatCard({
  title,
  value,
  sublabel,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: string;
  sublabel?: string;
  subtitle?: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="stat-card">
      <div className="stat-card-inner">
        {Icon ? (
          <div className="stat-icon">
            <Icon size={20} />
          </div>
        ) : null}

        <div>
          <div className="kpi-title">{title}</div>
          <div className="kpi-value">{value}</div>
          {sublabel || subtitle ? (
            <div className="kpi-subtitle">{sublabel || subtitle}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
