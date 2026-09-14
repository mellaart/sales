import type { CustomerActivity } from "@/lib/customer-activity-server";

export function groupCustomerActivities(activities: CustomerActivity[]) {
  const groups = new Map<string, { key: string; customerName: string; activities: CustomerActivity[] }>();
  for (const activity of [...activities].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))) {
    const name = activity.customerName.trim().replace(/\s+/g, " ");
    const normalizedName = name.toLocaleLowerCase("nl-NL");
    const key = activity.customerId
      ? `relation:${activity.customerId}`
      : !normalizedName || normalizedName === "onbekende klant" || normalizedName === "onbekende relatie"
        ? `dossier:${activity.href}`
        : `name:${normalizedName}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, customerName: name || "Onbekende klant", activities: [] };
      groups.set(key, group);
    }
    group.activities.push(activity);
  }
  return [...groups.values()];
}
