import { readFile } from "node:fs/promises";
import path from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { WORLDLINE_REFUND_TEMPLATE_PATH } from "@/lib/worldline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RefundFormBody = {
  companyName?: unknown;
  businessAddress?: unknown;
  businessPostcode?: unknown;
  businessCity?: unknown;
  vatNumber?: unknown;
};

const REFUND_TEMPLATE_MARKERS = {
  companyName: "{{companyName}}",
  businessAddress: "{{businessAddress}}",
  postcodeCity: "{{postcodeCity}}",
  vatNumber: "{{vatNumber}}",
} as const;

function textValue(value: unknown, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function escapeXmlText(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    })[character] ?? character,
  );
}

async function fillRefundTemplate(
  templatePath: string,
  values: Record<keyof typeof REFUND_TEMPLATE_MARKERS, string>,
) {
  const template = await readFile(templatePath);
  const archive = unzipSync(template);
  const documentPart = archive["word/document.xml"];

  if (!documentPart) {
    throw new Error("Refund-template bevat geen Word-document.");
  }

  let documentXml = strFromU8(documentPart);
  for (const [key, marker] of Object.entries(REFUND_TEMPLATE_MARKERS) as Array<
    [keyof typeof REFUND_TEMPLATE_MARKERS, string]
  >) {
    if (!documentXml.includes(marker)) {
      throw new Error(`Refund-template mist veld ${key}.`);
    }
    documentXml = documentXml.replaceAll(marker, escapeXmlText(values[key]));
  }

  archive["word/document.xml"] = strToU8(documentXml);
  return Buffer.from(zipSync(archive, { level: 6 }));
}

export async function POST(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as RefundFormBody | null;
    const companyName = textValue(body?.companyName);
    const businessAddress = textValue(body?.businessAddress);
    const businessPostcode = textValue(body?.businessPostcode, 30);
    const businessCity = textValue(body?.businessCity, 100);
    const vatNumber = textValue(body?.vatNumber, 40);

    const templatePath = path.join(process.cwd(), "public", WORLDLINE_REFUND_TEMPLATE_PATH.replace(/^\//, ""));
    const result = await fillRefundTemplate(templatePath, {
      companyName,
      businessAddress,
      postcodeCity: [businessPostcode, businessCity].filter(Boolean).join(" "),
      vatNumber,
    });
    const arrayBuffer = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer;

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="Worldline-refund-addendum.docx"',
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Refundformulier invullen mislukt." },
      { status: 500 },
    );
  }
}
