import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import {
  createOutlookDraft,
  getOutlookConnectUrl,
  OutlookReconnectRequiredError,
} from "@/lib/outlook-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
const MAX_WORLDLINE_ATTACHMENT_COUNT = 4;
const MAX_WORLDLINE_TOTAL_SIZE = 50 * 1024 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WORD_DOCUMENT_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type OutlookDraftTemplate =
  | "customer-intake"
  | "dns-instructions"
  | "implementation-appointment"
  | "implementation-progress"
  | "worldline-contract"
  | "worldline-return-pin";

type ImplementationAppointmentWorkItem = {
  group: string;
  label: string;
};

function textValue(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function jsonText(
  payload: Record<string, unknown>,
  key: string,
  maxLength: number,
) {
  const value = payload[key];
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

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

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] ?? "";
}

function quoteEmail(input: {
  contactName: string;
  customerName: string;
  approvalUrl: string;
}) {
  const greetingName = firstName(input.contactName);
  const greeting = greetingName ? `Beste ${escapeHtml(greetingName)},` : "Beste,";
  const customerReference = input.customerName
    ? ` voor ${escapeHtml(input.customerName)}`
    : "";
  const approvalUrl = escapeHtml(input.approvalUrl);

  return [
    `<p style="margin:0 0 12pt">${greeting}</p>`,
    `<p style="margin:0 0 12pt">Zoals besproken ontvangt u in de bijlage onze offerte${customerReference}.</p>`,
    '<p style="margin:0 0 12pt">In de offerte vindt u een helder overzicht van de gekozen Smart Trade-oplossing, de maandelijkse kosten en de implementatie.</p>',
    '<p style="margin:0 0 12pt">Gaat u akkoord met de offerte? Bevestig dit dan via onderstaande beveiligde link.</p>',
    `<p style="margin:0 0 12pt"><a href="${approvalUrl}" style="display:inline-block;padding:9pt 14pt;background:#1769bd;color:#ffffff;text-decoration:none;font-weight:700">Offerte akkoord geven</a></p>`,
    `<p style="margin:0 0 12pt"><a href="${approvalUrl}" style="color:#0563c1;text-decoration:underline">${approvalUrl}</a></p>`,
    '<p style="margin:0">Mocht u vragen hebben of de offerte samen willen doornemen, dan hoor ik dat graag.</p>',
  ].join("");
}

function customerIntakeEmail(input: {
  contactName: string;
  publicUrl: string;
}) {
  const greetingName = firstName(input.contactName);
  const greeting = greetingName ? `Beste ${escapeHtml(greetingName)},` : "Beste,";
  const publicUrl = escapeHtml(input.publicUrl);

  return [
    `<p style="margin:0 0 12pt">${greeting}</p>`,
    '<p style="margin:0 0 12pt">Wilt u via onderstaande beveiligde link de gegevens voor de inrichting van Smart Trade invullen?</p>',
    `<p style="margin:0 0 12pt"><a href="${publicUrl}" style="color:#0563c1;text-decoration:underline">${publicUrl}</a></p>`,
    '<p style="margin:0">Na het opslaan ontvangen wij de gegevens automatisch.</p>',
  ].join("");
}

function implementationPortalLink(publicUrl: string, label = "Open uw Smart Trade-klantpagina") {
  const url = escapeHtml(publicUrl);
  return [
    `<p style="margin:0 0 10pt"><a href="${url}" style="display:inline-block;padding:9pt 14pt;background:#1769bd;color:#ffffff;text-decoration:none;font-weight:700">${escapeHtml(label)}</a></p>`,
    `<p style="margin:0 0 12pt"><a href="${url}" style="color:#0563c1;text-decoration:underline">${url}</a></p>`,
  ].join("");
}

