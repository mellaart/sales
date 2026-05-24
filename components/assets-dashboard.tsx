"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Boxes, Building2, ChevronRight, Hash, Mail, Search, Sparkles } from "lucide-react";
import { StatusPill } from "@/components/ui";
import styles from "./assets-dashboard.module.css";

const SMART_TRADE_ASSET_PREFIX = "Smart Trade ";

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

function isSmartTradeAsset(asset: AssetRecord) {
  return asset.name.trimStart().startsWith(SMART_TRADE_ASSET_PREFIX);
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

  const smartTradeAssets = useMemo(() => assets.filter(isSmartTradeAsset), [assets]);

  const activeModuleCount = useMemo(
    () => smartTradeAssets.reduce((sum, asset) => sum + asset.modules.filter((assetModule) => assetModule.active).length, 0),
    [smartTradeAssets],
  );

  const inactiveModuleCount = useMemo(
    () => smartTradeAssets.reduce((sum, asset) => sum + asset.modules.filter((assetModule) => !assetModule.active).length, 0),
    [smartTradeAssets],
  );

  async function handleSearchRelations(event: FormEvent) {
    event.preventDefault();

    setSearchStatus("");
    setAssetStatus("");
    setSearching(true);
    setSelectedRelation(null);
    setAssets([]);

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

    try {
      const response = await fetch(`/api/smart-trade/assets/by-relation?relationId=${encodeURIComponent(relation.id)}`);
      const json = await response.json();

      if (!response.ok) {
        setAssetStatus(json.error ?? "Assets ophalen mislukt.");
        return;
      }

      setAssets(json.assets ?? []);

      if ((json.assets ?? []).length === 0) {
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
              Zoek een debiteur en bekijk alleen de assets waarvan de naam met Smart Trade begint.
            </p>
          </div>

          <div className="brand-actions">
            <StatusPill tone="success">{smartTradeAssets.length} Smart Trade assets</StatusPill>
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
                {selectedRelation ? `Smart Trade assets voor ${selectedRelation.name}` : "Smart Trade assets"}
              </h2>
              <p className="subtext">
                De lijst toont alleen assets die beginnen met Smart Trade.
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
          ) : smartTradeAssets.length === 0 ? (
            <div className="empty-state">Geen Smart Trade assets gevonden voor {selectedRelation.name}.</div>
          ) : (
            <div className={styles.assetGrid}>
              {smartTradeAssets.map((asset) => (
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

                  <div className={styles.assetModules}>
                    {asset.modules.length === 0 ? (
                      <div className={styles.assetModule}>
                        <div>
                          <strong>Geen gekoppelde diensten ontvangen</strong>
                        </div>
                      </div>
                    ) : (
                      asset.modules.map((assetModule) => (
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
                      ))
                    )}
                  </div>
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
                Deze stap toont nog geen automatische adviezen. Eerst valideren we of de Smart Trade assetdata klopt.
              </p>
            </div>
            <div className="icon-badge">
              <Sparkles size={26} />
            </div>
          </div>

          <div className="stats-grid">
            <div className="soft-card">
              <div className="kpi-title">Smart Trade assets</div>
              <div className="big-number">{smartTradeAssets.length}</div>
            </div>
            <div className="soft-card">
              <div className="kpi-title">Ontvangen assets</div>
              <div className="big-number">{assets.length}</div>
            </div>
            <div className="soft-card">
              <div className="kpi-title">Actieve diensten</div>
              <div className="big-number">{activeModuleCount}</div>
            </div>
            <div className="soft-card">
              <div className="kpi-title">Inactieve diensten</div>
              <div className="big-number">{inactiveModuleCount}</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
