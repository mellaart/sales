"use client";

import { useMemo, useState, type FormEvent } from "react";
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

type ContractRecord = {
  id: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  assetCount: number;
};

function formatDate(value: string | null, emptyLabel = "Geen einddatum") {
  if (!value) return emptyLabel;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
  }).format(date);
}

function getContractEndLabel(contract: ContractRecord) {
  if (contract.active) {
    return contract.endsAt ? `Eindigt: ${formatDate(contract.endsAt)}` : "Actief zonder einddatum";
  }

  return `Eindigde: ${formatDate(contract.endsAt)}`;
}

export default function AssetsDashboard() {
  const [query, setQuery] = useState("");
  const [relations, setRelations] = useState<RelationOption[]>([]);
  const [selectedRelation, setSelectedRelation] = useState<RelationOption | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [contractStatus, setContractStatus] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingContracts, setLoadingContracts] = useState(false);

  const contracts = useMemo(() => {
    const contractMap = new Map<string, ContractRecord>();

    for (const asset of assets) {
      for (const assetModule of asset.modules) {
        const existing = contractMap.get(assetModule.id);

        contractMap.set(assetModule.id, {
          id: assetModule.id,
          name: existing?.name ?? assetModule.name,
          startsAt: existing?.startsAt ?? assetModule.startsAt,
          endsAt: existing?.endsAt ?? assetModule.endsAt,
          active: Boolean(existing?.active || assetModule.active),
          assetCount: (existing?.assetCount ?? 0) + 1,
        });
      }
    }

    return Array.from(contractMap.values()).sort((left, right) => {
      if (left.active !== right.active) return left.active ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
  }, [assets]);

  const selectedContract = useMemo(
    () => contracts.find((contract) => contract.id === selectedContractId) ?? null,
    [contracts, selectedContractId],
  );

  const selectedContractAssets = useMemo(() => {
    if (!selectedContractId) return [];

    return assets.filter((asset) =>
      asset.modules.some((assetModule) => assetModule.id === selectedContractId),
    );
  }, [assets, selectedContractId]);

  const activeContractCount = useMemo(
    () => contracts.filter((contract) => contract.active).length,
    [contracts],
  );

  const inactiveContractCount = useMemo(
    () => contracts.filter((contract) => !contract.active).length,
    [contracts],
  );

  async function handleSearchRelations(event: FormEvent) {
    event.preventDefault();

    setSearchStatus("");
    setContractStatus("");
    setSearching(true);
    setSelectedRelation(null);
    setSelectedContractId(null);
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
    setSelectedContractId(null);
    setContractStatus("");
    setLoadingContracts(true);
    setAssets([]);

    try {
      const response = await fetch(`/api/smart-trade/assets/by-relation?relationId=${encodeURIComponent(relation.id)}`);
      const json = await response.json();

      if (!response.ok) {
        setContractStatus(json.error ?? "Contracten ophalen mislukt.");
        return;
      }

      setAssets(json.assets ?? []);

      if ((json.assets ?? []).length === 0) {
        setContractStatus(`Geen contracten of assets gevonden voor ${relation.name}.`);
      }
    } catch (error) {
      setContractStatus(error instanceof Error ? error.message : "Contracten ophalen mislukt.");
    } finally {
      setLoadingContracts(false);
    }
  }

  function handleSelectContract(contractId: string) {
    setSelectedContractId(contractId);
  }

  return (
    <div className="page-shell">
      <div className="container stack-4">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Assets</div>
            <h1>Assets en upsell-kansen</h1>
            <p>
              Zoek een debiteur, bekijk de contracten en open daarna de assets die bij het gekozen contract horen.
            </p>
          </div>

          <div className="brand-actions">
            <StatusPill tone="success">{assets.length} assets</StatusPill>
            <StatusPill tone="warning">{contracts.length} contracten</StatusPill>
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
                {selectedRelation ? `Contracten voor ${selectedRelation.name}` : "Contracten"}
              </h2>
              <p className="subtext">
                Kies een contract. Daarna tonen we in stap 3 alleen de assets die bij dat contract horen.
              </p>
            </div>
            <div className="icon-badge">
              <Boxes size={26} />
            </div>
          </div>

          {loadingContracts ? (
            <div className="save-status">Contracten en assets worden opgehaald...</div>
          ) : !selectedRelation ? (
            <div className="empty-state">Kies eerst een relatie om contracten te bekijken.</div>
          ) : contractStatus ? (
            <div className="empty-state">{contractStatus}</div>
          ) : contracts.length === 0 ? (
            <div className="empty-state">Geen contracten gevonden voor {selectedRelation.name}.</div>
          ) : (
            <div className={styles.relationResultList}>
              {contracts.map((contract) => (
                <button
                  key={contract.id}
                  type="button"
                  className={`${styles.relationResultCard} ${
                    selectedContractId === contract.id ? styles.selectedResultCard : ""
                  }`}
                  onClick={() => handleSelectContract(contract.id)}
                >
                  <span className={styles.relationResultIcon}>
                    <Boxes size={18} />
                  </span>

                  <span className={styles.relationResultContent}>
                    <strong>{contract.name}</strong>
                    <span className={styles.relationResultMeta}>
                      <span>
                        <Hash size={13} />
                        Contract {contract.id}
                      </span>
                      <span>{contract.assetCount} assets</span>
                      <span>Start: {formatDate(contract.startsAt, "Geen startdatum")}</span>
                      <span>{getContractEndLabel(contract)}</span>
                    </span>
                  </span>

                  <span className={styles.relationResultAction}>
                    {selectedContractId === contract.id ? "Geselecteerd" : "Bekijk assets"}
                    <ChevronRight size={16} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Stap 3</div>
              <h2 className="headline">
                {selectedContract ? `Assets in ${selectedContract.name}` : "Assets per contract"}
              </h2>
              <p className="subtext">Deze lijst is gefilterd op het contract dat je in stap 2 kiest.</p>
            </div>
            <div className="icon-badge">
              <Boxes size={26} />
            </div>
          </div>

          {!selectedRelation ? (
            <div className="empty-state">Kies eerst een relatie en daarna een contract.</div>
          ) : !selectedContract ? (
            <div className="empty-state">Kies een contract om de gekoppelde assets te bekijken.</div>
          ) : selectedContractAssets.length === 0 ? (
            <div className="empty-state">Geen assets gevonden binnen {selectedContract.name}.</div>
          ) : (
            <div className={styles.assetGrid}>
              {selectedContractAssets.map((asset) => {
                const matchingModules = asset.modules.filter((assetModule) => assetModule.id === selectedContract.id);

                return (
                  <article key={asset.id} className={styles.assetCard}>
                    <div className={styles.assetCardHeader}>
                      <div>
                        <div className={styles.assetTitle}>{asset.name}</div>
                        <div className={styles.assetMeta}>
                          Asset ID: {asset.id}
                          {asset.serialNumber ? ` - Serienummer: ${asset.serialNumber}` : ""}
                        </div>
                      </div>
                      <StatusPill tone="success">{matchingModules.length} match</StatusPill>
                    </div>

                    {asset.description ? <p className={styles.assetDescription}>{asset.description}</p> : null}

                    <div className={styles.assetModules}>
                      {matchingModules.map((assetModule) => (
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
                          <span>
                            {assetModule.active
                              ? getContractEndLabel({ ...selectedContract, active: true, endsAt: assetModule.endsAt })
                              : `Eindigde: ${formatDate(assetModule.endsAt)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Stap 4</div>
              <h2 className="headline">Upsell-signalen</h2>
              <p className="subtext">
                Deze stap toont nog geen automatische adviezen. Eerst valideren we of de contract- en assetdata klopt.
              </p>
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
              <div className="kpi-title">Contracten</div>
              <div className="big-number">{contracts.length}</div>
            </div>
            <div className="soft-card">
              <div className="kpi-title">Actieve contracten</div>
              <div className="big-number">{activeContractCount}</div>
            </div>
            <div className="soft-card">
              <div className="kpi-title">Inactieve contracten</div>
              <div className="big-number">{inactiveContractCount}</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