function implementationProgressEmail(input: {
  contactName: string;
  customerName: string;
  publicUrl: string;
}) {
  const greetingName = firstName(input.contactName);
  const greeting = greetingName ? `Beste ${escapeHtml(greetingName)},` : "Beste,";
  const customerReference = input.customerName
    ? ` van ${escapeHtml(input.customerName)}`
    : "";

  return [
    `<p style="margin:0 0 12pt">${greeting}</p>`,
    `<p style="margin:0 0 12pt">Via onderstaande beveiligde klantpagina kunt u de voortgang van de Smart Trade-implementatie${customerReference} volgen.</p>`,
    '<p style="margin:0 0 5pt"><strong>Op deze pagina kunt u:</strong></p>',
    '<ul style="margin:0 0 12pt;padding-left:22px"><li>de geplande implementatieafspraken bekijken;</li><li>de werkzaamheden en de actuele voortgang volgen;</li><li>opmerkingen bij werkzaamheden toevoegen en afgeronde werkzaamheden bevestigen;</li><li>bestanden voor briefpapier en logo, relaties en artikelen veilig aanleveren.</li></ul>',
    implementationPortalLink(input.publicUrl),
    '<p style="margin:0">Deze link is persoonlijk voor uw implementatiedossier. Bewaar de link daarom zorgvuldig.</p>',
  ].join("");
}

function implementationAppointmentEmail(input: {
  contactName: string;
  appointmentDateLabel: string;
  startTime: string;
  endTime: string;
  appointmentType: "on_site" | "remote";
  location: string;
  title: string;
  customerNote: string;
  workItems: ImplementationAppointmentWorkItem[];
  publicUrl: string;
}) {
  const greetingName = firstName(input.contactName);
  const greeting = greetingName ? `Beste ${escapeHtml(greetingName)},` : "Beste,";
  const appointmentType = input.appointmentType === "on_site" ? "Op locatie" : "Online / op afstand";
  const groupedWork = input.workItems.reduce<Map<string, string[]>>((groups, item) => {
    const current = groups.get(item.group) ?? [];
    current.push(item.label);
    groups.set(item.group, current);
    return groups;
  }, new Map());
  const workHtml = groupedWork.size > 0
    ? [
      '<p style="margin:0 0 5pt"><strong>Geplande werkzaamheden</strong></p>',
      ...Array.from(groupedWork.entries()).map(([group, labels]) => [
        `<p style="margin:0 0 3pt"><strong>${escapeHtml(group)}</strong></p>`,
        `<ul style="margin:0 0 10pt;padding-left:22px">${labels.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}</ul>`,
      ].join("")),
    ].join("")
    : '<p style="margin:0 0 12pt">De werkzaamheden voor deze afspraak stemmen we samen met u af.</p>';
  const customerNote = input.customerNote
    ? `<p style="margin:0 0 12pt"><strong>Toelichting</strong><br>${escapeHtml(input.customerNote).replace(/\r?\n/g, "<br>")}</p>`
    : "";

  return [
    `<p style="margin:0 0 12pt">${greeting}</p>`,
    `<p style="margin:0 0 12pt">Hierbij bevestigen wij de volgende afspraak voor de implementatie van Smart Trade.</p>`,
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14pt;border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1f2937">',
    `<tr><td style="padding:0 16px 4px 0;font-weight:700">Onderwerp</td><td style="padding:0 0 4px">${escapeHtml(input.title)}</td></tr>`,
    `<tr><td style="padding:0 16px 4px 0;font-weight:700">Datum</td><td style="padding:0 0 4px">${escapeHtml(input.appointmentDateLabel)}</td></tr>`,
    `<tr><td style="padding:0 16px 4px 0;font-weight:700">Tijd</td><td style="padding:0 0 4px">${escapeHtml(input.startTime)} - ${escapeHtml(input.endTime)}</td></tr>`,
    `<tr><td style="padding:0 16px 4px 0;font-weight:700">Afspraak</td><td style="padding:0 0 4px">${appointmentType}</td></tr>`,
    `<tr><td style="padding:0 16px 4px 0;font-weight:700">Locatie</td><td style="padding:0 0 4px">${escapeHtml(input.location)}</td></tr>`,
    "</table>",
    workHtml,
    customerNote,
    '<p style="margin:0 0 12pt">Via de beveiligde klantpagina kunt u de afspraak, werkzaamheden en actuele voortgang bekijken. U kunt daar ook opmerkingen plaatsen en benodigde bestanden veilig aanleveren.</p>',
    implementationPortalLink(input.publicUrl),
    '<p style="margin:0">Bij deze e-mail is een agenda-bestand (.ics) toegevoegd. Open het bestand om de afspraak aan uw eigen agenda toe te voegen.</p>',
  ].join("");
}

