import {
  IMPLEMENTATION_DAY_RATE,
  MODULES,
  PACKAGES,
  type ModuleConfig,
  type PackageConfig,
  type PricingCatalog,
} from "@/lib/pricing";

export type CustomerPortalPriceOption = {
  key: string;
  name: string;
  monthlyPrice: number;
};

export type SmartConnectPriceTier = {
  connections: number;
  monthlyPrice: number;
};

export type ServiceCostPriceOption = {
  key: string;
  name: string;
  annualPrice: number;
};

export type EditablePricingConfig = PricingCatalog & {
  customerPortalOptions: CustomerPortalPriceOption[];
  smartConnectTiers: SmartConnectPriceTier[];
  smartConnectExtraConnectionPrice: number;
  planningAppUserMonthly: number;
  twinfieldConnectionMonthly: number;
  serviceCostOptions: ServiceCostPriceOption[];
  updatedAt?: string | null;
};

const MODULE_DETAILS: Record<string, Pick<ModuleConfig, "setupCost" | "dependencyNote" | "noPackageSwitch">> = {
  mailchimp: { setupCost: 360, noPackageSwitch: true },
  rapportage: { setupCost: 360 },
  scanHerken: { setupCost: 720 },
  statistiekenPlus: { setupCost: 360 },
  digitaleOndertekening: { setupCost: 720 },
  leverschema: { setupCost: 360, noPackageSwitch: true },
  postnl: { setupCost: 360, noPackageSwitch: true },
  suiteMkb: { setupCost: 400, dependencyNote: "Vereist: Rapportage", noPackageSwitch: true },
  powerbi: { setupCost: 720, noPackageSwitch: true },
  kassa: { setupCost: 720 },
  terrein: { setupCost: 720 },
  voorraad: { setupCost: 720 },
  partijregistratie: { setupCost: 720, dependencyNote: "Vereist: Voorraad" },
  chauffeurs: { setupCost: 720 },
  assets: { setupCost: 720 },
  ticketing: { setupCost: 720 },
  contracten: { setupCost: 720 },
  verhuur: { setupCost: 720 },
  prijsstaffels: { setupCost: 720 },
  hoveniersapp: { setupCost: 1440, dependencyNote: "Vereist: Ticketing" },
};

export const DEFAULT_PRICE_CONFIG: EditablePricingConfig = {
  implementationDayRate: IMPLEMENTATION_DAY_RATE,
  packages: PACKAGES,
  modules: MODULES.map((module) => ({
    ...module,
    setupCost: MODULE_DETAILS[module.key]?.setupCost ?? 0,
    dependencyNote: MODULE_DETAILS[module.key]?.dependencyNote ?? null,
    noPackageSwitch: MODULE_DETAILS[module.key]?.noPackageSwitch ?? false,
  })),
  customerPortalOptions: [
    { key: "facturenBetalen", name: "Facturen betalen", monthlyPrice: 30.15 },
    { key: "offertesOrdersMaken", name: "Offertes en orders maken", monthlyPrice: 60.3 },
    { key: "offertesInzienGoedkeuren", name: "Offertes inzien en goedkeuren", monthlyPrice: 12.05 },
    { key: "assortiment", name: "Assortiment", monthlyPrice: 36.15 },
  ],
  smartConnectTiers: [
    { connections: 1, monthlyPrice: 30.15 },
    { connections: 3, monthlyPrice: 60.3 },
    { connections: 5, monthlyPrice: 78.4 },
    { connections: 10, monthlyPrice: 120.6 },
  ],
  smartConnectExtraConnectionPrice: 6,
  planningAppUserMonthly: 5.5,
  twinfieldConnectionMonthly: 6,
  serviceCostOptions: [
    { key: "ccv", name: "CCV", annualPrice: 175.8 },
    { key: "worldline", name: "Worldline", annualPrice: 175.8 },
  ],
  updatedAt: null,
};

function safeNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizePackage(input: unknown, fallback: PackageConfig): PackageConfig {
  const source = input && typeof input === "object" ? (input as Partial<PackageConfig>) : {};

  return {
    key: typeof source.key === "string" ? source.key : fallback.key,
    name: typeof source.name === "string" ? source.name : fallback.name,
    licenseFirst: safeNumber(source.licenseFirst, fallback.licenseFirst),
    licenseExtra: safeNumber(source.licenseExtra, fallback.licenseExtra),
    supportFirst: safeNumber(source.supportFirst, fallback.supportFirst),
    supportExtra: safeNumber(source.supportExtra, fallback.supportExtra),
    includedModules: Math.max(0, Math.floor(safeNumber(source.includedModules, fallback.includedModules))),
    implementationVisits: fallback.implementationVisits.map((tier, index) => {
      const sourceTier = source.implementationVisits?.[index];

      return {
        maxUsers: tier.maxUsers,
        visits: Math.max(0, Math.floor(safeNumber(sourceTier?.visits, tier.visits))),
      };
    }),
  };
}

