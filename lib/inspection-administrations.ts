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

export function getInspectionAdministrationLines(
  currentPackage: PackageConfig,
  monthlyPrice: number,
): AssetExpansionLine[] {
  const article = INSPECTION_ADMINISTRATION_ARTICLES[currentPackage.key];
  if (!article || !Number.isFinite(monthlyPrice) || monthlyPrice < 0) {
    throw new Error("De artikelprijs voor inkijk administratie ontbreekt.");
  }
  return [{
    group: "Inkijk administratie",
    label: `Smart Trade ${currentPackage.name} inkijk administratie`,
    quantity: 1,
    cadence: "monthly",
    amount: monthlyPrice,
    note: `Artikel ${article}. Omzetten huidige administratie; pakket blijft ${currentPackage.name}.`,
  }];
}
