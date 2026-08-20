import type { DealRecord } from "@/lib/supabase";

type PackageKey = "lite" | "starter" | "basic" | "premium" | "enterprise";

type PackageAssetClasses = {
  license: number;
  extraUser: number;
  chauffeurExtraUser: number;
  planningAppUser: number;
  support: number;
  supportExtraUser: number;
  chauffeurSupportExtraUser: number;
  customerPortal: Record<string, number>;
  modules: Partial<Record<string, number>>;
  smartConnect: {
    one: number;
    three: number;
    five: number;
    ten: number;
    extra: number;
    suiteMkb: number;
  };
};

export type DealAssetPlanItem = {
  key: string;
  assetClassId: number;
  name: string;
  source: string;
};

export type DealAssetPlan = {
  packageKey: PackageKey | null;
  items: DealAssetPlanItem[];
  warnings: string[];
};

const PACKAGE_LABELS: Record<PackageKey, string> = {
  lite: "Lite",
  starter: "Starter",
  basic: "Basic",
  premium: "Premium",
  enterprise: "Enterprise",
};

// Assetklasse-ID's uit Assets.xlsx. De IDs zijn bewust hier vastgelegd, zodat
// een offerte altijd met de juiste Smart Trade-assetklasse wordt verwerkt.
const PACKAGE_ASSET_CLASSES: Record<PackageKey, PackageAssetClasses> = {
  lite: {
    license: 30,
    extraUser: 32,
    chauffeurExtraUser: 198,
    planningAppUser: 285,
    support: 31,
    supportExtraUser: 33,
    chauffeurSupportExtraUser: 197,
    customerPortal: {
      facturenBetalen: 41,
      offertesOrdersMaken: 42,
      offertesInzienGoedkeuren: 40,
      assortiment: 39,
    },
    modules: {
      assets: 120,
      chauffeurs: 121,
      contracten: 122,
      digitaleOndertekening: 123,
      kassa: 125,
      leverschema: 404,
      mailchimp: 126,
      powerbi: 127,
      rapportage: 128,
      scanHerken: 129,
      statistiekenPlus: 411,
      terrein: 130,
      ticketing: 131,
      verhuur: 132,
      voorraad: 133,
    },
    smartConnect: { one: 44, three: 46, five: 47, ten: 49, extra: 45, suiteMkb: 351 },
  },
  starter: {
    license: 22,
    extraUser: 24,
    chauffeurExtraUser: 202,
    planningAppUser: 287,
    support: 23,
    supportExtraUser: 25,
    chauffeurSupportExtraUser: 201,
    customerPortal: {
      facturenBetalen: 52,
      offertesOrdersMaken: 51,
      offertesInzienGoedkeuren: 53,
      assortiment: 54,
    },
    modules: {
      assets: 134,
      chauffeurs: 135,
      contracten: 136,
      digitaleOndertekening: 137,
      kassa: 139,
      leverschema: 406,
      mailchimp: 140,
      powerbi: 141,
      rapportage: 142,
      scanHerken: 143,
      statistiekenPlus: 412,
      terrein: 144,
      ticketing: 145,
      verhuur: 146,
      voorraad: 147,
    },
    smartConnect: { one: 87, three: 85, five: 84, ten: 82, extra: 86, suiteMkb: 350 },
  },
  basic: {
    license: 26,
    extraUser: 28,
    chauffeurExtraUser: 200,
    planningAppUser: 283,
    support: 27,
    supportExtraUser: 29,
    chauffeurSupportExtraUser: 199,
    customerPortal: {
      facturenBetalen: 56,
      offertesOrdersMaken: 55,
      offertesInzienGoedkeuren: 57,
      assortiment: 58,
    },
    modules: {
      assets: 148,
      chauffeurs: 149,
      contracten: 150,
      digitaleOndertekening: 151,
      kassa: 153,
      leverschema: 407,
      mailchimp: 154,
      powerbi: 155,
      rapportage: 156,
      scanHerken: 157,
      statistiekenPlus: 413,
      terrein: 158,
      ticketing: 159,
      verhuur: 160,
      voorraad: 161,
    },
    smartConnect: { one: 93, three: 91, five: 90, ten: 88, extra: 92, suiteMkb: 349 },
  },
  premium: {
    license: 18,
    extraUser: 20,
    chauffeurExtraUser: 204,
    planningAppUser: 286,
    support: 19,
    supportExtraUser: 21,
    chauffeurSupportExtraUser: 203,
    customerPortal: {
      facturenBetalen: 60,
      offertesOrdersMaken: 59,
      offertesInzienGoedkeuren: 61,
      assortiment: 62,
    },
    modules: {
      assets: 162,
      chauffeurs: 163,
      contracten: 164,
      digitaleOndertekening: 165,
      kassa: 167,
      leverschema: 408,
      mailchimp: 168,
      partijregistratie: 360,
      powerbi: 169,
      rapportage: 170,
      scanHerken: 171,
      statistiekenPlus: 414,
      terrein: 172,
      ticketing: 173,
      verhuur: 174,
      voorraad: 175,
      prijsstaffels: 353,
    },
    smartConnect: { one: 99, three: 97, five: 96, ten: 94, extra: 98, suiteMkb: 348 },
  },
  enterprise: {
    license: 34,
    extraUser: 36,
    chauffeurExtraUser: 196,
    planningAppUser: 284,
    support: 35,
    supportExtraUser: 37,
    chauffeurSupportExtraUser: 195,
    customerPortal: {
      facturenBetalen: 64,
      offertesOrdersMaken: 63,
      offertesInzienGoedkeuren: 65,
      assortiment: 66,
    },
    modules: {
      assets: 176,
      chauffeurs: 177,
      contracten: 178,
      digitaleOndertekening: 179,
      kassa: 181,
      leverschema: 409,
      mailchimp: 182,
      partijregistratie: 336,
      powerbi: 183,
      rapportage: 184,
      scanHerken: 185,
      statistiekenPlus: 415,
      terrein: 186,
      ticketing: 187,
      verhuur: 188,
      voorraad: 189,
      prijsstaffels: 352,
    },
    smartConnect: { one: 105, three: 103, five: 102, ten: 100, extra: 104, suiteMkb: 347 },
  },
};

