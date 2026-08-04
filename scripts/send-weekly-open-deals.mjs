import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;
const TIME_ZONE = "Europe/Amsterdam";
const SETTINGS_KEY = "weekly-open-deals-email";
const DEFAULT_SENDER = "notifications@sales.troublefree.nl";
const DEFAULT_SENDMAIL_PATH = "/usr/sbin/sendmail";
const DEFAULT_PUBLIC_URL = "https://sales.troublefree.nl";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim().replace(/^export\s+/, "");
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;

    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

function hasFlag(flag) {
  return process.argv.includes(flag);
}

if (hasFlag("--help")) {
  console.log([
    "Gebruik: npm run mail:open-deals -- [--dry-run] [--force]",
    "  --dry-run  Toon ontvangers en aantallen zonder e-mail te versturen.",
    "  --force    Verstuur opnieuw, ook als de dinsdagmail vandaag al is verzonden.",
  ].join("\n"));
  process.exit(0);
}

const dryRun = hasFlag("--dry-run");
const force = hasFlag("--force");
const sender = (process.env.SALES_NOTIFICATION_FROM_EMAIL || DEFAULT_SENDER).trim().toLowerCase();
const sendmailPath = (process.env.SALES_SENDMAIL_PATH || DEFAULT_SENDMAIL_PATH).trim();
const publicUrl = (process.env.SALES_PUBLIC_URL || DEFAULT_PUBLIC_URL).trim().replace(/\/+$/, "");

if (!EMAIL_PATTERN.test(sender)) {
  throw new Error("SALES_NOTIFICATION_FROM_EMAIL is geen geldig e-mailadres.");
}

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.PGHOST || "/var/run/postgresql",
      database: process.env.PGDATABASE || "sales_troublefree_nl",
      user: process.env.PGUSER || process.env.USER || "sales.troublefree.nl",
      password: process.env.PGPASSWORD || undefined,
    });

function escapeHtml(value) {
  return String(value ?? "").replace(
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

function formatDate(value, options = {}) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  }).format(date);
}

function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function displayName(profile) {
  const fullName = String(profile.full_name ?? "").trim();
  if (fullName) return fullName;
  return String(profile.email ?? "").split("@")[0] || "collega";
}

function firstName(profile) {
  return displayName(profile).split(/\s+/)[0] || "collega";
}

function displayText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function telephoneLink(phone) {
  const text = displayText(phone);
  if (text === "-") return "-";
  const href = text.replace(/[^\d+]/g, "");
  return `<a href="tel:${escapeHtml(href)}" style="color:#146edb;text-decoration:underline">${escapeHtml(text)}</a>`;
}

function dealLink(deal) {
  return `${publicUrl}/deals/${encodeURIComponent(deal.id)}`;
}

function buildHtml(profile, deals, dateLabel) {
  const rows = deals.map((deal, index) => {
    const background = index % 2 === 0 ? "#f8fafc" : "#ffffff";
    return [
      `<tr style="background:${background}">`,
      `<td style="padding:9px 10px;border-bottom:1px solid #dbe3ec;font-weight:700;color:#172033">${escapeHtml(displayText(deal.customer_name, "Naam ontbreekt"))}</td>`,
      `<td style="padding:9px 10px;border-bottom:1px solid #dbe3ec;color:#334155">${escapeHtml(displayText(deal.contact_name))}</td>`,
      `<td style="padding:9px 10px;border-bottom:1px solid #dbe3ec;color:#334155">${telephoneLink(deal.phone)}</td>`,
      `<td style="padding:9px 10px;border-bottom:1px solid #dbe3ec;color:#334155">${escapeHtml(displayText(deal.consultant_name))}</td>`,
      `<td style="padding:9px 10px;border-bottom:1px solid #dbe3ec;white-space:nowrap;color:#334155">${escapeHtml(formatDate(deal.updated_at))}</td>`,
      `<td style="padding:9px 10px;border-bottom:1px solid #dbe3ec;white-space:nowrap"><a href="${escapeHtml(dealLink(deal))}" style="color:#146edb;text-decoration:underline;font-weight:700">Open deal</a></td>`,
      "</tr>",
    ].join("");
  }).join("");

  const overview = deals.length > 0
    ? [
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:980px;border-collapse:collapse;border:1px solid #dbe3ec;font-family:Calibri,Arial,sans-serif;font-size:11pt">',
        '<thead><tr style="background:#173b5b;color:#ffffff">',
        '<th align="left" style="padding:10px">Klant</th>',
        '<th align="left" style="padding:10px">Contactpersoon</th>',
        '<th align="left" style="padding:10px">Telefoon</th>',
        '<th align="left" style="padding:10px">Consultant</th>',
        '<th align="left" style="padding:10px">Bijgewerkt</th>',
        '<th align="left" style="padding:10px">Actie</th>',
        "</tr></thead>",
        `<tbody>${rows}</tbody>`,
        "</table>",
      ].join("")
    : '<p style="margin:18px 0;padding:14px 16px;background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46">Er zijn op dit moment geen openstaande deals.</p>';

  return [
    '<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#172033">',
    `<p style="margin:0 0 12px">Goedemorgen ${escapeHtml(firstName(profile))},</p>`,
    `<p style="margin:0 0 16px">Hieronder staat het overzicht van <strong>${deals.length} openstaande ${deals.length === 1 ? "deal" : "deals"}</strong> die aan jou gekoppeld zijn op ${escapeHtml(dateLabel)}. Gebruik dit overzicht om klanten op tijd na te bellen.</p>`,
    overview,
    '<p style="margin:18px 0 0;color:#64748b">Is een deal afgerond? Gebruik dan in de deal de knop <strong>Klaar en archiveren</strong>. De deal staat daarna niet meer in deze wekelijkse e-mail.</p>',
    '<p style="margin:18px 0 0">Smart Trade Sales</p>',
    "</div>",
  ].join("");
}

