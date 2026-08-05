import { euro } from "@/lib/pricing";
import type { DealPriceSummary } from "@/lib/deal-price-summary";

export default function PriceBreakdown({ summary }: { summary: DealPriceSummary }) {
  return (
    <>
      <div><span>Licentie p/m</span><strong>{euro.format(summary.licenseMonthly)}</strong></div>
      <div><span>Support p/m</span><strong>{euro.format(summary.supportMonthly)}</strong></div>
      {summary.customerPortalMonthly > 0 ? (
        <div><span>Klantportaal p/m</span><strong>{euro.format(summary.customerPortalMonthly)}</strong></div>
      ) : null}
      {summary.smartConnectMonthly > 0 ? (
        <div><span>Smart Connect p/m</span><strong>{euro.format(summary.smartConnectMonthly)}</strong></div>
      ) : null}
      <div className="total-row"><span>Maandprijs</span><strong>{euro.format(summary.monthlyTotal)}</strong></div>
      <div><span>Implementatie</span><strong>{euro.format(summary.implementationBase)}</strong></div>
      <div><span>Correctie implementatie</span><strong>{euro.format(summary.implementationAdjustment)}</strong></div>
      {summary.travelCosts > 0 ? (
        <div><span>Reiskosten</span><strong>{euro.format(summary.travelCosts)}</strong></div>
      ) : null}
      <div className="total-row"><span>Implementatie totaal</span><strong>{euro.format(summary.implementationTotal)}</strong></div>
    </>
  );
}
