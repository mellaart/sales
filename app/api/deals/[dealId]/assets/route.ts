import { NextResponse } from "next/server";
import { buildDealAssetPlan, type DealAssetPlanItem } from "@/lib/deal-assets";
import { requireLocalUser } from "@/lib/local-auth";
import { query } from "@/lib/local-db";
import { executeLocalTableQuery } from "@/lib/local-table";
import { readLocalRoleTabAccess } from "@/lib/role-tab-access-storage";
import { getTabPermission } from "@/lib/role-tabs";
import type { DealRecord } from "@/lib/supabase";
import {
  fetchWithSmartTradeTimeout,
  getSmartTradePullConfig,
  getSmartTradePullHeaders,
} from "@/lib/smart-trade-pull-test";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DealRow = {
  id: string;
  smart_trade_relation_id: number | null;
  package_key: string | null;
  package_name: string | null;
  calculator_inputs: DealRecord["calculator_inputs"];
  modules: DealRecord["modules"];
  accepted_at: string | null;
};

type ImplementationRow = {
  id: string;
  administration_name: string | null;
  planned_go_live_date: string | null;
};

type AssetCreationRow = {
  id: string;
  plan_key: string;
  asset_class_id: number;
  asset_name: string;
  smart_trade_asset_id: number | null;
  status: "pending" | "created";
  created_at: string;
};

type ContextResult = {
  deal: DealRow;
  implementation: ImplementationRow | null;
  creations: AssetCreationRow[];
  plan: ReturnType<typeof buildDealAssetPlan>;
  prerequisiteErrors: string[];
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
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
      const detail = Object.entries(errors as Record<string, unknown>)
        .flatMap(([field, value]) => (Array.isArray(value) ? value : [value])
          .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
          .map((item) => `${field}: ${item.trim()}`))
        .join(" ");
      if (detail) return detail;
    }

    const message = record.message ?? record.error ?? record.userMessage;
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  if (typeof body === "string" && body.trim()) {
    if (/<(?:!doctype|html|head|body)\b/i.test(body)) {
      return `Smart Trade API gaf status ${status}; de assetroute is niet beschikbaar.`;
    }
    return body.trim().slice(0, 700);
  }

  return `Smart Trade API gaf status ${status}.`;
}

function assetIdFromResponse(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const data = record.data && typeof record.data === "object"
    ? record.data as Record<string, unknown>
    : record;
  return positiveInteger(data.id);
}

function toOverview(context: ContextResult) {
  const byKey = new Map(context.creations.map((creation) => [creation.plan_key, creation]));
  const items = context.plan.items.map((item) => {
    const creation = byKey.get(item.key);
    return {
      ...item,
      status: creation?.status ?? "missing",
      smartTradeAssetId: creation?.smart_trade_asset_id ?? null,
      createdAt: creation?.created_at ?? null,
    };
  });

  return {
    ready: context.prerequisiteErrors.length === 0,
    prerequisiteErrors: context.prerequisiteErrors,
    warnings: context.plan.warnings,
    total: items.length,
    createdCount: items.filter((item) => item.status === "created").length,
    pendingCount: items.filter((item) => item.status === "pending").length,
    missingCount: items.filter((item) => item.status === "missing").length,
    relationId: context.deal.smart_trade_relation_id,
    administrationName: context.implementation?.administration_name ?? null,
    plannedGoLiveDate: context.implementation?.planned_go_live_date ?? null,
    items,
  };
}

async function loadContext(request: Request, dealId: string): Promise<
  | { context: ContextResult; userId: string }
  | { error: string; status: number }