function dnsInstructionsEmail(input: {
  contactName: string;
  domain: string;
}) {
  const greetingName = firstName(input.contactName);
  const greeting = greetingName ? `Beste ${escapeHtml(greetingName)},` : "Beste,";
  const domain = escapeHtml(input.domain);

  return [
    `<p style="margin:0 0 12pt">${greeting}</p>`,
    `<p style="margin:0 0 12pt">Wij gebruiken Smart Trade om e-mail te versturen namens het domein <strong>${domain}</strong>. Om te voorkomen dat berichten als ongewenst gemarkeerd worden, moeten er een paar DNS-aanpassingen worden gedaan. Hieronder vindt u alle benodigde gegevens.</p>`,
    `<p style="margin:0 0 12pt"><strong>Benodigde aanpassingen voor ${domain}</strong></p>`,
    '<p style="margin:0 0 4pt"><strong>SPF-record</strong></p>',
    '<p style="margin:0 0 4pt">Voeg de volgende regels toe aan het bestaande SPF-record:</p>',
    '<p style="margin:0">include:_spf.smartsoft.nu</p>',
    '<p style="margin:0 0 12pt">include:_spf.troublefreehosting.nl</p>',
    '<p style="margin:0 0 4pt"><strong>DKIM-record 1</strong></p>',
    '<p style="margin:0">Naam: smtp01-smartsoft._domainkey</p>',
    '<p style="margin:0">Type: CNAME</p>',
    '<p style="margin:0 0 12pt">Waarde: smtp01._domainkey.smartsoft.nu</p>',
    '<p style="margin:0 0 4pt"><strong>DKIM-record 2</strong></p>',
    '<p style="margin:0">Naam: smtp02-tfh._domainkey</p>',
    '<p style="margin:0">Type: CNAME</p>',
    '<p style="margin:0 0 12pt">Waarde: smtp02-tfh._domainkey.troublefreehosting.nl</p>',
    '<p style="margin:0 0 4pt"><strong>Let op:</strong></p>',
    '<p style="margin:0 0 4pt">Sommige DNS-beheerders vereisen een punt aan het eind van de waardes.</p>',
    '<p style="margin:0 0 12pt">Controleer het SPF-record via <a href="https://www.kitterman.com/spf/validate.html" style="color:#0563c1;text-decoration:underline">Kitterman&rsquo;s SPF Checker</a>.</p>',
    '<p style="margin:0">Na het doorvoeren van de wijzigingen kunt u een e-mail sturen naar <a href="mailto:support@troublefree.nl" style="color:#0563c1;text-decoration:underline">support@troublefree.nl</a> of naar mij om het te laten valideren.</p>',
  ].join("");
}

