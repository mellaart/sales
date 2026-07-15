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
  article?: unknown;
  quantity?: unknown;
  description?: unknown;
  remark?: unknown;
  price?: unknown;
};

type CreateOrderBody = {
  mode?: unknown;
  debtorId?: unknown;
  reference?: unknown;
  commentAboveLines?: unknown;
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

function decimalString(value: unknown) {
  const normalized = typeof value === "number"
    ? value
    : Number(textValue(value, 40).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(normalized) ? String(normalized) : null;
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
    const employeeId = positiveInteger(verified.profile.employee_relation_id);
    const rawLines = Array.isArray(body?.lines) ? body.lines as OrderLineBody[] : [];

    if (!debtorId) {
      return NextResponse.json(
        { error: "Debiteur relatie-ID moet een geldig ID zijn." },
        { status: 400 },
      );
    }

    if (!employeeId) {
      return NextResponse.json(
        { error: "Vul op de Admin-pagina eerst een medewerker relatie-ID in bij jouw gebruiker." },
        { status: 400 },
      );
    }

    if (rawLines.length === 0) {
      return NextResponse.json({ error: "Voeg minimaal één orderregel toe." }, { status: 400 });
    }

    const lines = [];
    for (const [index, line] of rawLines.entries()) {
      const article = positiveInteger(line.article);
      const quantity = decimalString(line.quantity);
      const price = decimalString(line.price);
      const description = textValue(line.description, 240);
      if (!article) {
        return NextResponse.json(
          { error: `Kies bij orderregel ${index + 1} een artikel uit de zoeklijst.` },
          { status: 400 },
        );
      }

      if (
        quantity === null || Number(quantity) <= 0 ||
        price === null || Number(price) < 0 ||
        !description
      ) {
        return NextResponse.json(
          { error: `Controleer aantal, omschrijving en prijs van orderregel ${index + 1}.` },
          { status: 400 },
        );
      }

      lines.push({
        sortOrder: index + 1,
        article,
        quantity,
        unit: "st",
        description,
        remark: textValue(line.remark, 500),
        price,
      });
    }

    const payload = {
      debtor: debtorId,
      invoiceRelation: debtorId,
      employee: employeeId,
      deliveryMethod: 2,
      reference: textValue(body?.reference, 180),
      commentAboveLines: textValue(body?.commentAboveLines, 1000),
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
