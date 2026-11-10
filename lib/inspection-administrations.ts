import type { PackageConfig } from "@/lib/pricing";
import type { AssetExpansionLine } from "@/lib/supabase";

// Artikelreferenties voor omzetting van het huidige pakket, geen assetklasse-ID's.
export const INSPECTION_ADMINISTRATION_ARTICLES: Readonly<Record<string, number>> = {
  starter: 625,
  premium: 624,
  enterprise: 623,
  basic: 622,
  lite: 621,
};

export function getAdministrationNames(assets: readonly { name: string }[]): string[] {
  const names = new Map<string, string>();
  for (const asset of assets) {
    const match = asset.name.match(/\(([^()]+)\)(?:\s*\(\d+\))?\s*$/);
    const name = match?.[1].trim().replace(/\s+/g, " ");
    if (!name || /^\d+$/.test(name) || /^(chauffeursmodule|per gebruiker)$/i.test(name)) continue;
    const key = name.toLocaleLowerCase("nl-NL");
    if (!names.has(key)) names.set(key, name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, "nl-NL"));
}

export function getInspectionAdministrationLines(
  currentPackage: PackageConfig,
  monthlyPrice: number,
  administrationName?: string,
): AssetExpansionLine[] {
  const article = INSPECTION_ADMINISTRATION_ARTICLES[currentPackage.key];
  if (!article || !Number.isFinite(monthlyPrice) || monthlyPrice < 0) {
    throw new Error("De artikelprijs voor inkijk administratie ontbreekt.");
  }
  const administration = administrationName?.trim().replace(/\s+/g, " ");
  return [{
    group: "Inkijk administratie",
    label: `Smart Trade ${currentPackage.name} inkijk administratie${administration ? ` (${administration})` : ""}`,
    quantity: 1,
    cadence: "monthly",
    amount: monthlyPrice,
    note: `Artikel ${article}. Omzetten huidige administratie; pakket blijft ${currentPackage.name}.`,
  }];
}
