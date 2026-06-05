import type { SupabaseClient } from "@supabase/supabase-js";
import type { DealRecord } from "@/lib/supabase";

type DealPayload = Partial<DealRecord> & Record<string, unknown>;
type DealResult = {
  deal?: DealRecord;
  deals?: DealRecord[];
  error?: string;
  warning?: string;
  storage?: "supabase" | "local";
};

const LOCAL_DEALS_KEY = "smart-trade-local-deals-v1";
const LOCAL_DEAL_PREFIX = "local-deal-";
const MISSING_TABLE_CREATE_WARNING =
  "De database mist de Deals-tabel. Deze deal is tijdelijk lokaal op dit apparaat bewaard.";
const MISSING_TABLE_LIST_WARNING =
  "De database mist de Deals-tabel. Je ziet nu alleen lokaal bewaarde deals op dit apparaat.";
const MISSING_TABLE_LOCAL_DEAL_WARNING =
  "De database mist de Deals-tabel. Deze deal staat tijdelijk lokaal op dit apparaat.";
const MISSING_TABLE_SAVE_WARNING =
  "De database mist de Deals-tabel. Deze wijziging is tijdelijk lokaal op dit apparaat bewaard.";

function hasStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readLocalDeals() {
  if (!hasStorage()) return [];

  try {
    const rawDeals = window.localStorage.getItem(LOCAL_DEALS_KEY);
    if (!rawDeals) return [];

    const deals = JSON.parse(rawDeals);
    return Array.isArray(deals) ? (deals as DealRecord[]) : [];
  } catch {
    return [];
  }
}

function writeLocalDeals(deals: DealRecord[]) {
  if (!hasStorage()) return;
  window.localStorage.setItem(LOCAL_DEALS_KEY, JSON.stringify(deals));
}

