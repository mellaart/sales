"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle, MessageSquareText, Save } from "lucide-react";
import type { ImplementationWorkItemNoteSet } from "@/lib/implementations";
import styles from "./implementation-progress.module.css";

const dateTimeFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateTimeFormatter.format(date);
}

export default function WorkNoteControl({
  accessId,
  workItemKey,
  workItemLabel,
  initialNotes,
}: {
  accessId: string;
  workItemKey: string;
  workItemLabel: string;
  initialNotes: ImplementationWorkItemNoteSet;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [customerText, setCustomerText] = useState(initialNotes.customer?.text ?? "");
  const [savedText, setSavedText] = useState(initialNotes.customer?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setNotes(initialNotes);
    setCustomerText(initialNotes.customer?.text ?? "");
    setSavedText(initialNotes.customer?.text ?? "");
  }, [initialNotes]);

  async function save() {
    if (busy || customerText.trim() === savedText) return;
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      const pageSearchParams = new URL(window.location.href).searchParams;
      const searchParams = new URLSearchParams({
        v: pageSearchParams.get("v") ?? "",
        token: pageSearchParams.get("token") ?? "",
      });
      const response = await fetch(
        `/api/implementation-portals/${encodeURIComponent(accessId)}/work-notes?${searchParams}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workItemKey, text: customerText }),
        },
      );
      const json = await response.json().catch(() => ({})) as {
        noteSet?: ImplementationWorkItemNoteSet;
        error?: string;
      };
      if (!response.ok || !json.noteSet) {
        throw new Error(json.error || "Opmerking opslaan mislukt.");
      }
      const savedCustomerText = json.noteSet.customer?.text ?? "";
      setNotes(json.noteSet);
      setCustomerText(savedCustomerText);
      setSavedText(savedCustomerText);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Opmerking opslaan mislukt.");
    } finally {
      setBusy(false);
    }
  }

  const noteCount = Number(Boolean(notes.consultant)) + Number(Boolean(notes.customer));
  const changed = customerText.trim() !== savedText;

  return (
    <details className={styles.workNotes}>
      <summary>
        <MessageSquareText size={15} aria-hidden="true" />
        {noteCount > 0 ? "Opmerkingen" : "Opmerking toevoegen"}
        {noteCount > 0 ? <span>{noteCount}</span> : null}
      </summary>
      <div className={styles.workNotesContent}>
        {notes.consultant ? (
          <div className={styles.consultantNote}>
            <strong>Opmerking van uw consultant</strong>
            <p>{notes.consultant.text}</p>
            <small>
              {notes.consultant.authorName} · {formatDateTime(notes.consultant.updatedAt)}
            </small>
          </div>
        ) : null}
        <label>
          <span>Uw opmerking</span>
          <textarea
            value={customerText}
            rows={3}
            maxLength={2000}
            disabled={busy}
            placeholder="Voeg een opmerking toe bij deze werkzaamheid"
            aria-label={`Uw opmerking bij ${workItemLabel}`}
            onChange={(event) => {
              setCustomerText(event.target.value);
              setSaved(false);
              setError("");
            }}
          />
        </label>
        <div className={styles.workNotesActions}>
          <button type="button" disabled={busy || !changed} onClick={() => void save()}>
            {busy ? <LoaderCircle className={styles.workNotesSpinner} size={15} /> : <Save size={15} />}
            {busy ? "Opslaan..." : "Opmerking opslaan"}
          </button>
          {saved ? <small><Check size={14} /> Opgeslagen</small> : null}
          {notes.customer ? (
            <small>Bijgewerkt op {formatDateTime(notes.customer.updatedAt)}</small>
          ) : null}
        </div>
        {error ? <p className={styles.workNotesError} role="alert">{error}</p> : null}
      </div>
    </details>
  );
}
