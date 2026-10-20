export const IMPLEMENTATION_ARTICLE_ID = 782;

export const TRAVEL_ARTICLE_BY_REGION: Readonly<Record<number, number>> = {
  1: 204,
  2: 205,
  3: 206,
  4: 207,
  5: 208,
  6: 209,
  7: 210,
  8: 211,
  9: 212,
  10: 834,
  11: 835,
  12: 836,
  13: 837,
  14: 838,
};

type ImplementationOrderDeal = {
  package_name?: unknown;
  modules?: unknown;
  implementation_total?: unknown;
  calculator_inputs?: unknown;
};

export type ImplementationOrderBreakdown = {
  description: string;
  reference: string;
  implementationAmount: number;
  totalAmount: number;
  travelAmount: number;
  travelArticleId: number | null;
  travelPricePerUnit: number;
  travelQuantity: number;
  travelRegion: number | null;
};

function finiteNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function positiveInteger(value: unknown) {
  const numberValue = finiteNumber(value, 0);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }

  return {};
}

function moduleName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim()
    .replace(/^Implementatie\s+/i, "")
    .replace(/^Smart\s+Trade\b[\s-]*/i, "")
    .replace(/^Suite MKB koppeling$/i, "Suite MKB");
}

export function getImplementationOrderDescription(packageName: unknown, calculatorInputs?: unknown, modules?: unknown) {
  const inputs = objectValue(calculatorInputs);
  const expansion = objectValue(inputs.assetsExpansion);
  const names: string[] = [];
  const addName = (value: unknown) => {
    const name = moduleName(value);
    if (name && !names.some((existing) => existing.toLowerCase() === name.toLowerCase())) names.push(name);
  };

  if (Array.isArray(expansion.lines)) {
    // Expansion module selections also contain existing modules; only purchased lines apply.
    for (const value of expansion.lines) {
      const line = objectValue(value);
      if (finiteNumber(line.quantity) <= 0 || typeof line.label !== "string") continue;
      if (line.group === "Modules") {
        for (const name of line.label.replace(/^Module-uitbreiding:\s*/i, "").split(",")) addName(name);
      } else if (line.group === "Implementatie") {
        addName(line.label);
      } else if (line.group === "Pakket" && typeof line.note === "string") {
        const separator = line.note.indexOf(":");
        if (separator >= 0) {
          for (const name of line.note.slice(separator + 1).split(",")) addName(name);
        }
      }
    }
  } else {
    let moduleRows = modules;
    if (typeof moduleRows === "string") {
      try { moduleRows = JSON.parse(moduleRows); } catch { moduleRows = []; }
    }
    if (Array.isArray(moduleRows)) {
      for (const value of moduleRows) {
        const row = objectValue(value);
        if (row.qty != null && finiteNumber(row.qty) <= 0) continue;
        addName(row.name);
      }
    }
  }

  const packageLabel = moduleName(packageName);
  const label = names.join(", ") || (/^uitbreiding$/i.test(packageLabel) ? "" : packageLabel);
  return label ? `Implementatie ${label}` : "Implementatie";
}

export function getImplementationOrderBreakdown(
  deal: ImplementationOrderDeal,
): ImplementationOrderBreakdown {
  const inputs = objectValue(deal.calculator_inputs);
  const totalAmount = roundCurrency(Math.max(0, finiteNumber(deal.implementation_total)));
  const storedTravelAmount = roundCurrency(Math.max(0, finiteNumber(inputs.travelCostTotal)));
  const travelAmount = Math.min(totalAmount, storedTravelAmount);
  const travelRegion = positiveInteger(inputs.travelRegion);
  const travelArticleId = travelRegion ? TRAVEL_ARTICLE_BY_REGION[travelRegion] ?? null : null;
  const storedTravelPricePerUnit = roundCurrency(Math.max(0, finiteNumber(inputs.travelCostPerDay)));
  const travelPricePerUnit = travelAmount > 0
    ? storedTravelPricePerUnit > 0 ? storedTravelPricePerUnit : travelAmount
    : 0;
  const travelQuantity = travelAmount > 0 && travelPricePerUnit > 0
    ? roundQuantity(travelAmount / travelPricePerUnit)
    : 0;
  const description = getImplementationOrderDescription(deal.package_name, inputs, deal.modules);

  return {
    description,
    reference: description,
    implementationAmount: roundCurrency(totalAmount - travelAmount),
    totalAmount,
    travelAmount,
    travelArticleId,
    travelPricePerUnit,
    travelQuantity,
    travelRegion,
  };
}

