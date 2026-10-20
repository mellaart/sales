import { NextResponse } from "next/server";
import { getImplementationOrderBreakdown, getImplementationModuleOrders } from "@/lib/implementation-order";
import { requireLocalUser } from "@/lib/local-auth";
import { query } from "@/lib/local-db";
import { executeLocalTableQuery } from "@/lib/local-table";
import { PROTECTED_ADMIN_EMAILS, isProtectedAdminEmail } from "@/lib/protected-admin";
import { createImplementationOrderBatch } from "@/lib/implementation-order-batch";
import { readStoredPricingConfig } from "@/lib/price-settings-storage";
import { getServiceClient } from "@/lib/admin-api";

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
  modules: unknown;
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

export async function POST(
  request: Request,
  context: { params: Promise<{ implementationId: string }> },
) {
  let liveOrdersCreated = false;

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

    const priorDealOrder = await query<{payload:{orderId?:string}}>("select payload from public.app_settings where key=$1", [`deal-order:${implementation.deal_id}`]);
    if (priorDealOrder.rows.length) return jsonResponse({error:priorDealOrder.rows[0].payload.orderId ? `Deze deal heeft al order ${priorDealOrder.rows[0].payload.orderId}.` : "Een order voor deze deal is al in verwerking. Controleer Smart Trade."},409);

    if (implementation.smart_trade_order_id) {
      return jsonResponse({
        error: `Deze implementatie heeft al Smart Trade-order ${implementation.smart_trade_order_id}.`,
        orderId: implementation.smart_trade_order_id,
        orderCreatedAt: implementation.smart_trade_order_created_at,
      }, 409);
    }

    const [{ rows: dealRows }, { rows: employeeRows }] = await Promise.all([
      query<DealRow>(
        `select smart_trade_relation_id, package_name, modules, implementation_total, calculator_inputs
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

    const { pricingConfig } = await readStoredPricingConfig(getServiceClient());
    const orders = getImplementationModuleOrders(deal, pricingConfig.modules, pricingConfig.packages, pricingConfig.implementationDayRate);
    const payloads = orders.map(order => ({
      debtor: relationId, invoiceRelation: relationId, employee: employeeId,
      deliveryMethod: 2, shouldCondseHeader: true, reference: order.reference,
      commentAboveLines: "", lines: order.lines,
    }));
    if (mode === "preview") {
      return jsonResponse({ ok: true, mode, previewed: true, created: false,
        relationId, employeeId, breakdown, orders });
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
    }

    const createdOrders = await createImplementationOrderBatch(
      `deal-order:${implementation.deal_id}`, payloads, verified.user.id,
    );
    liveOrdersCreated = true;
    const orderId = createdOrders.map(order => order.orderId).join(", ");
    const { rows } = await query<{ smart_trade_order_created_at: string }>(
      `update public.implementations
       set smart_trade_order_id = $2, smart_trade_order_created_at = now(),
           smart_trade_order_pending_at = null,
           progress = coalesce(progress, '{}'::jsonb) || jsonb_build_object('implementationOrder', true),
           updated_at = now()
       where id = $1 returning smart_trade_order_created_at`,
      [implementation.id, orderId],
    );
    const orderCreatedAt = rows[0]?.smart_trade_order_created_at ?? new Date().toISOString();
    return jsonResponse({
      ok: true,
      mode,
      previewed: false,
      created: true,
      orderId,
      orderCreatedAt,
      relationId,
      employeeId,
      createdOrders,
      breakdown,
    }, 201);
  } catch (error) {
    return jsonResponse({
      error: liveOrdersCreated
        ? "De orders zijn aangemaakt, maar het implementatiedossier kon niet worden bijgewerkt. Controleer de opgeslagen orders bij de deal; maak ze niet opnieuw aan."
        : error instanceof Error ? error.message : "Implementatieorder verwerken mislukt.",
    }, 500);
  }
}
