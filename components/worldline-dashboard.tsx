"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { AlertTriangle, Building2, CheckCircle2, ChevronRight, Copy, Download, FileText, FolderOpen, Hash, Mail, RefreshCw, Search, Send, Trash2, UploadCloud } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { StatusPill } from "@/components/ui";
import {
  ROLE_TAB_ACCESS,
  canAccessTab,
  canWriteTab,
  normalizeRoleTabAccess,
  type RoleTabAccessMap,
} from "@/lib/role-tabs";
import { getSupabaseClient } from "@/lib/supabase";
import { WORLDLINE_MCC_RECORDS } from "@/lib/worldline-mcc-data";
import {
  DEFAULT_WORLDLINE_AGREEMENT_FIELDS,
  WORLDLINE_AGREEMENT_FIELD_DEFINITIONS,
  WORLDLINE_AGREEMENT_TEMPLATE_PATH,
  WORLDLINE_CHECK_STATUS_LABELS,
  WORLDLINE_DOCUMENT_BUCKET,
  WORLDLINE_DOCUMENT_DEFINITIONS,
  WORLDLINE_STATUS_LABELS,
  getWorldlineDocumentDefinition,
  normalizeWorldlineAgreementFields,
  type WorldlineAgreementFieldDefinition,
  type WorldlineAgreementFields,
  type WorldlineCheckResult,
  type WorldlineCheckStatus,
  type WorldlineDocument,
  type WorldlineDocumentType,
  type WorldlineProject,
  type WorldlineProjectStatus,
} from "@/lib/worldline";
import styles from "@/components/assets-dashboard.module.css";

type RelationOption = {
  id: string;
  name: string;
  email: string | null;
  debtorNumber: string | number | null;
};

type RelationSearchResponse = {
  error?: string;
  relations?: RelationOption[];
};

type AgreementSaveOptions = {
  savingMessage?: string;
  savedMessage?: string;
};

type QueuedAgreementSave = {
  projectId: string;
  fields: WorldlineAgreementFields;
  options: AgreementSaveOptions;
};

type SignedUploadResponse = {
  upload?: {
    storagePath: string;
    signedPath: string;
    token: string;
    version: number;
    mimeType: string;
    documentTitle: string;
    kvkNumber?: string;
  };
  error?: string;
};

