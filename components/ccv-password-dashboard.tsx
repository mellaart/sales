"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Copy, KeyRound, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { StatusPill } from "@/components/ui";
import {
  ROLE_TAB_ACCESS,
  canAccessTab,
  normalizeRoleTabAccess,
  type RoleTabAccessMap,
} from "@/lib/role-tabs";

function calculateCcvPassword(now: Date) {
  const day = now.getDate();
  const hour = now.getHours();
  const dayAndHour = day + hour;
  const source = String(dayAndHour + 2);
  const reversed = source.split("").reverse().join("");
  const firstValue = Number(reversed.charAt(0)) - 1;
  const firstDigit = firstValue === -1 ? 9 : firstValue;
  const lastValue = Number(reversed.charAt(reversed.length - 1)) + 1;
  const lastDigit = lastValue === 9 ? 0 : lastValue;

  return {
    day,
    hour,
    password: `${firstDigit}${reversed}${lastDigit}`,
  };
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default function CcvPasswordDashboard() {
  const { role } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [roleTabAccess, setRoleTabAccess] = useState<RoleTabAccessMap>(ROLE_TAB_ACCESS);
  const [accessLoaded, setAccessLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const canView = canAccessTab(role, "ccv", roleTabAccess);
  const calculation = useMemo(() => calculateCcvPassword(now), [now]);

  useEffect(() => {
    let active = true;

    async function loadRoleTabAccess() {
      try {
        const response = await fetch("/api/admin/role-tabs", { cache: "no-store" });
        const json = await response.json().catch(() => ({})) as { roleTabAccess?: unknown };
        if (active && response.ok) setRoleTabAccess(normalizeRoleTabAccess(json.roleTabAccess));
      } catch {
        if (active) setRoleTabAccess(ROLE_TAB_ACCESS);
      } finally {
        if (active) setAccessLoaded(true);
      }
    }

    function handleRoleTabAccessUpdated(event: Event) {
      setRoleTabAccess(normalizeRoleTabAccess((event as CustomEvent).detail));
      setAccessLoaded(true);
    }

    void loadRoleTabAccess();
    window.addEventListener("role-tab-access-updated", handleRoleTabAccessUpdated);
    return () => {
      active = false;
      window.removeEventListener("role-tab-access-updated", handleRoleTabAccessUpdated);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(calculation.password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  }

  if (!accessLoaded) {
    return <div className="save-status">CCV wordt geladen...</div>;
  }

  if (!canView) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="eyebrow">Geen toegang</div>
            <h1>CCV</h1>
            <p className="subtext">Je rol heeft geen toegang tot deze pagina.</p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="container ccv-page">
        <header className="brand-hero card ccv-hero">
          <div>
            <div className="brand-mark">Pin</div>
            <h1>CCV</h1>
            <p>Bereken het actuele CCV-wachtwoord.</p>
          </div>
          <StatusPill tone="success"><Clock3 size={15} /> Actueel</StatusPill>
        </header>

        <section className="card panel ccv-password-panel">
          <div className="ccv-password-heading">
            <div>
              <div className="eyebrow">Berekend wachtwoord</div>
              <h2>CCV-wachtwoord</h2>
              <p>{formatDateTime(now)}</p>
            </div>
            <div className="icon-badge"><KeyRound size={27} /></div>
          </div>

          <div className="ccv-password-value" aria-label="Berekend CCV-wachtwoord">
            {calculation.password}
          </div>

          <div className="ccv-password-actions">
            <button type="button" className="primary-button" onClick={() => void copyPassword()}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Gekopieerd" : "Kopieer wachtwoord"}
            </button>
            <button type="button" className="secondary-button" onClick={() => setNow(new Date())}>
              <RefreshCw size={16} /> Vernieuwen
            </button>
          </div>

          <div className="ccv-password-details">
            <span>Dag<strong>{calculation.day}</strong></span>
            <span>Uur<strong>{String(calculation.hour).padStart(2, "0")}</strong></span>
          </div>
        </section>
      </div>
    </div>
  );
}