function worldlineContractEmail(input: {
  contactName: string;
  refundEnabled: boolean;
}) {
  const greetingName = firstName(input.contactName);
  const greeting = greetingName ? `Beste ${escapeHtml(greetingName)},` : "Beste,";
  const listStyle = "margin:0 0 12pt;padding-left:22px";
  const refundInstructions = input.refundEnabled
    ? [
      '<p style="margin:0 0 4pt"><strong>Bijlage Refund</strong></p>',
      `<ul style="${listStyle}"><li>Plaats</li><li>Datum</li><li>Handtekening</li><li>Naam tekenbevoegde</li></ul>`,
    ]
    : [];

  return [
    `<p style="margin:0 0 12pt">${greeting}</p>`,
    '<p style="margin:0 0 12pt">Hierbij ontvangt u de overeenkomst voor het accepteren van betaalkaarten via Worldline.</p>',
    '<p style="margin:0 0 12pt">Graag ontvangen we deze overeenkomst volledig ingevuld en getekend terug. Er kunnen personen gezamenlijk tekenbevoegd zijn; in dat geval dienen al deze personen de overeenkomst te tekenen.</p>',
    '<p style="margin:0 0 12pt"><strong>Wilt u de volgende verplichte velden invullen?</strong></p>',
    '<p style="margin:0 0 4pt"><strong>Sectie: Bedrijfsgegevens (Company)</strong></p>',
    `<ul style="${listStyle}"><li>BTW-nummer</li><li>E-mailadres voor facturatie</li></ul>`,
    '<p style="margin:0 0 4pt"><strong>Sectie: Betaalkaarten en tarieven</strong></p>',
    `<ul style="${listStyle}"><li>Gewenste betaalkaarten</li><li>Refund</li><li>Verwacht gemiddeld debit transactiebedrag</li><li>Verwacht aantal debit transacties per jaar</li></ul>`,
    '<p style="margin:0 0 4pt"><strong>Sectie: Uitbetaling</strong></p>',
    `<ul style="${listStyle}"><li>Naam rekeninghouder</li><li>Rekeningnummer (IBAN)</li><li>BIC-code</li></ul>`,
    '<p style="margin:0 0 4pt"><strong>Sectie: Handtekening akkoord overeenkomst en algemene voorwaarden</strong></p>',
    `<ul style="${listStyle}"><li>Plaats en datum</li><li>Functie</li><li>Handtekening tekenbevoegde(n). Let op: ondertekening mag uitsluitend met een natte handtekening. Digitale ondertekening wordt niet geaccepteerd.</li></ul>`,
    '<p style="margin:0 0 12pt"><strong>Daarnaast ontvangen we graag de volgende documenten:</strong></p>',
    `<ul style="${listStyle}"><li>Kopie van een geldig legitimatiebewijs van de tekenbevoegde persoon of personen. Alleen het BSN mag afgeschermd zijn. Bij een identiteitskaart ook de achterkant meesturen.</li><li>Uittreksel KvK, niet ouder dan twee maanden, inclusief eventuele vervolguittreksels. De tekenbevoegde natuurlijke persoon of personen moeten hierop zichtbaar zijn. Troublefree vraagt deze documenten rechtstreeks op bij de Kamer van Koophandel; hiervoor hoeft u zelf niets te doen.</li><li>Kopie rekeningafschrift, niet ouder dan twee maanden. Hierop moeten de naam van de bank, bedrijfsnaam, het IBAN en de datum zichtbaar zijn.</li></ul>`,
    '<p style="margin:0 0 4pt"><strong>Bijlage: UBO-registratieformulier</strong></p>',
    `<ul style="${listStyle}"><li>Alle velden die van toepassing zijn</li><li>Datum en plaats</li><li>Voorna(a)m(en) en achterna(a)m(en) van de wettelijke vertegenwoordiger(s) in blokletters</li><li>Handtekeningen van de wettelijke vertegenwoordiger(s)</li></ul>`,
    '<p style="margin:0 0 4pt"><strong>Bijlage: KYC- en AML-vragenlijst</strong></p>',
    `<ul style="${listStyle}"><li>Alle velden die van toepassing zijn</li></ul>`,
    ...refundInstructions,
    '<p style="margin:0 0 12pt">Wilt u alles naar mij mailen, zodat Worldline de aanvraag kan starten?</p>',
    '<p style="margin:0 0 12pt">Binnenkort zal iemand van Worldline contact met u opnemen voor een korte UBO-check. Dit gebeurt telefonisch of per e-mail. Let op: de telefonische oproep komt vanuit België. Deze controle is verplicht ter voorkoming van witwassen en financiering van terrorisme.</p>',
    '<p style="margin:0 0 12pt">Na de controle ontvangt u van Worldline een e-mail met toegang tot het extranet voor het inzien van de pintransacties.</p>',
    '<p style="margin:0">Mochten er nog vragen zijn, dan hoor ik het graag.</p>',
  ].join("");
}

