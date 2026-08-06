import { DEFAULT_PRICE_CONFIG } from "@/lib/price-config";

export type ImplementationItem = {
  key: string;
  label: string;
  description?: string;
};

export const IMPLEMENTATION_BASE_FUNCTIONALITIES: readonly ImplementationItem[] = [
  {
    key: "base:relations",
    label: "Relatiebeheer",
    description: "Beheer interacties met klanten en leveranciers voor duurzame relaties.",
  },
  {
    key: "base:quotes",
    label: "Offertes",
    description: "Maak en beheer gepersonaliseerde offertes met klantspecifieke afspraken.",
  },
  {
    key: "base:orders",
    label: "Orders",
    description: "Registreer en volg klantorders van plaatsing tot aflevering efficiënt.",
  },
  {
    key: "base:invoices",
    label: "Facturen",
    description: "Genereer en verstuur facturen automatisch op basis van orders.",
  },
  {
    key: "base:articles",
    label: "Artikelbeheer",
    description: "Beheer productinformatie, prijzen en voorraadniveaus.",
  },
  {
    key: "base:users",
    label: "Gebruikersbeheer",
    description: "Beheer toegangsrechten en rollen van gebruikers voor veiligheid.",
  },
  {
    key: "base:purchasing",
    label: "Inkopen",
    description: "Beheer voorraden nauwkeurig om overstock en stockouts te voorkomen.",
  },
  {
    key: "base:statistics",
    label: "Statistieken",
    description: "Analyseer bedrijfsgegevens voor betere besluitvorming.",
  },
  {
    key: "base:templates",
    label: "Sjablonen",
    description: "Pas e-mail, offerte, order- en factuursjablonen aan naar wens.",
  },
  {
    key: "base:api",
    label: "API",
    description: "Integreer externe applicaties met het ERP via een flexibele API.",
  },
  {
    key: "base:smart-login",
    label: "Smart Login",
    description: "Veilig en eenvoudig inloggen voor al je administraties.",
  },
];

type DealImplementationSource = {
  modules: unknown;
  calculator_inputs: unknown;
};

function parsedValue(value: unknown) {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  const parsed = parsedValue(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  const parsed = parsedValue(value);
  return Array.isArray(parsed) ? parsed : [];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function keyPart(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

export function getImplementationItems(deal: DealImplementationSource): ImplementationItem[] {
  const moduleNames = new Map(
    DEFAULT_PRICE_CONFIG.modules.map((module) => [module.key, module.name]),
  );
  const customerPortalNames = new Map(
    DEFAULT_PRICE_CONFIG.customerPortalOptions.map((option) => [option.key, option.name]),
  );
  const items = new Map<string, ImplementationItem>();
  const addItem = (key: string, label: string) => {
    if (!items.has(key)) items.set(key, { key, label });
  };

  for (const value of asArray(deal.modules)) {
    const moduleRow = asRecord(value);
    const moduleKey = textValue(moduleRow.key);
    const moduleName = textValue(moduleRow.name) || moduleNames.get(moduleKey) || moduleKey;
    const quantity = moduleRow.qty === undefined || moduleRow.qty === null
      ? 1
      : positiveInteger(moduleRow.qty);
    if (!moduleName || quantity === 0) continue;

    addItem(
      `module:${moduleKey || keyPart(moduleName)}`,
      quantity > 1 ? `${quantity}x ${moduleName}` : moduleName,
    );
  }

  const calculatorInputs = asRecord(deal.calculator_inputs);
  const customerPortalOptions = asArray(calculatorInputs.customerPortalOptions);
  if (customerPortalOptions.length > 0) {
    for (const value of customerPortalOptions) {
      const option = asRecord(value);
      const optionKey = textValue(option.key);
      const optionName = textValue(option.name) || customerPortalNames.get(optionKey) || optionKey;
      if (!optionName) continue;
      addItem(
        `customer-portal:${optionKey || keyPart(optionName)}`,
        `Klantportaal - ${optionName}`,
      );
    }
  } else {
    for (const value of asArray(calculatorInputs.customerPortalOptionKeys)) {
      const optionKey = textValue(value);
      const optionName = customerPortalNames.get(optionKey) || optionKey;
      if (!optionName) continue;
      addItem(`customer-portal:${optionKey}`, `Klantportaal - ${optionName}`);
    }
  }

  const smartConnectPricing = asRecord(calculatorInputs.smartConnectPricing);
  const smartConnectConnections = positiveInteger(
    calculatorInputs.smartConnectConnections ?? smartConnectPricing.connectionCount,
  );
  if (smartConnectConnections > 0) {
    addItem(
      "smart-connect",
      `Smart Connect - ${smartConnectConnections} ${smartConnectConnections === 1 ? "connectie" : "connecties"}`,
    );
  }

  const planningAppUsers = positiveInteger(
    calculatorInputs.planningAppUsers ?? calculatorInputs.planningAppUserCount,
  );
  if (planningAppUsers > 0) {
    addItem(
      "planning-app",
      `Planningsapp - ${planningAppUsers} ${planningAppUsers === 1 ? "gebruiker" : "gebruikers"}`,
    );
  }

  return Array.from(items.values());
}
