import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { CustomerIntakeData } from "@/lib/customer-intake";

const DEFAULT_RECIPIENT = "erik@smarttrade.nl";
const DEFAULT_SENDER = "notifications@sales.troublefree.nl";
const DEFAULT_SENDMAIL_PATH = "/usr/sbin/sendmail";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type NotificationInput = {
  request: Request;
  intakeId: string;
  dealId: string;
  submittedAt: string;
  formData: CustomerIntakeData;
};

type DetailRow = {
  label: string;
  value: string;
};

type DetailSection = {
  title: string;
  rows: DetailRow[];
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

function requestOrigin(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const url = new URL(request.url);
  const host = forwardedHost || request.headers.get("host") || url.host;
  const protocol = forwardedProto || url.protocol.replace(":", "") || "https";
  return `${protocol}://${host}`;
}

function displayValue(value: string) {
  return value.trim() || "-";
}

function formatSubmittedAt(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(value));
}

function customerDetails(formData: CustomerIntakeData): DetailSection[] {
  return [
    {
      title: "Bedrijf en afleveradres",
      rows: [
        { label: "Bedrijfsnaam", value: formData.deliveryName },
        { label: "Adres", value: `${formData.deliveryStreet} ${formData.deliveryNumber}`.trim() },
        { label: "Postcode en plaats", value: `${formData.deliveryPostcode} ${formData.deliveryCity}`.trim() },
        { label: "Telefoon", value: formData.phone },
        { label: "Mobiel", value: formData.mobile },
        { label: "E-mail algemeen", value: formData.generalEmail },
        { label: "Website", value: formData.website },
        { label: "BTW-nummer", value: formData.vatNumber },
        { label: "KvK-nummer", value: formData.chamberOfCommerceNumber },
      ],
    },
    {
      title: "Postadres",
      rows: [
        { label: "Adres", value: `${formData.postalStreet} ${formData.postalNumber}`.trim() },
        { label: "Postcode en plaats", value: `${formData.postalPostcode} ${formData.postalCity}`.trim() },
      ],
    },
    {
      title: "Contactpersoon",
      rows: [
        { label: "Voornaam", value: formData.contactFirstName },
        { label: "Achternaam", value: formData.contactLastName },
        { label: "Telefoon", value: formData.contactPhone },
        { label: "E-mail", value: formData.contactEmail },
      ],
    },
    {
      title: "Administratie",
      rows: [
        {
          label: "Factuur per",
          value: formData.invoiceDelivery === "mail"
            ? "E-mail"
            : formData.invoiceDelivery === "post" ? "Post" : "",
        },
        { label: "E-mail", value: formData.administrationEmail },
        { label: "Voornaam", value: formData.administrationFirstName },
        { label: "Achternaam", value: formData.administrationLastName },
        { label: "Telefoon", value: formData.administrationPhone },
        {
          label: "Automatische incasso",
          value: formData.directDebit === "yes"
            ? "Ja"
            : formData.directDebit === "no" ? "Nee" : "",
        },
        { label: "Bankrekening", value: formData.directDebitBankAccount },
      ],
    },
  ];
}

