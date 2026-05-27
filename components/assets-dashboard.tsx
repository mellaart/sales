"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Boxes, Building2, ChevronRight, Hash, Mail, Search, Sparkles } from "lucide-react";
import { StatusPill } from "@/components/ui";
import {
  MODULES,
  PACKAGES,
  euro,
  getMinimumPackageForPaidModules,
  type ModuleConfig,
  type PackageConfig,
} from "@/lib/pricing";
import styles from "./assets-dashboard.module.css";

const SMART_TRADE_ASSET_PREFIX = "Smart Trade ";
const SERVICE_COST_ASSET_PREFIXES = ["Worldline servicekosten", "CCV servicekosten"];
const SMART_TRADE_PACKAGE_NAMES = ["Lite", "Starter", "Basic", "Premium", "Enterprise"];
const NO_PACKAGE_SWITCH_MODULE_KEYS = new Set(["mailchimp", "postnl", "suiteMkb", "powerbi"]);
const MODULE_DEPENDENCIES: Record<string, string[]> = {
  partijregistratie: ["voorraad"],
  hoveniersapp: ["ticketing"],
};
const MODULE_IMPLEMENTATION_COSTS: Record<string, number> = {
  mailchimp: 360,
  rapportage: 360,
  scanHerken: 720,
  statistiekenPlus: 360,
  digitaleOndertekening: 360,
  postnl: 360,
  suiteMkb: 400,
  powerbi: 720,
  kassa: 720,
  terrein: 720,
  voorraad: 720,
  partijregistratie: 1440,
  chauffeurs: 720,
  assets: 720,
  ticketing: 1440,
  contracten: 720,
  verhuur: 720,
  prijsstaffels: 720,
  hoveniersapp: 720,
};

type RelationOption = {
  id: string;
  name: string;
  email: string | null;
  debtorNumber: string | number | null;
};

type AssetModule = {
  id: string;
  name: string;
  code?: string | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
};

type AssetRecord = {
  id: string;
  name: string;
  description: string | null;
  serialNumber: string | null;
  modules: AssetModule[];
};

function formatDate(value: string | null) {
  if (!value) return "Geen einddatum";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
  }).format(date);
}

function startsWithPrefix(value: string, prefix: string) {
  return value.trimStart().toLowerCase().startsWith(prefix.toLowerCase());
}

function isSmartTradeAsset(asset: AssetRecord) {
  return startsWithPrefix(asset.name, SMART_TRADE_ASSET_PREFIX);
}

function isServiceCostAsset(asset: AssetRecord) {
  return SERVICE_COST_ASSET_PREFIXES.some((prefix) => startsWithPrefix(asset.name, prefix));
}

function getSmartTradePackageName(asset: AssetRecord) {
  const assetName = asset.name.trimStart();
  return SMART_TRADE_PACKAGE_NAMES.find((packageName) =>
    assetName.startsWith(`${SMART_TRADE_ASSET_PREFIX}${packageName}`),
  ) ?? null;
}

function getAssetIdNumber(asset: AssetRecord) {
  const directNumber = Number(asset.id);
  if (Number.isFinite(directNumber)) return directNumber;

  const matches = String(asset.id).match(/\d+/g);
  const lastMatch = matches ? matches[matches.length - 1] : null;
  const fallbackNumber = lastMatch ? Number(lastMatch) : Number.NaN;

  return Number.isFinite(fallbackNumber) ? fallbackNumber : null;
}

function hasHigherAssetId(candidate: AssetRecord, current: AssetRecord) {
  const candidateNumber = getAssetIdNumber(candidate);
  const currentNumber = getAssetIdNumber(current);

  if (candidateNumber !== null && currentNumber !== null) {
    return candidateNumber > currentNumber;
  }

  return candidate.id.localeCompare(current.id, undefined, { numeric: true }) > 0;
}

