"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";

type TwoFactorChallenge = {
  challengeToken: string;
  mode: "setup" | "verify";
  email?: string | null;
  manualEntryKey?: string | null;
  otpAuthUrl?: string | null;
  expiresAt?: number;
};

type TwoFactorAuthClient = {
  verifyTwoFactor?: (input: { challengeToken: string; code: string; rememberDevice?: boolean }) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

function getSafeReturnTo() {
  if (typeof window === "undefined") return "/";

  const returnTo = new URLSearchParams(window.location.search).get("returnTo")?.trim() ?? "";
  if (!returnTo.startsWith("/") || returnTo.startsWith("//") || returnTo.startsWith("/login")) {
    return "/";
  }

  return returnTo;
}

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const mustSetPassword = Boolean(user?.user_metadata?.must_set_password);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [twoFactor, setTwoFactor] = useState<TwoFactorChallenge | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [loginParametersLoaded, setLoginParametersLoaded] = useState(false);
  const [reauthenticationRequired, setReauthenticationRequired] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const requiresReauthentication = searchParams.get("reauth") === "1";

    setReauthenticationRequired(requiresReauthentication);
    setLoginParametersLoaded(true);

    if (requiresReauthentication) {
      setStatus("Log opnieuw in om de deal veilig te openen.");
    } else if (searchParams.get("timeout") === "1") {
      setStatus("Je bent automatisch uitgelogd omdat de website langer dan 10 uur niet is gebruikt.");
    }
  }, []);

  useEffect(() => {
    if (loginParametersLoaded && !loading && user && !reauthenticationRequired) {
      router.replace(mustSetPassword ? "/reset-password" : getSafeReturnTo());
    }
  }, [loading, loginParametersLoaded, mustSetPassword, reauthenticationRequired, router, user]);

  useEffect(() => {
    if (reauthenticationRequired && user?.email && !email) {
      setEmail(user.email);
    }
  }, [email, reauthenticationRequired, user?.email]);

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl("");

    if (!twoFactor?.otpAuthUrl) return;

    QRCode.toDataURL(twoFactor.otpAuthUrl, {
      margin: 2,
      width: 220,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setStatus("QR-code maken mislukt. Gebruik de setupcode hieronder.");
      });

    return () => {
      cancelled = true;
    };
  }, [twoFactor]);

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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    }) as {
      data: { twoFactor?: TwoFactorChallenge } | null;
      error: { message: string } | null;
    };

    setBusy(false);

    if (error) {
      setStatus(`Inloggen mislukt: ${error.message}`);
      return;
    }

    if (data?.twoFactor?.challengeToken) {
      setTwoFactor(data.twoFactor);
      setTwoFactorCode("");
      setUseRecoveryCode(false);
      setRememberDevice(false);
      setPassword("");
      setStatus(data.twoFactor.mode === "setup"
        ? "Scan de QR-code en vul daarna de 6-cijferige code in."
        : "Vul de 6-cijferige code uit je authenticator-app in.");
      return;
    }

    router.replace(getSafeReturnTo());
  }

  async function handleTwoFactorSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!twoFactor) return;

    setBusy(true);
    setStatus("");

    const supabase = getSupabaseClient();
    const authClient = supabase?.auth as TwoFactorAuthClient | undefined;

    if (!authClient?.verifyTwoFactor) {
      setStatus("2FA is alleen beschikbaar op de eigen server.");
      setBusy(false);
      return;
    }

    const { error } = await authClient.verifyTwoFactor({
      challengeToken: twoFactor.challengeToken,
      code: twoFactorCode,
      rememberDevice,
    });

    setBusy(false);

    if (error) {
      setStatus(`2FA mislukt: ${error.message}`);
      return;
    }

    router.replace(getSafeReturnTo());
  }

  function resetTwoFactorStep() {
    setTwoFactor(null);
    setTwoFactorCode("");
    setUseRecoveryCode(false);
    setRememberDevice(false);
    setQrDataUrl("");
    setStatus("");
  }

  function toggleRecoveryCode() {
    const nextValue = !useRecoveryCode;
    setUseRecoveryCode(nextValue);
    setTwoFactorCode("");
    setStatus(nextValue
      ? "Vul één van je eenmalige herstelcodes in."
      : "Vul de 6-cijferige code uit je authenticator-app in.");
  }

  if (twoFactor) {
    return (
      <div className="modern-auth-page">
        <section className="modern-auth-card">
          <div className="modern-auth-brand">SMART TRADE</div>

          <h1>{twoFactor.mode === "setup" ? "2FA instellen" : "2FA controle"}</h1>

          <p className="modern-auth-subtitle">
            {twoFactor.mode === "setup"
              ? "Scan deze QR-code met je authenticator-app en bevestig daarna met de 6-cijferige code."
              : useRecoveryCode
                ? "Gebruik één van de herstelcodes die je eerder veilig hebt bewaard."
                : "Open je authenticator-app en vul de 6-cijferige code in."}
          </p>

          {twoFactor.mode === "setup" ? (
            <div className="two-factor-setup">
              {qrDataUrl ? (
                <div className="two-factor-qr">
                  <img src={qrDataUrl} alt="2FA QR-code" />
                </div>
              ) : (
                <div className="modern-auth-status">QR-code wordt gemaakt...</div>
              )}

              {twoFactor.manualEntryKey ? (
                <label className="two-factor-secret">
                  <span>Setupcode</span>
                  <input type="text" value={twoFactor.manualEntryKey} readOnly />
                </label>
              ) : null}
            </div>
          ) : null}

          <form onSubmit={handleTwoFactorSubmit} className="modern-auth-form">
            <label>
              <span>{useRecoveryCode ? "Herstelcode" : "2FA-code"}</span>
              <input
                type="text"
                inputMode={useRecoveryCode ? "text" : "numeric"}
                pattern={useRecoveryCode ? "[A-Za-z0-9-]*" : "[0-9]*"}
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(
                  useRecoveryCode
                    ? event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 14)
                    : event.target.value.replace(/\D/g, "").slice(0, 6),
                )}
                required
                minLength={useRecoveryCode ? 12 : 6}
                maxLength={useRecoveryCode ? 14 : 6}
                autoComplete={useRecoveryCode ? "off" : "one-time-code"}
                placeholder={useRecoveryCode ? "XXXX-XXXX-XXXX" : "000000"}
              />
            </label>

            {twoFactor.mode === "verify" ? (
              <button type="button" className="modern-auth-secondary" onClick={toggleRecoveryCode}>
                <KeyRound size={18} />
                {useRecoveryCode ? "Authenticator-code gebruiken" : "Herstelcode gebruiken"}
              </button>
            ) : null}

            <label className="two-factor-remember">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(event) => setRememberDevice(event.target.checked)}
              />
              <span>Dit apparaat 30 dagen onthouden</span>
            </label>

            <button type="submit" className="modern-auth-primary" disabled={busy}>
              <ShieldCheck size={18} />
              {busy ? "Controleren..." : "Bevestigen"}
            </button>

            <button type="button" className="modern-auth-secondary" onClick={resetTwoFactorStep}>
              Terug naar inloggen
            </button>
          </form>

          {status ? <div className="modern-auth-status">{status}</div> : null}
        </section>
      </div>
    );
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