const MODULE_LABELS: Record<string, string> = {
  assets: "Assets",
  chauffeurs: "Chauffeurs automatisering",
  contracten: "Contracten",
  digitaleOndertekening: "Digitaal ondertekenen",
  kassa: "Kassa",
  leverschema: "Leverschema",
  mailchimp: "Mailchimp",
  partijregistratie: "Partijregistratie",
  powerbi: "Power BI",
  rapportage: "Rapportage",
  scanHerken: "Scan & Herken",
  statistiekenPlus: "Statistieken Plus",
  terrein: "Terrein automatisering",
  ticketing: "Ticketing",
  verhuur: "Verhuur",
  voorraad: "Voorraad",
  prijsstaffels: "Uitgebreide prijsstaffels",
};

const PORTAL_LABELS: Record<string, string> = {
  facturenBetalen: "Facturen betalen",
  offertesOrdersMaken: "Offertes en orders maken",
  offertesInzienGoedkeuren: "Offertes inzien en goedkeuren",
  assortiment: "Assortiment",
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }

  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown) {
  if (typeof value === "string") {
    try {
      return asArray(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return Array.isArray(value) ? value : [];
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function packageKeyForDeal(deal: Pick<DealRecord, "package_key" | "calculator_inputs" | "package_name">): PackageKey | null {
  const inputs = asRecord(deal.calculator_inputs);
  const candidates = [deal.package_key, inputs.selectedPackage, deal.package_name]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase());

  for (const candidate of candidates) {
    const match = (Object.keys(PACKAGE_LABELS) as PackageKey[]).find((key) =>
      candidate === key || candidate.includes(`smart trade ${key}`),
    );
    if (match) return match;
  }

  return null;
}

function moduleQuantities(deal: Pick<DealRecord, "modules" | "calculator_inputs">) {
  const quantities = new Map<string, number>();
  const inputs = asRecord(deal.calculator_inputs);

  for (const [key, value] of Object.entries(asRecord(inputs.quantities))) {
    const quantity = positiveInteger(value);
    if (key && quantity > 0) quantities.set(key, quantity);
  }

  for (const value of asArray(deal.modules)) {
    const row = asRecord(value);
    const key = typeof row.key === "string" ? row.key.trim() : "";
    const quantity = positiveInteger(row.qty ?? row.quantity ?? 1);
    if (key && quantity > 0) quantities.set(key, Math.max(quantities.get(key) ?? 0, quantity));
  }

  return quantities;
}

function addRepeated(
  items: DealAssetPlanItem[],
  key: string,
  assetClassId: number,
  name: string,
  quantity: number,
  source: string,
) {
  for (let index = 0; index < quantity; index += 1) {
    items.push({
      key: `${key}:${index + 1}`,
      assetClassId,
      name,
      source,
    });
  }
}

function smartConnectTier(connections: number) {
  if (connections <= 0) return null;
  if (connections <= 1) return { tier: "one" as const, label: "1 connectie", capacity: 1 };
  if (connections <= 3) return { tier: "three" as const, label: "3 connecties", capacity: 3 };
  if (connections <= 5) return { tier: "five" as const, label: "5 connecties", capacity: 5 };
  return { tier: "ten" as const, label: "10 connecties", capacity: 10 };
}

export function buildDealAssetPlan(deal: Pick<DealRecord, "package_key" | "package_name" | "calculator_inputs" | "modules">): DealAssetPlan {
  const inputs = asRecord(deal.calculator_inputs);
  const packageKey = packageKeyForDeal(deal);
  const warnings: string[] = [];

  if (inputs.quoteLayout === "assets-expansion" || inputs.assetsExpansion) {
    return {
      packageKey: null,
      items: [],
      warnings: ["Assets vanuit een uitbreidingsdeal worden niet automatisch aangemaakt."],
    };
  }

  if (!packageKey) {
    return {
      packageKey: null,
      items: [],
      warnings: ["Het Smart Trade-pakket van deze deal is niet herkend."],
    };
  }

  const assetClasses = PACKAGE_ASSET_CLASSES[packageKey];
  const packageLabel = PACKAGE_LABELS[packageKey];
  const items: DealAssetPlanItem[] = [];
  const includeSupport = inputs.includeSupport !== false && inputs.includeSupport !== "false";
  const extraUsers = positiveInteger(inputs.extraUsers);
  const chauffeurExtraUsers = positiveInteger(inputs.chauffeurExtraUsers);
  const planningAppUsers = positiveInteger(inputs.planningAppUsers);

  addRepeated(items, "license", assetClasses.license, `Smart Trade ${packageLabel} licentie`, 1, "Licentie");

  addRepeated(
    items,
    "extra-user",
    assetClasses.extraUser,
    `Smart Trade ${packageLabel} licentie extra gebruiker`,
    extraUsers,
    "Extra gebruikers",
  );
  addRepeated(
    items,
    "chauffeur-extra-user",
    assetClasses.chauffeurExtraUser,
    `Smart Trade ${packageLabel} licentie extra gebruiker (chauffeursmodule)`,
    chauffeurExtraUsers,
    "Chauffeursmodule",
  );
  addRepeated(
    items,
    "planning-app-user",
    assetClasses.planningAppUser,
    `Smart Trade ${packageLabel} licentie planningsapp gebruiker`,
    planningAppUsers,
    "Planningsapp",
  );

  if (includeSupport) {
    addRepeated(items, "support", assetClasses.support, `Smart Trade ${packageLabel} supportcontract`, 1, "Support");
    addRepeated(
      items,
      "support-extra-user",
      assetClasses.supportExtraUser,
      `Smart Trade ${packageLabel} supportcontract extra gebruiker`,
      extraUsers,
      "Support",
    );
    addRepeated(
      items,
      "support-chauffeur-extra-user",
      assetClasses.chauffeurSupportExtraUser,
      `Smart Trade ${packageLabel} supportcontract extra gebruiker (chauffeursmodule)`,
      chauffeurExtraUsers,
      "Support chauffeursmodule",
    );
  }

  for (const [moduleKey, quantity] of moduleQuantities(deal)) {
    if (moduleKey === "suiteMkb") {
      addRepeated(
        items,
        "smart-connect-suite-mkb",
        assetClasses.smartConnect.suiteMkb,
        `Smart Trade ${packageLabel} connect Suite MKB`,
        quantity,
        "Suite MKB koppeling",
      );
      continue;
    }

    const assetClassId = assetClasses.modules[moduleKey];
    if (!assetClassId) {
      const label = MODULE_LABELS[moduleKey] ?? moduleKey;
      warnings.push(`${label} heeft geen gekoppelde assetklasse en moet handmatig worden aangemaakt.`);
      continue;
    }

    const moduleLabel = MODULE_LABELS[moduleKey] ?? moduleKey;
    addRepeated(
      items,
      `module-${moduleKey}`,
      assetClassId,
      `Smart Trade ${packageLabel} module - ${moduleLabel}`,
      quantity,
      `Module ${moduleLabel}`,
    );
  }

  for (const optionKey of asArray(inputs.customerPortalOptionKeys)) {
    if (typeof optionKey !== "string") continue;
    const assetClassId = assetClasses.customerPortal[optionKey];
    if (!assetClassId) {
      warnings.push(`Klantportaaloptie ${optionKey} heeft geen gekoppelde assetklasse.`);
      continue;
    }

    const optionLabel = PORTAL_LABELS[optionKey] ?? optionKey;
    addRepeated(
      items,
      `customer-portal-${optionKey}`,
      assetClassId,
      `Smart Trade ${packageLabel} klantportaal - ${optionLabel}`,
      1,
      "Klantportaal",
    );
  }

  const smartConnectConnections = positiveInteger(inputs.smartConnectConnections);
  const tier = smartConnectTier(smartConnectConnections);
  if (tier) {
    addRepeated(
      items,
      `smart-connect-${tier.tier}`,
      assetClasses.smartConnect[tier.tier],
      `Smart Trade ${packageLabel} connect ${tier.label}`,
      1,
      "Smart Connect",
    );

    if (smartConnectConnections > tier.capacity) {
      addRepeated(
        items,
        "smart-connect-extra",
        assetClasses.smartConnect.extra,
        `Smart Trade ${packageLabel} connect 1 extra connectie`,
        smartConnectConnections - tier.capacity,
        "Smart Connect",
      );
    }
  }

  return { packageKey, items, warnings };
}
