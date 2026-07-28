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
  ClipboardCopy,
  CloudUpload,
  Download,
  ExternalLink,
  FileText,
  LifeBuoy,
  Link2,
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
import { getDealWithFallback, updateDealWithFallback } from "@/lib/deal-storage";
import { calculatePricing, euro, getMinimumPackageForPaidModules, getPaidSelectedModuleCount, MODULES, type ModuleConfig } from "@/lib/pricing";
import { getTravelCostQuoteForPostcode, normalizePostcodePrefix, type SmartConnectPriceTier } from "@/lib/price-config";
import { QUOTE_LAYOUTS, normalizeQuoteLayout, type QuoteLayoutKey } from "@/lib/quote-layouts";
import { type AssetExpansionLine, type AssetExpansionSummary, type DealCalculatorInputs, type DealRecord, getSupabaseClient, getUserDisplayName } from "@/lib/supabase";
import { NumberStepper } from "@/components/number-stepper";
import { NumberInput, StatCard, StatusPill, TextArea, TextInput } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { usePricingConfig } from "@/components/pricing-provider";

function toQuantities(dealModules: DealRecord["modules"] | undefined, modules: ModuleConfig[] = MODULES): Record<string, number> {
  const base = Object.fromEntries(modules.map((module) => [module.key, 0]));
  if (!Array.isArray(dealModules)) return base;
  for (const item of dealModules as Array<{ key?: string; qty?: number }>) {
    if (item?.key && Object.prototype.hasOwnProperty.call(base, item.key)) {
      base[item.key] = Number(item.qty || 0);
    }
  }
  return base;
}

