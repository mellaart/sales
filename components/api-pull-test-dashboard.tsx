"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Copy, Download, FileJson, Search, Server, Table2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { StatusPill } from "@/components/ui";

type ApiEndpoint = {
  method: "GET";
  path: string;
  tag: string;
  summary: string;
  pathParams: string[];
};

type SpecResponse = {
  basePath: string;
  endpoints: ApiEndpoint[];
};

type PullResult = {
  ok?: boolean;
  status?: number;
  statusText?: string;
  url?: string;
  durationMs?: number;
  contentType?: string;
  byteLength?: number;
  headers?: Record<string, string>;
  body?: unknown;
  bodyText?: string;
  error?: string;
};

const twoColumn: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(280px, 340px) minmax(0, 1fr)",
  gap: 24,
  alignItems: "start",
};

const routeList: CSSProperties = {
  display: "grid",
  gap: 8,
  maxHeight: 520,
  overflow: "auto",
  paddingRight: 4,
};

const routeButton: CSSProperties = {
  width: "100%",
  minHeight: 68,
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(148, 163, 184, 0.16)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  cursor: "pointer",
  textAlign: "left",
};

const activeRouteButton: CSSProperties = {
  borderColor: "rgba(96,165,250,0.65)",
  background: "rgba(37,99,235,0.2)",
};

const fieldGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const tabs: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  justifyContent: "flex-end",
};

function defaultQuery(endpoint?: ApiEndpoint | null) {
  if (!endpoint) return "";
  if (["/articles", "/relations", "/assets", "/orders", "/offers"].includes(endpoint.path)) {
    return "page=1&per_page=25";
  }
  return "";
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function flattenObject(value: unknown, prefix = "", output: Record<string, unknown> = {}, depth = 0) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    output[prefix || "value"] = value;
    return output;
  }

  Object.entries(value).forEach(([key, nested]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (nested && typeof nested === "object" && !Array.isArray(nested) && depth < 1) {
      flattenObject(nested, nextKey, output, depth + 1);
      return;
    }

    output[nextKey] = nested;
  });

  return output;
}

function responseRows(result: PullResult | null) {
  const body = result?.body;

  if (Array.isArray(body)) return body;

  if (body && typeof body === "object" && "data" in body) {
    const data = (body as { data?: unknown }).data;
    return Array.isArray(data) ? data : [];
  }

  return [];
}

function collectColumns(rows: Record<string, unknown>[]) {
  const columns: string[] = [];
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!columns.includes(key)) columns.push(key);
    });
  });
  return columns;
}

function csvCell(value: unknown) {
  return `"${formatValue(value).replace(/"/g, '""')}"`;
}

