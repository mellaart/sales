import jsPDF from "jspdf";
import { getAssetExpansionTotals, getAssetExpansionUnitAmount } from "@/lib/asset-expansions";
import { loadPdfImage, type PdfImageAsset } from "@/lib/pdf-image";
import { DEFAULT_PRICE_CONFIG, getDefaultModuleWorkItems, type ExpansionWorkItemConfig, type ExpansionWorkItemKey } from "@/lib/price-config";
import { euro } from "@/lib/pricing";
import { getQuoteLayout } from "@/lib/quote-layouts";
import {
  DEFAULT_DEVELOPMENT_HOURLY_RATE,
  formatDevelopmentHours,
  getDevelopmentTotal,
  getQuotedDevelopmentLines,
} from "@/lib/development-lines";
import {
  getImplementationText,
  getIncludedModulesForPackage,
  getLicenseRows,
  getModuleRows,
  getModuleSummaryText,
  getOfferTextBlocks,
  getSupportRows,
  type OfferTemplateInput,
} from "@/lib/offer-template";
import type { AssetExpansionLine, AssetExpansionSummary } from "@/lib/supabase";

type PdfTableRow = {
  amount: string;
  description: string;
  price: number;
  total: number;
};

type LoadedLogo = PdfImageAsset | null;

const SMART_TRADE_LOGO_URL = "/smart-trade-logo.png";
const TROUBLEFREE_BADGE_URL = "/troublefree-software-badge.png";
const COMPANY_CONTACT_LINES = [
  "Smart Trade",
  "Pletterij 1A",
  "2211 JT Noordwijkerhout",
  "Nederland",
  "",
  "Telefoon: 0252 250 260",
  "Mail: support@smarttrade.nl",
];
const DEFAULT_SALES_TITLE = "IT Sales Consultant";
const DEFAULT_OFFICE_PHONE = "+31 252 250 260";
const DEFAULT_WEBSITE = "www.smarttrade.nl";
const SIGNATURE_DISCLAIMER =
  "De inhoud van dit bericht is alleen bestemd voor de geadresseerde en kan vertrouwelijke of persoonlijke informatie bevatten. Als u dit bericht onbedoeld heeft ontvangen, verzoeken wij u het te vernietigen en de afzender te informeren. Het is niet toegestaan om een bericht dat niet voor u bestemd is te vermenigvuldigen dan wel te verspreiden. Aan dit bericht inclusief de bijlagen kunnen geen rechten ontleend worden, tenzij schriftelijk anders wordt overeengekomen. Troublefree B.V. aanvaardt geen enkele aansprakelijkheid voor schade en/of kosten die voortvloeien uit onvolledige en/of foutieve informatie in e-mailberichten.";

const SALES_SIGNATURE_PRESETS: Record<string, Partial<{
  name: string;
  title: string;
  workdays: string;
  mobilePhone: string;
}>> = {
  "erik@smarttrade.nl": {
    name: "Erik Mellaart",
    title: DEFAULT_SALES_TITLE,
    workdays: "di - wo - do - vr",
    mobilePhone: "+31 630 050 413",
  },
};

function valueOrDash(value: string) {
  return value?.trim() ? value : "-";
}

async function getSmartTradeLogoDataUrl(): Promise<LoadedLogo> {
  return loadPdfImage(SMART_TRADE_LOGO_URL, {
    alias: "smart-trade-logo",
    maxWidth: 720,
    maxHeight: 520,
    quality: 0.9,
  });
}

async function getTroublefreeBadgeDataUrl(): Promise<LoadedLogo> {
  return loadPdfImage(TROUBLEFREE_BADGE_URL, {
    alias: "troublefree-software-badge",
    maxWidth: 180,
    maxHeight: 200,
    quality: 0.9,
  });
}