function getVisibleAssets(allAssets: AssetRecord[]) {
  const extraOptionAssets: AssetRecord[] = [];
  const packageAssets = new Map<string, AssetRecord[]>();

  for (const asset of allAssets) {
    if (isSmartTradeAsset(asset)) {
      const packageName = getSmartTradePackageName(asset);
      if (packageName) {
        const packageGroup = packageAssets.get(packageName) ?? [];
        packageGroup.push(asset);
        packageAssets.set(packageName, packageGroup);
        continue;
      }

      extraOptionAssets.push(asset);
      continue;
    }

    if (isServiceCostAsset(asset)) {
      extraOptionAssets.push(asset);
    }
  }

  let newestPackageAssets: AssetRecord[] = [];
  let newestPackageMaxAsset: AssetRecord | null = null;

  for (const packageGroup of packageAssets.values()) {
    const packageMaxAsset = packageGroup.reduce((newest, asset) =>
      hasHigherAssetId(asset, newest) ? asset : newest,
    );

    if (!newestPackageMaxAsset || hasHigherAssetId(packageMaxAsset, newestPackageMaxAsset)) {
      newestPackageMaxAsset = packageMaxAsset;
      newestPackageAssets = packageGroup;
    }
  }

  const visibleAssets = [...newestPackageAssets, ...extraOptionAssets];
  return visibleAssets.sort((left, right) => left.name.localeCompare(right.name));
}

function hasSupportAsset(assets: AssetRecord[]) {
  return assets.some((asset) => asset.name.toLowerCase().includes("support"));
}

function isExtraUserLicenseAsset(asset: AssetRecord, packageName: string) {
  const assetName = asset.name.trimStart().toLowerCase();
  const packagePrefix = `${SMART_TRADE_ASSET_PREFIX}${packageName}`.toLowerCase();

  return (
    assetName.startsWith(packagePrefix) &&
    assetName.includes("licentie") &&
    assetName.includes("extra gebruiker") &&
    !assetName.includes("support")
  );
}

function getExtraUserLicenseCount(assets: AssetRecord[], packageName: string | null) {
  if (!packageName) return 0;
  return assets.filter((asset) => isExtraUserLicenseAsset(asset, packageName)).length;
}

function formatUserCount(count: number) {
  return count === 1 ? "1 bestaande gebruiker" : `${count} bestaande gebruikers`;
}

