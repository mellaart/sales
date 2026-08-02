import {
  combineCustomerContactName,
  type CustomerIntakeData,
} from "@/lib/customer-intake";
import { DEFAULT_PRICE_CONFIG } from "@/lib/price-config";
import { euro } from "@/lib/pricing";

type NewCustomerImplementation = {
  customer_name: string;
  assigned_consultant_name?: string | null;
  administration_name?: string | null;
  planned_go_live_date?: string | null;
  financial_package?: string | null;
  website_webshop?: string | null;
};

type NewCustomerDeal = {
  package_name?: string | null;
  total_users?: number | null;
  monthly_total?: number | null;
  implementation_total?: number | null;
  modules?: unknown;
  calculator_inputs?: unknown;
};

type NewCustomerEmailInput = {
  implementation: NewCustomerImplementation;
  deal: NewCustomerDeal;
  intake: CustomerIntakeData;
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character] ?? character,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }

  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  if (typeof value === "string") {
    try {
      return asArray(JSON.parse(value) as unknown);
    } catch {
      return [];
    }
  }

  return Array.isArray(value) ? value : [];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.floor(numberValue)) : 0;
}

function sameText(left: string, right: string) {
  return left.localeCompare(right, "nl", { sensitivity: "base" }) === 0;
}

function emailLink(email: string) {
  const safeEmail = escapeHtml(email);
  return `<a href="mailto:${safeEmail}" style="color:#0563c1;text-decoration:underline">${safeEmail}</a>`;
}

function websiteLink(website: string) {
  const href = /^[a-z][a-z\d+.-]*:\/\//i.test(website) ? website : `https://${website}`;
  return `<a href="${escapeHtml(href)}" style="color:#0563c1;text-decoration:underline">${escapeHtml(website)}</a>`;
}

function section(title: string, body: string) {
  return [
    `<p style="margin:0 0 4pt"><strong>${escapeHtml(title)}</strong></p>`,
    `<div style="margin:0 0 12pt">${body}</div>`,
  ].join("");
}

function lineList(lines: string[]) {
  return lines.map((line) => `<div>${line}</div>`).join("");
}

