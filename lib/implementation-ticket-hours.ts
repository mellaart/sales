import { fetchWithSmartTradeTimeout, getSmartTradePullHeaders } from "@/lib/smart-trade-pull-test";

export async function getImplementationTicketHours(ticketId: string) {
  if (!/^[1-9][0-9]*$/.test(ticketId)) throw new Error("Ongeldig ticket-ID.");
  const response = await fetchWithSmartTradeTimeout(
    `https://my.troublefree.nl/v3/api/ticketing/tickets/${ticketId}?include=workedHours`,
    getSmartTradePullHeaders("live", { Accept: "application/json" }), "live", { method: "GET" },
  );
  if (!response.ok) throw new Error("Gewerkte uren ophalen mislukt.");
  const body = await response.json();
  const raw = body?.data?.workedHours;
  if (!((typeof raw === "string" && /^\d+(?:\.\d+)?$/.test(raw.trim())) || typeof raw === "number")) throw new Error("Gewerkte uren ontbreken in de ticketrespons.");
  const workedHours = Number(raw);
  if (!Number.isFinite(workedHours) || workedHours < 0) throw new Error("Ongeldig urentotaal.");
  return { workedHours, workedDays: workedHours / 6, hoursPerDay: 6 };
}