function normalizeInputs(deal: DealRecord, modules: ModuleConfig[]): DealCalculatorInputs {
  const customerPortalOptionKeys = deal.calculator_inputs?.customerPortalOptionKeys;

  return {
    extraUsers: Math.max(0, Number(deal.calculator_inputs?.extraUsers ?? Number(deal.total_users || 1) - 1)),
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

function getWebsiteDomain(website: string) {
  const value = website.trim();
  if (!value) return "";

  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return value
      .replace(/^[a-z][a-z\d+.-]*:\/\//i, "")
      .split("/")[0]
      .split(":")[0]
      .toLowerCase()
      .replace(/^www\./, "");
  }
}

function getGreetingName(name: string) {
  return name.trim().split(/\s+/)[0] || "";
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

export default function DealEditor({ dealId }: { dealId: string }) {
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
  const [archivedAt, setArchivedAt] = useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [customerIntake, setCustomerIntake] = useState<CustomerIntakeSummary | null>(null);
  const [customerIntakeEmail, setCustomerIntakeEmail] = useState("");
  const [customerIntakeStatus, setCustomerIntakeStatus] = useState("");
  const [customerIntakeBusy, setCustomerIntakeBusy] = useState(false);
  const [customerOutlookBusy, setCustomerOutlookBusy] = useState(false);
  const [quoteOutlookBusy, setQuoteOutlookBusy] = useState(false);
  const [quoteOutlookLink, setQuoteOutlookLink] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [quoteTitle, setQuoteTitle] = useState("Prijsvoorstel Smart Trade");
  const [contactName, setContactName] = useState("");
  const [salesName, setSalesName] = useState("");
  const [notes, setNotes] = useState("");

  const [extraUsers, setExtraUsers] = useState(1);
  const [selectedPackage, setSelectedPackage] = useState("enterprise");
  const [manualImplementationAdjustment, setManualImplementationAdjustment] = useState(0);
  const includeVat = false;
  const [includeSupport, setIncludeSupport] = useState(true);
  const [includeTravelCosts, setIncludeTravelCosts] = useState(true);
  const [travelPostcodePrefix, setTravelPostcodePrefix] = useState("");
  const [selectedCustomerPortalOptionKeys, setSelectedCustomerPortalOptionKeys] = useState<string[]>([]);
  const [smartConnectConnections, setSmartConnectConnections] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>(Object.fromEntries(modules.map((module) => [module.key, 0])));
  const [quoteLayout, setQuoteLayout] = useState<QuoteLayoutKey>("standard");
  const [assetsExpansion, setAssetsExpansion] = useState<AssetExpansionSummary | null>(null);

  const currentSalesName = useMemo(() => getUserDisplayName(user, profile), [profile, user]);
  const currentSalesEmail = useMemo(() => user?.email ?? profile?.email ?? "", [profile, user]);
  const currentSalesTitle = profile?.job_title ?? "";
  const currentSalesWorkdays = profile?.workdays ?? "";
  const currentSalesPhone = profile?.mobile_phone ?? "";

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
      const inputs = normalizeInputs(deal, modules);

      setDealOwnerId(deal.user_id || user.id);
      setArchivedAt(deal.archived_at ?? null);
      setCustomerName(deal.customer_name || "");
      setQuoteTitle(deal.quote_title || "Prijsvoorstel Smart Trade");
      setContactName(deal.contact_name || "");
      setSalesName(deal.user_id === user.id && currentSalesName ? currentSalesName : deal.sales_name || "");
      setNotes(deal.notes || "");
      setExtraUsers(inputs.extraUsers);
      setSelectedPackage(inputs.selectedPackage);
      setManualImplementationAdjustment(inputs.manualImplementationAdjustment);
      setIncludeSupport(inputs.includeSupport ?? true);
      setIncludeTravelCosts(inputs.includeTravelCosts ?? true);
      setTravelPostcodePrefix(inputs.travelPostcodePrefix ?? "");
      setSelectedCustomerPortalOptionKeys(inputs.customerPortalOptionKeys ?? []);
      setSmartConnectConnections(inputs.smartConnectConnections ?? 0);
      setQuantities(inputs.quantities);
      setQuoteLayout(normalizeQuoteLayout(inputs.quoteLayout));
      setAssetsExpansion(inputs.assetsExpansion ?? null);
      setStatus(result.warning ?? "");

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
            setCustomerIntakeEmail(intakeJson.intake.recipientEmail);
          } else if (!intakeResponse.ok) {
            setCustomerIntakeStatus(intakeJson.error || "Klantformulier laden mislukt.");
          }
        } catch {
          setCustomerIntakeStatus("Klantformulier laden mislukt.");
        }
      }

      setLoading(false);
    }

    void loadDeal();
  }, [currentSalesName, dealId, modules, supabase, user]);

  useEffect(() => {
    if (loading || typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("outlook") !== "connected") return;

    setStatus("Outlook is verbonden. Klik nogmaals op 'Klaarzetten in Outlook' om het concept te maken.");
    url.searchParams.delete("outlook");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [loading]);

  const totalUsers = extraUsers + 1;
  const results = useMemo(
    () => calculatePricing({ extraUsers, manualImplementationAdjustment, includeVat: false, quantities }, pricingConfig),
    [extraUsers, manualImplementationAdjustment, pricingConfig, quantities],
  );
  const paidModuleCount = getPaidSelectedModuleCount(quantities, modules);
  const minimumPackage = getMinimumPackageForPaidModules(paidModuleCount, packages);
  const selectedPackageIndex = packages.findIndex((pkg) => pkg.key === selectedPackage);
  const minimumPackageIndex = packages.findIndex((pkg) => pkg.key === minimumPackage.key);
  const activePackage = packages[Math.max(selectedPackageIndex, minimumPackageIndex, 0)] ?? minimumPackage;
  const activeResult = results.find((pkg) => pkg.key === activePackage.key) ?? results[0];
  const isAssetsExpansionDeal = quoteLayout === "assets-expansion" && Boolean(assetsExpansion?.lines?.length);
  const expansionTotals = useMemo(() => getAssetExpansionTotals(assetsExpansion?.lines ?? []), [assetsExpansion]);
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
  const licenseWithModulesMonthly = activeResult.licenseMonthly + activeResult.moduleMonthly;
  const customerPortalMonthlyTotal = selectedCustomerPortalOptions.reduce((sum, option) => sum + option.monthlyPrice, 0);
  const expansionMonthlyTotal = customerPortalMonthlyTotal + smartConnectPricing.monthlyTotal;
  const monthlyTotal = Math.max(0, activeResult.monthlyAfterDiscount - activeResult.supportMonthly + supportMonthly + expansionMonthlyTotal);
  const implementationBaseTotal = isAssetsExpansionDeal ? expansionTotals.once : activeResult.implementationAfterAdjustment;
  const implementationDays = Math.max(0, implementationBaseTotal / pricingConfig.implementationDayRate);
  const travelCostQuote = useMemo(
    () => getTravelCostQuoteForPostcode(pricingConfig, travelPostcodePrefix),
    [pricingConfig, travelPostcodePrefix],
  );
  const travelCostTotal = includeTravelCosts && travelCostQuote
    ? implementationDays * travelCostQuote.pricePerDay
    : 0;
  const implementationTotal = implementationBaseTotal + travelCostTotal;
  const adjustedResult = useMemo(() => ({
    ...activeResult,
    supportFirst: includeSupport ? activeResult.supportFirst : 0,
    supportExtra: includeSupport ? activeResult.supportExtra : 0,
    supportMonthly,
    monthlyBase: monthlyTotal,
    monthlyAfterDiscount: monthlyTotal,
    recurringTotalContract: monthlyTotal,
    implementationAfterAdjustment: implementationTotal,
    contractValue: monthlyTotal * 12 + implementationTotal,
    annualRecurring: monthlyTotal * 12,
    monthlyInclVat: monthlyTotal * activeResult.vatMultiplier,
    implementationInclVat: implementationTotal * activeResult.vatMultiplier,
    contractValueInclVat: (monthlyTotal * 12 + implementationTotal) * activeResult.vatMultiplier,
  }), [activeResult, implementationTotal, includeSupport, monthlyTotal, supportMonthly]);
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

  async function handleSave() {
    if (!user) {
      setStatus("Je moet ingelogd zijn om deze deal op te slaan.");
      return;
    }
    const payload = isAssetsExpansionDeal
      ? {
          user_id: user.id,
          customer_name: customerName || null,
          quote_title: quoteTitle,
          contact_name: contactName || null,
          sales_name: salesName || currentSalesName || null,
          package_key: activeResult.key,
          package_name: "Uitbreiding",
          total_users: totalUsers,
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
            selectedPackage: activeResult.key,
            manualImplementationAdjustment: expansionTotals.once,
            includeVat,
            includeTravelCosts,
            travelPostcodePrefix,
            travelCostPerDay: travelCostQuote?.pricePerDay ?? 0,
            travelCostTotal,
            travelRegion: travelCostQuote?.postcodeRow?.region ?? null,
            quantities,
            quoteLayout,
            assetsExpansion,
          },
        }
      : {
      user_id: user.id,
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
      contract_value: monthlyTotal * 12 + implementationTotal,
      annual_recurring: monthlyTotal * 12,
      modules: selectedModuleRows,
      notes,
      calculator_inputs: {
        extraUsers,
        selectedPackage: activeResult.key,
        manualImplementationAdjustment,
        includeVat,
        includeSupport,
        includeTravelCosts,
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
        quantities,
        quoteLayout,
        assetsExpansion,
      },
    };

    const result = await updateDealWithFallback(supabase, dealId, payload);
    if (result.error) {
      setStatus(`Opslaan mislukt: ${result.error}`);
      return;
    }
    setStatus(result.warning ?? "Deal opnieuw berekend en opgeslagen.");
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
      salesName: currentSalesName || salesName,
      salesEmail: currentSalesEmail,
      salesPhone: currentSalesPhone,
      salesTitle: currentSalesTitle,
      salesWorkdays: currentSalesWorkdays,
      notes,
      includeVat,
      totalUsers,
      selectedModules: selectedModuleRows,
      extraMonthlyRows,
      result: adjustedResult,
      includeTravelCosts,
      travelPostcodePrefix,
      travelRegion: travelCostQuote?.postcodeRow?.region ?? null,
      travelDescription: travelCostQuote?.postcodeRow?.description ?? "",
      travelCostPerDay: travelCostQuote?.pricePerDay ?? 0,
      travelCostTotal,
      implementationDays,
      quoteLayout,
      assetsExpansion,
      expansionWorkItems: pricingConfig.expansionWorkItems,
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

      if (!navigateOutlookPopup(outlookWindow, json.webLink)) {
        window.location.assign(json.webLink);
      }
      setQuoteOutlookLink(json.webLink);
      setStatus("Outlook-concept met offerte-PDF is aangemaakt.");
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
      setCustomerIntakeEmail(json.intake.recipientEmail);
      setCustomerIntakeStatus(regenerate ? "Nieuwe klantlink is klaar." : "Klantlink is klaar.");
      return json.intake;
    } catch {
      setCustomerIntakeStatus("Klantlink maken mislukt.");
      return null;
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
      if (json.intake) setCustomerIntakeEmail(json.intake.recipientEmail);
      setCustomerIntakeStatus(json.intake?.submittedAt
        ? "De ingevulde klantgegevens zijn ontvangen."
        : "Status is bijgewerkt.");
    } catch {
      setCustomerIntakeStatus("Status vernieuwen mislukt.");
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

    if (!customerIntake || mustRegenerate || customerIntake.recipientEmail !== customerIntakeEmail.trim().toLowerCase()) {
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
      template: "customer-intake" | "dns-instructions";
      recipientEmail: string;
      customerName: string;
      contactName: string;
      publicUrl?: string;
      domain?: string;
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

  async function handleDnsOutlookDraft() {
    if (!customerIntake?.submittedAt) {
      setCustomerIntakeStatus("De klantgegevens moeten eerst ontvangen zijn.");
      return;
    }

    const recipientEmail = customerIntakeEmail.trim().toLowerCase();
    if (!recipientEmail || !/^\S+@\S+\.\S+$/.test(recipientEmail)) {
      setCustomerIntakeStatus("Vul eerst een geldig e-mailadres van de ontvanger in.");
      return;
    }

    const domain = getWebsiteDomain(customerIntake.formData.website);
    if (!domain) {
      setCustomerIntakeStatus("In het klantgegevensformulier ontbreekt een geldige website.");
      return;
    }
    if (customerOutlookBusy) return;

    const greetingName =
      customerIntake.formData.contactFirstName ||
      getGreetingName(customerIntake.formData.contactName || contactName);
    const outlookWindow = window.open("about:blank", "_blank");
    if (outlookWindow) outlookWindow.opener = null;
    setCustomerOutlookBusy(true);

    try {
      await openOutlookTemplateDraft(
        outlookWindow,
        {
          template: "dns-instructions",
          recipientEmail,
          customerName,
          contactName: greetingName,
          domain,
        },
        `DNS-concept voor ${domain} is aangemaakt.`,
      );
    } catch (error) {
      outlookWindow?.close();
      setCustomerIntakeStatus(
        error instanceof Error ? error.message : "DNS-concept maken mislukt.",
      );
    } finally {
      setCustomerOutlookBusy(false);
    }
  }

  async function handleCustomerIntakePdf() {
    setCustomerIntakeStatus("Klantgegevens-PDF wordt gemaakt...");
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
          directDebitBankAccount: "",
        },
      });
      setCustomerIntakeStatus(customerIntake?.submittedAt
        ? "Ingevulde klantgegevens-PDF is gemaakt."
        : "Leeg klantgegevensformulier is gemaakt.");
    } catch {
      setCustomerIntakeStatus("Klantgegevens-PDF maken mislukt.");
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
  const canArchiveDeal = Boolean(
    user && (role === "admin" || dealOwnerId === user.id),
  );

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
            <Link href="/deals" className="secondary-button"><ArrowLeft size={16} /> Terug naar deals</Link>
            {canArchiveDeal ? (
              <button
                type="button"
                className={archivedAt ? "secondary-button" : "primary-button"}
                onClick={() => void handleArchiveToggle()}
                disabled={archiveBusy}
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
            <StatusPill tone={archivedAt ? "neutral" : "success"}>
              {archivedAt ? "Gearchiveerd" : "Versie 8"}
            </StatusPill>
          </div>
        </header>

        <div className="kpi-grid">
          {isAssetsExpansionDeal ? (
            <>
              <StatCard title="Regels" value={String(assetsExpansion?.lines.length ?? 0)} icon={FileText} sublabel="Geselecteerde uitbreidingen" />
              <StatCard title="Maandbedrag" value={euro.format(expansionTotals.monthly)} icon={Users} sublabel="Alleen deze uitbreiding" />
              <StatCard title="Setup" value={euro.format(implementationTotal)} icon={Package} sublabel={travelCostTotal > 0 ? "Incl. reiskosten" : "Eenmalige kosten"} />
            </>
          ) : (
            <>
              <StatCard title="Gebruikers" value={String(totalUsers)} icon={Users} sublabel="1 hoofdgebruiker + extra gebruikers" />
              <StatCard title="Maandprijs" value={euro.format(monthlyTotal)} icon={FileText} sublabel="ex. BTW" />
              <StatCard title="Implementatie" value={euro.format(implementationTotal)} icon={Package} sublabel={`${formatDays(implementationDays)} implementatie`} />
            </>
          )}
        </div>

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
                <TextInput label="Sales consultant" value={salesName} onChange={setSalesName} />
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
                    <label className={`calculator-module-card travel-toggle-card ${includeTravelCosts ? "active" : ""}`}>
                      <input
                        type="checkbox"
                        checked={includeTravelCosts}
                        onChange={(event) => setIncludeTravelCosts(event.target.checked)}
                      />
                      <span className="calculator-module-main">
                        <strong>Setup inclusief reiskosten</strong>
                        <span>{formatDays(implementationDays)} x {euro.format(travelCostQuote?.pricePerDay ?? 0)}</span>
                      </span>
                      <span className="calculator-module-state">{includeTravelCosts ? "Aan" : "Uit"}</span>
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
                  <div className="field-grid-2">
                    <NumberInput label="Extra gebruikers" value={extraUsers} onChange={(v) => setExtraUsers(Math.max(0, v))} />
                    <NumberInput label="Correctie implementatie (€)" value={manualImplementationAdjustment} onChange={setManualImplementationAdjustment} step={0.01} />
                  </div>
                </div>

                <div className="section">
                  <div className="section-title"><MapPin size={16} /> Reiskosten</div>
                  <div className="calculator-module-grid travel-toggle-grid">
                    <label className={`calculator-module-card travel-toggle-card ${includeTravelCosts ? "active" : ""}`}>
                      <input
                        type="checkbox"
                        checked={includeTravelCosts}
                        onChange={(event) => setIncludeTravelCosts(event.target.checked)}
                      />
                      <span className="calculator-module-main">
                        <strong>Prijs implementatie inclusief reiskosten</strong>
                        <span>{formatDays(implementationDays)} x {euro.format(travelCostQuote?.pricePerDay ?? 0)}</span>
                      </span>
                      <span className="calculator-module-state">{includeTravelCosts ? "Aan" : "Uit"}</span>
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
                  <>
                    <div className="soft-card"><div className="kpi-title">Maand</div><div className="big-number">{euro.format(expansionTotals.monthly)}</div></div>
                    <div className="soft-card"><div className="kpi-title">Jaar</div><div className="big-number">{euro.format(expansionTotals.annual)}</div></div>
                    <div className="soft-card"><div className="kpi-title">Setup</div><div className="big-number">{euro.format(implementationTotal)}</div></div>
                    <div className="soft-card"><div className="kpi-title">Regels</div><div className="big-number">{assetsExpansion?.lines.length ?? 0}</div></div>
                  </>
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
                        <div className="total-row"><span>Maandbedrag</span><strong>{euro.format(expansionTotals.monthly)}</strong></div>
                        {expansionTotals.annual > 0 ? <div><span>Jaarbedrag</span><strong>{euro.format(expansionTotals.annual)}</strong></div> : null}
                        {expansionTotals.once > 0 ? <div><span>Setup</span><strong>{euro.format(expansionTotals.once)}</strong></div> : null}
                        {travelCostTotal > 0 ? <div><span>Reiskosten</span><strong>{euro.format(travelCostTotal)}</strong></div> : null}
                        <div className="total-row"><span>Eenmalig totaal</span><strong>{euro.format(implementationTotal)}</strong></div>
                      </>
                    ) : (
                      <>
                        <div><span>Licentie p/m</span><strong>{euro.format(licenseWithModulesMonthly)}</strong></div>
                        <div><span>Support p/m</span><strong>{euro.format(supportMonthly)}</strong></div>
                        {customerPortalMonthlyTotal > 0 ? (
                          <div><span>Klantportaal p/m</span><strong>{euro.format(customerPortalMonthlyTotal)}</strong></div>
                        ) : null}
                        {smartConnectPricing.monthlyTotal > 0 ? (
                          <div><span>Smart Connect p/m</span><strong>{euro.format(smartConnectPricing.monthlyTotal)}</strong></div>
                        ) : null}
                        <div className="total-row"><span>Maandprijs</span><strong>{euro.format(monthlyTotal)}</strong></div>
                        <div><span>Implementatie</span><strong>{euro.format(activeResult.implementationBase)}</strong></div>
                        <div><span>Correctie implementatie</span><strong>{euro.format(manualImplementationAdjustment)}</strong></div>
                        {travelCostTotal > 0 ? (
                          <div><span>Reiskosten</span><strong>{euro.format(travelCostTotal)}</strong></div>
                        ) : null}
                        <div className="total-row"><span>Implementatie totaal</span><strong>{euro.format(implementationTotal)}</strong></div>
                      </>
                    )}
                  </div>
                </div>

                <div className="proposal-card">
                  <div className="proposal-brand">{isAssetsExpansionDeal ? "Offerte samenvatting" : quoteTitle || "Prijsvoorstel"}</div>
                  <div className="proposal-title">{isAssetsExpansionDeal ? quoteTitle || "Uitbreiding" : activeResult.name}</div>
                  <div className="proposal-meta">{customerName || "Nog niet ingevuld"} · {contactName || "Geen contactpersoon"}</div>
                  <div className="proposal-total">{euro.format(isAssetsExpansionDeal ? expansionTotals.monthly : monthlyTotal)} p/m</div>
                  {isAssetsExpansionDeal && implementationTotal === 0 ? (
                    <div className="proposal-sub">{assetsExpansion?.lines.length ?? 0} uitbreidingsregel{assetsExpansion?.lines.length === 1 ? "" : "s"}</div>
                  ) : (
                    <div className="proposal-sub">Eenmalig: {euro.format(implementationTotal)}</div>
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

        {!isAssetsExpansionDeal ? (
          <section className="card panel customer-intake-panel">
            <div className="top-row customer-intake-heading">
              <div>
                <div className="eyebrow">Nieuwe klant</div>
                <h2 className="headline">Klantgegevensformulier</h2>
                <div className="subtext">
                  {customerIntake?.submittedAt
                    ? `Ontvangen op ${new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short" }).format(new Date(customerIntake.submittedAt))}`
                    : "Beveiligde klantlink en PDF voor de gegevens van een nieuwe klant."}
                </div>
              </div>
              <StatusPill tone={customerIntakeTone}>{customerIntakeLabel}</StatusPill>
            </div>

            <div className="customer-intake-controls">
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
                {customerIntake?.submittedAt ? (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={customerIntakeBusy || customerOutlookBusy}
                    onClick={() => void handleDnsOutlookDraft()}
                  >
                    <Mail size={16} />
                    {customerOutlookBusy ? "Concept maken..." : "DNS-instructies in Outlook"}
                  </button>
                ) : null}
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
                  </>
                ) : null}
              </div>
            </div>

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
              </div>
            ) : null}

            {customerIntakeStatus ? <div className="save-status">{customerIntakeStatus}</div> : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
