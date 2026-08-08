"use client";

import { useRef, useState, type DragEvent } from "react";
import {
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  LoaderCircle,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  IMPLEMENTATION_FILE_CATEGORY_DEFINITIONS,
  type ImplementationCustomerFile,
  type ImplementationFileCategory,
} from "@/lib/implementation-files";
import styles from "./implementation-progress.module.css";

const dateFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
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

export default function ImplementationFileDelivery({
  accessId,
  tokenVersion,
  token,
  initialFiles,
}: {
  accessId: string;
  tokenVersion: number;
  token: string;
  initialFiles: ImplementationCustomerFile[];
}) {
  const [files, setFiles] = useState(initialFiles);
  const [busyCategory, setBusyCategory] = useState<ImplementationFileCategory | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dragCategory, setDragCategory] = useState<ImplementationFileCategory | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ImplementationFileCategory, string>>>({});
  const inputRefs = useRef<Partial<Record<ImplementationFileCategory, HTMLInputElement | null>>>({});
  const completedCategories = IMPLEMENTATION_FILE_CATEGORY_DEFINITIONS.filter((definition) => (
    files.some((file) => file.category === definition.key)
  )).length;

  function requestUrl(path = "") {
    const searchParams = new URLSearchParams({
      v: String(tokenVersion),
      token,
    });
    return `/api/implementation-portals/${encodeURIComponent(accessId)}/files${path}?${searchParams}`;
  }

  async function uploadFiles(category: ImplementationFileCategory, selectedFiles: File[]) {
    if (selectedFiles.length === 0 || busyCategory) return;
    setBusyCategory(category);
    setErrors((current) => ({ ...current, [category]: "" }));
    try {
      for (const selectedFile of selectedFiles) {
        const formData = new FormData();
        formData.set("category", category);
        formData.set("file", selectedFile);
        const response = await fetch(requestUrl(), { method: "POST", body: formData });
        const json = await response.json().catch(() => ({})) as {
          file?: ImplementationCustomerFile;
          error?: string;
        };
        if (!response.ok || !json.file) {
          throw new Error(json.error || `${selectedFile.name} uploaden mislukt.`);
        }
        setFiles((current) => [json.file!, ...current]);
      }
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [category]: error instanceof Error ? error.message : "Bestand uploaden mislukt.",
      }));
    } finally {
      setBusyCategory(null);
      const input = inputRefs.current[category];
      if (input) input.value = "";
    }
  }

  async function removeFile(file: ImplementationCustomerFile) {
    if (deletingId || !window.confirm(`Wilt u "${file.fileName}" verwijderen?`)) return;
    setDeletingId(file.id);
    setErrors((current) => ({ ...current, [file.category]: "" }));
    try {
      const response = await fetch(requestUrl(`/${encodeURIComponent(file.id)}`), {
        method: "DELETE",
      });
      const json = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(json.error || "Bestand verwijderen mislukt.");
      setFiles((current) => current.filter((candidate) => candidate.id !== file.id));
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [file.category]: error instanceof Error ? error.message : "Bestand verwijderen mislukt.",
      }));
    } finally {
      setDeletingId(null);
    }
  }

  function droppedFiles(
    event: DragEvent<HTMLDivElement>,
    category: ImplementationFileCategory,
  ) {
    event.preventDefault();
    setDragCategory(null);
    void uploadFiles(category, Array.from(event.dataTransfer.files));
  }

  return (
    <section className={`${styles.section} ${styles.fileDeliverySection}`}>
      <div className={styles.content}>
        <div className={styles.sectionHeading}>
          <div><span>Aanlevering</span><h2>Bestanden aanleveren</h2></div>
          <p>{completedCategories} van 3 onderdelen aangeleverd</p>
        </div>

        <div className={styles.fileDeliveryProgress}>
          <div
            role="progressbar"
            aria-label="Voortgang bestanden aanleveren"
            aria-valuemin={0}
            aria-valuemax={3}
            aria-valuenow={completedCategories}
          >
            <span style={{ width: `${(completedCategories / 3) * 100}%` }} />
          </div>
          <span>U kunt meerdere bestanden per onderdeel toevoegen.</span>
        </div>

        <div className={styles.fileDeliveryList}>
          {IMPLEMENTATION_FILE_CATEGORY_DEFINITIONS.map((definition) => {
            const categoryFiles = files.filter((file) => file.category === definition.key);
            const busy = busyCategory === definition.key;
            const dragging = dragCategory === definition.key;

            return (
              <section key={definition.key} className={styles.fileDeliveryCategory}>
                <header>
                  <div>
                    <span className={styles.fileDeliveryCategoryIcon}>
                      {categoryFiles.length > 0
                        ? <CheckCircle2 size={21} aria-hidden="true" />
                        : <UploadCloud size={21} aria-hidden="true" />}
                    </span>
                    <div>
                      <h3>{definition.label}</h3>
                      <p>{definition.description}</p>
                    </div>
                  </div>
                  <span className={categoryFiles.length > 0 ? styles.fileCategoryComplete : ""}>
                    {categoryFiles.length > 0
                      ? `${categoryFiles.length} ontvangen`
                      : "Nog aan te leveren"}
                  </span>
                </header>

                <div
                  className={`${styles.fileDropZone} ${dragging ? styles.fileDropZoneActive : ""}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragCategory(definition.key);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setDragCategory(null);
                    }
                  }}
                  onDrop={(event) => droppedFiles(event, definition.key)}
                >
                  <UploadCloud size={25} aria-hidden="true" />
                  <div>
                    <strong>{busy ? "Bestanden worden toegevoegd..." : "Sleep bestanden hierheen"}</strong>
                    <span>{definition.acceptedLabel} · maximaal 25 MB per bestand</span>
                  </div>
                  <input
                    ref={(element) => { inputRefs.current[definition.key] = element; }}
                    className={styles.fileInput}
                    type="file"
                    accept={definition.accept}
                    multiple
                    disabled={Boolean(busyCategory)}
                    onChange={(event) => void uploadFiles(
                      definition.key,
                      Array.from(event.currentTarget.files ?? []),
                    )}
                  />
                  <button
                    type="button"
                    disabled={Boolean(busyCategory)}
                    onClick={() => inputRefs.current[definition.key]?.click()}
                  >
                    {busy ? <LoaderCircle className={styles.fileSpinner} size={17} /> : <UploadCloud size={17} />}
                    {busy ? "Bezig..." : "Bestanden kiezen"}
                  </button>
                </div>

                {errors[definition.key] ? (
                  <p className={styles.fileError} role="alert">{errors[definition.key]}</p>
                ) : null}

                {categoryFiles.length > 0 ? (
                  <div className={styles.customerFileList}>
                    {categoryFiles.map((file) => (
                      <div key={file.id} className={styles.customerFileRow}>
                        <span className={styles.customerFileIcon}><FileText size={19} /></span>
                        <div className={styles.customerFileName}>
                          <strong>{file.fileName}</strong>
                          <span>{formatFileSize(file.fileSize)} · toegevoegd {formatDate(file.uploadedAt)}</span>
                        </div>
                        <span className={`${styles.customerFileStatus} ${file.status === "checked" ? styles.customerFileChecked : ""}`}>
                          {file.status === "checked" ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}
                          {file.status === "checked" ? "Gecontroleerd" : "Ontvangen"}
                        </span>
                        <div className={styles.customerFileActions}>
                          <a
                            href={requestUrl(`/${encodeURIComponent(file.id)}`)}
                            title="Bestand downloaden"
                            aria-label={`${file.fileName} downloaden`}
                          >
                            <Download size={18} />
                          </a>
                          <button
                            type="button"
                            className={styles.fileDeleteButton}
                            disabled={Boolean(deletingId)}
                            title="Bestand verwijderen"
                            aria-label={`${file.fileName} verwijderen`}
                            onClick={() => void removeFile(file)}
                          >
                            {deletingId === file.id
                              ? <LoaderCircle className={styles.fileSpinner} size={18} />
                              : <Trash2 size={18} />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
