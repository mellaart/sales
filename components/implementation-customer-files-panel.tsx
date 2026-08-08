"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import {
  IMPLEMENTATION_FILE_CATEGORY_DEFINITIONS,
  type ImplementationCustomerFile,
  type ImplementationFileStatus,
} from "@/lib/implementation-files";

const dateFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
}

function formatFileSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toLocaleString("nl-NL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} MB`;
}

export default function ImplementationCustomerFilesPanel({
  implementationId,
  canEdit,
}: {
  implementationId: string;
  canEdit: boolean;
}) {
  const [files, setFiles] = useState<ImplementationCustomerFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/implementations/${encodeURIComponent(implementationId)}/files`,
        { cache: "no-store" },
      );
      const json = await response.json().catch(() => ({})) as {
        files?: ImplementationCustomerFile[];
        error?: string;
      };
      if (!response.ok) throw new Error(json.error || "Bestanden laden mislukt.");
      setFiles(Array.isArray(json.files) ? json.files : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Bestanden laden mislukt.");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [implementationId]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  async function updateStatus(file: ImplementationCustomerFile, status: ImplementationFileStatus) {
    if (!canEdit || updatingId) return;
    setUpdatingId(file.id);
    setError("");
    try {
      const response = await fetch(
        `/api/implementations/${encodeURIComponent(implementationId)}/files`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: file.id, status }),
        },
      );
      const json = await response.json().catch(() => ({})) as {
        file?: ImplementationCustomerFile;
        error?: string;
      };
      if (!response.ok || !json.file) {
        throw new Error(json.error || "Status bijwerken mislukt.");
      }
      setFiles((current) => current.map((candidate) => (
        candidate.id === json.file!.id ? json.file! : candidate
      )));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Status bijwerken mislukt.");
    } finally {
      setUpdatingId(null);
    }
  }

  const deliveredCategories = IMPLEMENTATION_FILE_CATEGORY_DEFINITIONS.filter((definition) => (
    files.some((file) => file.category === definition.key)
  )).length;

  return (
    <section className="card panel implementation-customer-files-panel">
      <div className="top-row implementation-customer-files-heading">
        <div>
          <div className="eyebrow">Klantbestanden</div>
          <h2 className="headline">Bestanden aanleveren</h2>
          <p className="subtext">
            Briefpapier, relatiebestanden en artikelbestanden uit de beveiligde klantpagina.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={loading}
          onClick={() => void loadFiles()}
        >
          {loading
            ? <LoaderCircle className="implementation-dns-spinner" size={17} />
            : <RefreshCw size={17} />}
          Vernieuwen
        </button>
      </div>

      <div className="implementation-customer-files-progress">
        <span><strong>{deliveredCategories}</strong> van 3 onderdelen aangeleverd</span>
        <div aria-hidden="true"><span style={{ width: `${(deliveredCategories / 3) * 100}%` }} /></div>
      </div>

      {!loaded ? (
        <div className="implementation-items-state">
          <LoaderCircle className="implementation-dns-spinner" size={17} /> Bestanden worden geladen...
        </div>
      ) : (
        <div className="implementation-customer-file-groups">
          {IMPLEMENTATION_FILE_CATEGORY_DEFINITIONS.map((definition) => {
            const categoryFiles = files.filter((file) => file.category === definition.key);
            return (
              <section key={definition.key} className="implementation-customer-file-group">
                <header>
                  <div>
                    <FolderOpen size={20} aria-hidden="true" />
                    <strong>{definition.label}</strong>
                  </div>
                  <span>{categoryFiles.length} bestand{categoryFiles.length === 1 ? "" : "en"}</span>
                </header>
                {categoryFiles.length > 0 ? (
                  <div className="implementation-customer-file-list">
                    {categoryFiles.map((file) => (
                      <div key={file.id} className="implementation-customer-file-row">
                        <span className="implementation-customer-file-icon"><FileText size={19} /></span>
                        <div>
                          <strong>{file.fileName}</strong>
                          <span>{formatFileSize(file.fileSize)} · ontvangen {formatDate(file.uploadedAt)}</span>
                        </div>
                        <label className={`implementation-customer-file-check ${file.status === "checked" ? "checked" : ""}`}>
                          <input
                            type="checkbox"
                            checked={file.status === "checked"}
                            disabled={!canEdit || Boolean(updatingId)}
                            onChange={(event) => void updateStatus(
                              file,
                              event.currentTarget.checked ? "checked" : "received",
                            )}
                          />
                          <span aria-hidden="true">
                            {updatingId === file.id
                              ? <LoaderCircle className="implementation-dns-spinner" size={15} />
                              : file.status === "checked"
                                ? <CheckCircle2 size={15} />
                                : <Clock3 size={15} />}
                          </span>
                          {file.status === "checked" ? "Gecontroleerd" : "Ontvangen"}
                        </label>
                        <a
                          className="implementation-customer-file-download"
                          href={`/api/implementations/${encodeURIComponent(implementationId)}/files/${encodeURIComponent(file.id)}`}
                          title="Bestand downloaden"
                          aria-label={`${file.fileName} downloaden`}
                        >
                          <Download size={18} />
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="implementation-customer-file-empty">Nog niets aangeleverd.</div>
                )}
              </section>
            );
          })}
        </div>
      )}
      {error ? <div className="implementation-inline-error">{error}</div> : null}
    </section>
  );
}
