import type { ImplementationItem } from "@/lib/implementation-items";
import type { ImplementationCustomWorkItems } from "@/lib/implementations";
import type { EditablePricingConfig, ExpansionWorkItemKey } from "@/lib/price-config";

export const IMPLEMENTATION_CUSTOM_TASKS_KEY = "__implementation_tasks__";

function normalizedWorkItems(items: string[] | undefined) {
  return (items ?? []).map((item) => item.trim()).filter(Boolean);
}

function normalizedProgressText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("nl-NL");
}

function progressHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function getImplementationWorkItemProgressKey(itemKey: string, workItem: string) {
  return `work:${itemKey}:${progressHash(`${itemKey}\u0000${normalizedProgressText(workItem)}`)}`;
}

export function getImplementationCustomTaskKey(label: string) {
  return `task:custom:${progressHash(normalizedProgressText(label))}`;
}

export function getImplementationWorkItemStatuses(
  item: ImplementationItem,
  progress: Record<string, boolean>,
) {
  const workItems = normalizedWorkItems(item.workItems).map((workItem) => ({
    key: getImplementationWorkItemProgressKey(item.key, workItem),
    label: workItem,
  }));
  const hasIndividualProgress = workItems.some((workItem) => (
    Object.prototype.hasOwnProperty.call(progress, workItem.key)
  ));

  return workItems.map((workItem) => ({
    ...workItem,
    completed: hasIndividualProgress
      ? progress[workItem.key] === true
      : progress[item.key] === true,
  }));
}

export function isImplementationItemCompleted(
  item: ImplementationItem,
  progress: Record<string, boolean>,
) {
  const workItems = getImplementationWorkItemStatuses(item, progress);
  if (workItems.length === 0) return Boolean(progress[item.key]);

  return workItems.every((workItem) => workItem.completed);
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
  let description = item.description;

  if (item.key.startsWith("module:")) {
    const moduleKey = item.key.slice("module:".length);
    description = pricingConfig.modules.find((row) => row.key === moduleKey)?.description ?? description;
  } else if (item.key.startsWith("customer-portal:")) {
    const optionKey = item.key.slice("customer-portal:".length);
    description = pricingConfig.customerPortalOptions.find((row) => row.key === optionKey)?.description
      ?? pricingConfig.expansionWorkItems.find((row) => row.key === "customerPortal")?.description
      ?? description;
  } else {
    const expansionKey = expansionKeyForImplementationItem(item.key);
    if (expansionKey) {
      description = pricingConfig.expansionWorkItems.find((row) => row.key === expansionKey)?.description
        ?? description;
    }
  }

  return {
    ...item,
    description,
    workItems: getImplementationWorkItems(pricingConfig, item.key),
  };
}

export function withImplementationCustomWorkItems(
  item: ImplementationItem,
  customWorkItems: ImplementationCustomWorkItems,
): ImplementationItem {
  const configuredItems = normalizedWorkItems(item.workItems);
  const seen = new Set(configuredItems.map((workItem) => normalizedProgressText(workItem)));
  const implementationItems = normalizedWorkItems(customWorkItems[item.key]).filter((workItem) => {
    const normalized = normalizedProgressText(workItem);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });

  return {
    ...item,
    workItems: [...configuredItems, ...implementationItems],
  };
}

export function getConfiguredImplementationTasks(
  pricingConfig: EditablePricingConfig,
  customWorkItems: ImplementationCustomWorkItems = {},
) {
  const configuredTasks: ImplementationItem[] = pricingConfig.implementationTasks.map((task) => (
    withImplementationCustomWorkItems({
      key: `task:${task.key}`,
      label: task.name,
      description: task.description || undefined,
      workItems: normalizedWorkItems(task.workItems),
    }, customWorkItems)
  ));
  const seen = new Set(configuredTasks.map((task) => normalizedProgressText(task.label)));
  const customTasks = normalizedWorkItems(customWorkItems[IMPLEMENTATION_CUSTOM_TASKS_KEY])
    .filter((label) => {
      const normalized = normalizedProgressText(label);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .map<ImplementationItem>((label) => {
      const item = {
        key: getImplementationCustomTaskKey(label),
        label,
      };
      return withImplementationCustomWorkItems(item, customWorkItems);
    });

  return [...configuredTasks, ...customTasks];
}
