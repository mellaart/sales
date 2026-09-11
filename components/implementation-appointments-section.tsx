"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { LoaderCircle, Minus, Plus } from "lucide-react";

export default function ImplementationAppointmentsSection({ children }: { children: ReactNode }) {
  const contentId = useId();
  const [open, setOpen] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void (async () => {
      try {
        const response = await fetch("/api/me/implementation-preferences", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok || typeof data.appointmentsOpen !== "boolean") throw new Error(data.error || "Weergavevoorkeur laden mislukt.");
        if (!controller.signal.aborted) {
          setOpen(data.appointmentsOpen);
          setLoaded(true);
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Weergavevoorkeur laden mislukt.");
      }
    })();
    return () => controller.abort();
  }, [attempt]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/me/implementation-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentsOpen: next }),
      });
      const data = await response.json();
      if (!response.ok || data.appointmentsOpen !== next) throw new Error(data.error || "Weergavevoorkeur opslaan mislukt. Probeer opnieuw.");
    } catch (error) {
      setOpen(!next);
      setError(error instanceof Error ? error.message : "Weergavevoorkeur opslaan mislukt. Probeer opnieuw.");
    } finally { setBusy(false); }
  }

  return <section className="card panel implementation-appointments-panel">
    <div className="eyebrow">Planning</div>
    <h2 className="headline">
      <button type="button" className="implementation-section-toggle" aria-expanded={open}
        aria-controls={contentId} disabled={!loaded || busy} onClick={() => void toggle()}>
        <span>Afspraken</span>
        {busy || (!loaded && !error) ? <LoaderCircle className="implementation-dns-spinner" size={22} aria-hidden="true" />
          : open ? <Minus size={22} aria-hidden="true" /> : <Plus size={22} aria-hidden="true" />}
      </button>
    </h2>
    {error ? <div className="implementation-inline-error" role="alert">{error}
      {!loaded ? <button type="button" className="secondary-button" onClick={() => setAttempt(value => value + 1)}>Opnieuw laden</button> : null}
    </div> : null}
    <div id={contentId} hidden={!open}>{children}</div>
  </section>;
}
