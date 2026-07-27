import jsPDF from "jspdf";
import {
  normalizeCustomerIntakeData,
  type CustomerIntakeData,
} from "@/lib/customer-intake";

type CustomerIntakePdfInput = {
  customerName?: string;
  formData?: CustomerIntakeData | null;
};

type FieldCell = {
  label: string;
  value: string;
  labelWidth?: number;
};

const SMART_TRADE_LOGO_URL = "/smart-trade-logo.png";

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function loadLogo() {
  try {
    const response = await fetch(SMART_TRADE_LOGO_URL);
    if (!response.ok) return null;
    return blobToDataUrl(await response.blob());
  } catch {
    return null;
  }
}

function cleanFileName(value: string) {
  const safe = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return safe || "nieuwe-klant";
}

function invoiceDeliveryLabel(value: CustomerIntakeData["invoiceDelivery"]) {
  if (value === "mail") return "mail";
  if (value === "post") return "post";
  return "";
}

function directDebitLabel(value: CustomerIntakeData["directDebit"]) {
  if (value === "yes") return "ja";
  if (value === "no") return "nee";
  return "";
}

export async function exportCustomerIntakePdf(input: CustomerIntakePdfInput) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const logo = await loadLogo();
  const data = normalizeCustomerIntakeData(input.formData);
  const left = 16;
  const right = 194;
  const contentWidth = right - left;
  const cellGap = 8;
  const cellWidth = (contentWidth - cellGap) / 2;
  let y = 12;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 210, 297, "F");

  if (logo) {
    doc.addImage(logo, "PNG", left, y, 54, 37);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(17, 58, 86);
    doc.text("Smart Trade", left, y + 18);
  }

  doc.setFontSize(8.5);
  doc.setTextColor(55, 70, 88);
  doc.setFont("helvetica", "bold");
  doc.text("Smart Trade", right, y + 2, { align: "right" });
  doc.setFont("helvetica", "normal");
  [
    "Pletterij 1A",
    "2211 JT Noordwijkerhout",
    "Nederland",
    "0252 250 260",
    "support@smarttrade.nl",
  ].forEach((line, index) => {
    doc.text(line, right, y + 7 + index * 4.2, { align: "right" });
  });

  y = 55;
  doc.setDrawColor(213, 224, 236);
  doc.line(left, y - 7, right, y - 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(17, 58, 86);
  doc.text("Gegevens nieuwe klanten", left, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(102, 117, 137);
  doc.text(input.customerName?.trim() || data.deliveryName || "Smart Trade", left, y + 6);
  y += 17;

  function addSection(title: string) {
    doc.setFillColor(235, 243, 252);
    doc.setDrawColor(189, 210, 233);
    doc.rect(left, y, contentWidth, 8, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(29, 95, 174);
    doc.text(title, left + 3, y + 5.3);
    y += 12;
  }

  function addCell(cell: FieldCell, x: number, width = cellWidth) {
    const labelWidth = cell.labelWidth ?? 36;
    const lineY = y + 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(58, 75, 96);
    doc.text(cell.label, x, lineY);
    doc.setDrawColor(163, 177, 193);
    doc.line(x + labelWidth, lineY + 0.8, x + width, lineY + 0.8);

    if (cell.value) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.8);
      doc.setTextColor(20, 34, 51);
      const fitted = doc.splitTextToSize(cell.value, width - labelWidth - 3)[0] ?? "";
      doc.text(fitted, x + labelWidth + 2, lineY - 0.7);
    }
  }

  function addRow(leftCell: FieldCell, rightCell?: FieldCell) {
    addCell(leftCell, left);
    if (rightCell) addCell(rightCell, left + cellWidth + cellGap);
    y += 9;
  }

  function addFullRow(cell: FieldCell) {
    addCell(cell, left, contentWidth);
    y += 9;
  }

  addSection("Aflever adres");
  addRow(
    { label: "Naam", value: data.deliveryName },
    { label: "Straat", value: data.deliveryStreet },
  );
  addRow(
    { label: "Nummer", value: data.deliveryNumber },
    { label: "Postcode", value: data.deliveryPostcode },
  );
  addRow(
    { label: "Plaats", value: data.deliveryCity },
    { label: "Telefoonnummer", value: data.phone },
  );
  addRow(
    { label: "Mobiel", value: data.mobile },
    { label: "E-mail algemeen", value: data.generalEmail },
  );
  addFullRow({
    label: "Website",
    value: data.website,
    labelWidth: 24,
  });
  addRow(
    { label: "BTW-nummer", value: data.vatNumber, labelWidth: 27 },
    { label: "KvK-nummer", value: data.chamberOfCommerceNumber, labelWidth: 27 },
  );

  y += 2;
  addSection("Post adres *");
  addRow(
    { label: "Straat", value: data.postalStreet },
    { label: "Nummer", value: data.postalNumber },
  );
  addRow(
    { label: "Postcode", value: data.postalPostcode },
    { label: "Plaats", value: data.postalCity },
  );

  y += 2;
  addSection("Contactpersoon");
  addRow(
    { label: "Voornaam", value: data.contactFirstName },
    { label: "Achternaam", value: data.contactLastName },
  );
  addRow(
    { label: "Telefoonnummer", value: data.contactPhone },
    { label: "E-mail", value: data.contactEmail },
  );

  y += 2;
  addSection("Administratie");
  addFullRow({
    label: "Factuur per mail / post",
    value: invoiceDeliveryLabel(data.invoiceDelivery),
    labelWidth: 49,
  });
  addRow(
    { label: "E-mail", value: data.administrationEmail },
    { label: "Telefoon", value: data.administrationPhone },
  );
  addRow(
    { label: "Voornaam", value: data.administrationFirstName },
    { label: "Achternaam", value: data.administrationLastName },
  );
  addFullRow(
    {
      label: "Automatische incasso ja / nee",
      value: directDebitLabel(data.directDebit),
      labelWidth: 55,
    },
  );
  addFullRow({
    label: "Bankrekening voor automatische incasso",
    value: data.directDebitBankAccount,
    labelWidth: 67,
  });

  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(105, 120, 138);
  doc.text("* Indien van toepassing", left, y);

  doc.setDrawColor(213, 224, 236);
  doc.line(left, 277, right, 277);
  doc.setFontSize(7.8);
  doc.setTextColor(98, 114, 133);
  doc.text("Smart Trade - branchegerichte software", left, 283);
  doc.text("Pletterij 1A, 2211 JT Noordwijkerhout", right, 283, { align: "right" });

  doc.save(`Smart-Trade-klantgegevens-${cleanFileName(input.customerName || data.deliveryName)}.pdf`);
}
