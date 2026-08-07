import {
  IMPLEMENTATION_DAY_RATE,
  MODULES,
  PACKAGES,
  type ModuleConfig,
  type PackageConfig,
  type PricingCatalog,
} from "@/lib/pricing";
import { IMPLEMENTATION_BASE_FUNCTIONALITIES } from "@/lib/base-functionalities";

export type CustomerPortalPriceOption = {
  key: string;
  name: string;
  description?: string;
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

export type PostcodeRegion = {
  postcode: number;
  description: string;
  region: number;
  kilometers: number;
};

export type BaseFunctionalityWorkItemConfig = {
  key: string;
  description: string;
  workItems: string[];
};

export type ImplementationTaskConfig = {
  key: string;
  name: string;
  description: string;
};

export type ExpansionWorkItemKey = "customerPortal" | "smartConnect" | "planningApp";

export type ExpansionWorkItemConfig = {
  key: ExpansionWorkItemKey;
  name: string;
  description: string;
  workItems: string[];
};

export type EditablePricingConfig = PricingCatalog & {
  customerPortalOptions: CustomerPortalPriceOption[];
  smartConnectTiers: SmartConnectPriceTier[];
  smartConnectExtraConnectionPrice: number;
  planningAppUserMonthly: number;
  twinfieldConnectionMonthly: number;
  serviceCostOptions: ServiceCostPriceOption[];
  travelCostRegions: TravelCostRegion[];
  postcodeRegions: PostcodeRegion[];
  implementationTasks: ImplementationTaskConfig[];
  baseFunctionalityWorkItems: BaseFunctionalityWorkItemConfig[];
  expansionWorkItems: ExpansionWorkItemConfig[];
  updatedAt?: string | null;
};

export type TravelCostQuote = {
  postcodePrefix: string;
  postcodeRow: PostcodeRegion | null;
  travelRegion: TravelCostRegion | null;
  pricePerDay: number;
};

export function normalizePostcodePrefix(value: string) {
  return value.replace(/\D/g, "").slice(0, 2);
}

export function getTravelCostQuoteForPostcode(
  config: Pick<EditablePricingConfig, "postcodeRegions" | "travelCostRegions">,
  value: string,
): TravelCostQuote | null {
  const postcodePrefix = normalizePostcodePrefix(value);
  if (postcodePrefix.length !== 2) return null;

  const postcode = Number(postcodePrefix);
  const postcodeRow = config.postcodeRegions.find((row) => row.postcode === postcode) ?? null;
  const travelRegion = postcodeRow
    ? config.travelCostRegions.find((row) => row.region === postcodeRow.region) ?? null
    : null;

  return {
    postcodePrefix,
    postcodeRow,
    travelRegion,
    pricePerDay: travelRegion?.price ?? 0,
  };
}

const MODULE_DETAILS: Record<string, Pick<ModuleConfig, "setupCost" | "dependencyNote" | "noPackageSwitch" | "requiresTravel">> = {
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

export function getDefaultModuleWorkItems(moduleName: string) {
  return [
    `${moduleName} activeren`,
    "Inrichting en werking binnen Smart Trade controleren",
  ];
}

export const DEFAULT_PRICE_CONFIG: EditablePricingConfig = {
  implementationDayRate: IMPLEMENTATION_DAY_RATE,
  packages: PACKAGES,
  modules: MODULES.map((module) => ({
    ...module,
    setupCost: MODULE_DETAILS[module.key]?.setupCost ?? 0,
    dependencyNote: MODULE_DETAILS[module.key]?.dependencyNote ?? null,
    noPackageSwitch: MODULE_DETAILS[module.key]?.noPackageSwitch ?? false,
    requiresTravel: MODULE_DETAILS[module.key]?.requiresTravel ?? true,
    workItems: getDefaultModuleWorkItems(module.name),
  })),
  customerPortalOptions: [
    { key: "facturenBetalen", name: "Facturen betalen", description: "Laat klanten openstaande facturen veilig en eenvoudig via het klantportaal betalen.", monthlyPrice: 30.15 },
    { key: "offertesOrdersMaken", name: "Offertes en orders maken", description: "Laat klanten zelf offertes en orders maken binnen een veilige online omgeving.", monthlyPrice: 60.3 },
    { key: "offertesInzienGoedkeuren", name: "Offertes inzien en goedkeuren", description: "Geef klanten online inzicht in offertes en laat ze deze digitaal goedkeuren.", monthlyPrice: 12.05 },
    { key: "assortiment", name: "Assortiment", description: "Geef klanten toegang tot het assortiment en laat producten online selecteren en bestellen.", monthlyPrice: 36.15 },
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
  implementationTasks: [],
  baseFunctionalityWorkItems: IMPLEMENTATION_BASE_FUNCTIONALITIES.map((item) => ({
    key: item.key,
    description: item.description,
    workItems: [],
  })),
  expansionWorkItems: [
    {
      key: "customerPortal",
      name: "Klantportaal",
      description: "Geef klanten een veilige online omgeving die direct is gekoppeld aan Smart Trade.",
      workItems: [
        "Configuratie van het klantportaal en SSL-certificaat",
        "Klantportaal instellen en koppeling maken met Smart Trade administratie",
      ],
    },
    {
      key: "smartConnect",
      name: "Smart Connect",
      description: "Koppel Smart Trade met externe toepassingen en wissel gegevens automatisch uit.",
      workItems: [
        "Smart Connect configureren",
        "Koppeling maken met de Smart Trade administratie",
      ],
    },
    {
      key: "planningApp",
      name: "Planningsapp",
      description: "Zet vanuit de planning opdrachten overzichtelijk uit en houd de uitvoering centraal bij.",
      workItems: [],
    },
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
    { region: 12, fromKm: 220, toKm: 240, price: 289 },
    { region: 13, fromKm: 241, toKm: 260, price: 305 },
    { region: 14, fromKm: null, toKm: null, label: "Eilanden / maatwerk", price: 399 },
  ],
  postcodeRegions: [
    { postcode: 10, description: "Amsterdam", region: 2, kilometers: 38.96 },
    { postcode: 11, description: "Edam / Amstelveen", region: 3, kilometers: 43.54 },
    { postcode: 12, description: "Hilversum", region: 4, kilometers: 65.57 },
    { postcode: 13, description: "Abcoude / Almere", region: 4, kilometers: 62.78 },
    { postcode: 14, description: "Bussum / Uithoorn / Purmerend", region: 3, kilometers: 50.35 },
    { postcode: 15, description: "Zaandam", region: 3, kilometers: 50.81 },
    { postcode: 16, description: "Hoorn", region: 5, kilometers: 83.63 },
    { postcode: 17, description: "Schagen", region: 5, kilometers: 91.2 },
    { postcode: 17, description: "Texel", region: 14, kilometers: 333 },
    { postcode: 18, description: "Alkmaar", region: 4, kilometers: 66.21 },
    { postcode: 19, description: "IJmuiden - Egmond", region: 3, kilometers: 49.79 },
    { postcode: 20, description: "Haarlem", region: 2, kilometers: 26.09 },
    { postcode: 21, description: "Lisse", region: 2, kilometers: 15.5 },
    { postcode: 22, description: "Noordwijk", region: 2, kilometers: 20.28 },
    { postcode: 22, description: "Noordwijkerhout", region: 1, kilometers: 0 },
    { postcode: 23, description: "Leiden", region: 2, kilometers: 15.5 },
    { postcode: 24, description: "Alphen aan den Rijn", region: 2, kilometers: 29.59 },
    { postcode: 25, description: "Den Haag", region: 2, kilometers: 31.35 },
    { postcode: 26, description: "Delft", region: 3, kilometers: 40.58 },
    { postcode: 27, description: "Zoetermeer", region: 2, kilometers: 36.6 },
    { postcode: 28, description: "Gouda", region: 3, kilometers: 54.64 },
    { postcode: 29, description: "Capelle aan den IJssel", region: 4, kilometers: 64.14 },
    { postcode: 30, description: "Rotterdam", region: 3, kilometers: 52.74 },
    { postcode: 31, description: "Schiedam / Vlaardingen", region: 3, kilometers: 51.24 },
    { postcode: 32, description: "Spijkenisse", region: 4, kilometers: 71.86 },
    { postcode: 33, description: "Dordrecht", region: 4, kilometers: 73.85 },
    { postcode: 34, description: "Woerden", region: 4, kilometers: 64.69 },
    { postcode: 35, description: "Utrecht", region: 4, kilometers: 69.32 },
    { postcode: 36, description: "Maarssen / Mijdrecht", region: 3, kilometers: 52.76 },
    { postcode: 37, description: "Soest / Barneveld", region: 5, kilometers: 82.67 },
    { postcode: 38, description: "Amersfoort", region: 5, kilometers: 90.85 },
    { postcode: 39, description: "Veenendaal / Houten", region: 5, kilometers: 93.4 },
    { postcode: 40, description: "Tiel", region: 6, kilometers: 112.15 },
    { postcode: 41, description: "Culemborg", region: 5, kilometers: 91.12 },
    { postcode: 42, description: "Gorinchem", region: 5, kilometers: 97.27 },
    { postcode: 43, description: "Zierikzee", region: 8, kilometers: 148.37 },
    { postcode: 44, description: "Goes", region: 8, kilometers: 146.76 },
    { postcode: 45, description: "Breskens", region: 10, kilometers: 187.21 },
    { postcode: 46, description: "Bergen op Zoom", region: 6, kilometers: 112.89 },
    { postcode: 47, description: "Roosendaal", region: 6, kilometers: 104.02 },
    { postcode: 48, description: "Breda", region: 6, kilometers: 102.72 },
    { postcode: 49, description: "Oosterhout", region: 6, kilometers: 103.91 },
    { postcode: 50, description: "Tilburg", region: 7, kilometers: 131.11 },
    { postcode: 51, description: "Kaatsheuvel", region: 6, kilometers: 118.48 },
    { postcode: 52, description: "Den Bosch", region: 7, kilometers: 119.56 },
    { postcode: 53, description: "Oss", region: 7, kilometers: 125.01 },
    { postcode: 54, description: "Uden", region: 8, kilometers: 143.45 },
    { postcode: 55, description: "Valkenswaard", region: 9, kilometers: 160.67 },
    { postcode: 56, description: "Eindhoven", region: 8, kilometers: 149.97 },
    { postcode: 57, description: "Helmond", region: 9, kilometers: 162.87 },
    { postcode: 58, description: "Venray", region: 10, kilometers: 184.04 },
    { postcode: 59, description: "Venlo", region: 11, kilometers: 205.02 },
    { postcode: 60, description: "Weert", region: 10, kilometers: 195.51 },
    { postcode: 61, description: "Geleen", region: 12, kilometers: 220.7 },
    { postcode: 62, description: "Maastricht", region: 13, kilometers: 242.14 },
    { postcode: 63, description: "Valkenburg", region: 13, kilometers: 241.15 },
    { postcode: 64, description: "Heerlen", region: 13, kilometers: 240.29 },
    { postcode: 65, description: "Nijmegen", region: 8, kilometers: 152.81 },
    { postcode: 66, description: "Wijchen", region: 7, kilometers: 138.34 },
    { postcode: 67, description: "Ede", region: 6, kilometers: 110.42 },
    { postcode: 68, description: "Arnhem", region: 7, kilometers: 133.46 },
    { postcode: 69, description: "Dieren", region: 8, kilometers: 143.14 },
    { postcode: 70, description: "Doetinchem", region: 9, kilometers: 165.29 },
    { postcode: 71, description: "Winterswijk", region: 10, kilometers: 184.74 },
    { postcode: 72, description: "Zutphen", region: 8, kilometers: 154.76 },
    { postcode: 73, description: "Apeldoorn", region: 7, kilometers: 125.33 },
    { postcode: 74, description: "Deventer", region: 8, kilometers: 158.74 },
    { postcode: 75, description: "Enschede", region: 10, kilometers: 191.47 },
    { postcode: 76, description: "Almelo", region: 10, kilometers: 185.55 },
    { postcode: 77, description: "Hardenberg", region: 10, kilometers: 183.94 },
    { postcode: 78, description: "Emmen", region: 12, kilometers: 221.72 },
    { postcode: 79, description: "Hoogeveen", region: 10, kilometers: 181.13 },
    { postcode: 80, description: "Zwolle", region: 8, kilometers: 139.71 },
    { postcode: 81, description: "Epe", region: 8, kilometers: 149.27 },
    { postcode: 82, description: "Lelystad", region: 6, kilometers: 106.46 },
    { postcode: 83, description: "Emmeloord", region: 8, kilometers: 140.69 },
    { postcode: 84, description: "Heereveen", region: 9, kilometers: 170.3 },
    { postcode: 85, description: "Joure", region: 8, kilometers: 148.59 },
    { postcode: 86, description: "Sneek", region: 8, kilometers: 159.18 },
    { postcode: 87, description: "Bolsward", region: 8, kilometers: 151.33 },
    { postcode: 88, description: "Harlingen", region: 8, kilometers: 156 },
    { postcode: 88, description: "Vlieland / Terschelling", region: 14, kilometers: 333 },
    { postcode: 89, description: "Leeuwarden", region: 9, kilometers: 172.75 },
    { postcode: 90, description: "Grouw", region: 9, kilometers: 173.02 },
    { postcode: 91, description: "Ameland / Schiermonnikoog", region: 14, kilometers: 333 },
    { postcode: 91, description: "Dokkum", region: 11, kilometers: 209.9 },
    { postcode: 92, description: "Drachten", region: 10, kilometers: 189.2 },
    { postcode: 93, description: "Roden", region: 11, kilometers: 202.11 },
    { postcode: 94, description: "Assen", region: 12, kilometers: 221.75 },
    { postcode: 95, description: "Stadskanaal", region: 13, kilometers: 246.43 },
    { postcode: 96, description: "Veendam", region: 13, kilometers: 242.99 },
    { postcode: 97, description: "Groningen", region: 11, kilometers: 215.27 },
    { postcode: 98, description: "Zuidhorn", region: 11, kilometers: 204.9 },
    { postcode: 99, description: "Delftzijl", region: 12, kilometers: 239.86 },
  ],
  updatedAt: null,
};

function safeNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function cleanWorkItems(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : null;
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
  const workItems = cleanWorkItems(source.workItems);

  return {
    key: fallback.key,
    name: typeof source.name === "string" ? source.name : fallback.name,
    description: typeof source.description === "string"
      ? source.description.trim()
      : fallback.description,
    monthlyPrice: safeNumber(source.monthlyPrice, fallback.monthlyPrice),
    setupCost: safeNumber(source.setupCost, fallback.setupCost ?? 0),
    dependencyNote: typeof source.dependencyNote === "string" && source.dependencyNote.trim()
      ? source.dependencyNote.trim()
      : fallback.dependencyNote ?? null,
    noPackageSwitch: Boolean(source.noPackageSwitch ?? fallback.noPackageSwitch),
    requiresTravel: Boolean(source.requiresTravel ?? fallback.requiresTravel ?? true),
    workItems: workItems ?? fallback.workItems ?? getDefaultModuleWorkItems(fallback.name),
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
    description: typeof source.description === "string"
      ? source.description.trim()
      : fallback.description,
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

function migrateTravelCostRows(input: unknown[]) {
  if (input.length === 0) return input;

  const rows = input.map((row) => {
    if (!row || typeof row !== "object") return row;

    const source = row as Partial<TravelCostRegion>;
    const label = typeof source.label === "string" ? source.label.trim().toLowerCase() : "";
    const region = Number(source.region);
    const fromKm = Number(source.fromKm);
    const toKm = Number(source.toKm);

    if (region === 13 && label.includes("eilanden")) {
      return { ...source, region: 14 };
    }

    if (region === 12 && fromKm === 220 && toKm === 246) {
      return { ...source, toKm: 240 };
    }

    return row;
  });

  const hasDistanceRegion13 = rows.some((row) => {
    if (!row || typeof row !== "object") return false;
    const source = row as Partial<TravelCostRegion>;
    const label = typeof source.label === "string" ? source.label.trim() : "";
    return Number(source.region) === 13 && !label;
  });

  if (hasDistanceRegion13) return rows;

  const islandIndex = rows.findIndex((row) => {
    if (!row || typeof row !== "object") return false;
    const source = row as Partial<TravelCostRegion>;
    const label = typeof source.label === "string" ? source.label.trim().toLowerCase() : "";
    return Number(source.region) === 14 && label.includes("eilanden");
  });

  if (islandIndex === -1) return rows;

  return [
    ...rows.slice(0, islandIndex),
    { region: 13, fromKm: 241, toKm: 260, price: 305 },
    ...rows.slice(islandIndex),
  ];
}

function migratePostcodeRows(input: unknown[]) {
  return input.map((row) => {
    if (!row || typeof row !== "object") return row;

    const source = row as Partial<PostcodeRegion>;
    const description = typeof source.description === "string" ? source.description.toLowerCase() : "";
    const region = Number(source.region);
    const kilometers = Number(source.kilometers);
    const isIsland =
      description.includes("texel") ||
      description.includes("vlieland") ||
      description.includes("terschelling") ||
      description.includes("ameland") ||
      description.includes("schiermonnikoog");

    if (region === 13 && isIsland) {
      return { ...source, region: 14 };
    }

    if (region === 12 && Number.isFinite(kilometers) && kilometers > 240) {
      return { ...source, region: 13 };
    }

    return row;
  });
}

function normalizePostcodeRegion(input: unknown, fallback: PostcodeRegion): PostcodeRegion {
  const source = input && typeof input === "object" ? (input as Partial<PostcodeRegion>) : {};

  return {
    postcode: Math.max(0, Math.floor(safeNumber(source.postcode, fallback.postcode))),
    description: typeof source.description === "string" ? source.description.trim() : fallback.description,
    region: Math.max(1, Math.floor(safeNumber(source.region, fallback.region))),
    kilometers: Math.max(0, Math.round(safeNumber(source.kilometers, fallback.kilometers))),
  };
}

function normalizeExpansionWorkItems(input: unknown, fallback: ExpansionWorkItemConfig): ExpansionWorkItemConfig {
  const source = input && typeof input === "object" ? (input as Partial<ExpansionWorkItemConfig>) : {};
  const workItems = cleanWorkItems(source.workItems);

  return {
    key: fallback.key,
    name: typeof source.name === "string" && source.name.trim() ? source.name.trim() : fallback.name,
    description: typeof source.description === "string"
      ? source.description.trim()
      : fallback.description,
    workItems: workItems ?? fallback.workItems,
  };
}

function normalizeBaseFunctionalityWorkItems(
  input: unknown,
  fallback: BaseFunctionalityWorkItemConfig,
): BaseFunctionalityWorkItemConfig {
  const source = input && typeof input === "object" ? (input as Partial<BaseFunctionalityWorkItemConfig>) : {};
  const workItems = cleanWorkItems(source.workItems);

  return {
    key: fallback.key,
    description: typeof source.description === "string"
      ? source.description.trim()
      : fallback.description,
    workItems: workItems ?? fallback.workItems,
  };
}

function normalizeImplementationTasks(value: unknown): ImplementationTaskConfig[] {
  if (!Array.isArray(value)) return [];

  const usedKeys = new Set<string>();
  const usedNames = new Set<string>();

  return value.reduce<ImplementationTaskConfig[]>((tasks, row, index) => {
    if (!row || typeof row !== "object" || tasks.length >= 100) return tasks;
    const source = row as Partial<ImplementationTaskConfig>;
    const name = typeof source.name === "string"
      ? source.name.trim().replace(/\s+/g, " ").slice(0, 200)
      : "";
    const normalizedName = name.toLocaleLowerCase("nl-NL");
    if (!name || usedNames.has(normalizedName)) return tasks;

    const baseKey = typeof source.key === "string"
      ? source.key.trim().replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120)
      : "";
    let key = baseKey || `task-${index + 1}`;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${baseKey || `task-${index + 1}`}-${suffix}`;
      suffix += 1;
    }

    usedKeys.add(key);
    usedNames.add(normalizedName);
    tasks.push({
      key,
      name,
      description: typeof source.description === "string"
        ? source.description.trim().slice(0, 1000)
        : "",
    });
    return tasks;
  }, []);
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
  const baseFunctionalityWorkItemsByKey = mapByKey(source.baseFunctionalityWorkItems);
  const expansionWorkItemsByKey = mapByKey(source.expansionWorkItems);
  const smartConnectRows = Array.isArray(source.smartConnectTiers) ? source.smartConnectTiers : [];
  const travelCostRows = migrateTravelCostRows(Array.isArray(source.travelCostRegions) ? source.travelCostRegions : []);
  const postcodeRows =
    Array.isArray(source.postcodeRegions) && source.postcodeRegions.length > 0
      ? migratePostcodeRows(source.postcodeRegions)
      : DEFAULT_PRICE_CONFIG.postcodeRegions;

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
    implementationTasks: normalizeImplementationTasks(source.implementationTasks),
    baseFunctionalityWorkItems: DEFAULT_PRICE_CONFIG.baseFunctionalityWorkItems.map((fallback) =>
      normalizeBaseFunctionalityWorkItems(baseFunctionalityWorkItemsByKey.get(fallback.key), fallback),
    ),
    expansionWorkItems: DEFAULT_PRICE_CONFIG.expansionWorkItems.map((fallback) =>
      normalizeExpansionWorkItems(expansionWorkItemsByKey.get(fallback.key), fallback),
    ),
    travelCostRegions: DEFAULT_PRICE_CONFIG.travelCostRegions.map((fallback, index) =>
      normalizeTravelCostRegion(travelCostRows[index], fallback),
    ),
    postcodeRegions: postcodeRows.map((row, index) =>
      normalizePostcodeRegion(row, DEFAULT_PRICE_CONFIG.postcodeRegions[index] ?? {
        postcode: 0,
        description: "",
        region: 1,
        kilometers: 0,
      }),
    ),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
  };
}
