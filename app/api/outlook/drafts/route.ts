import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import {
  createOutlookDraft,
  getOutlookConnectUrl,
  OutlookReconnectRequiredError,
} from "@/lib/outlook-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PDF_SIZE = 25 * 1024 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type OutlookDraftTemplate = "customer-intake" | "dns-instructions";

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
}) {
  const greetingName = firstName(input.contactName);
  const greeting = greetingName ? `Beste ${escapeHtml(greetingName)},` : "Beste,";
  const customerReference = input.customerName
    ? ` voor ${escapeHtml(input.customerName)}`
    : "";

  return [
    `<p style="margin:0 0 12pt">${greeting}</p>`,
    `<p style="margin:0 0 12pt">Zoals besproken ontvangt u in de bijlage onze offerte${customerReference}.</p>`,
    '<p style="margin:0 0 12pt">In de offerte vindt u een helder overzicht van de gekozen Smart Trade-oplossing, de maandelijkse kosten en de implementatie.</p>',
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

function validHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
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
      } else {
        return NextResponse.json({ error: "Onbekend Outlook-mailsjabloon." }, { status: 400 });
      }

      const webLink = await createOutlookDraft(request, verified.user.id, {
        recipientEmail,
        subject,
        htmlBody,
        signature,
      });

      return NextResponse.json(
        { webLink },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    }

    const formData = await request.formData();
    const recipientEmail = textValue(formData, "recipientEmail", 320).toLowerCase();
    const customerName = textValue(formData, "customerName", 200);
    const contactName = textValue(formData, "contactName", 200);
    const attachment = formData.get("attachment");

    if (!EMAIL_PATTERN.test(recipientEmail)) {
      return NextResponse.json({ error: "Vul een geldig e-mailadres van de klant in." }, { status: 400 });
    }
    if (!(attachment instanceof File) || attachment.type !== "application/pdf") {
      return NextResponse.json({ error: "De offerte-PDF ontbreekt." }, { status: 400 });
    }
    if (attachment.size <= 0 || attachment.size > MAX_PDF_SIZE) {
      return NextResponse.json(
        { error: "De offerte-PDF mag maximaal 25 MB groot zijn." },
        { status: 400 },
      );
    }

    const subject = `Offerte Smart Trade - ${customerName || "prijsvoorstel"}`;
    const webLink = await createOutlookDraft(request, verified.user.id, {
      recipientEmail,
      subject,
      htmlBody: quoteEmail({ contactName, customerName }),
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
