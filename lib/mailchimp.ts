import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SmartTradeMailchimpContact, SmartTradeMailchimpSource } from "@/lib/smart-trade-api";
import type { MailchimpSyncSettings } from "@/lib/mailchimp-settings-storage";

export type MailchimpAudience = {
  id: string;
  name: string;
  memberCount: number;
};

type MailchimpMember = {
  email: string;
  status: string;
  company: string;
  tags: string[];
};

export type MailchimpPreviewContact = SmartTradeMailchimpContact & {
  state: "new" | "update" | "unchanged" | "blocked";
  mailchimpStatus: string | null;
};

export type MailchimpPreview = {
  configured: boolean;
  audienceSelected: boolean;
  audience: MailchimpAudience | null;
  audiences: MailchimpAudience[];
  source: SmartTradeMailchimpSource;
  contacts: MailchimpPreviewContact[];
  counts: {
    total: number;
    new: number;
    update: number;
    unchanged: number;
    blocked: number;
    removeTags: number;
  };
  apiKeyExpiresAt: string | null;
  apiKeyExpiryDays: number | null;
  companyFieldReady: boolean;
  lastSyncAt: string | null;
  lastSyncResult: Record<string, unknown> | null;
};

type MailchimpConfig = {
  apiKey: string;
  server: string;
  baseUrl: string;
  companyMergeTag: string;
};

const BLOCKED_STATUSES = new Set(["unsubscribed", "cleaned", "pending", "transactional"]);
const SYNC_CONCURRENCY = 5;
const MAILCHIMP_REQUEST_TIMEOUT_MS = 30_000;

function runtimeEnvironmentValue(name: string) {
  const processValue = process.env[name]?.trim();
  if (processValue) return processValue;

  try {
    const envPath = process.env.SALES_ENV_FILE?.trim() || join(process.cwd(), ".env.local");
    const line = readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .find((candidate) => candidate.trim().replace(/^export\s+/, "").startsWith(`${name}=`));
    if (!line) return "";

    let value = line.trim().replace(/^export\s+/, "").slice(name.length + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    return value.trim();
  } catch {
    return "";
  }
}

function configOrNull(): MailchimpConfig | null {
  const apiKey = runtimeEnvironmentValue("MAILCHIMP_API_KEY");
  if (!apiKey) return null;
  const keyServer = apiKey.includes("-") ? apiKey.split("-").pop()?.trim() : "";
  const server = runtimeEnvironmentValue("MAILCHIMP_SERVER_PREFIX") || keyServer;
  if (!server || !/^[a-z0-9-]+$/i.test(server)) {
    throw new Error("Mailchimp server-prefix ontbreekt. Vul MAILCHIMP_SERVER_PREFIX in.");
  }
  return {
    apiKey,
    server,
    baseUrl: `https://${server}.api.mailchimp.com/3.0`,
    companyMergeTag: runtimeEnvironmentValue("MAILCHIMP_COMPANY_MERGE_FIELD").toUpperCase() || "COMPANY",
  };
}

async function mailchimpRequest<T>(config: MailchimpConfig, path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAILCHIMP_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`sales:${config.apiKey}`).toString("base64")}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Mailchimp reageert niet binnen 30 seconden. Probeer het later opnieuw.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const body = await response.text();
  let json: unknown = {};
  try {
    json = body ? JSON.parse(body) : {};
  } catch {
    json = { detail: body };
  }
  if (!response.ok) {
    const error = json as { title?: string; detail?: string };
    throw new Error(error.detail || error.title || `Mailchimp-fout ${response.status}.`);
  }
  return json as T;
}

export function getMailchimpConfigurationStatus() {
  const config = configOrNull();
  const expiresAt = runtimeEnvironmentValue("MAILCHIMP_API_KEY_EXPIRES_AT") || "2027-08-12";
  const expiryTime = Date.parse(`${expiresAt}T23:59:59Z`);
  const apiKeyExpiryDays = Number.isFinite(expiryTime)
    ? Math.ceil((expiryTime - Date.now()) / 86_400_000)
    : null;
  return {
    configured: Boolean(config),
    apiKeyExpiresAt: Number.isFinite(expiryTime) ? expiresAt : null,
    apiKeyExpiryDays,
  };
}

export async function getMailchimpAudiences() {
  const config = configOrNull();
  if (!config) return [];
  const json = await mailchimpRequest<{
    lists?: Array<{ id?: string; name?: string; stats?: { member_count?: number } }>;
  }>(config, "/lists?count=100&fields=lists.id,lists.name,lists.stats.member_count");
  return (json.lists ?? []).flatMap((list) => list.id ? [{
    id: list.id,
    name: list.name?.trim() || list.id,
    memberCount: Number(list.stats?.member_count ?? 0),
  }] : []);
}

