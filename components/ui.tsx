"use client";

import type { ReactNode } from "react";

export function StatusPill({
  children,
  tone = "success",
}: {
  children: ReactNode;
  tone?: "success" | "warning" | "danger";
}) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}