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

export type TravelCostRegion = {
  region: number;
  fromKm: number | null;
  toKm: number | null;
  label?: string | null;
  price: number;
};

export type EditablePricingConfig = PricingCatalog & {
  customerPortalOptions: CustomerPortalPriceOption[];
  smartConnectTiers: SmartConnectPriceTier[];
  smartConnectExtraConnectionPrice: number;
  planningAppUserMonthly: number;
  twinfieldConnectionMonthly: number;
  serviceCostOptions: ServiceCostPriceOption[];
  travelCostRegions: TravelCostRegion[];
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
  travelCostRegions: [
    { region: 1, fromKm: 0, toKm: 20, price: 0 },
    { region: 2, fromKm: 20, toKm: 40, price: 39 },
    { region: 3, fromKm: 40, toKm: 60, price: 64 },
    { region: 4, fromKm: 60, toKm: 80, price: 89 },
    { region: 5, fromKm: 80, toKm: 100, price: 114 },
    { region: 6, fromKm: 100, toKm: 120, price: 139 },
    { region: 7, fromKm: 120, toKm: 140, price: 164 },
    { region: 8, fromKm: 140, toKm: 160, price: 189 },
    { region: 9, fromKm: 160, toKm: 180, price: 214 },
    { region: 10, fromKm: 180, toKm: 200, price: 239 },
    { region: 11, fromKm: 200, toKm: 220, price: 264 },
    { region: 12, fromKm: 220, toKm: 246, price: 289 },
    { region: 13, fromKm: null, toKm: null, label: "Eilanden / maatwerk", price: 399 },
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

function normalizeTravelCostRegion(input: unknown, fallback: TravelCostRegion): TravelCostRegion {
  const source = input && typeof input === "object" ? (input as Partial<TravelCostRegion>) : {};
  const label = typeof source.label === "string" && source.label.trim() ? source.label.trim() : fallback.label ?? null;

  return {
    region: Math.max(1, Math.floor(safeNumber(source.region, fallback.region))),
    fromKm: label ? null : safeNumber(source.fromKm, fallback.fromKm ?? 0),
    toKm: label ? null : safeNumber(source.toKm, fallback.toKm ?? 0),
    label,
    price: safeNumber(source.price, fallback.price),
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
  const travelCostRows = Array.isArray(source.travelCostRegions) ? source.travelCostRegions : [];

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
    travelCostRegions: DEFAULT_PRICE_CONFIG.travelCostRegions.map((fallback, index) =>
      normalizeTravelCostRegion(travelCostRows[index], fallback),
    ),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
  };
}
