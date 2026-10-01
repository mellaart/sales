import { buildDealAssetPlan } from "@/lib/deal-assets";
import { query } from "@/lib/local-db";
import type { DealRecord } from "@/lib/supabase";

type Creation = { plan_key: string; status: string; smart_trade_asset_id: number | null };
type AssetDeal = Pick<DealRecord, "package_key" | "package_name" | "calculator_inputs" | "modules">;

export function allDealAssetsCreated(deal: AssetDeal, creations: Creation[]) {
  const items = buildDealAssetPlan(deal).items;
  const completed = new Set(creations.filter(row => row.status === "created" && Number(row.smart_trade_asset_id) > 0).map(row => row.plan_key));
  return items.length > 0 && items.every(item => completed.has(item.key));
}

// Derive historical completions on read as well, including implementations created after the assets.
export async function withImplementationAssetProgress<T extends Record<string, unknown>>(rows: T[]): Promise<T[]> {
  const ids = rows.filter(row => typeof row.id === "string" && "progress" in row).map(row => row.id);
  if (!ids.length) return rows;
  const { rows: deals } = await query<AssetDeal & { implementation_id: string; creations: Creation[] }>(
    `select i.id as implementation_id, d.package_key, d.package_name, d.calculator_inputs, d.modules,
       coalesce((select jsonb_agg(jsonb_build_object('plan_key', a.plan_key, 'status', a.status,
         'smart_trade_asset_id', a.smart_trade_asset_id))
         from public.deal_asset_creations a where a.deal_id = d.id), '[]'::jsonb) as creations
     from public.implementations i join public.deals d on d.id = i.deal_id
     where i.id = any($1::uuid[]) and d.accepted_at is not null`, [ids],
  );
  const completed = new Set(deals.filter(deal => allDealAssetsCreated(deal, deal.creations)).map(deal => deal.implementation_id));
  return rows.map(row => completed.has(String(row.id))
    ? { ...row, progress: { ...(row.progress && typeof row.progress === "object" ? row.progress : {}), assets: true } }
    : row);
}
