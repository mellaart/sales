"use client";

import { useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import type { ImplementationCustomerWorkApproval } from "@/lib/implementations";
import styles from "./implementation-progress.module.css";

const approvalDateFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatApprovalDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : approvalDateFormatter.format(date);
}

export default function WorkApprovalControl({
  accessId,
  workItemKey,
  workItemLabel,
  completed,
  initialApprovedAt,
}: {
  accessId: string;
  workItemKey: string;
  workItemLabel: string;
  completed: boolean;
  initialApprovedAt: string | null;
}) {
  const [approvedAt, setApprovedAt] = useState(initialApprovedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const approved = Boolean(approvedAt);

  async function approve() {
    if (!completed || approved || busy) return;
    const confirmed = window.confirm(
      `Bevestigt u dat "${workItemLabel}" door de consultant is uitgevoerd? Dit akkoord kan niet worden ingetrokken.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      const pageSearchParams = new URL(window.location.href).searchParams;
      const searchParams = new URLSearchParams({
        v: pageSearchParams.get("v") ?? "",
        token: pageSearchParams.get("token") ?? "",
      });
      const response = await fetch(
        `/api/implementation-portals/${encodeURIComponent(accessId)}/work-approvals?${searchParams}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workItemKey }),
        },
      );
      const json = await response.json().catch(() => ({})) as {
        approval?: ImplementationCustomerWorkApproval;
        error?: string;
      };
      if (!response.ok || !json.approval?.approvedAt) {
        throw new Error(json.error || "Akkoord vastleggen mislukt.");
      }
      setApprovedAt(json.approval.approvedAt);
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "Akkoord vastleggen mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${styles.customerApproval} ${
      approved ? styles.customerApprovalConfirmed : !completed ? styles.customerApprovalUnavailable : ""
    }`}>
      <label>
        <input
          type="checkbox"
          checked={approved}
          disabled={!completed || approved || busy}
          aria-label={`Akkoord geven voor ${workItemLabel}`}
          onChange={(event) => {
            if (event.target.checked) void approve();
          }}
        />
        <span className={styles.customerApprovalMark} aria-hidden="true">
          {busy ? <LoaderCircle size={15} /> : approved ? <Check size={15} /> : null}
        </span>
        <strong>{approved ? "Akkoord gegeven" : "Akkoord met uitvoering"}</strong>
      </label>
      {approvedAt ? (
        <small>Bevestigd op {formatApprovalDate(approvedAt)}</small>
      ) : !completed ? (
        <small>Beschikbaar zodra de consultant deze werkzaamheid heeft afgerond.</small>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
