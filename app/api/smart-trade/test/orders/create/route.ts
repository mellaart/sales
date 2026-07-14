import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import {
  fetchWithSmartTradeTimeout,
  getSmartTradePullConfig,
  getSmartTradePullHeaders,
} from "@/lib/smart-trade-pull-test";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OrderLineBody = {
  quantity?: unknown;
  unit?: unknown;
  description?: unknown;
  remark?: unknown;
  price?: unknown;
};

type CreateOrderBody = {
  mode?: unknown;
  debtorId?: unknown;
  invoiceRelationId?: unknown;
  employeeId?: unknown;
  reference?: unknown;
  commentAboveLines?: unknown;
  commentBelowLines?: unknown;
  internalComment?: unknown;
  lines?: unknown;
};

function textValue(value: unknown, maxLength = 255) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function positiveInteger(value: unknown) {
  const normalized = typeof value === "number" ? value : Number(textValue(value, 20));
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function decimalValue(value: unknown) {
  const normalized = typeof value === "number"
    ? value
    : Number(textValue(value, 40).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : null;
}

async function responseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function apiErrorMessage(status: number, body: unknown) {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const message = record.message ?? record.error ?? record.userMessage;
    const errors = record.errors;
    if (errors && typeof errors === "object") {
      const details = Object.entries(errors as Record<string, unknown>)
        .flatMap(([field, value]) => (Array.isArray(value) ? value : [value])
          .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
          .map((item) => `${field}: ${item.trim()}`))
        .join(" ");
      if (details) return details;
    }
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 700);
  return `Smart Trade API gaf status ${status}.`;
}

function orderIdFromResponse(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const data = record.data && typeof record.data === "object"
    ? record.data as Record<string, unknown>
    : record;
  const id = data.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

export async function POST(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 401 });
    }

    if (verified.profile.role !== "admin") {
      return NextResponse.json({ error: "Alleen een admin kan testorders aanmaken." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as CreateOrderBody | null;
    const mode = body?.mode === "create" ? "create" : "preview";
    const debtorId = positiveInteger(body?.debtorId);
    const invoiceRelationId = positiveInteger(body?.invoiceRelationId) ?? debtorId;
    const employeeId = positiveInteger(body?.employeeId);
    const rawLines = Array.isArray(body?.lines) ? body.lines as OrderLineBody[] : [];

    if (!debtorId || !invoiceRelationId || !employeeId) {
      return NextResponse.json(
        { error: "Debiteur-ID, factuurrelatie-ID en medewerker-ID moeten geldige ID's zijn." },
        { status: 400 },
      );
    }

    if (rawLines.length === 0) {
      return NextResponse.json({ error: "Voeg minimaal één orderregel toe." }, { status: 400 });
    }

    const lines = [];
    for (const [index, line] of rawLines.entries()) {
      const quantity = decimalValue(line.quantity);
      const price = decimalValue(line.price);
      const description = textValue(line.description, 240);
      if (quantity === null || quantity <= 0 || price === null || price < 0 || !description) {
        return NextResponse.json(
          { error: `Controleer aantal, omschrijving en prijs van orderregel ${index + 1}.` },
          { status: 400 },
        );
      }

      lines.push({
        sortOrder: index + 1,
        quantity,
        unit: textValue(line.unit, 30) || "st",
        description,
        remark: textValue(line.remark, 500),
        price,
      });
    }

    const payload = {
      debtor: debtorId,
      invoiceRelation: invoiceRelationId,
      employee: employeeId,
      reference: textValue(body?.reference, 180),
      commentAboveLines: textValue(body?.commentAboveLines, 1000),
      commentBelowLines: textValue(body?.commentBelowLines, 1000),
      internalComment: textValue(body?.internalComment, 1000),
      lines,
    };

    const config = getSmartTradePullConfig("test");
    const apiPath = mode === "preview" ? "/api/v1/orders/preview" : "/api/v1/orders";
    const targetUrl = new URL(apiPath, config.baseUrl).toString();
    const headers = getSmartTradePullHeaders("test", {
      "content-type": "application/json",
    });
    const response = await fetchWithSmartTradeTimeout(targetUrl, headers, "test", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const apiBody = await responseBody(response);

    if (!response.ok) {
      return NextResponse.json(
        {
          error: apiErrorMessage(response.status, apiBody),
          apiStatus: response.status,
          apiResponse: apiBody,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        mode,
        previewed: mode === "preview",
        created: mode === "create",
        apiStatus: response.status,
        orderId: mode === "create" ? orderIdFromResponse(apiBody) : null,
        order: apiBody,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Testorder verwerken mislukt." },
      { status: 500 },
    );
  }
}
