import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  getProfileDisplayName,
  getUserDisplayName,
  type DealRecord,
  type ProfileRecord,
} from "@/lib/supabase";

export type SalesNamesByUserId = Record<string, string>;

const PROFILE_SELECTS = ["id,email,full_name", "id,email"];

type SalesProfileRow = {
  id?: string | null;
  email?: string | null;
  full_name?: string | null;
};

function uniqueUserIds(deals: DealRecord[]) {
  return [...new Set(deals.map((deal) => deal.user_id).filter((userId): userId is string => Boolean(userId)))];
}

export function getDealSalesName(
  deal: DealRecord,
  salesNamesByUserId: SalesNamesByUserId,
  currentUserId?: string | null,
  currentSalesName?: string | null,
) {
  if (deal.user_id && deal.user_id === currentUserId && currentSalesName) {
    return currentSalesName;
  }

  if (deal.user_id && salesNamesByUserId[deal.user_id]) {
    return salesNamesByUserId[deal.user_id];
  }

  return deal.sales_name || "-";
}

export async function loadDealSalesNames(
  supabase: SupabaseClient | null,
  deals: DealRecord[],
  currentUser: Pick<User, "id" | "email" | "user_metadata"> | null,
  currentProfile: Pick<ProfileRecord, "email" | "full_name"> | null,
) {
  const salesNamesByUserId: SalesNamesByUserId = {};
  const currentSalesName = getUserDisplayName(currentUser, currentProfile);

  if (currentUser?.id && currentSalesName) {
    salesNamesByUserId[currentUser.id] = currentSalesName;
  }

  if (!supabase) return salesNamesByUserId;

  const userIds = uniqueUserIds(deals).filter((userId) => userId !== currentUser?.id);
  if (userIds.length === 0) return salesNamesByUserId;

  for (const selectFields of PROFILE_SELECTS) {
    const { data, error } = await supabase.from("profiles").select(selectFields).in("id", userIds);

    if (error) {
      const isMissingFullName =
        error.message.includes("profiles.full_name does not exist") ||
        error.message.includes("column profiles.full_name does not exist") ||
        error.message.includes("Could not find the 'full_name' column");

      if (isMissingFullName) continue;
      return salesNamesByUserId;
    }

    for (const profile of (data ?? []) as unknown as SalesProfileRow[]) {
      const displayName = getProfileDisplayName({
        email: profile.email ?? null,
        full_name: profile.full_name ?? null,
      });
      if (profile.id && displayName) {
        salesNamesByUserId[profile.id] = displayName;
      }
    }

    return salesNamesByUserId;
  }

  return salesNamesByUserId;
}