function addWrappedText(doc: jsPDF, text: string, x: number, y: number, width: number, lineHeight = 5) {
  const lines = doc.splitTextToSize(text, width);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function ensurePage(doc: jsPDF, y: number, needed = 26) {
  if (y + needed <= 282) return y;

  doc.addPage();
  return 20;
}

function addSectionTitle(doc: jsPDF, title: string, y: number) {
  y = ensurePage(doc, y, 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(17, 58, 86);
  doc.text(title, 16, y);
  return y + 7;
}

function addParagraph(doc: jsPDF, text: string, y: number) {
  y = ensurePage(doc, y, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(25, 40, 55);
  return addWrappedText(doc, text, 16, y, 178, 5) + 3;
}

function addGuidanceText(doc: jsPDF, text: string, y: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(25, 40, 55);

  const paragraphs = text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    const lines = doc.splitTextToSize(paragraph, 178) as string[];
    for (const line of lines) {
      y = ensurePage(doc, y, 7);
      doc.text(line, 16, y);
      y += 5;
    }
    y += 3;
  }

  return y;
}

function addNotes(doc: jsPDF, notes: string | undefined, y: number) {
  const lines = notes
    ?.split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines || lines.length === 0) return y;

  return addBullets(doc, lines, y);
}

function addBullets(doc: jsPDF, bullets: string[], y: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(25, 40, 55);

  bullets.forEach((bullet) => {
    y = ensurePage(doc, y, 12);
    doc.text("•", 18, y);
    y = addWrappedText(doc, bullet, 24, y, 168, 5) + 1;
  });

  return y + 2;
}

function addWorkGroups(doc: jsPDF, groups: Array<{ label: string; workItems: string[] }>, y: number) {
  for (const group of groups) {
    y = ensurePage(doc, y, 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(17, 58, 86);
    doc.text(group.label, 16, y);
    y = addBullets(doc, group.workItems, y + 6);
  }

  return y;
}

function addQuoteHeader(
  doc: jsPDF,
  input: OfferTemplateInput,
  layoutName: string,
  logoDataUrl: LoadedLogo,
) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 210, 104, "F");

  if (logoDataUrl) {
    doc.addImage(
      logoDataUrl.dataUrl,
      logoDataUrl.format,
      16,
      8,
      68,
      47,
      logoDataUrl.alias,
      "MEDIUM",
    );
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(21);
    doc.setTextColor(17, 58, 86);
    doc.text("Smart Trade", 16, 30);
  }

  doc.setFontSize(8.5);
  doc.setTextColor(25, 40, 55);
  COMPANY_CONTACT_LINES.forEach((line, index) => {
    const y = 13 + index * 4.4;
    doc.setFont("helvetica", index === 0 ? "bold" : "normal");
    doc.text(line, 194, y, { align: "right" });
  });

  doc.setDrawColor(219, 228, 238);
  doc.line(16, 59, 194, 59);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(17, 58, 86);
  doc.text(input.quoteTitle || `Offerte Smart Trade ${input.result.name}`, 16, 72);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 233, 241);
  doc.roundedRect(16, 80, 178, 18, 2, 2, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(95, 112, 131);
  doc.text(`Klant: ${valueOrDash(input.customerName)}`, 20, 87);
  doc.text(`Contactpersoon: ${valueOrDash(input.contactName)}`, 20, 93);
  doc.text(`Sales consultant: ${valueOrDash(input.salesName)}`, 112, 87);
  doc.text(`Layout: ${layoutName}`, 112, 93);

  return 110;
}

