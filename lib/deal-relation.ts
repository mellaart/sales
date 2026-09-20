// Existing expansion deals already retain the selected relation in their quote inputs.
// An explicit deal link always wins over that historical selection.
export function getDealRelationId(deal: {smart_trade_relation_id?: unknown; calculator_inputs?: unknown}): number | null {
  function id(value: unknown) {
    if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value.trim()))) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  }
  if (deal.smart_trade_relation_id !== null && deal.smart_trade_relation_id !== undefined) return id(deal.smart_trade_relation_id);
  const inputs = deal.calculator_inputs;
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) return null;
  const expansion = (inputs as Record<string, unknown>).assetsExpansion;
  if (!expansion || typeof expansion !== "object" || Array.isArray(expansion)) return null;
  return id((expansion as Record<string, unknown>).relationId);
}
