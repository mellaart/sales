import { Buffer } from "node:buffer";
import {
  DEFAULT_PRICE_CONFIG,
  normalizePricingConfig,
  type EditablePricingConfig,
} from "@/lib/price-config";
import type { ServiceClient } from "@/lib/admin-api";

export const PRICE_SETTINGS_BUCKET = "smart-trade-settings";
export const PRICE_SETTINGS_FILE = "price-config.json";

export async function readStoredPricingConfig(service: ServiceClient | null) {
  if (!service) {
    return { pricingConfig: DEFAULT_PRICE_CONFIG, persisted: false, storageReady: false };
  }

  const { data, error } = await service.storage.from(PRICE_SETTINGS_BUCKET).download(PRICE_SETTINGS_FILE);

  if (error || !data) {
    return { pricingConfig: DEFAULT_PRICE_CONFIG, persisted: false, storageReady: true };
  }

  try {
    const parsed = JSON.parse(await data.text()) as unknown;
    const source = parsed && typeof parsed === "object" && "pricingConfig" in parsed
      ? (parsed as { pricingConfig?: unknown }).pricingConfig
      : parsed;

    const pricingConfig = normalizePricingConfig(source);
    const hasLegacyBaseFunctionalities = Boolean(
      source
      && typeof source === "object"
      && !Array.isArray(source)
      && "baseFunctionalityWorkItems" in source,
    );

    if (hasLegacyBaseFunctionalities) {
      try {
        const migrated = await writeStoredPricingConfig(service, pricingConfig);
        return { pricingConfig: migrated.pricingConfig, persisted: true, storageReady: true };
      } catch {
        // Reading remains available if the one-time cleanup cannot be persisted yet.
      }
    }

    return { pricingConfig, persisted: true, storageReady: true };
  } catch {
    return { pricingConfig: DEFAULT_PRICE_CONFIG, persisted: false, storageReady: true };
  }
}

export async function ensurePriceSettingsBucket(service: ServiceClient) {
  const { error: existingBucketError } = await service.storage.getBucket(PRICE_SETTINGS_BUCKET);

  if (!existingBucketError) return;

  const { error: createBucketError } = await service.storage.createBucket(PRICE_SETTINGS_BUCKET, {
    public: false,
  });

  if (createBucketError && !createBucketError.message.toLowerCase().includes("already")) {
    throw new Error(createBucketError.message);
  }
}

export async function writeStoredPricingConfig(service: ServiceClient, pricingConfig: EditablePricingConfig) {
  await ensurePriceSettingsBucket(service);

  const updatedAt = new Date().toISOString();
  const normalizedPricingConfig = normalizePricingConfig({ ...pricingConfig, updatedAt });
  const payload = Buffer.from(
    JSON.stringify(
      {
        pricingConfig: normalizedPricingConfig,
        updatedAt,
      },
      null,
      2,
    ),
    "utf-8",
  );

  const { error } = await service.storage.from(PRICE_SETTINGS_BUCKET).upload(PRICE_SETTINGS_FILE, payload, {
    contentType: "application/json",
    upsert: true,
  });

  if (error) throw new Error(error.message);

  return { pricingConfig: normalizedPricingConfig, updatedAt };
}
