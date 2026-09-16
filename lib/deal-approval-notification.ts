import { query } from "@/lib/local-db";
import { sendWithSendmail } from "@/lib/customer-intake-notification";

type Notification = { dealId: string; customerName: string; acceptedAt: string; name: string; email: string };

export function approvalNotificationMessage(input: Notification, recipient: string, sender: string) {
  const url = new URL(`/deals/${encodeURIComponent(input.dealId)}`, process.env.SALES_PUBLIC_URL || "https://sales.troublefree.nl").toString();
  const date = new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(input.acceptedAt));
  const content = ["Klant akkoord met offerte", "", `Klant: ${input.customerName || "Onbekende klant"}`, `Naam: ${input.name}`, `E-mailadres: ${input.email}`, `Akkoord op: ${date}`, "", `Bekijk de deal: ${url}`].join("\n");
  return [
    `From: Smart Trade Sales <${sender}>`, `To: ${recipient}`,
    `Subject: =?UTF-8?B?${Buffer.from(`Offerte akkoord - ${input.customerName || "klant"}`).toString("base64")}?=`,
    `Date: ${new Date().toUTCString()}`, "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "",
    Buffer.from(content).toString("base64").match(/.{1,76}/g)?.join("\r\n") || "", "",
  ].join("\r\n");
}

export async function deliverPendingApprovalNotifications(onlyKey: string | null = null) {
  const recipient = (process.env.SALES_DEAL_APPROVAL_NOTIFICATION_EMAIL || process.env.SALES_DEAL_ACTIVITY_NOTIFICATION_EMAIL || "erik@smarttrade.nl").trim();
  const sender = (process.env.SALES_NOTIFICATION_FROM_EMAIL || "notifications@sales.troublefree.nl").trim();
  if (![recipient, sender].every(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) throw new Error("Ongeldig e-mailadres voor akkoordmeldingen.");
  const { rows } = await query<{ key: string }>(
    `select key from public.app_settings where key like 'deal-approval-notification:%'
     and ($1::text is null or key = $1)
     and (payload->>'status' in ('pending', 'failed') or (payload->>'status' = 'sending' and updated_at < now() - interval '5 minutes'))
     order by updated_at limit 10`, [onlyKey],
  );
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const claim = await query<{ payload: Notification }>(
      `update public.app_settings set payload = payload || '{"status":"sending"}'::jsonb, updated_at = now()
       where key = $1 and (payload->>'status' in ('pending', 'failed') or (payload->>'status' = 'sending' and updated_at < now() - interval '5 minutes')) returning payload`, [row.key],
    );
    if (!claim.rows[0]) continue;
    try {
      await sendWithSendmail(process.env.SALES_SENDMAIL_PATH || "/usr/sbin/sendmail", sender, approvalNotificationMessage(claim.rows[0].payload, recipient, sender));
      await query(`update public.app_settings set payload = (payload - 'error') || '{"status":"sent"}'::jsonb, updated_at = now() where key = $1`, [row.key]);
      sent++;
    } catch (error) {
      failed++;
      await query(`update public.app_settings set payload = payload || $2::jsonb, updated_at = now() where key = $1`, [row.key, JSON.stringify({ status: "failed", error: error instanceof Error ? error.message : "Mail verzenden mislukt" })]);
    }
  }
  return { sent, failed };
}
