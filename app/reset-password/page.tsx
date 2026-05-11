"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("Resetlink controleren...");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function prepareResetSession() {
      const supabase = getSupabaseClient();

      if (!supabase) {
        setStatus("Supabase niet beschikbaar.");
        return;
      }

      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          setStatus(`Resetlink ongeldig: ${error.message}`);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        setStatus("Geen geldige reset-sessie gevonden. Vraag opnieuw een resetlink aan.");
        return;
      }

      setReady(true);
      setStatus("");
    }

    void prepareResetSession();
  }, []);

  async function handleUpdatePassword(event: React.FormEvent) {
    event.preventDefault();

    setBusy(true);
    setStatus("");

    const supabase = getSupabaseClient();

    if (!supabase) {
      setStatus("Supabase niet beschikbaar.");
      setBusy(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setBusy(false);

    if (error) {
      setStatus(`Wachtwoord aanpassen mislukt: ${error.message}`);
      return;
    }

    setStatus("Wachtwoord aangepast. Je wordt doorgestuurd.");

    setTimeout(() => {
      router.replace("/");
    }, 1200);
  }

  return (
    <div className="modern-auth-page">
      <section className="modern-auth-card">
        <div className="modern-auth-brand">SMART TRADE</div>

        <h1>Nieuw wachtwoord</h1>
        <p className="modern-auth-subtitle">
          Kies hieronder een nieuw wachtwoord voor je account.
        </p>

        <form onSubmit={handleUpdatePassword} className="modern-auth-form">
          <label>
            <span>Nieuw wachtwoord</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={!ready || busy}
            />
          </label>

          <button
            type="submit"
            className="modern-auth-primary"
            disabled={!ready || busy}
          >
            <Lock size={18} />
            {busy ? "Opslaan..." : "Wachtwoord opslaan"}
          </button>
        </form>

        {status ? <div className="modern-auth-status">{status}</div> : null}
      </section>
    </div>
  );
}