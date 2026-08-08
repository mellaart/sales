"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, MessageSquareText } from "lucide-react";
import type {
  ImplementationWorkItemNoteSet,
  ImplementationWorkItemNotes,
} from "@/lib/implementations";

const dateTimeFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateTimeFormatter.format(date);
}

export default function ImplementationWorkNoteEditor({
  implementationId,
  workItemKey,
  workItemLabel,
  initialNotes,
  canEdit,
  onSaved,
}: {
  implementationId: string;
  workItemKey: string;
  workItemLabel: string;
  initialNotes: ImplementationWorkItemNoteSet;
  canEdit: boolean;
  onSaved: (notes: ImplementationWorkItemNotes) => void;
}) {
  const [consultantText, setConsultantText] = useState(initialNotes.consultant?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const savedTextRef = useRef(initialNotes.consultant?.text ?? "");

  useEffect(() => {
    const nextText = initialNotes.consultant?.text ?? "";
    setConsultantText(nextText);
    savedTextRef.current = nextText;
  }, [initialNotes.consultant?.text]);

  async function save() {
    const nextText = consultantText.trim();
    if (!canEdit || busy || nextText === savedTextRef.current) return;
    setBusy(true);
    setState("idle");
    setError("");
    try {
      const response = await fetch(
        `/api/implementations/${encodeURIComponent(implementationId)}/work-notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workItemKey, text: consultantText }),
        },
      );
      const json = await response.json().catch(() => ({})) as {
        notes?: ImplementationWorkItemNotes;
        noteSet?: ImplementationWorkItemNoteSet;
        error?: string;
      };
      if (!response.ok || !json.notes) {
        throw new Error(json.error || "Opmerking opslaan mislukt.");
      }
      const savedText = json.noteSet?.consultant?.text ?? "";
      savedTextRef.current = savedText;
      setConsultantText(savedText);
      setState("saved");
      onSaved(json.notes);
    } catch (saveError) {
      setState("error");
      setError(saveError instanceof Error ? saveError.message : "Opmerking opslaan mislukt.");
    } finally {
      setBusy(false);
    }
  }

  const noteCount = Number(Boolean(initialNotes.consultant)) + Number(Boolean(initialNotes.customer));

  return (
    <details className="implementation-work-note">
      <summary>
        <MessageSquareText size={14} aria-hidden="true" />
        Opmerkingen
        {noteCount > 0 ? <span>{noteCount}</span> : null}
      </summary>
      <div className="implementation-work-note-content">
        <label>
          <span>Opmerking consultant</span>
          <textarea
            value={consultantText}
            rows={3}
            maxLength={2000}
            disabled={!canEdit || busy}
            placeholder="Voeg een opmerking toe bij deze werkzaamheid"
            aria-label={`Opmerking consultant bij ${workItemLabel}`}
            onChange={(event) => {
              setConsultantText(event.target.value);
              setState("idle");
            }}
            onBlur={() => void save()}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void save();
              }
            }}
          />
        </label>
        <div className="implementation-work-note-save-state" aria-live="polite">
          {busy ? <><LoaderCircle className="implementation-dns-spinner" size={13} /> Opslaan...</> : null}
          {!busy && state === "saved" ? <><Check size={13} /> Opgeslagen</> : null}
          {state === "error" ? <span role="alert">{error}</span> : null}
        </div>
        {initialNotes.consultant ? (
          <small>
            Bijgewerkt door {initialNotes.consultant.authorName} op {formatDateTime(
              initialNotes.consultant.updatedAt,
            )}
          </small>
        ) : null}
        {initialNotes.customer ? (
          <div className="implementation-work-note-customer">
            <strong>Opmerking klant</strong>
            <p>{initialNotes.customer.text}</p>
            <small>
              {initialNotes.customer.authorName} · {formatDateTime(initialNotes.customer.updatedAt)}
            </small>
          </div>
        ) : null}
      </div>
    </details>
  );
}