> {
  const verified = await requireLocalUser(request);
  if (!verified.ok) return { error: verified.message, status: 401 };

  const roleTabAccess = await readLocalRoleTabAccess();
  if (getTabPermission(verified.profile.role, "deals", roleTabAccess) !== "write") {
    return { error: "Je hebt geen schrijfrechten voor Deals.", status: 403 };
  }

  const access = await executeLocalTableQuery({
    table: "deals",
    action: "select",
    select: "id,smart_trade_relation_id,package_key,package_name,calculator_inputs,modules,accepted_at",
    filters: [{ column: "id", op: "eq", value: dealId }],
    maybeSingle: true,
  }, {
    user: verified.user,
    profile: verified.profile,
  });

  if (access.error || !access.data) {
    return { error: "Deal niet gevonden of niet toegankelijk.", status: 404 };
  }

  const deal = access.data as DealRow;
  const [{ rows: implementationRows }, { rows: creations }] = await Promise.all([
    query<ImplementationRow>(
      `select id, administration_name, planned_go_live_date
       from public.implementations
       where deal_id = $1
       limit 1`,
      [deal.id],
    ),
    query<AssetCreationRow>(
      `select id, plan_key, asset_class_id, asset_name, smart_trade_asset_id, status, created_at
       from public.deal_asset_creations
       where deal_id = $1
       order by created_at asc`,
      [deal.id],
    ),
  ]);

  const implementation = implementationRows[0] ?? null;
  const plan = buildDealAssetPlan(deal);
  const prerequisiteErrors: string[] = [];

  if (!deal.accepted_at) prerequisiteErrors.push("De klant moet de offerte eerst akkoord geven.");
  if (!positiveInteger(deal.smart_trade_relation_id)) {
    prerequisiteErrors.push("Koppel eerst de Smart Trade-relatie aan deze deal.");
  }
  if (!implementation) prerequisiteErrors.push("Start eerst de implementatie voor deze nieuwe klant.");
  if (!implementation?.administration_name?.trim()) {
    prerequisiteErrors.push("Vul bij de implementatie eerst de administratienaam in.");
  }
  if (!implementation?.planned_go_live_date) {
    prerequisiteErrors.push("Vul bij de implementatie eerst de geplande livegang in.");
  }
  if (plan.items.length === 0) prerequisiteErrors.push("Er zijn geen assets uit deze deal af te leiden.");

  return {
    context: {
      deal,
      implementation,
      creations,
      plan,
      prerequisiteErrors,
    },
    userId: verified.user.id,
  };
}

