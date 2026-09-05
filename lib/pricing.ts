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
  description?: string;
  monthlyPrice: number;
  setupCost?: number;
  dependencyNote?: string | null;
  noPackageSwitch?: boolean;
  requiresTravel?: boolean;
  workItems?: string[];
};

export const MODULE_DESCRIPTIONS: Record<string, string> = {
  mailchimp: "Maak gerichte mailings op basis van actuele klantgroepen en relatiegegevens uit Smart Trade.",
  rapportage: "Genereer overzichtelijke rapporten en krijg meer inzicht in bedrijfsprocessen en resultaten.",
  scanHerken: "Digitaliseer documenten en vereenvoudig de verwerking binnen het in- en verkoopproces.",
  statistiekenPlus: "Analyseer aanvullende bedrijfsgegevens en stuur gericht bij op basis van actuele inzichten.",
  digitaleOndertekening: "Laat documenten digitaal ondertekenen en bewaar ze direct zonder papieren archief.",
  leverschema: "Leg leverafspraken overzichtelijk vast en houd geplande leveringen centraal inzichtelijk.",
  postnl: "Maak en verwerk PostNL-zendingen vanuit Smart Trade en voorkom dubbele invoer.",
  suiteMkb: "Wissel administratieve gegevens efficiënt uit tussen Smart Trade en Suite MKB.",
  powerbi: "Gebruik Smart Trade-gegevens in Power BI voor interactieve dashboards en verdiepende analyses.",
  kassa: "Reken snel en foutloos af met een gebruiksvriendelijke kassa die direct is gekoppeld aan de backoffice.",
  terrein: "Geef orderpickers op het terrein actuele digitale informatie voor een snellere orderafhandeling.",
  voorraad: "Beheer voorraad centraal, werk met slim besteladvies en houd grip op meerdere magazijnen.",
  partijregistratie: "Leg batches, inkoopgroepen en serienummers vast voor volledige herleidbaarheid van artikelen.",
  chauffeurs: "Laat chauffeurs leveringen onderweg digitaal afhandelen en houd de transportstatus actueel.",
  assets: "Registreer en beheer apparaten, objecten en andere assets inclusief status, onderhoud en historie.",
  ticketing: "Werk taakgestuurd en houd vragen, acties en communicatie per klant overzichtelijk bij elkaar.",
  contracten: "Registreer en bewaak contracten, abonnementen en serviceafspraken vanuit één centraal overzicht.",
  verhuur: "Beheer verhuurafspraken, looptijden en gekoppelde objecten vanuit Smart Trade.",
  prijsstaffels: "Leg uitgebreide prijsafspraken en staffels vast, zodat automatisch de juiste prijs wordt toegepast.",
  hoveniersapp: "Plan werkzaamheden, wijs medewerkers toe en houd de voortgang op locatie overzichtelijk bij.",
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
  { key: "mailchimp", name: "Mailchimp", description: MODULE_DESCRIPTIONS.mailchimp, monthlyPrice: 27.5 },
  { key: "rapportage", name: "Rapportage", description: MODULE_DESCRIPTIONS.rapportage, monthlyPrice: 27.5 },
  { key: "scanHerken", name: "Scan & Herken", description: MODULE_DESCRIPTIONS.scanHerken, monthlyPrice: 55 },
  { key: "statistiekenPlus", name: "Statistieken plus", description: MODULE_DESCRIPTIONS.statistiekenPlus, monthlyPrice: 27.5 },
  { key: "digitaleOndertekening", name: "Digitale ondertekening", description: MODULE_DESCRIPTIONS.digitaleOndertekening, monthlyPrice: 0 },
  { key: "leverschema", name: "Leverschema", description: MODULE_DESCRIPTIONS.leverschema, monthlyPrice: 27.5 },
  { key: "postnl", name: "PostNL", description: MODULE_DESCRIPTIONS.postnl, monthlyPrice: 0 },
  { key: "suiteMkb", name: "Suite MKB koppeling", description: MODULE_DESCRIPTIONS.suiteMkb, monthlyPrice: 30.15 },
  { key: "powerbi", name: "Power BI", description: MODULE_DESCRIPTIONS.powerbi, monthlyPrice: 55 },
  { key: "kassa", name: "Kassa", description: MODULE_DESCRIPTIONS.kassa, monthlyPrice: 55 },
  { key: "terrein", name: "Terrein automatisering", description: MODULE_DESCRIPTIONS.terrein, monthlyPrice: 55 },
  { key: "voorraad", name: "Voorraad", description: MODULE_DESCRIPTIONS.voorraad, monthlyPrice: 55 },
  { key: "partijregistratie", name: "Partijregistratie", description: MODULE_DESCRIPTIONS.partijregistratie, monthlyPrice: 55 },
  { key: "chauffeurs", name: "Chauffeurs automatisering", description: MODULE_DESCRIPTIONS.chauffeurs, monthlyPrice: 55 },
  { key: "assets", name: "Assets", description: MODULE_DESCRIPTIONS.assets, monthlyPrice: 55 },
  { key: "ticketing", name: "Ticketing", description: MODULE_DESCRIPTIONS.ticketing, monthlyPrice: 55 },
  { key: "contracten", name: "Contracten", description: MODULE_DESCRIPTIONS.contracten, monthlyPrice: 55 },
  { key: "verhuur", name: "Verhuur", description: MODULE_DESCRIPTIONS.verhuur, monthlyPrice: 55 },
  { key: "prijsstaffels", name: "Uitgebreide prijsstaffels", description: MODULE_DESCRIPTIONS.prijsstaffels, monthlyPrice: 55 },
  { key: "hoveniersapp", name: "Planningsapp", description: MODULE_DESCRIPTIONS.hoveniersapp, monthlyPrice: 55 },
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

export type PricingCatalog = {
  implementationDayRate: number;
  packages: PackageConfig[];
  modules: ModuleConfig[];
};

export type PricingResult = PackageConfig & {
  licenseMonthly: number;
  supportMonthly: number;
  moduleMonthly: number;
  monthlyBase: number;
  monthlyDiscountAmount: number;
  monthlyAfterDiscount: number;
  visits: number;
  packageImplementationBase: number;
  moduleImplementationExtra: number;
  moduleTravelImplementationExtra: number;
  implementationBase: number;
  implementationAfterAdjustment: number;
  travelEligibleImplementationBase: number;
  travelEligibleImplementationAfterAdjustment: number;
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

export function getPaidSelectedModuleCount(quantities: Record<string, number>, modules: ModuleConfig[] = MODULES) {
  return modules.filter((module) => module.monthlyPrice > 0 && !module.noPackageSwitch).reduce(
    (sum, module) => sum + Math.max(0, quantities[module.key] ?? 0),
    0,
  );
}

export function getMinimumPackageForPaidModules(paidModuleCount: number, packages: PackageConfig[] = PACKAGES) {
  return packages.find((pkg) => paidModuleCount <= pkg.includedModules) ?? packages[packages.length - 1];
}

function safeNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function getSelectedModuleUnits(modules: ModuleConfig[], quantities: Record<string, number>) {
  return modules.flatMap((module) => {
    const quantity = Math.max(0, Math.floor(safeNumber(quantities[module.key], 0)));
    return Array.from({ length: quantity }, () => module);
  });
}

function resolvePricingCatalog(catalog?: Partial<PricingCatalog>) {
  return {
    implementationDayRate: catalog?.implementationDayRate ?? IMPLEMENTATION_DAY_RATE,
    packages: catalog?.packages && catalog.packages.length > 0 ? catalog.packages : PACKAGES,
    modules: catalog?.modules && catalog.modules.length > 0 ? catalog.modules : MODULES,
  };
}

export function calculatePricing(input: PricingInput = {}, catalog?: Partial<PricingCatalog>): PricingResult[] {
  const resolvedCatalog = resolvePricingCatalog(catalog);
  const extraUsers = Math.max(0, safeNumber(input.extraUsers, 0));
  const contractMonths = Math.max(1, safeNumber(input.contractMonths, 1));
  const discountPct = Math.max(0, safeNumber(input.discountPct, 0));
  const manualMonthlyAdjustment = safeNumber(input.manualMonthlyAdjustment, 0);
  const manualImplementationAdjustment = safeNumber(input.manualImplementationAdjustment, 0);
  const includeVat = Boolean(input.includeVat);
  const quantities = input.quantities ?? {};

  const totalUsers = extraUsers + 1;
  const selectedModules = resolvedCatalog.modules.filter((module) => (quantities[module.key] ?? 0) > 0);
  const selectedModuleUnits = getSelectedModuleUnits(resolvedCatalog.modules, quantities);
  const paidSelectedUnits = getPaidSelectedModuleCount(quantities, resolvedCatalog.modules);
  const grossModuleMonthly = selectedModules.reduce(
    (sum, module) => sum + module.monthlyPrice * Math.max(0, safeNumber(quantities[module.key], 0)),
    0,
  );

  return resolvedCatalog.packages.map((pkg) => {
    const licenseMonthly = pkg.licenseFirst + extraUsers * pkg.licenseExtra;
    const supportMonthly = pkg.supportFirst + extraUsers * pkg.supportExtra;
    // "Geen pakketwissel" voorkomt alleen een automatische pakketverhoging. Zo'n module
    // mag wel een nog vrije inbegrepen modulesleuf gebruiken; setupkosten blijven gelden.
    const freeModulesApplied = Math.min(pkg.includedModules, paidSelectedUnits);
    const packageRelevantUnits = selectedModuleUnits
      .filter((module) => module.monthlyPrice > 0 && !module.noPackageSwitch)
      .slice()
      .sort((a, b) => b.monthlyPrice - a.monthlyPrice);
    const paidMonthlyUnits = selectedModuleUnits
      .filter((module) => module.monthlyPrice > 0)
      .slice()
      .sort((a, b) => b.monthlyPrice - a.monthlyPrice);
    // Losse modules wisselen het pakket niet, maar hun setupkosten gelden altijd.
    // Dit blijft ook zo wanneer een losse module geen maandprijs heeft.
    const standaloneUnits = selectedModuleUnits.filter((module) => module.noPackageSwitch);
    const extraModuleUnits = [
      ...packageRelevantUnits.slice(freeModulesApplied),
      ...standaloneUnits,
    ];
    const includedModuleDiscount = paidMonthlyUnits
      .slice(0, pkg.includedModules)
      .reduce((sum, module) => sum + module.monthlyPrice, 0);

    const moduleMonthly = Math.max(0, grossModuleMonthly - includedModuleDiscount);
    const monthlyBase = licenseMonthly + supportMonthly + moduleMonthly;
    const monthlyDiscountAmount = monthlyBase * (discountPct / 100);
    const monthlyAfterDiscount = Math.max(0, monthlyBase - monthlyDiscountAmount + manualMonthlyAdjustment);
    const visits = getVisitsForUsers(pkg, totalUsers);
    const packageImplementationBase = visits * resolvedCatalog.implementationDayRate;
    const moduleImplementationExtra = extraModuleUnits.reduce((sum, module) => sum + (module.setupCost ?? 0), 0);
    const moduleTravelImplementationExtra = extraModuleUnits
      .filter((module) => module.requiresTravel !== false)
      .reduce((sum, module) => sum + (module.setupCost ?? 0), 0);
    const implementationBase = packageImplementationBase + moduleImplementationExtra;
    const implementationAfterAdjustment = Math.max(0, implementationBase + manualImplementationAdjustment);
    const travelEligibleImplementationBase = packageImplementationBase + moduleTravelImplementationExtra;
    const travelEligibleImplementationAfterAdjustment = Math.min(
      implementationAfterAdjustment,
      Math.max(0, travelEligibleImplementationBase + manualImplementationAdjustment),
    );
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
      packageImplementationBase,
      moduleImplementationExtra,
      moduleTravelImplementationExtra,
      implementationBase,
      implementationAfterAdjustment,
      travelEligibleImplementationBase,
      travelEligibleImplementationAfterAdjustment,
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
