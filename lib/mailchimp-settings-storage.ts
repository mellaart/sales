import { Buffer } from "node:buffer";
import type { ServiceClient } from "@/lib/admin-api";

export const MAILCHIMP_SETTINGS_BUCKET = "smart-trade-settings";
export const MAILCHIMP_SETTINGS_FILE = "mailchimp-settings.json";

export type MailchimpSyncSettings = {
  audienceId: string | null;
  managedTags: string[];
  previousEmails: string[];
  lastSyncAt: string | null;
  lastSyncResult: Record<string, unknown> | null;
};

const DEFAULT_SETTINGS: MailchimpSyncSettings = {
  audienceId: null,
  managedTags: [],
  previousEmails: [],
  lastSyncAt: null,
  lastSyncResult: null,
};

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean)));
}

function normalizeSettings(value: unknown): MailchimpSyncSettings {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    audienceId: typeof source.audienceId === "string" && source.audienceId.trim()
      ? source.audienceId.trim()
      : null,
    managedTags: normalizeStringList(source.managedTags),
    previousEmails: normalizeStringList(source.previousEmails).map((email) => email.toLowerCase()),
    lastSyncAt: typeof source.lastSyncAt === "string" ? source.lastSyncAt : null,
    lastSyncResult: source.lastSyncResult && typeof source.lastSyncResult === "object"
      ? source.lastSyncResult as Record<string, unknown>
      : null,
  };
}

export async function readMailchimpSettings(service: ServiceClient | null) {
  if (!service) return DEFAULT_SETTINGS;
  const { data, error } = await service.storage.from(MAILCHIMP_SETTINGS_BUCKET).download(MAILCHIMP_SETTINGS_FILE);
  if (error || !data) return DEFAULT_SETTINGS;

  try {
    return normalizeSettings(JSON.parse(await data.text()) as unknown);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function ensureSettingsBucket(service: ServiceClient) {
  const { error } = await service.storage.getBucket(MAILCHIMP_SETTINGS_BUCKET);
  if (!error) return;
  const { error: createError } = await service.storage.createBucket(MAILCHIMP_SETTINGS_BUCKET, { public: false });
  if (createError && !createError.message.toLowerCase().includes("already")) throw new Error(createError.message);
}

export async function writeMailchimpSettings(service: ServiceClient, value: MailchimpSyncSettings) {
  const settings = normalizeSettings(value);
  await ensureSettingsBucket(service);
  const payload = Buffer.from(JSON.stringify(settings, null, 2), "utf8");
  const { error } = await service.storage.from(MAILCHIMP_SETTINGS_BUCKET).upload(MAILCHIMP_SETTINGS_FILE, payload, {
    contentType: "application/json",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return settings;
}