function addPriceTable(
  doc: jsPDF,
  title: string,
  rows: PdfTableRow[],
  y: number,
  descriptionHeading = "Pakket",
) {
  y = addSectionTitle(doc, title, y);

  const x = 16;
  const widths = [22, 92, 34, 34];

  doc.setFillColor(244, 247, 251);
  doc.setDrawColor(219, 228, 238);
  doc.rect(x, y - 5, 178, 8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(64, 80, 100);
  doc.text("Aantal", x + 2, y);
  doc.text(descriptionHeading, x + widths[0] + 2, y);
  doc.text("Prijs", x + widths[0] + widths[1] + 2, y);
  doc.text("Totaal", x + widths[0] + widths[1] + widths[2] + 2, y);

  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(25, 40, 55);

  rows.forEach((row) => {
    const descriptionLines = doc.splitTextToSize(row.description, 88);
    const rowHeight = Math.max(9, descriptionLines.length * 4.4 + 4);
    y = ensurePage(doc, y, rowHeight + 2);

    doc.setDrawColor(234, 239, 245);
    doc.line(x, y + 2, x + 178, y + 2);

    doc.text(row.amount, x + 2, y);
    doc.text(descriptionLines, x + widths[0] + 2, y);
    doc.text(euro.format(row.price), x + widths[0] + widths[1] + 2, y);
    doc.text(euro.format(row.total), x + widths[0] + widths[1] + widths[2] + 2, y);

    y += rowHeight;
  });

  const total = rows.reduce((sum, row) => sum + row.total, 0);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(17, 58, 86);
  doc.text(`Totaal ${title.toLowerCase()}`, x + 2, y + 3);
  doc.text(euro.format(total), x + widths[0] + widths[1] + widths[2] + 2, y + 3);

  return y + 13;
}

function addOneTimeTotal(doc: jsPDF, total: number, y: number) {
  y = ensurePage(doc, y, 20);
  doc.setFillColor(233, 244, 251);
  doc.setDrawColor(207, 229, 247);
  doc.roundedRect(16, y, 178, 14, 3, 3, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 58, 86);
  doc.text("Totaal eenmalig", 20, y + 9);
  doc.text(euro.format(total), 190, y + 9, { align: "right" });
  return y + 22;
}

function addIncludedModulesTable(doc: jsPDF, title: string, rows: Array<{ amount: string; description: string }>, y: number) {
  y = addSectionTitle(doc, title, y);

  const x = 16;
  const widths = [22, 106, 50];

  doc.setFillColor(244, 247, 251);
  doc.setDrawColor(219, 228, 238);
  doc.rect(x, y - 5, 178, 8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(64, 80, 100);
  doc.text("Aantal", x + 2, y);
  doc.text("Module", x + widths[0] + 2, y);
  doc.text("Status", x + widths[0] + widths[1] + 2, y);

  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(25, 40, 55);

  rows.forEach((row) => {
    const descriptionLines = doc.splitTextToSize(row.description, 100);
    const rowHeight = Math.max(9, descriptionLines.length * 4.4 + 4);
    y = ensurePage(doc, y, rowHeight + 2);

    doc.setDrawColor(234, 239, 245);
    doc.line(x, y + 2, x + 178, y + 2);

    doc.text(row.amount, x + 2, y);
    doc.text(descriptionLines, x + widths[0] + 2, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(34, 128, 84);
    doc.text("Inbegrepen", x + widths[0] + widths[1] + 2, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(25, 40, 55);

    y += rowHeight;
  });

  return y + 5;
}

function getExpansionSectionTitle(lines: AssetExpansionLine[]) {
  const groups = Array.from(new Set(lines.map((line) => line.group).filter(Boolean)));

  if (groups.length === 1) return groups[0];
  return "Uitbreidingen";
}

function getConfiguredExpansionWorkItems(workItemKey: ExpansionWorkItemKey, configuredItems?: ExpansionWorkItemConfig[]) {
  const configuredItem = configuredItems?.find((item) => item.key === workItemKey);
  const defaultWorkItems = DEFAULT_PRICE_CONFIG.expansionWorkItems.find((item) => item.key === workItemKey)?.workItems ?? [];
  const workItems = configuredItem ? configuredItem.workItems : defaultWorkItems;

  return workItems.map((item) => item.trim()).filter(Boolean);
}

function uniqueWorkItems(items: string[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const normalizedItem = item.trim();
    if (!normalizedItem || seen.has(normalizedItem)) return false;

    seen.add(normalizedItem);
    return true;
  });
}

function getExpansionWorkGroups(input: OfferTemplateInput) {
  const lines = input.assetsExpansion?.lines ?? [];
  const groups = new Set(lines.map((line) => line.group));
  const workGroups: Array<{ label: string; workItems: string[] }> = [];

  if (groups.has("Klantenportaal")) {
    workGroups.push({
      label: "Klantportaal",
      workItems: getConfiguredExpansionWorkItems("customerPortal", input.expansionWorkItems),
    });
  }

  if (groups.has("Smart Connect")) {
    workGroups.push({
      label: "Smart Connect",
      workItems: getConfiguredExpansionWorkItems("smartConnect", input.expansionWorkItems),
    });
  }

  if (groups.has("Modules") || groups.has("Pakket") || groups.has("Implementatie")) {
    input.selectedModules.forEach((module) => {
      const configuredModule = input.moduleWorkItems?.find((item) => item.key === module.key);
      const moduleWorkItems = configuredModule
        ? configuredModule.workItems ?? []
        : Array.isArray(module.workItems)
          ? module.workItems
          : getDefaultModuleWorkItems(module.name);
      workGroups.push({
        label: configuredModule?.name || module.name,
        workItems: uniqueWorkItems(moduleWorkItems),
      });
    });
  }

  return workGroups.filter((group) => group.workItems.length > 0);
}

function addExpansionPriceTable(doc: jsPDF, title: string, lines: AssetExpansionLine[], y: number, travelCostTotal = 0) {
  y = addSectionTitle(doc, title, y);

  const x = 16;
  const widths = [22, 92, 34, 34];

  doc.setFillColor(244, 247, 251);
  doc.setDrawColor(219, 228, 238);
  doc.rect(x, y - 5, 178, 8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(64, 80, 100);
  doc.text("Aantal", x + 2, y);
  doc.text("Pakket", x + widths[0] + 2, y);
  doc.text("Prijs", x + widths[0] + widths[1] + 2, y);
  doc.text("Totaal", x + widths[0] + widths[1] + widths[2] + 2, y);

  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(25, 40, 55);

  lines.forEach((line) => {
    y = ensurePage(doc, y, 10);

    doc.setDrawColor(234, 239, 245);
    doc.line(x, y + 2, x + 178, y + 2);

    doc.text(`${line.quantity}x`, x + 2, y);
    doc.text(doc.splitTextToSize(line.label, 88), x + widths[0] + 2, y);
    doc.text(euro.format(getAssetExpansionUnitAmount(line)), x + widths[0] + widths[1] + 2, y);
    doc.text(euro.format(line.amount), x + widths[0] + widths[1] + widths[2] + 2, y);

    y += 9;
  });

  const totals = getAssetExpansionTotals(lines);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(17, 58, 86);

  if (totals.monthly > 0) {
    doc.text("Totaal per maand", x + 2, y + 3);
    doc.text(euro.format(totals.monthly), x + widths[0] + widths[1] + widths[2] + 2, y + 3);
    y += 8;
  }

  if (totals.annual > 0) {
    doc.text("Totaal per jaar", x + 2, y + 3);
    doc.text(euro.format(totals.annual), x + widths[0] + widths[1] + widths[2] + 2, y + 3);
    y += 8;
  }

  if (travelCostTotal > 0) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(25, 40, 55);
    doc.text("Reiskosten", x + 2, y + 3);
    doc.text(euro.format(travelCostTotal), x + widths[0] + widths[1] + widths[2] + 2, y + 3);
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 58, 86);
  }

  doc.text("Setupkosten:", x + 2, y + 3);
  doc.text(euro.format(totals.once + travelCostTotal), x + widths[0] + widths[1] + widths[2] + 2, y + 3);

  return y + 13;
}

function addExpansionPriceComparison(
  doc: jsPDF,
  comparison: NonNullable<AssetExpansionSummary["priceComparison"]>,
  lines: AssetExpansionLine[],
  y: number,
) {
  const totals = getAssetExpansionTotals(lines);
  const currentMonthly = Number(comparison.currentMonthly) || 0;
  const newMonthly = Number(comparison.newMonthly) || 0;
  const currentAnnual = Number(comparison.currentAnnual) || 0;
  const newAnnual = Number(comparison.newAnnual) || 0;
  const rows = [
    {
      label: "Per maand",
      current: currentMonthly,
      expansion: totals.monthly,
      next: newMonthly,
    },
    ...(currentAnnual > 0 || newAnnual > 0 || totals.annual > 0 ? [{
      label: "Servicekosten per jaar",
      current: currentAnnual,
      expansion: totals.annual,
      next: newAnnual,
    }] : []),
  ];

  y = ensurePage(doc, y, 18 + rows.length * 9);
  y = addSectionTitle(doc, "Prijsvergelijking", y);

  const x = 16;
  const currentRight = 113;
  const expansionRight = 152;
  const newRight = 192;

  doc.setFillColor(244, 247, 251);
  doc.setDrawColor(219, 228, 238);
  doc.rect(x, y - 5, 178, 8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(64, 80, 100);
  doc.text("Periode", x + 2, y);
  doc.text("Huidig", currentRight, y, { align: "right" });
  doc.text("Uitbreiding", expansionRight, y, { align: "right" });
  doc.text("Nieuw", newRight, y, { align: "right" });
  y += 8;

  rows.forEach((row, index) => {
    doc.setDrawColor(234, 239, 245);
    doc.line(x, y + 2, x + 178, y + 2);
    doc.setFont("helvetica", index === rows.length - 1 ? "bold" : "normal");
    doc.setTextColor(25, 40, 55);
    doc.text(row.label, x + 2, y);
    doc.text(euro.format(row.current), currentRight, y, { align: "right" });
    doc.text(`+ ${euro.format(row.expansion)}`, expansionRight, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 58, 86);
    doc.text(euro.format(row.next), newRight, y, { align: "right" });
    y += 9;
  });

  return y + 3;
}

function addExpansionCurrentBreakdown(
  doc: jsPDF,
  comparison: NonNullable<AssetExpansionSummary["priceComparison"]>,
  y: number,
) {
  const hasBreakdown = comparison.currentPackageMonthly !== undefined
    || comparison.currentCustomerPortalMonthly !== undefined
    || comparison.currentSmartConnectMonthly !== undefined;
  if (!hasBreakdown) return y;

  const rows = [
    { label: "Pakket, gebruikers, support en modules", amount: Number(comparison.currentPackageMonthly) || 0 },
    { label: "Klantportaal", amount: Number(comparison.currentCustomerPortalMonthly) || 0 },
    { label: "Smart Connect", amount: Number(comparison.currentSmartConnectMonthly) || 0 },
  ];

  y = ensurePage(doc, y, 22 + rows.length * 8);
  y = addSectionTitle(doc, "Huidige prijsopbouw", y);
  doc.setFontSize(9);

  rows.forEach((row) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(25, 40, 55);
    doc.text(row.label, 18, y);
    doc.text(`${euro.format(row.amount)} p/m`, 192, y, { align: "right" });
    doc.setDrawColor(234, 239, 245);
    doc.line(16, y + 2, 194, y + 2);
    y += 8;
  });

  doc.setFont("helvetica", "bold");
  doc.setTextColor(17, 58, 86);
  doc.text("Huidige maandprijs", 18, y);
  doc.text(`${euro.format(Number(comparison.currentMonthly) || 0)} p/m`, 192, y, { align: "right" });

  return y + 8;
}

function getSignatureDetails(input: OfferTemplateInput) {
  const preset = input.salesEmail ? SALES_SIGNATURE_PRESETS[input.salesEmail.toLowerCase()] : undefined;

  return {
    name: preset?.name || input.salesName || "Smart Trade",
    title: input.salesTitle || preset?.title || DEFAULT_SALES_TITLE,
    workdays: input.salesWorkdays || preset?.workdays || "",
    mobilePhone: input.salesPhone || preset?.mobilePhone || "",
    email: input.salesEmail || "",
    officePhone: DEFAULT_OFFICE_PHONE,
    website: DEFAULT_WEBSITE,
  };
}

function addContactLine(doc: jsPDF, label: string, value: string, x: number, y: number, color: [number, number, number] = [25, 40, 55]) {
  if (!value) return y;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(25, 40, 55);
  doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...color);
  doc.text(value, x + 5.2, y);

  return y + 4.1;
}

function addSignature(doc: jsPDF, input: OfferTemplateInput, y: number, logoDataUrl: LoadedLogo, troublefreeBadgeDataUrl: LoadedLogo) {
  const signature = getSignatureDetails(input);

  y = ensurePage(doc, y, 88);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.3);
  doc.setTextColor(25, 40, 55);
  doc.text("Met vriendelijke groet,", 16, y);
  y += 7;

  const signatureTop = y;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.2);
  doc.setTextColor(38, 121, 214);
  doc.text(signature.name, 16, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(25, 40, 55);
  doc.text(signature.title, 16, y);
  y += 8;

  if (signature.workdays) {
    doc.setFontSize(7.6);
    doc.setFont("helvetica", "bold");
    doc.text("Werkdagen", 16, y);
    doc.setFont("helvetica", "normal");
    doc.text(`| ${signature.workdays}`, 36, y);
    y += 8;
  }

  doc.setFontSize(7.6);
  y = addContactLine(doc, "M", signature.mobilePhone, 16, y, [64, 122, 145]);
  y = addContactLine(doc, "T", signature.officePhone, 16, y, [64, 122, 145]);
  y = addContactLine(doc, "E", signature.email, 16, y);
  y = addContactLine(doc, "W", signature.website, 16, y);

  const companyY = Math.max(y + 5, signatureTop + 36);
  if (troublefreeBadgeDataUrl) {
    doc.addImage(
      troublefreeBadgeDataUrl.dataUrl,
      troublefreeBadgeDataUrl.format,
      16,
      companyY - 3,
      13,
      14.5,
      troublefreeBadgeDataUrl.alias,
      "MEDIUM",
    );
  }

  doc.setFontSize(8);
  doc.setTextColor(25, 40, 55);
  doc.setFont("helvetica", "bold");
  doc.text("Troublefree B.V.", 35, companyY);
  doc.setFont("helvetica", "normal");
  doc.text("Pletterij 1A", 35, companyY + 5);
  doc.text("2211 JT Noordwijkerhout", 35, companyY + 10);
  doc.text("Nederland", 35, companyY + 15);

  doc.setDrawColor(38, 121, 214);
  doc.setLineWidth(0.35);
  doc.line(105, signatureTop - 4, 105, signatureTop + 46);

  if (logoDataUrl) {
    doc.addImage(
      logoDataUrl.dataUrl,
      logoDataUrl.format,
      124,
      signatureTop + 12,
      34,
      24,
      logoDataUrl.alias,
      "MEDIUM",
    );
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(17, 58, 86);
    doc.text("Smart Trade", 124, signatureTop + 27);
  }

  const addressBottomY = companyY + 15;
  const disclaimerY = Math.max(signatureTop + 57, addressBottomY + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(25, 40, 55);
  addWrappedText(doc, SIGNATURE_DISCLAIMER, 16, disclaimerY, 178, 3.1);

  return disclaimerY + 20;
}

function addFooter(doc: jsPDF, salesName: string, salesEmail?: string, salesPhone?: string) {
  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(95, 112, 131);
    doc.text(`Pagina ${page} van ${pageCount}`, 176, 290);

    if (page === pageCount) {
      continue;
    }

    doc.text(`Smart Trade | ${salesName}${salesEmail ? ` | ${salesEmail}` : ""}${salesPhone ? ` | ${salesPhone}` : ""}`, 16, 290);
  }
}

