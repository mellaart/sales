export type QuoteLayoutKey = "standard" | "compact" | "assets-expansion";

export type QuoteLayoutOption = {
  key: QuoteLayoutKey;
  name: string;
  description: string;
};

export const QUOTE_LAYOUTS: QuoteLayoutOption[] = [
  {
    key: "standard",
    name: "Standaard offerte",
    description: "Volledige offerte met toelichting, prijsopbouw en voorwaarden.",
  },
  {
    key: "compact",
    name: "Compact",
    description: "Korte offerte met de belangrijkste bedragen en minder toelichting.",
  },
  {
    key: "assets-expansion",
    name: "Uitbreidingen",
    description: "Gericht op geselecteerde uitbreidingen vanuit het tabblad Assets.",
  },
];

export function normalizeQuoteLayout(value: unknown): QuoteLayoutKey {
  return QUOTE_LAYOUTS.some((layout) => layout.key === value) ? (value as QuoteLayoutKey) : "standard";
}

export function getQuoteLayout(value: unknown) {
  const key = normalizeQuoteLayout(value);
  return QUOTE_LAYOUTS.find((layout) => layout.key === key) ?? QUOTE_LAYOUTS[0];
}
