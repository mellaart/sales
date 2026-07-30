"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Building2, ChevronRight, FileText, Hash, Mail, MapPin, Search, Sparkles, UserRound } from "lucide-react";
import { NumberStepper } from "@/components/number-stepper";
import { useAuth } from "@/components/auth-provider";
import { usePricingConfig } from "@/components/pricing-provider";
import { StatusPill } from "@/components/ui";
import { getAssetExpansionTotals } from "@/lib/asset-expansions";
import { createDealWithFallback } from "@/lib/deal-storage";
import { getTravelCostQuoteForPostcode, normalizePostcodePrefix } from "@/lib/price-config";
import {
  MODULES,
  PACKAGES,
  calculatePricing,
  euro,
  getMinimumPackageForPaidModules,
  type ModuleConfig,
  type PackageConfig,
} from "@/lib/pricing";
import { type AssetExpansionLine, getSupabaseClient, getUserDisplayName } from "@/lib/supabase";
import styles from "./assets-dashboard.module.css";

const SMART_TRADE_ASSET_PREFIX = "Smart Trade ";
const SMART_TRADE_PACKAGE_NAMES = ["Lite", "Starter", "Basic", "Premium", "Enterprise"];
const NO_PACKAGE_SWITCH_MODULE_KEYS = new Set(["mailchimp", "postnl", "suiteMkb", "powerbi", "leverschema"]);
const SERVICE_COST_OPTIONS = [
  { key: "ccv", name: "CCV servicekosten", assetClassIds: ["114"] },
  { key: "worldline", name: "Worldline servicekosten", assetClassIds: ["113", "401"] },
];
const MODULE_DEPENDENCIES: Record<string, string[]> = {
  suiteMkb: ["rapportage"],
  partijregistratie: ["voorraad"],
  hoveniersapp: ["ticketing"],
};
type RelationOption = {
  id: string;
  name: string;
  email: string | null;
  debtorNumber: string | number | null;
  postcode: string | null;
};

type RelationDetailResponse = {
  relation?: {
    postcode?: unknown;
  } | null;
  primaryContact?: {
    name?: unknown;
  } | null;
  primaryContactError?: unknown;
};

type AssetModule = {
  id: string;
  name: string;
  code?: string | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
};

type AssetRecord = {
  id: string;
  name: string;
  assetClassId?: string | null;
  assetClass: string | null;
  description: string | null;
  serialNumber: string | null;
  quantity?: number | null;
  modules: AssetModule[];
};

type AssetClassTotal = {
  key: string;
  label: string;
  quantity: number;
  latestAsset: AssetRecord;
};

