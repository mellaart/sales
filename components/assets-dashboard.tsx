"use client";

import { useMemo, useState } from "react";
import { Boxes, Building2, ChevronRight, Hash, Mail, Search, Sparkles } from "lucide-react";
import { StatusPill } from "@/components/ui";
import styles from "./assets-dashboard.module.css";

type RelationOption = {
  id: string;
  name: string;
  email: string | null;
  debtorNumber: string | number | null;
};

type AssetModule = {
  id: string;
  name: string;
  code: string | null;
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

export default function AssetsDashboard() {
  const [query, setQuery] = useState("");
  const [relations, setRelations] = useState<RelationOption[]>([]);
  const [selectedRelation, setSelectedRelation] = useState<RelationOption | null>(null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [assetStatus, setAssetStatus] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const activeModuleCount = useMemo(
    () => assets.reduce((sum, asset) => sum + asset.modules.filter((module) => module.active).length, 0),
    [assets],
  );

  const inactiveModuleCount = useMemo(
    () => assets.reduce((sum, asset) => sum + asset.modules.filter((module) => !module.active).length, 0),
    [assets],
  );

  async function handleSearchRelations(event: React.FormEvent) {
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
              Zoek een debiteur, haal assets op en bekijk per asset de actieve modules/diensten uit contractAgreements.
            </p>
          </div>

          <div className="brand-actions">
            <StatusPill tone="success">{assets.length} assets</StatusPill>
            <StatusPill tone="warning">{activeModuleCount} actieve modules</StatusPill>
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
                    className={`${styles.relationResultCard} ${selectedRelation?.id === relation.id ? styles.active : ""}`}
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
                Contractregels worden getoond als modules/diensten. Actief = geen einddatum of einddatum in de toekomst.
              </p>
            </div>
            <div className="icon-badge">
              <Boxes size={26} />
            </div>
          </div>

          {loadingAssets ? (
            <div className="save-status">Assets en contractAgreements worden opgehaald...</div>
          ) : !selectedRelation ? (
            <div className="empty-state">Kies eerst een relatie om assets te bekijken.</div>
          ) : assetStatus ? (
            <div className="empty-state">{assetStatus}</div>
          ) : assets.length === 0 ? (
            <div className="empty-state">Geen assets gevonden voor {selectedRelation.name}.</div>
          ) : (
            <div className="asset-grid">
              {assets.map((asset) => (
                <article key={asset.id} className="asset-card">
                  <div className="asset-card-header">
                    <div>
                      <div className="asset-title">{asset.name}</div>
                      <div className="asset-meta">
                        Asset ID: {asset.id}
                        {asset.serialNumber ? ` - Serienummer: ${asset.serialNumber}` : ""}
                      </div>
                    </div>
                    <StatusPill tone="success">{asset.modules.filter((module) => module.active).length} actief</StatusPill>
                  </div>

                  {asset.description ? <p className="asset-description">{asset.description}</p> : null}

                  <div className="asset-modules">
                    {asset.modules.length === 0 ? (
                      <span className="asset-module muted">Geen contractAgreements gevonden</span>
                    ) : (
                      asset.modules.map((module) => (
                        <div key={module.id} className={`asset-module ${module.active ? "active" : "inactive"}`}>
                          <div>
                            <strong>{module.name}</strong>
                            {module.code ? <span>Code: {module.code}</span> : null}
                          </div>
                          <span>{module.active ? "Actief" : `Eindigde: ${formatDate(module.endsAt)}`}</span>
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
              <div className="eyebrow">Upsell</div>
              <h2 className="headline">Signalen</h2>
              <p className="subtext">Deze stap toont nog geen automatische adviezen. Eerst valideren we of de asset/module-data klopt.</p>
            </div>
            <div className="icon-badge">
              <Sparkles size={26} />
            </div>
          </div>

          <div className="stats-grid">
            <div className="soft-card">
              <div className="kpi-title">Assets</div>
              <div className="big-number">{assets.length}</div>
            </div>
            <div className="soft-card">
              <div className="kpi-title">Actieve modules</div>
              <div className="big-number">{activeModuleCount}</div>
            </div>
            <div className="soft-card">
              <div className="kpi-title">Inactieve modules</div>
              <div className="big-number">{inactiveModuleCount}</div>
            </div>
            <div className="soft-card">
              <div className="kpi-title">Volgende stap</div>
              <div className="big-number">Advies</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
