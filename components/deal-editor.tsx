"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Boxes,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  ClipboardCopy,
  CloudUpload,
  Code2,
  Download,
  ExternalLink,
  FileText,
  LifeBuoy,
  Link2,
  LoaderCircle,
  Mail,
  MapPin,
  Package,
  RefreshCw,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { createQuotePdfFile, exportQuotePdf } from "@/lib/pdf";
import { getAssetExpansionTotals } from "@/lib/asset-expansions";
import { exportCustomerIntakePdf } from "@/lib/customer-intake-pdf";
import {
  customerIntakeStatusLabel,
  splitCustomerContactName,
  type CustomerIntakeSummary,
} from "@/lib/customer-intake";
import type { DealApprovalStatus, DealApprovalSummary } from "@/lib/deal-approval";
import { getDealWithFallback, updateDealWithFallback } from "@/lib/deal-storage";
import {
  normalizeImplementationProgress,
  type ImplementationProgressKey,
  type ImplementationRecord,
} from "@/lib/implementations";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { calculatePricing, euro, getMinimumPackageForPaidModules, getPaidSelectedModuleCount, MODULES, type ModuleConfig } from "@/lib/pricing";
import { getTravelCostQuoteForPostcode, normalizePostcodePrefix, type SmartConnectPriceTier } from "@/lib/price-config";
import { QUOTE_LAYOUTS, normalizeQuoteLayout, type QuoteLayoutKey } from "@/lib/quote-layouts";
import {
  type AssetExpansionLine,
  type AssetExpansionSummary,
  type DealCalculatorInputs,
  type DealRecord,
  type ProfileRecord,
  getProfileDisplayName,
  getSupabaseClient,
  getUserDisplayName,
} from "@/lib/supabase";
import { NumberStepper } from "@/components/number-stepper";
import DevelopmentLinesEditor from "@/components/development-lines-editor";
import ExtraUserOffer from "@/components/extra-user-offer";
import PriceBreakdown from "@/components/price-breakdown";
import { NumberInput, StatCard, StatusPill, TextArea, TextInput } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { usePricingConfig } from "@/components/pricing-provider";
import {
  getDevelopmentTotal,
  normalizeDevelopmentLines,
  type DevelopmentLine,
} from "@/lib/development-lines";

function toQuantities(dealModules: DealRecord["modules"] | undefined, modules: ModuleConfig[] = MODULES): Record<string, number> {
  const base = Object.fromEntries(modules.map((module) => [module.key, 0]));
  if (!Array.isArray(dealModules)) return base;
  for (const item of dealModules as Array<{ key?: string; qty?: number }>) {
    const moduleKey = item?.key === "planningsapp" ? "hoveniersapp" : item?.key;
    if (moduleKey && Object.prototype.hasOwnProperty.call(base, moduleKey)) {
      base[moduleKey] = Number(item.qty || 0);
    }
  }
  return base;
}

function normalizeInputs(
  deal: DealRecord,
  modules: ModuleConfig[],
  defaultDevelopmentHourlyRate: number,
): DealCalculatorInputs {
  const customerPortalOptionKeys = deal.calculator_inputs?.customerPortalOptionKeys;

  return {
    extraUsers: Math.max(0, Number(deal.calculator_inputs?.extraUsers ?? Number(deal.total_users || 1) - 1)),
    chauffeurExtraUsers: Math.max(0, Number(deal.calculator_inputs?.chauffeurExtraUsers ?? 0)),
    planningAppUsers: Math.max(0, Number(deal.calculator_inputs?.planningAppUsers ?? 0)),
    selectedPackage: String(deal.calculator_inputs?.selectedPackage || deal.package_key || "enterprise"),
    manualImplementationAdjustment: Number(deal.calculator_inputs?.manualImplementationAdjustment ?? deal.manual_implementation_adjustment ?? 0),
    includeVat: Boolean(deal.calculator_inputs?.includeVat ?? deal.include_vat ?? false),
    includeSupport: deal.calculator_inputs?.includeSupport ?? true,
    includeTravelCosts: deal.calculator_inputs?.includeTravelCosts ?? true,
    travelPostcodePrefix: normalizePostcodePrefix(deal.calculator_inputs?.travelPostcodePrefix ?? ""),
    customerPortalOptionKeys: Array.isArray(customerPortalOptionKeys)
      ? customerPortalOptionKeys.filter((key): key is string => typeof key === "string")
      : [],
    smartConnectConnections: Math.max(0, Number(deal.calculator_inputs?.smartConnectConnections ?? 0)),
    developmentLines: normalizeDevelopmentLines(deal.calculator_inputs?.developmentLines),
    developmentHourlyRate: Math.max(
      0,
      Number(deal.calculator_inputs?.developmentHourlyRate) || defaultDevelopmentHourlyRate,
    ),
    quantities: deal.calculator_inputs?.quantities ?? toQuantities(deal.modules, modules),
    quoteLayout: normalizeQuoteLayout(deal.calculator_inputs?.quoteLayout),
    assetsExpansion: deal.calculator_inputs?.assetsExpansion ?? null,
  };
}

function formatExpansionAmount(line: AssetExpansionLine) {
  const suffix = line.cadence === "monthly" ? " p/m" : line.cadence === "annual" ? " p/j" : "";
  return `${euro.format(line.amount)}${suffix}`;
}

function getExpansionCadenceLabel(line: AssetExpansionLine) {
  if (line.cadence === "monthly") return "Per maand";
  if (line.cadence === "annual") return "Per jaar";
  return "Eenmalig";
}

function formatConnectionCount(count: number) {
  return count === 1 ? "1 connectie" : `${count} connecties`;
}