function normalizeLabel(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function startsWithPrefix(value: string, prefix: string) {
  return value.trimStart().toLowerCase().startsWith(prefix.toLowerCase());
}

function isSmartTradeAsset(asset: AssetRecord) {
  return startsWithPrefix(asset.name, SMART_TRADE_ASSET_PREFIX);
}

function getServiceCostOptionForAsset(asset: AssetRecord) {
  const assetClassId = asset.assetClassId?.trim();
  if (assetClassId) {
    const optionByAssetClass = SERVICE_COST_OPTIONS.find((option) => option.assetClassIds.includes(assetClassId));
    if (optionByAssetClass) return optionByAssetClass;
  }

  return SERVICE_COST_OPTIONS.find((option) => startsWithPrefix(asset.name, option.name)) ?? null;
}

function isServiceCostAsset(asset: AssetRecord) {
  return getServiceCostOptionForAsset(asset) !== null;
}

function getSmartTradePackageName(asset: AssetRecord) {
  const assetName = asset.name.trimStart();
  return SMART_TRADE_PACKAGE_NAMES.find((packageName) =>
    assetName.startsWith(`${SMART_TRADE_ASSET_PREFIX}${packageName}`),
  ) ?? null;
}

function getAssetIdNumber(asset: AssetRecord) {
  const directNumber = Number(asset.id);
  if (Number.isFinite(directNumber)) return directNumber;

  const matches = String(asset.id).match(/\d+/g);
  const lastMatch = matches ? matches[matches.length - 1] : null;
  const fallbackNumber = lastMatch ? Number(lastMatch) : Number.NaN;

  return Number.isFinite(fallbackNumber) ? fallbackNumber : null;
}

function hasHigherAssetId(candidate: AssetRecord, current: AssetRecord) {
  const candidateNumber = getAssetIdNumber(candidate);
  const currentNumber = getAssetIdNumber(current);

  if (candidateNumber !== null && currentNumber !== null) return candidateNumber > currentNumber;
  return candidate.id.localeCompare(current.id, undefined, { numeric: true }) > 0;
}

function getVisibleAssets(allAssets: AssetRecord[]) {
  const extraOptionAssets: AssetRecord[] = [];
  const packageAssets = new Map<string, AssetRecord[]>();

  for (const asset of allAssets) {
    if (isSmartTradeAsset(asset)) {
      const packageName = getSmartTradePackageName(asset);
      if (packageName) {
        const packageGroup = packageAssets.get(packageName) ?? [];
        packageGroup.push(asset);
        packageAssets.set(packageName, packageGroup);
        continue;
      }

      extraOptionAssets.push(asset);
      continue;
    }

    if (isServiceCostAsset(asset)) extraOptionAssets.push(asset);
  }

  let newestPackageAssets: AssetRecord[] = [];
  let newestPackageMaxAsset: AssetRecord | null = null;

  for (const packageGroup of packageAssets.values()) {
    const packageMaxAsset = packageGroup.reduce((newest, asset) =>
      hasHigherAssetId(asset, newest) ? asset : newest,
    );

    if (!newestPackageMaxAsset || hasHigherAssetId(packageMaxAsset, newestPackageMaxAsset)) {
      newestPackageMaxAsset = packageMaxAsset;
      newestPackageAssets = packageGroup;
    }
  }

  return [...newestPackageAssets, ...extraOptionAssets].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function getAssetQuantity(asset: AssetRecord) {
  const quantity = Number(asset.quantity ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function getAssetClassLabel(asset: AssetRecord) {
  const assetClass = asset.assetClass?.trim();
  return assetClass || getServiceCostOptionForAsset(asset)?.name || asset.name;
}

function getAssetClassTotals(assets: AssetRecord[]) {
  const totalsByKey = new Map<string, AssetClassTotal>();

  for (const asset of assets) {
    const label = getAssetClassLabel(asset);
    const key = label.toLowerCase();
    const quantity = getAssetQuantity(asset);
    const existing = totalsByKey.get(key);

    if (!existing) {
      totalsByKey.set(key, { key, label, quantity, latestAsset: asset });
      continue;
    }

    existing.quantity += quantity;
    if (hasHigherAssetId(asset, existing.latestAsset)) existing.latestAsset = asset;
  }

  return Array.from(totalsByKey.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function hasSupportAsset(assets: AssetRecord[]) {
  return assets.some((asset) => asset.name.toLowerCase().includes("support"));
}

function isExtraUserLicenseAsset(asset: AssetRecord, packageName: string) {
  const assetName = asset.name.trimStart().toLowerCase();
  const packagePrefix = `${SMART_TRADE_ASSET_PREFIX}${packageName}`.toLowerCase();

  return (
    assetName.startsWith(packagePrefix) &&
    assetName.includes("licentie") &&
    assetName.includes("extra gebruiker") &&
    !assetName.includes("support")
  );
}

function getExtraUserLicenseCount(assets: AssetRecord[], packageName: string | null) {
  if (!packageName) return 0;

  return assets.reduce((sum, asset) => {
    if (!isExtraUserLicenseAsset(asset, packageName)) return sum;
    return sum + getAssetQuantity(asset);
  }, 0);
}

function formatUserCount(count: number) {
  return count === 1 ? "1 bestaande gebruiker" : `${count} bestaande gebruikers`;
}

function formatAssetQuantity(quantity: number) {
  return quantity === 1 ? "1 asset" : `${quantity} assets`;
}

function formatConnectionCount(count: number) {
  return count === 1 ? "1 connectie" : `${count} connecties`;
}

function getSmartConnectConnectionsFromText(value?: string | null) {
  const match = value?.match(/smart\s*connect\D*(\d+)/i);
  const connections = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(connections) && connections > 0 ? Math.floor(connections) : null;
}

function getSmartConnectConnectionsFromAsset(asset: AssetRecord) {
  return (
    getSmartConnectConnectionsFromText(asset.name) ??
    getSmartConnectConnectionsFromText(asset.assetClass) ??
    getSmartConnectConnectionsFromText(asset.description)
  );
}

function getSmartConnectRows(assets: AssetRecord[]) {
  const rowsByConnections = new Map<number, { key: string; connections: number; quantity: number; totalConnections: number }>();

  for (const asset of assets) {
    const connections = getSmartConnectConnectionsFromAsset(asset);
    if (!connections) continue;

    const quantity = getAssetQuantity(asset);
    const existing = rowsByConnections.get(connections);

    if (!existing) {
      rowsByConnections.set(connections, {
        key: String(connections),
        connections,
        quantity,
        totalConnections: quantity * connections,
      });
      continue;
    }

    existing.quantity += quantity;
    existing.totalConnections += quantity * connections;
  }

  return Array.from(rowsByConnections.values()).sort((left, right) => left.connections - right.connections);
}

function getSmartConnectPricing(
  connectionCount: number,
  smartConnectTiers: Array<{ connections: number; monthlyPrice: number }>,
  extraConnectionPrice: number,
) {
  const safeConnectionCount = Math.max(0, Math.floor(connectionCount));

  if (safeConnectionCount === 0) {
    return { connectionCount: 0, baseTier: null, extraConnections: 0, extraMonthly: 0, monthlyTotal: 0 };
  }

  const baseTier = smartConnectTiers.find((tier) => safeConnectionCount <= tier.connections)
    ?? smartConnectTiers[smartConnectTiers.length - 1];
  const extraConnections = Math.max(0, safeConnectionCount - smartConnectTiers[smartConnectTiers.length - 1].connections);
  const extraMonthly = extraConnections * extraConnectionPrice;

  return {
    connectionCount: safeConnectionCount,
    baseTier,
    extraConnections,
    extraMonthly,
    monthlyTotal: baseTier.monthlyPrice + extraMonthly,
  };
}

function getInitialServiceCostQuantities() {
  return SERVICE_COST_OPTIONS.reduce<Record<string, number>>((quantities, option) => {
    quantities[option.key] = 0;
    return quantities;
  }, {});
}

function getServiceCostCounts(assets: AssetRecord[]) {
  return assets.reduce<Record<string, number>>((counts, asset) => {
    const option = getServiceCostOptionForAsset(asset);
    if (!option) return counts;

    counts[option.key] = (counts[option.key] ?? 0) + getAssetQuantity(asset);
    return counts;
  }, getInitialServiceCostQuantities());
}

function getCustomerPortalKeysFromAssets(
  assets: AssetRecord[],
  customerPortalOptions: Array<{ key: string; name: string }>,
) {
  const optionKeys = new Set<string>();

  for (const asset of assets) {
    const assetName = normalizeLabel(asset.name);
    const assetClass = normalizeLabel(asset.assetClass);
    const combined = `${assetName} ${assetClass}`;

    if (!combined.includes("klantportaal")) continue;

    for (const option of customerPortalOptions) {
      if (combined.includes(normalizeLabel(option.name))) optionKeys.add(option.key);
    }
  }

  return customerPortalOptions.filter((option) => optionKeys.has(option.key)).map((option) => option.key);
}

function getSortedModuleKeys(moduleKeys: string[], modules: ModuleConfig[] = MODULES) {
  const moduleOrder = new Map(modules.map((module, index) => [module.key, index]));
  return Array.from(new Set(moduleKeys)).sort(
    (left, right) => (moduleOrder.get(left) ?? 0) - (moduleOrder.get(right) ?? 0),
  );
}

function getModuleKeysFromAssets(assets: AssetRecord[], modules: ModuleConfig[] = MODULES) {
  const moduleKeys = new Set<string>();

  for (const asset of assets) {
    const assetName = asset.name.trimStart();
    const normalizedAssetName = normalizeLabel(assetName);

    if (!isSmartTradeAsset(asset) || !assetName.toLowerCase().includes(" module - ")) continue;

    for (const moduleConfig of modules) {
      if (normalizedAssetName.includes(normalizeLabel(moduleConfig.name))) moduleKeys.add(moduleConfig.key);
    }
  }

  return getSortedModuleKeys(Array.from(moduleKeys), modules);
}

function getModulesByKeys(moduleKeys: string[], modules: ModuleConfig[] = MODULES) {
  return modules.filter((moduleConfig) => moduleKeys.includes(moduleConfig.key));
}

function getModuleName(moduleKey: string, modules: ModuleConfig[] = MODULES) {
  return modules.find((moduleConfig) => moduleConfig.key === moduleKey)?.name ?? moduleKey;
}

function applyModuleDependencies(moduleKeys: string[]) {
  const expandedKeys = new Set(moduleKeys);
  let changed = true;

  while (changed) {
    changed = false;

    for (const moduleKey of Array.from(expandedKeys)) {
      for (const requiredKey of MODULE_DEPENDENCIES[moduleKey] ?? []) {
        if (!expandedKeys.has(requiredKey)) {
          expandedKeys.add(requiredKey);
          changed = true;
        }
      }
    }
  }

  return getSortedModuleKeys(Array.from(expandedKeys));
}

function removeModuleAndDependents(moduleKey: string, moduleKeys: string[]) {
  const remainingKeys = new Set(moduleKeys);
  const queue = [moduleKey];

  while (queue.length > 0) {
    const nextKey = queue.shift();
    if (!nextKey || !remainingKeys.delete(nextKey)) continue;

    for (const [dependentKey, requiredKeys] of Object.entries(MODULE_DEPENDENCIES)) {
      if (requiredKeys.includes(nextKey)) queue.push(dependentKey);
    }
  }

  return getSortedModuleKeys(Array.from(remainingKeys));
}

function getPackageRelevantModules(moduleKeys: string[], modules: ModuleConfig[] = MODULES) {
  return getModulesByKeys(moduleKeys, modules).filter(
    (moduleConfig) => moduleConfig.monthlyPrice > 0 && !moduleConfig.noPackageSwitch && !NO_PACKAGE_SWITCH_MODULE_KEYS.has(moduleConfig.key),
  );
}

function getStandaloneModules(moduleKeys: string[], modules: ModuleConfig[] = MODULES) {
  return getModulesByKeys(moduleKeys, modules).filter(
    (moduleConfig) => moduleConfig.monthlyPrice > 0 && (moduleConfig.noPackageSwitch || NO_PACKAGE_SWITCH_MODULE_KEYS.has(moduleConfig.key)),
  );
}

function getPackageRelevantModuleCount(moduleKeys: string[], modules: ModuleConfig[] = MODULES) {
  return getPackageRelevantModules(moduleKeys, modules).length;
}

function getModuleMonthlyForPackage(moduleKeys: string[], packageConfig: PackageConfig, modules: ModuleConfig[] = MODULES) {
  const packageRelevantModules = getPackageRelevantModules(moduleKeys, modules);
  const standaloneModuleMonthly = getStandaloneModules(moduleKeys, modules).reduce(
    (sum, moduleConfig) => sum + moduleConfig.monthlyPrice,
    0,
  );
  const packageRelevantMonthly = packageRelevantModules.reduce(
    (sum, moduleConfig) => sum + moduleConfig.monthlyPrice,
    0,
  );
  const includedModuleDiscount = packageRelevantModules
    .slice()
    .sort((left, right) => right.monthlyPrice - left.monthlyPrice)
    .slice(0, packageConfig.includedModules)
    .reduce((sum, moduleConfig) => sum + moduleConfig.monthlyPrice, 0);

  return standaloneModuleMonthly + Math.max(0, packageRelevantMonthly - includedModuleDiscount);
}

function formatImplementationBasis(cost: number) {
  if (cost === 360) return "halve dag";
  if (cost === 720) return "hele dag";
  if (cost === 1440) return "2 dagen";
  if (cost === 400) return "setup";
  if (cost === 0) return "geen setup";
  return "setup";
}

function isSameModuleSelection(left: string[], right: string[]) {
  const sortedLeft = getSortedModuleKeys(left);
  const sortedRight = getSortedModuleKeys(right);
  return sortedLeft.length === sortedRight.length && sortedLeft.every((key, index) => key === sortedRight[index]);
}

function formatModuleList(modules: ModuleConfig[]) {
  if (modules.length === 0) return "Geen modules";
  return modules.map((moduleConfig) => moduleConfig.name).join(", ");
}

function getPackageIndex(packageConfig: PackageConfig, packages: PackageConfig[] = PACKAGES) {
  return packages.findIndex((candidate) => candidate.key === packageConfig.key);
}

function getModuleRuleNotes(moduleConfig: ModuleConfig, modules: ModuleConfig[] = MODULES) {
  const notes: string[] = [];
  const dependencies = MODULE_DEPENDENCIES[moduleConfig.key] ?? [];

  if (moduleConfig.noPackageSwitch || NO_PACKAGE_SWITCH_MODULE_KEYS.has(moduleConfig.key)) notes.push("Geen pakketwissel nodig");
  if (moduleConfig.dependencyNote) notes.push(moduleConfig.dependencyNote);
  if (!moduleConfig.dependencyNote && dependencies.length > 0) {
    notes.push(`Vereist: ${dependencies.map((moduleKey) => getModuleName(moduleKey, modules)).join(", ")}`);
  }

  return notes;
}

function getSafeQuantity(value: string | number) {
  return Math.max(0, Math.floor(Number(value || 0)));
}

function formatAssetClassIds(assetClassIds: string[]) {
  return assetClassIds.length === 1 ? `asset_class ${assetClassIds[0]}` : `asset_classes ${assetClassIds.join(", ")}`;
}

function formatLineAmount(line: AssetExpansionLine) {
  const suffix = line.cadence === "monthly" ? " p/m" : line.cadence === "annual" ? " p/j" : "";
  return `${euro.format(line.amount)}${suffix}`;
}

function formatDays(days: number) {
  const roundedDays = Math.round(days * 100) / 100;
  const label = roundedDays === 1 ? "dag" : "dagen";
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(roundedDays)} ${label}`;
}

function buildAssetDealNotes(relation: RelationOption, lines: AssetExpansionLine[]) {
  return [
    `Assets-uitbreiding voor ${relation.name}.`,
    "",
    ...lines.map((line) => `${line.quantity}x ${line.label} - ${formatLineAmount(line)}${line.note ? ` (${line.note})` : ""}`),
  ].join("\n");
}

export default function AssetsDashboardCurrent() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { pricingConfig } = usePricingConfig();
  const packages = pricingConfig.packages;
  const modules = pricingConfig.modules;
  const supabase = getSupabaseClient();
  const [query, setQuery] = useState("");
  const [relations, setRelations] = useState<RelationOption[]>([]);
  const [selectedRelation, setSelectedRelation] = useState<RelationOption | null>(null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [assetStatus, setAssetStatus] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [extraUsersToOffer, setExtraUsersToOffer] = useState(0);
  const [chauffeurExtraUsersToOffer, setChauffeurExtraUsersToOffer] = useState(0);
  const [includeMissingSupportOffer, setIncludeMissingSupportOffer] = useState(false);
  const [selectedModuleKeys, setSelectedModuleKeys] = useState<string[]>([]);
  const [selectedCustomerPortalOptionKeys, setSelectedCustomerPortalOptionKeys] = useState<string[]>([]);
  const [smartConnectConnections, setSmartConnectConnections] = useState(0);
  const [serviceCostQuantities, setServiceCostQuantities] = useState<Record<string, number>>(getInitialServiceCostQuantities);
  const [includeTravelCosts, setIncludeTravelCosts] = useState(true);
  const [travelPostcodePrefix, setTravelPostcodePrefix] = useState("");
  const travelPostcodeManuallyEditedRef = useRef(false);
  const [dealContactName, setDealContactName] = useState("");
  const [contactPersonStatus, setContactPersonStatus] = useState("");
  const [loadingContactPerson, setLoadingContactPerson] = useState(false);
  const [offerGuidance, setOfferGuidance] = useState("");
  const [transferStatus, setTransferStatus] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);

  const visibleAssets = useMemo(() => getVisibleAssets(assets), [assets]);
  const assetClassTotals = useMemo(() => getAssetClassTotals(visibleAssets), [visibleAssets]);
  const existingServiceCostCounts = useMemo(() => getServiceCostCounts(assets), [assets]);
  const existingSmartConnectRows = useMemo(() => getSmartConnectRows(assets), [assets]);
  const currentCustomerPortalKeys = useMemo(
    () => getCustomerPortalKeysFromAssets(visibleAssets, pricingConfig.customerPortalOptions),
    [pricingConfig.customerPortalOptions, visibleAssets],
  );

  const selectedPackageName = useMemo(
    () => visibleAssets.map(getSmartTradePackageName).find((packageName): packageName is string => Boolean(packageName)) ?? null,
    [visibleAssets],
  );
  const selectedPackage = useMemo(
    () => packages.find((packageConfig) => packageConfig.name === selectedPackageName) ?? null,
    [packages, selectedPackageName],
  );

  const currentModuleKeys = useMemo(() => applyModuleDependencies(getModuleKeysFromAssets(visibleAssets, modules)), [modules, visibleAssets]);
  const selectedModules = useMemo(() => getModulesByKeys(selectedModuleKeys, modules), [modules, selectedModuleKeys]);
  const addedModules = useMemo(
    () => selectedModules.filter((moduleConfig) => !currentModuleKeys.includes(moduleConfig.key)),
    [currentModuleKeys, selectedModules],
  );
  const removedModules = useMemo(
    () => getModulesByKeys(currentModuleKeys, modules).filter((moduleConfig) => !selectedModuleKeys.includes(moduleConfig.key)),
    [currentModuleKeys, modules, selectedModuleKeys],
  );
  const selectedPackageModuleCount = useMemo(() => getPackageRelevantModuleCount(selectedModuleKeys, modules), [modules, selectedModuleKeys]);
  const targetPackage = useMemo(() => getMinimumPackageForPaidModules(selectedPackageModuleCount, packages), [packages, selectedPackageModuleCount]);
  const selectedCustomerPortalOptions = useMemo(
    () => pricingConfig.customerPortalOptions.filter((option) => selectedCustomerPortalOptionKeys.includes(option.key)),
    [pricingConfig.customerPortalOptions, selectedCustomerPortalOptionKeys],
  );
  const smartConnectPricing = useMemo(
    () => getSmartConnectPricing(
      smartConnectConnections,
      pricingConfig.smartConnectTiers,
      pricingConfig.smartConnectExtraConnectionPrice,
    ),
    [pricingConfig.smartConnectExtraConnectionPrice, pricingConfig.smartConnectTiers, smartConnectConnections],
  );

  const serviceCostRows = useMemo(
    () =>
      SERVICE_COST_OPTIONS.map((option) => {
        const existingQuantity = existingServiceCostCounts[option.key] ?? 0;
        const offerQuantity = serviceCostQuantities[option.key] ?? 0;
        const annualPrice = pricingConfig.serviceCostOptions.find((priceOption) => priceOption.key === option.key)?.annualPrice ?? 0;
        return {
          ...option,
          annualPrice,
          existingQuantity,
          existingAnnualTotal: existingQuantity * annualPrice,
          offerQuantity,
          offerAnnualTotal: offerQuantity * annualPrice,
        };
      }),
    [existingServiceCostCounts, pricingConfig.serviceCostOptions, serviceCostQuantities],
  );

  const existingServiceCostRows = serviceCostRows.filter((option) => option.existingQuantity > 0);
  const selectedServiceCostRows = serviceCostRows.filter((option) => option.offerQuantity > 0);
  const existingServiceCostTotal = existingServiceCostRows.reduce((sum, option) => sum + option.existingQuantity, 0);
  const existingServiceCostAnnualTotal = existingServiceCostRows.reduce((sum, option) => sum + option.existingAnnualTotal, 0);
  const serviceCostAnnualTotal = selectedServiceCostRows.reduce((sum, option) => sum + option.offerAnnualTotal, 0);
  const serviceCostPriceLabel = new Set(serviceCostRows.map((option) => option.annualPrice)).size === 1
    ? `${euro.format(serviceCostRows[0]?.annualPrice ?? 0)} per jaar per stuk`
    : "Prijzen per servicekostenregel";

  const shouldIncludeSupport = useMemo(() => hasSupportAsset(visibleAssets), [visibleAssets]);
  const existingExtraUserCount = useMemo(
    () => getExtraUserLicenseCount(visibleAssets, selectedPackageName),
    [selectedPackageName, visibleAssets],
  );
  const existingUserCount = existingExtraUserCount + 1;
  const safeExtraUsersToOffer = Math.max(0, Math.floor(extraUsersToOffer));
  const safeChauffeurExtraUsersToOffer = Math.max(0, Math.floor(chauffeurExtraUsersToOffer));
  const extraUserLicenseTotal = selectedPackage ? safeExtraUsersToOffer * selectedPackage.licenseExtra : 0;
  const extraUserSupportTotal = selectedPackage && shouldIncludeSupport ? safeExtraUsersToOffer * selectedPackage.supportExtra : 0;
  const chauffeurExtraUserLicenseTotal = selectedPackage
    ? safeChauffeurExtraUsersToOffer * selectedPackage.licenseExtra
    : 0;
  const chauffeurExtraUserSupportTotal = selectedPackage && shouldIncludeSupport
    ? safeChauffeurExtraUsersToOffer * selectedPackage.supportExtra
    : 0;
  const upsellMonthlyTotal =
    extraUserLicenseTotal +
    extraUserSupportTotal +
    chauffeurExtraUserLicenseTotal +
    chauffeurExtraUserSupportTotal;
  const missingSupportBaseTotal = selectedPackage && includeMissingSupportOffer ? selectedPackage.supportFirst : 0;
  const missingSupportExtraTotal = selectedPackage && includeMissingSupportOffer ? existingExtraUserCount * selectedPackage.supportExtra : 0;
  const missingSupportMonthlyTotal = missingSupportBaseTotal + missingSupportExtraTotal;
  const customerPortalMonthlyTotal = selectedCustomerPortalOptions.reduce((sum, option) => sum + option.monthlyPrice, 0);

  const hasModuleSelectionChanges = !isSameModuleSelection(currentModuleKeys, selectedModuleKeys);
  const hasPackageChange = Boolean(selectedPackage && targetPackage && selectedPackage.key !== targetPackage.key);
  const packageChangeDirection = selectedPackage && targetPackage && getPackageIndex(targetPackage, packages) > getPackageIndex(selectedPackage, packages)
    ? "upgrade nodig"
    : "downgrade mogelijk";
  const currentModuleMonthly = selectedPackage ? getModuleMonthlyForPackage(currentModuleKeys, selectedPackage, modules) : 0;
  const targetModuleMonthly = targetPackage ? getModuleMonthlyForPackage(selectedModuleKeys, targetPackage, modules) : 0;
  const moduleMonthlyDelta = targetModuleMonthly - currentModuleMonthly;
  const moduleImplementationTotal = addedModules.reduce((sum, moduleConfig) => sum + (moduleConfig.setupCost ?? 0), 0);
  const currentLicenseMonthly = selectedPackage ? selectedPackage.licenseFirst + existingExtraUserCount * selectedPackage.licenseExtra : 0;
  const currentSupportMonthly = selectedPackage && shouldIncludeSupport
    ? selectedPackage.supportFirst + existingExtraUserCount * selectedPackage.supportExtra
    : 0;
  const currentRecurringMonthly = currentLicenseMonthly + currentSupportMonthly + currentModuleMonthly;
  const targetLicenseMonthly = targetPackage ? targetPackage.licenseFirst + existingExtraUserCount * targetPackage.licenseExtra : 0;
  const targetSupportMonthly = targetPackage && shouldIncludeSupport
    ? targetPackage.supportFirst + existingExtraUserCount * targetPackage.supportExtra
    : 0;
  const targetRecurringMonthly = targetLicenseMonthly + targetSupportMonthly + targetModuleMonthly;
  const recurringMonthlyDelta = targetRecurringMonthly - currentRecurringMonthly;
  const existingSmartConnectAssetTotal = existingSmartConnectRows.reduce((sum, row) => sum + row.quantity, 0);
  const existingSmartConnectTotal = existingSmartConnectRows.reduce((sum, row) => sum + row.totalConnections, 0);
  const customerPortalAddedOptions = useMemo(
    () => selectedCustomerPortalOptions.filter((option) => !currentCustomerPortalKeys.includes(option.key)),
    [currentCustomerPortalKeys, selectedCustomerPortalOptions],
  );
  const assetDealLines = useMemo(() => {
    const lines: AssetExpansionLine[] = [];

    if (selectedPackage && safeExtraUsersToOffer > 0) {
      lines.push({
        group: "Gebruikers",
        label: `Smart Trade ${selectedPackage.name} Extra gebruiker`,
        quantity: safeExtraUsersToOffer,
        cadence: "monthly",
        amount: extraUserLicenseTotal,
      });

      if (shouldIncludeSupport && extraUserSupportTotal > 0) {
        lines.push({
          group: "Gebruikers",
          label: `Smart Trade ${selectedPackage.name} Supportcontract Extra gebruiker`,
          quantity: safeExtraUsersToOffer,
          cadence: "monthly",
          amount: extraUserSupportTotal,
        });
      }
    }

    if (selectedPackage && safeChauffeurExtraUsersToOffer > 0) {
      lines.push({
        group: "Chauffeursmodule",
        label: "Licentie extra gebruiker (chauffeursmodule)",
        quantity: safeChauffeurExtraUsersToOffer,
        cadence: "monthly",
        amount: chauffeurExtraUserLicenseTotal,
      });

      if (shouldIncludeSupport && chauffeurExtraUserSupportTotal > 0) {
        lines.push({
          group: "Chauffeursmodule",
          label: "Supportcontract extra gebruiker (chauffeursmodule)",
          quantity: safeChauffeurExtraUsersToOffer,
          cadence: "monthly",
          amount: chauffeurExtraUserSupportTotal,
        });
      }
    }

    if (selectedPackage && includeMissingSupportOffer && missingSupportMonthlyTotal > 0) {
      lines.push({
        group: "Support",
        label: `Supportcontract Smart Trade ${selectedPackage.name}`,
        quantity: existingUserCount,
        cadence: "monthly",
        amount: missingSupportMonthlyTotal,
      });
    }

    if (selectedPackage && targetPackage && hasModuleSelectionChanges && addedModules.length > 0) {
      lines.push({
        group: hasPackageChange ? "Pakket" : "Modules",
        label: hasPackageChange
          ? `Pakketadvies: Smart Trade ${selectedPackage.name} naar ${targetPackage.name}`
          : addedModules.length === 1
            ? addedModules[0].name
            : `Module-uitbreiding: ${formatModuleList(addedModules)}`,
        quantity: 1,
        cadence: "monthly",
        amount: Math.max(0, hasPackageChange ? recurringMonthlyDelta : moduleMonthlyDelta),
        note: hasPackageChange ? `${packageChangeDirection}: ${formatModuleList(addedModules)}` : undefined,
      });
    }

    for (const moduleConfig of addedModules) {
      const implementationCost = moduleConfig.setupCost ?? 0;
      if (implementationCost > 0) {
        lines.push({
          group: "Implementatie",
          label: `Implementatie ${moduleConfig.name}`,
          quantity: 1,
          cadence: "once",
          amount: implementationCost,
        });
      }
    }

    for (const option of customerPortalAddedOptions) {
      lines.push({
        group: "Klantenportaal",
        label: `Smart Trade - ${option.name}`,
        quantity: 1,
        cadence: "monthly",
        amount: option.monthlyPrice,
      });
    }

    if (smartConnectPricing.baseTier) {
      lines.push({
        group: "Smart Connect",
        label: `Smart Connect - ${formatConnectionCount(smartConnectPricing.baseTier.connections)}`,
        quantity: 1,
        cadence: "monthly",
        amount: smartConnectPricing.baseTier.monthlyPrice,
        note: `staffel voor ${formatConnectionCount(smartConnectPricing.connectionCount)}`,
      });

      if (smartConnectPricing.extraConnections > 0) {
        lines.push({
          group: "Smart Connect",
          label: "Smart Connect extra connectie",
          quantity: smartConnectPricing.extraConnections,
          cadence: "monthly",
          amount: smartConnectPricing.extraMonthly,
        });
      }
    }

    for (const option of selectedServiceCostRows) {
      lines.push({
        group: "Servicekosten",
        label: option.name,
        quantity: option.offerQuantity,
        cadence: "annual",
        amount: option.offerAnnualTotal,
      });
    }

    return lines;
  }, [
    addedModules,
    chauffeurExtraUserLicenseTotal,
    chauffeurExtraUserSupportTotal,
    customerPortalAddedOptions,
    existingUserCount,
    extraUserLicenseTotal,
    extraUserSupportTotal,
    hasPackageChange,
    hasModuleSelectionChanges,
    includeMissingSupportOffer,
    missingSupportMonthlyTotal,
    moduleMonthlyDelta,
    packageChangeDirection,
    recurringMonthlyDelta,
    safeChauffeurExtraUsersToOffer,
    safeExtraUsersToOffer,
    selectedPackage,
    selectedServiceCostRows,
    shouldIncludeSupport,
    smartConnectPricing,
    targetPackage,
  ]);
  const assetExpansionTotals = useMemo(() => getAssetExpansionTotals(assetDealLines), [assetDealLines]);
  const travelImplementationTotal = addedModules
    .filter((moduleConfig) => moduleConfig.requiresTravel !== false)
    .reduce((sum, moduleConfig) => sum + (moduleConfig.setupCost ?? 0), 0);
  const travelImplementationDays = pricingConfig.implementationDayRate > 0
    ? Math.max(0, travelImplementationTotal / pricingConfig.implementationDayRate)
    : 0;
  const canCalculateTravelCosts = travelImplementationDays > 0;
  const effectiveIncludeTravelCosts = includeTravelCosts && canCalculateTravelCosts;
  const travelCostQuote = useMemo(
    () => getTravelCostQuoteForPostcode(pricingConfig, travelPostcodePrefix),
    [pricingConfig, travelPostcodePrefix],
  );
  const travelCostTotal = effectiveIncludeTravelCosts && travelCostQuote
    ? travelImplementationDays * travelCostQuote.pricePerDay
    : 0;
  const transferHint = !selectedRelation
    ? "Kies eerst een relatie. Daarna kun je geselecteerde uitbreidingen doorzetten naar Deals."
    : assetDealLines.length === 0
      ? "Selecteer of vul minimaal één uitbreiding in voordat je een deal maakt."
      : `${assetDealLines.length} uitbreidingsregels staan klaar om als deal op te slaan.`;

  function handleToggleModule(moduleKey: string) {
    setSelectedModuleKeys((currentKeys) => {
      if (currentKeys.includes(moduleKey)) return removeModuleAndDependents(moduleKey, currentKeys);
      return applyModuleDependencies([...currentKeys, moduleKey]);
    });
  }

  function handleToggleCustomerPortalOption(optionKey: string) {
    setSelectedCustomerPortalOptionKeys((currentKeys) => {
      if (currentKeys.includes(optionKey)) return currentKeys.filter((key) => key !== optionKey);
      return [...currentKeys, optionKey];
    });
  }

  function handleServiceCostQuantityChange(optionKey: string, value: string) {
    setServiceCostQuantities((currentQuantities) => ({
      ...currentQuantities,
      [optionKey]: getSafeQuantity(value),
    }));
  }

  function handleResetModules() {
    setSelectedModuleKeys(currentModuleKeys);
  }

  async function handleSendExpansionsToDeals() {
    setTransferStatus("");

    if (!selectedRelation) {
      setTransferStatus("Kies eerst een relatie.");
      return;
    }

    if (assetDealLines.length === 0) {
      setTransferStatus("Selecteer eerst minimaal één uitbreiding om door te zetten naar Deals.");
      return;
    }

    if (!user) {
      setTransferStatus("Je moet ingelogd zijn om een deal aan te maken.");
      return;
    }

    if (!supabase) {
      setTransferStatus("Supabase keys ontbreken.");
      return;
    }

    setTransferBusy(true);

    try {
      const finalPackage = targetPackage ?? selectedPackage ?? packages[packages.length - 1];
      const expansionTotals = assetExpansionTotals;
      const quantities = Object.fromEntries(
        modules.map((moduleConfig) => [moduleConfig.key, addedModules.some((addedModule) => addedModule.key === moduleConfig.key) ? 1 : 0]),
      );
      const extraUsersForDeal = safeExtraUsersToOffer + safeChauffeurExtraUsersToOffer;
      const manualImplementationAdjustment = expansionTotals.once;
      const pricingResults = calculatePricing({
        extraUsers: extraUsersForDeal,
        manualImplementationAdjustment,
        quantities,
      }, pricingConfig);
      const activeResult = pricingResults.find((packageResult) => packageResult.key === finalPackage.key) ?? pricingResults[0];
      const selectedModuleRows = modules.filter((moduleConfig) => (quantities[moduleConfig.key] ?? 0) > 0).map((moduleConfig) => ({
        ...moduleConfig,
        qty: quantities[moduleConfig.key] ?? 0,
        total: moduleConfig.monthlyPrice * (quantities[moduleConfig.key] ?? 0),
      }));
      const notes = buildAssetDealNotes(selectedRelation, assetDealLines);

      const payload = {
        user_id: user.id,
        customer_name: selectedRelation.name,
        quote_title: `Uitbreidingen ${selectedRelation.name}`,
        contact_name: dealContactName.trim() || null,
        sales_name: getUserDisplayName(user, profile),
        package_key: activeResult.key,
        package_name: "Uitbreiding",
        total_users: Math.max(1, extraUsersForDeal + 1),
        contract_months: 1,
        discount_pct: 0,
        include_vat: false,
        manual_monthly_adjustment: 0,
        manual_implementation_adjustment: manualImplementationAdjustment,
        monthly_base: expansionTotals.monthly,
        monthly_total: expansionTotals.monthly,
        implementation_total: expansionTotals.once + travelCostTotal,
        contract_value: expansionTotals.monthly + expansionTotals.annual + expansionTotals.once + travelCostTotal,
        annual_recurring: expansionTotals.monthly * 12 + expansionTotals.annual,
        modules: selectedModuleRows,
        notes,
        calculator_inputs: {
          extraUsers: extraUsersForDeal,
          selectedPackage: activeResult.key,
          manualImplementationAdjustment,
          includeVat: false,
          includeTravelCosts: effectiveIncludeTravelCosts,
          travelPostcodePrefix,
          travelCostPerDay: travelCostQuote?.pricePerDay ?? 0,
          travelCostTotal,
          travelRegion: travelCostQuote?.postcodeRow?.region ?? null,
          quantities,
          quoteLayout: "assets-expansion" as const,
          assetsExpansion: {
            source: "assets" as const,
            relationId: selectedRelation.id,
            relationName: selectedRelation.name,
            currentPackageName: selectedPackageName,
            targetPackageName: activeResult.name,
            guidanceText: offerGuidance.trim() || undefined,
            createdAt: new Date().toISOString(),
            lines: assetDealLines,
          },
        },
      };

      const result = await createDealWithFallback(supabase, payload);

      if (result.error || !result.deal?.id) {
        setTransferStatus(`Deal aanmaken mislukt: ${result.error ?? "het dealnummer kon niet worden geopend."}`);
        return;
      }

      setTransferStatus(result.warning ?? "Uitbreidingen zijn doorgestuurd naar Deals.");
      router.push(`/deals/${result.deal.id}`);
    } catch (error) {
      setTransferStatus(error instanceof Error ? error.message : "Deal aanmaken mislukt.");
    } finally {
      setTransferBusy(false);
    }
  }

  function renderModuleImplementationRows() {
    if (addedModules.length === 0) {
      return (
        <div className={styles.quoteRow}>
          <span>0x</span>
          <strong>Implementatie modules</strong>
          <span>geen toegevoegde modules</span>
          <strong>{euro.format(0)}</strong>
        </div>
      );
    }

    return addedModules.map((moduleConfig) => {
      const implementationCost = moduleConfig.setupCost ?? 0;
      return (
        <div key={`implementation-${moduleConfig.key}`} className={styles.quoteRow}>
          <span>1x</span>
          <strong>Implementatie {moduleConfig.name}</strong>
          <span>{formatImplementationBasis(implementationCost)}</span>
          <strong>{euro.format(implementationCost)}</strong>
        </div>
      );
    });
  }

  async function handleSearchRelations(event: FormEvent) {
    event.preventDefault();

    setSearchStatus("");
    setAssetStatus("");
    setTransferStatus("");
    setSearching(true);
    setSelectedRelation(null);
    setAssets([]);
    setExtraUsersToOffer(0);
    setChauffeurExtraUsersToOffer(0);
    setSelectedModuleKeys([]);
    setIncludeMissingSupportOffer(false);
    setSelectedCustomerPortalOptionKeys([]);
    setSmartConnectConnections(0);
    setServiceCostQuantities(getInitialServiceCostQuantities());
    setIncludeTravelCosts(true);
    setTravelPostcodePrefix("");
    setDealContactName("");
    setContactPersonStatus("");
    setLoadingContactPerson(false);
    setOfferGuidance("");

    try {
      const response = await fetch(`/api/smart-trade/relations/search?query=${encodeURIComponent(query)}`);
      const json = await response.json();

      if (!response.ok) {
        setSearchStatus(json.error ?? "Relaties zoeken mislukt.");
        return;
      }

      setRelations(json.relations ?? []);
      if ((json.relations ?? []).length === 0) setSearchStatus("Geen relaties gevonden.");
    } catch (error) {
      setSearchStatus(error instanceof Error ? error.message : "Relaties zoeken mislukt.");
    } finally {
      setSearching(false);
    }
  }

  async function handleSelectRelation(relation: RelationOption) {
    setSelectedRelation(relation);
    setAssetStatus("");
    setTransferStatus("");
    setLoadingAssets(true);
    setAssets([]);
    setExtraUsersToOffer(0);
    setChauffeurExtraUsersToOffer(0);
    setSelectedModuleKeys([]);
    setIncludeMissingSupportOffer(false);
    setSelectedCustomerPortalOptionKeys([]);
    setSmartConnectConnections(0);
    setServiceCostQuantities(getInitialServiceCostQuantities());
    setIncludeTravelCosts(true);
    travelPostcodeManuallyEditedRef.current = false;
    setTravelPostcodePrefix(normalizePostcodePrefix(relation.postcode ?? ""));
    setDealContactName("");
    setContactPersonStatus("Primaire contactpersoon wordt opgehaald...");
    setLoadingContactPerson(true);
    setOfferGuidance("");

    try {
      const [assetsResult, relationResult] = await Promise.allSettled([
        fetch(`/api/smart-trade/assets/by-relation?relationId=${encodeURIComponent(relation.id)}`)
          .then(async (response) => ({ response, json: await response.json() })),
        fetch(`/api/smart-trade/relations/${encodeURIComponent(relation.id)}`)
          .then(async (response) => {
            const json = await response.json() as RelationDetailResponse & { error?: string };
            if (!response.ok) throw new Error(json.error ?? "Relatiegegevens ophalen mislukt.");
            return json;
          }),
      ]);

      if (relationResult.status === "fulfilled") {
        const relationDetails = relationResult.value;
        const primaryContactName = typeof relationDetails.primaryContact?.name === "string"
          ? relationDetails.primaryContact.name.trim()
          : "";
        const relationPostcode = typeof relationDetails.relation?.postcode === "string"
          ? relationDetails.relation.postcode
          : null;

        setDealContactName(primaryContactName);
        setContactPersonStatus(
          primaryContactName
            ? ""
            : relationDetails.primaryContactError
              ? "Primaire contactpersoon kon niet worden opgehaald. Vul de naam voor deze deal handmatig in."
              : "Geen primaire contactpersoon gevonden. Vul de naam voor deze deal handmatig in.",
        );

        if (relationPostcode && !travelPostcodeManuallyEditedRef.current) {
          setTravelPostcodePrefix(normalizePostcodePrefix(relationPostcode));
        }
      } else {
        setContactPersonStatus("Primaire contactpersoon kon niet worden opgehaald. Vul de naam voor deze deal handmatig in.");
      }

      if (assetsResult.status === "rejected") throw assetsResult.reason;
      const { response, json } = assetsResult.value;

      if (!response.ok) {
        setAssetStatus(json.error ?? "Assets ophalen mislukt.");
        return;
      }

      const nextAssets: AssetRecord[] = json.assets ?? [];
      const nextVisibleAssets = getVisibleAssets(nextAssets);
      setAssets(nextAssets);
      setSelectedModuleKeys(applyModuleDependencies(getModuleKeysFromAssets(nextVisibleAssets, modules)));
      setSelectedCustomerPortalOptionKeys(getCustomerPortalKeysFromAssets(nextVisibleAssets, pricingConfig.customerPortalOptions));

      if (nextAssets.length === 0) setAssetStatus(`Geen assets gevonden voor ${relation.name}.`);
    } catch (error) {
      setAssetStatus(error instanceof Error ? error.message : "Assets ophalen mislukt.");
    } finally {
      setLoadingAssets(false);
      setLoadingContactPerson(false);
    }
  }

  function renderTransferActionPanel() {
    return (
      <section className={`card panel ${styles.transferPanel}`}>
        <div className={styles.transferPanelTop}>
          <div>
            <div className="eyebrow">Deals</div>
            <h2 className="headline">Uitbreidingen doorzetten</h2>
            <p className="subtext">{transferHint}</p>
          </div>

          <div className="brand-actions">
            <StatusPill tone={assetDealLines.length > 0 ? "success" : "warning"}>
              {assetDealLines.length} regels
            </StatusPill>
            <button
              type="button"
              className="primary-button"
              disabled={transferBusy}
              onClick={() => void handleSendExpansionsToDeals()}
            >
              <FileText size={16} />
              {transferBusy ? "Deal wordt gemaakt..." : "Maak deal van uitbreidingen"}
            </button>
          </div>
        </div>

        {assetDealLines.length > 0 ? (
          <div className={styles.transferPreview}>
            {assetDealLines.slice(0, 4).map((line, index) => (
              <div key={`${line.group}-${line.label}-${index}`}>
                <span>{line.quantity}x {line.label}</span>
                <strong>{formatLineAmount(line)}</strong>
              </div>
            ))}
            {assetDealLines.length > 4 ? (
              <div>
                <span>Extra regels</span>
                <strong>+{assetDealLines.length - 4}</strong>
              </div>
            ) : null}
          </div>
        ) : null}

        {transferStatus ? <div className="save-status">{transferStatus}</div> : null}
      </section>
    );
  }

  return (
    <div className="page-shell">
      <div className="container stack-4">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Assets</div>
            <h1>Assets en upsell-kansen</h1>
            <p>Zoek een debiteur en bekijk Smart Trade assets, Worldline servicekosten en CCV servicekosten.</p>
          </div>
          <div className="brand-actions">
            <StatusPill tone="success">{assetClassTotals.length} assetclass totalen</StatusPill>
            <StatusPill tone="warning">{assets.length} ontvangen assets</StatusPill>
          </div>
        </header>

        {renderTransferActionPanel()}

        <section className={`card panel ${styles.assetsSearchPanel}`}>
          <div className="top-row">
            <div>
              <div className="eyebrow">Stap 1</div>
              <h2 className="headline">Debiteur zoeken</h2>
              <p className="subtext">Zoek op bedrijfsnaam, contactnaam, e-mail of relatienummer.</p>
            </div>
            <div className="icon-badge"><Search size={26} /></div>
          </div>

          <form onSubmit={handleSearchRelations} className={styles.assetSearchForm}>
            <input
              className={`input ${styles.assetSearchInput}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Bijv. Mellaart, Jansen, e-mail of ID..."
              required
            />
            <button type="submit" className={`primary-button ${styles.assetSearchButton}`} disabled={searching}>
              <Search size={16} />
              {searching ? "Zoeken..." : "Zoeken"}
            </button>
          </form>

          {relations.length > 0 ? (
            <div className={styles.relationResults}>
              <div className={styles.relationResultsHeader}>
                <span>Gevonden relaties</span>
                <span>{relations.length} resultaten</span>
              </div>
              <div className={styles.relationResultList}>
                {relations.map((relation) => (
                  <button
                    key={relation.id}
                    type="button"
                    className={`${styles.relationResultCard} ${selectedRelation?.id === relation.id ? styles.selectedResultCard : ""}`}
                    onClick={() => void handleSelectRelation(relation)}
                  >
                    <span className={styles.relationResultIcon}><Building2 size={18} /></span>
                    <span className={styles.relationResultContent}>
                      <strong>{relation.name}</strong>
                      <span className={styles.relationResultMeta}>
                        <span><Hash size={13} />ID {relation.id}</span>
                        {relation.debtorNumber ? <span>Debiteur {relation.debtorNumber}</span> : null}
                        {relation.email ? <span><Mail size={13} />{relation.email}</span> : null}
                      </span>
                    </span>
                    <span className={styles.relationResultAction}>
                      {selectedRelation?.id === relation.id ? "Geselecteerd" : "Selecteer"}
                      <ChevronRight size={16} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {selectedRelation ? (
            <div className={styles.dealContactEditor} aria-busy={loadingContactPerson}>
              <div className={styles.dealContactHeading}>
                <span className={styles.relationResultIcon}><UserRound size={18} /></span>
                <div>
                  <strong>{selectedRelation.name}</strong>
                  <span>ID {selectedRelation.id} · Primaire contactpersoon</span>
                </div>
              </div>

              <label className="input-wrap">
                <span className="input-label">Contactpersoon voor de deal</span>
                <input
                  className="input"
                  type="text"
                  value={dealContactName}
                  onChange={(event) => setDealContactName(event.target.value)}
                  placeholder={loadingContactPerson ? "Contactpersoon ophalen..." : "Vul een contactpersoon in"}
                  disabled={loadingContactPerson}
                />
                <span className={styles.dealContactHint}>
                  Je kunt deze tekst aanpassen. De wijziging wordt alleen bij de deal op sales.troublefree.nl opgeslagen en niet in Smart Trade.
                </span>
              </label>

              {contactPersonStatus ? (
                <div className={`save-status ${styles.assetsStatus}`}>{contactPersonStatus}</div>
              ) : null}
            </div>
          ) : null}

          {searchStatus ? <div className={`save-status ${styles.assetsStatus}`}>{searchStatus}</div> : null}
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Stap 2</div>
              <h2 className="headline">{selectedRelation ? `Assets voor ${selectedRelation.name}` : "Assets"}</h2>
              <p className="subtext">We tonen totalen per assetclass. Bij meerdere Smart Trade pakketten blijft alleen de pakketgroep met het hoogste asset-ID zichtbaar.</p>
            </div>
            <div className="icon-badge"><Boxes size={26} /></div>
          </div>

          {loadingAssets ? (
            <div className="save-status">Assets worden opgehaald...</div>
          ) : !selectedRelation ? (
            <div className="empty-state">Kies eerst een relatie om assets te bekijken.</div>
          ) : assetStatus ? (
            <div className="empty-state">{assetStatus}</div>
          ) : visibleAssets.length === 0 ? (
            <div className="empty-state">Geen relevante assets gevonden voor {selectedRelation.name}.</div>
          ) : (
            <div className={styles.quoteRows}>
              {assetClassTotals.map((assetTotal) => (
                <div key={assetTotal.key} className={styles.quoteRow}>
                  <span>{assetTotal.quantity}x</span>
                  <strong>{assetTotal.label}</strong>
                  <span>assetclass totaal</span>
                  <strong>{formatAssetQuantity(assetTotal.quantity)}</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Stap 3</div>
              <h2 className="headline">Upsell-signalen</h2>
              <p className="subtext">Maak eenvoudige voorstellen op basis van het pakket, bestaande gebruikers en support in de assets.</p>
            </div>
            <div className="icon-badge"><Sparkles size={26} /></div>
          </div>

          {!selectedRelation ? (
            <div className="empty-state">Kies eerst een relatie om een voorstel te maken.</div>
          ) : !selectedPackageName ? (
            <div className="empty-state">Geen Smart Trade pakket gevonden voor deze relatie.</div>
          ) : !selectedPackage ? (
            <div className="empty-state">Geen prijsregel gevonden voor Smart Trade {selectedPackageName}.</div>
          ) : (
            <div className={styles.upsellStack}>
              <div className={styles.upsellPanel}>
                <div className={styles.upsellSummary}>
                  <div>
                    <div className={styles.assetTitle}>Extra gebruiker offerte</div>
                    <div className={styles.assetMeta}>Pakket: Smart Trade {selectedPackage.name}</div>
                  </div>
                  <StatusPill tone={shouldIncludeSupport ? "success" : "warning"}>{shouldIncludeSupport ? "met support" : "zonder support"}</StatusPill>
                </div>

                <label className={styles.upsellUserInput}>
                  <span>Aantal extra gebruikers</span>
                  <NumberStepper ariaLabel="Aantal extra gebruikers" min={0} value={extraUsersToOffer} onChange={(nextValue) => setExtraUsersToOffer(Math.floor(nextValue))} />
                </label>

                <label className={styles.upsellUserInput}>
                  <span>Aantal extra gebruikers chauffeursmodule</span>
                  <NumberStepper ariaLabel="Aantal extra gebruikers chauffeursmodule" min={0} value={chauffeurExtraUsersToOffer} onChange={(nextValue) => setChauffeurExtraUsersToOffer(Math.floor(nextValue))} />
                </label>

                <div className={styles.quoteRows}>
                  <div className={styles.quoteRow}>
                    <span>{safeExtraUsersToOffer}x</span>
                    <strong>Smart Trade {selectedPackage.name} Extra gebruiker</strong>
                    <span>{euro.format(selectedPackage.licenseExtra)} p/m</span>
                    <strong>{euro.format(extraUserLicenseTotal)} p/m</strong>
                  </div>
                  {shouldIncludeSupport ? (
                    <div className={styles.quoteRow}>
                      <span>{safeExtraUsersToOffer}x</span>
                      <strong>Smart Trade {selectedPackage.name} Supportcontract Extra gebruiker</strong>
                      <span>{euro.format(selectedPackage.supportExtra)} p/m</span>
                      <strong>{euro.format(extraUserSupportTotal)} p/m</strong>
                    </div>
                  ) : null}
                  <div className={styles.quoteRow}>
                    <span>{safeChauffeurExtraUsersToOffer}x</span>
                    <strong>Licentie extra gebruiker (chauffeursmodule)</strong>
                    <span>{euro.format(selectedPackage.licenseExtra)} p/m</span>
                    <strong>{euro.format(chauffeurExtraUserLicenseTotal)} p/m</strong>
                  </div>
                  {shouldIncludeSupport ? (
                    <div className={styles.quoteRow}>
                      <span>{safeChauffeurExtraUsersToOffer}x</span>
                      <strong>Supportcontract extra gebruiker (chauffeursmodule)</strong>
                      <span>{euro.format(selectedPackage.supportExtra)} p/m</span>
                      <strong>{euro.format(chauffeurExtraUserSupportTotal)} p/m</strong>
                    </div>
                  ) : null}
                </div>
                <div className={styles.quoteTotal}><span>Maandelijkse uitbreiding</span><strong>{euro.format(upsellMonthlyTotal)} p/m</strong></div>
              </div>

              {!shouldIncludeSupport ? (
                <div className={`${styles.upsellPanel} ${styles.supportOfferPanel}`}>
                  <div className={styles.upsellSummary}>
                    <div>
                      <div className={styles.assetTitle}>Supportcontract toevoegen</div>
                      <div className={styles.assetMeta}>Gebaseerd op Smart Trade {selectedPackage.name} en {formatUserCount(existingUserCount)}.</div>
                    </div>
                    <StatusPill tone={includeMissingSupportOffer ? "success" : "warning"}>{includeMissingSupportOffer ? "geselecteerd" : "niet geselecteerd"}</StatusPill>
                  </div>
                  <label className={`${styles.moduleOption} ${includeMissingSupportOffer ? styles.moduleOptionSelected : ""}`}>
                    <input type="checkbox" checked={includeMissingSupportOffer} onChange={(event) => setIncludeMissingSupportOffer(event.target.checked)} />
                    <span><strong>Supportcontract toevoegen</strong><small>Geen aantal veld nodig</small></span>
                    {includeMissingSupportOffer ? <em>geselecteerd</em> : null}
                  </label>
                  <div className={styles.quoteRows}>
                    {includeMissingSupportOffer ? (
                      <>
                        <div className={styles.quoteRow}>
                          <span>1x</span>
                          <strong>Smart Trade {selectedPackage.name} Supportcontract</strong>
                          <span>{euro.format(selectedPackage.supportFirst)} p/m</span>
                          <strong>{euro.format(missingSupportBaseTotal)} p/m</strong>
                        </div>
                        {existingExtraUserCount > 0 ? (
                          <div className={styles.quoteRow}>
                            <span>{existingExtraUserCount}x</span>
                            <strong>Smart Trade {selectedPackage.name} Supportcontract Extra gebruiker</strong>
                            <span>{euro.format(selectedPackage.supportExtra)} p/m</span>
                            <strong>{euro.format(missingSupportExtraTotal)} p/m</strong>
                          </div>
                        ) : null}
                      </>
                    ) : <div className="empty-state">Vink supportcontract aan om dit mee te nemen.</div>}
                  </div>
                  <div className={styles.quoteTotal}><span>Support uitbreiding</span><strong>{euro.format(missingSupportMonthlyTotal)} p/m</strong></div>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Stap 4</div>
              <h2 className="headline">Modules</h2>
              <p className="subtext">Selecteer de gewenste module-eindstand. De offerte bepaalt daarna of het huidige pakket blijft passen.</p>
            </div>
            <div className="icon-badge"><Boxes size={26} /></div>
          </div>

          {!selectedRelation ? (
            <div className="empty-state">Kies eerst een relatie om modules te adviseren.</div>
          ) : !selectedPackageName ? (
            <div className="empty-state">Geen Smart Trade pakket gevonden voor deze relatie.</div>
          ) : !selectedPackage || !targetPackage ? (
            <div className="empty-state">Geen pakketadvies beschikbaar.</div>
          ) : (
            <div className={styles.modulePlanner}>
              <div className={styles.moduleSteps}>
                <div><span>1</span><strong>Alle modules</strong><small>{modules.length} opties</small></div>
                <div><span>2</span><strong>Selectie</strong><small>{selectedModules.length} geselecteerd</small></div>
                <div><span>3</span><strong>Pakketadvies</strong><small>{hasPackageChange ? `${selectedPackage.name} naar ${targetPackage.name}` : selectedPackage.name}</small></div>
                <div><span>4</span><strong>Implementatie</strong><small>{euro.format(moduleImplementationTotal)}</small></div>
              </div>

              <div className={styles.moduleGrid}>
                {modules.map((moduleConfig) => {
                  const selected = selectedModuleKeys.includes(moduleConfig.key);
                  const current = currentModuleKeys.includes(moduleConfig.key);
                  const moduleRuleNotes = getModuleRuleNotes(moduleConfig, modules);
                  return (
                    <label key={moduleConfig.key} className={`${styles.moduleOption} ${selected ? styles.moduleOptionSelected : ""}`}>
                      <input type="checkbox" checked={selected} onChange={() => handleToggleModule(moduleConfig.key)} />
                      <span>
                        <strong>{moduleConfig.name}</strong>
                        <small>{moduleConfig.monthlyPrice > 0 ? `${euro.format(moduleConfig.monthlyPrice)} p/m` : "Gratis module"}</small>
                        {moduleRuleNotes.map((note) => <small key={note}>{note}</small>)}
                      </span>
                      {current ? <em>huidig</em> : null}
                    </label>
                  );
                })}
              </div>

              <div className={styles.moduleAdvice}>
                <div className={styles.moduleAdviceHeader}>
                  <div>
                    <div className={styles.assetTitle}>Module-offerte</div>
                    <div className={styles.assetMeta}>Huidig: Smart Trade {selectedPackage.name}. Advies: Smart Trade {targetPackage.name}.</div>
                  </div>
                  <div className={styles.moduleAdviceActions}>
                    <StatusPill tone={hasPackageChange ? "warning" : "success"}>{hasPackageChange ? packageChangeDirection : "blijft binnen pakket"}</StatusPill>
                    {hasModuleSelectionChanges ? <button type="button" className={styles.resetModulesButton} onClick={handleResetModules}>Reset selectie</button> : null}
                  </div>
                </div>

                <div className={styles.moduleSelectionSummary}>
                  <div><span>Toevoegen</span><strong>{formatModuleList(addedModules)}</strong></div>
                  <div><span>Ruilen/verwijderen</span><strong>{formatModuleList(removedModules)}</strong></div>
                </div>

                {hasPackageChange ? (
                  <div className={styles.quoteRows}>
                    <div className={styles.quoteRow}><span>1x</span><strong>Smart Trade {targetPackage.name} licentie</strong><span>{euro.format(targetPackage.licenseFirst)} p/m</span><strong>{euro.format(targetPackage.licenseFirst)} p/m</strong></div>
                    {existingExtraUserCount > 0 ? <div className={styles.quoteRow}><span>{existingExtraUserCount}x</span><strong>Smart Trade {targetPackage.name} licentie extra gebruiker</strong><span>{euro.format(targetPackage.licenseExtra)} p/m</span><strong>{euro.format(existingExtraUserCount * targetPackage.licenseExtra)} p/m</strong></div> : null}
                    {shouldIncludeSupport ? <div className={styles.quoteRow}><span>{existingUserCount}x</span><strong>Supportcontract Smart Trade {targetPackage.name}</strong><span>incl. extra gebruikers</span><strong>{euro.format(targetSupportMonthly)} p/m</strong></div> : null}
                    <div className={styles.quoteRow}><span>{selectedPackageModuleCount}x</span><strong>Modules binnen pakketadvies</strong><span>{targetPackage.includedModules} inbegrepen</span><strong>{euro.format(targetModuleMonthly)} p/m</strong></div>
                    {renderModuleImplementationRows()}
                    <div className={styles.quoteTotal}><span>Implementatie modules</span><strong>{euro.format(moduleImplementationTotal)}</strong></div>
                    <div className={styles.quoteTotal}><span>Huidige maandprijs</span><strong>{euro.format(currentRecurringMonthly)} p/m</strong></div>
                    <div className={styles.quoteTotal}><span>Nieuwe maandprijs</span><strong>{euro.format(targetRecurringMonthly)} p/m</strong></div>
                  </div>
                ) : (
                  <div className={styles.quoteRows}>
                    {addedModules.map((moduleConfig) => <div key={`add-${moduleConfig.key}`} className={styles.quoteRow}><span>+</span><strong>{moduleConfig.name}</strong><span>{moduleConfig.monthlyPrice > 0 ? `${euro.format(moduleConfig.monthlyPrice)} p/m` : "gratis"}</span><strong>{moduleConfig.monthlyPrice > 0 ? `${euro.format(moduleConfig.monthlyPrice)} p/m` : euro.format(0)}</strong></div>)}
                    {removedModules.map((moduleConfig) => <div key={`remove-${moduleConfig.key}`} className={styles.quoteRow}><span>-</span><strong>{moduleConfig.name}</strong><span>uit selectie</span><strong>{moduleConfig.monthlyPrice > 0 ? `-${euro.format(moduleConfig.monthlyPrice)} p/m` : euro.format(0)}</strong></div>)}
                    {!hasModuleSelectionChanges ? <div className="empty-state">Selecteer een extra module of ruil een bestaande module.</div> : null}
                    <div className={styles.quoteRow}><span>=</span><strong>Modulebedrag verschil binnen {selectedPackage.name}</strong><span>{selectedPackage.includedModules} pakketmodules inbegrepen</span><strong>{euro.format(moduleMonthlyDelta)} p/m</strong></div>
                    {renderModuleImplementationRows()}
                    <div className={styles.quoteTotal}><span>Offerte modulewijziging</span><strong>{euro.format(moduleMonthlyDelta)} p/m</strong></div>
                    <div className={styles.quoteTotal}><span>Implementatie modules</span><strong>{euro.format(moduleImplementationTotal)}</strong></div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Stap 5</div>
              <h2 className="headline">Klantenportaal</h2>
              <p className="subtext">Selecteer de gewenste klantenportaal-onderdelen voor de offerte.</p>
            </div>
            <div className="icon-badge"><Boxes size={26} /></div>
          </div>

          {!selectedRelation ? (
            <div className="empty-state">Kies eerst een relatie om een klantenportaal-offerte te maken.</div>
          ) : !selectedPackageName ? (
            <div className="empty-state">Geen Smart Trade pakket gevonden voor deze relatie.</div>
          ) : (
            <div className={styles.upsellStack}>
              <div className={styles.moduleGrid}>
                {pricingConfig.customerPortalOptions.map((option) => {
                  const selected = selectedCustomerPortalOptionKeys.includes(option.key);
                  const current = currentCustomerPortalKeys.includes(option.key);
                  return (
                    <label key={option.key} className={`${styles.moduleOption} ${selected ? styles.moduleOptionSelected : ""}`}>
                      <input type="checkbox" checked={selected} onChange={() => handleToggleCustomerPortalOption(option.key)} />
                      <span><strong>{option.name}</strong><small>{euro.format(option.monthlyPrice)} p/m</small></span>
                      {current ? <em>huidig</em> : selected ? <em>geselecteerd</em> : null}
                    </label>
                  );
                })}
              </div>

              <div className={styles.upsellPanel}>
                <div className={styles.upsellSummary}>
                  <div>
                    <div className={styles.assetTitle}>Klantenportaal offerte</div>
                    <div className={styles.assetMeta}>Pakket: Smart Trade {selectedPackageName}</div>
                  </div>
                  <StatusPill tone={selectedCustomerPortalOptions.length > 0 ? "success" : "warning"}>
                    {selectedCustomerPortalOptions.length > 0 ? `${selectedCustomerPortalOptions.length} geselecteerd` : "nog niets geselecteerd"}
                  </StatusPill>
                </div>
                <div className={styles.quoteRows}>
                  {selectedCustomerPortalOptions.length > 0 ? selectedCustomerPortalOptions.map((option) => (
                    <div key={`portal-${option.key}`} className={styles.quoteRow}>
                      <span>1x</span><strong>Klantenportaal - {option.name}</strong><span>{euro.format(option.monthlyPrice)} p/m</span><strong>{euro.format(option.monthlyPrice)} p/m</strong>
                    </div>
                  )) : <div className="empty-state">Selecteer een klantenportaal-onderdeel.</div>}
                </div>
                <div className={styles.quoteTotal}><span>Klantenportaal uitbreiding</span><strong>{euro.format(customerPortalMonthlyTotal)} p/m</strong></div>
              </div>
            </div>
          )}
        </section>

        <section className="card panel">
          <div className="top-row"><div><div className="eyebrow">Stap 6</div><h2 className="headline">Smart Connect</h2><p className="subtext">Het aantal connecties wordt uit de Smart Connect tekst gehaald. Offerte-aantal start op 0.</p></div><div className="icon-badge"><Boxes size={26} /></div></div>
          {!selectedRelation ? <div className="empty-state">Kies eerst een relatie om een Smart Connect-offerte te maken.</div> : (
            <div className={styles.upsellPanel}>
              <div className={styles.upsellSummary}><div><div className={styles.assetTitle}>Smart Connect offerte</div><div className={styles.assetMeta}>{selectedPackageName ? `Pakket: Smart Trade ${selectedPackageName}` : "Geen Smart Trade pakket gevonden"}</div></div><StatusPill tone={existingSmartConnectTotal > 0 ? "success" : "warning"}>{existingSmartConnectTotal > 0 ? `${formatConnectionCount(existingSmartConnectTotal)} huidig` : "geen huidige connecties"}</StatusPill></div>
              <div className={styles.moduleSelectionSummary}><div><span>Huidige Smart Connect assets</span><strong>{formatAssetQuantity(existingSmartConnectAssetTotal)}</strong><span>{formatConnectionCount(existingSmartConnectTotal)} totaal</span></div><div><span>Offerte</span><strong>{formatConnectionCount(smartConnectPricing.connectionCount)}</strong><span>Extra aantal start op 0</span></div></div>
              <label className={styles.upsellUserInput}><span>Extra aantal connecties voor offerte</span><NumberStepper ariaLabel="Extra aantal connecties voor offerte" min={0} value={smartConnectConnections} onChange={(nextValue) => setSmartConnectConnections(Math.floor(nextValue))} /></label>
              <div className={styles.quoteRows}>{existingSmartConnectRows.length > 0 ? existingSmartConnectRows.map((row) => <div key={`existing-smart-connect-${row.key}`} className={styles.quoteRow}><span>{row.quantity}x</span><strong>Huidig: Smart Connect {row.connections}</strong><span>{formatConnectionCount(row.connections)} per stuk</span><strong>{formatConnectionCount(row.totalConnections)}</strong></div>) : <div className="empty-state">Geen bestaande Smart Connect assets gevonden.</div>}</div>
              <div className={styles.quoteTotal}><span>Bestaande Smart Connect connecties</span><strong>{formatConnectionCount(existingSmartConnectTotal)}</strong></div>
              <div className={styles.quoteRows}>{smartConnectPricing.baseTier ? <><div className={styles.quoteRow}><span>1x</span><strong>Smart Connect - {formatConnectionCount(smartConnectPricing.baseTier.connections)}</strong><span>staffel voor {formatConnectionCount(smartConnectPricing.connectionCount)}</span><strong>{euro.format(smartConnectPricing.baseTier.monthlyPrice)} p/m</strong></div>{smartConnectPricing.extraConnections > 0 ? <div className={styles.quoteRow}><span>{smartConnectPricing.extraConnections}x</span><strong>Smart Connect extra connectie</strong><span>{euro.format(pricingConfig.smartConnectExtraConnectionPrice)} p/m vanaf 11e</span><strong>{euro.format(smartConnectPricing.extraMonthly)} p/m</strong></div> : null}</> : <div className="empty-state">Vul een extra aantal connecties in voor de offerte.</div>}</div>
              <div className={styles.quoteTotal}><span>Smart Connect offerte</span><strong>{euro.format(smartConnectPricing.monthlyTotal)} p/m</strong></div>
            </div>
          )}
        </section>

        <section className="card panel">
          <div className="top-row"><div><div className="eyebrow">Stap 7</div><h2 className="headline">Servicekosten</h2><p className="subtext">CCV en Worldline worden herkend op assetclass. Offerte-aantallen starten op 0.</p></div><div className="icon-badge"><Boxes size={26} /></div></div>
          {!selectedRelation ? <div className="empty-state">Kies eerst een relatie om servicekosten te bekijken.</div> : (
            <div className={styles.upsellPanel}>
              <div className={styles.upsellSummary}><div><div className={styles.assetTitle}>Servicekosten offerte</div><div className={styles.assetMeta}>{serviceCostPriceLabel}</div></div><StatusPill tone={existingServiceCostTotal > 0 ? "success" : "warning"}>{existingServiceCostTotal > 0 ? `${existingServiceCostTotal} huidig` : "geen huidige servicekosten"}</StatusPill></div>
              <div className={styles.moduleSelectionSummary}>{serviceCostRows.map((option) => <div key={option.key}><span>{option.name}</span><strong>{option.existingQuantity} huidig</strong><span>{formatAssetClassIds(option.assetClassIds)}</span><label className={styles.upsellUserInput}><span>Extra aantal voor offerte</span><NumberStepper ariaLabel={`Extra aantal voor offerte ${option.name}`} min={0} value={option.offerQuantity} onChange={(nextValue) => handleServiceCostQuantityChange(option.key, String(Math.floor(nextValue)))} /></label></div>)}</div>
              <div className={styles.quoteRows}>{existingServiceCostRows.length > 0 ? existingServiceCostRows.map((option) => <div key={`existing-service-${option.key}`} className={styles.quoteRow}><span>{option.existingQuantity}x</span><strong>Huidig: {option.name}</strong><span>{euro.format(option.annualPrice)} p/j</span><strong>{euro.format(option.existingAnnualTotal)} p/j</strong></div>) : <div className="empty-state">Geen bestaande CCV of Worldline servicekosten gevonden.</div>}</div>
              <div className={styles.quoteTotal}><span>Bestaande servicekosten per jaar</span><strong>{euro.format(existingServiceCostAnnualTotal)} p/j</strong></div>
              <div className={styles.quoteRows}>{selectedServiceCostRows.length > 0 ? selectedServiceCostRows.map((option) => <div key={`service-${option.key}`} className={styles.quoteRow}><span>{option.offerQuantity}x</span><strong>{option.name}</strong><span>{euro.format(option.annualPrice)} p/j</span><strong>{euro.format(option.offerAnnualTotal)} p/j</strong></div>) : <div className="empty-state">Vul een extra aantal in voor CCV of Worldline.</div>}</div>
              <div className={styles.quoteTotal}><span>Servicekosten offerte per jaar</span><strong>{euro.format(serviceCostAnnualTotal)} p/j</strong></div>
            </div>
          )}
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Offerte</div>
              <h2 className="headline">Reiskosten</h2>
              <p className="subtext">Bereken de reiskosten voor de implementatie op basis van de eerste twee cijfers van de postcode.</p>
            </div>
            <div className="icon-badge"><MapPin size={26} /></div>
          </div>

          {!selectedRelation ? (
            <div className="empty-state">Kies eerst een relatie om reiskosten te berekenen.</div>
          ) : (
            <>
              <div className="calculator-module-grid travel-toggle-grid">
                <label className={`calculator-module-card travel-toggle-card ${effectiveIncludeTravelCosts ? "active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={effectiveIncludeTravelCosts}
                    disabled={!canCalculateTravelCosts}
                    onChange={(event) => setIncludeTravelCosts(event.target.checked)}
                  />
                  <span className="calculator-module-main">
                    <strong>{canCalculateTravelCosts ? "Prijs implementatie inclusief reiskosten" : "Geen reiskosten voor geselecteerde modules"}</strong>
                    <span>
                      {canCalculateTravelCosts
                        ? `${formatDays(travelImplementationDays)} x ${euro.format(travelCostQuote?.pricePerDay ?? 0)}`
                        : "Deze modules worden op afstand ingesteld"}
                    </span>
                  </span>
                  <span className="calculator-module-state">
                    {canCalculateTravelCosts ? (effectiveIncludeTravelCosts ? "Aan" : "Uit") : "Niet nodig"}
                  </span>
                </label>
              </div>

              <div className="travel-cost-layout">
                <label className="input-wrap travel-postcode-field">
                  <span className="input-label">Postcode eerste 2 cijfers</span>
                  <input
                    className="input"
                    inputMode="numeric"
                    maxLength={2}
                    value={travelPostcodePrefix}
                    onChange={(event) => {
                      travelPostcodeManuallyEditedRef.current = true;
                      setTravelPostcodePrefix(normalizePostcodePrefix(event.target.value));
                    }}
                    placeholder="Bijv. 22"
                  />
                </label>

                <div className="input-wrap travel-price-summary">
                  <span className="input-label">Prijs</span>
                  <div className="summary-list">
                    <div>
                      <span>Regio</span>
                      <strong>{travelCostQuote?.postcodeRow ? travelCostQuote.postcodeRow.region : "-"}</strong>
                    </div>
                    <div>
                      <span>Omschrijving</span>
                      <strong>{travelCostQuote?.postcodeRow?.description ?? "Geen postcode gekozen"}</strong>
                    </div>
                    <div>
                      <span>Prijs per dag</span>
                      <strong>{euro.format(travelCostQuote?.pricePerDay ?? 0)}</strong>
                    </div>
                    <div className="total-row">
                      <span>Reiskosten</span>
                      <strong>{euro.format(travelCostTotal)}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Offerte</div>
              <h2 className="headline">Toelichting offerte</h2>
              <p className="subtext">Schrijf hier de begeleidende tekst die de klant op de uitbreidingen-offerte leest.</p>
            </div>
            <div className="icon-badge"><FileText size={26} /></div>
          </div>

          {!selectedRelation ? (
            <div className="empty-state">Kies eerst een relatie om een toelichting voor de offerte te schrijven.</div>
          ) : (
            <label className="input-wrap">
              <span className="input-label">Begeleidende tekst</span>
              <textarea
                className="textarea"
                value={offerGuidance}
                onChange={(event) => setOfferGuidance(event.target.value)}
                placeholder="Bijvoorbeeld: Met deze uitbreiding kunnen jullie..."
                rows={6}
              />
            </label>
          )}
        </section>

        {renderTransferActionPanel()}
      </div>
    </div>
  );
}