async function getMembers(config: MailchimpConfig, audienceId: string) {
  const members = new Map<string, MailchimpMember>();
  const count = 1000;
  let offset = 0;

  while (true) {
    const path = `/lists/${encodeURIComponent(audienceId)}/members?count=${count}&offset=${offset}`
      + "&fields=members.email_address,members.status,members.merge_fields,members.tags,total_items";
    const json = await mailchimpRequest<{
      members?: Array<{
        email_address?: string;
        status?: string;
        merge_fields?: Record<string, unknown>;
        tags?: Array<{ name?: string }>;
      }>;
      total_items?: number;
    }>(config, path);
    const rows = json.members ?? [];
    for (const row of rows) {
      const email = row.email_address?.trim().toLowerCase();
      if (!email) continue;
      members.set(email, {
        email,
        status: row.status?.trim().toLowerCase() || "unknown",
        company: typeof row.merge_fields?.[config.companyMergeTag] === "string"
          ? String(row.merge_fields[config.companyMergeTag]).trim()
          : "",
        tags: (row.tags ?? []).map((tag) => tag.name?.trim() || "").filter(Boolean).sort(),
      });
    }
    offset += rows.length;
    if (rows.length === 0 || offset >= Number(json.total_items ?? 0)) break;
  }
  return members;
}

async function companyFieldExists(config: MailchimpConfig, audienceId: string) {
  const json = await mailchimpRequest<{ merge_fields?: Array<{ tag?: string }> }>(
    config,
    `/lists/${encodeURIComponent(audienceId)}/merge-fields?count=100&fields=merge_fields.tag`,
  );
  return (json.merge_fields ?? []).some((field) => field.tag?.toUpperCase() === config.companyMergeTag);
}

function arraysEqual(left: string[], right: string[]) {
  const a = [...left].sort((x, y) => x.localeCompare(y, "nl"));
  const b = [...right].sort((x, y) => x.localeCompare(y, "nl"));
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function resolveAudience(audiences: MailchimpAudience[], settings: MailchimpSyncSettings) {
  const configuredId = runtimeEnvironmentValue("MAILCHIMP_AUDIENCE_ID") || settings.audienceId;
  if (configuredId) return audiences.find((audience) => audience.id === configuredId) ?? null;
  return audiences.length === 1 ? audiences[0] : null;
}

export async function buildMailchimpPreview(
  sourceInput: SmartTradeMailchimpSource | Promise<SmartTradeMailchimpSource>,
  settings: MailchimpSyncSettings,
  options: { includeMembers?: boolean } = {},
): Promise<MailchimpPreview> {
  const configuration = getMailchimpConfigurationStatus();
  const audiences = configuration.configured ? await getMailchimpAudiences() : [];
  const audience = resolveAudience(audiences, settings);
  const config = configOrNull();
  const includeMembers = options.includeMembers !== false;
  const membersPromise = config && audience && includeMembers
    ? getMembers(config, audience.id)
    : Promise.resolve(new Map<string, MailchimpMember>());
  const companyFieldPromise = config && audience
    ? companyFieldExists(config, audience.id)
    : Promise.resolve(false);
  const [source, members, companyFieldReady] = await Promise.all([
    Promise.resolve(sourceInput),
    membersPromise,
    companyFieldPromise,
  ]);
  const managedTags = new Set([...settings.managedTags, ...source.tags]);
  const contacts: MailchimpPreviewContact[] = source.contacts.map((contact) => {
    const current = members.get(contact.email);
    if (!current) return { ...contact, state: "new", mailchimpStatus: null };
    if (BLOCKED_STATUSES.has(current.status)) {
      return { ...contact, state: "blocked", mailchimpStatus: current.status };
    }
    const currentManagedTags = current.tags.filter((tag) => managedTags.has(tag));
    const changed = current.company !== contact.company || !arraysEqual(currentManagedTags, contact.tags);
    return { ...contact, state: changed ? "update" : "unchanged", mailchimpStatus: current.status };
  });
  const currentEmails = new Set(source.contacts.map((contact) => contact.email));
  const removeTags = settings.previousEmails.filter((email) => !currentEmails.has(email) && members.has(email)).length;

  return {
    ...configuration,
    audienceSelected: Boolean(audience),
    audience,
    audiences,
    source,
    contacts,
    counts: {
      total: contacts.length,
      new: contacts.filter((contact) => contact.state === "new").length,
      update: contacts.filter((contact) => contact.state === "update").length,
      unchanged: contacts.filter((contact) => contact.state === "unchanged").length,
      blocked: contacts.filter((contact) => contact.state === "blocked").length,
      removeTags,
    },
    companyFieldReady,
    lastSyncAt: settings.lastSyncAt,
    lastSyncResult: settings.lastSyncResult,
  };
}

async function ensureCompanyField(config: MailchimpConfig, audienceId: string) {
  if (await companyFieldExists(config, audienceId)) return;
  await mailchimpRequest(config, `/lists/${encodeURIComponent(audienceId)}/merge-fields`, {
    method: "POST",
    body: JSON.stringify({ name: "Company", type: "text", tag: config.companyMergeTag }),
  });
}

function subscriberHash(email: string) {
  return createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}

async function mapWithConcurrency<T, R>(items: T[], mapper: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(SYNC_CONCURRENCY, items.length) }, () => worker()));
  return output;
}

