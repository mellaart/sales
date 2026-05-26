export type PackageConfig = {
  key: string;
  name: string;
  licenseFirst: number;
  licenseExtra: number;
  supportFirst: number;
  supportExtra: number;
  includedModules: number;
  implementationVisits: Array<{ maxUsers: number; visits: number }>;
};

export type ModuleConfig = {
  key: string;
  name: string;
  monthlyPrice: number;
};

export const IMPLEMENTATION_DAY_RATE = 720;
export const VAT_RATE = 0.21;

export const PACKAGES: PackageConfig[] = [
  {
    key: "lite",
    name: "Lite",
    licenseFirst: 39.4,
    licenseExtra: 12.9,
    supportFirst: 27.3,
    supportExtra: 3.8,
    includedModules: 0,
    implementationVisits: [
      { maxUsers: 4, visits: 2 },
      { maxUsers: 9, visits: 3 },
      { maxUsers: 14, visits: 4 },
      { maxUsers: 19, visits: 5 },
      { maxUsers: 24, visits: 6 },
      { maxUsers: 29, visits: 7 },
      { maxUsers: 34, visits: 8 },
      { maxUsers: 39, visits: 9 },
      { maxUsers: Infinity, visits: 10 },
    ],
  },
  {
    key: "starter",
    name: "Starter",
    licenseFirst: 65.15,
    licenseExtra: 19.2,
    supportFirst: 51.45,
    supportExtra: 6.85,
    includedModules: 0,
    implementationVisits: [
      { maxUsers: 4, visits: 4 },
      { maxUsers: 9, visits: 5 },
      { maxUsers: 14, visits: 6 },
      { maxUsers: 19, visits: 7 },
      { maxUsers: 24, visits: 8 },
      { maxUsers: 29, visits: 9 },
      { maxUsers: 34, visits: 10 },
      { maxUsers: 39, visits: 11 },
      { maxUsers: Infinity, visits: 12 },
    ],
  },
  {
    key: "basic",
    name: "Basic",
    licenseFirst: 90,
    licenseExtra: 27.95,
    supportFirst: 64.65,
    supportExtra: 9.65,
    includedModules: 1,
    implementationVisits: [
      { maxUsers: 4, visits: 6 },
      { maxUsers: 9, visits: 7 },
      { maxUsers: 14, visits: 8 },
      { maxUsers: 19, visits: 9 },
      { maxUsers: 24, visits: 10 },
      { maxUsers: 29, visits: 11 },
      { maxUsers: 34, visits: 12 },
      { maxUsers: 39, visits: 13 },
      { maxUsers: Infinity, visits: 14 },
    ],
  },
  {
    key: "premium",
    name: "Premium",
    licenseFirst: 116.05,
    licenseExtra: 34.15,
    supportFirst: 77.55,
    supportExtra: 12.9,
    includedModules: 2,
    implementationVisits: [
      { maxUsers: 4, visits: 8 },
      { maxUsers: 9, visits: 9 },
      { maxUsers: 14, visits: 10 },
      { maxUsers: 19, visits: 11 },
      { maxUsers: 24, visits: 12 },
      { maxUsers: 29, visits: 13 },
      { maxUsers: 34, visits: 14 },
      { maxUsers: 39, visits: 15 },
      { maxUsers: Infinity, visits: 16 },
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    licenseFirst: 142.8,
    licenseExtra: 40.3,
    supportFirst: 90.45,
    supportExtra: 16.15,
    includedModules: 3,
    implementationVisits: [
      { maxUsers: 4, visits: 10 },
      { maxUsers: 9, visits: 11 },
      { maxUsers: 14, visits: 12 },
      { maxUsers: 19, visits: 13 },
      { maxUsers: 24, visits: 14 },
      { maxUsers: 29, visits: 15 },
      { maxUsers: 34, visits: 16 },
      { maxUsers: 39, visits: 17 },
      { maxUsers: Infinity, visits: 18 },
    ],
  },
];

export const MODULES: ModuleConfig[] = [
  { key: "mailchimp", name: "Mailchimp", monthlyPrice: 27.5 },
  { key: "rapportage", name: "Rapportage", monthlyPrice: 27.5 },
  { key: "scanHerken", name: "Scan & Herken", monthlyPrice: 55 },
  { key: "statistiekenPlus", name: "Statistieken plus", monthlyPrice: 27.5 },
  { key: "digitaleOndertekening", name: "Digitale ondertekening", monthlyPrice: 55 },
  { key: "postnl", name: "PostNL", monthlyPrice: 0 },
  { key: "suiteMkb", name: "Suite MKB koppeling", monthlyPrice: 55 },
  { key: "powerbi", name: "Power BI", monthlyPrice: 55 },
  { key: "kassa", name: "Kassa", monthlyPrice: 55 },
  { key: "terrein", name: "Terrein automatisering", monthlyPrice: 55 },
  { key: "voorraad", name: "Voorraad", monthlyPrice: 55 },
  { key: "partijregistratie", name: "Partijregistratie", monthlyPrice: 55 },
  { key: "chauffeurs", name: "Chauffeurs automatisering", monthlyPrice: 55 },
  { key: "assets", name: "Assets", monthlyPrice: 55 },
  { key: "ticketing", name: "Ticketing", monthlyPrice: 55 },
  { key: "contracten", name: "Contracten", monthlyPrice: 55 },
  { key: "verhuur", name: "Verhuur", monthlyPrice: 55 },
  { key: "prijsstaffels", name: "Uitgebreide prijsstaffels", monthlyPrice: 55 },
  { key: "hoveniersapp", name: "Hoveniersapp", monthlyPrice: 55 },
];

export type PricingInput = {
  extraUsers?: number;
  contractMonths?: number;
  discountPct?: number;
  manualMonthlyAdjustment?: number;
  manualImplementationAdjustment?: number;
  includeVat?: boolean;
  quantities?: Record<string, number>;
};

export type PricingResult = PackageConfig & {
  licenseMonthly: number;
  supportMonthly: number;
  moduleMonthly: number;
  monthlyBase: number;
  monthlyDiscountAmount: number;
  monthlyAfterDiscount: number;
  visits: number;
  implementationBase: number;
  implementationAfterAdjustment: number;
  recurringTotalContract: number;
  contractValue: number;
  annualRecurring: number;
  includedModuleDiscount: number;
  vatMultiplier: number;
  monthlyInclVat: number;
  implementationInclVat: number;
  contractValueInclVat: number;
};

export const euro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

export function getVisitsForUsers(packageConfig: PackageConfig, totalUsers: number) {
  return packageConfig.implementationVisits.find((tier) => totalUsers <= tier.maxUsers)?.visits ?? 0;
}

export function getPaidSelectedModuleCount(quantities: Record<string, number>) {
  return MODULES.filter((module) => module.monthlyPrice > 0).reduce(
    (sum, module) => sum + Math.max(0, quantities[module.key] ?? 0),
    0,
  );
}

export function getMinimumPackageForPaidModules(paidModuleCount: number) {
  return PACKAGES.find((pkg) => paidModuleCount <= pkg.includedModules) ?? PACKAGES[PACKAGES.length - 1];
}

function safeNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function calculatePricing(input: PricingInput = {}): PricingResult[] {
  const extraUsers = Math.max(0, safeNumber(input.extraUsers, 0));
  const contractMonths = Math.max(1, safeNumber(input.contractMonths, 1));
  const discountPct = Math.max(0, safeNumber(input.discountPct, 0));
  const manualMonthlyAdjustment = safeNumber(input.manualMonthlyAdjustment, 0);
  const manualImplementationAdjustment = safeNumber(input.manualImplementationAdjustment, 0);
  const includeVat = Boolean(input.includeVat);
  const quantities = input.quantities ?? {};

  const totalUsers = extraUsers + 1;
  const selectedModules = MODULES.filter((module) => (quantities[module.key] ?? 0) > 0);
  const paidSelectedUnits = getPaidSelectedModuleCount(quantities);
  const grossModuleMonthly = selectedModules.reduce(
    (sum, module) => sum + module.monthlyPrice * Math.max(0, safeNumber(quantities[module.key], 0)),
    0,
  );

  return PACKAGES.map((pkg) => {
    const licenseMonthly = pkg.licenseFirst + extraUsers * pkg.licenseExtra;
    const supportMonthly = pkg.supportFirst + extraUsers * pkg.supportExtra;
    // Alleen modules met een prijs boven 0 tellen mee voor de inbegrepen pakketmodules.
    // Gratis modules zoals PostNL mogen geen inbegrepen betaalde module "opmaken".
    const freeModulesApplied = Math.min(pkg.includedModules, paidSelectedUnits);
    const includedModuleDiscount = selectedModules
      .slice()
      .sort((a, b) => b.monthlyPrice - a.monthlyPrice)
      .slice(0, freeModulesApplied)
      .reduce((sum, module) => sum + module.monthlyPrice, 0);

    const moduleMonthly = Math.max(0, grossModuleMonthly - includedModuleDiscount);
    const monthlyBase = licenseMonthly + supportMonthly + moduleMonthly;
    const monthlyDiscountAmount = monthlyBase * (discountPct / 100);
    const monthlyAfterDiscount = Math.max(0, monthlyBase - monthlyDiscountAmount + manualMonthlyAdjustment);
    const visits = getVisitsForUsers(pkg, totalUsers);
    const implementationBase = visits * IMPLEMENTATION_DAY_RATE;
    const implementationAfterAdjustment = Math.max(0, implementationBase + manualImplementationAdjustment);
    const recurringTotalContract = monthlyAfterDiscount * contractMonths;
    const contractValue = recurringTotalContract + implementationAfterAdjustment;
    const annualRecurring = monthlyAfterDiscount * 12;
    const vatMultiplier = includeVat ? 1 + VAT_RATE : 1;

    return {
      ...pkg,
      licenseMonthly,
      supportMonthly,
      moduleMonthly,
      monthlyBase,
      monthlyDiscountAmount,
      monthlyAfterDiscount,
      visits,
      implementationBase,
      implementationAfterAdjustment,
      recurringTotalContract,
      contractValue,
      annualRecurring,
      includedModuleDiscount,
      vatMultiplier,
      monthlyInclVat: monthlyAfterDiscount * vatMultiplier,
      implementationInclVat: implementationAfterAdjustment * vatMultiplier,
      contractValueInclVat: contractValue * vatMultiplier,
    };
  });
}

export function getRecommendation(results: PricingResult[]) {
  const ranked = [...results].sort((a, b) => a.monthlyAfterDiscount - b.monthlyAfterDiscount);
  return ranked[1] ?? ranked[0];
}