function normalizeModuleLabel(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getSortedModuleKeys(moduleKeys: string[]) {
  const moduleOrder = new Map(MODULES.map((module, index) => [module.key, index]));
  return Array.from(new Set(moduleKeys)).sort(
    (left, right) => (moduleOrder.get(left) ?? 0) - (moduleOrder.get(right) ?? 0),
  );
}

function getModuleKeysFromAssets(assets: AssetRecord[]) {
  const moduleKeys = new Set<string>();

  for (const asset of assets) {
    const assetName = asset.name.trimStart();
    const normalizedAssetName = normalizeModuleLabel(assetName);

    if (!isSmartTradeAsset(asset) || !assetName.toLowerCase().includes(" module - ")) continue;

    for (const moduleConfig of MODULES) {
      if (normalizedAssetName.includes(normalizeModuleLabel(moduleConfig.name))) {
        moduleKeys.add(moduleConfig.key);
      }
    }
  }

  return getSortedModuleKeys(Array.from(moduleKeys));
}

function getModulesByKeys(moduleKeys: string[]) {
  return MODULES.filter((moduleConfig) => moduleKeys.includes(moduleConfig.key));
}

function getModuleName(moduleKey: string) {
  return MODULES.find((moduleConfig) => moduleConfig.key === moduleKey)?.name ?? moduleKey;
}

function applyModuleDependencies(moduleKeys: string[]) {
  const expandedKeys = new Set(moduleKeys);
  let changed = true;

  while (changed) {
    changed = false;

    for (const moduleKey of Array.from(expandedKeys)) {
      for (const requiredKey of MODULE_DEPENDENCIES[moduleKey] ?? []) {
        if (!expandedKeys.has(requiredKey)) {
          expandedKeys.add(requiredKey);
          changed = true;
        }
      }
    }
  }

  return getSortedModuleKeys(Array.from(expandedKeys));
}

function removeModuleAndDependents(moduleKey: string, moduleKeys: string[]) {
  const remainingKeys = new Set(moduleKeys);
  const queue = [moduleKey];

  while (queue.length > 0) {
    const nextKey = queue.shift();
    if (!nextKey || !remainingKeys.delete(nextKey)) continue;

    for (const [dependentKey, requiredKeys] of Object.entries(MODULE_DEPENDENCIES)) {
      if (requiredKeys.includes(nextKey)) queue.push(dependentKey);
    }
  }

  return getSortedModuleKeys(Array.from(remainingKeys));
}

function getPackageRelevantModules(moduleKeys: string[]) {
  return getModulesByKeys(moduleKeys).filter(
    (moduleConfig) => moduleConfig.monthlyPrice > 0 && !NO_PACKAGE_SWITCH_MODULE_KEYS.has(moduleConfig.key),
  );
}

function getStandaloneModules(moduleKeys: string[]) {
  return getModulesByKeys(moduleKeys).filter(
    (moduleConfig) => moduleConfig.monthlyPrice > 0 && NO_PACKAGE_SWITCH_MODULE_KEYS.has(moduleConfig.key),
  );
}

function getPackageRelevantModuleCount(moduleKeys: string[]) {
  return getPackageRelevantModules(moduleKeys).length;
}

function getModuleMonthlyForPackage(moduleKeys: string[], packageConfig: PackageConfig) {
  const packageRelevantModules = getPackageRelevantModules(moduleKeys);
  const standaloneModuleMonthly = getStandaloneModules(moduleKeys).reduce(
    (sum, moduleConfig) => sum + moduleConfig.monthlyPrice,
    0,
  );
  const packageRelevantMonthly = packageRelevantModules.reduce(
    (sum, moduleConfig) => sum + moduleConfig.monthlyPrice,
    0,
  );
  const includedModuleDiscount = packageRelevantModules
    .slice()
    .sort((left, right) => right.monthlyPrice - left.monthlyPrice)
    .slice(0, packageConfig.includedModules)
    .reduce((sum, moduleConfig) => sum + moduleConfig.monthlyPrice, 0);

  return standaloneModuleMonthly + Math.max(0, packageRelevantMonthly - includedModuleDiscount);
}

function getModuleImplementationCost(moduleKey: string) {
  return MODULE_IMPLEMENTATION_COSTS[moduleKey] ?? 0;
}

function formatImplementationBasis(cost: number) {
  if (cost === 360) return "halve dag";
  if (cost === 720) return "hele dag";
  if (cost === 1440) return "2 dagen";
  if (cost === 400) return "setup";
  if (cost === 0) return "geen setup";
  return "setup";
}

function isSameModuleSelection(left: string[], right: string[]) {
  const sortedLeft = getSortedModuleKeys(left);
  const sortedRight = getSortedModuleKeys(right);

  return sortedLeft.length === sortedRight.length && sortedLeft.every((key, index) => key === sortedRight[index]);
}

function formatModuleList(modules: ModuleConfig[]) {
  if (modules.length === 0) return "Geen modules";
  return modules.map((moduleConfig) => moduleConfig.name).join(", ");
}

function getPackageIndex(packageConfig: PackageConfig) {
  return PACKAGES.findIndex((candidate) => candidate.key === packageConfig.key);
}

function getModuleRuleNotes(moduleConfig: ModuleConfig) {
  const notes: string[] = [];
  const dependencies = MODULE_DEPENDENCIES[moduleConfig.key] ?? [];

  if (NO_PACKAGE_SWITCH_MODULE_KEYS.has(moduleConfig.key)) notes.push("Geen pakketwissel nodig");
  if (dependencies.length > 0) notes.push(`Vereist: ${dependencies.map(getModuleName).join(", ")}`);

  return notes;
}

export default function AssetsDashboard() {
  const [query, setQuery] = useState("");
  const [relations, setRelations] = useState<RelationOption[]>([]);
  const [selectedRelation, setSelectedRelation] = useState<RelationOption | null>(null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [assetStatus, setAssetStatus] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [extraUsersToOffer, setExtraUsersToOffer] = useState(1);
  const [selectedModuleKeys, setSelectedModuleKeys] = useState<string[]>([]);

  const visibleAssets = useMemo(() => getVisibleAssets(assets), [assets]);

  const selectedPackageName = useMemo(
    () => visibleAssets.map(getSmartTradePackageName).find((packageName): packageName is string => Boolean(packageName)) ?? null,
    [visibleAssets],
  );

  const selectedPackage = useMemo(
    () => PACKAGES.find((packageConfig) => packageConfig.name === selectedPackageName) ?? null,
    [selectedPackageName],
  );

  const currentModuleKeys = useMemo(() => applyModuleDependencies(getModuleKeysFromAssets(visibleAssets)), [visibleAssets]);
  const selectedModules = useMemo(() => getModulesByKeys(selectedModuleKeys), [selectedModuleKeys]);
  const addedModules = useMemo(
    () => selectedModules.filter((moduleConfig) => !currentModuleKeys.includes(moduleConfig.key)),
    [currentModuleKeys, selectedModules],
  );
  const removedModules = useMemo(
    () => getModulesByKeys(currentModuleKeys).filter((moduleConfig) => !selectedModuleKeys.includes(moduleConfig.key)),
    [currentModuleKeys, selectedModuleKeys],
  );
  const selectedPackageModuleCount = useMemo(() => getPackageRelevantModuleCount(selectedModuleKeys), [selectedModuleKeys]);
  const targetPackage = useMemo(
    () => getMinimumPackageForPaidModules(selectedPackageModuleCount),
    [selectedPackageModuleCount],
  );

  const shouldIncludeSupport = useMemo(() => hasSupportAsset(visibleAssets), [visibleAssets]);
  const existingExtraUserCount = useMemo(
    () => getExtraUserLicenseCount(visibleAssets, selectedPackageName),
    [selectedPackageName, visibleAssets],
  );
  const existingUserCount = existingExtraUserCount + 1;
  const safeExtraUsersToOffer = Math.max(1, extraUsersToOffer);
  const extraUserLicenseTotal = selectedPackage ? safeExtraUsersToOffer * selectedPackage.licenseExtra : 0;
  const extraUserSupportTotal = selectedPackage && shouldIncludeSupport ? safeExtraUsersToOffer * selectedPackage.supportExtra : 0;
  const upsellMonthlyTotal = extraUserLicenseTotal + extraUserSupportTotal;
  const missingSupportBaseTotal = selectedPackage ? selectedPackage.supportFirst : 0;
  const missingSupportExtraTotal = selectedPackage ? existingExtraUserCount * selectedPackage.supportExtra : 0;
  const missingSupportMonthlyTotal = missingSupportBaseTotal + missingSupportExtraTotal;

  const hasModuleSelectionChanges = !isSameModuleSelection(currentModuleKeys, selectedModuleKeys);
  const hasPackageChange = Boolean(selectedPackage && targetPackage && selectedPackage.key !== targetPackage.key);
  const packageChangeDirection = selectedPackage && targetPackage && getPackageIndex(targetPackage) > getPackageIndex(selectedPackage)
    ? "upgrade nodig"
    : "downgrade mogelijk";
  const currentModuleMonthly = selectedPackage ? getModuleMonthlyForPackage(currentModuleKeys, selectedPackage) : 0;
  const targetModuleMonthly = targetPackage ? getModuleMonthlyForPackage(selectedModuleKeys, targetPackage) : 0;
  const moduleMonthlyDelta = targetModuleMonthly - currentModuleMonthly;
  const moduleImplementationTotal = addedModules.reduce(
    (sum, moduleConfig) => sum + getModuleImplementationCost(moduleConfig.key),
    0,
  );
  const targetLicenseMonthly = targetPackage ? targetPackage.licenseFirst + existingExtraUserCount * targetPackage.licenseExtra : 0;
  const targetSupportMonthly = targetPackage && shouldIncludeSupport
    ? targetPackage.supportFirst + existingExtraUserCount * targetPackage.supportExtra
    : 0;
  const targetRecurringMonthly = targetLicenseMonthly + targetSupportMonthly + targetModuleMonthly;

  function handleToggleModule(moduleKey: string) {
    setSelectedModuleKeys((currentKeys) => {
      if (currentKeys.includes(moduleKey)) {
        return removeModuleAndDependents(moduleKey, currentKeys);
      }

      return applyModuleDependencies([...currentKeys, moduleKey]);
    });
  }

  function handleResetModules() {
    setSelectedModuleKeys(currentModuleKeys);
  }

  function renderModuleImplementationRows() {
    if (addedModules.length === 0) {
      return (
        <div className={styles.quoteRow}>
          <span>0x</span>
          <strong>Implementatie modules</strong>
          <span>geen toegevoegde modules</span>
          <strong>{euro.format(0)}</strong>
        </div>
      );
    }

    return addedModules.map((moduleConfig) => {
      const implementationCost = getModuleImplementationCost(moduleConfig.key);

      return (
        <div key={`implementation-${moduleConfig.key}`} className={styles.quoteRow}>
          <span>1x</span>
          <strong>Implementatie {moduleConfig.name}</strong>
          <span>{formatImplementationBasis(implementationCost)}</span>
          <strong>{euro.format(implementationCost)}</strong>
        </div>
      );
    });
  }

  async function handleSearchRelations(event: FormEvent) {
    event.preventDefault();

    setSearchStatus("");
    setAssetStatus("");
    setSearching(true);
    setSelectedRelation(null);
    setAssets([]);
    setSelectedModuleKeys([]);

    try {
      const response = await fetch(`/api/smart-trade/relations/search?query=${encodeURIComponent(query)}`);
      const json = await response.json();

      if (!response.ok) {
        setSearchStatus(json.error ?? "Relaties zoeken mislukt.");
        return;
      }

      setRelations(json.relations ?? []);

      if ((json.relations ?? []).length === 0) {
        setSearchStatus("Geen relaties gevonden.");
      }
    } catch (error) {
      setSearchStatus(error instanceof Error ? error.message : "Relaties zoeken mislukt.");
    } finally {
      setSearching(false);
    }
  }

  async function handleSelectRelation(relation: RelationOption) {
    setSelectedRelation(relation);
    setAssetStatus("");
    setLoadingAssets(true);
    setAssets([]);
    setSelectedModuleKeys([]);

    try {
      const response = await fetch(`/api/smart-trade/assets/by-relation?relationId=${encodeURIComponent(relation.id)}`);
      const json = await response.json();

      if (!response.ok) {
        setAssetStatus(json.error ?? "Assets ophalen mislukt.");
        return;
      }

      const nextAssets = json.assets ?? [];
      setAssets(nextAssets);
      setSelectedModuleKeys(applyModuleDependencies(getModuleKeysFromAssets(getVisibleAssets(nextAssets))));

      if (nextAssets.length === 0) {
        setAssetStatus(`Geen assets gevonden voor ${relation.name}.`);
      }
    } catch (error) {
      setAssetStatus(error instanceof Error ? error.message : "Assets ophalen mislukt.");
    } finally {
      setLoadingAssets(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="container stack-4">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Assets</div>
            <h1>Assets en upsell-kansen</h1>
            <p>
              Zoek een debiteur en bekijk Smart Trade assets, Worldline servicekosten en CCV servicekosten.
            </p>
          </div>

          <div className="brand-actions">
            <StatusPill tone="success">{visibleAssets.length} relevante assets</StatusPill>
            <StatusPill tone="warning">{assets.length} ontvangen assets</StatusPill>
          </div>
        </header>

        <section className={`card panel ${styles.assetsSearchPanel}`}>
          <div className="top-row">
            <div>
              <div className="eyebrow">Stap 1</div>
              <h2 className="headline">Debiteur zoeken</h2>
              <p className="subtext">Zoek op bedrijfsnaam, contactnaam, e-mail of relatienummer.</p>
            </div>
            <div className="icon-badge">
              <Search size={26} />
            </div>
          </div>

          <form onSubmit={handleSearchRelations} className={styles.assetSearchForm}>
            <input
              className={`input ${styles.assetSearchInput}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Bijv. Mellaart, Jansen, e-mail of ID..."
              required
            />
            <button type="submit" className={`primary-button ${styles.assetSearchButton}`} disabled={searching}>
              <Search size={16} />
              {searching ? "Zoeken..." : "Zoeken"}
            </button>
          </form>

          {relations.length > 0 ? (
            <div className={styles.relationResults}>
              <div className={styles.relationResultsHeader}>
                <span>Gevonden relaties</span>
                <span>{relations.length} resultaten</span>
              </div>

              <div className={styles.relationResultList}>
                {relations.map((relation) => (
                  <button
                    key={relation.id}
                    type="button"
                    className={`${styles.relationResultCard} ${
                      selectedRelation?.id === relation.id ? styles.selectedResultCard : ""
                    }`}
                    onClick={() => void handleSelectRelation(relation)}
                  >
                    <span className={styles.relationResultIcon}>
                      <Building2 size={18} />
                    </span>

                    <span className={styles.relationResultContent}>
                      <strong>{relation.name}</strong>
                      <span className={styles.relationResultMeta}>
                        <span>
                          <Hash size={13} />
                          ID {relation.id}
                        </span>
                        {relation.debtorNumber ? <span>Debiteur {relation.debtorNumber}</span> : null}
                        {relation.email ? (
                          <span>
                            <Mail size={13} />
                            {relation.email}
                          </span>
                        ) : null}
                      </span>
                    </span>

                    <span className={styles.relationResultAction}>
                      {selectedRelation?.id === relation.id ? "Geselecteerd" : "Selecteer"}
                      <ChevronRight size={16} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {searchStatus ? <div className={`save-status ${styles.assetsStatus}`}>{searchStatus}</div> : null}
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Stap 2</div>
              <h2 className="headline">
                {selectedRelation ? `Assets voor ${selectedRelation.name}` : "Assets"}
              </h2>
              <p className="subtext">
                Bij meerdere Smart Trade pakketten tonen we tijdelijk alleen de pakketgroep met het hoogste asset-ID.
              </p>
            </div>
            <div className="icon-badge">
              <Boxes size={26} />
            </div>
          </div>

          {loadingAssets ? (
            <div className="save-status">Assets worden opgehaald...</div>
          ) : !selectedRelation ? (
            <div className="empty-state">Kies eerst een relatie om assets te bekijken.</div>
          ) : assetStatus ? (
            <div className="empty-state">{assetStatus}</div>
          ) : visibleAssets.length === 0 ? (
            <div className="empty-state">Geen relevante assets gevonden voor {selectedRelation.name}.</div>
          ) : (
            <div className={styles.assetGrid}>
              {visibleAssets.map((asset) => (
                <article key={asset.id} className={styles.assetCard}>
                  <div className={styles.assetCardHeader}>
                    <div>
                      <div className={styles.assetTitle}>{asset.name}</div>
                      <div className={styles.assetMeta}>
                        Asset ID: {asset.id}
                        {asset.serialNumber ? ` - Serienummer: ${asset.serialNumber}` : ""}
                      </div>
                    </div>
                    <StatusPill tone="success">{asset.modules.filter((assetModule) => assetModule.active).length} actief</StatusPill>
                  </div>

                  {asset.description ? <p className={styles.assetDescription}>{asset.description}</p> : null}

                  {asset.modules.length > 0 ? (
                    <div className={styles.assetModules}>
                      {asset.modules.map((assetModule) => (
                        <div
                          key={assetModule.id}
                          className={`${styles.assetModule} ${
                            assetModule.active ? styles.assetModuleActive : styles.assetModuleInactive
                          }`}
                        >
                          <div>
                            <strong>{assetModule.name}</strong>
                            {assetModule.code ? <span>Code: {assetModule.code}</span> : null}
                          </div>
                          <span>{assetModule.active ? "Actief" : `Eindigde: ${formatDate(assetModule.endsAt)}`}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Stap 3</div>
              <h2 className="headline">Upsell-signalen</h2>
              <p className="subtext">
                Maak eenvoudige voorstellen op basis van het pakket, bestaande gebruikers en support in de assets.
              </p>
            </div>
            <div className="icon-badge">
              <Sparkles size={26} />
            </div>
          </div>

          {!selectedRelation ? (
            <div className="empty-state">Kies eerst een relatie om een voorstel te maken.</div>
          ) : !selectedPackageName ? (
            <div className="empty-state">Geen Smart Trade pakket gevonden voor deze relatie.</div>
          ) : !selectedPackage ? (
            <div className="empty-state">Geen prijsregel gevonden voor Smart Trade {selectedPackageName}.</div>
          ) : (
            <div className={styles.upsellStack}>
              <div className={styles.upsellPanel}>
                <div className={styles.upsellSummary}>
                  <div>
                    <div className={styles.assetTitle}>Extra gebruiker offerte</div>
                    <div className={styles.assetMeta}>Pakket: Smart Trade {selectedPackage.name}</div>
                  </div>
                  <StatusPill tone={shouldIncludeSupport ? "success" : "warning"}>
                    {shouldIncludeSupport ? "met support" : "zonder support"}
                  </StatusPill>
                </div>

                <label className={styles.upsellUserInput}>
                  <span>Aantal extra gebruikers</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={extraUsersToOffer}
                    onChange={(event) => setExtraUsersToOffer(Math.max(1, Number(event.target.value || 1)))}
                  />
                </label>

                <div className={styles.quoteRows}>
                  <div className={styles.quoteRow}>
                    <span>{safeExtraUsersToOffer}x</span>
                    <strong>Smart Trade {selectedPackage.name} Extra gebruiker</strong>
                    <span>{euro.format(selectedPackage.licenseExtra)} p/m</span>
                    <strong>{euro.format(extraUserLicenseTotal)} p/m</strong>
                  </div>

                  {shouldIncludeSupport ? (
                    <div className={styles.quoteRow}>
                      <span>{safeExtraUsersToOffer}x</span>
                      <strong>Smart Trade {selectedPackage.name} Supportcontract Extra gebruiker</strong>
                      <span>{euro.format(selectedPackage.supportExtra)} p/m</span>
                      <strong>{euro.format(extraUserSupportTotal)} p/m</strong>
                    </div>
                  ) : null}
                </div>

                <div className={styles.quoteTotal}>
                  <span>Maandelijkse uitbreiding</span>
                  <strong>{euro.format(upsellMonthlyTotal)} p/m</strong>
                </div>
              </div>

              {!shouldIncludeSupport ? (
                <div className={`${styles.upsellPanel} ${styles.supportOfferPanel}`}>
                  <div className={styles.upsellSummary}>
                    <div>
                      <div className={styles.assetTitle}>Supportcontract toevoegen</div>
                      <div className={styles.assetMeta}>
                        Gebaseerd op Smart Trade {selectedPackage.name} en {formatUserCount(existingUserCount)}.
                      </div>
                    </div>
                    <StatusPill tone="warning">support ontbreekt</StatusPill>
                  </div>

                  <div className={styles.quoteRows}>
                    <div className={styles.quoteRow}>
                      <span>1x</span>
                      <strong>Smart Trade {selectedPackage.name} Supportcontract</strong>
                      <span>{euro.format(selectedPackage.supportFirst)} p/m</span>
                      <strong>{euro.format(missingSupportBaseTotal)} p/m</strong>
                    </div>

                    {existingExtraUserCount > 0 ? (
                      <div className={styles.quoteRow}>
                        <span>{existingExtraUserCount}x</span>
                        <strong>Smart Trade {selectedPackage.name} Supportcontract Extra gebruiker</strong>
                        <span>{euro.format(selectedPackage.supportExtra)} p/m</span>
                        <strong>{euro.format(missingSupportExtraTotal)} p/m</strong>
                      </div>
                    ) : null}
                  </div>

                  <div className={styles.quoteTotal}>
                    <span>Support uitbreiding</span>
                    <strong>{euro.format(missingSupportMonthlyTotal)} p/m</strong>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Stap 4</div>
              <h2 className="headline">Modules</h2>
              <p className="subtext">
                Selecteer de gewenste module-eindstand. De offerte bepaalt daarna of het huidige pakket blijft passen.
              </p>
            </div>
            <div className="icon-badge">
              <Boxes size={26} />
            </div>
          </div>

          {!selectedRelation ? (
            <div className="empty-state">Kies eerst een relatie om modules te adviseren.</div>
          ) : !selectedPackageName ? (
            <div className="empty-state">Geen Smart Trade pakket gevonden voor deze relatie.</div>
          ) : !selectedPackage || !targetPackage ? (
            <div className="empty-state">Geen pakketadvies beschikbaar.</div>
          ) : (
            <div className={styles.modulePlanner}>
              <div className={styles.moduleSteps}>
                <div>
                  <span>1</span>
                  <strong>Alle modules</strong>
                  <small>{MODULES.length} opties</small>
                </div>
                <div>
                  <span>2</span>
                  <strong>Selectie</strong>
                  <small>{selectedModules.length} geselecteerd</small>
                </div>
                <div>
                  <span>3</span>
                  <strong>Pakketadvies</strong>
                  <small>{hasPackageChange ? `${selectedPackage.name} naar ${targetPackage.name}` : selectedPackage.name}</small>
                </div>
                <div>
                  <span>4</span>
                  <strong>Implementatie</strong>
                  <small>{euro.format(moduleImplementationTotal)}</small>
                </div>
              </div>

              <div className={styles.moduleGrid}>
                {MODULES.map((moduleConfig) => {
                  const selected = selectedModuleKeys.includes(moduleConfig.key);
                  const current = currentModuleKeys.includes(moduleConfig.key);
                  const moduleRuleNotes = getModuleRuleNotes(moduleConfig);

                  return (
                    <label
                      key={moduleConfig.key}
                      className={`${styles.moduleOption} ${selected ? styles.moduleOptionSelected : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => handleToggleModule(moduleConfig.key)}
                      />
                      <span>
                        <strong>{moduleConfig.name}</strong>
                        <small>{moduleConfig.monthlyPrice > 0 ? `${euro.format(moduleConfig.monthlyPrice)} p/m` : "Gratis module"}</small>
                        {moduleRuleNotes.map((note) => (
                          <small key={note}>{note}</small>
                        ))}
                      </span>
                      {current ? <em>huidig</em> : null}
                    </label>
                  );
                })}
              </div>

              <div className={styles.moduleAdvice}>
                <div className={styles.moduleAdviceHeader}>
                  <div>
                    <div className={styles.assetTitle}>Module-offerte</div>
                    <div className={styles.assetMeta}>
                      Huidig: Smart Trade {selectedPackage.name}. Advies: Smart Trade {targetPackage.name}.
                    </div>
                  </div>
                  <div className={styles.moduleAdviceActions}>
                    <StatusPill tone={hasPackageChange ? "warning" : "success"}>
                      {hasPackageChange ? packageChangeDirection : "blijft binnen pakket"}
                    </StatusPill>
                    {hasModuleSelectionChanges ? (
                      <button type="button" className={styles.resetModulesButton} onClick={handleResetModules}>
                        Reset selectie
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className={styles.moduleSelectionSummary}>
                  <div>
                    <span>Toevoegen</span>
                    <strong>{formatModuleList(addedModules)}</strong>
                  </div>
                  <div>
                    <span>Ruilen/verwijderen</span>
                    <strong>{formatModuleList(removedModules)}</strong>
                  </div>
                </div>

                {hasPackageChange ? (
                  <div className={styles.quoteRows}>
                    <div className={styles.quoteRow}>
                      <span>1x</span>
                      <strong>Smart Trade {targetPackage.name} licentie</strong>
                      <span>{euro.format(targetPackage.licenseFirst)} p/m</span>
                      <strong>{euro.format(targetPackage.licenseFirst)} p/m</strong>
                    </div>

                    {existingExtraUserCount > 0 ? (
                      <div className={styles.quoteRow}>
                        <span>{existingExtraUserCount}x</span>
                        <strong>Smart Trade {targetPackage.name} licentie extra gebruiker</strong>
                        <span>{euro.format(targetPackage.licenseExtra)} p/m</span>
                        <strong>{euro.format(existingExtraUserCount * targetPackage.licenseExtra)} p/m</strong>
                      </div>
                    ) : null}

                    {shouldIncludeSupport ? (
                      <div className={styles.quoteRow}>
                        <span>{existingUserCount}x</span>
                        <strong>Supportcontract Smart Trade {targetPackage.name}</strong>
                        <span>incl. extra gebruikers</span>
                        <strong>{euro.format(targetSupportMonthly)} p/m</strong>
                      </div>
                    ) : null}

                    <div className={styles.quoteRow}>
                      <span>{selectedPackageModuleCount}x</span>
                      <strong>Modules binnen pakketadvies</strong>
                      <span>{targetPackage.includedModules} inbegrepen</span>
                      <strong>{euro.format(targetModuleMonthly)} p/m</strong>
                    </div>

                    {renderModuleImplementationRows()}

                    <div className={styles.quoteTotal}>
                      <span>Implementatie modules</span>
                      <strong>{euro.format(moduleImplementationTotal)}</strong>
                    </div>

                    <div className={styles.quoteTotal}>
                      <span>Nieuwe maandprijs</span>
                      <strong>{euro.format(targetRecurringMonthly)} p/m</strong>
                    </div>
                  </div>
                ) : (
                  <div className={styles.quoteRows}>
                    {addedModules.map((moduleConfig) => (
                      <div key={`add-${moduleConfig.key}`} className={styles.quoteRow}>
                        <span>+</span>
                        <strong>{moduleConfig.name}</strong>
                        <span>{moduleConfig.monthlyPrice > 0 ? `${euro.format(moduleConfig.monthlyPrice)} p/m` : "gratis"}</span>
                        <strong>{moduleConfig.monthlyPrice > 0 ? `${euro.format(moduleConfig.monthlyPrice)} p/m` : euro.format(0)}</strong>
                      </div>
                    ))}

                    {removedModules.map((moduleConfig) => (
                      <div key={`remove-${moduleConfig.key}`} className={styles.quoteRow}>
                        <span>-</span>
                        <strong>{moduleConfig.name}</strong>
                        <span>uit selectie</span>
                        <strong>{moduleConfig.monthlyPrice > 0 ? `-${euro.format(moduleConfig.monthlyPrice)} p/m` : euro.format(0)}</strong>
                      </div>
                    ))}

                    {!hasModuleSelectionChanges ? (
                      <div className="empty-state">Selecteer een extra module of ruil een bestaande module.</div>
                    ) : null}

                    <div className={styles.quoteRow}>
                      <span>=</span>
                      <strong>Modulebedrag verschil binnen {selectedPackage.name}</strong>
                      <span>{selectedPackage.includedModules} pakketmodules inbegrepen</span>
                      <strong>{euro.format(moduleMonthlyDelta)} p/m</strong>
                    </div>

                    {renderModuleImplementationRows()}

                    <div className={styles.quoteTotal}>
                      <span>Offerte modulewijziging</span>
                      <strong>{euro.format(moduleMonthlyDelta)} p/m</strong>
                    </div>

                    <div className={styles.quoteTotal}>
                      <span>Implementatie modules</span>
                      <strong>{euro.format(moduleImplementationTotal)}</strong>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