function bulletList(lines: string[]) {
  return `<ul style="margin:0;padding-left:22px">${lines.map((line) => `<li>${line}</li>`).join("")}</ul>`;
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function customerDisplayName(implementationName: string, legalName: string) {
  if (!implementationName) return legalName;
  if (!legalName || sameText(implementationName, legalName)) return implementationName;
  return `${implementationName} (${legalName})`;
}

function moduleLines(deal: NewCustomerDeal, calculatorInputs: Record<string, unknown>) {
  const fallbackModuleNames = new Map(
    DEFAULT_PRICE_CONFIG.modules.map((module) => [module.key, module.name]),
  );
  const lines = asArray(deal.modules).flatMap((value) => {
    const moduleRow = asRecord(value);
    const key = textValue(moduleRow.key);
    const name = textValue(moduleRow.name) || fallbackModuleNames.get(key) || key;
    const quantity = positiveInteger(moduleRow.qty ?? 1);
    if (!name || quantity === 0) return [];
    const prefix = quantity > 1 ? `${quantity}x ` : "";
    return [`${prefix}Module ${escapeHtml(name)}`];
  });

  const customerPortalOptions = asArray(calculatorInputs.customerPortalOptions);
  for (const value of customerPortalOptions) {
    const option = asRecord(value);
    const name = textValue(option.name);
    if (name) lines.push(`Klantportaal - ${escapeHtml(name)}`);
  }

  const smartConnectConnections = positiveInteger(calculatorInputs.smartConnectConnections);
  if (smartConnectConnections > 0) {
    lines.push(`Smart Connect - ${smartConnectConnections} ${smartConnectConnections === 1 ? "connectie" : "connecties"}`);
  }

  const planningAppUsers = positiveInteger(
    calculatorInputs.planningAppUsers ?? calculatorInputs.planningAppUserCount,
  );
  if (planningAppUsers > 0 && !lines.some((line) => line.toLowerCase().includes("planningsapp"))) {
    lines.push("Module planningsapp");
  }

  return lines;
}

export function getNewCustomerEmailMissingFields(input: {
  implementation: NewCustomerImplementation;
  intakeSubmitted: boolean;
}) {
  const missing: string[] = [];
  if (!input.intakeSubmitted) missing.push("ontvangen klantgegevensformulier");
  if (!input.implementation.assigned_consultant_name?.trim()) missing.push("toegewezen consultant");
  if (!input.implementation.administration_name?.trim()) missing.push("administratie");
  if (!input.implementation.planned_go_live_date?.trim()) missing.push("geplande livegang");
  if (!input.implementation.financial_package?.trim()) missing.push("financieel pakket");
  if (!input.implementation.website_webshop?.trim()) missing.push("website/webshop");
  return missing;
}

export function buildNewCustomerEmail(input: NewCustomerEmailInput) {
  const { implementation, deal, intake } = input;
  const calculatorInputs = asRecord(deal.calculator_inputs);
  const packageName = deal.package_name?.trim() || "Smart Trade";
  const totalUsers = Math.max(1, positiveInteger(deal.total_users) || 1);
  const extraUsers = Math.max(0, totalUsers - 1);
  const includeSupport = calculatorInputs.includeSupport !== false;
  const includeTravelCosts = calculatorInputs.includeTravelCosts !== false;
  const planningAppUsers = positiveInteger(
    calculatorInputs.planningAppUsers ?? calculatorInputs.planningAppUserCount,
  );
  const modules = moduleLines(deal, calculatorInputs);
  const primaryContactName = combineCustomerContactName(
    intake.contactFirstName,
    intake.contactLastName,
  );
  const administrationContactName = combineCustomerContactName(
    intake.administrationFirstName,
    intake.administrationLastName,
  );
  const contactLines: string[] = [];

  if (primaryContactName || intake.contactEmail) {
    contactLines.push([
      escapeHtml(primaryContactName),
      intake.contactEmail ? `(${emailLink(intake.contactEmail)})` : "",
    ].filter(Boolean).join(" "));
  }
  if (
    (administrationContactName || intake.administrationEmail) &&
    (!sameText(administrationContactName, primaryContactName) ||
      !sameText(intake.administrationEmail, intake.contactEmail))
  ) {
    contactLines.push([
      escapeHtml(administrationContactName),
      intake.administrationEmail ? `(${emailLink(intake.administrationEmail)})` : "",
    ].filter(Boolean).join(" "));
  }

  const licenseLines = [
    `1x Smart Trade ${escapeHtml(packageName)} - 1e gebruiker`,
  ];
  if (extraUsers > 0) {
    licenseLines.push(`${extraUsers}x Smart Trade ${escapeHtml(packageName)} - extra gebruikers`);
  }
  if (planningAppUsers > 0) {
    licenseLines.push(`${planningAppUsers}x Smart Trade ${escapeHtml(packageName)} - planningsapp gebruikers`);
  }

  const supportLines = includeSupport
    ? [
      `1x Supportcontract Smart Trade ${escapeHtml(packageName)} - 1e gebruiker`,
      ...(extraUsers > 0
        ? [`${extraUsers}x Supportcontract Smart Trade ${escapeHtml(packageName)} - extra gebruikers`]
        : []),
    ]
    : ["Geen supportcontract"];

  const implementationUsers = planningAppUsers > 0
    ? `${totalUsers} (+ ${planningAppUsers} planningsapp gebruikers)`
    : String(totalUsers);
  const implementationLine = [
    `Smart Trade ${escapeHtml(packageName)} - gebruikers ${implementationUsers}: ${escapeHtml(euro.format(Number(deal.implementation_total || 0)))}`,
    includeTravelCosts ? "inclusief reiskosten" : "exclusief reiskosten",
  ].join(", ") + ".";
  const customerName = customerDisplayName(
    implementation.customer_name.trim(),
    intake.deliveryName.trim(),
  );

  const htmlBody = [
    '<p style="margin:0 0 12pt">Beste collega\'s,</p>',
    section("Nieuwe klant", lineList([
      escapeHtml(customerName),
      escapeHtml(`${intake.deliveryStreet} ${intake.deliveryNumber}`.trim()),
      escapeHtml(`${intake.deliveryPostcode} ${intake.deliveryCity}`.trim()),
      `Telefoon: ${escapeHtml(intake.phone)}`,
      ...(intake.mobile ? [`Mobiel: ${escapeHtml(intake.mobile)}`] : []),
      `KvK-nummer: ${escapeHtml(intake.chamberOfCommerceNumber)}`,
      `BTW-nummer: ${escapeHtml(intake.vatNumber)}`,
    ])),
    section("Contactpersoon", lineList(contactLines.length > 0 ? contactLines : ["-"])),
    section("E-mail", intake.generalEmail ? emailLink(intake.generalEmail) : "-"),
    section("Website", intake.website ? websiteLink(intake.website) : "-"),
    section("Licentie", bulletList(licenseLines)),
    section("Support", bulletList(supportLines)),
    `<p style="margin:0 0 12pt"><strong>Totaal maandbedrag licentie${includeSupport ? " + supportcontract" : ""}: ${escapeHtml(euro.format(Number(deal.monthly_total || 0)))}</strong></p>`,
    section("Modules", modules.length > 0 ? bulletList(modules) : lineList(["Geen aanvullende modules"])),
    section("Implementatie", bulletList([implementationLine])),
    section("Consultant", bulletList([
      escapeHtml(implementation.assigned_consultant_name?.trim() || "Nog niet toegewezen"),
    ])),
    section("Administratie", bulletList([
      escapeHtml(implementation.administration_name?.trim() || "-"),
    ])),
    section("Geplande livegang", bulletList([
      escapeHtml(formatDate(implementation.planned_go_live_date?.trim() || "")),
    ])),
    section("Financieel pakket", bulletList([
      escapeHtml(implementation.financial_package?.trim() || "-"),
    ])),
    section("Website/webshop", bulletList([
      escapeHtml(implementation.website_webshop?.trim() || "-"),
    ])),
  ].join("");

  return {
    subject: `Nieuwe klant: ${implementation.customer_name.trim() || intake.deliveryName.trim()}`,
    htmlBody,
  };
}