function normalizeModule(input: unknown, fallback: ModuleConfig): ModuleConfig {
  const source = input && typeof input === "object" ? (input as Partial<ModuleConfig>) : {};

  return {
    key: fallback.key,
    name: typeof source.name === "string" ? source.name : fallback.name,
    monthlyPrice: safeNumber(source.monthlyPrice, fallback.monthlyPrice),
    setupCost: safeNumber(source.setupCost, fallback.setupCost ?? 0),
    dependencyNote: typeof source.dependencyNote === "string" && source.dependencyNote.trim()
      ? source.dependencyNote.trim()
      : fallback.dependencyNote ?? null,
    noPackageSwitch: Boolean(source.noPackageSwitch ?? fallback.noPackageSwitch),
  };
}

function normalizeCustomerPortalOption(
  input: unknown,
  fallback: CustomerPortalPriceOption,
): CustomerPortalPriceOption {
  const source = input && typeof input === "object" ? (input as Partial<CustomerPortalPriceOption>) : {};

  return {
    key: fallback.key,
    name: typeof source.name === "string" ? source.name : fallback.name,
    monthlyPrice: safeNumber(source.monthlyPrice, fallback.monthlyPrice),
  };
}

function normalizeSmartConnectTier(input: unknown, fallback: SmartConnectPriceTier): SmartConnectPriceTier {
  const source = input && typeof input === "object" ? (input as Partial<SmartConnectPriceTier>) : {};

  return {
    connections: fallback.connections,
    monthlyPrice: safeNumber(source.monthlyPrice, fallback.monthlyPrice),
  };
}

function normalizeServiceCostOption(input: unknown, fallback: ServiceCostPriceOption): ServiceCostPriceOption {
  const source = input && typeof input === "object" ? (input as Partial<ServiceCostPriceOption>) : {};

  return {
    key: fallback.key,
    name: typeof source.name === "string" ? source.name : fallback.name,
    annualPrice: safeNumber(source.annualPrice, fallback.annualPrice),
  };
}

function mapByKey(values: unknown) {
  const rows = Array.isArray(values) ? values : [];
  return new Map(rows.flatMap((row) => {
    if (!row || typeof row !== "object" || typeof (row as { key?: unknown }).key !== "string") {
      return [];
    }

    return [[(row as { key: string }).key, row] as const];
  }));
}

export function normalizePricingConfig(input: unknown): EditablePricingConfig {
  const source = input && typeof input === "object" ? (input as Partial<EditablePricingConfig>) : {};
  const packageByKey = mapByKey(source.packages);
  const moduleByKey = mapByKey(source.modules);
  const customerPortalByKey = mapByKey(source.customerPortalOptions);
  const serviceCostByKey = mapByKey(source.serviceCostOptions);
  const smartConnectRows = Array.isArray(source.smartConnectTiers) ? source.smartConnectTiers : [];

  return {
    implementationDayRate: safeNumber(source.implementationDayRate, DEFAULT_PRICE_CONFIG.implementationDayRate),
    packages: DEFAULT_PRICE_CONFIG.packages.map((fallback) => normalizePackage(packageByKey.get(fallback.key), fallback)),
    modules: DEFAULT_PRICE_CONFIG.modules.map((fallback) => normalizeModule(moduleByKey.get(fallback.key), fallback)),
    customerPortalOptions: DEFAULT_PRICE_CONFIG.customerPortalOptions.map((fallback) =>
      normalizeCustomerPortalOption(customerPortalByKey.get(fallback.key), fallback),
    ),
    smartConnectTiers: DEFAULT_PRICE_CONFIG.smartConnectTiers.map((fallback, index) =>
      normalizeSmartConnectTier(smartConnectRows[index], fallback),
    ),
    smartConnectExtraConnectionPrice: safeNumber(
      source.smartConnectExtraConnectionPrice,
      DEFAULT_PRICE_CONFIG.smartConnectExtraConnectionPrice,
    ),
    planningAppUserMonthly: safeNumber(source.planningAppUserMonthly, DEFAULT_PRICE_CONFIG.planningAppUserMonthly),
    twinfieldConnectionMonthly: safeNumber(
      source.twinfieldConnectionMonthly,
      DEFAULT_PRICE_CONFIG.twinfieldConnectionMonthly,
    ),
    serviceCostOptions: DEFAULT_PRICE_CONFIG.serviceCostOptions.map((fallback) =>
      normalizeServiceCostOption(serviceCostByKey.get(fallback.key), fallback),
    ),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
  };
}
