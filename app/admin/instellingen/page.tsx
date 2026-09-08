"use client";

import { useEffect, useState } from "react";
import { MessageSquare, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import styles from "./settings.module.css";

export default function SettingsPage() {
  const { role, loading: authLoading } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/settings", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || typeof data.smsRequired !== "boolean") throw new Error(data.error || "Instellingen laden mislukt.");
      setEnabled(data.smsRequired);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Instellingen laden mislukt.");
    } finally { setBusy(false); }
  }

  useEffect(() => { if (role === "admin") void load(); }, [role]);

  async function save(next: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smsRequired: next }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.smsRequired !== "boolean") throw new Error(data.error || "Opslaan mislukt.");
      setEnabled(data.smsRequired);
      setMessage("Instelling opgeslagen.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Opslaan mislukt.");
    } finally { setBusy(false); }
  }

  return <div className="page-shell"><main className="container stack-4">
    <header><div className="eyebrow">Admin</div><h1 className="headline">Instellingen</h1></header>
    {authLoading ? <p>Instellingen laden...</p> : role !== "admin" ? <p>Geen toegang.</p> : <>
      <section className={styles.row}>
        <MessageSquare size={24} aria-hidden="true" />
        <div className={styles.label}><h2 id="sms-setting">SMS klantenformulier</h2>
          <p id="sms-setting-description">{enabled === null ? "Instelling laden..." : enabled
            ? "Aan: mobiel nummer en sms-verificatie verplicht voor de implementatie-klantpagina."
            : "Uit: toegang via de geheime klantlink, zonder sms-verificatie of verplicht mobiel nummer."}</p>
        </div>
        <input className={styles.toggle} type="checkbox" role="switch" aria-labelledby="sms-setting"
          aria-describedby="sms-setting-description" checked={enabled === true} disabled={busy || enabled === null}
          onChange={(event) => void save(event.target.checked)} />
        <span className={styles.state}>{busy ? "Bezig..." : enabled === null ? "" : enabled ? "Aan" : "Uit"}</span>
      </section>
      <div role="status" aria-live="polite">{message}</div>
      {enabled === null && !busy ? <button type="button" className="secondary-button" onClick={() => void load()}><RefreshCw size={16} /> Opnieuw laden</button> : null}
    </>}
  </main></div>;
}