function fileSlug(path: string) {
  return path.replace(/[{}]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function downloadBlob(content: string, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ResponseTable({ result }: { result: PullResult | null }) {
  const rows = responseRows(result);

  if (result?.error) return <div className="empty-state">{result.error}</div>;
  if (rows.length === 0) return <div className="empty-state">Geen tabeldata in deze response.</div>;

  const flattenedRows = rows.slice(0, 100).map((row) => flattenObject(row));
  const columns = collectColumns(flattenedRows).slice(0, 12);

  return (
    <div className="table-card">
      <div className="table-scroll" style={{ maxHeight: 520 }}>
        <table style={{ minWidth: 760 }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flattenedRows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column} style={{ maxWidth: 360, overflowWrap: "anywhere" }}>
                    {formatValue(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ApiPullTestDashboard() {
  const { user, loading } = useAuth();
  const [basePath, setBasePath] = useState("/v3/api");
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [queryString, setQueryString] = useState("");
  const [ifModifiedSince, setIfModifiedSince] = useState("");
  const [ifNoneMatch, setIfNoneMatch] = useState("");
  const [result, setResult] = useState<PullResult | null>(null);
  const [status, setStatus] = useState("Swagger laden...");
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"table" | "json" | "headers">("table");

  useEffect(() => {
    let active = true;

    async function loadSpec() {
      try {
        const response = await fetch("/api/smart-trade/pull-test/spec", { cache: "no-store" });
        const json = (await response.json()) as SpecResponse;

        if (!response.ok) throw new Error("Swagger laden mislukt.");
        if (!active) return;

        const firstEndpoint = json.endpoints.find((endpoint) => endpoint.path === "/articles") ?? json.endpoints[0] ?? null;
        setBasePath(json.basePath);
        setEndpoints(json.endpoints);
        setSelectedEndpoint(firstEndpoint);
        setPathValues(Object.fromEntries((firstEndpoint?.pathParams ?? []).map((name) => [name, ""])));
        setQueryString(defaultQuery(firstEndpoint));
        setStatus(`${json.endpoints.length} GET routes geladen.`);
      } catch (error) {
        if (!active) return;
        setStatus(error instanceof Error ? error.message : "Swagger laden mislukt.");
      }
    }

    void loadSpec();

    return () => {
      active = false;
    };
  }, []);

  const tags = useMemo(() => [...new Set(endpoints.map((endpoint) => endpoint.tag).sort())], [endpoints]);

  const filteredEndpoints = useMemo(() => {
    const term = search.trim().toLowerCase();
    return endpoints.filter((endpoint) => {
      const text = `${endpoint.path} ${endpoint.summary} ${endpoint.tag}`.toLowerCase();
      return (!tag || endpoint.tag === tag) && (!term || text.includes(term));
    });
  }, [endpoints, search, tag]);

  const rowCount = responseRows(result).length;

  function selectEndpoint(endpoint: ApiEndpoint) {
    setSelectedEndpoint(endpoint);
    setPathValues(Object.fromEntries(endpoint.pathParams.map((name) => [name, ""])));
    setQueryString(defaultQuery(endpoint));
    setResult(null);
    setStatus("Nog geen pull uitgevoerd.");
  }

  async function handlePull(event: FormEvent) {
    event.preventDefault();
    if (!selectedEndpoint) return;

    setBusy(true);
    setResult(null);
    setStatus("Pull loopt...");

    try {
      const response = await fetch("/api/smart-trade/pull-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pathTemplate: selectedEndpoint.path,
          pathParams: pathValues,
          queryString,
          ifModifiedSince,
          ifNoneMatch,
        }),
      });
      const json = (await response.json()) as PullResult;

      setResult(json);

      if (!response.ok || json.error) {
        setStatus(json.error ?? "Pull mislukt.");
        return;
      }

      setStatus(`${json.status} ${json.statusText ?? ""} in ${json.durationMs ?? 0} ms`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pull mislukt.";
      setResult({ error: message });
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl() {
    if (!result?.url) return;
    await navigator.clipboard.writeText(result.url);
    setStatus("URL gekopieerd.");
  }

  function downloadJson() {
    if (!result || !selectedEndpoint) return;
    downloadBlob(JSON.stringify(result.body ?? result.bodyText ?? result, null, 2), "application/json", `${fileSlug(selectedEndpoint.path)}-response.json`);
  }

  function downloadCsv() {
    if (!selectedEndpoint) return;

    const rows = responseRows(result);
    const flattenedRows = rows.map((row) => flattenObject(row));
    const columns = collectColumns(flattenedRows);
    if (columns.length === 0) return;

    const csv = [
      columns.map(csvCell).join(","),
      ...flattenedRows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
    ].join("\n");

    downloadBlob(csv, "text/csv", `${fileSlug(selectedEndpoint.path)}-response.csv`);
  }

  if (loading) {
    return (
      <div className="page-shell">
        <div className="container"><div className="save-status">Authenticatie wordt geladen...</div></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page-shell">
        <div className="container stack-4">
          <section className="brand-hero card">
            <div>
              <div className="brand-mark">Testen</div>
              <h1>Inloggen</h1>
              <p>Log in om de API test te openen.</p>
            </div>
          </section>
          <Link href="/login" className="primary-button">Naar login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="container stack-4">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Testen</div>
            <h1>Retail API pull test</h1>
            <p>Basispad {basePath}. Pullen gebeurt server-side met de live environment variables.</p>
          </div>
          <div className="brand-actions">
            <StatusPill tone="success">{endpoints.length} GET routes</StatusPill>
            <StatusPill tone="warning">{rowCount} records</StatusPill>
          </div>
        </header>

        <div style={twoColumn}>
          <aside className="card panel" style={{ position: "sticky", top: 92 }}>
            <div className="input-wrap" style={{ marginBottom: 12 }}>
              <span className="input-label">Zoeken</span>
              <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="articles, orders, relations" />
            </div>
            <div className="input-wrap" style={{ marginBottom: 18 }}>
              <span className="input-label">Groep</span>
              <select className="input" value={tag} onChange={(event) => setTag(event.target.value)}>
                <option value="">Alle groepen</option>
                {tags.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div className="kpi-title" style={{ marginBottom: 10 }}>{filteredEndpoints.length} routes</div>
            <div style={routeList}>
              {filteredEndpoints.map((endpoint) => (
                <button
                  key={endpoint.path}
                  type="button"
                  style={{ ...routeButton, ...(selectedEndpoint?.path === endpoint.path ? activeRouteButton : {}) }}
                  onClick={() => selectEndpoint(endpoint)}
                >
                  <strong style={{ display: "block", color: "#dbeafe", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{endpoint.path}</strong>
                  <span style={{ display: "block", color: "#94a3b8", fontSize: 12, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{endpoint.summary}</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="stack-4" style={{ minWidth: 0 }}>
            <form className="card panel" onSubmit={handlePull}>
              <div className="top-row">
                <div>
                  <div className="eyebrow">GET</div>
                  <h2 className="headline">{selectedEndpoint?.path ?? "Geen route geselecteerd"}</h2>
                  <p className="subtext">{selectedEndpoint?.summary ?? ""}</p>
                </div>
                <div className="icon-badge"><Server size={26} /></div>
              </div>

              {selectedEndpoint?.pathParams.length ? (
                <div style={{ ...fieldGrid, marginBottom: 16 }}>
                  {selectedEndpoint.pathParams.map((name) => (
                    <label key={name} className="input-wrap">
                      <span className="input-label">{name}</span>
                      <input className="input" value={pathValues[name] ?? ""} onChange={(event) => setPathValues((current) => ({ ...current, [name]: event.target.value }))} required />
                    </label>
                  ))}
                </div>
              ) : null}

              <div style={fieldGrid}>
                <label className="input-wrap">
                  <span className="input-label">Querystring</span>
                  <input className="input" value={queryString} onChange={(event) => setQueryString(event.target.value)} placeholder="page=1&per_page=25&include=contactAddress" />
                </label>
                <label className="input-wrap">
                  <span className="input-label">If-Modified-Since</span>
                  <input className="input" value={ifModifiedSince} onChange={(event) => setIfModifiedSince(event.target.value)} />
                </label>
                <label className="input-wrap">
                  <span className="input-label">If-None-Match</span>
                  <input className="input" value={ifNoneMatch} onChange={(event) => setIfNoneMatch(event.target.value)} />
                </label>
              </div>

              <div className="button-row" style={{ marginTop: 18 }}>
                <button type="submit" className="primary-button" disabled={busy || !selectedEndpoint}><Search size={16} />{busy ? "Pullen..." : "Pull"}</button>
                <button type="button" className="secondary-button" onClick={() => void copyUrl()} disabled={!result?.url}><Copy size={16} />URL</button>
                <button type="button" className="secondary-button" onClick={downloadJson} disabled={!result}><FileJson size={16} />JSON</button>
                <button type="button" className="secondary-button" onClick={downloadCsv} disabled={rowCount === 0}><Download size={16} />CSV</button>
              </div>
            </form>

            <section className="card panel">
              <div className="top-row">
                <div>
                  <div className="eyebrow">Response</div>
                  <h2 className="headline">{result?.status ? `${result.status} ${result.statusText ?? ""}` : "Nog geen data"}</h2>
                  <p className="subtext">{status}</p>
                </div>
                <div style={tabs}>
                  <button type="button" className={`secondary-button ${activeTab === "table" ? "active" : ""}`} onClick={() => setActiveTab("table")}><Table2 size={16} />Tabel</button>
                  <button type="button" className={`secondary-button ${activeTab === "json" ? "active" : ""}`} onClick={() => setActiveTab("json")}>JSON</button>
                  <button type="button" className={`secondary-button ${activeTab === "headers" ? "active" : ""}`} onClick={() => setActiveTab("headers")}>Headers</button>
                </div>
              </div>

              {activeTab === "table" ? <ResponseTable result={result} /> : null}
              {activeTab === "json" ? <pre style={{ whiteSpace: "pre-wrap", overflow: "auto", maxHeight: 520 }}>{JSON.stringify(result?.body ?? result?.bodyText ?? result ?? null, null, 2)}</pre> : null}
              {activeTab === "headers" ? <pre style={{ whiteSpace: "pre-wrap", overflow: "auto", maxHeight: 520 }}>{JSON.stringify(result?.headers ?? {}, null, 2)}</pre> : null}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