function worldlineReturnPinEmail(input: {
  contactName: string;
  customerName: string;
  publicUrl: string;
}) {
  const greetingName = firstName(input.contactName);
  const greeting = greetingName ? `Beste ${escapeHtml(greetingName)},` : "Beste,";
  const customerName = input.customerName ? ` voor ${escapeHtml(input.customerName)}` : "";
  const publicUrl = escapeHtml(input.publicUrl);
  const listStyle = "margin:0 0 12pt;padding-left:22px";

  return [
    `<p style="margin:0 0 12pt">${greeting}</p>`,
    `<p style="margin:0 0 12pt">Om <strong>retourpinnen via Smart Trade</strong>${customerName} te kunnen activeren, willen wij u vragen om het onderstaande acceptatieformulier volledig in te vullen en digitaal goed te keuren:</p>`,
    `<p style="margin:0 0 12pt"><a href="${publicUrl}" style="display:inline-block;padding:9pt 14pt;background:#1769bd;color:#ffffff;text-decoration:none;font-weight:700">Acceptatieformulier retourpinnen openen</a></p>`,
    `<p style="margin:0 0 12pt"><a href="${publicUrl}" style="color:#0563c1;text-decoration:underline">${publicUrl}</a></p>`,
    '<p style="margin:0 0 5pt"><strong>In het formulier vragen we onder andere om:</strong></p>',
    `<ul style="${listStyle}"><li>de gewenste maximale bedragen per retourpintransactie en per dag;</li><li>vanaf welk bedrag een notificatie moet worden verstuurd;</li><li>het e-mailadres voor notificaties en de dagelijkse rapportage;</li><li>de medewerkers die geautoriseerd mogen worden om retourpintransacties uit te voeren;</li><li>de gegevens van de tekenbevoegde.</li></ul>`,
    '<p style="margin:0 0 12pt">Omdat retourpinnen het mogelijk maakt om bedragen via de pinterminal terug te storten, hebben we hiervoor bewust een aantal extra beveiligingsmaatregelen ingebouwd. In het formulier staan ook de verantwoordelijkheden rondom het gebruik, het beheer van gebruikers en pincodes en de controle van retourpintransacties beschreven.</p>',
    '<p style="margin:0 0 12pt">Na het volledig invullen en definitief goedkeuren van het formulier ontvangen wij de benodigde gegevens en kunnen wij <strong>retourpinnen in Smart Trade voor jullie activeren en instellen</strong>.</p>',
    '<p style="margin:0">Mochten er vragen zijn over het invullen of over de gekozen limieten, laat het gerust weten.</p>',
  ].join("");
}

function worldlineAttachmentContentType(file: File) {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".pdf")) return "application/pdf";
  if (lowerName.endsWith(".docx")) return WORD_DOCUMENT_CONTENT_TYPE;
  return null;
}

function validHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function jsonAppointmentWorkItems(payload: Record<string, unknown>) {
  const value = payload.workItems;
  if (!Array.isArray(value)) return [];

  return value.reduce<ImplementationAppointmentWorkItem[]>((items, rawItem) => {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem) || items.length >= 100) {
      return items;
    }
    const item = rawItem as Record<string, unknown>;
    const group = typeof item.group === "string"
      ? item.group.trim().replace(/\s+/g, " ").slice(0, 200)
      : "Werkzaamheden";
    const label = typeof item.label === "string"
      ? item.label.trim().replace(/\s+/g, " ").slice(0, 300)
      : "";
    if (label) items.push({ group: group || "Werkzaamheden", label });
    return items;
  }, []);
}

function validAppointmentDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validAppointmentTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function formatAppointmentDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(`${value}T12:00:00Z`));
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function icsDateTime(date: string, time: string) {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

function createImplementationAppointmentIcs(input: {
  appointmentId: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  title: string;
  location: string;
  customerNote: string;
  workItems: ImplementationAppointmentWorkItem[];
  publicUrl: string;
}) {
  const workLines = input.workItems.map((item) => `${item.group}: ${item.label}`);
  const description = [
    input.customerNote,
    workLines.length > 0 ? `Geplande werkzaamheden:\n${workLines.join("\n")}` : "",
    `Klantpagina: ${input.publicUrl}`,
  ].filter(Boolean).join("\n\n");
  const uidPart = input.appointmentId.replace(/[^a-z0-9-]/gi, "").slice(0, 80) || "afspraak";
  const dtStamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Smart Trade//Implementatieafspraak//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-TIMEZONE:Europe/Amsterdam",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Amsterdam",
    "X-LIC-LOCATION:Europe/Amsterdam",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:implementation-${uidPart}@sales.troublefree.nl`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;TZID=Europe/Amsterdam:${icsDateTime(input.appointmentDate, input.startTime)}`,
    `DTEND;TZID=Europe/Amsterdam:${icsDateTime(input.appointmentDate, input.endTime)}`,
    `SUMMARY:${escapeIcs(input.title)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `LOCATION:${escapeIcs(input.location)}`,
    `URL:${escapeIcs(input.publicUrl)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

function safeFileNamePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "smart-trade";
}

export async function POST(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 401 });
    }
    const signature = {
      fullName:
        verified.profile.full_name?.trim() ||
        verified.user.user_metadata.full_name?.trim() ||
        "Smart Trade",
      jobTitle: verified.profile.job_title?.trim() || "",
      workdays: verified.profile.workdays?.trim() || "",
      mobilePhone: verified.profile.mobile_phone?.trim() || "",
      email: verified.profile.email?.trim() || verified.user.email?.trim() || "",
    };

    if (request.headers.get("content-type")?.includes("application/json")) {
      const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
      if (!payload) {
        return NextResponse.json({ error: "De mailgegevens zijn ongeldig." }, { status: 400 });
      }

      const template = jsonText(payload, "template", 40) as OutlookDraftTemplate;
      const recipientEmail = jsonText(payload, "recipientEmail", 320).toLowerCase();
      const customerName = jsonText(payload, "customerName", 200);
      const contactName = jsonText(payload, "contactName", 200);

      if (!EMAIL_PATTERN.test(recipientEmail)) {
        return NextResponse.json({ error: "Vul een geldig e-mailadres van de klant in." }, { status: 400 });
      }

      let subject = "";
      let htmlBody = "";
      const attachments: Array<{
        fileName: string;
        contentType: string;
        fileContent: Buffer;
      }> = [];

      if (template === "customer-intake") {
        const publicUrl = jsonText(payload, "publicUrl", 2_000);
        if (!validHttpUrl(publicUrl)) {
          return NextResponse.json({ error: "De beveiligde klantlink is ongeldig." }, { status: 400 });
        }
        subject = `Klantgegevens Smart Trade - ${customerName || "nieuwe klant"}`;
        htmlBody = customerIntakeEmail({ contactName, publicUrl });
      } else if (template === "dns-instructions") {
        const domain = jsonText(payload, "domain", 253).toLowerCase();
        if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
          return NextResponse.json({ error: "De domeinnaam is ongeldig." }, { status: 400 });
        }
        subject = "SPF- en DKIM-aanpassingen";
        htmlBody = dnsInstructionsEmail({ contactName, domain });
      } else if (template === "implementation-progress") {
        const publicUrl = jsonText(payload, "publicUrl", 2_000);
        if (!validHttpUrl(publicUrl)) {
          return NextResponse.json({ error: "De beveiligde klantlink is ongeldig." }, { status: 400 });
        }
        subject = `Voortgang implementatie Smart Trade - ${customerName || "klant"}`;
        htmlBody = implementationProgressEmail({ contactName, customerName, publicUrl });
      } else if (template === "implementation-appointment") {
        const publicUrl = jsonText(payload, "publicUrl", 2_000);
        const appointmentId = jsonText(payload, "appointmentId", 100);
        const appointmentDate = jsonText(payload, "appointmentDate", 10);
        const startTime = jsonText(payload, "startTime", 5);
        const endTime = jsonText(payload, "endTime", 5);
        const appointmentType = jsonText(payload, "appointmentType", 20);
        const title = jsonText(payload, "title", 180) || "Implementatieafspraak Smart Trade";
        const location = jsonText(payload, "location", 500)
          || (appointmentType === "remote" ? "Online / op afstand" : "Op locatie");
        const customerNote = jsonText(payload, "customerNote", 1_000);
        const workItems = jsonAppointmentWorkItems(payload);

        if (!validHttpUrl(publicUrl)) {
          return NextResponse.json({ error: "De beveiligde klantlink is ongeldig." }, { status: 400 });
        }
        if (!validAppointmentDate(appointmentDate)) {
          return NextResponse.json({ error: "De datum van de implementatieafspraak is ongeldig." }, { status: 400 });
        }
        if (
          !validAppointmentTime(startTime)
          || !validAppointmentTime(endTime)
          || endTime <= startTime
        ) {
          return NextResponse.json({ error: "De begin- en eindtijd van de afspraak zijn ongeldig." }, { status: 400 });
        }
        if (appointmentType !== "on_site" && appointmentType !== "remote") {
          return NextResponse.json({ error: "Het soort implementatieafspraak is ongeldig." }, { status: 400 });
        }

        const appointmentDateLabel = formatAppointmentDate(appointmentDate);
        subject = `Implementatieafspraak Smart Trade - ${customerName || "klant"} - ${appointmentDateLabel}`;
        htmlBody = implementationAppointmentEmail({
          contactName,
          appointmentDateLabel,
          startTime,
          endTime,
          appointmentType,
          location,
          title,
          customerNote,
          workItems,
          publicUrl,
        });
        const ics = createImplementationAppointmentIcs({
          appointmentId,
          appointmentDate,
          startTime,
          endTime,
          title,
          location,
          customerNote,
          workItems,
          publicUrl,
        });
        attachments.push({
          fileName: `${safeFileNamePart(customerName)}-implementatieafspraak-${appointmentDate}.ics`,
          contentType: "text/calendar; charset=utf-8; method=PUBLISH",
          fileContent: Buffer.from(ics, "utf8"),
        });
      } else if (template === "worldline-return-pin") {
        const publicUrl = jsonText(payload, "publicUrl", 2_000);
        if (!validHttpUrl(publicUrl)) {
          return NextResponse.json({ error: "De beveiligde retourpinnenlink is ongeldig." }, { status: 400 });
        }
        subject = `Acceptatieformulier retourpinnen${customerName ? ` - ${customerName}` : ""}`;
        htmlBody = worldlineReturnPinEmail({ contactName, customerName, publicUrl });
      } else {
        return NextResponse.json({ error: "Onbekend Outlook-mailsjabloon." }, { status: 400 });
      }

      const webLink = await createOutlookDraft(request, verified.user.id, {
        recipientEmail,
        subject,
        htmlBody,
        signature,
        attachments,
      });

      return NextResponse.json(
        { webLink },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    }

    const formData = await request.formData();
    const template = textValue(formData, "template", 40) as OutlookDraftTemplate;
    const recipientEmail = textValue(formData, "recipientEmail", 320).toLowerCase();
    const customerName = textValue(formData, "customerName", 200);
    const contactName = textValue(formData, "contactName", 200);

    if (!EMAIL_PATTERN.test(recipientEmail)) {
      return NextResponse.json({ error: "Vul een geldig e-mailadres van de klant in." }, { status: 400 });
    }

    if (template === "worldline-contract") {
      const refundEnabled = textValue(formData, "refundEnabled", 10).toLowerCase() === "true";
      const expectedAttachmentCount = refundEnabled ? 4 : 3;
      const attachmentFiles = formData
        .getAll("attachments")
        .filter((value): value is File => value instanceof File);

      if (
        attachmentFiles.length !== expectedAttachmentCount ||
        attachmentFiles.length > MAX_WORLDLINE_ATTACHMENT_COUNT
      ) {
        return NextResponse.json(
          {
            error: refundEnabled
              ? "De aansluitovereenkomst, beide UBO-documenten en het Refund-formulier zijn verplicht."
              : "De aansluitovereenkomst en beide UBO-documenten zijn verplicht.",
          },
          { status: 400 },
        );
      }

      let totalAttachmentSize = 0;
      const attachments = [];
      for (const attachment of attachmentFiles) {
        const contentType = worldlineAttachmentContentType(attachment);
        if (!contentType) {
          return NextResponse.json(
            { error: "Worldline-bijlagen moeten PDF- of DOCX-bestanden zijn." },
            { status: 400 },
          );
        }
        if (attachment.size <= 0 || attachment.size > MAX_ATTACHMENT_SIZE) {
          return NextResponse.json(
            { error: "Een Worldline-bijlage is leeg of groter dan 25 MB." },
            { status: 400 },
          );
        }

        totalAttachmentSize += attachment.size;
        attachments.push({
          fileName: attachment.name.replace(/[\\/\0]/g, "-").slice(0, 180),
          contentType,
          fileContent: Buffer.from(await attachment.arrayBuffer()),
        });
      }

      if (totalAttachmentSize > MAX_WORLDLINE_TOTAL_SIZE) {
        return NextResponse.json(
          { error: "De Worldline-bijlagen zijn samen groter dan 50 MB." },
          { status: 400 },
        );
      }

      const webLink = await createOutlookDraft(request, verified.user.id, {
        recipientEmail,
        subject: "Worldline Transactiecontract",
        htmlBody: worldlineContractEmail({ contactName, refundEnabled }),
        signature,
        attachments,
      });

      return NextResponse.json(
        { webLink },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    }

    const attachment = formData.get("attachment");
    const approvalUrl = textValue(formData, "approvalUrl", 2_000);
    if (!validHttpUrl(approvalUrl)) {
      return NextResponse.json({ error: "De beveiligde akkoordlink is ongeldig." }, { status: 400 });
    }
    if (!(attachment instanceof File) || attachment.type !== "application/pdf") {
      return NextResponse.json({ error: "De offerte-PDF ontbreekt." }, { status: 400 });
    }
    if (attachment.size <= 0 || attachment.size > MAX_ATTACHMENT_SIZE) {
      return NextResponse.json(
        { error: "De offerte-PDF mag maximaal 25 MB groot zijn." },
        { status: 400 },
      );
    }

    const subject = `Offerte Smart Trade - ${customerName || "prijsvoorstel"}`;
    const webLink = await createOutlookDraft(request, verified.user.id, {
      recipientEmail,
      subject,
      htmlBody: quoteEmail({ contactName, customerName, approvalUrl }),
      signature,
      fileName: attachment.name.slice(0, 180) || "offerte-smart-trade.pdf",
      fileContent: Buffer.from(await attachment.arrayBuffer()),
    });

    return NextResponse.json(
      { webLink },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof OutlookReconnectRequiredError) {
      return NextResponse.json(
        {
          error: error.message,
          reconnectRequired: true,
          connectUrl: getOutlookConnectUrl(request, new URL(request.url).searchParams.get("returnTo")),
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Outlook-concept maken mislukt." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
