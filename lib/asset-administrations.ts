import { getAdministrationNames } from "./inspection-administrations";

export function getPackageAdministrationNames(assets: readonly { name: string }[]): string[] {
  return getAdministrationNames(assets.filter((asset) =>
    /^\s*Smart Trade\s+(Lite|Starter|Basic|Premium|Enterprise)\b/i.test(asset.name),
  ));
}

export function getAdministrationAssets<T extends { name: string }>(assets: T[], selected: string): T[] {
  const names = getPackageAdministrationNames(assets);
  if (names.length <= 1) return assets;
  const key = selected.toLocaleLowerCase("nl-NL");
  if (!names.some((name) => name.toLocaleLowerCase("nl-NL") === key)) return [];
  return assets.filter((asset) => getAdministrationNames([asset]).some((name) => name.toLocaleLowerCase("nl-NL") === key));
}
