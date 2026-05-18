"use client";

import { FormEvent, useState } from "react";

type RelationResult = { id: string; name: string; email: string | null; debtorNumber: string | number | null };

const BASE_URL = "https://my.troublefree.nl/v3/api/";

export default function TestenPage() {
  const [search, setSearch] = useState("");
  const [relations, setRelations] = useState<RelationResult[]>([]);
  const [selectedRelationId, setSelectedRelationId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const onSearch = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setStatus("");

    try {
      const response = await fetch(`/api/smart-trade/relations/search?query=${encodeURIComponent(search)}`, { cache: "no-store" });
      const json = (await response.json()) as { relations?: RelationResult[]; error?: string };
      if (!response.ok) throw new Error(json.error ?? "Relaties ophalen mislukt.");

      const items = json.relations ?? [];
      setRelations(items);
      setSelectedRelationId("");
      setStatus(`Top ${Math.min(items.length, 10)} resultaat/resultaten getoond. Kies een relation-id.`);
    } catch (error) {
      setRelations([]);
      setSelectedRelationId("");
      setStatus(error instanceof Error ? error.message : "Zoeken mislukt.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="container stack-4">
        <section className="card panel stack-3">
          <div>
            <div className="eyebrow">Testen</div>
            <h1 className="headline">API koppeling testpagina</h1>
            <p className="subtext">Gebruik deze pagina om de chatbot-flow voor debiteurselectie te testen.</p>
          </div>

          <div className="stack-2">
            <h2 className="headline" style={{ fontSize: 20 }}>Belangrijkste API-endpoints</h2>
            <div className="save-status">Base URL: {BASE_URL}</div>
            <ul>
              <li><code>GET /api/relations</code> (lijst / zoeken)</li>
              <li><code>GET /api/relations/{"{relation}"}</code> (details)</li>
              <li>Routes in Troublefree codebase: <code>/v3/routes/api/Relations.php</code></li>
            </ul>
          </div>

          <div className="stack-2">
            <h2 className="headline" style={{ fontSize: 20 }}>Chatbot flow (instructie)</h2>
            <ol className="stack-2">
              <li>
                <strong>Stap A — Authenticatie &amp; headers</strong>
                <div className="muted">Verstuur bij elke API-call deze headers:</div>
                <ul>
                  <li><code>Authorization: Bearer &lt;token&gt;</code> (of Basic Auth afhankelijk van setup)</li>
                  <li><code>Company: &lt;company_key&gt;</code></li>
                </ul>
              </li>
              <li>
                <strong>Stap B — Debiteur laten kiezen</strong>
                <div className="muted">Vraag op bedrijfsnaam/e-mail/debiteurnummer en zoek met:</div>
                <ul>
                  <li><code>GET /api/relations?search=&lt;term&gt;</code></li>
                  <li>Of via QueryBuilder-filters (bijv. <code>company[partial]</code>)</li>
                </ul>
                <div className="muted">Toon top N resultaten met <code>id</code> + <code>company</code> en laat gebruiker een relation-id kiezen.</div>
              </li>
            </ol>
          </div>

          <form onSubmit={onSearch} className="grid-two" style={{ gap: 12 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek op bedrijfsnaam, e-mail of debiteurnummer"
            />
            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? "Zoeken..." : "Debiteur zoeken"}
            </button>
          </form>

          {relations.length > 0 ? (
            <div className="stack-2">
              <label htmlFor="relation">Kies relation-id</label>
              <select id="relation" value={selectedRelationId} onChange={(e) => setSelectedRelationId(e.target.value)}>
                <option value="">Kies relation-id</option>
                {relations.slice(0, 10).map((relation) => (
                  <option key={relation.id} value={relation.id}>
                    {relation.id} - {relation.name}
                  </option>
                ))}
              </select>
              {selectedRelationId ? <div className="save-status">Gekozen relation-id: {selectedRelationId}</div> : null}
            </div>
          ) : null}

          {status ? <div className="save-status">{status}</div> : null}
        </section>
      </div>
    </div>
  );
}
