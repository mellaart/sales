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
const LOCAL_DEALS_SYNC_WARNING =
  "Lokaal bewaarde deals zijn centraal opgeslagen. Open Deals opnieuw in Safari als daar nog oude aantallen stonden.";
const SESSION_REFRESH_TIMEOUT_MS = 3000;
const SESSION_REFRESH_MARGIN_SECONDS = 90;

function timeout<T>(milliseconds: number, fallback: T) {
  return new Promise<T>((resolve) => {
    setTimeout(() => resolve(fallback), milliseconds);
  });
}

async function withTimeout<T>(promise: Promise<T>, fallback: T) {
  return Promise.race([promise, timeout(SESSION_REFRESH_TIMEOUT_MS, fallback)]);
}

async function ensureFreshSession(supabase: SupabaseClient) {
  try {
    const result = await withTimeout(supabase.auth.getSession(), null);
    const session = result && "data" in result ? result.data.session : null;
    const expiresAt = session?.expires_at ?? 0;
    const expiresSoon = expiresAt > 0 && expiresAt - Math.floor(Date.now() / 1000) < SESSION_REFRESH_MARGIN_SECONDS;

    if (session && expiresSoon) {
      await withTimeout(supabase.auth.refreshSession(), null);
    }
  } catch {
    // The next Supabase query will surface any real auth error.
  }
}

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

function removeLocalDealsById(dealIds: string[]) {
  if (dealIds.length === 0) return;

  const dealIdSet = new Set(dealIds);
  writeLocalDeals(readLocalDeals().filter((deal) => !dealIdSet.has(deal.id)));
}

function toSupabaseDealPayload(deal: DealRecord, userId: string): DealPayload {
  const packageKey = deal.package_key || deal.selected_package || "enterprise";
  const totalUsers = Number(deal.total_users ?? deal.extra_users ?? 1);
  const includeVat = Boolean(deal.include_vat ?? false);
  const manualImplementationAdjustment = Number(deal.manual_implementation_adjustment ?? 0);
  const monthlyTotal = Number(deal.monthly_total ?? deal.monthly_price ?? 0);
  const implementationTotal = Number(
    (deal as { implementation_total?: number | null }).implementation_total ??
      deal.implementation_price ??
      deal.implementation_base ??
      0,
  );

  return {
    user_id: deal.user_id || userId,
    created_at: deal.created_at ?? new Date().toISOString(),
    archived_at: deal.archived_at ?? null,
    customer_name: deal.customer_name ?? null,
    customer_email: deal.customer_email ?? null,
    quote_title: deal.quote_title || "Prijsvoorstel Smart Trade",
    contact_name: deal.contact_name ?? null,
    sales_name: deal.sales_name ?? null,
    package_key: packageKey,
    package_name: deal.package_name || "Enterprise",
    total_users: totalUsers,
    contract_months: Number((deal as { contract_months?: number | null }).contract_months ?? 1),
    discount_pct: Number((deal as { discount_pct?: number | null }).discount_pct ?? 0),
    include_vat: includeVat,
    manual_monthly_adjustment: Number((deal as { manual_monthly_adjustment?: number | null }).manual_monthly_adjustment ?? 0),
    manual_implementation_adjustment: manualImplementationAdjustment,
    monthly_base: Number((deal as { monthly_base?: number | null }).monthly_base ?? monthlyTotal),
    monthly_total: monthlyTotal,
    implementation_total: implementationTotal,
    contract_value: Number((deal as { contract_value?: number | null }).contract_value ?? monthlyTotal * 12 + implementationTotal),
    annual_recurring: Number((deal as { annual_recurring?: number | null }).annual_recurring ?? monthlyTotal * 12),
    modules: Array.isArray(deal.modules) ? deal.modules : [],
    notes: deal.notes ?? null,
    calculator_inputs: deal.calculator_inputs ?? {
      extraUsers: Math.max(0, totalUsers - 1),
      selectedPackage: packageKey,
      manualImplementationAdjustment,
      includeVat,
      quantities: {},
    },
  };
}

async function syncLocalDealsToSupabase(supabase: SupabaseClient, userId: string) {
  const localDeals = readLocalDeals().filter((deal) => isLocalDealId(deal.id) && (deal.user_id === userId || !deal.user_id));
  const syncedDeals: DealRecord[] = [];
  const syncedLocalDealIds: string[] = [];

  for (const localDeal of localDeals) {
    const { data, error } = await supabase
      .from("deals")
      .insert(toSupabaseDealPayload(localDeal, userId) as never)
      .select("*")
      .single();

    if (error) {
      continue;
    }

    syncedDeals.push(data as DealRecord);
    syncedLocalDealIds.push(localDeal.id);
  }

  removeLocalDealsById(syncedLocalDealIds);

  return syncedDeals;
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
  includeArchived = false,
): Promise<DealResult> {
  if (!supabase) {
    return { error: "Supabase keys ontbreken. Vul NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY in." };
  }

  await ensureFreshSession(supabase);

  const { data, error } = await supabase.from("deals").select("*").order("created_at", { ascending: false });

  if (error) {
    if (isDealsTableMissing(error)) {
      const localDeals = listLocalDeals(userId, canViewAll);
      const visibleLocalDeals = includeArchived
        ? localDeals
        : localDeals.filter((deal) => !deal.archived_at);

      return {
        deals: limit ? visibleLocalDeals.slice(0, limit) : visibleLocalDeals,
        warning: MISSING_TABLE_LIST_WARNING,
        storage: "local",
      };
    }

    return { error: error.message };
  }

  const syncedDeals = await syncLocalDealsToSupabase(supabase, userId);
  const localDeals = listLocalDeals(userId, false);
  const deals = mergeDeals([...(data ?? []) as DealRecord[], ...syncedDeals], localDeals);
  const visibleDeals = includeArchived ? deals : deals.filter((deal) => !deal.archived_at);
  const warning = syncedDeals.length > 0 ? LOCAL_DEALS_SYNC_WARNING : undefined;

  return {
    deals: limit ? visibleDeals.slice(0, limit) : visibleDeals,
    warning,
    storage: "supabase",
  };
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

  await ensureFreshSession(supabase);

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

  await ensureFreshSession(supabase);

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

  await ensureFreshSession(supabase);

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

  await ensureFreshSession(supabase);

  const { error } = await supabase.from("deals").delete().eq("id", dealId);

  if (error) {
    if (isDealsTableMissing(error)) {
      return { error: "De database mist de Deals-tabel. Deze deal kon niet centraal worden verwijderd." };
    }

    return { error: error.message };
  }

  return { storage: "supabase" };
}
