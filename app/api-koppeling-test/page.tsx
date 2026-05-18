"use client";

import { FormEvent, useMemo, useState } from "react";

type RelationResult = { id: string; name: string; email: string | null; debtorNumber: string | number | null };
type ModuleResult = { id: string; name: string; active: boolean; startsAt: string | null; endsAt: string | null };
type AssetResult = { id: string; name: string; description: string | null; serialNumber: string | null; modules: ModuleResult[] };
type DirectRelationResult = Record<string, unknown>;

export default function ApiKoppelingTestPage() {
  const [term, setTerm] = useState("");
  const [relations, setRelations] = useState<RelationResult[]>([]);
  const [relationId, setRelationId] = useState("");
  const [assets, setAssets] = useState<AssetResult[]>([]);
  const [loadingRelations, setLoadingRelations] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [status, setStatus] = useState("");
  const [directRelation, setDirectRelation] = useState<DirectRelationResult | null>(null);
  const [loadingDirectRelation, setLoadingDirectRelation] = useState(false);

  const totals = useMemo(() => {
    const allModules = assets.flatMap((asset) => asset.modules);
    return { assets: assets.length, active: allModules.filter((m) => m.active).length, inactive: allModules.filter((m) => !m.active).length };
  }, [assets]);

  const searchRelations = async (event: FormEvent) => {
    event.preventDefault();
    setLoadingRelations(true);
    setStatus("");
    try {
      const response = await fetch(`/api/smart-trade/relations/search?query=${encodeURIComponent(term)}`, { cache: "no-store" });
      const json = (await response.json()) as { relations?: RelationResult[]; error?: string };
      if (!response.ok) throw new Error(json.error ?? "Relaties zoeken mislukt.");
      setRelations(json.relations ?? []);
      setRelationId("");
      setAssets([]);
      setStatus(`Kies een debiteur uit ${json.relations?.length ?? 0} resultaat/resultaten.`);
    } catch (error) {
      setRelations([]);
      setStatus(error instanceof Error ? error.message : "Relaties zoeken mislukt.");
    } finally { setLoadingRelations(false); }
  };

  const loadDirectRelation = async () => {
    setLoadingDirectRelation(true);
    setStatus("");
    try {
      const response = await fetch("/api/smart-trade/relations/2425", { cache: "no-store" });
      const json = (await response.json()) as { relation?: DirectRelationResult; error?: string };
      if (!response.ok) throw new Error(json.error ?? "Directe relation-call mislukt.");
      setDirectRelation(json.relation ?? null);
      setStatus("Directe API call voor relation 2425 geslaagd.");
    } catch (error) {
      setDirectRelation(null);
      setStatus(error instanceof Error ? error.message : "Directe relation-call mislukt.");
    } finally {
      setLoadingDirectRelation(false);
    }
  };

  const loadAssets = async () => {
    if (!relationId) return;
    setLoadingAssets(true);
    setStatus("");
    try {
      const response = await fetch(`/api/smart-trade/assets/by-relation?relationId=${encodeURIComponent(relationId)}`, { cache: "no-store" });
      const json = (await response.json()) as { assets?: AssetResult[]; error?: string };
      if (!response.ok) throw new Error(json.error ?? "Assets ophalen mislukt.");
      setAssets(json.assets ?? []);
      setStatus("Assets en contractregels geladen.");
    } catch (error) {
      setAssets([]);
      setStatus(error instanceof Error ? error.message : "Assets ophalen mislukt.");
    } finally { setLoadingAssets(false); }
  };

  return <div className="page-shell"><div className="container stack-4"><section className="card panel stack-3"><div><div className="eyebrow">API test</div><h1 className="headline">Troublefree API koppeling testen</h1><p className="subtext">Flow: zoek debiteur → kies relation-id → laad assets → toon actieve modules uit contractAgreements.</p></div><div className="stack-2"><button type="button" className="secondary-button" onClick={loadDirectRelation} disabled={loadingDirectRelation}>{loadingDirectRelation ? "Relation 2425 ophalen..." : "Test directe call: /relations/2425"}</button>{directRelation ? <pre className="muted" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(directRelation, null, 2)}</pre> : null}</div><form onSubmit={searchRelations} className="grid-two" style={{ gap: 12 }}><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Zoek op bedrijfsnaam, e-mail of debiteurnummer" /><button type="submit" className="primary-button" disabled={loadingRelations}>{loadingRelations ? "Zoeken..." : "Debiteur zoeken"}</button></form>{relations.length > 0 ? <div className="stack-2"><label htmlFor="relationId">Relation kiezen</label><select id="relationId" value={relationId} onChange={(e) => setRelationId(e.target.value)}><option value="">Kies relation-id</option>{relations.map((relation) => <option key={relation.id} value={relation.id}>{relation.id} - {relation.name}</option>)}</select><button type="button" className="secondary-button" disabled={!relationId || loadingAssets} onClick={loadAssets}>{loadingAssets ? "Assets laden..." : "Assets + modules ophalen"}</button></div> : null}{status ? <div className="save-status">{status}</div> : null}</section><section className="card panel stack-3"><div className="top-row"><h2 className="headline">Resultaat</h2><div className="subtext">Assets: {totals.assets} · Actieve modules: {totals.active} · Inactieve modules: {totals.inactive}</div></div>{assets.length === 0 ? <div className="save-status">Nog geen assets geladen.</div> : null}<div className="deal-list">{assets.map((asset) => <article key={asset.id} className="deal-row" style={{ alignItems: "flex-start", flexDirection: "column" }}><div><strong>{asset.name}</strong> <span className="muted">(#{asset.id})</span></div>{asset.modules.length === 0 ? <div className="muted">Geen contractAgreements gevonden.</div> : null}{asset.modules.map((module) => <div key={module.id} className="muted small-gap">{module.active ? "🟢" : "⚪"} {module.name} · start: {module.startsAt ?? "-"} · einde: {module.endsAt ?? "-"}</div>)}</article>)}</div></section></div></div>;
}
