import type { PackageConfig } from "@/lib/pricing";
import type { AssetExpansionLine } from "@/lib/supabase";

// Door de gebruiker opgegeven artikelreferenties; dit zijn niet automatisch assetklasse-ID's.
export const EXTRA_ADMINISTRATION_ARTICLES: Readonly<Record<string, number>> = {
  starter: 605,
  premium: 604,
  enterprise: 603,
  basic: 602,
  lite: 478,
};

export const EXTRA_ADMINISTRATION_MONTHLY_PRICES: Readonly<Record<string, number>> = {
  starter: 19.20,
  premium: 34.15,
  enterprise: 40.30,
  basic: 27.95,
  lite: 12.90,
};

export function getExtraAdministrationLines(
  pkg: PackageConfig,
  quantity: number,
  monthlyPrice: number,
  includeSupport: boolean,
): AssetExpansionLine[] {
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000) {
    throw new Error("Vul een geheel aantal extra administraties in tussen 0 en 1000.");
  }
  if (quantity === 0) return [];
  const article = EXTRA_ADMINISTRATION_ARTICLES[pkg.key];
  if (!article || !Number.isFinite(monthlyPrice) || monthlyPrice < 0) {
    throw new Error("De artikelprijs voor extra administraties ontbreekt.");
  }
  const lines: AssetExpansionLine[] = [{
    group: "Extra administratie",
    label: `Smart Trade ${pkg.name} extra administratie`,
    quantity,
    cadence: "monthly",
    amount: quantity * monthlyPrice,
    note: `Artikel ${article}`,
  }];
  if (includeSupport) {
    lines.push({
      group: "Extra administratie",
      label: `Smart Trade ${pkg.name} Supportcontract Extra gebruiker`,
      quantity,
      cadence: "monthly",
      amount: quantity * pkg.supportExtra,
    });
  }
  return lines;
}
