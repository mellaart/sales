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

// Keep unnamed legacy quotes grouped; named administrations get their own offer rows.
export function getExtraAdministrationQuoteRows(
  lines: AssetExpansionLine[],
  names: string[],
) {
  return lines.flatMap((line) => {
    const price = line.amount / line.quantity;
    if (!names.slice(0, line.quantity).some((name) => name.trim())) {
      return [{ amount: `${line.quantity}x`, description: line.label, price, total: line.amount }];
    }
    return Array.from({ length: line.quantity }, (_, index) => ({
      amount: "1x",
      description: `${line.label} (${names[index]?.trim().replace(/\s+/g, " ") || `Administratie ${index + 1}`})`,
      price,
      total: price,
    }));
  });
}
