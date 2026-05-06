import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

export function StatCard({ title, value, icon: Icon, sublabel }: { title: string; value: string; icon: LucideIcon; sublabel?: string }) {
  return (
    <div className="card stat-card">
      <div className="stat-row">
        <div className="icon-pill"><Icon size={18} /></div>
        <div>
          <div className="kpi-title">{title}</div>
          <div className="big-number">{value}</div>
        </div>
      </div>
      {sublabel ? <div className="muted small-gap">{sublabel}</div> : null}
    </div>
  );
}

export function NumberInput({ label, value, onChange, min = 0, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; step?: number }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input className="input" type="number" min={min} step={step} value={value} onChange={(e) => onChange(Number(e.target.value || 0))} />
    </label>
  );
}

export function TextInput({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input className="input" type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function TextArea({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <textarea className="input textarea" rows={4} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span className="label no-margin">{label}</span>
      <button type="button" className={`toggle ${checked ? "on" : "off"}`} onClick={() => onChange(!checked)}>
        <span className={`toggle-knob ${checked ? "right" : "left"}`} />
      </button>
    </label>
  );
}

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" }) {
  return <div className={`status-pill ${tone}`}>{children}</div>;
}