async function buildQuotePdf(input: OfferTemplateInput) {
  const doc = new jsPDF({ compress: true });
  const layout = getQuoteLayout(input.quoteLayout);
  const isCompactLayout = layout.key === "compact";
  const isAssetsExpansionLayout = layout.key === "assets-expansion";
  const expansionLines = input.assetsExpansion?.lines ?? [];
  const text = getOfferTextBlocks(input);
  const licenseRows = getLicenseRows(input);
  const supportRows = getSupportRows(input);
  const includedModuleRows = getIncludedModulesForPackage(input.selectedModules, input.result).map((module) => ({
    amount: `${module.qty}x`,
    description: module.name,
  }));
  const moduleRows = getModuleRows(input);
  const extraMonthlyRows = input.extraMonthlyRows ?? [];
  const developmentHourlyRate = Math.max(
    0,
    Number(input.developmentHourlyRate) || DEFAULT_DEVELOPMENT_HOURLY_RATE,
  );
  const quotedDevelopmentLines = getQuotedDevelopmentLines(input.developmentLines ?? []);
  const developmentRows = quotedDevelopmentLines.map((line) => ({
    amount: `${formatDevelopmentHours(line.hours)} uur`,
    description: line.description,
    price: developmentHourlyRate,
    total: line.hours * developmentHourlyRate,
  }));
  const developmentTotal = getDevelopmentTotal(quotedDevelopmentLines, developmentHourlyRate);
  const supportTotal = supportRows.reduce((sum, row) => sum + row.total, 0);
  const [logoDataUrl, troublefreeBadgeDataUrl] = await Promise.all([
    getSmartTradeLogoDataUrl(),
    getTroublefreeBadgeDataUrl(),
  ]);

  let y = addQuoteHeader(doc, input, layout.name, logoDataUrl);

  y = addParagraph(doc, text.greeting, y);
  y = addParagraph(doc, isAssetsExpansionLayout ? "Zoals besproken hierbij een offerte over wat jullie besproken hebben:" : text.intro, y);

  if (isAssetsExpansionLayout && expansionLines.length > 0) {
    const expansionTravelCostTotal = input.includeTravelCosts ? input.travelCostTotal ?? 0 : 0;
    y = addExpansionPriceTable(doc, getExpansionSectionTitle(expansionLines), expansionLines, y + 2, expansionTravelCostTotal);
    if (input.assetsExpansion?.priceComparison) {
      y = addExpansionCurrentBreakdown(doc, input.assetsExpansion.priceComparison, y + 1);
      y = addExpansionPriceComparison(doc, input.assetsExpansion.priceComparison, expansionLines, y + 1);
    }

    if (developmentRows.length > 0) {
      y = addPriceTable(doc, "Ontwikkelingen", developmentRows, y + 1, "Omschrijving");
      y = addOneTimeTotal(doc, input.result.implementationAfterAdjustment + developmentTotal, y);
    }

    const expansionWorkGroups = getExpansionWorkGroups(input);
    if (expansionWorkGroups.length > 0) {
      y = addSectionTitle(doc, "Werkzaamheden", y + 2);
      y = addWorkGroups(doc, expansionWorkGroups, y);
    }

    const guidanceText = input.assetsExpansion?.guidanceText?.trim();
    if (guidanceText) {
      y = addSectionTitle(doc, "Toelichting", y + 2);
      y = addGuidanceText(doc, guidanceText, y);
    }

    y = addSectionTitle(doc, "Tot slot", y + 2);
    y = addParagraph(doc, text.closing, y);
    y = addParagraph(doc, text.contact, y);

    addSignature(doc, input, y, logoDataUrl, troublefreeBadgeDataUrl);
    addFooter(doc, input.salesName, input.salesEmail, input.salesPhone);

    const fileName = `${(input.customerName || "offerte-uitbreiding-smart-trade")
      .replace(/\s+/g, "-")
      .toLowerCase()}-offerte-uitbreiding.pdf`;

    return { doc, fileName };
  }

  y = addSectionTitle(doc, "Functionaliteiten / pakketkeuze", y + 2);
  y = addParagraph(doc, text.packageChoice, y);

  if (isAssetsExpansionLayout && input.notes?.trim()) {
    y = addSectionTitle(doc, "Geselecteerde uitbreidingen", y + 1);
    y = addNotes(doc, input.notes, y);
  }

  const moduleSummary = getModuleSummaryText(input.selectedModules, input.result);
  if (input.selectedModules.length > 0) {
    y = addSectionTitle(doc, "Geselecteerde modules", y + 1);
    y = addBullets(doc, moduleSummary, y);
  }

  if (!isCompactLayout && supportTotal > 0) {
    y = addSectionTitle(doc, "Support", y + 1);
    y = addParagraph(doc, text.supportIntro, y);
    y = addParagraph(doc, "Met support bedoelen wij:", y);
    y = addBullets(doc, text.supportBullets, y);
  }

  y = addSectionTitle(doc, "Smart Trade maandtarief", y + 1);
  y = addPriceTable(doc, "Licentie", licenseRows, y);
  if (supportTotal > 0) {
    y = addPriceTable(doc, "Support", supportRows, y);
  }

  if (includedModuleRows.length > 0) {
    y = addIncludedModulesTable(doc, `Inbegrepen modules in Smart Trade ${input.result.name}`, includedModuleRows, y);
  }

  if (moduleRows.length > 0) {
    y = addPriceTable(doc, "Extra modules", moduleRows, y);
  }

  if (extraMonthlyRows.length > 0) {
    y = addPriceTable(doc, "Uitbreidingen", extraMonthlyRows, y);
  }

  y = ensurePage(doc, y, 20);
  doc.setFillColor(233, 244, 251);
  doc.setDrawColor(207, 229, 247);
  doc.roundedRect(16, y, 178, 14, 3, 3, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 58, 86);
  doc.text(`Totaal licentie Smart Trade ${input.result.name} ${supportTotal > 0 ? "met" : "zonder"} supportcontract`, 20, y + 9);
  doc.text(euro.format(input.result.monthlyAfterDiscount), 160, y + 9);
  y += 22;

  y = addParagraph(
    doc,
    "De eerste implementatie dag geldt als startdatum voor de licentiekosten. Gedurende de implementatiefase wordt uitsluitend de eerste gebruiker in rekening gebracht.",
    y,
  );

  y = addSectionTitle(doc, "Implementatie", y + 2);
  y = addParagraph(doc, text.implementation, y);
  if (!isCompactLayout) {
    y = addParagraph(
      doc,
      "Om geen vervelende verrassingen of discussies te krijgen, maken we tijdens het eerste bezoek van de consultant altijd een plan van aanpak. Uit dit plan van aanpak zal blijken of het vooraf vastgestelde aantal bezoeken inderdaad voldoende is.",
      y,
    );
    y = addBullets(doc, text.implementationOptions, y);
  }
  y = addParagraph(doc, getImplementationText(input), y);
  if (!input.includeTravelCosts) {
    y = addParagraph(doc, "Reiskosten worden separaat afgestemd en zijn exclusief btw.", y);
  }

  if (developmentRows.length > 0) {
    y = addPriceTable(doc, "Ontwikkelingen", developmentRows, y + 2, "Omschrijving");
    y = addOneTimeTotal(doc, input.result.implementationAfterAdjustment + developmentTotal, y);
  }

  if (!isCompactLayout && !isAssetsExpansionLayout) {
    y = addSectionTitle(doc, "Financieel pakket", y + 2);
    y = addParagraph(doc, text.finance, y);

    y = addSectionTitle(doc, "Ontwikkelwerk / consultancy", y + 2);
    y = addParagraph(doc, text.consultancy, y);

    y = addSectionTitle(doc, "Hardware", y + 2);
    y = addParagraph(doc, text.hardware, y);
  }

  y = addSectionTitle(doc, "Tot slot", y + 2);
  y = addParagraph(doc, text.closing, y);
  y = addParagraph(doc, text.contact, y);

  addSignature(doc, input, y, logoDataUrl, troublefreeBadgeDataUrl);

  addFooter(doc, input.salesName, input.salesEmail, input.salesPhone);

  const fileName = `${(input.customerName || `offerte-smart-trade-${input.result.name}`)
    .replace(/\s+/g, "-")
    .toLowerCase()}-offerte-smart-trade.pdf`;

  return { doc, fileName };
}

export async function createQuotePdfFile(input: OfferTemplateInput) {
  const { doc, fileName } = await buildQuotePdf(input);
  return new File([doc.output("blob")], fileName, { type: "application/pdf" });
}

export async function exportQuotePdf(input: OfferTemplateInput) {
  const { doc, fileName } = await buildQuotePdf(input);
  doc.save(fileName);
}
