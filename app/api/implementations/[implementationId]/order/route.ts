import { NextResponse } from "next/server";
import { getImplementationOrderBreakdown, IMPLEMENTATION_ARTICLE_ID } from "@/lib/implementation-order";
import { requireLocalUser } from "@/lib/local-auth";
import { query } from "@/lib/local-db";
import { executeLocalTableQuery } from "@/lib/local-table";
import { PROTECTED_ADMIN_EMAILS, isProtectedAdminEmail } from "@/lib/protected-admin";
import {
  fetchWithSmartTradeTimeout,
  getSmartTradePullConfig,
  getSmartTradePullHeaders,
} from "@/lib/smart-trade-pull-test";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ImplementationRow = {
  id: string;
  deal_id: string;
  customer_name: string;
  smart_trade_order_id: string | null;
  smart_trade_order_created_at: string | null;
};

type DealRow = {
  smart_trade_relation_id: number | null;
  package_name: string | null;
  implementation_total: number | null;
  calculator_inputs: unknown;
};

type EmployeeRow = {
  employee_relation_id: number | null;
};

type ModeBody = {
  mode?: unknown;
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function positiveInteger(value: unknown) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function decimalString(value: number) {
  return String(Math.round((value + Number.EPSILON) * 100) / 100);
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
    const errors = record.errors;
    if (errors && typeof errors === "object") {
      const details = Object.entries(errors as Record<string, unknown>)
        .flatMap(([field, value]) => (Array.isArray(value) ? value : [value])
          .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
          .map((item) => `${field}: ${item.trim()}`))
        .join(" ");
      if (details) return details;
    }

    const message = record.message ?? record.error ?? record.userMessage;
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  if (typeof body === "string" && body.trim()) {
    if (/<(?:!doctype|html|head|body)\b/i.test(body)) {
      return `Smart Trade API gaf status ${status}; de live orderroute is niet beschikbaar.`;
    }
    return body.trim().slice(0, 700);
  }
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

export async function POST(
  request: Request,
  context: { params: Promise<{ implementationId: string }> },
) {
  let claimedImplementationId: string | null = null;
  let liveOrderAcceptedBySmartTrade = false;

  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) return jsonResponse({ error: verified.message }, 401);

    if (!isProtectedAdminEmail(verified.user.email)) {
      return jsonResponse({ error: "Alleen Erik Mellaart kan de implementatieorder verwerken." }, 403);
    }

    const body = (await request.json().catch(() => null)) as ModeBody | null;
    const mode = body?.mode === "create" ? "create" : "preview";
    const { implementationId } = await context.params;
    const access = await executeLocalTableQuery({
      table: "implementations",
      action: "select",
      select: [
        "id",
        "deal_id",
        "customer_name",
        "smart_trade_order_id",
        "smart_trade_order_created_at",
      ].join(","),
      filters: [{ column: "id", op: "eq", value: implementationId }],
      maybeSingle: true,
    }, {
      user: verified.user,
      profile: verified.profile,
    });
    const implementation = access.data as ImplementationRow | null;
    if (!implementation) {
      return jsonResponse({ error: "Implementatie niet gevonden of niet toegankelijk." }, 404);
    }

    if (implementation.smart_trade_order_id) {
      return jsonResponse({
        error: `Deze implementatie heeft al Smart Trade-order ${implementation.smart_trade_order_id}.`,
        orderId: implementation.smart_trade_order_id,
        orderCreatedAt: implementation.smart_trade_order_created_at,
      }, 409);
    }

    const [{ rows: dealRows }, { rows: employeeRows }] = await Promise.all([
      query<DealRow>(
        `select smart_trade_relation_id, package_name, implementation_total, calculator_inputs
         from public.deals
         where id = $1
         limit 1`,
        [implementation.deal_id],
      ),
      query<EmployeeRow>(
        `select employee_relation_id
         from public.profiles
         where lower(email) = lower($1)
         limit 1`,
        [PROTECTED_ADMIN_EMAILS[0]],
      ),
    ]);
    const deal = dealRows[0];
    if (!deal) return jsonResponse({ error: "De gekoppelde calculator-deal ontbreekt." }, 404);

    const relationId = positiveInteger(deal.smart_trade_relation_id);
    if (!relationId) {
      return jsonResponse({
        error: "De Smart Trade-relatie is nog niet aan deze deal gekoppeld. Maak of koppel eerst de relatie.",
      }, 409);
    }

    const employeeId = positiveInteger(employeeRows[0]?.employee_relation_id);
    if (!employeeId) {
      return jsonResponse({
        error: `Vul op Admin eerst het medewerker relatie-ID in bij ${PROTECTED_ADMIN_EMAILS[0]}.`,
      }, 409);
    }

    const breakdown = getImplementationOrderBreakdown(deal);
    if (breakdown.totalAmount <= 0) {
      return jsonResponse({ error: "Het implementatiebedrag in de deal is € 0,00." }, 409);
    }
    if (breakdown.travelAmount > 0 && (!breakdown.travelRegion || !breakdown.travelArticleId)) {
      return jsonResponse({
        error: "De deal bevat reiskosten, maar geen geldige reiskostenregio. Controleer de postcode in de deal.",
      }, 409);
    }
    if (
      breakdown.travelAmount > 0
      && (breakdown.travelPricePerUnit <= 0 || breakdown.travelQuantity <= 0)
    ) {
      return jsonResponse({
        error: "De opgeslagen prijsopbouw van de reiskosten is niet compleet. Sla de deal opnieuw op.",
      }, 409);
    }

    const lines = [{
      sortOrder: 1,
      article: IMPLEMENTATION_ARTICLE_ID,
      quantity: "1",
      unit: "st",
      description: breakdown.description,
      remark: "",
      price: decimalString(breakdown.implementationAmount),
    }];
    if (breakdown.travelAmount > 0 && breakdown.travelArticleId && breakdown.travelRegion) {
      lines.push({
        sortOrder: 2,
        article: breakdown.travelArticleId,
        quantity: String(breakdown.travelQuantity),
        unit: "st",
        description: `Reiskosten - Regio ${breakdown.travelRegion}`,
        remark: "",
        price: decimalString(breakdown.travelPricePerUnit),
      });
    }

    const payload = {
      debtor: relationId,
      invoiceRelation: relationId,
      employee: employeeId,
      deliveryMethod: 2,
      shouldCondseHeader: true,
      reference: breakdown.reference,
      commentAboveLines: "",
      internalComment: `Aangemaakt vanuit Sales-implementatie ${implementation.id}.`,
      lines,
    };

    if (mode === "preview") {
      return jsonResponse({
        ok: true,
        mode,
        previewed: true,
        created: false,
        orderId: null,
        orderCreatedAt: null,
        relationId,
        employeeId,
        reference: breakdown.reference,
        breakdown,
        lines,
      });
    }

    if (mode === "create") {
      const { rows: claimedRows } = await query<{ id: string }>(
        `update public.implementations
         set smart_trade_order_pending_at = now(), updated_at = now()
         where id = $1
           and smart_trade_order_id is null
           and smart_trade_order_pending_at is null
         returning id`,
        [implementation.id],
      );
      if (!claimedRows[0]) {
        return jsonResponse({
          error: "Deze implementatieorder wordt al aangemaakt of de status van een eerdere poging moet in Smart Trade worden gecontroleerd.",
        }, 409);
      }
      claimedImplementationId = implementation.id;
    }

    const config = getSmartTradePullConfig("live");
    const targetUrl = `${config.baseUrl.replace(/\/+$/, "")}/orders`;
    const headers = getSmartTradePullHeaders("live", { "content-type": "application/json" });
    const response = await fetchWithSmartTradeTimeout(targetUrl, headers, "live", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const apiBody = await responseBody(response);

    if (!response.ok) {
      if (claimedImplementationId) {
        await query(
          `update public.implementations
           set smart_trade_order_pending_at = null, updated_at = now()
           where id = $1 and smart_trade_order_id is null`,
          [claimedImplementationId],
        );
        claimedImplementationId = null;
      }
      return jsonResponse({
        error: apiErrorMessage(response.status, apiBody),
        apiStatus: response.status,
      }, 502);
    }

    if (mode === "create") liveOrderAcceptedBySmartTrade = true;

    let orderId: string | null = null;
    let orderCreatedAt: string | null = null;
    if (mode === "create") {
      orderId = orderIdFromResponse(apiBody) || "Aangemaakt";
      const { rows } = await query<{
        smart_trade_order_id: string;
        smart_trade_order_created_at: string;
      }>(
        `update public.implementations
         set smart_trade_order_id = $2,
             smart_trade_order_created_at = now(),
             smart_trade_order_pending_at = null,
             progress = coalesce(progress, '{}'::jsonb)
               || jsonb_build_object('implementationOrder', true),
             updated_at = now()
         where id = $1
         returning smart_trade_order_id, smart_trade_order_created_at`,
        [implementation.id, orderId],
      );
      orderCreatedAt = rows[0]?.smart_trade_order_created_at ?? new Date().toISOString();
      claimedImplementationId = null;
      liveOrderAcceptedBySmartTrade = false;
    }

    return jsonResponse({
      ok: true,
      mode,
      previewed: false,
      created: true,
      orderId,
      orderCreatedAt,
      relationId,
      employeeId,
      reference: breakdown.reference,
      breakdown,
      lines,
    }, 201);
  } catch (error) {
    if (claimedImplementationId && !liveOrderAcceptedBySmartTrade) {
      await query(
        `update public.implementations
         set smart_trade_order_pending_at = null, updated_at = now()
         where id = $1 and smart_trade_order_id is null`,
        [claimedImplementationId],
      ).catch(() => undefined);
    }

    return jsonResponse({
      error: liveOrderAcceptedBySmartTrade
        ? "Smart Trade heeft de order geaccepteerd, maar Sales kon de bevestiging niet opslaan. Controleer Smart Trade voordat je opnieuw probeert."
        : error instanceof Error ? error.message : "Implementatieorder verwerken mislukt.",
    }, 500);
  }
}
