import { query } from "@/lib/local-db";
import { validHoursPerDay } from "@/lib/implementation-planning";
export async function getImplementationHoursPerDay() {
  const { rows } = await query<{ payload: { hoursPerDay?: unknown } }>("select payload from public.app_settings where key = $1", ["implementation-settings"]);
  const value = rows[0]?.payload.hoursPerDay;
  return validHoursPerDay(value) ? value : 6;
}