function formatDays(days: number) {
  const roundedDays = Math.round(days * 100) / 100;
  const label = roundedDays === 1 ? "dag" : "dagen";
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(roundedDays)} ${label}`;
}

function formatApprovalDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

type DealAssetOverview = {
  ready: boolean;
  prerequisiteErrors: string[];
  warnings: string[];
  total: number;
  createdCount: number;
  pendingCount: number;
  missingCount: number;
  relationId: number | null;
  administrationName: string | null;
  plannedGoLiveDate: string | null;
  items: Array<{
    key: string;
    assetClassId: number;
    name: string;
    source: string;
    status: "missing" | "pending" | "created";
    smartTradeAssetId: number | null;
    createdAt: string | null;
  }>;
};

type ImplementationOrderResponse = {
  error?: string;
  orderId?: string | null;
  orderCreatedAt?: string | null;
  relationId?: number;
};

async function loadDealAssetOverview(dealId: string) {
  const response = await fetch(`/api/deals/${encodeURIComponent(dealId)}/assets`, {
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({})) as {
    overview?: DealAssetOverview;
    error?: string;
  };

  return { response, json };
}

function getSmartConnectPricing(
  connectionCount: number,
  tiers: SmartConnectPriceTier[],
  extraConnectionPrice: number,
) {
  const safeConnectionCount = Math.max(0, Math.floor(connectionCount));

  if (safeConnectionCount === 0) {
    return {
      connectionCount: 0,
      baseTier: null,
      extraConnections: 0,
      extraMonthly: 0,
      monthlyTotal: 0,
    };
  }

  const baseTier = tiers.find((tier) => safeConnectionCount <= tier.connections)
    ?? tiers[tiers.length - 1];
  const extraConnections = Math.max(0, safeConnectionCount - tiers[tiers.length - 1].connections);
  const extraMonthly = extraConnections * extraConnectionPrice;

  return {
    connectionCount: safeConnectionCount,
    baseTier,
    extraConnections,
    extraMonthly,
    monthlyTotal: baseTier.monthlyPrice + extraMonthly,
  };
}

function showOutlookPopupStatus(
  outlookWindow: Window | null,
  title: string,
  message: string,
  tone: "loading" | "error" = "loading",
) {
  if (!outlookWindow || outlookWindow.closed) return;

  try {
    const document = outlookWindow.document;
    document.title = title;
    document.documentElement.lang = "nl";
    document.body.replaceChildren();
    Object.assign(document.body.style, {
      margin: "0",
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      padding: "24px",
      boxSizing: "border-box",
      background: "#0b1425",
      color: "#eef4ff",
      fontFamily: "Calibri, Arial, sans-serif",
    });

    const panel = document.createElement("main");
    Object.assign(panel.style, {
      width: "min(100%, 520px)",
      padding: "28px",
      border: `1px solid ${tone === "error" ? "#7f3540" : "#274a7f"}`,
      borderRadius: "8px",
      background: "#131f34",
      boxSizing: "border-box",
    });

    const heading = document.createElement("h1");
    heading.textContent = title;
    Object.assign(heading.style, {
      margin: "0 0 12px",
      fontSize: "24px",
      lineHeight: "1.2",
    });

    const description = document.createElement("p");
    description.textContent = message;
    Object.assign(description.style, {
      margin: "0",
      color: tone === "error" ? "#fecaca" : "#b9c8df",
      fontSize: "16px",
      lineHeight: "1.5",
    });

    panel.append(heading, description);
    document.body.append(panel);
  } catch {
    // Het tabblad kan al naar Microsoft zijn genavigeerd.
  }
}

function navigateOutlookPopup(outlookWindow: Window | null, url: string) {
  if (!outlookWindow || outlookWindow.closed) return false;

  try {
    outlookWindow.location.replace(url);
    return true;
  } catch {
    return false;
  }
}

export default function DealEditor({ dealId, focusMode = false }: { dealId: string; focusMode?: boolean }) {
  const { user, profile, role } = useAuth();
  const { pricingConfig } = usePricingConfig();
  const modules = pricingConfig.modules;
  const packages = useMemo(
    () => pricingConfig.packages.filter((packageConfig) => packageConfig.key !== "lite"),
    [pricingConfig.packages],
  );
  const supabase = getSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [dealOwnerId, setDealOwnerId] = useState<string | null>(null);
  const [salesConsultants, setSalesConsultants] = useState<ProfileRecord[]>([]);
  const [salesConsultantsLoaded, setSalesConsultantsLoaded] = useState(false);
  const [salesConsultantBusy, setSalesConsultantBusy] = useState(false);
  const [archivedAt, setArchivedAt] = useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [implementation, setImplementation] = useState<ImplementationRecord | null>(null);
  const [implementationBusy, setImplementationBusy] = useState(false);
  const [customerIntake, setCustomerIntake] = useState<CustomerIntakeSummary | null>(null);
  const [customerIntakeEmail, setCustomerIntakeEmail] = useState("");
  const [customerIntakeRelationId, setCustomerIntakeRelationId] = useState("");
  const [customerIntakeStatus, setCustomerIntakeStatus] = useState("");
  const [customerIntakeBusy, setCustomerIntakeBusy] = useState(false);
  const [customerOutlookBusy, setCustomerOutlookBusy] = useState(false);
  const [newCustomerOutlookBusy, setNewCustomerOutlookBusy] = useState(false);
  const [implementationOrderBusy, setImplementationOrderBusy] = useState<"preview" | "create" | null>(null);
  const [implementationOrderPreview, setImplementationOrderPreview] = useState<ImplementationOrderResponse | null>(null);
  const [implementationOrderMessage, setImplementationOrderMessage] = useState("");
  const [implementationOrderMessageTone, setImplementationOrderMessageTone] = useState<"info" | "success" | "error">("info");
  const [quoteOutlookBusy, setQuoteOutlookBusy] = useState(false);
  const [quoteOutlookLink, setQuoteOutlookLink] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<DealApprovalStatus | null>(null);
  const [approvalRequestedAt, setApprovalRequestedAt] = useState<string | null>(null);
  const [approvalExpiresAt, setApprovalExpiresAt] = useState<string | null>(null);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [acceptedByName, setAcceptedByName] = useState("");
  const [acceptedByEmail, setAcceptedByEmail] = useState("");
  const [manualApprovalBusy, setManualApprovalBusy] = useState(false);
  const [isNewCustomerDeal, setIsNewCustomerDeal] = useState(false);
  const [assetOverview, setAssetOverview] = useState<DealAssetOverview | null>(null);
  const [assetCreationBusy, setAssetCreationBusy] = useState(false);
  const [assetCreationStatus, setAssetCreationStatus] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [quoteTitle, setQuoteTitle] = useState("Prijsvoorstel Smart Trade");
  const [contactName, setContactName] = useState("");
  const [salesName, setSalesName] = useState("");
  const [notes, setNotes] = useState("");

  const [extraUsers, setExtraUsers] = useState(1);
  const [chauffeurExtraUsers, setChauffeurExtraUsers] = useState(0);
  const [planningAppUsers, setPlanningAppUsers] = useState(0);
  const [selectedPackage, setSelectedPackage] = useState("enterprise");
  const [manualImplementationAdjustment, setManualImplementationAdjustment] = useState(0);
  const includeVat = false;
  const [includeSupport, setIncludeSupport] = useState(true);
  const [includeTravelCosts, setIncludeTravelCosts] = useState(true);
  const [travelPostcodePrefix, setTravelPostcodePrefix] = useState("");
  const [selectedCustomerPortalOptionKeys, setSelectedCustomerPortalOptionKeys] = useState<string[]>([]);
  const [smartConnectConnections, setSmartConnectConnections] = useState(0);
  const [developmentLines, setDevelopmentLines] = useState<DevelopmentLine[]>([]);
  const [developmentHourlyRate, setDevelopmentHourlyRate] = useState(pricingConfig.developmentHourlyRate);
  const [quantities, setQuantities] = useState<Record<string, number>>(Object.fromEntries(modules.map((module) => [module.key, 0])));
  const [quoteLayout, setQuoteLayout] = useState<QuoteLayoutKey>("standard");
  const [assetsExpansion, setAssetsExpansion] = useState<AssetExpansionSummary | null>(null);

  const currentSalesName = useMemo(() => getUserDisplayName(user, profile), [profile, user]);
  const currentSalesEmail = useMemo(() => user?.email ?? profile?.email ?? "", [profile, user]);
  const currentSalesTitle = profile?.job_title ?? "";
  const currentSalesWorkdays = profile?.workdays ?? "";
  const currentSalesPhone = profile?.mobile_phone ?? "";
  const canManageImplementation = isProtectedAdminEmail(user?.email);
  const selectedSalesConsultant = useMemo(
    () => salesConsultants.find((consultant) => consultant.id === dealOwnerId) ?? null,
    [dealOwnerId, salesConsultants],
  );
  const selectedSalesName = getProfileDisplayName(selectedSalesConsultant) || salesName || currentSalesName || "";
  const selectedSalesEmail = selectedSalesConsultant?.email
    || (dealOwnerId === user?.id ? currentSalesEmail : "");
  const selectedSalesTitle = selectedSalesConsultant?.job_title
    || (dealOwnerId === user?.id ? currentSalesTitle : "");
  const selectedSalesWorkdays = selectedSalesConsultant?.workdays
    || (dealOwnerId === user?.id ? currentSalesWorkdays : "");
  const selectedSalesPhone = selectedSalesConsultant?.mobile_phone
    || (dealOwnerId === user?.id ? currentSalesPhone : "");

  useEffect(() => {
    async function loadSalesConsultants() {
      if (!user) return;

      try {
        const response = await fetch("/api/deals/consultants", { cache: "no-store" });
        const json = await response.json().catch(() => ({})) as {
          users?: ProfileRecord[];
          error?: string;
        };
        if (!response.ok) throw new Error(json.error || "Gebruikers laden mislukt.");
        setSalesConsultants(Array.isArray(json.users) ? json.users : []);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Gebruikers laden mislukt.");
      } finally {
        setSalesConsultantsLoaded(true);
      }
    }

    void loadSalesConsultants();
  }, [user]);

  useEffect(() => {
    async function loadDeal() {
      if (!user) {
        setStatus("Je moet ingelogd zijn om deze deal te openen.");
        setLoading(false);
        return;
      }

      const result = await getDealWithFallback(supabase, dealId);
      if (result.error || !result.deal) {
        setStatus(`Deal laden mislukt: ${result.error ?? "Niet gevonden"}`);
        setLoading(false);
        return;
      }

      const deal = result.deal;
      const inputs = normalizeInputs(deal, modules, pricingConfig.developmentHourlyRate);

      setDealOwnerId(deal.user_id || user.id);
      setArchivedAt(deal.archived_at ?? null);
      setApprovalStatus(deal.accepted_at ? "accepted" : deal.approval_requested_at ? "open" : null);
      setApprovalRequestedAt(deal.approval_requested_at ?? null);
      setApprovalExpiresAt(deal.approval_expires_at ?? null);
      setAcceptedAt(deal.accepted_at ?? null);
      setAcceptedByName(deal.accepted_by_name ?? "");
      setAcceptedByEmail(deal.accepted_by_email ?? "");
      setIsNewCustomerDeal(inputs.quoteLayout !== "assets-expansion" && !deal.smart_trade_relation_id);
      setCustomerName(deal.customer_name || "");
      setQuoteTitle(deal.quote_title || "Prijsvoorstel Smart Trade");
      setContactName(deal.contact_name || "");
      setCustomerIntakeRelationId(deal.smart_trade_relation_id
        ? String(deal.smart_trade_relation_id)
        : "");
      setSalesName(deal.user_id === user.id && currentSalesName ? currentSalesName : deal.sales_name || "");
      setNotes(deal.notes || "");
      setExtraUsers(inputs.extraUsers);
      setChauffeurExtraUsers(inputs.chauffeurExtraUsers ?? 0);
      setPlanningAppUsers(inputs.planningAppUsers ?? 0);
      setSelectedPackage(inputs.selectedPackage);
      setManualImplementationAdjustment(inputs.manualImplementationAdjustment);
      setIncludeSupport(inputs.includeSupport ?? true);
      setIncludeTravelCosts(inputs.includeTravelCosts ?? true);
      setTravelPostcodePrefix(inputs.travelPostcodePrefix ?? "");
      setSelectedCustomerPortalOptionKeys(inputs.customerPortalOptionKeys ?? []);
      setSmartConnectConnections(inputs.smartConnectConnections ?? 0);
      setDevelopmentLines(inputs.developmentLines ?? []);
      setDevelopmentHourlyRate(inputs.developmentHourlyRate ?? pricingConfig.developmentHourlyRate);
      setQuantities(inputs.quantities);
      setQuoteLayout(normalizeQuoteLayout(inputs.quoteLayout));
      setAssetsExpansion(inputs.assetsExpansion ?? null);
      setStatus(result.warning ?? "");

      if (inputs.quoteLayout !== "assets-expansion" && supabase) {
        const { data: implementationData } = await supabase
          .from("implementations")
          .select("*")
          .eq("deal_id", dealId)
          .maybeSingle();
        setImplementation((implementationData as ImplementationRecord | null) ?? null);
      } else {
        setImplementation(null);
      }

      if (inputs.quoteLayout !== "assets-expansion") {
        try {
          const intakeResponse = await fetch(
            `/api/customer-intakes?dealId=${encodeURIComponent(dealId)}`,
            { cache: "no-store" },
          );
          const intakeJson = await intakeResponse.json().catch(() => ({})) as {
            intake?: CustomerIntakeSummary | null;
            error?: string;
          };

          if (intakeResponse.ok && intakeJson.intake) {
            setCustomerIntake(intakeJson.intake);
            setIsNewCustomerDeal(true);
            setCustomerIntakeEmail(intakeJson.intake.recipientEmail);
            setCustomerIntakeRelationId(intakeJson.intake.smartTradeRelationId
              ? String(intakeJson.intake.smartTradeRelationId)
              : "");
          } else if (!intakeResponse.ok) {
            setCustomerIntakeStatus(intakeJson.error || "Klantformulier laden mislukt.");
          }
        } catch {
          setCustomerIntakeStatus("Klantformulier laden mislukt.");
        }
      }

      if (inputs.quoteLayout !== "assets-expansion") {
        try {
          const { response, json } = await loadDealAssetOverview(dealId);
          if (response.ok && json.overview) {
            setAssetOverview(json.overview);
          }
        } catch {
          // De deal blijft bruikbaar als het assetoverzicht tijdelijk niet kan laden.
        }
      } else {
        setAssetOverview(null);
        setAssetCreationStatus("");
      }

      setLoading(false);
    }

    void loadDeal();
  }, [currentSalesName, dealId, modules, pricingConfig.developmentHourlyRate, supabase, user]);

  useEffect(() => {
    if (loading || typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("outlook") !== "connected") return;

    setStatus("Outlook is verbonden. Klik nogmaals op 'Klaarzetten in Outlook' om het concept te maken.");
    url.searchParams.delete("outlook");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [loading]);

  const smartTradeExtraUsers = extraUsers + chauffeurExtraUsers;
  const totalUsers = smartTradeExtraUsers + 1;
  const results = useMemo(
    () => calculatePricing({ extraUsers: smartTradeExtraUsers, manualImplementationAdjustment, includeVat: false, quantities }, pricingConfig),
    [manualImplementationAdjustment, pricingConfig, quantities, smartTradeExtraUsers],
  );
  const paidModuleCount = getPaidSelectedModuleCount(quantities, modules);
  const minimumPackage = getMinimumPackageForPaidModules(paidModuleCount, packages);
  const selectedPackageIndex = packages.findIndex((pkg) => pkg.key === selectedPackage);
  const minimumPackageIndex = packages.findIndex((pkg) => pkg.key === minimumPackage.key);
  const activePackage = packages[Math.max(selectedPackageIndex, minimumPackageIndex, 0)] ?? minimumPackage;
  const activeResult = results.find((pkg) => pkg.key === activePackage.key) ?? results[0];
  const isAssetsExpansionDeal = quoteLayout === "assets-expansion" && Boolean(assetsExpansion?.lines?.length);
  const quotedUserCount = isAssetsExpansionDeal ? smartTradeExtraUsers : totalUsers;
  const expansionTotals = useMemo(() => getAssetExpansionTotals(assetsExpansion?.lines ?? []), [assetsExpansion]);
  const expansionPriceComparison = useMemo(() => {
    const comparison = assetsExpansion?.priceComparison;
    if (!comparison) return null;

    return {
      currentMonthly: Number(comparison.currentMonthly) || 0,
      newMonthly: Number(comparison.newMonthly) || 0,
      currentAnnual: Number(comparison.currentAnnual) || 0,
      newAnnual: Number(comparison.newAnnual) || 0,
      currentPackageMonthly: Number(comparison.currentPackageMonthly) || 0,
      currentCustomerPortalMonthly: Number(comparison.currentCustomerPortalMonthly) || 0,
      currentSmartConnectMonthly: Number(comparison.currentSmartConnectMonthly) || 0,
    };
  }, [assetsExpansion]);
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
  const supportMonthly = includeSupport ? activeResult.supportMonthly : 0;
  const planningAppMonthlyTotal = planningAppUsers * pricingConfig.planningAppUserMonthly;
  const licenseWithModulesMonthly = activeResult.licenseMonthly + activeResult.moduleMonthly + planningAppMonthlyTotal;
  const customerPortalMonthlyTotal = selectedCustomerPortalOptions.reduce((sum, option) => sum + option.monthlyPrice, 0);
  const expansionMonthlyTotal = customerPortalMonthlyTotal + smartConnectPricing.monthlyTotal;
  const monthlyTotal = Math.max(
    0,
    activeResult.monthlyAfterDiscount
      - activeResult.supportMonthly
      + supportMonthly
      + expansionMonthlyTotal
      + planningAppMonthlyTotal,
  );
  const implementationBaseTotal = isAssetsExpansionDeal ? expansionTotals.once : activeResult.implementationAfterAdjustment;
  const implementationDays = pricingConfig.implementationDayRate > 0
    ? Math.max(0, implementationBaseTotal / pricingConfig.implementationDayRate)
    : 0;
  const assetTravelImplementationTotal = modules
    .filter((module) => (quantities[module.key] ?? 0) > 0 && module.requiresTravel !== false)
    .reduce(
      (sum, module) => sum + (module.setupCost ?? 0) * Math.max(0, quantities[module.key] ?? 0),
      0,
    );
  const travelImplementationBaseTotal = isAssetsExpansionDeal
    ? assetTravelImplementationTotal
    : activeResult.travelEligibleImplementationAfterAdjustment;
  const travelImplementationDays = pricingConfig.implementationDayRate > 0
    ? Math.max(0, travelImplementationBaseTotal / pricingConfig.implementationDayRate)
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
  const implementationTotal = implementationBaseTotal + travelCostTotal;
  const developmentTotal = getDevelopmentTotal(developmentLines, developmentHourlyRate);
  const oneTimeTotal = implementationTotal + developmentTotal;
  const adjustedResult = useMemo(() => ({
    ...activeResult,
    supportFirst: includeSupport ? activeResult.supportFirst : 0,
    supportExtra: includeSupport ? activeResult.supportExtra : 0,
    supportMonthly,
    monthlyBase: monthlyTotal,
    monthlyAfterDiscount: monthlyTotal,
    recurringTotalContract: monthlyTotal,
    implementationAfterAdjustment: implementationTotal,
    contractValue: monthlyTotal * 12 + oneTimeTotal,
    annualRecurring: monthlyTotal * 12,
    monthlyInclVat: monthlyTotal * activeResult.vatMultiplier,
    implementationInclVat: implementationTotal * activeResult.vatMultiplier,
    contractValueInclVat: (monthlyTotal * 12 + oneTimeTotal) * activeResult.vatMultiplier,
  }), [activeResult, implementationTotal, includeSupport, monthlyTotal, oneTimeTotal, supportMonthly]);
  const extraMonthlyRows = useMemo(() => {
    const rows = selectedCustomerPortalOptions.map((option) => ({
      amount: "1x",
      description: `Smart Trade - ${option.name}`,
      price: option.monthlyPrice,
      total: option.monthlyPrice,
    }));

    if (smartConnectPricing.baseTier) {
      rows.push({
        amount: "1x",
        description: `Smart Connect - ${formatConnectionCount(smartConnectPricing.baseTier.connections)}`,
        price: smartConnectPricing.baseTier.monthlyPrice,
        total: smartConnectPricing.baseTier.monthlyPrice,
      });
    }

    if (smartConnectPricing.extraConnections > 0) {
      rows.push({
        amount: `${smartConnectPricing.extraConnections}x`,
        description: "Smart Connect extra connectie",
        price: pricingConfig.smartConnectExtraConnectionPrice,
        total: smartConnectPricing.extraMonthly,
      });
    }

    return rows;
  }, [pricingConfig.smartConnectExtraConnectionPrice, selectedCustomerPortalOptions, smartConnectPricing]);
  const selectedModuleRows = modules.filter((module) => (quantities[module.key] ?? 0) > 0).map((module) => ({
    ...module,
    qty: quantities[module.key] ?? 0,
    total: module.monthlyPrice * (quantities[module.key] ?? 0),
  }));

  function toggleCustomerPortalOption(optionKey: string, checked: boolean) {
    setSelectedCustomerPortalOptionKeys((currentKeys) => {
      if (checked) {
        return currentKeys.includes(optionKey) ? currentKeys : [...currentKeys, optionKey];
      }

      return currentKeys.filter((key) => key !== optionKey);
    });
  }

  async function handleSalesConsultantChange(consultantId: string) {
    if (!user || salesConsultantBusy || consultantId === dealOwnerId) return;

    const consultant = salesConsultants.find((option) => option.id === consultantId);
    if (!consultant) {
      setStatus("De gekozen gebruiker is niet gevonden.");
      return;
    }

    const consultantName = getProfileDisplayName(consultant) || consultant.email || "Onbekende gebruiker";
    setSalesConsultantBusy(true);
    setStatus(`Deal wordt gekoppeld aan ${consultantName}...`);

    const result = await updateDealWithFallback(supabase, dealId, {
      user_id: consultant.id,
      sales_name: consultantName,
    });

    if (result.error) {
      setStatus(`Consultant wijzigen mislukt: ${result.error}`);
    } else {
      setDealOwnerId(result.deal?.user_id || consultant.id);
      setSalesName(result.deal?.sales_name || consultantName);
      setStatus(`Deal is gekoppeld aan ${consultantName}.`);
    }

    setSalesConsultantBusy(false);
  }

  async function handleArchiveToggle() {
    if (!user || archiveBusy) return;

    const isArchived = Boolean(archivedAt);
    if (!isArchived) {
      const confirmed = window.confirm(
        `Is de deal van ${customerName || quoteTitle || "deze klant"} klaar en mag deze naar het archief?`,
      );
      if (!confirmed) return;
    }

    const nextArchivedAt = isArchived ? null : new Date().toISOString();
    setArchiveBusy(true);
    setStatus(isArchived ? "Deal wordt teruggezet..." : "Deal wordt gearchiveerd...");

    try {
      const result = await updateDealWithFallback(supabase, dealId, {
        archived_at: nextArchivedAt,
      });
      if (result.error) {
        setStatus(`${isArchived ? "Terugzetten" : "Archiveren"} mislukt: ${result.error}`);
        return;
      }

      setArchivedAt(result.deal?.archived_at ?? nextArchivedAt);
      setStatus(
        result.warning
          ?? (isArchived
            ? "Deal is teruggezet naar actieve deals."
            : "Deal is klaar en staat nu in het archief."),
      );
    } finally {
      setArchiveBusy(false);
    }
  }

  async function handleManualCustomerApproval(checked: boolean) {
    if (!checked || !user || manualApprovalBusy || acceptedAt || !isNewCustomerDeal) return;

    const recordedAt = new Date().toISOString();
    const recordedBy = currentSalesName || user.email || "Smart Trade";
    setManualApprovalBusy(true);
    setStatus("Klantakkoord wordt vastgelegd...");

    try {
      const result = await updateDealWithFallback(supabase, dealId, {
        accepted_at: recordedAt,
        accepted_by_name: `Handmatig vastgelegd door ${recordedBy}`,
        accepted_by_email: user.email ?? null,
      });
      if (result.error) {
        setStatus(`Klantakkoord vastleggen mislukt: ${result.error}`);
        return;
      }

      setAcceptedAt(result.deal?.accepted_at ?? recordedAt);
      setAcceptedByName(result.deal?.accepted_by_name ?? `Handmatig vastgelegd door ${recordedBy}`);
      setAcceptedByEmail(result.deal?.accepted_by_email ?? user.email ?? "");
      setApprovalStatus("accepted");
      setStatus("Klantakkoord is handmatig vastgelegd. Het Klantformulier is nu beschikbaar.");
    } finally {
      setManualApprovalBusy(false);
    }
  }

  async function handleStartImplementation() {
    if (!user || !supabase || implementationBusy || isAssetsExpansionDeal || implementation) return;

    const confirmed = window.confirm(
      `Is ${customerName || quoteTitle || "deze klant"} een nieuwe klant? De deal wordt opgeslagen, naar het archief verplaatst en als implementatie klaargezet.`,
    );
    if (!confirmed) return;

    setImplementationBusy(true);
    setStatus("Deal wordt opgeslagen en de implementatie wordt aangemaakt...");

    try {
      const saved = await handleSave();
      if (!saved) return;

      const { data, error } = await supabase
        .from("implementations")
        .insert({
          deal_id: dealId,
          customer_name: customerName.trim() || quoteTitle.trim() || "Nieuwe Smart Trade-klant",
          contact_name: contactName.trim() || null,
          quote_title: quoteTitle.trim() || null,
          package_name: activeResult.name,
          implementation_total: implementationTotal,
          sales_name: salesName.trim() || currentSalesName || null,
          status: "new",
          notes: null,
        } as never)
        .select("*")
        .single();

      if (error) {
        const { data: existingImplementation } = await supabase
          .from("implementations")
          .select("*")
          .eq("deal_id", dealId)
          .maybeSingle();

        if (!existingImplementation) {
          setStatus(`Implementatie aanmaken mislukt: ${error.message}`);
          return;
        }

        setImplementation(existingImplementation as ImplementationRecord);
      } else {
        setImplementation(data as ImplementationRecord);
      }

      const nextArchivedAt = archivedAt ?? new Date().toISOString();
      const archiveResult = await updateDealWithFallback(supabase, dealId, {
        archived_at: nextArchivedAt,
      });

      if (archiveResult.error) {
        setStatus(`Implementatie is aangemaakt, maar de deal kon niet worden gearchiveerd: ${archiveResult.error}`);
        return;
      }

      setArchivedAt(archiveResult.deal?.archived_at ?? nextArchivedAt);
      setStatus("Nieuwe klant is als implementatie aangemaakt en staat klaar om toe te wijzen.");
      await refreshDealAssets(true);
    } finally {
      setImplementationBusy(false);
    }
  }

  async function completeImplementationProgress(key: ImplementationProgressKey) {
    if (!implementation || !supabase || !canManageImplementation) return false;

    const currentProgress = normalizeImplementationProgress(implementation.progress);
    if (currentProgress[key]) return true;

    const { data, error } = await supabase
      .from("implementations")
      .update({ progress: { ...currentProgress, [key]: true } } as never)
      .eq("id", implementation.id)
      .select("*")
      .single();

    if (error) return false;
    setImplementation(data as ImplementationRecord);
    return true;
  }

  async function handleNewCustomerOutlookDraft() {
    if (!implementation || !canManageImplementation || newCustomerOutlookBusy) return;

    const outlookWindow = window.open("about:blank", "_blank");
    if (outlookWindow) outlookWindow.opener = null;
    showOutlookPopupStatus(
      outlookWindow,
      "Nieuwe klantmail voorbereiden",
      "Het Outlook-concept met alle klant- en implementatiegegevens wordt gemaakt.",
    );
    setNewCustomerOutlookBusy(true);
    setStatus("Outlook-verbinding wordt gecontroleerd...");

    const returnTo = `/deals/${encodeURIComponent(dealId)}`;

    try {
      const statusResponse = await fetch(
        `/api/outlook/status?returnTo=${encodeURIComponent(returnTo)}`,
        { cache: "no-store" },
      );
      const statusJson = await statusResponse.json().catch(() => ({})) as {
        connected?: boolean;
        connectUrl?: string;
        error?: string;
      };
      if (!statusResponse.ok) {
        throw new Error(statusJson.error || "Outlook-verbinding controleren mislukt.");
      }
      if (!statusJson.connected) {
        const connectUrl = statusJson.connectUrl || `/api/outlook/connect?returnTo=${encodeURIComponent(returnTo)}`;
        setStatus("Outlook wordt eenmalig verbonden...");
        if (!navigateOutlookPopup(outlookWindow, connectUrl)) window.location.assign(connectUrl);
        return;
      }

      setStatus("Nieuwe klantmail wordt gemaakt...");
      const response = await fetch(
        `/api/implementations/${encodeURIComponent(implementation.id)}/new-customer-draft?returnTo=${encodeURIComponent(returnTo)}`,
        { method: "POST" },
      );
      const json = await response.json().catch(() => ({})) as {
        webLink?: string;
        reconnectRequired?: boolean;
        connectUrl?: string;
        error?: string;
      };

      if (json.reconnectRequired && json.connectUrl) {
        setStatus("Outlook moet opnieuw worden verbonden...");
        if (!navigateOutlookPopup(outlookWindow, json.connectUrl)) window.location.assign(json.connectUrl);
        return;
      }
      if (!response.ok || !json.webLink) {
        throw new Error(json.error || "Nieuwe klantmail maken mislukt.");
      }

      const progressSaved = await completeImplementationProgress("newCustomerEmail");
      if (!navigateOutlookPopup(outlookWindow, json.webLink)) window.location.assign(json.webLink);
      setStatus(progressSaved
        ? "Nieuwe klantmail is in Outlook klaargezet en afgevinkt bij de implementatie."
        : "Nieuwe klantmail is in Outlook klaargezet, maar de voortgang kon niet worden afgevinkt.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nieuwe klantmail maken mislukt.";
      showOutlookPopupStatus(outlookWindow, "Nieuwe klantmail niet gemaakt", message, "error");
      setStatus(message);
    } finally {
      setNewCustomerOutlookBusy(false);
    }
  }

  async function handleImplementationOrder(mode: "preview" | "create") {
    if (!implementation || !canManageImplementation || implementationOrderBusy) return;

    setImplementationOrderBusy(mode);
    setImplementationOrderMessageTone("info");
    setImplementationOrderMessage(
      mode === "preview" ? "Order wordt gecontroleerd..." : "Live order wordt aangemaakt...",
    );

    try {
      const response = await fetch(
        `/api/implementations/${encodeURIComponent(implementation.id)}/order`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        },
      );
      const json = await response.json().catch(() => ({})) as ImplementationOrderResponse;
      if (!response.ok) throw new Error(json.error || "Implementatieorder verwerken mislukt.");

      if (mode === "preview") {
        setImplementationOrderPreview(json);
        setImplementationOrderMessageTone("success");
        setImplementationOrderMessage(
          `Controle geslaagd voor relatie ${json.relationId}. De live order kan worden aangemaakt.`,
        );
        return;
      }

      setImplementation((current) => current ? {
        ...current,
        smart_trade_order_id: json.orderId ?? "Aangemaakt",
        smart_trade_order_created_at: json.orderCreatedAt ?? new Date().toISOString(),
        smart_trade_order_pending_at: null,
        progress: {
          ...normalizeImplementationProgress(current.progress),
          implementationOrder: true,
        },
      } : current);
      setImplementationOrderPreview(null);
      setImplementationOrderMessageTone("success");
      setImplementationOrderMessage(
        `Smart Trade-order ${json.orderId || "is"} aangemaakt. Implementatieorder staat op Verwerkt.`,
      );
    } catch (error) {
      setImplementationOrderMessageTone("error");
      setImplementationOrderMessage(
        error instanceof Error ? error.message : "Implementatieorder verwerken mislukt.",
      );
    } finally {
      setImplementationOrderBusy(null);
    }
  }

  function applyDealApproval(approval: DealApprovalSummary | null) {
    if (!approval) {
      setApprovalStatus(null);
      setApprovalRequestedAt(null);
      setApprovalExpiresAt(null);
      setAcceptedAt(null);
      setAcceptedByName("");
      setAcceptedByEmail("");
      return;
    }

    setApprovalStatus(approval.status);
    setApprovalRequestedAt(approval.status === "revoked" ? null : approval.draftedAt);
    setApprovalExpiresAt(approval.status === "revoked" ? null : approval.expiresAt);
    setAcceptedAt(approval.status === "accepted" ? approval.acceptedAt : null);
    setAcceptedByName(approval.status === "accepted" ? approval.acceptedByName : "");
    setAcceptedByEmail(approval.status === "accepted" ? approval.acceptedByEmail : "");
  }

  async function refreshDealApproval() {
    try {
      const response = await fetch(
        `/api/deal-approvals?dealId=${encodeURIComponent(dealId)}`,
        { cache: "no-store" },
      );
      const json = await response.json().catch(() => ({})) as {
        approval?: DealApprovalSummary | null;
      };
      if (response.ok) {
        applyDealApproval(json.approval ?? null);
        void refreshDealAssets(true);
      }
    } catch {
      // De deal blijft bruikbaar; de status wordt bij de volgende actie opnieuw geladen.
    }
  }

  async function refreshDealAssets(quiet = false) {
    if (isAssetsExpansionDeal) return;

    try {
      const { response, json } = await loadDealAssetOverview(dealId);

      if (!response.ok || !json.overview) {
        if (!quiet) setAssetCreationStatus(json.error || "Assets voorbereiden mislukt.");
        return;
      }

      setAssetOverview(json.overview);
      if (!quiet) setAssetCreationStatus("");
    } catch {
      if (!quiet) setAssetCreationStatus("Assets voorbereiden mislukt.");
    }
  }

  async function handleCreateAssets() {
    if (assetCreationBusy) return;

    setAssetCreationBusy(true);
    setAssetCreationStatus("Assets worden aangemaakt in Smart Trade...");

    try {
      const response = await fetch(`/api/deals/${encodeURIComponent(dealId)}/assets`, {
        method: "POST",
      });
      const json = await response.json().catch(() => ({})) as {
        message?: string;
        overview?: DealAssetOverview;
        error?: string;
      };

      if (json.overview) setAssetOverview(json.overview);
      if (!response.ok) {
        setAssetCreationStatus(json.error || "Assets aanmaken mislukt.");
        return;
      }

      setAssetCreationStatus(json.message || "Assets zijn aangemaakt in Smart Trade.");
      await refreshDealAssets(true);
    } catch {
      setAssetCreationStatus("Assets aanmaken mislukt.");
    } finally {
      setAssetCreationBusy(false);
    }
  }

  async function handleSave(): Promise<boolean> {
    if (!user) {
      setStatus("Je moet ingelogd zijn om deze deal op te slaan.");
      return false;
    }
    const payload = isAssetsExpansionDeal
      ? {
          user_id: dealOwnerId || user.id,
          customer_name: customerName || null,
          quote_title: quoteTitle,
          contact_name: contactName || null,
          sales_name: salesName || currentSalesName || null,
          package_key: activeResult.key,
          package_name: "Uitbreiding",
          total_users: quotedUserCount,
          contract_months: 1,
          discount_pct: 0,
          include_vat: includeVat,
          manual_monthly_adjustment: 0,
          manual_implementation_adjustment: expansionTotals.once,
          monthly_base: expansionTotals.monthly,
          monthly_total: expansionTotals.monthly,
          implementation_total: implementationTotal,
          contract_value: expansionTotals.monthly + expansionTotals.annual + implementationTotal,
          annual_recurring: expansionTotals.monthly * 12 + expansionTotals.annual,
          modules: selectedModuleRows,
          notes,
          calculator_inputs: {
            extraUsers,
            chauffeurExtraUsers,
            planningAppUsers,
            selectedPackage: activeResult.key,
            manualImplementationAdjustment: expansionTotals.once,
            includeVat,
            includeTravelCosts: effectiveIncludeTravelCosts,
            travelPostcodePrefix,
            travelCostPerDay: travelCostQuote?.pricePerDay ?? 0,
            travelCostTotal,
            travelRegion: travelCostQuote?.postcodeRow?.region ?? null,
            developmentLines: normalizeDevelopmentLines(developmentLines),
            developmentHourlyRate,
            quantities,
            quoteLayout,
            assetsExpansion,
          },
        }
      : {
      user_id: dealOwnerId || user.id,
      customer_name: customerName || null,
      quote_title: quoteTitle,
      contact_name: contactName || null,
      sales_name: salesName || currentSalesName || null,
      package_key: activeResult.key,
      package_name: activeResult.name,
      total_users: totalUsers,
      contract_months: 1,
      discount_pct: 0,
      include_vat: includeVat,
      manual_monthly_adjustment: 0,
      manual_implementation_adjustment: manualImplementationAdjustment,
      monthly_base: monthlyTotal,
      monthly_total: monthlyTotal,
      implementation_total: implementationTotal,
      contract_value: monthlyTotal * 12 + oneTimeTotal,
      annual_recurring: monthlyTotal * 12,
      modules: selectedModuleRows,
      notes,
      calculator_inputs: {
        extraUsers,
        chauffeurExtraUsers,
        planningAppUsers,
        selectedPackage: activeResult.key,
        manualImplementationAdjustment,
        includeVat,
        includeSupport,
        includeTravelCosts: effectiveIncludeTravelCosts,
        travelPostcodePrefix,
        travelCostPerDay: travelCostQuote?.pricePerDay ?? 0,
        travelCostTotal,
        travelRegion: travelCostQuote?.postcodeRow?.region ?? null,
        customerPortalOptionKeys: selectedCustomerPortalOptionKeys,
        customerPortalOptions: selectedCustomerPortalOptions.map((option) => ({
          key: option.key,
          name: option.name,
          monthlyPrice: option.monthlyPrice,
        })),
        smartConnectConnections,
        smartConnectPricing,
        developmentLines: normalizeDevelopmentLines(developmentLines),
        developmentHourlyRate,
        quantities,
        quoteLayout,
        assetsExpansion,
      },
    };

    const result = await updateDealWithFallback(supabase, dealId, payload);
    if (result.error) {
      setStatus(`Opslaan mislukt: ${result.error}`);
      return false;
    }
    const saveMessage = result.warning ?? "Deal opnieuw berekend en opgeslagen.";
    if (approvalStatus && approvalRequestedAt) await refreshDealApproval();
    setStatus(saveMessage);
    return true;
  }

  async function handlePdfExport() {
    setStatus("PDF wordt gemaakt...");

    try {
      await exportQuotePdf(getQuotePdfInput());
      setStatus("PDF is gemaakt.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "PDF maken mislukt.");
    }
  }

  function getQuotePdfInput() {
    return {
      quoteTitle,
      customerName,
      contactName,
      salesName: selectedSalesName,
      salesEmail: selectedSalesEmail,
      salesPhone: selectedSalesPhone,
      salesTitle: selectedSalesTitle,
      salesWorkdays: selectedSalesWorkdays,
      notes,
      includeVat,
      totalUsers: quotedUserCount,
      extraUsers,
      chauffeurExtraUsers,
      planningAppUsers,
      planningAppUserMonthly: pricingConfig.planningAppUserMonthly,
      selectedModules: selectedModuleRows,
      extraMonthlyRows,
      developmentLines: normalizeDevelopmentLines(developmentLines),
      developmentHourlyRate,
      result: adjustedResult,
      includeTravelCosts: effectiveIncludeTravelCosts,
      travelPostcodePrefix,
      travelRegion: travelCostQuote?.postcodeRow?.region ?? null,
      travelDescription: travelCostQuote?.postcodeRow?.description ?? "",
      travelCostPerDay: travelCostQuote?.pricePerDay ?? 0,
      travelCostTotal,
      implementationDays,
      quoteLayout,
      assetsExpansion,
      expansionWorkItems: pricingConfig.expansionWorkItems,
      moduleWorkItems: pricingConfig.modules,
    };
  }

  async function handleQuoteOutlookDraft() {
    const recipientEmail = customerIntakeEmail.trim().toLowerCase();
    if (!recipientEmail || !/^\S+@\S+\.\S+$/.test(recipientEmail)) {
      setStatus("Vul eerst een geldig e-mailadres van de klant in.");
      return;
    }
    if (quoteOutlookBusy) return;

    const returnTo = `/deals/${encodeURIComponent(dealId)}`;
    const outlookWindow = window.open("about:blank", "_blank");
    if (outlookWindow) outlookWindow.opener = null;
    showOutlookPopupStatus(
      outlookWindow,
      "Outlook-concept voorbereiden",
      "De offerte-PDF wordt gemaakt en aan het Outlook-concept toegevoegd.",
    );
    setQuoteOutlookLink("");
    setQuoteOutlookBusy(true);
    setStatus("Outlook-verbinding wordt gecontroleerd...");

    try {
      const statusResponse = await fetch(
        `/api/outlook/status?returnTo=${encodeURIComponent(returnTo)}`,
        { cache: "no-store" },
      );
      const statusJson = await statusResponse.json().catch(() => ({})) as {
        connected?: boolean;
        connectUrl?: string;
        error?: string;
      };
      if (!statusResponse.ok) {
        const message = statusJson.error || "Outlook-verbinding controleren mislukt.";
        showOutlookPopupStatus(outlookWindow, "Outlook-concept niet gemaakt", message, "error");
        throw new Error(message);
      }
      if (!statusJson.connected) {
        const connectUrl = statusJson.connectUrl || `/api/outlook/connect?returnTo=${encodeURIComponent(returnTo)}`;
        setStatus("Outlook wordt eenmalig verbonden...");
        if (!navigateOutlookPopup(outlookWindow, connectUrl)) {
          window.location.assign(connectUrl);
        }
        return;
      }

      setStatus("Deal wordt opgeslagen voor de akkoordlink...");
      const saved = await handleSave();
      if (!saved) throw new Error("De deal kon niet worden opgeslagen. Het Outlook-concept is niet gemaakt.");

      setStatus("Beveiligde akkoordlink wordt gemaakt...");
      const approvalResponse = await fetch("/api/deal-approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          recipientEmail,
          contactName,
        }),
      });
      const approvalJson = await approvalResponse.json().catch(() => ({})) as {
        approval?: DealApprovalSummary;
        error?: string;
      };
      if (!approvalResponse.ok || !approvalJson.approval?.publicUrl) {
        throw new Error(approvalJson.error || "De beveiligde akkoordlink kon niet worden gemaakt.");
      }
      const approval = approvalJson.approval;
      applyDealApproval(approval);

      setStatus("Offerte-PDF en Outlook-concept worden gemaakt...");
      const attachment = await createQuotePdfFile(getQuotePdfInput());
      showOutlookPopupStatus(
        outlookWindow,
        "Outlook-concept voorbereiden",
        "De offerte is gemaakt. Outlook voegt de PDF nu als bijlage toe.",
      );
      const formData = new FormData();
      formData.set("recipientEmail", recipientEmail);
      formData.set("customerName", customerName);
      formData.set("contactName", contactName);
      formData.set("approvalUrl", approval.publicUrl);
      formData.set("attachment", attachment);

      const response = await fetch(
        `/api/outlook/drafts?returnTo=${encodeURIComponent(returnTo)}`,
        { method: "POST", body: formData },
      );
      const json = await response.json().catch(() => ({})) as {
        webLink?: string;
        reconnectRequired?: boolean;
        connectUrl?: string;
        error?: string;
      };

      if (json.reconnectRequired && json.connectUrl) {
        setStatus("Outlook moet opnieuw worden verbonden...");
        if (!navigateOutlookPopup(outlookWindow, json.connectUrl)) {
          window.location.assign(json.connectUrl);
        }
        return;
      }
      if (!response.ok || !json.webLink) {
        const message = json.error || "Outlook-concept maken mislukt.";
        showOutlookPopupStatus(outlookWindow, "Outlook-concept niet gemaakt", message, "error");
        throw new Error(message);
      }

      let trackingWarning = "";
      try {
        const trackingResponse = await fetch("/api/deal-approvals", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dealId, approvalId: approval.id }),
        });
        const trackingJson = await trackingResponse.json().catch(() => ({})) as {
          approval?: DealApprovalSummary;
          error?: string;
        };
        if (trackingResponse.ok && trackingJson.approval) {
          applyDealApproval(trackingJson.approval);
        } else {
          trackingWarning = trackingJson.error || "De akkoordstatus kon niet worden bijgewerkt.";
        }
      } catch {
        trackingWarning = "De akkoordstatus kon niet worden bijgewerkt.";
      }

      if (!navigateOutlookPopup(outlookWindow, json.webLink)) {
        window.location.assign(json.webLink);
      }
      setQuoteOutlookLink(json.webLink);
      setStatus(
        trackingWarning
          ? `Outlook-concept is aangemaakt. ${trackingWarning}`
          : "Outlook-concept met offerte-PDF en akkoordlink is aangemaakt.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Outlook-concept maken mislukt.";
      showOutlookPopupStatus(outlookWindow, "Outlook-concept niet gemaakt", message, "error");
      setStatus(message);
    } finally {
      setQuoteOutlookBusy(false);
    }
  }

  async function saveCustomerIntake(regenerate = false) {
    if (customerIntakeBusy) return null;

    const relationIdText = customerIntakeRelationId.trim();
    const relationId = relationIdText ? Number(relationIdText) : null;
    if (relationId !== null && (!Number.isSafeInteger(relationId) || relationId <= 0)) {
      setCustomerIntakeStatus("Vul een geldig bestaand relatie-ID in.");
      return null;
    }

    setCustomerIntakeBusy(true);
    setCustomerIntakeStatus(regenerate ? "Nieuwe klantlink wordt gemaakt..." : "Klantlink wordt gemaakt...");

    try {
      const response = await fetch("/api/customer-intakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          recipientEmail: customerIntakeEmail,
          regenerate,
          smartTradeRelationId: relationId,
        }),
      });
      const json = await response.json().catch(() => ({})) as {
        intake?: CustomerIntakeSummary;
        error?: string;
      };

      if (!response.ok || !json.intake) {
        setCustomerIntakeStatus(json.error || "Klantlink maken mislukt.");
        return null;
      }

      setCustomerIntake(json.intake);
      setIsNewCustomerDeal(true);
      setCustomerIntakeEmail(json.intake.recipientEmail);
      setCustomerIntakeRelationId(json.intake.smartTradeRelationId
        ? String(json.intake.smartTradeRelationId)
        : "");
      setCustomerIntakeStatus(regenerate ? "Nieuwe klantlink is klaar." : "Klantlink is klaar.");
      return json.intake;
    } catch {
      setCustomerIntakeStatus("Klantlink maken mislukt.");
      return null;
    } finally {
      setCustomerIntakeBusy(false);
    }
  }

  async function saveCustomerIntakeRelationId() {
    if (!user || customerIntakeBusy) return;

    const relationIdText = customerIntakeRelationId.trim();
    const relationId = relationIdText ? Number(relationIdText) : null;
    if (relationId !== null && (!Number.isSafeInteger(relationId) || relationId <= 0)) {
      setCustomerIntakeStatus("Vul een geldig Smart Trade relatie-ID in.");
      return;
    }

    setCustomerIntakeBusy(true);
    setCustomerIntakeStatus("Relatie-ID wordt opgeslagen...");
    try {
      const result = await updateDealWithFallback(supabase, dealId, {
        smart_trade_relation_id: relationId,
      });
      if (result.error) {
        setCustomerIntakeStatus(`Relatie-ID opslaan mislukt: ${result.error}`);
        return;
      }
      setCustomerIntakeStatus(relationId
        ? `Smart Trade relatie-ID ${relationId} is opgeslagen.`
        : "Smart Trade relatie-ID is leeggemaakt.");
    } finally {
      setCustomerIntakeBusy(false);
    }
  }

  async function refreshCustomerIntake() {
    if (customerIntakeBusy) return;

    setCustomerIntakeBusy(true);
    setCustomerIntakeStatus("Status wordt vernieuwd...");

    try {
      const response = await fetch(
        `/api/customer-intakes?dealId=${encodeURIComponent(dealId)}`,
        { cache: "no-store" },
      );
      const json = await response.json().catch(() => ({})) as {
        intake?: CustomerIntakeSummary | null;
        error?: string;
      };

      if (!response.ok) {
        setCustomerIntakeStatus(json.error || "Status vernieuwen mislukt.");
        return;
      }

      setCustomerIntake(json.intake ?? null);
      if (json.intake) {
        setIsNewCustomerDeal(true);
        setCustomerIntakeEmail(json.intake.recipientEmail);
        setCustomerIntakeRelationId(json.intake.smartTradeRelationId
          ? String(json.intake.smartTradeRelationId)
          : "");
      }
      setCustomerIntakeStatus(json.intake?.submittedAt
        ? "De ingevulde klantgegevens zijn ontvangen."
        : "Status is bijgewerkt.");
    } catch {
      setCustomerIntakeStatus("Status vernieuwen mislukt.");
    } finally {
      setCustomerIntakeBusy(false);
    }
  }

  async function syncCustomerIntakeWithSmartTrade() {
    if (customerIntakeBusy || !customerIntake?.submittedAt) return;

    setCustomerIntakeBusy(true);
    setCustomerIntakeStatus(`Klantgegevens worden verwerkt in relatie ${customerIntake.smartTradeRelationId ?? ""}...`);

    try {
      const response = await fetch("/api/customer-intakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", dealId }),
      });
      const json = await response.json().catch(() => ({})) as {
        intake?: CustomerIntakeSummary | null;
        error?: string;
      };

      if (!response.ok || !json.intake) {
        setCustomerIntakeStatus(json.error || "Klantgegevens verwerken in Smart Trade mislukt.");
        return;
      }

      setCustomerIntake(json.intake);
      setCustomerIntakeStatus(
        `Klantgegevens zijn verwerkt in Smart Trade-relatie ${json.intake.smartTradeRelationId}.`,
      );
    } catch {
      setCustomerIntakeStatus("Klantgegevens verwerken in Smart Trade mislukt.");
    } finally {
      setCustomerIntakeBusy(false);
    }
  }

  async function getUsableCustomerIntake() {
    const expired = customerIntake
      ? new Date(customerIntake.expiresAt).getTime() <= Date.now()
      : false;
    const mustRegenerate = Boolean(
      customerIntake && (customerIntake.status === "revoked" || expired),
    );

    const currentRelationId = customerIntake?.smartTradeRelationId
      ? String(customerIntake.smartTradeRelationId)
      : "";
    if (
      !customerIntake
      || mustRegenerate
      || customerIntake.recipientEmail !== customerIntakeEmail.trim().toLowerCase()
      || currentRelationId !== customerIntakeRelationId.trim()
    ) {
      return saveCustomerIntake(mustRegenerate);
    }

    return customerIntake;
  }

  async function handleCopyCustomerIntakeLink() {
    const intake = await getUsableCustomerIntake();
    if (!intake) return;

    try {
      await navigator.clipboard.writeText(intake.publicUrl);
      setCustomerIntakeStatus("Klantlink is gekopieerd.");
    } catch {
      setCustomerIntakeStatus("Kopiëren mislukt. Open de klantlink en kopieer het adres uit de browser.");
    }
  }

  async function handleOpenCustomerIntake() {
    const targetWindow = window.open("about:blank", "_blank");
    if (targetWindow) targetWindow.opener = null;

    const intake = await getUsableCustomerIntake();
    if (!intake) {
      targetWindow?.close();
      return;
    }
    if (!targetWindow) {
      setCustomerIntakeStatus("De browser blokkeerde het nieuwe tabblad. Sta pop-ups toe en probeer opnieuw.");
      return;
    }
    targetWindow.location.href = intake.publicUrl;
  }

  async function openOutlookTemplateDraft(
    outlookWindow: Window | null,
    payload: {
      template: "customer-intake";
      recipientEmail: string;
      customerName: string;
      contactName: string;
      publicUrl?: string;
    },
    successMessage: string,
  ) {
    const returnTo = `/deals/${encodeURIComponent(dealId)}`;
    setCustomerIntakeStatus("Outlook-verbinding wordt gecontroleerd...");

    const statusResponse = await fetch(
      `/api/outlook/status?returnTo=${encodeURIComponent(returnTo)}`,
      { cache: "no-store" },
    );
    const statusJson = await statusResponse.json().catch(() => ({})) as {
      connected?: boolean;
      connectUrl?: string;
      error?: string;
    };
    if (!statusResponse.ok) {
      throw new Error(statusJson.error || "Outlook-verbinding controleren mislukt.");
    }
    if (!statusJson.connected) {
      outlookWindow?.close();
      setCustomerIntakeStatus("Outlook wordt eenmalig verbonden...");
      window.location.assign(
        statusJson.connectUrl || `/api/outlook/connect?returnTo=${encodeURIComponent(returnTo)}`,
      );
      return;
    }

    setCustomerIntakeStatus("Outlook-concept wordt gemaakt...");
    const response = await fetch(
      `/api/outlook/drafts?returnTo=${encodeURIComponent(returnTo)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const json = await response.json().catch(() => ({})) as {
      webLink?: string;
      reconnectRequired?: boolean;
      connectUrl?: string;
      error?: string;
    };

    if (json.reconnectRequired && json.connectUrl) {
      outlookWindow?.close();
      setCustomerIntakeStatus("Outlook moet opnieuw worden verbonden...");
      window.location.assign(json.connectUrl);
      return;
    }
    if (!response.ok || !json.webLink) {
      throw new Error(json.error || "Outlook-concept maken mislukt.");
    }

    if (outlookWindow) {
      outlookWindow.location.href = json.webLink;
    } else {
      window.location.assign(json.webLink);
    }
    setCustomerIntakeStatus(successMessage);
  }

  async function handleOutlookDraft() {
    const recipientEmail = customerIntakeEmail.trim().toLowerCase();
    if (!recipientEmail || !/^\S+@\S+\.\S+$/.test(recipientEmail)) {
      setCustomerIntakeStatus("Vul eerst een geldig e-mailadres van de klant in.");
      return;
    }
    if (customerOutlookBusy) return;

    const outlookWindow = window.open("about:blank", "_blank");
    if (outlookWindow) outlookWindow.opener = null;
    setCustomerOutlookBusy(true);

    try {
      const intake = await getUsableCustomerIntake();
      if (!intake) {
        outlookWindow?.close();
        return;
      }

      await openOutlookTemplateDraft(
        outlookWindow,
        {
          template: "customer-intake",
          recipientEmail,
          customerName,
          contactName,
          publicUrl: intake.publicUrl,
        },
        "Outlook-concept met klantlink is aangemaakt.",
      );
    } catch (error) {
      outlookWindow?.close();
      setCustomerIntakeStatus(
        error instanceof Error ? error.message : "Outlook-concept maken mislukt.",
      );
    } finally {
      setCustomerOutlookBusy(false);
    }
  }

  async function handleCustomerIntakePdf() {
    setCustomerIntakeStatus("PDF van het klantformulier wordt gemaakt...");
    const fallbackContact = splitCustomerContactName(contactName);

    try {
      await exportCustomerIntakePdf({
        customerName,
        formData: customerIntake?.formData ?? {
          deliveryName: customerName,
          deliveryStreet: "",
          deliveryNumber: "",
          deliveryPostcode: "",
          deliveryCity: "",
          phone: "",
          mobile: "",
          generalEmail: "",
          website: "",
          vatNumber: "",
          chamberOfCommerceNumber: "",
          postalStreet: "",
          postalNumber: "",
          postalPostcode: "",
          postalCity: "",
          contactFirstName: fallbackContact.firstName,
          contactLastName: fallbackContact.lastName,
          contactName,
          contactPhone: "",
          contactEmail: customerIntakeEmail,
          invoiceDelivery: "",
          administrationEmail: "",
          administrationFirstName: "",
          administrationLastName: "",
          administrationContact: "",
          administrationPhone: "",
          directDebit: "",
          directDebitAccountHolder: "",
          directDebitBankAccount: "",
          directDebitConsent: "",
        },
      });
      setCustomerIntakeStatus(customerIntake?.submittedAt
        ? "Ingevuld klantformulier is als PDF gemaakt."
        : "Leeg klantformulier is gemaakt.");
    } catch {
      setCustomerIntakeStatus("PDF van het klantformulier maken mislukt.");
    }
  }

  const customerIntakeLabel = customerIntake
    ? customerIntakeStatusLabel(customerIntake.status, customerIntake.expiresAt)
    : "Nog niet aangemaakt";
  const customerIntakeTone = customerIntakeLabel === "Ontvangen" || customerIntakeLabel === "Verwerkt"
    ? "success"
    : customerIntakeLabel === "Verlopen" || customerIntakeLabel === "Ingetrokken"
      ? "danger"
      : "warning";
  const newCustomerMailMissingFields = [
    !customerIntake?.submittedAt ? "klantformulier" : "",
    !implementation?.assigned_consultant_name?.trim() ? "consultant" : "",
    !implementation?.administration_name?.trim() ? "administratie" : "",
    !implementation?.planned_go_live_date?.trim() ? "livegang" : "",
    !implementation?.financial_package?.trim() ? "financieel pakket" : "",
  ].filter(Boolean);
  const newCustomerMailReady = newCustomerMailMissingFields.length === 0;
  const canArchiveDeal = Boolean(
    user && (role === "admin" || dealOwnerId === user.id),
  );
  const canEditDeal = Boolean(
    user && (
      role === "admin" ||
      role === "manager" ||
      role === "support" ||
      dealOwnerId === user.id
    ),
  );
  const approvalExpired = Boolean(
    approvalStatus === "open" &&
    approvalExpiresAt &&
    new Date(approvalExpiresAt).getTime() <= Date.now(),
  );
  const assetsComplete = Boolean(
    assetOverview && assetOverview.total > 0 && assetOverview.createdCount === assetOverview.total,
  );
  const assetsPending = Boolean(assetOverview?.pendingCount);
  const showCustomerIntake = Boolean(customerIntake) || (isNewCustomerDeal && Boolean(acceptedAt));

  if (loading) {
    return <div className="save-status">Deal wordt geladen...</div>;
  }

  return (
    <div className="page-shell">
      <div className="container">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Smart Trade</div>
            <h1>{isAssetsExpansionDeal ? "Uitbreiding detail" : "Deal detail en herberekening"}</h1>
            <p>
              {isAssetsExpansionDeal
                ? "Deze deal bevat alleen de geselecteerde uitbreiding vanuit Assets."
                : "Open jouw opgeslagen deal als volledige calculator, wijzig gebruikers, modules of pakket en sla de nieuwe berekening weer op."}
            </p>
          </div>
          <div className="brand-actions">
            {!focusMode ? (
              <Link href="/deals" className="secondary-button"><ArrowLeft size={16} /> Terug naar deals</Link>
            ) : null}
            {implementation && !focusMode ? (
              <Link href={`/implementatie/${implementation.id}`} className="primary-button">
                <ClipboardCheck size={16} /> Open implementatie
              </Link>
            ) : null}
            {canArchiveDeal && !isAssetsExpansionDeal && !implementation ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleStartImplementation()}
                disabled={implementationBusy || archiveBusy}
              >
                <ClipboardCheck size={16} />
                {implementationBusy ? "Implementatie starten..." : "Nieuwe klant - start implementatie"}
              </button>
            ) : null}
            {canArchiveDeal ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void handleArchiveToggle()}
                disabled={archiveBusy || implementationBusy}
              >
                {archivedAt ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                {archiveBusy
                  ? archivedAt
                    ? "Terugzetten..."
                    : "Archiveren..."
                  : archivedAt
                    ? "Terugzetten naar actief"
                    : "Klaar en archiveren"}
              </button>
            ) : null}
            <StatusPill tone={implementation ? "success" : archivedAt ? "neutral" : "success"}>
              {implementation ? "Implementatie gestart" : archivedAt ? "Gearchiveerd" : "Versie 8"}
            </StatusPill>
            {acceptedAt ? (
              <StatusPill tone="success">Klant akkoord</StatusPill>
            ) : approvalRequestedAt ? (
              <StatusPill tone={approvalExpired ? "danger" : "warning"}>
                {approvalExpired ? "Akkoordlink verlopen" : "Wacht op akkoord"}
              </StatusPill>
            ) : approvalStatus === "revoked" ? (
              <StatusPill tone="warning">Nieuwe akkoordlink nodig</StatusPill>
            ) : null}
            {!canEditDeal ? <StatusPill tone="neutral">Alleen lezen</StatusPill> : null}
          </div>
        </header>

        <div className="kpi-grid">
          {isAssetsExpansionDeal ? (
            expansionPriceComparison ? (
              <>
                <StatCard title="Huidige maandprijs" value={euro.format(expansionPriceComparison.currentMonthly)} icon={FileText} sublabel="Voor deze uitbreiding" />
                <StatCard title="Nieuwe maandprijs" value={euro.format(expansionPriceComparison.newMonthly)} icon={Users} sublabel={`Toename ${euro.format(expansionTotals.monthly)} p/m`} />
                <StatCard title="Eenmalig" value={euro.format(implementationTotal)} icon={Package} sublabel={travelCostTotal > 0 ? "Incl. reiskosten" : "Implementatie en setup"} />
              </>
            ) : (
              <>
                <StatCard title="Regels" value={String(assetsExpansion?.lines.length ?? 0)} icon={FileText} sublabel="Geselecteerde uitbreidingen" />
                <StatCard title="Maandbedrag" value={euro.format(expansionTotals.monthly)} icon={Users} sublabel="Alleen deze uitbreiding" />
                <StatCard title="Setup" value={euro.format(implementationTotal)} icon={Package} sublabel={travelCostTotal > 0 ? "Incl. reiskosten" : "Eenmalige kosten"} />
              </>
            )
          ) : (
            <>
              <StatCard
                title="Gebruikers"
                value={String(totalUsers)}
                icon={Users}
                sublabel={planningAppUsers > 0
                  ? `1 hoofdgebruiker + ${smartTradeExtraUsers} extra + ${planningAppUsers} planningapp`
                  : "1 hoofdgebruiker + extra gebruikers"}
              />
              <StatCard title="Maandprijs" value={euro.format(monthlyTotal)} icon={FileText} sublabel="ex. BTW" />
              <StatCard
                title={developmentTotal > 0 ? "Eenmalig" : "Implementatie"}
                value={euro.format(oneTimeTotal)}
                icon={Package}
                sublabel={developmentTotal > 0 ? "Implementatie en ontwikkelingen" : `${formatDays(implementationDays)} implementatie`}
              />
            </>
          )}
        </div>

        {!canEditDeal ? (
          <div className="save-status deal-read-only-note">
            Deze deal hoort bij een andere sales consultant. Je kunt hem vanuit jouw implementatie volledig bekijken, maar niet wijzigen.
          </div>
        ) : null}

        <fieldset className="deal-access-fieldset" disabled={!canEditDeal}>
        <div className="grid-main">
          <section className="card panel">
            <div className="top-row">
              <div>
                <div className="eyebrow">Deal detail</div>
                <h2 className="headline">{isAssetsExpansionDeal ? "Offertegegevens" : "Calculator invoer"}</h2>
                <div className="subtext">
                  {isAssetsExpansionDeal
                    ? "Controleer klant, contactpersoon en sales consultant voor deze uitbreiding."
                    : "Je werkt hier weer vanuit de originele invoervelden, niet alleen op de eindbedragen."}
                </div>
              </div>
              <StatusPill tone="warning">{isAssetsExpansionDeal ? "Uitbreiding" : `Automatisch: ${activeResult.name}`}</StatusPill>
            </div>

            <div className="section">
              <div className="field-grid-2">
                <TextInput label="Klantnaam" value={customerName} onChange={setCustomerName} />
                <TextInput label="Titel voorstel" value={quoteTitle} onChange={setQuoteTitle} />
                <TextInput label="Contactpersoon" value={contactName} onChange={setContactName} />
                <label className="input-wrap">
                  <span className="input-label">Sales consultant</span>
                  <select
                    className="input"
                    value={dealOwnerId ?? ""}
                    disabled={!salesConsultantsLoaded || salesConsultantBusy}
                    onChange={(event) => void handleSalesConsultantChange(event.currentTarget.value)}
                  >
                    {!salesConsultantsLoaded ? <option value="">Gebruikers laden...</option> : null}
                    {dealOwnerId && !salesConsultants.some((consultant) => consultant.id === dealOwnerId) ? (
                      <option value={dealOwnerId}>{salesName || "Huidige consultant"}</option>
                    ) : null}
                    {salesConsultants.map((consultant) => (
                      <option key={consultant.id} value={consultant.id}>
                        {getProfileDisplayName(consultant) || consultant.email || "Naam ontbreekt"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {isAssetsExpansionDeal ? (
              <>
                <div className="section">
                  <div className="section-title"><FileText size={16} /> Uitbreidingsregels</div>
                  <div className="expansion-line-list">
                    {assetsExpansion?.lines.map((line, index) => (
                      <div key={`${line.group}-${line.label}-${index}`} className="expansion-line-row">
                        <div className="expansion-line-main">
                          <strong className="expansion-line-title">{line.quantity}x {line.label}</strong>
                          <span className="expansion-line-meta">
                            {line.group} · {getExpansionCadenceLabel(line)}
                            {line.note ? ` · ${line.note}` : ""}
                          </span>
                        </div>
                        <strong className="expansion-line-price">{formatExpansionAmount(line)}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="section">
                  <div className="section-title"><MapPin size={16} /> Reiskosten</div>
                  <div className="calculator-module-grid travel-toggle-grid">
                    <label className={`calculator-module-card travel-toggle-card ${effectiveIncludeTravelCosts ? "active" : ""}`}>
                      <input
                        type="checkbox"
                        checked={effectiveIncludeTravelCosts}
                        disabled={!canCalculateTravelCosts}
                        onChange={(event) => setIncludeTravelCosts(event.target.checked)}
                      />
                      <span className="calculator-module-main">
                        <strong>{canCalculateTravelCosts ? "Setup inclusief reiskosten" : "Geen reiskosten voor geselecteerde modules"}</strong>
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
                        onChange={(event) => setTravelPostcodePrefix(normalizePostcodePrefix(event.target.value))}
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
                </div>

              </>
            ) : (
              <>
                <div className="section">
                  <div className="section-title"><Users size={16} /> Extra gebruikers</div>
                  <ExtraUserOffer
                    packageName={activeResult.name}
                    licenseExtra={activeResult.licenseExtra}
                    supportExtra={activeResult.supportExtra}
                    includeSupport={includeSupport}
                    extraUsers={extraUsers}
                    chauffeurExtraUsers={chauffeurExtraUsers}
                    planningAppUsers={planningAppUsers}
                    planningAppUserMonthly={pricingConfig.planningAppUserMonthly}
                    onExtraUsersChange={setExtraUsers}
                    onChauffeurExtraUsersChange={setChauffeurExtraUsers}
                    onPlanningAppUsersChange={setPlanningAppUsers}
                  />
                  <div className="field-grid-2 extra-user-correction">
                    <NumberInput label="Correctie implementatie (€)" value={manualImplementationAdjustment} onChange={setManualImplementationAdjustment} step={0.01} />
                  </div>
                </div>

                <div className="section">
                  <div className="section-title"><MapPin size={16} /> Reiskosten</div>
                  <div className="calculator-module-grid travel-toggle-grid">
                    <label className={`calculator-module-card travel-toggle-card ${effectiveIncludeTravelCosts ? "active" : ""}`}>
                      <input
                        type="checkbox"
                        checked={effectiveIncludeTravelCosts}
                        disabled={!canCalculateTravelCosts}
                        onChange={(event) => setIncludeTravelCosts(event.target.checked)}
                      />
                      <span className="calculator-module-main">
                        <strong>Prijs implementatie inclusief reiskosten</strong>
                        <span>{formatDays(travelImplementationDays)} x {euro.format(travelCostQuote?.pricePerDay ?? 0)}</span>
                      </span>
                      <span className="calculator-module-state">{effectiveIncludeTravelCosts ? "Aan" : "Uit"}</span>
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
                        onChange={(event) => setTravelPostcodePrefix(normalizePostcodePrefix(event.target.value))}
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
                </div>

                <div className="section">
                  <div className="section-title"><LifeBuoy size={16} /> Support</div>
                  <div className="calculator-module-grid">
                    <label className={`calculator-module-card ${includeSupport ? "active" : ""}`}>
                      <input
                        type="checkbox"
                        checked={includeSupport}
                        onChange={(event) => setIncludeSupport(event.target.checked)}
                      />
                      <span className="calculator-module-main">
                        <strong>Supportcontract Smart Trade {activeResult.name}</strong>
                        <span>{euro.format(activeResult.supportMonthly)} p/m voor {totalUsers} gebruikers</span>
                      </span>
                      <span className="calculator-module-state">{includeSupport ? "Aan" : "Uit"}</span>
                    </label>
                  </div>
                </div>

                <div className="section">
                  <div className="section-title"><Boxes size={16} /> Klantportaal</div>
                  <div className="calculator-module-grid">
                    {pricingConfig.customerPortalOptions.map((option) => {
                      const active = selectedCustomerPortalOptionKeys.includes(option.key);

                      return (
                        <label key={option.key} className={`calculator-module-card ${active ? "active" : ""}`}>
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={(event) => toggleCustomerPortalOption(option.key, event.target.checked)}
                          />
                          <span className="calculator-module-main">
                            <strong>{option.name}</strong>
                            <span>{euro.format(option.monthlyPrice)} p/m</span>
                          </span>
                          <span className="calculator-module-state">{active ? "Aan" : "Uit"}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="section">
                  <div className="section-title"><Calculator size={16} /> Smart Connect</div>
                  <div className="field-grid-2">
                    <label className="input-wrap">
                      <span className="input-label">Connecties</span>
                      <NumberStepper
                        ariaLabel="Smart Connect connecties"
                        min={0}
                        value={smartConnectConnections}
                        onChange={(nextValue) => setSmartConnectConnections(Math.max(0, Math.floor(nextValue)))}
                      />
                    </label>

                    <div className="input-wrap">
                      <span className="input-label">Prijs</span>
                      <div className="summary-list">
                        <div><span>Aantal</span><strong>{formatConnectionCount(smartConnectPricing.connectionCount)}</strong></div>
                        {smartConnectPricing.baseTier ? (
                          <div>
                            <span>Staffel {formatConnectionCount(smartConnectPricing.baseTier.connections)}</span>
                            <strong>{euro.format(smartConnectPricing.baseTier.monthlyPrice)} p/m</strong>
                          </div>
                        ) : null}
                        {smartConnectPricing.extraConnections > 0 ? (
                          <div>
                            <span>{smartConnectPricing.extraConnections} extra connecties</span>
                            <strong>{euro.format(smartConnectPricing.extraMonthly)} p/m</strong>
                          </div>
                        ) : null}
                        <div className="total-row"><span>Smart Connect</span><strong>{euro.format(smartConnectPricing.monthlyTotal)} p/m</strong></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="section">
                  <div className="section-title"><Package size={16} /> Pakket</div>
                  <div className="package-grid">
                    {packages.map((pkg) => {
                      const isActive = pkg.key === activeResult.key;
                      return (
                        <button key={pkg.key} type="button" className={`package-button ${isActive ? "active" : ""}`} onClick={() => setSelectedPackage(pkg.key)}>
                          <div className="package-header">
                            <div>
                              <div className="package-name">{pkg.name}</div>
                              <div className="muted">{pkg.includedModules} inbegrepen modules</div>
                            </div>
                            {isActive ? <CheckCircle2 size={18} /> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="section">
                  <div className="section-title"><SlidersHorizontal size={16} /> Modules</div>
                  <div className="calculator-module-grid">
                    {modules.map((module) => {
                      const active = (quantities[module.key] ?? 0) > 0;

                      return (
                        <label key={module.key} className={`calculator-module-card ${active ? "active" : ""}`}>
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={(event) => setQuantities((prev) => ({ ...prev, [module.key]: event.target.checked ? 1 : 0 }))}
                          />
                          <span className="calculator-module-main">
                            <strong>{module.name}</strong>
                            <span>{euro.format(module.monthlyPrice)} p/m</span>
                          </span>
                          <span className="calculator-module-state">{active ? "Aan" : "Uit"}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="section">
                  <div className="section-title"><Code2 size={16} /> Ontwikkelingen</div>
                  <DevelopmentLinesEditor
                    lines={developmentLines}
                    hourlyRate={developmentHourlyRate}
                    onChange={setDevelopmentLines}
                  />
                </div>
              </>
            )}
          </section>

          <section className="stack-4">
            <div className="card panel">
              <div className="top-row">
                <div>
                  <div className="eyebrow">Herberekend</div>
                  <h2 className="headline">{isAssetsExpansionDeal ? "Uitbreiding" : activeResult.name}</h2>
                </div>
                <StatusPill tone="success">{isAssetsExpansionDeal ? "Assets offerte" : "Live berekening"}</StatusPill>
              </div>

              <div className="stats-grid">
                {isAssetsExpansionDeal ? (
                  expansionPriceComparison ? (
                    <>
                      <div className="soft-card"><div className="kpi-title">Huidig p/m</div><div className="big-number">{euro.format(expansionPriceComparison.currentMonthly)}</div></div>
                      <div className="soft-card"><div className="kpi-title">Uitbreiding p/m</div><div className="big-number">+ {euro.format(expansionTotals.monthly)}</div></div>
                      <div className="soft-card"><div className="kpi-title">Nieuw p/m</div><div className="big-number">{euro.format(expansionPriceComparison.newMonthly)}</div></div>
                      <div className="soft-card"><div className="kpi-title">Eenmalig</div><div className="big-number">{euro.format(implementationTotal)}</div></div>
                    </>
                  ) : (
                    <>
                      <div className="soft-card"><div className="kpi-title">Maand</div><div className="big-number">{euro.format(expansionTotals.monthly)}</div></div>
                      <div className="soft-card"><div className="kpi-title">Jaar</div><div className="big-number">{euro.format(expansionTotals.annual)}</div></div>
                      <div className="soft-card"><div className="kpi-title">Setup</div><div className="big-number">{euro.format(implementationTotal)}</div></div>
                      <div className="soft-card"><div className="kpi-title">Regels</div><div className="big-number">{assetsExpansion?.lines.length ?? 0}</div></div>
                    </>
                  )
                ) : (
                  <>
                    <div className="soft-card"><div className="kpi-title">Licentie p/m</div><div className="big-number">{euro.format(licenseWithModulesMonthly)}</div></div>
                    <div className="soft-card"><div className="kpi-title">Support p/m</div><div className="big-number">{euro.format(supportMonthly)}</div></div>
                    <div className="soft-card"><div className="kpi-title">Uitbreidingen p/m</div><div className="big-number">{euro.format(expansionMonthlyTotal)}</div></div>
                  </>
                )}
              </div>

              <div className="proposal-grid">
                <div className="soft-card">
                  <div className="section-title"><FileText size={16} /> Prijsopbouw</div>
                  <div className="summary-list">
                    {isAssetsExpansionDeal ? (
                      <>
                        {expansionPriceComparison ? (
                          <>
                            <div><span>Pakket, gebruikers, support en modules</span><strong>{euro.format(expansionPriceComparison.currentPackageMonthly)}</strong></div>
                            <div><span>Klantportaal</span><strong>{euro.format(expansionPriceComparison.currentCustomerPortalMonthly)}</strong></div>
                            <div><span>Smart Connect</span><strong>{euro.format(expansionPriceComparison.currentSmartConnectMonthly)}</strong></div>
                            <div><span>Huidige maandprijs</span><strong>{euro.format(expansionPriceComparison.currentMonthly)}</strong></div>
                            <div><span>Uitbreiding per maand</span><strong>+ {euro.format(expansionTotals.monthly)}</strong></div>
                            <div className="total-row"><span>Nieuwe maandprijs</span><strong>{euro.format(expansionPriceComparison.newMonthly)}</strong></div>
                            {(expansionPriceComparison.currentAnnual > 0 || expansionPriceComparison.newAnnual > 0) ? (
                              <>
                                <div><span>Huidige servicekosten per jaar</span><strong>{euro.format(expansionPriceComparison.currentAnnual)}</strong></div>
                                <div><span>Uitbreiding servicekosten per jaar</span><strong>+ {euro.format(expansionTotals.annual)}</strong></div>
                                <div className="total-row"><span>Nieuwe servicekosten per jaar</span><strong>{euro.format(expansionPriceComparison.newAnnual)}</strong></div>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <div className="total-row"><span>Maandbedrag</span><strong>{euro.format(expansionTotals.monthly)}</strong></div>
                            {expansionTotals.annual > 0 ? <div><span>Jaarbedrag</span><strong>{euro.format(expansionTotals.annual)}</strong></div> : null}
                          </>
                        )}
                        {expansionTotals.once > 0 ? <div><span>Setup en diversen</span><strong>{euro.format(expansionTotals.once)}</strong></div> : null}
                        {effectiveIncludeTravelCosts && travelCostQuote ? (
                          <div>
                            <span>
                              Reiskosten ({Math.ceil(travelImplementationDays)} {Math.ceil(travelImplementationDays) === 1 ? "afspraak" : "afspraken"} op locatie)
                            </span>
                            <strong>{euro.format(travelCostTotal)}</strong>
                          </div>
                        ) : null}
                        <div className="total-row"><span>Eenmalig totaal</span><strong>{euro.format(implementationTotal)}</strong></div>
                      </>
                    ) : (
                      <PriceBreakdown summary={{
                        licenseMonthly: licenseWithModulesMonthly,
                        supportMonthly,
                        customerPortalMonthly: customerPortalMonthlyTotal,
                        smartConnectMonthly: smartConnectPricing.monthlyTotal,
                        monthlyTotal,
                        implementationBase: activeResult.implementationBase,
                        implementationAdjustment: manualImplementationAdjustment,
                        travelCosts: travelCostTotal,
                        onSiteAppointments: effectiveIncludeTravelCosts && travelCostQuote
                          ? Math.ceil(travelImplementationDays)
                          : 0,
                        implementationTotal,
                        developmentHours: developmentLines.reduce((sum, line) => sum + Math.max(0, line.hours), 0),
                        developmentTotal,
                        oneTimeTotal,
                      }} />
                    )}
                  </div>
                </div>

                <div className="proposal-card">
                  <div className="proposal-brand">{isAssetsExpansionDeal ? "Offerte samenvatting" : quoteTitle || "Prijsvoorstel"}</div>
                  <div className="proposal-title">{isAssetsExpansionDeal ? quoteTitle || "Uitbreiding" : activeResult.name}</div>
                  <div className="proposal-meta">{customerName || "Nog niet ingevuld"} · {contactName || "Geen contactpersoon"}</div>
                  <div className="proposal-total">{euro.format(isAssetsExpansionDeal ? expansionPriceComparison?.newMonthly ?? expansionTotals.monthly : monthlyTotal)} p/m</div>
                  {isAssetsExpansionDeal && expansionPriceComparison ? (
                    <>
                      <div className="proposal-sub">Huidig {euro.format(expansionPriceComparison.currentMonthly)} p/m · uitbreiding + {euro.format(expansionTotals.monthly)} p/m</div>
                      {implementationTotal > 0 ? <div className="proposal-sub">Eenmalig: {euro.format(implementationTotal)}</div> : null}
                    </>
                  ) : isAssetsExpansionDeal && implementationTotal === 0 ? (
                    <div className="proposal-sub">{assetsExpansion?.lines.length ?? 0} uitbreidingsregel{assetsExpansion?.lines.length === 1 ? "" : "s"}</div>
                  ) : (
                    <div className="proposal-sub">Eenmalig: {euro.format(oneTimeTotal)}</div>
                  )}
                </div>
              </div>

              <div className="section">
                <div className="section-title"><FileText size={16} /> Offerte layout</div>
                <div className="quote-layout-grid">
                  {QUOTE_LAYOUTS.map((layout) => {
                    const active = layout.key === quoteLayout;

                    return (
                      <button
                        key={layout.key}
                        type="button"
                        className={`quote-layout-option ${active ? "active" : ""}`}
                        onClick={() => setQuoteLayout(layout.key)}
                      >
                        <strong>{layout.name}</strong>
                        <span>{layout.description}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="quote-outlook-controls">
                  <label className="input-wrap">
                    <span className="input-label">E-mailadres klant</span>
                    <input
                      className="input"
                      type="email"
                      value={customerIntakeEmail}
                      onChange={(event) => setCustomerIntakeEmail(event.target.value)}
                      placeholder="naam@bedrijf.nl"
                    />
                  </label>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={quoteOutlookBusy}
                    onClick={() => void handleQuoteOutlookDraft()}
                  >
                    <Mail size={16} />
                    {quoteOutlookBusy ? "Concept maken..." : "Klaarzetten in Outlook"}
                  </button>
                </div>
                {quoteOutlookLink ? (
                  <div className="button-row compact quote-outlook-fallback">
                    <a
                      href={quoteOutlookLink}
                      className="secondary-button"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={16} />
                      Outlook-concept openen
                    </a>
                  </div>
                ) : null}
                <div className={`deal-approval-summary ${acceptedAt ? "accepted" : approvalRequestedAt ? "pending" : "idle"}`}>
                  <div>
                    <span>Akkoord klant</span>
                    <strong>
                      {acceptedAt
                        ? "Offerte geaccepteerd"
                        : approvalRequestedAt
                          ? approvalExpired
                            ? "Akkoordlink is verlopen"
                            : "Wachten op akkoord"
                          : approvalStatus === "revoked"
                            ? "Offerte gewijzigd"
                            : "Nog niet verstuurd"}
                    </strong>
                  </div>
                  <p>
                    {acceptedAt
                      ? `${acceptedByName || "Klant"}${acceptedByEmail ? ` · ${acceptedByEmail}` : ""} · ${formatApprovalDate(acceptedAt)}`
                      : approvalRequestedAt
                        ? `Klaargezet op ${formatApprovalDate(approvalRequestedAt)}${approvalExpiresAt ? ` · geldig tot ${formatApprovalDate(approvalExpiresAt)}` : ""}`
                        : approvalStatus === "revoked"
                          ? "De offertegegevens zijn gewijzigd. Maak via Outlook een nieuw concept met een nieuwe akkoordlink."
                          : "Bij het klaarzetten in Outlook wordt automatisch een beveiligde akkoordlink toegevoegd."}
                  </p>
                  {approvalStatus ? (
                    <button
                      type="button"
                      className="secondary-button deal-approval-refresh"
                      onClick={() => void refreshDealApproval()}
                    >
                      <RefreshCw size={15} /> Status vernieuwen
                    </button>
                  ) : null}
                </div>
                {isNewCustomerDeal && !acceptedAt ? (
                  <label className="deal-manual-approval">
                    <input
                      type="checkbox"
                      checked={false}
                      disabled={manualApprovalBusy}
                      onChange={(event) => void handleManualCustomerApproval(event.target.checked)}
                    />
                    <span>
                      <strong>Klant heeft akkoord gegeven</strong>
                      <small>Leg een mondeling of per e-mail ontvangen akkoord handmatig vast.</small>
                    </span>
                    <em>{manualApprovalBusy ? "Opslaan..." : "Akkoord vastleggen"}</em>
                  </label>
                ) : null}
              </div>

              {!isAssetsExpansionDeal && assetsExpansion?.lines?.length ? (
                <div className="section">
                  <div className="section-title"><FileText size={16} /> Uitbreidingen vanuit Assets</div>
                  <div className="summary-list">
                    {assetsExpansion.lines.map((line, index) => (
                      <div key={`${line.group}-${line.label}-${index}`}>
                        <span>{line.quantity}x {line.label}</span>
                        <strong>{formatExpansionAmount(line)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="section">
                <TextArea label="Notities" value={notes} onChange={setNotes} placeholder="Interne of commerciële notities" />
                <div className="button-row">
                  <button type="button" className="primary-button" onClick={() => void handleSave()}><CloudUpload size={16} /> Opslaan en herberekenen</button>
                  <button type="button" className="secondary-button" onClick={() => void handlePdfExport()}><Download size={16} /> Exporteer PDF</button>
                </div>
                {status ? <div className="save-status">{status}</div> : null}
              </div>
            </div>
          </section>
        </div>

        {isAssetsExpansionDeal ? (
          <section className="card panel">
            <div className="top-row">
              <div>
                <div className="eyebrow">Offerte</div>
                <h2 className="headline">Toelichting offerte</h2>
                <p className="subtext">
                  Schrijf hier de begeleidende tekst die de klant op de uitbreidingen-offerte leest.
                </p>
              </div>
              <div className="icon-badge"><FileText size={26} /></div>
            </div>

            <TextArea
              label="Begeleidende tekst"
              value={assetsExpansion?.guidanceText ?? ""}
              onChange={(guidanceText) => setAssetsExpansion((currentExpansion) => (
                currentExpansion ? { ...currentExpansion, guidanceText } : currentExpansion
              ))}
              placeholder="Bijvoorbeeld: Met deze uitbreiding kunnen jullie..."
            />
          </section>
        ) : null}

        {showCustomerIntake ? (
          <section id="klantformulier" className="card panel customer-intake-panel">
            <div className="top-row customer-intake-heading">
              <div>
                <div className="eyebrow">Nieuwe klant</div>
                <h2 className="headline">Klantformulier</h2>
                <div className="subtext">
                  {customerIntake?.submittedAt
                    ? `Ontvangen op ${new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short" }).format(new Date(customerIntake.submittedAt))}`
                    : "Beveiligde klantlink en PDF voor de gegevens van een nieuwe klant."}
                </div>
              </div>
              <StatusPill tone={customerIntakeTone}>{customerIntakeLabel}</StatusPill>
            </div>

            <div className="customer-intake-controls">
              <div className="customer-intake-fields">
                <label className="input-wrap customer-intake-email">
                  <span className="input-label">E-mailadres klant</span>
                  <input
                    className="input"
                    type="email"
                    value={customerIntakeEmail}
                    onChange={(event) => setCustomerIntakeEmail(event.target.value)}
                    placeholder="naam@bedrijf.nl"
                  />
                </label>
                <label className="input-wrap customer-intake-relation-id">
                  <span className="input-label">Smart Trade relatie-ID (optioneel)</span>
                  <input
                    className="input"
                    type="text"
                    inputMode="numeric"
                    value={customerIntakeRelationId}
                    onChange={(event) => setCustomerIntakeRelationId(event.target.value)}
                    onBlur={() => void saveCustomerIntakeRelationId()}
                    placeholder="Bijv. 2498"
                  />
                  <span className="input-help">Vul dit alleen in wanneer de relatie al handmatig in Smart Trade is aangemaakt.</span>
                </label>
              </div>

              <div className="customer-intake-actions">
                {!customerIntake ? (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={customerIntakeBusy}
                    onClick={() => void saveCustomerIntake(false)}
                  >
                    <Mail size={16} />
                    {customerIntakeBusy ? "Link maken..." : "Klantlink maken"}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={customerIntakeBusy}
                      onClick={() => void handleOpenCustomerIntake()}
                    >
                      <ExternalLink size={16} /> Open formulier
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={customerIntakeBusy}
                      onClick={() => void handleCopyCustomerIntakeLink()}
                    >
                      <ClipboardCopy size={16} /> Kopieer link
                    </button>
                  </>
                )}

                <button
                  type="button"
                  className="primary-button"
                  disabled={customerIntakeBusy || customerOutlookBusy}
                  onClick={() => void handleOutlookDraft()}
                >
                  <Mail size={16} />
                  {customerOutlookBusy ? "Concept maken..." : "Klaarzetten in Outlook"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={customerIntakeBusy}
                  onClick={() => void handleCustomerIntakePdf()}
                >
                  <Download size={16} />
                  {customerIntake?.submittedAt ? "Download ingevulde PDF" : "Download lege PDF"}
                </button>
                {customerIntake ? (
                  <>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={customerIntakeBusy}
                      onClick={() => void refreshCustomerIntake()}
                    >
                      <RefreshCw size={16} /> Status vernieuwen
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={customerIntakeBusy}
                      onClick={() => void saveCustomerIntake(true)}
                    >
                      <Link2 size={16} /> Nieuwe link
                    </button>
                    {customerIntake.submittedAt ? (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={customerIntakeBusy || !customerIntake.smartTradeRelationId}
                        onClick={() => void syncCustomerIntakeWithSmartTrade()}
                      >
                        <RefreshCw size={16} />
                        {customerIntake.smartTradeSyncedAt
                          ? "Opnieuw verwerken"
                          : "Verwerken in Smart Trade"}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>

            {customerIntake?.smartTradeSyncError ? (
              <div className="customer-intake-sync-message error">
                Smart Trade-verwerking mislukt: {customerIntake.smartTradeSyncError}
              </div>
            ) : customerIntake?.smartTradeSyncedAt ? (
              <div className="customer-intake-sync-message success">
                Verwerkt in Smart Trade-relatie {customerIntake.smartTradeRelationId} op{" "}
                {new Intl.DateTimeFormat("nl-NL", {
                  dateStyle: "long",
                  timeStyle: "short",
                }).format(new Date(customerIntake.smartTradeSyncedAt))}.
              </div>
            ) : null}

            {customerIntake?.submittedAt ? (
              <div className="customer-intake-summary">
                <div>
                  <span>Naam</span>
                  <strong>{customerIntake.formData.deliveryName || "-"}</strong>
                </div>
                <div>
                  <span>Afleveradres</span>
                  <strong>
                    {[
                      customerIntake.formData.deliveryStreet,
                      customerIntake.formData.deliveryNumber,
                      customerIntake.formData.deliveryPostcode,
                      customerIntake.formData.deliveryCity,
                    ].filter(Boolean).join(" ") || "-"}
                  </strong>
                </div>
                <div>
                  <span>Contactpersoon</span>
                  <strong>{customerIntake.formData.contactName || "-"}</strong>
                </div>
                <div>
                  <span>E-mail administratie</span>
                  <strong>{customerIntake.formData.administrationEmail || "-"}</strong>
                </div>
                <div>
                  <span>Website</span>
                  <strong>{customerIntake.formData.website || "-"}</strong>
                </div>
                <div>
                  <span>BTW-nummer</span>
                  <strong>{customerIntake.formData.vatNumber || "-"}</strong>
                </div>
                <div>
                  <span>KvK-nummer</span>
                  <strong>{customerIntake.formData.chamberOfCommerceNumber || "-"}</strong>
                </div>
                <div>
                  <span>Automatische incasso</span>
                  <strong>{customerIntake.formData.directDebit === "yes" ? "Ja" : "Nee"}</strong>
                </div>
                {customerIntake.formData.directDebit === "yes" ? (
                  <>
                    <div>
                      <span>Naam rekeninghouder</span>
                      <strong>{customerIntake.formData.directDebitAccountHolder || "-"}</strong>
                    </div>
                    <div>
                      <span>IBAN</span>
                      <strong>{customerIntake.formData.directDebitBankAccount || "-"}</strong>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            {customerIntake?.directDebitMandate ? (
              <div className="customer-intake-mandate-summary">
                <div className="customer-intake-mandate-heading">
                  <span>Digitale incassomachtiging</span>
                  <strong>Bewijs lokaal vastgelegd</strong>
                </div>
                <dl>
                  <div>
                    <dt>Mandaatkenmerk</dt>
                    <dd>{customerIntake.directDebitMandate.mandateReference}</dd>
                  </div>
                  <div>
                    <dt>Geaccepteerd op</dt>
                    <dd>
                      {new Intl.DateTimeFormat("nl-NL", {
                        dateStyle: "long",
                        timeStyle: "short",
                      }).format(new Date(customerIntake.directDebitMandate.acceptedAt))}
                    </dd>
                  </div>
                  <div>
                    <dt>IP-adres</dt>
                    <dd>{customerIntake.directDebitMandate.ipAddress || "Niet beschikbaar"}</dd>
                  </div>
                  <div>
                    <dt>Browser</dt>
                    <dd>{customerIntake.directDebitMandate.userAgent || "Niet beschikbaar"}</dd>
                  </div>
                </dl>
              </div>
            ) : null}

            {customerIntakeStatus ? <div className="save-status">{customerIntakeStatus}</div> : null}
          </section>
        ) : null}

        {!isAssetsExpansionDeal && implementation ? (
          <section className="card panel customer-intake-panel">
            <div className="top-row customer-intake-heading">
              <div>
                <div className="eyebrow">Implementatie</div>
                <h2 className="headline">Vervolg nieuwe klant</h2>
                <div className="subtext">
                  Bereid de interne nieuwe klantmail en implementatieorder vanuit deze deal voor.
                </div>
              </div>
              <StatusPill tone="success">Implementatie actief</StatusPill>
            </div>

            <div className="implementation-communication-stack">
              <article className="implementation-communication-card">
                <div className="implementation-communication-icon"><FileText size={22} /></div>
                <div className="implementation-communication-copy">
                  <span>Klantformulier</span>
                  <strong>
                    {customerIntake?.submittedAt
                      ? "Ontvangen van de klant"
                      : customerIntake
                        ? "Klaar om te delen"
                        : "Klantlink voorbereiden"}
                  </strong>
                  <p>
                    {customerIntake?.submittedAt
                      ? "Bekijk hier de ingevulde gegevens van de nieuwe klant."
                      : customerIntake
                        ? "De klantlink is gemaakt en kan via Outlook met de klant worden gedeeld."
                        : "Maak de klantlink en zet de e-mail voor de klant direct klaar in Outlook."}
                  </p>
                </div>
                <div className="implementation-order-actions">
                  {customerIntake?.submittedAt ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => document.getElementById("klantformulier")?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      })}
                    >
                      <FileText size={16} /> Klantformulier bekijken
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="primary-button"
                    disabled={customerIntakeBusy || customerOutlookBusy}
                    title={customerIntakeEmail.trim()
                      ? "Maak de klantlink en zet de e-mail in Outlook klaar"
                      : "Vul eerst het e-mailadres van de klant in bij Offerte layout"}
                    onClick={() => void handleOutlookDraft()}
                  >
                    <Mail size={16} /> {customerOutlookBusy
                      ? "Concept maken..."
                      : "Klantlink delen via Outlook"}
                  </button>
                </div>
              </article>

              <article className="implementation-communication-card">
                <div className="implementation-communication-icon"><Mail size={22} /></div>
                <div className="implementation-communication-copy">
                  <span>Nieuwe klantmail</span>
                  <strong>{newCustomerMailReady ? "Klaar om te maken" : "Nog niet compleet"}</strong>
                  <p>
                    {newCustomerMailReady
                      ? "Aan martijn@troublefree.nl, met de overige gebruikers in CC."
                      : `Nog nodig: ${newCustomerMailMissingFields.join(", ")}.`}
                  </p>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!canManageImplementation || !newCustomerMailReady || newCustomerOutlookBusy}
                  title={newCustomerMailReady
                    ? "Maak de interne nieuwe klantmail in Outlook"
                    : `Nog nodig: ${newCustomerMailMissingFields.join(", ")}`}
                  onClick={() => void handleNewCustomerOutlookDraft()}
                >
                  <Mail size={16} /> {newCustomerOutlookBusy ? "Concept maken..." : "Klaarzetten in Outlook"}
                </button>
              </article>

              <article className="implementation-communication-card implementation-order-card">
                <div className="implementation-communication-icon"><ClipboardCheck size={22} /></div>
                <div className="implementation-communication-copy">
                  <span>Implementatieorder</span>
                  <strong>
                    {implementation.smart_trade_order_id
                      ? `Smart Trade-order ${implementation.smart_trade_order_id}`
                      : customerIntakeRelationId
                        ? `Relatie ${customerIntakeRelationId}`
                        : "Order wordt voorbereid"}
                  </strong>
                  <p>
                    {implementation.smart_trade_order_id
                      ? "De implementatieorder is verwerkt in Smart Trade."
                      : customerIntakeRelationId
                        ? "Controleer de order voordat deze live wordt aangemaakt."
                        : "Koppel of verwerk eerst de Smart Trade-relatie via het klantformulier."}
                  </p>
                </div>
                {implementation.smart_trade_order_id ? (
                  <StatusPill tone="success">Verwerkt</StatusPill>
                ) : (
                  <div className="implementation-order-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!canManageImplementation || !customerIntakeRelationId || Boolean(implementationOrderBusy)}
                      onClick={() => void handleImplementationOrder("preview")}
                    >
                      {implementationOrderBusy === "preview"
                        ? <LoaderCircle className="implementation-dns-spinner" size={16} />
                        : <ClipboardCheck size={16} />}
                      {implementationOrderBusy === "preview" ? "Controleren..." : "Order controleren"}
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={!canManageImplementation || !implementationOrderPreview || Boolean(implementationOrderBusy)}
                      title={implementationOrderPreview
                        ? "Maak de gecontroleerde order live aan in Smart Trade"
                        : "Controleer de order eerst"}
                      onClick={() => void handleImplementationOrder("create")}
                    >
                      {implementationOrderBusy === "create"
                        ? <LoaderCircle className="implementation-dns-spinner" size={16} />
                        : <ClipboardCheck size={16} />}
                      {implementationOrderBusy === "create" ? "Aanmaken..." : "Aanmaken in Smart Trade"}
                    </button>
                  </div>
                )}
                {implementationOrderMessage ? (
                  <div className={`implementation-order-message ${implementationOrderMessageTone}`}>
                    {implementationOrderMessage}
                  </div>
                ) : null}
              </article>
            </div>
          </section>
        ) : null}

        {!isAssetsExpansionDeal ? (
          <section className="card panel customer-intake-panel">
            <div className="top-row customer-intake-heading">
              <div>
                <div className="eyebrow">Stap 3</div>
                <h2 className="headline">Assets aanmaken</h2>
                <div className="subtext">
                  Maak de afgenomen licentie, gebruikers, modules, klantportaal en Smart Connect live aan in Smart Trade.
                </div>
              </div>
              <StatusPill tone={assetsComplete
                ? "success"
                : assetsPending
                  ? "warning"
                  : "neutral"}
              >
                {assetsComplete
                  ? "Aangemaakt"
                  : assetsPending
                    ? "In verwerking"
                    : "Nog niet aangemaakt"}
              </StatusPill>
            </div>

            <div className="customer-intake-controls">
              <div className="customer-intake-fields">
                <div className="customer-intake-summary asset-creation-summary">
                  <div>
                    <span>Relatie-ID</span>
                    <strong>{assetOverview?.relationId ?? (customerIntakeRelationId || "-")}</strong>
                  </div>
                  <div>
                    <span>Administratienaam</span>
                    <strong>{assetOverview?.administrationName || "-"}</strong>
                  </div>
                  <div>
                    <span>Startdatum assets</span>
                    <strong>{assetOverview?.plannedGoLiveDate
                      ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(assetOverview.plannedGoLiveDate))
                      : "-"}</strong>
                  </div>
                </div>
              </div>

              <div className="customer-intake-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={assetCreationBusy}
                  onClick={() => void refreshDealAssets()}
                >
                  <RefreshCw size={16} /> Vernieuwen
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={assetCreationBusy || !assetOverview?.ready || assetsPending || assetOverview.missingCount === 0}
                  onClick={() => void handleCreateAssets()}
                >
                  <Boxes size={16} />
                  {assetCreationBusy
                    ? "Assets aanmaken..."
                    : assetsComplete
                      ? "Assets aangemaakt"
                      : "Assets aanmaken"}
                </button>
              </div>
            </div>

            {assetOverview?.prerequisiteErrors.map((error) => (
              <div className="customer-intake-sync-message error" key={error}>{error}</div>
            ))}
            {assetOverview?.warnings.map((warning) => (
              <div className="customer-intake-sync-message" key={warning}>{warning}</div>
            ))}
            {assetOverview?.items.length ? (
              <div className="summary-list">
                {assetOverview.items.map((item) => (
                  <div key={item.key}>
                    <span>{item.name}</span>
                    <strong>
                      {item.status === "created"
                        ? `Asset ${item.smartTradeAssetId}`
                        : item.status === "pending"
                          ? "In verwerking"
                          : "Klaar om aan te maken"}
                    </strong>
                  </div>
                ))}
              </div>
            ) : null}
            {assetCreationStatus ? <div className="save-status">{assetCreationStatus}</div> : null}
          </section>
        ) : null}
        </fieldset>
      </div>
    </div>
  );
}
