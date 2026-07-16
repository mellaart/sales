import { spawn } from "node:child_process";
import path from "node:path";
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

function textValue(value: unknown, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function runRefundFiller(templatePath: string, values: Record<string, string>) {
  return new Promise<Buffer>((resolve, reject) => {
    const pythonBin = process.env.WORLDLINE_PYTHON_BIN?.trim() || "python3";
    const scriptPath = path.join(process.cwd(), "scripts", "fill-worldline-refund.py");
    const child = spawn(pythonBin, [scriptPath, templatePath], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      child.kill();
      if (!settled) {
        settled = true;
        reject(new Error("Refundformulier invullen duurde te lang."));
      }
    }, 15000);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;

      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || "Refundformulier invullen mislukt."));
        return;
      }

      resolve(Buffer.concat(stdout));
    });

    child.stdin.end(JSON.stringify(values));
  });
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
    const missing = [
      ["bedrijfsnaam", companyName],
      ["vestigingsadres", businessAddress],
      ["postcode", businessPostcode],
      ["plaats", businessCity],
      ["btw-nummer", vatNumber],
    ].filter(([, value]) => !value).map(([label]) => label);

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Vul eerst de volgende bedrijfsgegevens in: ${missing.join(", ")}.` },
        { status: 400 },
      );
    }

    const templatePath = path.join(process.cwd(), "public", WORLDLINE_REFUND_TEMPLATE_PATH.replace(/^\//, ""));
    const result = await runRefundFiller(templatePath, {
      companyName,
      businessAddress,
      postcodeCity: `${businessPostcode} ${businessCity}`,
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
