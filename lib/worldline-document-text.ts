import { createRequire } from "node:module";
import type { WorldlineDocument } from "@/lib/worldline";

type PdfParseResult = {
  text?: string;
};

type PdfParse = (data: Buffer, options?: unknown) => Promise<PdfParseResult>;

export class DocumentTextExtractionError extends Error {
  status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "DocumentTextExtractionError";
    this.status = status;
  }
}

const require = createRequire(import.meta.url);

function getPdfParse() {
  return require("pdf-parse/lib/pdf-parse.js") as PdfParse;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function getDocumentMimeType(document: WorldlineDocument, file: Blob) {
  const explicitMimeType = normalizeText(document.mime_type) || normalizeText(file.type);
  if (explicitMimeType) return explicitMimeType.toLowerCase();

  const extension = getExtension(document.file_name);
  if (extension === "pdf") return "application/pdf";
  return "";
}

function isPdfDocument(document: WorldlineDocument, file: Blob) {
  const mimeType = getDocumentMimeType(document, file);
  return mimeType.includes("pdf") || /\.pdf$/i.test(document.file_name);
}

async function extractPdfText(file: Blob) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const pdfParse = getPdfParse();
  const parsed = await pdfParse(buffer);
  return normalizeText(parsed.text);
}

export async function extractWorldlineDocumentText(document: WorldlineDocument, file: Blob, documentTitle: string) {
  if (isPdfDocument(document, file)) {
    return extractPdfText(file);
  }

  throw new DocumentTextExtractionError(
    `${documentTitle}-controle kan server-side alleen tekst uit PDF lezen. JPG en PNG worden bij upload met gratis browser-OCR gelezen.`,
    415,
  );
}
