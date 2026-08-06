import { IMPLEMENTATION_BASE_FUNCTIONALITIES } from "@/lib/base-functionalities";
import type { ImplementationItem } from "@/lib/implementation-items";
import type { EditablePricingConfig, ExpansionWorkItemKey } from "@/lib/price-config";

function normalizedWorkItems(items: string[] | undefined) {
  return (items ?? []).map((item) => item.trim()).filter(Boolean);
}

function expansionKeyForImplementationItem(itemKey: string): ExpansionWorkItemKey | null {
  if (itemKey.startsWith("customer-portal:")) return "customerPortal";
  if (itemKey === "smart-connect") return "smartConnect";
  if (itemKey === "planning-app") return "planningApp";
  return null;
}

export function getImplementationWorkItems(
  pricingConfig: EditablePricingConfig,
  itemKey: string,
) {
  if (itemKey.startsWith("base:")) {
    return normalizedWorkItems(
      pricingConfig.baseFunctionalityWorkItems.find((item) => item.key === itemKey)?.workItems,
    );
  }

  if (itemKey.startsWith("module:")) {
    const moduleKey = itemKey.slice("module:".length);
    return normalizedWorkItems(
      pricingConfig.modules.find((item) => item.key === moduleKey)?.workItems,
    );
  }

  const expansionKey = expansionKeyForImplementationItem(itemKey);
  if (!expansionKey) return [];

  return normalizedWorkItems(
    pricingConfig.expansionWorkItems.find((item) => item.key === expansionKey)?.workItems,
  );
}

export function withConfiguredWorkItems(
  item: ImplementationItem,
  pricingConfig: EditablePricingConfig,
): ImplementationItem {
  return {
    ...item,
    workItems: getImplementationWorkItems(pricingConfig, item.key),
  };
}

export function getConfiguredBaseFunctionalities(pricingConfig: EditablePricingConfig) {
  return IMPLEMENTATION_BASE_FUNCTIONALITIES.map((item) => withConfiguredWorkItems(item, pricingConfig));
}
