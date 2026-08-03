import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { ProfileRecord } from "@/lib/supabase";

const DEFAULT_RECIPIENT = "erik@smarttrade.nl";
const DEFAULT_SENDER = "notifications@sales.troublefree.nl";
const DEFAULT_SENDMAIL_PATH = "/usr/sbin/sendmail";
const DEFAULT_PUBLIC_URL = "https://sales.troublefree.nl";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DealActivity = "archived" | "deleted";

type DealSnapshot = {
  id?: string | null;
  customer_name?: string | null;
  quote_title?: string | null;
  contact_name?: string | null;
  sales_name?: string | null;
  updated_at?: string | null;
};

type DealActivityNotificationInput = {
  activity: DealActivity;
  deal: DealSnapshot;
  actor: ProfileRecord;
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character] ?? character,
  );
}

function displayValue(value: unknown, fallback = "-") {
  if (typeof value !== "string") return fallback;
  return value.trim() || fallback;
}

function actorName(profile: ProfileRecord) {
  return displayValue(profile.full_name, displayValue(profile.email, "Onbekende consultant"));
}

function formatDate(value = new Date()) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  }).format(value);
}

function dealUrl(dealId: string) {
  const publicUrl = (process.env.SALES_PUBLIC_URL || DEFAULT_PUBLIC_URL).trim().replace(/\/+$/, "");
  return `${publicUrl}/deals/${encodeURIComponent(dealId)}`;
}

function detailRows(input: DealActivityNotificationInput) {
  return [
    ["Klant", displayValue(input.deal.customer_name, displayValue(input.deal.quote_title, "Naam ontbreekt"))],
    ["Offerte", displayValue(input.deal.quote_title)],
    ["Contactpersoon", displayValue(input.deal.contact_name)],
    ["Sales consultant", displayValue(input.deal.sales_name, actorName(input.actor))],
    ["Uitgevoerd door", `${actorName(input.actor)} (${displayValue(input.actor.email)})`],
    ["Handeling", input.activity === "archived" ? "Deal gearchiveerd" : "Deal verwijderd"],
    ["Tijdstip", formatDate()],
  ];
}

function htmlBody(input: DealActivityNotificationInput) {
  const rows = detailRows(input).map(([label, value]) => [
    "<tr>",
    `<td style="width:180px;padding:7px 12px 7px 0;border-bottom:1px solid #dbe3ec;color:#64748b">${escapeHtml(label)}</td>`,
    `<td style="padding:7px 0;border-bottom:1px solid #dbe3ec;color:#172033;font-weight:600">${escapeHtml(value)}</td>`,
    "</tr>",
  ].join("")).join("");
  const actionLabel = input.activity === "archived" ? "gearchiveerd" : "verwijderd";
  const link = input.activity === "archived" && input.deal.id
    ? `<p style="margin:18px 0 0"><a href="${escapeHtml(dealUrl(input.deal.id))}" style="color:#146edb;text-decoration:underline;font-weight:700">Open de gearchiveerde deal</a></p>`
    : "";

  return [
    '<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#172033">',
    '<p style="margin:0 0 12px">Beste Erik,</p>',
    `<p style="margin:0 0 16px">Een consultant heeft een deal ${actionLabel}.</p>`,
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:680px;border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt">',
    rows,
    "</table>",
    link,
    '<p style="margin:20px 0 0">Smart Trade Sales</p>',
    "</div>",
  ].join("");
}

function textBody(input: DealActivityNotificationInput) {
  return [
    "Beste Erik,",
    "",
    `Een consultant heeft een deal ${input.activity === "archived" ? "gearchiveerd" : "verwijderd"}.`,
    "",
    ...detailRows(input).map(([label, value]) => `${label}: ${value}`),
    ...(input.activity === "archived" && input.deal.id
      ? ["", `Open de gearchiveerde deal: ${dealUrl(input.deal.id)}`]
      : []),
    "",
    "Smart Trade Sales",
  ].join("\r\n");
}

function base64Lines(value: string) {
  return Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function mimeMessage(
  input: DealActivityNotificationInput,
  recipient: string,
  sender: string,
) {
  const boundary = `smart-trade-${randomUUID()}`;
  const activityLabel = input.activity === "archived" ? "gearchiveerd" : "verwijderd";
  const customerName = displayValue(input.deal.customer_name, displayValue(input.deal.quote_title, "onbekende klant"));
  const subject = `Deal ${activityLabel} door ${actorName(input.actor)} - ${customerName}`;
  const domain = sender.split("@")[1] || "sales.troublefree.nl";

  return [
    `From: Smart Trade Sales <${sender}>`,
    `To: ${recipient}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <deal-${input.activity}-${randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(textBody(input)),
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(htmlBody(input)),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function sendWithSendmail(path: string, sender: string, message: string) {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(path, ["-i", "-t", "-f", sender], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) rejectPromise(error);
      else resolvePromise();
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(new Error("De mailserver reageerde niet binnen 15 seconden."));
    }, 15_000);

    child.stderr?.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-4_000);
    });
    child.on("error", (error) => finish(new Error(`Sendmail starten mislukt: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(stderr.trim() || `Sendmail stopte met code ${code ?? "onbekend"}.`));
    });
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(message, "utf8");
  });
}

export async function sendDealActivityNotification(input: DealActivityNotificationInput) {
  const recipient = (
    process.env.SALES_DEAL_ACTIVITY_NOTIFICATION_EMAIL || DEFAULT_RECIPIENT
  ).trim().toLowerCase();
  const sender = (
    process.env.SALES_NOTIFICATION_FROM_EMAIL || DEFAULT_SENDER
  ).trim().toLowerCase();
  const sendmailPath = (
    process.env.SALES_SENDMAIL_PATH || DEFAULT_SENDMAIL_PATH
  ).trim();

  if (!EMAIL_PATTERN.test(recipient)) {
    throw new Error("SALES_DEAL_ACTIVITY_NOTIFICATION_EMAIL is geen geldig e-mailadres.");
  }
  if (!EMAIL_PATTERN.test(sender)) {
    throw new Error("SALES_NOTIFICATION_FROM_EMAIL is geen geldig e-mailadres.");
  }

  await sendWithSendmail(sendmailPath, sender, mimeMessage(input, recipient, sender));
}
