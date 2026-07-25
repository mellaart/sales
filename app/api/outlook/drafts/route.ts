import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import {
  createOutlookDraft,
  getOutlookConnectUrl,
  OutlookReconnectRequiredError,
} from "@/lib/outlook-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PDF_SIZE = 2_800_000;

function textValue(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
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
    '<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1f2937">',
    `<p>${greeting}</p>`,
    `<p>Zoals besproken ontvangt u in de bijlage onze offerte${customerReference}.</p>`,
    "<p>In de offerte vindt u een helder overzicht van de gekozen Smart Trade-oplossing, de maandelijkse kosten en de implementatie.</p>",
    "<p>Mocht u vragen hebben of de offerte samen willen doornemen, dan hoor ik dat graag.</p>",
    "</div>",
  ].join("");
}

export async function POST(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 401 });
    }

    const formData = await request.formData();
    const recipientEmail = textValue(formData, "recipientEmail", 320).toLowerCase();
    const customerName = textValue(formData, "customerName", 200);
    const contactName = textValue(formData, "contactName", 200);
    const attachment = formData.get("attachment");

    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return NextResponse.json({ error: "Vul een geldig e-mailadres van de klant in." }, { status: 400 });
    }
    if (!(attachment instanceof File) || attachment.type !== "application/pdf") {
      return NextResponse.json({ error: "De offerte-PDF ontbreekt." }, { status: 400 });
    }
    if (attachment.size <= 0 || attachment.size > MAX_PDF_SIZE) {
      return NextResponse.json(
        { error: "De offerte-PDF is te groot om direct aan een Outlook-concept toe te voegen." },
        { status: 400 },
      );
    }

    const subject = `Offerte Smart Trade - ${customerName || "prijsvoorstel"}`;
    const webLink = await createOutlookDraft(request, verified.user.id, {
      recipientEmail,
      subject,
      htmlBody: quoteEmail({ contactName, customerName }),
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
