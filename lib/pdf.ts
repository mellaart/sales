import jsPDF from "jspdf";
import { euro } from "@/lib/pricing";
import {
  getImplementationText,
  getLicenseRows,
  getModuleRows,
  getModuleSummaryText,
  getOfferTextBlocks,
  getSupportRows,
  type OfferTemplateInput,
} from "@/lib/offer-template";

type PdfTableRow = {
  amount: string;
  description: string;
  price: number;
  total: number;
};

function valueOrDash(value: string) {
  return value?.trim() ? value : "-";
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

export function exportQuotePdf(input: OfferTemplateInput) {
  const doc = new jsPDF();
  const text = getOfferTextBlocks(input);
  const licenseRows = getLicenseRows(input);
  const supportRows = getSupportRows(input);
  const moduleRows = getModuleRows(input);

  doc.setFillColor(17, 58, 86);
  doc.rect(0, 0, 210, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Smart Trade", 16, 18);

  doc.setTextColor(17, 58, 86);
  doc.setFontSize(20);
  doc.text(input.quoteTitle || `Offerte Smart Trade ${input.result.name}`, 16, 43);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(95, 112, 131);
  doc.text(`Klant: ${valueOrDash(input.customerName)}`, 16, 54);
  doc.text(`Contactpersoon: ${valueOrDash(input.contactName)}`, 16, 60);
  doc.text(`Sales consultant: ${valueOrDash(input.salesName)}`, 16, 66);

  doc.setDrawColor(219, 228, 238);
  doc.line(16, 74, 194, 74);

  let y = 84;

  y = addParagraph(doc, text.greeting, y);
  y = addParagraph(doc, text.intro, y);

  y = addSectionTitle(doc, "Functionaliteiten / pakketkeuze", y + 2);
  y = addParagraph(doc, text.packageChoice, y);

  const moduleSummary = getModuleSummaryText(input.selectedModules, input.result);
  if (input.selectedModules.length > 0) {
    y = addSectionTitle(doc, "Geselecteerde modules", y + 1);
    y = addBullets(doc, moduleSummary, y);
  }

  y = addSectionTitle(doc, "Support", y + 1);
  y = addParagraph(doc, text.supportIntro, y);
  y = addParagraph(doc, "Met support bedoelen wij:", y);
  y = addBullets(doc, text.supportBullets, y);

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
  y = addParagraph(
    doc,
    "Om geen vervelende verrassingen of discussies te krijgen, maken we tijdens het eerste bezoek van de consultant altijd een plan van aanpak. Uit dit plan van aanpak zal blijken of het vooraf vastgestelde aantal bezoeken inderdaad voldoende is.",
    y,
  );
  y = addBullets(doc, text.implementationOptions, y);
  y = addParagraph(doc, getImplementationText(input), y);
  y = addParagraph(doc, "Reiskosten worden separaat afgestemd en zijn exclusief btw.", y);

  y = addSectionTitle(doc, "Financieel pakket", y + 2);
  y = addParagraph(doc, text.finance, y);

  y = addSectionTitle(doc, "Ontwikkelwerk / consultancy", y + 2);
  y = addParagraph(doc, text.consultancy, y);

  y = addSectionTitle(doc, "Hardware", y + 2);
  y = addParagraph(doc, text.hardware, y);

  y = addSectionTitle(doc, "Tot slot", y + 2);
  y = addParagraph(doc, text.closing, y);
  y = addParagraph(doc, text.contact, y);

  y = ensurePage(doc, y, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(25, 40, 55);
  doc.text("Met vriendelijke groet,", 16, y);
  y += 9;

  doc.setFont("helvetica", "bold");
  doc.text(input.salesName || "Smart Trade", 16, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.text("IT Sales Consultant", 16, y);
  y += 6;

  if (input.salesPhone) {
    doc.text(`M ${input.salesPhone}`, 16, y);
    y += 6;
  }

  if (input.salesEmail) {
    doc.text(`E ${input.salesEmail}`, 16, y);
    y += 6;
  }

  doc.text("W www.smarttrade.nl", 16, y);
  y += 9;

  doc.setFontSize(8);
  doc.setTextColor(95, 112, 131);
  doc.text("Troublefree B.V. | Pletterij 1A | 2211 JT Noordwijkerhout | Nederland", 16, y);

  addFooter(doc, input.salesName, input.salesEmail, input.salesPhone);

  const fileName = `${(input.customerName || `offerte-smart-trade-${input.result.name}`)
    .replace(/\s+/g, "-")
    .toLowerCase()}-offerte-smart-trade.pdf`;

  doc.save(fileName);
}
