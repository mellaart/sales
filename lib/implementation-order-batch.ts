import { query } from "@/lib/local-db";
import { fetchWithSmartTradeTimeout, getSmartTradePullConfig, getSmartTradePullHeaders } from "@/lib/smart-trade-pull-test";

export type ModuleOrderPayload = {
  reference: string;
  lines: Array<{ description: string; price: string; quantity: string; [key: string]: unknown }>;
  [key: string]: unknown;
};
export type CreatedModuleOrder = { orderId: string; reference: string };

/** Persist every confirmed order before attempting the next one. A partial or
 * ambiguous batch remains claimed, so retrying cannot duplicate invoices. */
export async function createImplementationOrderBatch(
  key: string,
  payloads: ModuleOrderPayload[],
  actorId: string,
) {
  if (!payloads.length) throw new Error("Er zijn geen verkooporders om aan te maken.");
  const orders: CreatedModuleOrder[] = [];
  const snapshot = (status: string) => JSON.stringify({
    status, orders, orderId: orders.map(order => order.orderId).join(", ") || null,
    requestedOrders: payloads.map(({ reference, lines }) => ({ reference, lines })), createdBy: actorId,
    attemptedAt: new Date().toISOString(),
  });
  const claim = await query(
    "insert into public.app_settings (key,payload) values ($1,$2::jsonb) on conflict (key) do nothing returning key",
    [key, snapshot("pending")],
  );
  if (!claim.rows.length) throw new Error("Deze orders zijn al aangemaakt of worden verwerkt. Controleer de eerdere poging in Smart Trade.");
  try {
    for (const payload of payloads) {
      const response = await fetchWithSmartTradeTimeout(
        `${getSmartTradePullConfig("live").baseUrl.replace(/\/+$/, "")}/orders`,
        getSmartTradePullHeaders("live", { "content-type": "application/json" }),
        "live", { method: "POST", body: JSON.stringify(payload) },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`Smart Trade gaf status ${response.status} voor ${payload.reference}.`);
      const id = result?.data?.id ?? result?.id;
      if ((typeof id !== "string" && typeof id !== "number") || !String(id).trim() || id === 0) throw new Error(`Geen ordernummer ontvangen voor ${payload.reference}.`);
      orders.push({ orderId: String(id), reference: payload.reference });
      await query("update public.app_settings set payload=$2::jsonb,updated_at=now() where key=$1", [key, snapshot("pending")]);
    }
    await query("update public.app_settings set payload=$2::jsonb,updated_at=now() where key=$1", [key, snapshot("created")]);
    return orders;
  } catch (error) {
    const confirmed = orders.length ? ` Bevestigde orders: ${orders.map(order => `${order.orderId} (${order.reference})`).join(", ")}.` : "";
    throw new Error(`${error instanceof Error ? error.message : "Orderaanmaak kon niet worden bevestigd."}${confirmed} Controleer Smart Trade; opnieuw aanmaken is geblokkeerd.`);
  }
}
