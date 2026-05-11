"use client";

import type { ReactNode } from "react";

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
      <input
        className="input"
        type="number"
        value={value}
        step={step}
        onChange={(event) => onChange(Number(event.target.value || 0))}
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

export function StatusPill({
  children,
  tone = "success",
}: {
  children: ReactNode;
  tone?: "success" | "warning" | "danger";
}) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="stat-card-inner">
        {icon ? <div className="stat-icon">{icon}</div> : null}
        <div>
          <div className="kpi-title">{title}</div>
          <div className="kpi-value">{value}</div>
          {subtitle ? <div className="kpi-subtitle">{subtitle}</div> : null}
        </div>
      </div>
    </div>
  );
}