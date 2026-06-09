import jsPDF from "jspdf";
import { getAssetExpansionTotals, getAssetExpansionUnitAmount } from "@/lib/asset-expansions";
import { euro } from "@/lib/pricing";
import { getQuoteLayout } from "@/lib/quote-layouts";
import {
  getImplementationText,
  getLicenseRows,
  getModuleRows,
  getModuleSummaryText,
  getOfferTextBlocks,
  getSupportRows,
  type OfferTemplateInput,
} from "@/lib/offer-template";
import type { AssetExpansionLine } from "@/lib/supabase";

type PdfTableRow = {
  amount: string;
  description: string;
  price: number;
  total: number;
};

type LoadedLogo = string | null;

const SMART_TRADE_LOGO_URL = "/smart-trade-logo.png";
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

let logoDataUrlPromise: Promise<LoadedLogo> | null = null;

function valueOrDash(value: string) {
  return value?.trim() ? value : "-";
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function getSmartTradeLogoDataUrl(): Promise<LoadedLogo> {
  if (typeof window === "undefined") return null;

  if (!logoDataUrlPromise) {
    logoDataUrlPromise = fetch(SMART_TRADE_LOGO_URL)
      .then((response) => {
        if (!response.ok) throw new Error("Logo kon niet worden geladen.");
        return response.blob();
      })
      .then(blobToDataUrl)
      .catch(() => null);
  }

  return logoDataUrlPromise;
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

function addQuoteHeader(
  doc: jsPDF,
  input: OfferTemplateInput,
  layoutName: string,
  logoDataUrl: LoadedLogo,
) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 210, 104, "F");

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", 16, 8, 68, 47);
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

function addPriceTable(doc: jsPDF, title: string, rows: PdfTableRow[], y: number) {
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

  rows.forEach((row) => {
    y = ensurePage(doc, y, 10);

    doc.setDrawColor(234, 239, 245);
    doc.line(x, y + 2, x + 178, y + 2);

    doc.text(row.amount, x + 2, y);
    doc.text(doc.splitTextToSize(row.description, 88), x + widths[0] + 2, y);
    doc.text(euro.format(row.price), x + widths[0] + widths[1] + 2, y);
    doc.text(euro.format(row.total), x + widths[0] + widths[1] + widths[2] + 2, y);

    y += 9;
  });

  const total = rows.reduce((sum, row) => sum + row.total, 0);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(17, 58, 86);
  doc.text(`Totaal ${title.toLowerCase()}`, x + 2, y + 3);
  doc.text(euro.format(total), x + widths[0] + widths[1] + widths[2] + 2, y + 3);

  return y + 13;
}

function getExpansionSectionTitle(lines: AssetExpansionLine[]) {
  const groups = Array.from(new Set(lines.map((line) => line.group).filter(Boolean)));

  if (groups.length === 1) return groups[0];
  return "Uitbreidingen";
}

function getExpansionWorkItems(lines: AssetExpansionLine[]) {
  const groups = new Set(lines.map((line) => line.group));

  if (groups.has("Klantenportaal")) {
    return [
      "Configuratie van het klantportaal en SSL-certificaat",
      "Klantportaal instellen en koppeling maken met Smart Trade administratie",
    ];
  }

  if (groups.has("Smart Connect")) {
    return ["Smart Connect configureren", "Koppeling maken met de Smart Trade administratie"];
  }

  if (groups.has("Modules") || groups.has("Pakket")) {
    return ["Geselecteerde uitbreiding activeren", "Koppeling en inrichting binnen Smart Trade controleren"];
  }

  if (groups.has("Servicekosten")) {
    return ["Servicekosten registreren", "Administratieve verwerking controleren"];
  }

  return ["Geselecteerde uitbreiding verwerken", "Inrichting en activatie controleren"];
}

function addExpansionPriceTable(doc: jsPDF, title: string, lines: AssetExpansionLine[], y: number) {
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

  doc.text("Setupkosten:", x + 2, y + 3);
  doc.text(euro.format(totals.once), x + widths[0] + widths[1] + widths[2] + 2, y + 3);

  return y + 13;
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
  doc.text(value, x + 8, y);

  return y + 6;
}

function addSignature(doc: jsPDF, input: OfferTemplateInput, y: number, logoDataUrl: LoadedLogo) {
  const signature = getSignatureDetails(input);

  y = ensurePage(doc, y, 120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(25, 40, 55);
  doc.text("Met vriendelijke groet,", 16, y);
  y += 12;

  const signatureTop = y;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(38, 121, 214);
  doc.text(signature.name, 16, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(25, 40, 55);
  doc.text(signature.title, 16, y);
  y += 14;

  if (signature.workdays) {
    doc.setFont("helvetica", "bold");
    doc.text("Werkdagen", 16, y);
    doc.setFont("helvetica", "normal");
    doc.text(`| ${signature.workdays}`, 43, y);
    y += 14;
  }

  y = addContactLine(doc, "M", signature.mobilePhone, 16, y, [64, 122, 145]);
  y = addContactLine(doc, "T", signature.officePhone, 16, y, [64, 122, 145]);
  y = addContactLine(doc, "E", signature.email, 16, y);
  y = addContactLine(doc, "W", signature.website, 16, y);

  const companyY = Math.max(y + 8, signatureTop + 62);
  doc.setFontSize(11);
  doc.setTextColor(25, 40, 55);
  doc.setFont("helvetica", "bold");
  doc.text("Troublefree B.V.", 52, companyY);
  doc.setFont("helvetica", "normal");
  doc.text("Pletterij 1A", 52, companyY + 7);
  doc.text("2211 JT Noordwijkerhout", 52, companyY + 14);
  doc.text("Nederland", 52, companyY + 21);

  doc.setDrawColor(38, 121, 214);
  doc.setLineWidth(0.35);
  doc.line(105, signatureTop - 10, 105, signatureTop + 76);

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", 121, signatureTop + 20, 58, 40);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(17, 58, 86);
    doc.text("Smart Trade", 122, signatureTop + 40);
  }

  const disclaimerY = signatureTop + 96;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(25, 40, 55);
  addWrappedText(doc, SIGNATURE_DISCLAIMER, 16, disclaimerY, 178, 4.5);

  return disclaimerY + 28;
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

export async function exportQuotePdf(input: OfferTemplateInput) {
  const doc = new jsPDF();
  const layout = getQuoteLayout(input.quoteLayout);
  const isCompactLayout = layout.key === "compact";
  const isAssetsExpansionLayout = layout.key === "assets-expansion";
  const expansionLines = input.assetsExpansion?.lines ?? [];
  const text = getOfferTextBlocks(input);
  const licenseRows = getLicenseRows(input);
  const supportRows = getSupportRows(input);
  const moduleRows = getModuleRows(input);
  const logoDataUrl = await getSmartTradeLogoDataUrl();

  let y = addQuoteHeader(doc, input, layout.name, logoDataUrl);

  y = addParagraph(doc, text.greeting, y);
  y = addParagraph(doc, isAssetsExpansionLayout ? "Zoals besproken hierbij een offerte over wat jullie besproken hebben:" : text.intro, y);

  if (isAssetsExpansionLayout && expansionLines.length > 0) {
    y = addExpansionPriceTable(doc, getExpansionSectionTitle(expansionLines), expansionLines, y + 2);

    y = addSectionTitle(doc, "Werkzaamheden", y + 2);
    y = addBullets(doc, getExpansionWorkItems(expansionLines), y);

    y = addSectionTitle(doc, "Tot slot", y + 2);
    y = addParagraph(doc, text.closing, y);
    y = addParagraph(doc, text.contact, y);

    addSignature(doc, input, y, logoDataUrl);
    addFooter(doc, input.salesName, input.salesEmail, input.salesPhone);

    const fileName = `${(input.customerName || "offerte-uitbreiding-smart-trade")
      .replace(/\s+/g, "-")
      .toLowerCase()}-offerte-uitbreiding.pdf`;

    doc.save(fileName);
    return;
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

  if (!isCompactLayout) {
    y = addSectionTitle(doc, "Support", y + 1);
    y = addParagraph(doc, text.supportIntro, y);
    y = addParagraph(doc, "Met support bedoelen wij:", y);
    y = addBullets(doc, text.supportBullets, y);
  }

  y = addSectionTitle(doc, "Smart Trade maandtarief", y + 1);
  y = addPriceTable(doc, "Licentie", licenseRows, y);
  y = addPriceTable(doc, "Support", supportRows, y);

  if (moduleRows.length > 0) {
    y = addPriceTable(doc, "Extra modules", moduleRows, y);
  }

  y = ensurePage(doc, y, 20);
  doc.setFillColor(233, 244, 251);
  doc.setDrawColor(207, 229, 247);
  doc.roundedRect(16, y, 178, 14, 3, 3, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 58, 86);
  doc.text(`Totaal licentie Smart Trade ${input.result.name} met supportcontract`, 20, y + 9);
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
  y = addParagraph(doc, "Reiskosten worden separaat afgestemd en zijn exclusief btw.", y);

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

  addSignature(doc, input, y, logoDataUrl);

  addFooter(doc, input.salesName, input.salesEmail, input.salesPhone);

  const fileName = `${(input.customerName || `offerte-smart-trade-${input.result.name}`)
    .replace(/\s+/g, "-")
    .toLowerCase()}-offerte-smart-trade.pdf`;

  doc.save(fileName);
}