export type OrderModuleConfig = {
  key: string;
  name: string;
  setupCost?: number;
  requiresTravel?: boolean;
  monthlyPrice?: number;
  noPackageSwitch?: boolean;
};
export type ImplementationModuleOrder = ImplementationOrderBreakdown & {
  requiresTravel: boolean;
  lines: Array<{
    sortOrder: number; article: number; quantity: string; unit: string;
    description: string; headerText: string; remark: string; price: string;
  }>;
};

function arrayValue(value: unknown): unknown[] {
  if (typeof value === "string") {
    try { return arrayValue(JSON.parse(value)); } catch { return []; }
  }
  return Array.isArray(value) ? value : [];
}

/** Use quoted module amounts. Travel is charged only to modules that require a
 * visit; the sum of the orders must still match the accepted quote. */
export function getImplementationModuleOrders(
  deal: ImplementationOrderDeal,
  catalog: OrderModuleConfig[] = [],
  packages: Array<{ key: string; name: string; includedModules: number }> = [],
  implementationDayRate = 720,
): ImplementationModuleOrder[] {
  const total = getImplementationOrderBreakdown(deal);
  if (total.totalAmount <= 0) return [];
  const inputs = objectValue(deal.calculator_inputs);
  const expansion = objectValue(inputs.assetsExpansion);
  const storedModules = arrayValue(deal.modules).map(objectValue);
  const normalized = (value: unknown) => moduleName(value).toLowerCase();
  const configFor = (name: string, key?: unknown) => {
    const stored = storedModules.find(row => (key && row.key === key) || normalized(row.name) === normalized(name));
    const fallback = catalog.find(row => (key && row.key === key) || (stored?.key && row.key === stored.key) || normalized(row.name) === normalized(name));
    return { ...fallback, ...stored };
  };
  const parts: Array<{ name: string; amount: number; requiresTravel: boolean; travelWeight: number }> = [];
  const add = (name: string, amount: number, requiresTravel: boolean) => {
    if (amount <= 0) return;
    const existing = parts.find(part => normalized(part.name) === normalized(name));
    if (existing) {
      existing.amount = roundCurrency(existing.amount + amount);
      existing.travelWeight += requiresTravel ? amount : 0;
      existing.requiresTravel ||= requiresTravel;
    } else parts.push({ name, amount: roundCurrency(amount), requiresTravel, travelWeight: requiresTravel ? amount : 0 });
  };
  if (Array.isArray(expansion.lines)) {
    for (const value of expansion.lines) {
      const line = objectValue(value);
      if (line.cadence !== "once" || finiteNumber(line.quantity) <= 0) continue;
      const name = moduleName(line.label);
      if (!name || line.group !== "Implementatie") continue;
      const config = configFor(name, line.moduleKey);
      const requiresTravel = typeof line.requiresTravel === "boolean" ? line.requiresTravel : config.requiresTravel;
      if (total.travelAmount > 0 && typeof requiresTravel !== "boolean") {
        throw new Error(`De reiskosteninstelling voor ${name} ontbreekt. Controleer de module-instellingen en sla de offerte opnieuw op.`);
      }
      add(name, Math.max(0, finiteNumber(line.amount)), requiresTravel === true);
    }
  } else {
    const selectedPackage = packages.find(pkg => pkg.key === inputs.selectedPackage || normalized(pkg.name) === normalized(deal.package_name));
    let included = Math.max(0, selectedPackage?.includedModules ?? 0);
    const rows = storedModules.map((row): Record<string, unknown> => ({ ...configFor(moduleName(row.name), row.key), ...row }))
      .sort((a, b) => finiteNumber(b.monthlyPrice) - finiteNumber(a.monthlyPrice));
    for (const row of rows) {
      let qty = row.qty == null ? 1 : Math.max(0, Math.floor(finiteNumber(row.qty)));
      if (!row.noPackageSwitch && finiteNumber(row.monthlyPrice) > 0) {
        const free = Math.min(included, qty);
        included -= free;
        qty -= free;
      } else if (!row.noPackageSwitch && finiteNumber(row.monthlyPrice) === 0 && row.monthlyPrice != null) {
        qty = 0;
      }
      const amount = finiteNumber(row.implementationAmount, finiteNumber(row.setupCost) * qty);
      if (amount <= 0) continue;
      const name = moduleName(row.name);
      if (!name) continue;
      if (total.travelAmount > 0 && typeof row.requiresTravel !== "boolean") {
        throw new Error(`De reiskosteninstelling voor ${name} ontbreekt. Controleer de offerte.`);
      }
      add(name, amount, row.requiresTravel === true);
    }
  }
  if (!parts.length) {
    const description = Array.isArray(expansion.lines)
      ? getImplementationOrderDescription(deal.package_name, inputs, deal.modules)
      : getImplementationOrderDescription(deal.package_name);
    if (description.includes(",")) throw new Error("De offerte bevat meerdere modules zonder afzonderlijke implementatiebedragen. Sla eerst de implementatiekosten per module op.");
    const name = description.replace(/^Implementatie\s*/, "") || "overige werkzaamheden";
    const config = configFor(name);
    if (Array.isArray(expansion.lines) && total.travelAmount > 0 && typeof config.requiresTravel !== "boolean" && name !== "overige werkzaamheden") {
      throw new Error(`De reiskosteninstelling voor ${name} ontbreekt. Controleer de offerte.`);
    }
    // Package implementation includes on-site work; expansion travel requires a module setting.
    add(name, total.implementationAmount, Array.isArray(expansion.lines) ? config.requiresTravel === true : true);
  }
  const allocated = roundCurrency(parts.reduce((sum, part) => sum + part.amount, 0));
  if (allocated > total.implementationAmount) {
    throw new Error("De implementatiebedragen per module zijn samen hoger dan het offertebedrag. Verwerk de correctie eerst in de afzonderlijke modulebedragen.");
  }
  const remainder = roundCurrency(total.implementationAmount - allocated);
  if (remainder > 0) {
    const packageLabel = moduleName(deal.package_name);
    add(!/^uitbreiding$/i.test(packageLabel) && packageLabel ? packageLabel : "overige werkzaamheden", remainder, !Array.isArray(expansion.lines));
  }
  if (total.travelAmount > 0 && !total.travelArticleId) throw new Error("Controleer de reiskostenregio in de offerte.");
  const extraVisits = Math.max(0, finiteNumber(inputs.extraTravelVisits));
  const extraTravel = total.travelAmount > 0 ? roundCurrency(extraVisits * total.travelPricePerUnit) : 0;
  const moduleTravel = roundCurrency(total.travelAmount - extraTravel);
  const weight = parts.reduce((sum, part) => sum + part.travelWeight, 0);
  if (moduleTravel > 0 && weight <= 0) {
    throw new Error("De offerte bevat reiskosten, maar geen module waarvoor een bezoek nodig is. Controleer de reiskosten in de offerte voordat je orders aanmaakt.");
  }
  const dayRate = finiteNumber(inputs.implementationDayRate, implementationDayRate);
  if (total.travelAmount > 0 && dayRate <= 0) throw new Error("Het implementatiedagtarief ontbreekt. Controleer de offerte.");
  const travelForWeight = (value: number) => total.travelAmount > 0
    ? roundCurrency(value / dayRate * total.travelPricePerUnit) : 0;
  if (roundCurrency(travelForWeight(weight) + extraTravel) !== total.travelAmount) {
    throw new Error("De reiskosten per module sluiten niet aan op de offerte. Controleer per module of een bezoek nodig is en sla de offerte opnieuw op.");
  }
  let cumulativeWeight = 0;
  let allocatedTravel = 0;
  const orders = parts.map(part => {
    cumulativeWeight += part.travelWeight;
    const cumulativeTravel = travelForWeight(cumulativeWeight);
    const travelAmount = roundCurrency(cumulativeTravel - allocatedTravel);
    allocatedTravel = cumulativeTravel;
    return makeModuleOrder(total, `Implementatie ${part.name}`, part.amount, travelAmount, part.requiresTravel);
  });
  if (extraTravel > 0) orders.push(makeModuleOrder(total, "Reiskosten extra bezoeken", 0, extraTravel, true));
  return orders;
}

function makeModuleOrder(total: ImplementationOrderBreakdown, description: string, implementationAmount: number, travelAmount: number, requiresTravel: boolean): ImplementationModuleOrder {
  // Quantity 1 and the exact module travel amount prevent rounding differences in billing.
  const travelQuantity = travelAmount > 0 ? 1 : 0;
  const lines: ImplementationModuleOrder["lines"] = [];
  if (implementationAmount > 0) lines.push({ sortOrder: 1, article: IMPLEMENTATION_ARTICLE_ID, quantity: "1", unit: "st", description, headerText: description, remark: "", price: String(implementationAmount) });
  if (travelAmount > 0 && total.travelArticleId) lines.push({ sortOrder: lines.length + 1, article: total.travelArticleId, quantity: "1", unit: "st", description: `Reiskosten - Regio ${total.travelRegion}`, headerText: description, remark: "", price: String(travelAmount) });
  return { ...total, description, reference: description, implementationAmount, travelAmount,
    totalAmount: roundCurrency(implementationAmount + travelAmount), travelQuantity, travelPricePerUnit: travelAmount, requiresTravel, lines };
}