function buildText(profile, deals, dateLabel) {
  const lines = [
    `Goedemorgen ${firstName(profile)},`,
    "",
    `Hieronder staat het overzicht van ${deals.length} openstaande ${deals.length === 1 ? "deal" : "deals"} die aan jou gekoppeld zijn op ${dateLabel}.`,
    "",
  ];

  if (deals.length === 0) {
    lines.push("Er zijn op dit moment geen openstaande deals.");
  } else {
    for (const deal of deals) {
      lines.push(displayText(deal.customer_name, "Naam ontbreekt"));
      lines.push(`Contactpersoon: ${displayText(deal.contact_name)}`);
      lines.push(`Telefoon: ${displayText(deal.phone)}`);
      lines.push(`Consultant: ${displayText(deal.consultant_name)}`);
      lines.push(`Bijgewerkt: ${formatDate(deal.updated_at)}`);
      lines.push(`Open deal: ${dealLink(deal)}`);
      lines.push("");
    }
  }

  lines.push("Is een deal afgerond? Gebruik dan in de deal de knop Klaar en archiveren.");
  lines.push("", "Smart Trade Sales");
  return lines.join("\r\n");
}

function base64Lines(value) {
  return Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function mimeMessage(profile, deals, dateLabel) {
  const boundary = `smart-trade-${randomUUID()}`;
  const subject = `Openstaande deals - ${deals.length} ${deals.length === 1 ? "deal" : "deals"}`;
  const recipient = String(profile.email).trim().toLowerCase();
  const domain = sender.split("@")[1] || "sales.troublefree.nl";

  return [
    `From: Smart Trade Sales <${sender}>`,
    `To: ${recipient}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <weekly-open-deals-${localDateKey()}-${randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(buildText(profile, deals, dateLabel)),
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(buildHtml(profile, deals, dateLabel)),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function sendWithSendmail(message) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(sendmailPath, ["-i", "-t", "-f", sender], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) rejectPromise(error);
      else resolvePromise();
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(new Error("De mailserver reageerde niet binnen 30 seconden."));
    }, 30_000);

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

async function readProfiles() {
  const configuredRecipients = String(process.env.SALES_WEEKLY_DEALS_RECIPIENTS || "")
    .split(/[;,]/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => EMAIL_PATTERN.test(email));

  if (configuredRecipients.length > 0) {
    const { rows } = await pool.query(
      `select id::text, email, full_name
       from public.profiles
       where lower(email) = any($1::text[])
       order by lower(coalesce(nullif(btrim(full_name), ''), email))`,
      [configuredRecipients],
    );
    const byEmail = new Map(rows.map((row) => [String(row.email).toLowerCase(), row]));
    return configuredRecipients.map((email) => byEmail.get(email) ?? { id: email, email, full_name: email.split("@")[0] });
  }

  const { rows } = await pool.query(
    `select id::text, email, full_name
     from public.profiles
     where email is not null
       and btrim(email) <> ''
     order by lower(coalesce(nullif(btrim(full_name), ''), email))`,
  );
  return rows.filter((profile) => EMAIL_PATTERN.test(String(profile.email).trim().toLowerCase()));
}

async function readOpenDeals() {
  const { rows } = await pool.query(
    `select d.id::text,
            d.user_id::text,
            d.customer_name,
            d.contact_name,
            d.updated_at,
            coalesce(
              nullif(btrim(p.full_name), ''),
              nullif(split_part(p.email, '@', 1), ''),
              nullif(btrim(d.sales_name), ''),
              '-'
            ) as consultant_name,
            coalesce(
              nullif(btrim(ci.form_data->>'contactPhone'), ''),
              nullif(btrim(ci.form_data->>'phone'), ''),
              ''
            ) as phone
     from public.deals d
     left join public.profiles p on p.id = d.user_id
     left join public.customer_intakes ci on ci.deal_id = d.id
     where d.archived_at is null
     order by d.updated_at asc, lower(coalesce(d.customer_name, d.quote_title, d.id::text))`,
  );
  return rows;
}

async function readRunState(dateKey) {
  const { rows } = await pool.query(
    `select payload
     from public.app_settings
     where key = $1
     limit 1`,
    [SETTINGS_KEY],
  );
  const payload = rows[0]?.payload;
  if (!payload || payload.sentDate !== dateKey) return { sentRecipients: [] };
  return {
    sentRecipients: Array.isArray(payload.sentRecipients)
      ? payload.sentRecipients.map((email) => String(email).toLowerCase())
      : [],
  };
}

async function writeRunState(dateKey, sentRecipients, dealCount, completed) {
  await pool.query(
    `insert into public.app_settings (key, payload, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (key) do update
       set payload = excluded.payload,
           updated_at = now()`,
    [
      SETTINGS_KEY,
      JSON.stringify({
        sentDate: dateKey,
        sentRecipients,
        dealCount,
        completed,
        completedAt: completed ? new Date().toISOString() : null,
      }),
    ],
  );
}

async function main() {
  const dateKey = localDateKey();
  const dateLabel = formatDate(new Date(), { weekday: "long" });
  const [profiles, deals, state] = await Promise.all([
    readProfiles(),
    readOpenDeals(),
    readRunState(dateKey),
  ]);

  console.log(`Openstaande deals: ${deals.length}`);
  console.log(`Ontvangers: ${profiles.map((profile) => profile.email).join(", ") || "geen"}`);

  const dealsByUserId = new Map();
  for (const deal of deals) {
    const userId = String(deal.user_id ?? "");
    if (!dealsByUserId.has(userId)) dealsByUserId.set(userId, []);
    dealsByUserId.get(userId).push(deal);
  }

  if (dryRun) {
    for (const profile of profiles) {
      console.log(`${profile.email}: ${(dealsByUserId.get(String(profile.id)) ?? []).length} openstaande deals`);
    }
    console.log("Proef uitgevoerd; er zijn geen e-mails verstuurd.");
    return;
  }

  const sentRecipients = force ? [] : [...new Set(state.sentRecipients)];
  const sentSet = new Set(sentRecipients);
  let failed = 0;

  for (const profile of profiles) {
    const email = String(profile.email).trim().toLowerCase();
    const profileDeals = dealsByUserId.get(String(profile.id)) ?? [];
    if (sentSet.has(email)) {
      console.log(`Overgeslagen, vandaag al verzonden: ${email}`);
      continue;
    }

    try {
      await sendWithSendmail(mimeMessage(profile, profileDeals, dateLabel));
      sentRecipients.push(email);
      sentSet.add(email);
      await writeRunState(dateKey, sentRecipients, deals.length, false);
      console.log(`Verzonden: ${email} (${profileDeals.length} openstaande deals)`);
    } catch (error) {
      failed += 1;
      console.error(`Verzenden mislukt voor ${email}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const completed = profiles.every((profile) => sentSet.has(String(profile.email).trim().toLowerCase()));
  await writeRunState(dateKey, sentRecipients, deals.length, completed);

  if (failed > 0 || !completed) {
    throw new Error(`De wekelijkse dealmail is niet voor alle ontvangers verzonden (${failed} mislukt).`);
  }

  console.log(`Klaar: ${sentRecipients.length} persoonlijke e-mails; ${deals.length} openstaande deals verdeeld op eigenaar.`);
}

try {
  await main();
} finally {
  await pool.end();
}
