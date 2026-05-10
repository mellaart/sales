"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

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

    if (error) {
      setStatus(error.message);
      setBusy(false);
      return;
    }

    setStatus("Wachtwoord succesvol aangepast.");

    setTimeout(() => {
      router.replace("/");
    }, 1500);
  }

  return (
    <div className="auth-layout">
      <div className="auth-panel">
        <div className="auth-brand">SMART TRADE</div>

        <h1>Nieuw wachtwoord instellen</h1>

        <p className="auth-subtitle">
          Kies een nieuw wachtwoord voor je account.
        </p>

        <form onSubmit={handleUpdatePassword} className="auth-form-modern">
          <label>
            <span>Nieuw wachtwoord</span>

            <input
              type="password"
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>

          <button
            type="submit"
            className="auth-primary-button"
            disabled={busy}
          >
            <Lock size={18} />
            {busy ? "Opslaan..." : "Wachtwoord opslaan"}
          </button>
        </form>

        {status ? <div className="auth-status">{status}</div> : null}
      </div>
    </div>
  );
}