async function getAdministrationCustomFieldSystemName() {
  const config = getSmartTradePullConfig("live");
  const response = await fetchWithSmartTradeTimeout(
    `${config.baseUrl}/asset_custom_fields?include=choices&per_page=1000`,
    getSmartTradePullHeaders("live"),
  );
  const body = await responseBody(response);

  if (!response.ok) {
    throw new Error(`Asset-veld 46 laden mislukt: ${apiErrorMessage(response.status, body)}`);
  }

  const data = body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).data)
    ? (body as Record<string, unknown>).data as unknown[]
    : Array.isArray(body)
      ? body
      : [];
  const customField = data.find((item) => {
    if (!item || typeof item !== "object") return false;
    return positiveInteger((item as Record<string, unknown>).id) === 46;
  }) as Record<string, unknown> | undefined;
  const systemName = typeof customField?.systemName === "string" ? customField.systemName.trim() : "";

  if (!systemName) {
    throw new Error("Asset custom field 46 is niet gevonden in Smart Trade. Controleer of dit veld actief is voor de gekozen assetklassen.");
  }

  return systemName;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ dealId: string }> },
) {
  try {
    const { dealId } = await context.params;
    const result = await loadContext(request, dealId);
    if ("error" in result) return jsonResponse({ error: result.error }, result.status);

    return jsonResponse({ overview: toOverview(result.context) });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Assets voorbereiden mislukt.",
    }, 500);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ dealId: string }> },
) {
  try {
    const { dealId } = await context.params;
    const result = await loadContext(request, dealId);
    if ("error" in result) return jsonResponse({ error: result.error }, result.status);

    const { context: assetContext, userId } = result;
    if (assetContext.prerequisiteErrors.length > 0) {
      return jsonResponse({
        error: "Assets kunnen nog niet worden aangemaakt.",
        overview: toOverview(assetContext),
      }, 409);
    }

    if (assetContext.creations.some((creation) => creation.status === "pending")) {
      return jsonResponse({
        error: "Een eerdere assetaanmaak wacht nog op bevestiging. Neem contact op met Erik voordat je opnieuw probeert, om dubbele assets te voorkomen.",
        overview: toOverview(assetContext),
      }, 409);
    }

    const systemName = await getAdministrationCustomFieldSystemName();
    const relationId = positiveInteger(assetContext.deal.smart_trade_relation_id);
    const administrationName = assetContext.implementation?.administration_name?.trim();
    const commissionedAt = assetContext.implementation?.planned_go_live_date;
    if (!relationId || !administrationName || !commissionedAt) {
      return jsonResponse({ error: "De gegevens voor het aanmaken van assets zijn niet compleet." }, 409);
    }

    const existingKeys = new Set(assetContext.creations.map((creation) => creation.plan_key));
    const missingItems = assetContext.plan.items.filter((item) => !existingKeys.has(item.key));
    const createdItems: Array<{ item: DealAssetPlanItem; smartTradeAssetId: number }> = [];
    const latestOverview = async () => {
      const refreshed = await loadContext(request, dealId);
      return "context" in refreshed ? toOverview(refreshed.context) : toOverview(assetContext);
    };

    for (const item of missingItems) {
      const { rows: claims } = await query<{ id: string }>(
        `insert into public.deal_asset_creations
          (deal_id, plan_key, asset_class_id, asset_name, status, created_by)
         values ($1, $2, $3, $4, 'pending', $5)
         on conflict (deal_id, plan_key) do nothing
         returning id`,
        [assetContext.deal.id, item.key, item.assetClassId, item.name, userId],
      );
      const claim = claims[0];

      if (!claim) {
        return jsonResponse({
          error: `Asset ${item.name} is al in verwerking. De aanmaak wordt niet opnieuw verstuurd om dubbele assets te voorkomen.`,
          overview: await latestOverview(),
        }, 409);
      }

      let response: Response;
      let body: unknown;
      try {
        const config = getSmartTradePullConfig("live");
        response = await fetchWithSmartTradeTimeout(
          `${config.baseUrl}/assets`,
          getSmartTradePullHeaders("live", { "content-type": "application/json" }),
          "live",
          {
            method: "POST",
            body: JSON.stringify({
              assetClass: item.assetClassId,
              owner: relationId,
              name: item.name,
              commissionedAt,
              customFields: {
                [systemName]: administrationName,
              },
            }),
          },
        );
        body = await responseBody(response);
      } catch (error) {
        // Bij een netwerkfout is onbekend of Smart Trade de asset toch heeft ontvangen.
        // De pending-regel blijft daarom staan als bescherming tegen dubbel aanmaken.
        return jsonResponse({
          error: `De status van ${item.name} kon niet betrouwbaar worden bevestigd. Deze staat veilig als in verwerking; maak hem niet opnieuw aan. ${error instanceof Error ? error.message : ""}`.trim(),
          overview: await latestOverview(),
        }, 502);
      }

      if (!response.ok) {
        await query(
          "delete from public.deal_asset_creations where id = $1 and status = 'pending'",
          [claim.id],
        );
        return jsonResponse({
          error: `Asset ${item.name} aanmaken mislukt: ${apiErrorMessage(response.status, body)}`,
          overview: await latestOverview(),
        }, 502);
      }

      const smartTradeAssetId = assetIdFromResponse(body);
      if (!smartTradeAssetId) {
        // Ook hier kan Smart Trade de asset al hebben gemaakt, maar zonder een controleerbare ID.
        return jsonResponse({
          error: `Smart Trade bevestigde ${item.name} zonder asset-ID. Deze staat veilig als in verwerking; maak hem niet opnieuw aan.`,
          overview: await latestOverview(),
        }, 502);
      }

      await query(
        `update public.deal_asset_creations
         set smart_trade_asset_id = $2, status = 'created', updated_at = now()
         where id = $1`,
        [claim.id, smartTradeAssetId],
      );
      createdItems.push({ item, smartTradeAssetId });
    }

    const refreshed = await loadContext(request, dealId);
    if ("error" in refreshed) return jsonResponse({ error: refreshed.error }, refreshed.status);

    return jsonResponse({
      message: createdItems.length
        ? `${createdItems.length} asset${createdItems.length === 1 ? "" : "s"} aangemaakt in Smart Trade.`
        : "Alle assets waren al aangemaakt.",
      created: createdItems.map(({ item, smartTradeAssetId }) => ({
        name: item.name,
        smartTradeAssetId,
      })),
      overview: toOverview(refreshed.context),
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Assets aanmaken mislukt.",
    }, 500);
  }
}