const WORLDLINE_REQUEST_TIMEOUT_MS = 30000;
const AGREEMENT_AUTOSAVE_DELAY_MS = 500;
const ONGOING_WORLDLINE_STATUSES: WorldlineProjectStatus[] = ["concept", "waiting_customer", "checking"];
const WORLDLINE_KVK_ANALYSIS_VERSION = 7;
const OCR_DOCUMENT_TYPES: WorldlineDocumentType[] = ["kvk", "agreement", "identity", "bank_statement", "refund"];
const PDF_OCR_MAX_PAGES = 6;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function withWorldlineTimeout<T>(request: PromiseLike<T>, action: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${action} duurt te lang. Vernieuw de pagina en probeer het opnieuw.`));
    }, WORLDLINE_REQUEST_TIMEOUT_MS);

    Promise.resolve(request)
      .then((result) => {
        window.clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function allowUiToPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
}

type BrowserOcrOptions = {
  documentType?: WorldlineDocumentType;
};

type OcrImageRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  threshold?: boolean;
  targetLongestSide?: number;
};

function isImageUploadFile(file: File) {
  return file.type === "image/jpeg" || file.type === "image/png" || /\.(jpe?g|png)$/i.test(file.name);
}

function normalizeBrowserOcrText(value: unknown) {
  return typeof value === "string" ? value.replace(/\r/g, "\n").replace(/[ \t]+\n/g, "\n").trim() : "";
}

async function loadImageForOcr(file: File) {
  const url = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = "async";

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Afbeelding kon niet worden geladen."));
      image.src = url;
    });

    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function createOcrReadyImage(file: File, region?: OcrImageRegion) {
  const image = await loadImageForOcr(file);
  const sourceX = region ? Math.max(0, Math.round(image.naturalWidth * region.x)) : 0;
  const sourceY = region ? Math.max(0, Math.round(image.naturalHeight * region.y)) : 0;
  const sourceWidth = region ? Math.min(image.naturalWidth - sourceX, Math.round(image.naturalWidth * region.width)) : image.naturalWidth;
  const sourceHeight = region ? Math.min(image.naturalHeight - sourceY, Math.round(image.naturalHeight * region.height)) : image.naturalHeight;
  const longestSide = Math.max(sourceWidth, sourceHeight);
  const targetLongestSide = Math.min(region?.targetLongestSide ?? 3200, Math.max(longestSide, 2200));
  const scale = targetLongestSide / longestSide;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Afbeelding kon niet worden voorbereid voor OCR.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const contrast = Math.max(0, Math.min(255, (gray - 128) * (region?.threshold ? 1.65 : 1.18) + 128));
    const value = region?.threshold ? (contrast > 170 ? 255 : 0) : contrast;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Afbeelding kon niet als OCR-beeld worden gemaakt."));
    }, "image/png");
  });
}

async function extractImageTextWithBrowserOcr(file: File, onProgress: (message: string) => void, options: BrowserOcrOptions = {}) {
  const { PSM, createWorker } = await import("tesseract.js");
  const ocrImage = await createOcrReadyImage(file);
  const worker = await createWorker(["nld", "eng"], 1, {
    logger: (message) => {
      if (typeof message.progress !== "number" || !message.status) return;
      const percentage = Math.round(message.progress * 100);
      onProgress(`Gratis OCR leest afbeelding... ${percentage}%`);
    },
  });

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: PSM.AUTO,
      user_defined_dpi: "300",
    });

    const result = await worker.recognize(ocrImage);
    const textParts = [normalizeBrowserOcrText(result.data.text)];

    if (options.documentType === "identity") {
      onProgress("Gratis OCR leest paspoortregels extra...");

      const identityTextImage = await createOcrReadyImage(file, { x: 0, y: 0, width: 1, height: 0.68, targetLongestSide: 4200 });
      await worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        tessedit_char_whitelist: "",
        user_defined_dpi: "300",
      });
      const identityTextResult = await worker.recognize(identityTextImage);
      textParts.push(normalizeBrowserOcrText(identityTextResult.data.text));

      const identityDateImage = await createOcrReadyImage(file, { x: 0, y: 0.22, width: 1, height: 0.56, targetLongestSide: 4200 });
      await worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        tessedit_char_whitelist: "",
        user_defined_dpi: "300",
      });
      const identityDateResult = await worker.recognize(identityDateImage);
      textParts.push(normalizeBrowserOcrText(identityDateResult.data.text));

      const mrzLooseImage = await createOcrReadyImage(file, { x: 0, y: 0.48, width: 1, height: 0.52, targetLongestSide: 4200 });
      await worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
        user_defined_dpi: "300",
      });
      const mrzLooseResult = await worker.recognize(mrzLooseImage);
      textParts.push(normalizeBrowserOcrText(mrzLooseResult.data.text));

      const mrzImage = await createOcrReadyImage(file, { x: 0, y: 0.58, width: 1, height: 0.42, threshold: true, targetLongestSide: 4200 });
      await worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
        user_defined_dpi: "300",
      });
      const mrzResult = await worker.recognize(mrzImage);
      textParts.push(normalizeBrowserOcrText(mrzResult.data.text));
    }

    return {
      confidence: typeof result.data.confidence === "number" ? Math.round(result.data.confidence) : undefined,
      text: normalizeBrowserOcrText(textParts.filter(Boolean).join("\n\n")),
    };
  } finally {
    await worker.terminate();
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PDF-pagina kon niet als OCR-beeld worden gemaakt."));
    }, "image/png");
  });
}

async function extractPdfTextWithBrowserOcr(file: File, onProgress: (message: string) => void, options: BrowserOcrOptions = {}) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc ||= new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isImageDecoderSupported: false,
  });
  const pdf = await loadingTask.promise;
  const textParts: string[] = [];

  try {
    const pageCount = Math.min(pdf.numPages, PDF_OCR_MAX_PAGES);

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      onProgress(`PDF-OCR leest pagina ${pageNumber}/${pageCount}...`);

      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: options.documentType === "identity" ? 4 : 2.4 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("PDF-pagina kon niet worden voorbereid voor OCR.");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvas,
        canvasContext: context,
        viewport,
        background: "#ffffff",
      }).promise;

      const pageBlob = await canvasToPngBlob(canvas);
      const ocrResult = await extractImageTextWithBrowserOcr(
        new File([pageBlob], `${file.name}-pagina-${pageNumber}.png`, { type: "image/png" }),
        (message) => onProgress(`PDF-OCR pagina ${pageNumber}/${pageCount}: ${message.replace(/^Gratis OCR leest afbeelding\.\.\.\s*/i, "")}`),
        options,
      );

      if (ocrResult.text) textParts.push(ocrResult.text);
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await pdf.destroy();
  }

  return normalizeBrowserOcrText(textParts.join("\n\n"));
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function getCheckTone(status: WorldlineCheckStatus): "success" | "warning" | "danger" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

function getProjectTone(status: WorldlineProjectStatus): "success" | "warning" | "danger" {
  if (status === "complete" || status === "submitted") return "success";
  if (status === "checking") return "warning";
  return "warning";
}

function isOngoingWorldlineProject(project: WorldlineProject) {
  return ONGOING_WORLDLINE_STATUSES.includes(project.status);
}

function getRelationFromProject(project: WorldlineProject): RelationOption {
  return {
    id: project.relation_id,
    name: project.relation_name,
    email: project.relation_email ?? null,
    debtorNumber: project.debtor_number ?? null,
  };
}

function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeKvkNumber(value?: string | null) {
  return (value ?? "").replace(/\D/g, "").slice(0, 8);
}

function extractKvkNumberFromText(value?: string | null) {
  const match = (value ?? "").match(/\b(\d{8})\b/);
  return normalizeKvkNumber(match?.[1]);
}

function getDocumentKvkNumber(document: WorldlineDocument) {
  const checkResult = document.check_result && typeof document.check_result === "object"
    ? (document.check_result as WorldlineCheckResult)
    : {};

  return normalizeKvkNumber(checkResult.kvkNumber) || extractKvkNumberFromText(document.file_name);
}

function getDocumentTitleFromFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop() ?? fileName;
  const title = baseName.replace(/\.[^.]+$/, "").replace(/\s+/g, " ").trim();
  return title || baseName || "Document";
}

function getDocumentTitle(document: WorldlineDocument) {
  const checkResult = document.check_result && typeof document.check_result === "object"
    ? (document.check_result as WorldlineCheckResult)
    : {};

  return typeof checkResult.documentTitle === "string" && checkResult.documentTitle.trim()
    ? checkResult.documentTitle.trim()
    : getDocumentTitleFromFileName(document.file_name);
}

function isImageDocument(document: WorldlineDocument) {
  const checkResult = document.check_result && typeof document.check_result === "object"
    ? (document.check_result as WorldlineCheckResult)
    : {};
  const mimeType = (document.mime_type ?? "").toLowerCase();

  return (
    checkResult.uploadedAsImage === true ||
    checkResult.convertedFromImage === true ||
    mimeType.startsWith("image/") ||
    /\.(jpe?g|png)$/i.test(document.file_name)
  );
}

function isPdfDocument(document: WorldlineDocument) {
  const mimeType = (document.mime_type ?? "").toLowerCase();
  return mimeType === "application/pdf" || /\.pdf$/i.test(document.file_name);
}

function getDocumentStoredOcrText(document: WorldlineDocument) {
  const checkResult = document.check_result && typeof document.check_result === "object"
    ? (document.check_result as WorldlineCheckResult)
    : {};

  return normalizeBrowserOcrText(checkResult.ocrText);
}

function identityExpiryNeedsOcr(document: WorldlineDocument) {
  if (document.document_type !== "identity") return false;

  const checkResult = getCheckResult(document, "identity");
  const identityCheck = checkResult.checklist?.[0];
  const checkText = typeof identityCheck?.text === "string" ? identityCheck.text : "";

  return (
    identityCheck?.done !== true &&
    /geldigheidsdatum\s+niet\s+duidelijk\s+herkend/i.test(checkText)
  );
}

function getDocumentTitleKey(value: string) {
  return sanitizeFileName(value) || "document";
}

function getLatestDocumentsByTitle(documents: WorldlineDocument[], documentType: WorldlineDocumentType) {
  const groups = new Map<string, WorldlineDocument[]>();

  documents
    .filter((document) => document.document_type === documentType)
    .forEach((document) => {
      const titleKey = getDocumentTitleKey(getDocumentTitle(document));
      const currentDocuments = groups.get(titleKey) ?? [];
      currentDocuments.push(document);
      groups.set(titleKey, currentDocuments);
    });

  return Array.from(groups.values())
    .map((groupDocuments) => (
      [...groupDocuments].sort((a, b) => b.version - a.version || String(b.uploaded_at ?? "").localeCompare(String(a.uploaded_at ?? "")))[0]
    ))
    .sort((a, b) => String(b.uploaded_at ?? "").localeCompare(String(a.uploaded_at ?? "")));
}

function getLatestKvkDocuments(documents: WorldlineDocument[]) {
  const groups = new Map<string, WorldlineDocument[]>();

  documents
    .filter((document) => document.document_type === "kvk")
    .forEach((document) => {
      const kvkNumber = getDocumentKvkNumber(document);
      const groupKey = kvkNumber || `unknown-${document.id}`;
      const currentDocuments = groups.get(groupKey) ?? [];
      currentDocuments.push(document);
      groups.set(groupKey, currentDocuments);
    });

  return Array.from(groups.values())
    .map((groupDocuments) => (
      [...groupDocuments].sort((a, b) => b.version - a.version || String(b.uploaded_at ?? "").localeCompare(String(a.uploaded_at ?? "")))[0]
    ))
    .sort((a, b) => String(b.uploaded_at ?? "").localeCompare(String(a.uploaded_at ?? "")));
}

function createInitialCheckResult(documentType: WorldlineDocumentType): WorldlineCheckResult {
  const definition = getWorldlineDocumentDefinition(documentType);

  return {
    checklist: (definition?.checklist ?? []).map((text) => ({ text, done: false })),
    note: "",
  };
}

function getCheckResult(document: WorldlineDocument | null, documentType: WorldlineDocumentType): WorldlineCheckResult {
  if (!document?.check_result || typeof document.check_result !== "object") {
    return createInitialCheckResult(documentType);
  }

  const source = document.check_result as WorldlineCheckResult;
  const fallback = createInitialCheckResult(documentType);

  return {
    analysisVersion: typeof source.analysisVersion === "number" ? source.analysisVersion : undefined,
    bankName: typeof source.bankName === "string" ? source.bankName : undefined,
    checkedAt: typeof source.checkedAt === "string" ? source.checkedAt : undefined,
    checklist: Array.isArray(source.checklist) ? source.checklist : fallback.checklist,
    convertedFromImage: source.convertedFromImage === true,
    documentTitle: typeof source.documentTitle === "string" ? source.documentTitle : undefined,
    iban: typeof source.iban === "string" ? source.iban : undefined,
    note: typeof source.note === "string" ? source.note : "",
    ocrConfidence: typeof source.ocrConfidence === "number" ? source.ocrConfidence : undefined,
    ocrEngine: typeof source.ocrEngine === "string" ? source.ocrEngine : undefined,
    ocrError: typeof source.ocrError === "string" ? source.ocrError : undefined,
    ocrText: typeof source.ocrText === "string" ? source.ocrText : undefined,
    kvkNumber: typeof source.kvkNumber === "string" ? source.kvkNumber : undefined,
    originalFileName: typeof source.originalFileName === "string" ? source.originalFileName : undefined,
    originalMimeType: typeof source.originalMimeType === "string" ? source.originalMimeType : undefined,
    producedDate: typeof source.producedDate === "string" ? source.producedDate : undefined,
    statementDate: typeof source.statementDate === "string" ? source.statementDate : undefined,
    uploadedAsImage: source.uploadedAsImage === true,
    authorizedSigners: Array.isArray(source.authorizedSigners) ? source.authorizedSigners : undefined,
    legalShareholders: Array.isArray(source.legalShareholders) ? source.legalShareholders : undefined,
  };
}

function getAggregateCheckStatus(documents: WorldlineDocument[]): WorldlineCheckStatus {
  if (!documents.length) return "missing";
  if (documents.some((document) => document.check_status === "rejected")) return "rejected";
  if (documents.some((document) => document.check_status === "checking")) return "checking";
  if (documents.every((document) => document.check_status === "approved")) return "approved";
  return "uploaded";
}

function shouldRefreshKvkCheck(document: WorldlineDocument) {
  if (document.document_type !== "kvk") return false;
  if (isImageDocument(document) && !getDocumentStoredOcrText(document)) return false;

  const checkResult = document.check_result && typeof document.check_result === "object"
    ? (document.check_result as WorldlineCheckResult)
    : {};

  return checkResult.analysisVersion !== WORLDLINE_KVK_ANALYSIS_VERSION;
}

function shouldAutoCheckOcrDocument(document: WorldlineDocument) {
  if (!getDocumentStoredOcrText(document)) return false;
  if (document.check_status === "uploaded") return true;

  const checkResult = document.check_result && typeof document.check_result === "object"
    ? (document.check_result as WorldlineCheckResult)
    : {};

  return typeof checkResult.note === "string" && checkResult.note.startsWith("JPG/PNG is opgeslagen.");
}

function fileSizeLabel(size?: number | null) {
  if (!size) return "-";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} kB`;
  return `${(size / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function getAgreementSections() {
  return WORLDLINE_AGREEMENT_FIELD_DEFINITIONS.reduce((sections, definition) => {
    const currentFields = sections.get(definition.section) ?? [];
    currentFields.push(definition);
    sections.set(definition.section, currentFields);
    return sections;
  }, new Map<string, WorldlineAgreementFieldDefinition[]>());
}

function getAgreementPdfValue(fields: WorldlineAgreementFields, definition: WorldlineAgreementFieldDefinition) {
  const value = (fields[definition.key] ?? definition.defaultValue ?? "").trim();
  if (definition.key === "mcc") {
    return getWorldlineMccRecord(value)?.mcc ?? value;
  }
  if (definition.key === "actSector" && !value) {
    return getWorldlineMccRecord(fields.mcc)?.actSector ?? "";
  }
  if (definition.type === "checkbox") return value === "ja" ? "Ja" : "Nee";
  if (value === "ja") return "Ja";
  if (value === "nee") return "Nee";
  return value;
}

function getAgreementRadioValue(definition: WorldlineAgreementFieldDefinition, value: string) {
  if (definition.key === "contactGender") {
    if (value === "M") return "Keuze1";
    if (value === "V") return "Keuze2";
  }

  return value;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getWorldlineMccRecord(value?: string | null) {
  const normalizedValue = (value ?? "").trim().toLowerCase();
  if (!normalizedValue) return null;

  return (
    WORLDLINE_MCC_RECORDS.find(
      (record) =>
        record.mcc.toLowerCase() === normalizedValue ||
        record.descriptionNl.toLowerCase() === normalizedValue,
    ) ?? null
  );
}

function getWorldlineMccFieldUpdates(value: string): Record<string, string> {
  const normalizedValue = value.trim();
  const selectedRecord = getWorldlineMccRecord(normalizedValue);

  if (!normalizedValue) {
    return { mcc: "", actSector: "" };
  }

  if (selectedRecord) {
    return {
      mcc: selectedRecord.mcc,
      actSector: selectedRecord.actSector,
    };
  }

  return { mcc: normalizedValue };
}

function renderWorldlineMccFieldControl({
  value,
  disabled,
  onChange,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onCommit?: (value: string) => void;
}) {
  const selectedRecord = getWorldlineMccRecord(value);
  const selectValue = selectedRecord?.mcc ?? value.trim();

  return (
    <select
      className="input worldline-field-input"
      value={selectValue}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => onCommit?.(event.target.value)}
    >
      <option value="">-</option>
      {value && !selectedRecord ? (
        <option value={value}>
          {value}
        </option>
      ) : null}
      {WORLDLINE_MCC_RECORDS.map((record) => (
        <option key={record.mcc} value={record.mcc}>
          {record.descriptionNl}
        </option>
      ))}
    </select>
  );
}

function renderCheckResult(checkResult: WorldlineCheckResult) {
  return (
    <>
      {checkResult.note ? <div className="worldline-check-note">{checkResult.note}</div> : null}
      {checkResult.checkedAt ? <div className="worldline-check-note">Laatst gecontroleerd: {formatDate(checkResult.checkedAt)}</div> : null}
      <div className="worldline-checklist">
        {checkResult.checklist?.map((item) => {
          const isDone = item.done === true || item.tone === "success";
          const tone = isDone ? "success" : item.tone ?? "warning";

          return (
            <div key={item.text} className={`worldline-check-item ${tone}`}>
              {isDone ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              <span>{item.text}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

async function downloadAgreementPdf(
  relation: RelationOption,
  project: WorldlineProject,
  fields: WorldlineAgreementFields,
) {
  const [{ PDFCheckBox, PDFDocument, PDFDropdown, PDFRadioGroup, PDFTextField, StandardFonts }, templateResponse] = await Promise.all([
    import("pdf-lib"),
    fetch(WORLDLINE_AGREEMENT_TEMPLATE_PATH),
  ]);

  if (!templateResponse.ok) {
    throw new Error("Worldline PDF-template kon niet worden geladen.");
  }

  const pdfDoc = await PDFDocument.load(await templateResponse.arrayBuffer());
  pdfDoc.setTitle(`Worldline aansluitovereenkomst ${relation.name}`);
  pdfDoc.setSubject(`Worldline project ${project.id}`);
  const form = pdfDoc.getForm();

  function fillPdfField(definition: WorldlineAgreementFieldDefinition, fieldName: string, value: string) {
    const field = form.getField(fieldName);

    if (field instanceof PDFCheckBox) {
      if (value === "Ja") {
        field.check();
      } else {
        field.uncheck();
      }
      return;
    }

    if (field instanceof PDFRadioGroup) {
      const radioValue = getAgreementRadioValue(definition, fields[definition.key] ?? "");
      if (radioValue) field.select(radioValue);
      return;
    }

    if (field instanceof PDFDropdown) {
      if (value) field.select(value);
      return;
    }

    if (field instanceof PDFTextField) {
      field.setText(value);
    }
  }

  WORLDLINE_AGREEMENT_FIELD_DEFINITIONS.forEach((definition) => {
    const value = getAgreementPdfValue(fields, definition);
    const pdfFieldNames = [definition.pdfField, ...(definition.pdfFieldAliases ?? [])];
    let filledField = false;
    let lastError: unknown = null;

    for (const pdfFieldName of pdfFieldNames) {
      try {
        fillPdfField(definition, pdfFieldName, value);
        filledField = true;
      } catch (error) {
        lastError = error;
      }
    }

    if (!filledField) {
      console.warn(`Worldline PDF-veld niet gevuld: ${pdfFieldNames.join(", ")}`, lastError);
    }
  });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  form.updateFieldAppearances(font);

  const pdfBytes = await pdfDoc.save();
  const pdfArrayBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
  const safeRelationName = sanitizeFileName(relation.name) || "worldline";
  const fileName = `${safeRelationName}-worldline-aansluitovereenkomst.pdf`;
  downloadBlob(new Blob([pdfArrayBuffer], { type: "application/pdf" }), fileName);
}

function renderAgreementFieldControl(
  definition: WorldlineAgreementFieldDefinition,
  value: string,
  disabled: boolean,
  onChange: (value: string) => void,
  onCommit?: (value: string) => void,
) {
  if (definition.type === "checkbox") {
    return (
      <label className="worldline-checkbox-control">
        <input
          type="checkbox"
          checked={value === "ja"}
          disabled={disabled}
          onChange={(event) => {
            const nextValue = event.target.checked ? "ja" : "nee";
            onChange(nextValue);
            onCommit?.(nextValue);
          }}
        />
        <span>Ja</span>
      </label>
    );
  }

  if (definition.type === "select") {
    return (
      <select
        className="input worldline-field-input"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onCommit?.(event.target.value)}
      >
        {(definition.options ?? []).map((option) => (
          <option key={option || "empty"} value={option}>
            {option || "-"}
          </option>
        ))}
      </select>
    );
  }

  if (definition.type === "textarea") {
    return (
      <textarea
        className="textarea worldline-field-input"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onCommit?.(event.target.value)}
      />
    );
  }

  return (
    <input
      className="input worldline-field-input"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => onCommit?.(event.target.value)}
    />
  );
}

export default function WorldlineDashboard() {
  const { user, role, loading: authLoading } = useAuth();
  const supabase = getSupabaseClient();
  const [roleTabAccess, setRoleTabAccess] = useState<RoleTabAccessMap>(ROLE_TAB_ACCESS);
  const [roleAccessLoading, setRoleAccessLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [relations, setRelations] = useState<RelationOption[]>([]);
  const [selectedRelation, setSelectedRelation] = useState<RelationOption | null>(null);
  const [ongoingProjects, setOngoingProjects] = useState<WorldlineProject[]>([]);
  const [projects, setProjects] = useState<WorldlineProject[]>([]);
  const [activeProject, setActiveProject] = useState<WorldlineProject | null>(null);
  const [documents, setDocuments] = useState<WorldlineDocument[]>([]);
  const [agreementFields, setAgreementFields] = useState<WorldlineAgreementFields>(DEFAULT_WORLDLINE_AGREEMENT_FIELDS);
  const activeProjectRef = useRef<WorldlineProject | null>(null);
  const agreementFieldsRef = useRef<WorldlineAgreementFields>(DEFAULT_WORLDLINE_AGREEMENT_FIELDS);
  const pendingAgreementSaveRef = useRef<QueuedAgreementSave | null>(null);
  const agreementSavePromiseRef = useRef<Promise<void> | null>(null);
  const agreementAutosaveTimerRef = useRef<number | null>(null);
  const agreementFieldsDirtyRef = useRef(false);
  const hydratedAgreementProjectId = useRef<string | null>(null);
  const autoCheckedKvkDocumentIds = useRef<Set<string>>(new Set());
  const autoCheckedOcrDocumentIds = useRef<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [loadingOngoingProjects, setLoadingOngoingProjects] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [savingAgreementFields, setSavingAgreementFields] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const latestKvkDocuments = useMemo(() => getLatestKvkDocuments(documents), [documents]);
  const latestDocumentsByType = useMemo(() => {
    return Object.fromEntries(
      WORLDLINE_DOCUMENT_DEFINITIONS.map((definition) => [
        definition.key,
        definition.key === "kvk" ? latestKvkDocuments : getLatestDocumentsByTitle(documents, definition.key),
      ]),
    ) as Record<WorldlineDocumentType, WorldlineDocument[]>;
  }, [documents, latestKvkDocuments]);
  const refundEnabled = agreementFields.refund === "ja";

  const canAccessWorldline = canAccessTab(role, "worldline", roleTabAccess);
  const canWriteWorldline = canWriteTab(role, "worldline", roleTabAccess);
  const canViewAllWorldlineProjects = role === "admin" || role === "manager" || role === "worldline";
  const projectOverviewLabel = canViewAllWorldlineProjects ? "Alle projecten" : "Lopende projecten";

  useEffect(() => {
    activeProjectRef.current = activeProject;
  }, [activeProject]);

  useEffect(() => {
    if (!user) {
      setRoleAccessLoading(false);
      return;
    }

    let active = true;

    async function loadRoleTabAccess() {
      setRoleAccessLoading(true);

      try {
        const response = await fetch("/api/admin/role-tabs", { cache: "no-store" });
        const json = (await response.json().catch(() => ({}))) as { roleTabAccess?: unknown };

        if (active && response.ok) {
          setRoleTabAccess(normalizeRoleTabAccess(json.roleTabAccess));
        }
      } catch {
        if (active) {
          setRoleTabAccess(ROLE_TAB_ACCESS);
        }
      } finally {
        if (active) {
          setRoleAccessLoading(false);
        }
      }
    }

    void loadRoleTabAccess();

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    const projectId = activeProject?.id ?? null;
    if (hydratedAgreementProjectId.current === projectId) return;
    hydratedAgreementProjectId.current = projectId;
    agreementFieldsDirtyRef.current = false;
    if (agreementAutosaveTimerRef.current) {
      window.clearTimeout(agreementAutosaveTimerRef.current);
      agreementAutosaveTimerRef.current = null;
    }
    const nextFields = normalizeWorldlineAgreementFields(activeProject?.agreement_fields);
    agreementFieldsRef.current = nextFields;
    setAgreementFields(nextFields);
  }, [activeProject]);

  const loadOngoingProjects = useCallback(async () => {
    if (!supabase) return;

    setLoadingOngoingProjects(true);

    let query = supabase
      .from("worldline_projects")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(canViewAllWorldlineProjects ? 250 : 100);

    if (!canViewAllWorldlineProjects) {
      query = query.in("status", ONGOING_WORLDLINE_STATUSES);
    }

    const { data, error } = await query;

    if (error) {
      setStatus(`${projectOverviewLabel} laden mislukt: ${error.message}`);
      setOngoingProjects([]);
      setLoadingOngoingProjects(false);
      return;
    }

    setOngoingProjects((data ?? []) as WorldlineProject[]);
    setLoadingOngoingProjects(false);
  }, [canViewAllWorldlineProjects, projectOverviewLabel, supabase]);

  useEffect(() => {
    if (!supabase || roleAccessLoading || !canAccessWorldline) return;
    void loadOngoingProjects();
  }, [canAccessWorldline, loadOngoingProjects, roleAccessLoading, supabase]);

  function syncOngoingProject(project: WorldlineProject) {
    setOngoingProjects((currentProjects) => {
      const remainingProjects = currentProjects.filter((item) => item.id !== project.id);
      if (!isOngoingWorldlineProject(project)) {
        return remainingProjects;
      }
      return [project, ...remainingProjects].sort((a, b) => String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? "")));
    });
  }

  async function loadProjects(relation: RelationOption, preferredProjectId?: string) {
    if (!supabase) return;

    setLoadingProjects(true);
    setStatus("");

    const { data, error } = await supabase
      .from("worldline_projects")
      .select("*")
      .eq("relation_id", relation.id)
      .order("updated_at", { ascending: false });

    if (error) {
      setStatus(`Worldline-projecten laden mislukt: ${error.message}`);
      setProjects([]);
      setActiveProject(null);
      setDocuments([]);
      setLoadingProjects(false);
      return;
    }

    const nextProjects = (data ?? []) as WorldlineProject[];
    setProjects(nextProjects);
    setActiveProject(nextProjects.find((project) => project.id === preferredProjectId) ?? nextProjects[0] ?? null);
    setLoadingProjects(false);
  }

  const loadDocuments = useCallback(async (projectId: string) => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("worldline_documents")
      .select("*")
      .eq("project_id", projectId)
      .order("uploaded_at", { ascending: false });

    if (error) {
      setStatus(`Documenten laden mislukt: ${error.message}`);
      setDocuments([]);
      return;
    }

    setDocuments((data ?? []) as WorldlineDocument[]);
  }, [supabase]);

  const activeProjectId = activeProject?.id;
  useEffect(() => {
    autoCheckedKvkDocumentIds.current.clear();
    autoCheckedOcrDocumentIds.current.clear();
    if (activeProjectId) {
      void loadDocuments(activeProjectId);
    } else {
      setDocuments([]);
    }
  }, [activeProjectId, loadDocuments]);

  async function handleSearchRelations(event: FormEvent) {
    event.preventDefault();
    await flushAgreementFields({ savedMessage: "Aansluitgegevens automatisch opgeslagen." });
    setSearching(true);
    setStatus("");
    setRelations([]);
    setSelectedRelation(null);
    setProjects([]);
    setActiveProject(null);
    setDocuments([]);

    try {
      const response = await fetch(`/api/smart-trade/relations/search?query=${encodeURIComponent(query)}`);
      const json = (await response.json().catch(() => ({}))) as RelationSearchResponse;

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

  async function selectRelation(relation: RelationOption) {
    await flushAgreementFields({ savedMessage: "Aansluitgegevens automatisch opgeslagen." });
    setSelectedRelation(relation);
    await loadProjects(relation);
  }

  async function openProject(project: WorldlineProject) {
    await flushAgreementFields({ savedMessage: "Aansluitgegevens automatisch opgeslagen." });
    const relation = getRelationFromProject(project);
    setSelectedRelation(relation);
    setQuery("");
    setRelations([]);
    setStatus(`${project.relation_name} geopend.`);
    await loadProjects(relation, project.id);
  }

  async function deleteProject(project: WorldlineProject) {
    if (!supabase) return;
    if (!canWriteWorldline) {
      setStatus("Je hebt alleen leesrechten voor Worldline.");
      return;
    }

    const confirmed = window.confirm(`Weet je zeker dat je het Worldline-project voor ${project.relation_name} wilt verwijderen?`);
    if (!confirmed) return;

    setBusy(true);
    setStatus("Worldline-project wordt verwijderd...");

    const { data: projectDocuments } = await supabase
      .from("worldline_documents")
      .select("storage_path")
      .eq("project_id", project.id);

    const storagePaths = ((projectDocuments ?? []) as Array<{ storage_path?: string | null }>)
      .map((document) => document.storage_path)
      .filter((path): path is string => Boolean(path));

    if (storagePaths.length > 0) {
      await supabase.storage.from(WORLDLINE_DOCUMENT_BUCKET).remove(storagePaths);
    }

    const { error } = await supabase
      .from("worldline_projects")
      .delete()
      .eq("id", project.id);

    if (error) {
      setStatus(`Project verwijderen mislukt: ${error.message}`);
      setBusy(false);
      return;
    }

    const nextProjects = projects.filter((item) => item.id !== project.id);
    setOngoingProjects((currentProjects) => currentProjects.filter((item) => item.id !== project.id));
    setProjects(nextProjects);
    if (activeProject?.id === project.id) {
      setActiveProject(nextProjects[0] ?? null);
    }
    setStatus("Worldline-project verwijderd.");
    setBusy(false);
  }

  async function createProject() {
    if (!supabase || !user || !selectedRelation) return;
    if (!canWriteWorldline) {
      setStatus("Je hebt alleen leesrechten voor Worldline.");
      return;
    }

    await flushAgreementFields({ savedMessage: "Aansluitgegevens automatisch opgeslagen." });
    setBusy(true);
    setStatus("Worldline-project wordt aangemaakt...");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setStatus("Je sessie is verlopen. Log opnieuw in om een Worldline-project aan te maken.");
        return;
      }

      const response = await withWorldlineTimeout(
        fetch("/api/worldline/projects/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            relationId: selectedRelation.id,
            relationName: selectedRelation.name,
            relationEmail: selectedRelation.email,
            debtorNumber: selectedRelation.debtorNumber,
          }),
        }),
        "Worldline-project aanmaken",
      );
      const json = (await response.json().catch(() => ({}))) as {
        project?: WorldlineProject;
        error?: string;
      };

      if (!response.ok || !json.project) {
        setStatus(`Project aanmaken mislukt: ${json.error ?? "geen project ontvangen"}.`);
        return;
      }

      const nextProject = json.project;
      setProjects((currentProjects) => [nextProject, ...currentProjects]);
      setActiveProject(nextProject);
      syncOngoingProject(nextProject);
      setStatus("Worldline-project aangemaakt.");
    } catch (error) {
      setStatus(`Project aanmaken mislukt: ${getErrorMessage(error, "Supabase gaf geen antwoord.")}`);
    } finally {
      setBusy(false);
    }
  }

  async function persistAgreementFields(
    nextAgreementFields: WorldlineAgreementFields,
    options: AgreementSaveOptions = {},
  ) {
    if (!supabase || !activeProjectRef.current) return;
    if (!canWriteWorldline) {
      setStatus("Je hebt alleen leesrechten voor Worldline.");
      return;
    }

    pendingAgreementSaveRef.current = {
      projectId: activeProjectRef.current.id,
      fields: nextAgreementFields,
      options,
    };

    if (agreementSavePromiseRef.current) {
      await agreementSavePromiseRef.current;
      return;
    }

    agreementSavePromiseRef.current = (async () => {
      setSavingAgreementFields(true);

      try {
        while (pendingAgreementSaveRef.current) {
          const queuedSave = pendingAgreementSaveRef.current;
          pendingAgreementSaveRef.current = null;

          if (queuedSave.options.savingMessage) {
            setStatus(queuedSave.options.savingMessage);
          }

          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;

          if (!accessToken) {
            agreementFieldsDirtyRef.current = true;
            setStatus("Je sessie is verlopen. Log opnieuw in om aansluitgegevens op te slaan.");
            return;
          }

          const response = await withWorldlineTimeout(
            fetch("/api/worldline/projects/update-agreement", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                projectId: queuedSave.projectId,
                agreementFields: queuedSave.fields,
              }),
            }),
            "Aansluitgegevens opslaan",
          );
          const json = (await response.json().catch(() => ({}))) as {
            project?: WorldlineProject;
            error?: string;
          };

          if (!response.ok || !json.project) {
            agreementFieldsDirtyRef.current = true;
            setStatus(`Aansluitgegevens opslaan mislukt: ${json.error ?? "geen project ontvangen"}.`);
            return;
          }

          const nextProject = json.project;
          setProjects((currentProjects) => currentProjects.map((project) => project.id === nextProject.id ? nextProject : project));
          if (activeProjectRef.current?.id === nextProject.id) {
            activeProjectRef.current = nextProject;
            setActiveProject(nextProject);
          }
          syncOngoingProject(nextProject);
          if (queuedSave.options.savedMessage && !pendingAgreementSaveRef.current) {
            setStatus(queuedSave.options.savedMessage);
          }
        }
      } catch (error) {
        agreementFieldsDirtyRef.current = true;
        setStatus(`Aansluitgegevens opslaan mislukt: ${getErrorMessage(error, "Supabase gaf geen antwoord.")}`);
      } finally {
        setSavingAgreementFields(false);
        agreementSavePromiseRef.current = null;
      }
    })();

    await agreementSavePromiseRef.current;
  }

  async function flushAgreementFields(options: AgreementSaveOptions = {}) {
    if (agreementAutosaveTimerRef.current) {
      window.clearTimeout(agreementAutosaveTimerRef.current);
      agreementAutosaveTimerRef.current = null;
    }

    if (!agreementFieldsDirtyRef.current && !pendingAgreementSaveRef.current && !agreementSavePromiseRef.current) {
      return;
    }

    agreementFieldsDirtyRef.current = false;
    await persistAgreementFields(agreementFieldsRef.current, options);
  }

  function scheduleAgreementAutosave() {
    if (!canWriteWorldline || !activeProjectRef.current) return;

    if (agreementAutosaveTimerRef.current) {
      window.clearTimeout(agreementAutosaveTimerRef.current);
    }

    agreementAutosaveTimerRef.current = window.setTimeout(() => {
      agreementAutosaveTimerRef.current = null;
      void flushAgreementFields({ savedMessage: "Aansluitgegevens automatisch opgeslagen." });
    }, AGREEMENT_AUTOSAVE_DELAY_MS);
  }

  async function saveAgreementFields() {
    agreementFieldsDirtyRef.current = true;
    await flushAgreementFields({
      savingMessage: "Aansluitgegevens worden opgeslagen...",
      savedMessage: "Aansluitgegevens opgeslagen.",
    });
  }

  async function updateProjectStatus(nextStatus: WorldlineProjectStatus, successMessage = "Projectstatus bijgewerkt.") {
    if (!supabase || !activeProject) return;
    if (!canWriteWorldline) {
      setStatus("Je hebt alleen leesrechten voor Worldline.");
      return;
    }

    await flushAgreementFields({ savedMessage: "Aansluitgegevens automatisch opgeslagen." });
    setBusy(true);
    const { data, error } = await supabase
      .from("worldline_projects")
      .update({ status: nextStatus, updated_at: new Date().toISOString() } as never)
      .eq("id", activeProject.id)
      .select("*")
      .single();

    if (error) {
      setStatus(`Status wijzigen mislukt: ${error.message}`);
      setBusy(false);
      return;
    }

    const nextProject = data as WorldlineProject;
    setActiveProject(nextProject);
    setProjects((currentProjects) => currentProjects.map((project) => project.id === nextProject.id ? nextProject : project));
    syncOngoingProject(nextProject);
    setStatus(successMessage);
    setBusy(false);
  }

  async function markAgreementSentToCustomer() {
    await updateProjectStatus("waiting_customer", "Aansluitovereenkomst gemarkeerd als verstuurd naar klant.");
  }

  function updateAgreementField(field: string, value: string) {
    updateAgreementFields({ [field]: value });
  }

  function updateAgreementFields(updates: Record<string, string>) {
    if (!canWriteWorldline) return;
    setAgreementFields((currentFields) => {
      const nextFields = { ...currentFields, ...updates };
      agreementFieldsRef.current = nextFields;
      return nextFields;
    });
    agreementFieldsDirtyRef.current = true;
    scheduleAgreementAutosave();
  }

  function commitAgreementField(field: string, value: string) {
    commitAgreementFields({ [field]: value });
  }

  function commitAgreementFields(updates: Record<string, string>) {
    if (!canWriteWorldline) return;

    const nextFields = { ...agreementFieldsRef.current, ...updates };
    agreementFieldsRef.current = nextFields;
    setAgreementFields(nextFields);
    agreementFieldsDirtyRef.current = true;
    void flushAgreementFields({
      savedMessage: "Aansluitgegevens automatisch opgeslagen.",
    });
  }

  async function refreshActiveProjectAgreementFields() {
    if (!supabase || !activeProjectRef.current) return agreementFieldsRef.current;

    const projectId = activeProjectRef.current.id;
    const { data, error } = await supabase
      .from("worldline_projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (error || !data) {
      setStatus(`Laatste gegevens ophalen mislukt: ${error?.message ?? "geen project ontvangen"}.`);
      return agreementFieldsRef.current;
    }

    const refreshedProject = data as WorldlineProject;
    activeProjectRef.current = refreshedProject;
    setActiveProject(refreshedProject);
    setProjects((currentProjects) => currentProjects.map((project) => project.id === refreshedProject.id ? refreshedProject : project));
    syncOngoingProject(refreshedProject);

    const refreshedFields = normalizeWorldlineAgreementFields(refreshedProject.agreement_fields);
    agreementFieldsRef.current = refreshedFields;
    setAgreementFields(refreshedFields);
    return refreshedFields;
  }

  async function copyBusinessDataToShop() {
    if (!canWriteWorldline) return;

    setStatus("Laatste bedrijfsgegevens worden opgehaald...");
    await persistAgreementFields(agreementFieldsRef.current);
    const latestFields = await refreshActiveProjectAgreementFields();

    const nextFields = {
      ...latestFields,
      shopName: latestFields.companyName ?? "",
      shopAddress: latestFields.businessAddress ?? "",
      shopPostcode: latestFields.businessPostcode ?? "",
      shopCity: latestFields.businessCity ?? "",
    };

    agreementFieldsRef.current = nextFields;
    setAgreementFields(nextFields);
    void persistAgreementFields(nextFields, {
      savingMessage: "Shopgegevens worden overgenomen...",
      savedMessage: "Shopgegevens overgenomen en opgeslagen.",
    });
  }

  async function uploadDocument(
    documentType: WorldlineDocumentType,
    file: File | null | undefined,
    sourceDocuments = documents,
  ): Promise<WorldlineDocument | null> {
    if (!file || !supabase || !activeProject || !selectedRelation || !user) return null;
    if (!canWriteWorldline) {
      setStatus("Je hebt alleen leesrechten voor Worldline.");
      return null;
    }

    if (documentType === "refund" && !refundEnabled) {
      setStatus("Refund is niet geselecteerd bij Betaalkaarten en tarieven. Uploaden is daarom uitgeschakeld.");
      return null;
    }

    const uploadFile = file;
    const uploadedAsImage = isImageUploadFile(file);
    let ocrConfidence: number | undefined;
    let ocrError = "";
    let ocrText = "";

    const definition = getWorldlineDocumentDefinition(documentType);
    const documentTitle = getDocumentTitleFromFileName(uploadFile.name);
    const kvkNumber = documentType === "kvk"
      ? extractKvkNumberFromText(uploadFile.name)
      : "";

    if (documentType === "kvk" && !kvkNumber) {
      setStatus("Gebruik voor KvK een bestandsnaam zoals 'Uittreksel - 58048472.pdf', zodat het uittrekselnummer automatisch herkend wordt.");
      setBusy(false);
      return null;
    }

    setBusy(true);
    setStatus(`${definition?.title ?? "Document"} '${uploadFile.name}' is ontvangen...`);
    await allowUiToPaint();

    try {
      if (uploadedAsImage && OCR_DOCUMENT_TYPES.includes(documentType)) {
        setStatus("Gratis OCR leest de JPG/PNG...");
        await allowUiToPaint();

        try {
          const ocrResult = await extractImageTextWithBrowserOcr(file, setStatus, { documentType });
          ocrText = ocrResult.text;
          ocrConfidence = ocrResult.confidence;
        } catch (error) {
          ocrError = getErrorMessage(error, "OCR kon niet worden uitgevoerd.");
        }
      }

      const nextCheckResult: WorldlineCheckResult = {
        ...createInitialCheckResult(documentType),
        documentTitle,
        ...(uploadedAsImage
          ? {
              uploadedAsImage: true,
              note: ocrText
                ? "JPG/PNG is opgeslagen. Tekst is met gratis browser-OCR gelezen; controleer het resultaat bij twijfel."
                : "JPG/PNG is opgeslagen. Gratis OCR kon geen tekst lezen; controleer dit document handmatig.",
              ...(typeof ocrConfidence === "number" ? { ocrConfidence } : {}),
              ocrEngine: "tesseract.js",
              ...(ocrError ? { ocrError } : {}),
              ...(ocrText ? { ocrText } : {}),
              originalFileName: file.name,
              originalMimeType: file.type || "image",
            }
          : {}),
        ...(documentType === "kvk" ? { kvkNumber } : {}),
      };

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setStatus("Je sessie is verlopen. Log opnieuw in om documenten te uploaden.");
        return null;
      }

      setStatus(`${definition?.title ?? "Document"} upload voorbereiden...`);
      const prepareResponse = await withWorldlineTimeout(
        fetch("/api/worldline/documents/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            action: "prepare",
            projectId: activeProject.id,
            documentType,
            fileName: uploadFile.name,
            fileSize: uploadFile.size,
            mimeType: uploadFile.type,
            checkResult: nextCheckResult,
          }),
        }),
        `${definition?.title ?? "Document"} upload voorbereiden`,
      );
      const prepareJson = (await prepareResponse.json().catch(() => ({}))) as SignedUploadResponse;

      if (!prepareResponse.ok || !prepareJson.upload) {
        throw new Error(prepareJson.error ?? "geen uploadlink ontvangen");
      }

      const preparedUpload = prepareJson.upload;
      setStatus(`${definition?.title ?? "Document"} wordt geupload...`);
      const storageUpload = await supabase.storage
        .from(WORLDLINE_DOCUMENT_BUCKET)
        .uploadToSignedUrl(preparedUpload.signedPath || preparedUpload.storagePath, preparedUpload.token, uploadFile, {
          contentType: preparedUpload.mimeType || uploadFile.type || "application/octet-stream",
          upsert: false,
        });

      if (storageUpload.error) {
        throw new Error(storageUpload.error.message);
      }

      const completedCheckResult: WorldlineCheckResult = {
        ...nextCheckResult,
        documentTitle: preparedUpload.documentTitle || documentTitle,
        ...(documentType === "kvk" ? { kvkNumber: preparedUpload.kvkNumber || kvkNumber } : {}),
      };

      setStatus(`${definition?.title ?? "Document"} wordt geregistreerd...`);
      const completeResponse = await withWorldlineTimeout(
        fetch("/api/worldline/documents/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            action: "complete",
            projectId: activeProject.id,
            documentType,
            fileName: uploadFile.name,
            fileSize: uploadFile.size,
            mimeType: preparedUpload.mimeType || uploadFile.type,
            storagePath: preparedUpload.storagePath,
            version: preparedUpload.version,
            checkResult: completedCheckResult,
          }),
        }),
        `${definition?.title ?? "Document"} registreren`,
      );
      const completeJson = (await completeResponse.json().catch(() => ({}))) as {
        document?: WorldlineDocument;
        error?: string;
      };

      if (!completeResponse.ok || !completeJson.document) {
        throw new Error(completeJson.error ?? "geen document ontvangen");
      }

      const nextDocument = completeJson.document;
      const savedVersion = nextDocument.version;
      setDocuments((currentDocuments) => [nextDocument, ...currentDocuments]);
      if (documentType === "kvk") {
        const savedKvkNumber = preparedUpload.kvkNumber || kvkNumber;
        const hasOtherKvkDocuments = sourceDocuments.some((document) => document.document_type === "kvk" && getDocumentKvkNumber(document) !== savedKvkNumber);
        setStatus(
          savedVersion > 1
            ? `KvK-uittreksel ${savedKvkNumber} is opgeslagen als v${savedVersion}${uploadedAsImage ? `${ocrText ? " met OCR-tekst" : " als afbeelding"}` : ""}.`
            : `KvK-uittreksel ${savedKvkNumber} is toegevoegd als ${hasOtherKvkDocuments ? "extra" : "eerste"} KvK${uploadedAsImage ? `${ocrText ? " met OCR-tekst" : " als afbeelding"}` : ""}.`
        );
      } else {
        const savedDocumentTitle = preparedUpload.documentTitle || documentTitle;
        setStatus(
          savedVersion > 1
            ? `${definition?.title ?? "Document"} '${savedDocumentTitle}' is opgeslagen als v${savedVersion}${uploadedAsImage ? `${ocrText ? " met OCR-tekst" : " als afbeelding"}` : ""}.`
            : `${definition?.title ?? "Document"} '${savedDocumentTitle}' is toegevoegd aan dit Worldline-project${uploadedAsImage ? `${ocrText ? " met OCR-tekst" : " als afbeelding"}` : ""}.`
        );
      }
      return nextDocument;
    } catch (error) {
      setStatus(`Upload mislukt: ${getErrorMessage(error, "Supabase gaf geen antwoord.")}.`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function uploadDocuments(documentType: WorldlineDocumentType, fileList: FileList | File[] | null | undefined) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    const definition = getWorldlineDocumentDefinition(documentType);
    setStatus(
      files.length === 1
        ? `${definition?.title ?? "Document"} '${files[0]?.name ?? "bestand"}' is geselecteerd.`
        : `${files.length} bestanden geselecteerd voor ${definition?.title ?? "documenten"}.`
    );
    await allowUiToPaint();

    let knownDocuments = documents;
    for (const file of files) {
      const uploadedDocument = await uploadDocument(documentType, file, knownDocuments);
      if (uploadedDocument) {
        knownDocuments = [uploadedDocument, ...knownDocuments];
      }
    }
  }

  const runAutomatedDocumentCheck = useCallback(async (document: WorldlineDocument, options: { ocrText?: string } = {}) => {
    if (!supabase) return { ok: false as const, error: "Supabase is niet beschikbaar." };
    if (!canWriteWorldline) {
      setStatus("Je hebt alleen leesrechten voor Worldline.");
      return { ok: false as const, error: "Je hebt alleen leesrechten voor Worldline." };
    }

    const documentTitle = getWorldlineDocumentDefinition(document.document_type)?.title ?? "Document";

    if (isImageDocument(document) && !getDocumentStoredOcrText(document)) {
      setStatus(`${documentTitle} is opgeslagen als JPG/PNG, maar OCR kon geen tekst lezen. Controleer dit document handmatig.`);
      return { ok: false as const, error: "OCR kon geen tekst lezen." };
    }

    setBusy(true);
    setStatus(`${documentTitle} wordt gecontroleerd...`);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setStatus(`Je sessie is verlopen. Log opnieuw in om ${documentTitle.toLowerCase()} te controleren.`);
        return { ok: false as const, error: "Je sessie is verlopen." };
      }

      const response = await fetch("/api/worldline/documents/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          documentId: document.id,
          ...(options.ocrText ? { ocrText: options.ocrText } : {}),
        }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        document?: WorldlineDocument;
        error?: string;
        message?: string;
      };

      if (!response.ok || !json.document) {
        const errorMessage = json.error ?? "geen resultaat ontvangen";
        setStatus(`${documentTitle}-controle mislukt: ${errorMessage}.`);
        return { ok: false as const, error: errorMessage };
      }

      setDocuments((currentDocuments) => currentDocuments.map((item) => item.id === json.document?.id ? json.document : item));
      setStatus(json.message ?? `${documentTitle}-controle uitgevoerd.`);
      return { ok: true as const, document: json.document };
    } catch (error) {
      const errorMessage = getErrorMessage(error, "controle kon niet worden uitgevoerd.");
      setStatus(`${documentTitle}-controle mislukt: ${errorMessage}`);
      return { ok: false as const, error: errorMessage };
    } finally {
      setBusy(false);
    }
  }, [canWriteWorldline, supabase]);

  async function rerunImageOcrForDocument(document: WorldlineDocument) {
    if (!supabase || !isImageDocument(document) || !OCR_DOCUMENT_TYPES.includes(document.document_type)) return "";

    const documentTitle = getWorldlineDocumentDefinition(document.document_type)?.title ?? "Document";
    setBusy(true);
    setStatus(`${documentTitle} wordt opnieuw met OCR gelezen...`);

    try {
      const { data: imageFile, error: downloadError } = await supabase.storage
        .from(WORLDLINE_DOCUMENT_BUCKET)
        .download(document.storage_path);

      if (downloadError || !imageFile) {
        setStatus(`${documentTitle}-OCR mislukt: ${downloadError?.message ?? "afbeelding kon niet worden opgehaald"}.`);
        return "";
      }

      const ocrResult = await extractImageTextWithBrowserOcr(
        new File([imageFile], document.file_name, { type: document.mime_type || imageFile.type || "image/png" }),
        setStatus,
        { documentType: document.document_type },
      );

      return ocrResult.text;
    } catch (error) {
      setStatus(`${documentTitle}-OCR mislukt: ${getErrorMessage(error, "afbeelding kon niet worden gelezen.")}`);
      return "";
    } finally {
      setBusy(false);
    }
  }

  async function updateDocumentStatus(document: WorldlineDocument, nextStatus: WorldlineCheckStatus, successMessage = "Documentstatus bijgewerkt.") {
    if (!supabase) return;
    if (!canWriteWorldline) {
      setStatus("Je hebt alleen leesrechten voor Worldline.");
      return;
    }

    setBusy(true);
    const { data, error } = await supabase
      .from("worldline_documents")
      .update({ check_status: nextStatus } as never)
      .eq("id", document.id)
      .select("*")
      .single();

    if (error) {
      setStatus(`Documentstatus wijzigen mislukt: ${error.message}`);
      setBusy(false);
      return;
    }

    const nextDocument = data as WorldlineDocument;
    setDocuments((currentDocuments) => currentDocuments.map((item) => item.id === nextDocument.id ? nextDocument : item));
    setStatus(successMessage);
    setBusy(false);
  }

  async function checkDocument(document: WorldlineDocument) {
    if (isImageDocument(document) && OCR_DOCUMENT_TYPES.includes(document.document_type)) {
      const freshOcrText = await rerunImageOcrForDocument(document);

      if (freshOcrText) {
        await runAutomatedDocumentCheck(document, { ocrText: freshOcrText });
        return;
      }
    }

    if (isImageDocument(document) && !getDocumentStoredOcrText(document)) {
      await updateDocumentStatus(
        document,
        "checking",
        "Document staat klaar voor handmatige controle. OCR kon geen tekst lezen uit deze JPG/PNG."
      );
      return;
    }

    const firstCheck = await runAutomatedDocumentCheck(document);
    const firstError = firstCheck.ok ? "" : firstCheck.error;
    const checkedDocument = firstCheck.ok ? firstCheck.document : null;
    const shouldTryPdfOcr = (
      isPdfDocument(document) &&
      (
        firstError.includes("Geen selecteerbare tekst") ||
        (checkedDocument && identityExpiryNeedsOcr(checkedDocument))
      )
    );

    if (!supabase || !shouldTryPdfOcr) {
      return;
    }

    const documentTitle = getWorldlineDocumentDefinition(document.document_type)?.title ?? "Document";
    setBusy(true);
    setStatus(
      firstError.includes("Geen selecteerbare tekst")
        ? `${documentTitle} heeft geen selecteerbare tekst. Gratis OCR leest de gescande PDF...`
        : `${documentTitle} mist de geldigheidsdatum in de PDF-tekst. Gratis OCR leest de PDF opnieuw...`
    );

    try {
      const { data: pdfFile, error: downloadError } = await supabase.storage
        .from(WORLDLINE_DOCUMENT_BUCKET)
        .download(document.storage_path);

      if (downloadError || !pdfFile) {
        setStatus(`${documentTitle}-OCR mislukt: ${downloadError?.message ?? "PDF kon niet worden opgehaald"}.`);
        return;
      }

      const ocrText = await extractPdfTextWithBrowserOcr(
        new File([pdfFile], document.file_name, { type: document.mime_type || pdfFile.type || "application/pdf" }),
        setStatus,
        { documentType: document.document_type },
      );

      if (!ocrText) {
        setStatus(`${documentTitle}-controle mislukt: OCR kon geen tekst lezen uit deze gescande PDF. Controleer dit document handmatig.`);
        return;
      }

      await runAutomatedDocumentCheck(document, { ocrText });
    } catch (error) {
      setStatus(`${documentTitle}-OCR mislukt: ${getErrorMessage(error, "gescande PDF kon niet worden gelezen.")}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!activeProjectId || !canWriteWorldline || roleAccessLoading || busy) return;

    const ocrDocumentToCheck = Object.values(latestDocumentsByType)
      .flat()
      .find((document) => (
        shouldAutoCheckOcrDocument(document) && !autoCheckedOcrDocumentIds.current.has(document.id)
      ));

    if (!ocrDocumentToCheck) return;

    autoCheckedOcrDocumentIds.current.add(ocrDocumentToCheck.id);
    void runAutomatedDocumentCheck(ocrDocumentToCheck);
  }, [activeProjectId, busy, canWriteWorldline, latestDocumentsByType, roleAccessLoading, runAutomatedDocumentCheck]);

  useEffect(() => {
    if (!activeProjectId || !canWriteWorldline || roleAccessLoading || busy) return;

    const staleKvkDocument = latestKvkDocuments.find((document) => (
      shouldRefreshKvkCheck(document) && !shouldAutoCheckOcrDocument(document) && !autoCheckedKvkDocumentIds.current.has(document.id)
    ));

    if (!staleKvkDocument) return;

    autoCheckedKvkDocumentIds.current.add(staleKvkDocument.id);
    void runAutomatedDocumentCheck(staleKvkDocument);
  }, [activeProjectId, busy, canWriteWorldline, runAutomatedDocumentCheck, latestKvkDocuments, roleAccessLoading]);

  async function handleDownloadAgreementPdf() {
    if (!selectedRelation || !activeProject) return;

    await flushAgreementFields({ savedMessage: "Aansluitgegevens automatisch opgeslagen." });
    setStatus("Aansluitovereenkomst wordt ingevuld...");

    try {
      await downloadAgreementPdf(selectedRelation, activeProject, agreementFieldsRef.current);
      setStatus("Aansluitovereenkomst gedownload.");
    } catch (error) {
      setStatus(`Aansluitovereenkomst downloaden mislukt: ${getErrorMessage(error, "PDF kon niet worden ingevuld.")}`);
    }
  }

  async function downloadDocument(document: WorldlineDocument) {
    if (!supabase) return;

    setStatus("Download wordt voorbereid...");

    const { data, error } = await supabase.storage
      .from(WORLDLINE_DOCUMENT_BUCKET)
      .download(document.storage_path);

    if (error || !data) {
      setStatus(`Download mislukt: ${error?.message ?? "geen bestand ontvangen"}.`);
      return;
    }

    downloadBlob(data, document.file_name);
    setStatus(`${document.file_name} gedownload.`);
  }

  async function deleteDocument(document: WorldlineDocument) {
    if (!supabase) return;
    if (!canWriteWorldline) {
      setStatus("Je hebt alleen leesrechten voor Worldline.");
      return;
    }

    const confirmed = window.confirm(`Weet je zeker dat je '${document.file_name}' wilt verwijderen?`);
    if (!confirmed) return;

    setBusy(true);
    setStatus("Document wordt verwijderd...");

    const removeResult = await supabase.storage
      .from(WORLDLINE_DOCUMENT_BUCKET)
      .remove([document.storage_path]);

    if (removeResult.error) {
      setStatus(`Bestand verwijderen mislukt: ${removeResult.error.message}`);
      setBusy(false);
      return;
    }

    const { error } = await supabase
      .from("worldline_documents")
      .delete()
      .eq("id", document.id);

    if (error) {
      setStatus(`Documentregel verwijderen mislukt: ${error.message}`);
      setBusy(false);
      return;
    }

    setDocuments((currentDocuments) => currentDocuments.filter((item) => item.id !== document.id));
    setStatus("Document verwijderd.");
    setBusy(false);
  }

  function handleDragOver(event: DragEvent<HTMLElement>, documentType: WorldlineDocumentType) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = busy || !canWriteWorldline || (documentType === "refund" && !refundEnabled) ? "none" : "copy";
  }

  function handleDrop(event: DragEvent<HTMLElement>, documentType: WorldlineDocumentType) {
    event.preventDefault();
    event.stopPropagation();
    if (busy || !canWriteWorldline || (documentType === "refund" && !refundEnabled)) return;

    const droppedFiles = Array.from(event.dataTransfer.files ?? []);
    void uploadDocuments(documentType, droppedFiles);
  }

  function renderUploadedDocument(document: WorldlineDocument, title: string, documentType: WorldlineDocumentType) {
    const checkResult = getCheckResult(document, documentType);
    const isRefundDisabled = documentType === "refund" && !refundEnabled;
    const usesManualCheckOnly = isImageDocument(document) && !getDocumentStoredOcrText(document);

    return (
      <div key={document.id} className="worldline-document-item">
        <div className="worldline-document-item-main">
          <strong>{title}</strong>
          <span>{document.file_name}</span>
        </div>
        <div className="worldline-document-item-meta">
          <StatusPill tone={getCheckTone(document.check_status)}>
            {WORLDLINE_CHECK_STATUS_LABELS[document.check_status]}
          </StatusPill>
          <span>v{document.version}</span>
          <small>{fileSizeLabel(document.file_size)}</small>
          <small>{formatDate(document.uploaded_at)}</small>
        </div>
        <div className="button-row compact">
          <button type="button" className="secondary-button" onClick={() => void downloadDocument(document)}>
            <Download size={16} />
            Download
          </button>
          <button type="button" className="secondary-button" onClick={() => void checkDocument(document)} disabled={busy || !canWriteWorldline || isRefundDisabled}>
            {usesManualCheckOnly ? "Handmatig controleren" : "Controleren"}
          </button>
          <button type="button" className="secondary-button" onClick={() => void updateDocumentStatus(document, "approved")} disabled={busy || !canWriteWorldline || isRefundDisabled}>
            Akkoord
          </button>
          <button type="button" className="secondary-button danger" onClick={() => void updateDocumentStatus(document, "rejected")} disabled={busy || !canWriteWorldline || isRefundDisabled}>
            Afgekeurd
          </button>
          <button type="button" className="secondary-button danger" onClick={() => void deleteDocument(document)} disabled={busy || !canWriteWorldline}>
            <Trash2 size={16} />
            Verwijderen
          </button>
        </div>
        {renderCheckResult(checkResult)}
      </div>
    );
  }

  if (authLoading && !user) return null;

  if (!user) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="eyebrow">Worldline</div>
            <h1>Inloggen vereist</h1>
            <p className="subtext">Log in om Worldline-dossiers te beheren.</p>
          </section>
        </div>
      </div>
    );
  }

  if (!roleAccessLoading && !canAccessWorldline) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="eyebrow">Worldline</div>
            <h1>Geen toegang</h1>
            <p className="subtext">Deze pagina is alleen zichtbaar voor rollen die in Admin toegang tot Worldline hebben.</p>
          </section>
        </div>
      </div>
    );
  }

  if (!supabase) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="eyebrow">Worldline</div>
            <h1>Configuratie ontbreekt</h1>
            <p className="subtext">Supabase keys ontbreken.</p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="container worldline-page">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Smart Trade</div>
            <h1>Worldline</h1>
            <p>Beheer aansluitovereenkomsten, KvK, ID, bankafschrift en refund-documenten per relatie.</p>
          </div>
          <div className="brand-actions">
            {!canWriteWorldline ? <StatusPill tone="warning">Alleen lezen</StatusPill> : null}
            <StatusPill tone={activeProject ? getProjectTone(activeProject.status) : "warning"}>
              {activeProject ? WORLDLINE_STATUS_LABELS[activeProject.status] : "Geen project"}
            </StatusPill>
          </div>
        </header>

        <section className="card panel worldline-ongoing-panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">{projectOverviewLabel}</div>
              <h2 className="headline">Worldline-projecten</h2>
              <p className="subtext">
                {canViewAllWorldlineProjects
                  ? "Open direct elk Worldline-dossier, ook als het door een andere gebruiker is aangemaakt."
                  : "Open direct een lopend dossier of verwijder een project dat niet meer nodig is."}
              </p>
            </div>
            <div className="button-row compact">
              <StatusPill tone="warning">{ongoingProjects.length} project(en)</StatusPill>
              <button type="button" className="secondary-button" onClick={() => void loadOngoingProjects()} disabled={loadingOngoingProjects || busy}>
                <RefreshCw size={16} />
                Vernieuwen
              </button>
            </div>
          </div>

          {loadingOngoingProjects ? <div className="save-status">{projectOverviewLabel} worden geladen...</div> : null}

          {!loadingOngoingProjects && ongoingProjects.length === 0 ? (
            <div className="empty-state">Geen Worldline-projecten gevonden.</div>
          ) : null}

          {ongoingProjects.length > 0 ? (
            <div className="worldline-ongoing-list">
              {ongoingProjects.map((project) => (
                <article key={project.id} className={`worldline-ongoing-card ${activeProject?.id === project.id ? "active" : ""}`}>
                  <div className="worldline-ongoing-main">
                    <strong>{project.relation_name}</strong>
                    <span>
                      {project.relation_email || "Geen e-mail"}
                      {project.debtor_number ? ` · Debiteur ${project.debtor_number}` : ""}
                    </span>
                    <small>Laatst bijgewerkt: {formatDate(project.updated_at ?? project.created_at)}</small>
                  </div>

                  <div className="worldline-ongoing-actions">
                    <StatusPill tone={getProjectTone(project.status)}>{WORLDLINE_STATUS_LABELS[project.status]}</StatusPill>
                    <button type="button" className="secondary-button" onClick={() => void openProject(project)} disabled={busy}>
                      <FolderOpen size={16} />
                      Openen
                    </button>
                    <button type="button" className="secondary-button danger" onClick={() => void deleteProject(project)} disabled={busy || !canWriteWorldline}>
                      <Trash2 size={16} />
                      Verwijderen
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Relatie</div>
              <h2 className="headline">Relatie selecteren</h2>
              <p className="subtext">Zoek op bedrijfsnaam, contactnaam, e-mail of relatienummer.</p>
            </div>
            <div className="icon-badge"><Search size={26} /></div>
          </div>

          <form onSubmit={handleSearchRelations} className={styles.assetSearchForm}>
            <input
              className={`input ${styles.assetSearchInput}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Bijv. Joella, debiteur, e-mail of ID..."
              required
            />
            <button type="submit" className={`primary-button ${styles.assetSearchButton}`} disabled={searching || busy}>
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
                    className={`${styles.relationResultCard} ${selectedRelation?.id === relation.id ? styles.selectedResultCard : ""}`}
                    onClick={() => void selectRelation(relation)}
                  >
                    <span className={styles.relationResultIcon}><Building2 size={18} /></span>
                    <span className={styles.relationResultContent}>
                      <strong>{relation.name}</strong>
                      <span className={styles.relationResultMeta}>
                        <span><Hash size={13} />ID {relation.id}</span>
                        {relation.debtorNumber ? <span>Debiteur {relation.debtorNumber}</span> : null}
                        {relation.email ? <span><Mail size={13} />{relation.email}</span> : null}
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
        </section>

        {selectedRelation ? (
          <section className="card panel worldline-project-panel">
            <div className="top-row">
              <div>
                <div className="eyebrow">Project</div>
                <h2 className="headline">Worldline-dossier voor {selectedRelation.name}</h2>
                <p className="subtext">
                  {loadingProjects ? "Projecten worden geladen..." : projects.length === 0 ? "Nog geen project voor deze relatie." : `${projects.length} project(en) gevonden.`}
                </p>
              </div>
              <button type="button" className="primary-button" onClick={() => void createProject()} disabled={busy || !canWriteWorldline}>
                <FileText size={16} />
                Nieuw project
              </button>
            </div>

            {projects.length > 0 ? (
              <div className="worldline-project-list">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={`worldline-project-card ${activeProject?.id === project.id ? "active" : ""}`}
                    onClick={() => setActiveProject(project)}
                  >
                    <span>
                      <strong>{WORLDLINE_STATUS_LABELS[project.status]}</strong>
                      <small>{formatDate(project.updated_at ?? project.created_at)}</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {activeProject && selectedRelation ? (
          <>
            <section className="card panel">
              <div className="top-row">
                <div>
                  <div className="eyebrow">Aansluitovereenkomst</div>
                  <h2 className="headline">Aansluitovereenkomst voorbereiden</h2>
                  <p className="subtext">Vul de bekende gegevens in en download een PDF voor het dossier of de klantmail.</p>
                </div>
                <div className="button-row compact">
                  <button type="button" className="secondary-button" onClick={() => void saveAgreementFields()} disabled={busy || savingAgreementFields || !canWriteWorldline}>
                    <RefreshCw size={16} />
                    {savingAgreementFields ? "Opslaan..." : "Opslaan"}
                  </button>
                  <button type="button" className="primary-button" onClick={() => void handleDownloadAgreementPdf()} disabled={busy || savingAgreementFields}>
                    <Download size={16} />
                    Download PDF
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void markAgreementSentToCustomer()}
                    disabled={busy || savingAgreementFields || !canWriteWorldline || activeProject.status === "waiting_customer"}
                  >
                    <Send size={16} />
                    {activeProject.status === "waiting_customer" ? "Verstuurd naar klant" : "Markeer verstuurd"}
                  </button>
                </div>
              </div>

              <div className="worldline-field-list">
                {Array.from(getAgreementSections()).map(([sectionTitle, definitions]) => (
                  <div key={sectionTitle} className="worldline-field-section">
                    <div className="worldline-field-section-header">
                      <h3>{sectionTitle}</h3>
                      {sectionTitle === "Shopgegevens" ? (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void copyBusinessDataToShop()}
                          disabled={busy || savingAgreementFields || !canWriteWorldline}
                        >
                          <Copy size={16} />
                          Bedrijfsgegevens overnemen
                        </button>
                      ) : null}
                    </div>
                    <div className="worldline-field-rows">
                      {definitions.map((definition) => (
                        <div key={definition.key} className="worldline-yellow-field">
                          <span className="worldline-field-label">
                            {definition.label}
                          </span>
                          <div className="worldline-field-control">
                            {definition.key === "mcc"
                              ? renderWorldlineMccFieldControl({
                                  value: agreementFields[definition.key] ?? definition.defaultValue ?? "",
                                  disabled: !canWriteWorldline,
                                  onChange: (value) => updateAgreementFields(getWorldlineMccFieldUpdates(value)),
                                  onCommit: (value) => commitAgreementFields(getWorldlineMccFieldUpdates(value)),
                                })
                              : renderAgreementFieldControl(
                                  definition,
                                  agreementFields[definition.key] ?? definition.defaultValue ?? "",
                                  !canWriteWorldline,
                                  (value) => updateAgreementField(definition.key, value),
                                  (value) => commitAgreementField(definition.key, value),
                                )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="card panel">
              <div className="top-row">
                <div>
                  <div className="eyebrow">Documenten</div>
                  <h2 className="headline">Uploaden en controleren</h2>
                  <p className="subtext">Sleep PDF-, JPG- of PNG-bestanden naar de juiste stap. Bij afbeeldingen wordt gratis OCR direct op de afbeelding uitgevoerd.</p>
                </div>
                <select
                  className="input worldline-status-select"
                  value={activeProject.status}
                  disabled={busy || !canWriteWorldline}
                  aria-label="Worldline projectstatus"
                  onChange={(event) => void updateProjectStatus(event.target.value as WorldlineProjectStatus)}
                >
                  {Object.entries(WORLDLINE_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {status ? <div className="save-status worldline-inline-status">{status}</div> : null}

              <div className="worldline-document-grid">
                {WORLDLINE_DOCUMENT_DEFINITIONS.map((definition) => {
                  const documentItems = latestDocumentsByType[definition.key] ?? [];
                  const aggregateStatus = getAggregateCheckStatus(documentItems);
                  const isRefundDisabled = definition.key === "refund" && !refundEnabled;
                  const inputId = `worldline-${definition.key}`;

                  return (
                    <article key={definition.key} className="worldline-document-card">
                      <div className="worldline-document-top">
                        <div>
                          <div className="eyebrow">Documentcontrole</div>
                          <h3>{definition.title}</h3>
                          <p>{definition.description}</p>
                          {documentItems.length > 0 ? (
                            <small className="worldline-document-count">
                              Totaal: {documentItems.length} upload{documentItems.length === 1 ? "" : "s"}
                            </small>
                          ) : null}
                        </div>
                        <StatusPill tone={isRefundDisabled ? "warning" : getCheckTone(aggregateStatus)}>
                          {isRefundDisabled ? "Uitgeschakeld" : WORLDLINE_CHECK_STATUS_LABELS[aggregateStatus]}
                        </StatusPill>
                      </div>

                      <label
                        className={`worldline-dropzone${isRefundDisabled ? " disabled" : ""}`}
                        htmlFor={inputId}
                        onDragEnter={(event) => handleDragOver(event, definition.key)}
                        onDragOver={(event) => handleDragOver(event, definition.key)}
                        onDrop={(event) => handleDrop(event, definition.key)}
                      >
                        <UploadCloud size={22} />
                        <span>{isRefundDisabled ? "Refund is niet geselecteerd" : "Sleep bestanden hierheen of kies bestanden"}</span>
                        <small>{isRefundDisabled ? "Zet Refund op Ja om te uploaden" : definition.accept.includes("image") ? "PDF, JPG of PNG" : "PDF"}</small>
                        <input
                          id={inputId}
                          type="file"
                          multiple
                          accept={definition.accept}
                          onChange={(event) => {
                            const selectedFiles = Array.from(event.currentTarget.files ?? []);
                            event.currentTarget.value = "";
                            void uploadDocuments(definition.key, selectedFiles);
                          }}
                          disabled={busy || !canWriteWorldline || isRefundDisabled}
                        />
                      </label>

                      {documentItems.length > 0 ? (
                        <div className="worldline-document-list">
                          {documentItems.map((document) => {
                            if (definition.key !== "kvk") {
                              return renderUploadedDocument(document, getDocumentTitle(document), definition.key);
                            }

                            const kvkDocument = document;
                            const documentKvkNumber = getDocumentKvkNumber(kvkDocument);

                            return renderUploadedDocument(
                              kvkDocument,
                              documentKvkNumber ? `Uittreksel - ${documentKvkNumber}` : "KvK-uittreksel zonder nummer",
                              "kvk",
                            );
                          })}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}

        {status ? <div className="save-status">{status}</div> : null}
      </div>
    </div>
  );
}
