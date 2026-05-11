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
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
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

    const action =
      mode === "login"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: email.split("@")[0] } },
          });

    const { error } = await action;

    setBusy(false);

    if (error) {
      setStatus(`${mode === "login" ? "Inloggen" : "Account maken"} mislukt: ${error.message}`);
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

        <div className="modern-auth-tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Inloggen
          </button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
            Account maken
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modern-auth-form">
          <label>
            <span>E-mailadres</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>

          <label>
            <span>Wachtwoord</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </label>

          <button type="submit" className="modern-auth-primary" disabled={busy}>
            <KeyRound size={18} />
            {busy ? "Bezig..." : mode === "login" ? "Inloggen" : "Account maken"}
          </button>

          {mode === "login" ? (
            <button type="button" className="modern-auth-secondary" onClick={handleResetPassword}>
              <LockKeyhole size={16} />
              Reset password
            </button>
          ) : null}
        </form>

        {status ? <div className="modern-auth-status">{status}</div> : null}
      </section>
    </div>
  );
}
