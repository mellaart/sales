"use client";

import Image from "next/image";
import { CheckCircle2, LoaderCircle, LockKeyhole, MessageSquareText, RefreshCw } from "lucide-react";
import { type FormEvent, useState } from "react";
import styles from "./implementation-progress.module.css";

type SmsVerificationProps = {
  accessId: string;
  token: string;
  tokenVersion: number;
  mobilePhone: string;
};

export default function SmsVerification({
  accessId,
  token,
  tokenVersion,
  mobilePhone,
}: SmsVerificationProps) {
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState("");

  async function sendCode() {
    setBusy("send");
    setError("");
    try {
      const response = await fetch(
        `/api/implementation-portals/${encodeURIComponent(accessId)}/sms-verification`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "send", token, version: tokenVersion }),
        },
      );
      const json = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(json.error || "SMS-code versturen mislukt.");
      setSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "SMS-code versturen mislukt.");
    } finally {
      setBusy(null);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("verify");
    setError("");
    try {
      const response = await fetch(
        `/api/implementation-portals/${encodeURIComponent(accessId)}/sms-verification`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify", token, version: tokenVersion, code }),
        },
      );
      const json = await response.json().catch(() => ({})) as { error?: string; verified?: boolean };
      if (!response.ok || !json.verified) throw new Error(json.error || "Code controleren mislukt.");
      window.location.reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Code controleren mislukt.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.smsVerification}>
        <Image src="/smart-trade-logo.png" alt="Smart Trade" width={244} height={170} priority />
        <span className={styles.smsVerificationIcon}><LockKeyhole size={30} /></span>
        <div className={styles.smsVerificationCopy}>
          <span>Beveiligde klantpagina</span>
          <h1>Controleer uw toegang</h1>
          <p>We sturen een zescijferige code naar {mobilePhone}.</p>
        </div>

        {sent ? (
          <form className={styles.smsVerificationForm} onSubmit={(event) => void verifyCode(event)}>
            <label>
              <span>Sms-code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                autoFocus
              />
            </label>
            <button type="submit" disabled={busy !== null || code.length !== 6}>
              {busy === "verify" ? <LoaderCircle className={styles.smsVerificationSpinner} size={17} /> : <CheckCircle2 size={17} />}
              Code controleren
            </button>
            <button type="button" className={styles.smsVerificationResend} disabled={busy !== null} onClick={() => void sendCode()}>
              {busy === "send" ? <LoaderCircle className={styles.smsVerificationSpinner} size={15} /> : <RefreshCw size={15} />}
              Nieuwe code sturen
            </button>
          </form>
        ) : (
          <button type="button" className={styles.smsVerificationSend} disabled={busy !== null} onClick={() => void sendCode()}>
            {busy === "send" ? <LoaderCircle className={styles.smsVerificationSpinner} size={17} /> : <MessageSquareText size={17} />}
            Stuur sms-code
          </button>
        )}

        {error ? <p className={styles.smsVerificationError}>{error}</p> : null}
      </section>
    </main>
  );
}