function createLocalDealId() {
  const randomId =
    typeof window !== "undefined" && window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${LOCAL_DEAL_PREFIX}${randomId}`;
}

function sortDealsByCreatedAt(deals: DealRecord[]) {
  return [...deals].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
}

function mergeDeals(remoteDeals: DealRecord[], localDeals: DealRecord[]) {
  const seenDealIds = new Set<string>();
  const mergedDeals: DealRecord[] = [];

  for (const deal of [...localDeals, ...remoteDeals]) {
    if (seenDealIds.has(deal.id)) continue;
    seenDealIds.add(deal.id);
    mergedDeals.push(deal);
  }

  return sortDealsByCreatedAt(mergedDeals);
}

export function isLocalDealId(dealId: string) {
  return dealId.startsWith(LOCAL_DEAL_PREFIX);
}

export function isDealsTableMissing(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const details = error as { code?: string; message?: string; details?: string };
  const text = `${details.code ?? ""} ${details.message ?? ""} ${details.details ?? ""}`.toLowerCase();

  return (
    text.includes("public.deals") ||
    (text.includes("deals") && text.includes("schema cache")) ||
    (text.includes("deals") && text.includes("could not find the table"))
  );
}

export function getLocalDeal(dealId: string) {
  return readLocalDeals().find((deal) => deal.id === dealId) ?? null;
}

export function listLocalDeals(userId: string, canViewAll: boolean) {
  const deals = readLocalDeals();
  const visibleDeals = canViewAll ? deals : deals.filter((deal) => deal.user_id === userId);

  return sortDealsByCreatedAt(visibleDeals);
}

export function createLocalDeal(payload: DealPayload) {
  const deal: DealRecord = {
    ...(payload as DealRecord),
    id: createLocalDealId(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  writeLocalDeals([deal, ...readLocalDeals()]);
  return deal;
}

export function updateLocalDeal(dealId: string, payload: DealPayload) {
  const deals = readLocalDeals();
  const existingDeal = deals.find((deal) => deal.id === dealId);

  if (!existingDeal) return null;

  const updatedDeal: DealRecord = {
    ...existingDeal,
    ...(payload as DealRecord),
    id: dealId,
    created_at: existingDeal.created_at,
    updated_at: new Date().toISOString(),
  };

  writeLocalDeals(deals.map((deal) => (deal.id === dealId ? updatedDeal : deal)));
  return updatedDeal;
}

export function deleteLocalDeal(dealId: string) {
  const deals = readLocalDeals();
  const nextDeals = deals.filter((deal) => deal.id !== dealId);

  writeLocalDeals(nextDeals);
  return nextDeals.length !== deals.length;
}

export async function listDealsWithFallback(
  supabase: SupabaseClient | null,
  userId: string,
  canViewAll: boolean,
  limit?: number,
): Promise<DealResult> {
  if (!supabase) {
    return { error: "Supabase keys ontbreken. Vul NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY in." };
  }

  let query = supabase.from("deals").select("*").order("created_at", { ascending: false });
  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    if (isDealsTableMissing(error)) {
      return {
        deals: listLocalDeals(userId, canViewAll).slice(0, limit),
        warning: MISSING_TABLE_LIST_WARNING,
        storage: "local",
      };
    }

    return { error: error.message };
  }

  const deals = mergeDeals((data ?? []) as DealRecord[], listLocalDeals(userId, canViewAll));

  return { deals: limit ? deals.slice(0, limit) : deals, storage: "supabase" };
}

export async function getDealWithFallback(supabase: SupabaseClient | null, dealId: string): Promise<DealResult> {
  if (isLocalDealId(dealId)) {
    const localDeal = getLocalDeal(dealId);
    return localDeal
      ? { deal: localDeal, warning: MISSING_TABLE_LOCAL_DEAL_WARNING, storage: "local" }
      : { error: "Deal niet gevonden op dit apparaat." };
  }

  if (!supabase) {
    return { error: "Supabase keys ontbreken. Vul NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY in." };
  }

  const { data, error } = await supabase.from("deals").select("*").eq("id", dealId).single();

  if (error) {
    if (isDealsTableMissing(error)) {
      return { error: "De database mist de Deals-tabel. Deze deal is niet centraal gevonden." };
    }

    return { error: error.message };
  }

  return { deal: data as DealRecord, storage: "supabase" };
}

export async function createDealWithFallback(supabase: SupabaseClient | null, payload: DealPayload): Promise<DealResult> {
  if (!supabase) {
    return { error: "Supabase keys ontbreken. Vul NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY in." };
  }

  const { data, error } = await supabase.from("deals").insert(payload as never).select("*").single();

  if (error) {
    if (isDealsTableMissing(error)) {
      return {
        deal: createLocalDeal(payload),
        warning: MISSING_TABLE_CREATE_WARNING,
        storage: "local",
      };
    }

    return { error: error.message };
  }

  return { deal: data as DealRecord, storage: "supabase" };
}

export async function updateDealWithFallback(
  supabase: SupabaseClient | null,
  dealId: string,
  payload: DealPayload,
): Promise<DealResult> {
  if (isLocalDealId(dealId)) {
    const deal = updateLocalDeal(dealId, payload);
    return deal
      ? { deal, warning: MISSING_TABLE_SAVE_WARNING, storage: "local" }
      : { error: "Deal niet gevonden op dit apparaat." };
  }

  if (!supabase) {
    return { error: "Supabase keys ontbreken. Vul NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY in." };
  }

  const { data, error } = await supabase.from("deals").update(payload as never).eq("id", dealId).select("*").single();

  if (error) {
    if (isDealsTableMissing(error)) {
      const deal = updateLocalDeal(dealId, payload);
      return deal
        ? { deal, warning: MISSING_TABLE_SAVE_WARNING, storage: "local" }
        : { error: "De database mist de Deals-tabel. Deze deal kon niet centraal worden opgeslagen." };
    }

    return { error: error.message };
  }

  return { deal: data as DealRecord, storage: "supabase" };
}

export async function deleteDealWithFallback(supabase: SupabaseClient | null, dealId: string): Promise<DealResult> {
  if (isLocalDealId(dealId)) {
    deleteLocalDeal(dealId);
    return { storage: "local" };
  }

  if (!supabase) {
    return { error: "Supabase keys ontbreken. Vul NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY in." };
  }

  const { error } = await supabase.from("deals").delete().eq("id", dealId);

  if (error) {
    if (isDealsTableMissing(error)) {
      return { error: "De database mist de Deals-tabel. Deze deal kon niet centraal worden verwijderd." };
    }

    return { error: error.message };
  }

  return { storage: "supabase" };
}
