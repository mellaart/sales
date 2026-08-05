import type { EditablePricingConfig } from "@/lib/price-config";
import { getTravelCostQuoteForPostcode } from "@/lib/price-config";
import {
  calculatePricing,
  getMinimumPackageForPaidModules,
  getPaidSelectedModuleCount,
} from "@/lib/pricing";
import type { DealRecord } from "@/lib/supabase";

export type DealPriceSummary = {
  licenseMonthly: number;
  supportMonthly: number;
  customerPortalMonthly: number;
  smartConnectMonthly: number;
  monthlyTotal: number;
  implementationBase: number;
  implementationAdjustment: number;
  travelCosts: number;
  implementationTotal: number;
};

function safeNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function getDealQuantities(deal: DealRecord, pricingConfig: EditablePricingConfig) {
  const configuredQuantities = deal.calculator_inputs?.quantities;
  if (configuredQuantities && typeof configuredQuantities === "object") {
    return Object.fromEntries(
      pricingConfig.modules.map((module) => [
        module.key,
        Math.max(0, safeNumber(configuredQuantities[module.key], 0)),
      ]),
    );
  }

  const quantities = Object.fromEntries(pricingConfig.modules.map((module) => [module.key, 0]));
  for (const dealModule of deal.modules ?? []) {
    if (dealModule.key && Object.prototype.hasOwnProperty.call(quantities, dealModule.key)) {
      quantities[dealModule.key] = Math.max(0, safeNumber(dealModule.qty, 0));
    }
  }
  return quantities;
}

function getSmartConnectMonthly(
  connectionCount: number,
  pricingConfig: EditablePricingConfig,
) {
  const safeConnectionCount = Math.max(0, Math.floor(connectionCount));
  if (safeConnectionCount === 0 || pricingConfig.smartConnectTiers.length === 0) return 0;

  const baseTier = pricingConfig.smartConnectTiers.find(
    (tier) => safeConnectionCount <= tier.connections,
  ) ?? pricingConfig.smartConnectTiers[pricingConfig.smartConnectTiers.length - 1];
  const maximumTier = pricingConfig.smartConnectTiers[pricingConfig.smartConnectTiers.length - 1];
  const extraConnections = Math.max(0, safeConnectionCount - maximumTier.connections);

  return baseTier.monthlyPrice
    + extraConnections * pricingConfig.smartConnectExtraConnectionPrice;
}

export function getDealPriceSummary(
  deal: DealRecord,
  pricingConfig: EditablePricingConfig,
): DealPriceSummary | null {
  const packages = pricingConfig.packages.filter((packageConfig) => packageConfig.key !== "lite");
  if (packages.length === 0) return null;

  const inputs = deal.calculator_inputs;
  const quantities = getDealQuantities(deal, pricingConfig);
  const extraUsers = Math.max(0, safeNumber(inputs?.extraUsers, Math.max(0, safeNumber(deal.total_users, 1) - 1)));
  const chauffeurExtraUsers = Math.max(0, safeNumber(inputs?.chauffeurExtraUsers, 0));
  const planningAppUsers = Math.max(0, safeNumber(inputs?.planningAppUsers, 0));
  const smartTradeExtraUsers = extraUsers + chauffeurExtraUsers;
  const implementationAdjustment = safeNumber(
    inputs?.manualImplementationAdjustment,
    safeNumber(deal.manual_implementation_adjustment, 0),
  );

  const results = calculatePricing({
    extraUsers: smartTradeExtraUsers,
    manualImplementationAdjustment: implementationAdjustment,
    includeVat: false,
    quantities,
  }, pricingConfig);
  const paidModuleCount = getPaidSelectedModuleCount(quantities, pricingConfig.modules);
  const minimumPackage = getMinimumPackageForPaidModules(paidModuleCount, packages);
  const selectedPackageKey = String(inputs?.selectedPackage || deal.package_key || minimumPackage.key);
  const selectedPackageIndex = packages.findIndex((packageConfig) => packageConfig.key === selectedPackageKey);
  const minimumPackageIndex = packages.findIndex((packageConfig) => packageConfig.key === minimumPackage.key);
  const activePackage = packages[Math.max(selectedPackageIndex, minimumPackageIndex, 0)] ?? minimumPackage;
  const activeResult = results.find((result) => result.key === activePackage.key) ?? results[0];
  if (!activeResult) return null;

  const includeSupport = inputs?.includeSupport ?? true;
  const supportMonthly = includeSupport ? activeResult.supportMonthly : 0;
  const planningAppMonthly = planningAppUsers * pricingConfig.planningAppUserMonthly;
  const licenseMonthly = activeResult.licenseMonthly + activeResult.moduleMonthly + planningAppMonthly;
  const selectedPortalKeys = new Set(inputs?.customerPortalOptionKeys ?? []);
  const customerPortalMonthly = pricingConfig.customerPortalOptions
    .filter((option) => selectedPortalKeys.has(option.key))
    .reduce((total, option) => total + option.monthlyPrice, 0);
  const smartConnectMonthly = getSmartConnectMonthly(
    safeNumber(inputs?.smartConnectConnections, 0),
    pricingConfig,
  );
  const monthlyTotal = Math.max(
    0,
    activeResult.monthlyAfterDiscount
      - activeResult.supportMonthly
      + supportMonthly
      + customerPortalMonthly
      + smartConnectMonthly
      + planningAppMonthly,
  );

  const includeTravelCosts = inputs?.includeTravelCosts ?? true;
  const travelQuote = getTravelCostQuoteForPostcode(
    pricingConfig,
    inputs?.travelPostcodePrefix ?? "",
  );
  const travelImplementationDays = pricingConfig.implementationDayRate > 0
    ? Math.max(0, activeResult.travelEligibleImplementationAfterAdjustment / pricingConfig.implementationDayRate)
    : 0;
  const travelCosts = includeTravelCosts && travelQuote
    ? travelImplementationDays * travelQuote.pricePerDay
    : 0;

  return {
    licenseMonthly,
    supportMonthly,
    customerPortalMonthly,
    smartConnectMonthly,
    monthlyTotal,
    implementationBase: activeResult.implementationBase,
    implementationAdjustment,
    travelCosts,
    implementationTotal: activeResult.implementationAfterAdjustment + travelCosts,
  };
}
