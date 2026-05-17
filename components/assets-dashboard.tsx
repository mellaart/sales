"use client";

import { useMemo, useState } from "react";
import { Boxes, Search, Sparkles } from "lucide-react";
import { StatusPill } from "@/components/ui";

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
  const [status, setStatus] = useState("");
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

    setStatus("");
    setSearching(true);
    setSelectedRelation(null);
    setAssets([]);

    try {
      const response = await fetch(`/api/smart-trade/relations/search?query=${encodeURIComponent(query)}`);
      const json = await response.json();

      if (!response.ok) {
        setStatus(json.error ?? "Relaties zoeken mislukt.");
        return;
      }

      setRelations(json.relations ?? []);

      if ((json.relations ?? []).length === 0) {
        setStatus("Geen relaties gevonden.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Relaties zoeken mislukt.");
    } finally {
      setSearching(false);
    }
  }

  async function handleSelectRelation(relation: RelationOption) {
    setSelectedRelation(relation);
    setStatus("");
    setLoadingAssets(true);
    setAssets([]);

    try {
      const response = await fetch(`/api/smart-trade/assets/by-relation?relationId=${encodeURIComponent(relation.id)}`);
      const json = await response.json();

      if (!response.ok) {
        setStatus(json.error ?? "Assets ophalen mislukt.");
        return;
      }

      setAssets(json.assets ?? []);

      if ((json.assets ?? []).length === 0) {
        setStatus("Geen assets gevonden voor deze relatie.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Assets ophalen mislukt.");
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

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Stap 1</div>
              <h2 className="headline">Debiteur zoeken</h2>
              <p className="subtext">Zoek op bedrijfsnaam (alleen relaties met custom field "smart trade (auto) = 1").</p>
            </div>
            <div className="icon-badge">
              <Search size={26} />
            </div>
          </div>

          <form onSubmit={handleSearchRelations} className="asset-search-form">
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Bijv. Acme, Jansen, Sierbestrating..."
              required
            />
            <button type="submit" className="primary-button" disabled={searching}>
              <Search size={16} />
              {searching ? "Zoeken..." : "Zoeken"}
            </button>
          </form>

          {relations.length > 0 ? (
            <div className="relation-result-grid">
              {relations.map((relation) => (
                <button
                  key={relation.id}
                  type="button"
                  className={`relation-result-card ${selectedRelation?.id === relation.id ? "active" : ""}`}
                  onClick={() => void handleSelectRelation(relation)}
                >
                  <strong>{relation.name}</strong>
                  <span>ID: {relation.id}</span>
                  {relation.email ? <span>{relation.email}</span> : null}
                </button>
              ))}
            </div>
          ) : null}

          {status ? <div className="save-status">{status}</div> : null}
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
          ) : assets.length === 0 ? (
            <div className="empty-state">Kies eerst een relatie om assets te bekijken.</div>
          ) : (
            <div className="asset-grid">
              {assets.map((asset) => (
                <article key={asset.id} className="asset-card">
                  <div className="asset-card-header">
                    <div>
                      <div className="asset-title">{asset.name}</div>
                      <div className="asset-meta">
                        Asset ID: {asset.id}
                        {asset.serialNumber ? ` · Serienummer: ${asset.serialNumber}` : ""}
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
