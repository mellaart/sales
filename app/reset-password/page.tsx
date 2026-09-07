"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRecoveryToken(new URLSearchParams(window.location.hash.slice(1)).get("recovery_token"));
    setReady(true);
  }, []);

  async function handleUpdatePassword(event: React.FormEvent) {
    event.preventDefault();
    if (busy || completed) return;
    if (password !== confirmation) {
      setStatus("De wachtwoorden komen niet overeen.");
      return;
    }

    setBusy(true);
    setStatus("");

    const supabase = getSupabaseClient();

    if (!supabase) {
      setStatus("Supabase niet beschikbaar.");
      setBusy(false);
      return;
    }

    try {
      if (recoveryToken !== null) {
        const response = await fetch("/api/local/auth/reset-password/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: recoveryToken, password }),
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "Wachtwoord wijzigen mislukt.");
        window.history.replaceState(null, "", "/reset-password");
        await supabase.auth.signOut().catch(() => undefined);
        setCompleted(true);
        setPassword("");
        setConfirmation("");
        setStatus("Je wachtwoord is gewijzigd. Log opnieuw in met je nieuwe wachtwoord en 2FA.");
      } else {
        const { error } = await supabase.auth.updateUser({
          password,
          data: { must_set_password: false },
        });
        if (error) throw new Error(error.message);
        setCompleted(true);
        setStatus("Wachtwoord aangepast. Je wordt doorgestuurd.");
        setTimeout(() => router.replace("/"), 1200);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Wachtwoord wijzigen mislukt. Probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modern-auth-page">
      <section className="modern-auth-card">
        <div className="modern-auth-brand">SMART TRADE</div>

        <h1>Wachtwoord wijzigen</h1>
        <p className="modern-auth-subtitle">
          Kies een nieuw wachtwoord voor je Smart Trade account.
        </p>

        {ready && !completed && (recoveryToken !== null || user) ? <form onSubmit={handleUpdatePassword} className="modern-auth-form">
          <label>
            <span>Nieuw wachtwoord</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={6} maxLength={1024} />
          </label>
          <label>
            <span>Herhaal nieuw wachtwoord</span>
            <input type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" required minLength={6} maxLength={1024} />
          </label>

          <button type="submit" className="modern-auth-primary" disabled={busy}>
            <Lock size={18} />
            {busy ? "Opslaan..." : "Wachtwoord opslaan"}
          </button>
        </form> : null}

        {ready && !loading && !user && recoveryToken === null && !completed
          ? <p>Open de link uit je herstelmail of vraag via het inlogscherm een nieuwe herstelmail aan.</p>
          : null}

        {status ? <div className="modern-auth-status" role="status">{status}</div> : null}
        <Link href="/login" className="modern-auth-secondary" style={{ marginTop: 16 }}>Naar inloggen</Link>
      </section>
    </div>
  );
}