export async function synchronizeMailchimp(source: SmartTradeMailchimpSource, settings: MailchimpSyncSettings) {
  if (source.contactPersonErrorCount > 0) {
    throw new Error(
      `Synchronisatie geblokkeerd: bij ${source.contactPersonErrorCount} relaties konden de contactpersonen niet volledig worden opgehaald.`,
    );
  }
  const config = configOrNull();
  if (!config) throw new Error("Mailchimp is nog niet geconfigureerd.");
  const audiences = await getMailchimpAudiences();
  const audience = resolveAudience(audiences, settings);
  if (!audience) throw new Error("Selecteer eerst een Mailchimp-publiek.");
  const members = await getMembers(config, audience.id);
  await ensureCompanyField(config, audience.id);
  const managedTags = Array.from(new Set([...settings.managedTags, ...source.tags])).sort((a, b) => a.localeCompare(b, "nl"));
  const failures: Array<{ email: string; error: string }> = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let blocked = 0;

  await mapWithConcurrency(source.contacts, async (contact) => {
    const current = members.get(contact.email);
    if (current && BLOCKED_STATUSES.has(current.status)) {
      blocked += 1;
      return;
    }
    const hash = subscriberHash(contact.email);
    const currentManagedTags = current?.tags.filter((tag) => managedTags.includes(tag)) ?? [];
    const changed = !current || current.company !== contact.company || !arraysEqual(currentManagedTags, contact.tags);
    if (!changed) {
      unchanged += 1;
      return;
    }

    try {
      await mailchimpRequest(config, `/lists/${encodeURIComponent(audience.id)}/members/${hash}`, {
        method: "PUT",
        body: JSON.stringify({
          email_address: contact.email,
          status_if_new: "subscribed",
          merge_fields: { [config.companyMergeTag]: contact.company.slice(0, 255) },
        }),
      });
      const activeTags = new Set(contact.tags);
      const tagChanges = managedTags.map((name) => ({ name, status: activeTags.has(name) ? "active" : "inactive" }));
      if (tagChanges.length) {
        await mailchimpRequest(config, `/lists/${encodeURIComponent(audience.id)}/members/${hash}/tags`, {
          method: "POST",
          body: JSON.stringify({ tags: tagChanges }),
        });
      }
      if (current) updated += 1;
      else created += 1;
    } catch (error) {
      failures.push({ email: contact.email, error: error instanceof Error ? error.message : "Onbekende fout" });
    }
  });

  const currentEmails = new Set(source.contacts.map((contact) => contact.email));
  const removedEmails = settings.previousEmails.filter((email) => !currentEmails.has(email));
  const removalRetries = new Set<string>();
  let tagsRemoved = 0;
  await mapWithConcurrency(removedEmails, async (email) => {
    const current = members.get(email);
    if (!current || BLOCKED_STATUSES.has(current.status)) return;
    const tags = current.tags.filter((tag) => managedTags.includes(tag));
    if (!tags.length) return;
    try {
      await mailchimpRequest(config, `/lists/${encodeURIComponent(audience.id)}/members/${subscriberHash(email)}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags: tags.map((name) => ({ name, status: "inactive" })) }),
      });
      tagsRemoved += 1;
    } catch (error) {
      removalRetries.add(email);
      failures.push({ email, error: error instanceof Error ? error.message : "Tags verwijderen mislukt" });
    }
  });

  return {
    audienceId: audience.id,
    audienceName: audience.name,
    created,
    updated,
    unchanged,
    blocked,
    tagsRemoved,
    failed: failures.length,
    failures: failures.slice(0, 50),
    managedTags,
    previousEmails: Array.from(new Set([
      ...source.contacts.map((contact) => contact.email),
      ...removalRetries,
    ])),
  };
}
