import { Buffer } from "node:buffer";
import { readStoredFile } from "@/lib/local-storage";
import {
  ROLE_TAB_ACCESS,
  normalizeRoleTabAccess,
  type RoleTabAccessMap,
} from "@/lib/role-tabs";
import type { ServiceClient } from "@/lib/admin-api";

export const ROLE_TAB_SETTINGS_BUCKET = "smart-trade-settings";
export const ROLE_TAB_SETTINGS_FILE = "role-tab-access.json";

function extractRoleTabAccess(payload: unknown) {
  if (payload && typeof payload === "object" && "roleTabAccess" in payload) {
    return normalizeRoleTabAccess((payload as { roleTabAccess?: unknown }).roleTabAccess);
  }

  return normalizeRoleTabAccess(payload);
}

export async function readStoredRoleTabAccess(service: ServiceClient | null) {
  if (!service) {
    return { roleTabAccess: ROLE_TAB_ACCESS, persisted: false, storageReady: false };
  }

  const { data, error } = await service.storage
    .from(ROLE_TAB_SETTINGS_BUCKET)
    .download(ROLE_TAB_SETTINGS_FILE);

  if (error || !data) {
    return { roleTabAccess: ROLE_TAB_ACCESS, persisted: false, storageReady: true };
  }

  try {
    const parsed = JSON.parse(await data.text()) as unknown;
    return { roleTabAccess: extractRoleTabAccess(parsed), persisted: true, storageReady: true };
  } catch {
    return { roleTabAccess: ROLE_TAB_ACCESS, persisted: false, storageReady: true };
  }
}

export async function readRoleTabAccess(service: ServiceClient | null) {
  return (await readStoredRoleTabAccess(service)).roleTabAccess;
}

export async function readLocalRoleTabAccess(): Promise<RoleTabAccessMap> {
  try {
    const stored = await readStoredFile(ROLE_TAB_SETTINGS_BUCKET, ROLE_TAB_SETTINGS_FILE);
    return extractRoleTabAccess(JSON.parse(stored.toString("utf8")) as unknown);
  } catch {
    return ROLE_TAB_ACCESS;
  }
}

async function ensureRoleTabSettingsBucket(service: ServiceClient) {
  const { error: existingBucketError } = await service.storage.getBucket(ROLE_TAB_SETTINGS_BUCKET);

  if (!existingBucketError) return;

  const { error: createBucketError } = await service.storage.createBucket(ROLE_TAB_SETTINGS_BUCKET, {
    public: false,
  });

  if (createBucketError && !createBucketError.message.toLowerCase().includes("already")) {
    throw new Error(createBucketError.message);
  }
}

export async function writeStoredRoleTabAccess(service: ServiceClient, input: unknown) {
  const roleTabAccess = normalizeRoleTabAccess(input);
  const updatedAt = new Date().toISOString();

  await ensureRoleTabSettingsBucket(service);

  const payload = Buffer.from(
    JSON.stringify(
      {
        roleTabAccess,
        updatedAt,
      },
      null,
      2,
    ),
    "utf8",
  );

  const { error } = await service.storage
    .from(ROLE_TAB_SETTINGS_BUCKET)
    .upload(ROLE_TAB_SETTINGS_FILE, payload, {
      contentType: "application/json",
      upsert: true,
    });

  if (error) throw new Error(error.message);

  return { roleTabAccess, persisted: true, storageReady: true, updatedAt };
}
