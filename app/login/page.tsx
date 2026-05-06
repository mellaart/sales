"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [loading, router, user]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");

    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus("Supabase keys ontbreken. Vul NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY in.");
      setBusy(false);
      return;
    }

    const action = mode === "login"
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password, options: { data: { full_name: email.split("@")[0] } } });

    const { error } = await action;
    if (error) {
      setStatus(`${mode === "login" ? "Inloggen" : "Account maken"} mislukt: ${error.message}`);
      setBusy(false);
      return;
    }

    setBusy(false);
    setStatus(mode === "login" ? "Ingelogd, je wordt doorgestuurd." : "Account aangemaakt. Nieuwe gebruikers starten standaard als sales.");
    router.replace("/");
  }

  return (
    <div className="page-shell">
      <div className="container auth-page">
        <section className="card auth-card">
          <div className="brand-mark">Smart Trade</div>
          <h1>Versie 8 — rollen en toegangsbeheer</h1>
          <p>
            Sales ziet alleen eigen deals, managers zien alle deals en admins beheren daarnaast ook gebruikersrollen.
          </p>

          <div className="auth-mode-row">
            <button type="button" className={`package-button ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>Inloggen</button>
            <button type="button" className={`package-button ${mode === "signup" ? "active" : ""}`} onClick={() => setMode("signup")}>Account maken</button>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <label>
              <span className="input-label">E-mailadres</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              <span className="input-label">Wachtwoord</span>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </label>
            <button type="submit" className="primary-button" disabled={busy}>
              <KeyRound size={16} /> {busy ? "Bezig..." : mode === "login" ? "Inloggen" : "Account maken"}
            </button>
          </form>

          <div className="soft-card auth-note">
            <div className="section-title"><ShieldCheck size={16} /> Wat v8 toevoegt</div>
            <ul className="auth-list">
              <li>Profielen met rollen: sales, manager, admin</li>
              <li>Managers zien alle deals via RLS</li>
              <li>Admins beheren rollen in een apart admin-scherm</li>
            </ul>
          </div>

          {status ? <div className="save-status">{status}</div> : null}
        </section>
      </div>
    </div>
  );
}
