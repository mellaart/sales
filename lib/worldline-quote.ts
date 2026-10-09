import type { AssetExpansionLine } from "@/lib/supabase";

export const WORLDLINE_TRANSACTION_RATES = `Maestro / V PAY: € 0,06 per transactie
Maestro / V PAY (Tap on Mobile): € 0,12 per transactie
Mastercard, Visa - particuliere kaarten binnen Europa: 1,10%
Mastercard, Visa - particuliere kaarten buiten Europa en alle zakelijke kaarten: 2,20%
UnionPay & JCB: 1,95%
Diners/Discover: 2,50%`;

export function defaultWorldlineQuote() {
  return {
    quantity: 1,
    product: "Worldline RX5000",
    productPrice: "599,00",
    setupPrice: "70,00",
    serviceLabel: "Worldline servicekosten YOMANI",
    annualPrice: "175,80",
    includeContract: true,
    compliancePrice: "60,00",
    transactionRates: WORLDLINE_TRANSACTION_RATES,
  };
}
export type WorldlineQuote = ReturnType<typeof defaultWorldlineQuote>;

export function parseQuotePrice(value: string): number | null {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const price = Number(value.trim().replace(",", "."));
  return Number.isFinite(price) && price <= 1_000_000 ? price : null;
}

export function isWorldlineQuoteValid(quote: WorldlineQuote) {
  return Number.isInteger(quote.quantity) && quote.quantity > 0 && quote.quantity <= 1000
    && Boolean(quote.product.trim()) && Boolean(quote.serviceLabel.trim())
    && [quote.productPrice, quote.setupPrice, quote.annualPrice,
      ...(quote.includeContract ? [quote.compliancePrice] : [])].every(value => parseQuotePrice(value) !== null)
    && (!quote.includeContract || Boolean(quote.transactionRates.trim()));
}

export function getWorldlineQuoteLines(quote: WorldlineQuote): AssetExpansionLine[] {
  if (!isWorldlineQuoteValid(quote)) return [];
  const total = (price: string) => Math.round(parseQuotePrice(price)! * 100 * quote.quantity) / 100;
  return [
    { group: "Producten", label: quote.product.trim(), quantity: quote.quantity, cadence: "once", amount: total(quote.productPrice) },
    { group: "Producten", label: "Setupkosten plug & play", quantity: quote.quantity, cadence: "once", amount: total(quote.setupPrice) },
    { group: "Servicekosten", label: quote.serviceLabel.trim(), quantity: quote.quantity, cadence: "annual", amount: total(quote.annualPrice) },
  ];
}

export function getWorldlineQuoteGuidance(quote: WorldlineQuote, extra: string) {
  const compliance = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(parseQuotePrice(quote.compliancePrice) ?? 0);
  return [
    extra.trim(),
    quote.includeContract
      ? `PIN-contract via Worldline\nService Fee Compliancy: ${compliance} per jaar per pincontract (1 contract). Facturatie rechtstreeks door Worldline; niet inbegrepen in de totalen van Troublefree.\n\nTransactiekosten via Worldline\n${quote.transactionRates.trim()}`
      : "Zonder PIN-contract via Worldline. Een transactiecontract en de bijbehorende kosten zijn niet inbegrepen in deze offerte.",
    "Optionele consultancy op locatie\nWij adviseren een halve dag consultancy op locatie. Dit is niet verplicht en niet inbegrepen in deze offerte. Prijs op aanvraag.\n- Leveren en aansluiten pinapparaten\n- Controle van automatisch en handmatig pinnen\n- Uitleg merchant-unit en dagafsluiting\n- Persoonlijke instellingen, zoals aantal bonnen per transactie\n- Eventueel instellen en uitleg van retourpinnen",
    quote.includeContract ? "Worldline transactiecontract\nInzicht in pintransacties via het online portaal. Contact en beheer via Troublefree. Wissel-/leentoestel bij onverhoopte storing." : "",
  ].filter(Boolean).join("\n\n");
}

export type WorldlineGuidanceBlock =
  | { type: "text"; text: string }
  | { type: "table"; title: string; rows: [string, string][]; note?: string };

// Read the saved guidance too, so existing quotes receive the same layout.
export function getWorldlineGuidanceBlocks(text: string): WorldlineGuidanceBlock[] {
  const lines = text.split("\n");
  const blocks: WorldlineGuidanceBlock[] = [];
  let pending: string[] = [];
  const flush = () => {
    if (pending.join("\n").trim()) blocks.push({ type: "text", text: pending.join("\n").trim() });
    pending = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const title = lines[i].trim();
    if (title === "PIN-contract via Worldline" && lines[i + 1]?.trim().startsWith("Service Fee Compliancy:")) {
      flush();
      const content = lines[++i].trim().slice("Service Fee Compliancy:".length).trim();
      const noteStart = content.indexOf("Facturatie rechtstreeks");
      blocks.push({ type: "table", title, rows: [["Service Fee Compliancy", noteStart >= 0 ? content.slice(0, noteStart).trim() : content]], note: noteStart >= 0 ? content.slice(noteStart) : undefined });
    } else if (title === "Transactiekosten via Worldline") {
      const rows: [string, string][] = [];
      let next = i + 1;
      for (; next < lines.length; next++) {
        const row = lines[next].trim();
        const separator = row.indexOf(":");
        if (separator <= 0 || !row.slice(separator + 1).trim()) break;
        rows.push([row.slice(0, separator).trim(), row.slice(separator + 1).trim()]);
      }
      if (rows.length) {
        flush();
        blocks.push({ type: "table", title, rows });
        i = next - 1;
      } else pending.push(lines[i]);
    } else pending.push(lines[i]);
  }
  flush();
  return blocks;
}
