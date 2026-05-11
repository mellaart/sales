"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LockKeyhole } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [loading, router, user]);

  async function handleResetPassword() {
    setStatus("");

    const supabase = getSupabaseClient();

    if (!supabase) {
      setStatus("Supabase keys ontbreken.");
      return;
    }

    if (!email.trim()) {
      setStatus("Vul eerst je e-mailadres in.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setStatus(`Reset password mislukt: ${error.message}`);
      return;
    }

    setStatus("E-mail verzonden. Open de link en stel daarna je nieuwe wachtwoord in.");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");

    const supabase = getSupabaseClient();

    if (!supabase) {
      setStatus("Supabase keys ontbreken.");
      setBusy(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setBusy(false);

    if (error) {
      setStatus(`Inloggen mislukt: ${error.message}`);
      return;
    }

    router.replace("/");
  }

  return (
    <div className="modern-auth-page">
      <section className="modern-auth-card">
        <div className="modern-auth-brand">SMART TRADE</div>

        <h1>Welkom terug</h1>

        <p className="modern-auth-subtitle">
          Log in om offertes te maken, deals te beheren en verkoopkansen sneller op te volgen.
        </p>

        <form onSubmit={handleSubmit} className="modern-auth-form">
          <label>
            <span>E-mailadres</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label>
            <span>Wachtwoord</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              autoComplete="current-password"
            />
          </label>

          <button type="submit" className="modern-auth-primary" disabled={busy}>
            <KeyRound size={18} />
            {busy ? "Bezig..." : "Inloggen"}
          </button>

          <button type="button" className="modern-auth-secondary" onClick={handleResetPassword}>
            <LockKeyhole size={16} />
            Reset password
          </button>
        </form>

        {status ? <div className="modern-auth-status">{status}</div> : null}
      </section>
    </div>
  );
}