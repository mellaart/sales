import { query } from "@/lib/local-db";

export async function isCustomerSmsRequired(): Promise<boolean> {
  const { rows } = await query<{ payload: { enabled?: unknown } }>(
    "select payload from public.app_settings where key = $1",
    ["customer-portal-sms"],
  );
  return rows[0]?.payload?.enabled !== false;
}

export async function saveCustomerSmsRequired(enabled: boolean) {
  await query(
    `insert into public.app_settings (key, payload) values ($1, $2::jsonb)
     on conflict (key) do update set payload = excluded.payload, updated_at = now()`,
    ["customer-portal-sms", JSON.stringify({ enabled })],
  );
}