function htmlBody(input: NotificationInput, dealUrl: string, sections: DetailSection[]) {
  const companyName = escapeHtml(input.formData.deliveryName || "Nieuwe klant");
  const submittedAt = escapeHtml(formatSubmittedAt(input.submittedAt));
  const sectionHtml = sections.map((section) => [
    `<h2 style="margin:22px 0 8px;font-size:13pt;color:#173b5b">${escapeHtml(section.title)}</h2>`,
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:720px;border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt">',
    section.rows.map((row) => [
      "<tr>",
      `<td style="width:210px;padding:6px 12px 6px 0;border-bottom:1px solid #dbe3ec;color:#64748b">${escapeHtml(row.label)}</td>`,
      `<td style="padding:6px 0;border-bottom:1px solid #dbe3ec;color:#172033;font-weight:600">${escapeHtml(displayValue(row.value))}</td>`,
      "</tr>",
    ].join("")).join(""),
    "</table>",
  ].join("")).join("");

  return [
    '<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45;color:#172033">',
    '<p style="margin:0 0 12px">Beste Erik,</p>',
    `<p style="margin:0 0 12px">Het klantgegevensformulier van <strong>${companyName}</strong> is ontvangen op ${submittedAt}.</p>`,
    `<p style="margin:0 0 18px"><a href="${escapeHtml(dealUrl)}" style="color:#146edb;text-decoration:underline">Open de bijbehorende deal</a></p>`,
    sectionHtml,
    `<p style="margin:24px 0 0;color:#64748b;font-size:9pt">Formulier-ID: ${escapeHtml(input.intakeId)}</p>`,
    "</div>",
  ].join("");
}

function textBody(input: NotificationInput, dealUrl: string, sections: DetailSection[]) {
  const lines = [
    "Beste Erik,",
    "",
    `Het klantgegevensformulier van ${input.formData.deliveryName || "Nieuwe klant"} is ontvangen op ${formatSubmittedAt(input.submittedAt)}.`,
    `Open de bijbehorende deal: ${dealUrl}`,
    "",
  ];

  for (const section of sections) {
    lines.push(section.title);
    lines.push(...section.rows.map((row) => `${row.label}: ${displayValue(row.value)}`));
    lines.push("");
  }

  lines.push(`Formulier-ID: ${input.intakeId}`);
  return lines.join("\r\n");
}

function base64Lines(value: string) {
  return Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function mimeMessage(input: NotificationInput, recipient: string, sender: string) {
  const dealUrl = new URL(`/deals/${encodeURIComponent(input.dealId)}`, requestOrigin(input.request)).toString();
  const sections = customerDetails(input.formData);
  const subject = `Klantgegevens ontvangen - ${input.formData.deliveryName || "nieuwe klant"}`;
  const boundary = `smart-trade-${randomUUID()}`;
  const messageDomain = sender.split("@")[1] || "sales.troublefree.nl";

  return [
    `From: Smart Trade Sales <${sender}>`,
    `To: ${recipient}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <customer-intake-${input.intakeId}-${randomUUID()}@${messageDomain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(textBody(input, dealUrl, sections)),
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(htmlBody(input, dealUrl, sections)),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function sendWithSendmail(path: string, sender: string, message: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(path, ["-i", "-t", "-f", sender], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(new Error("De mailserver reageerde niet binnen 15 seconden."));
    }, 15_000);

    child.stderr?.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-4_000);
    });
    child.on("error", (error) => {
      finish(new Error(`Sendmail starten mislukt: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(stderr.trim() || `Sendmail stopte met code ${code ?? "onbekend"}.`));
    });
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(message, "utf8");
  });
}

export async function sendCustomerIntakeNotification(input: NotificationInput) {
  const recipient = (
    process.env.SALES_CUSTOMER_FORM_NOTIFICATION_EMAIL || DEFAULT_RECIPIENT
  ).trim().toLowerCase();
  const sender = (
    process.env.SALES_NOTIFICATION_FROM_EMAIL || DEFAULT_SENDER
  ).trim().toLowerCase();
  const sendmailPath = (
    process.env.SALES_SENDMAIL_PATH || DEFAULT_SENDMAIL_PATH
  ).trim();

  if (!EMAIL_PATTERN.test(recipient)) {
    throw new Error("SALES_CUSTOMER_FORM_NOTIFICATION_EMAIL is geen geldig e-mailadres.");
  }
  if (!EMAIL_PATTERN.test(sender)) {
    throw new Error("SALES_NOTIFICATION_FROM_EMAIL is geen geldig e-mailadres.");
  }

  await sendWithSendmail(sendmailPath, sender, mimeMessage(input, recipient, sender));
}
