import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { WorldlineDocument } from "@/lib/worldline";

type PdfParseResult = {
  text?: string;
};

type PdfParse = (data: Buffer, options?: unknown) => Promise<PdfParseResult>;

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type TesseractLanguageData = {
  code: string;
  gzip: boolean;
  langPath: string;
};

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

function getEnglishTesseractData() {
  return require("@tesseract.js-data/eng") as TesseractLanguageData;
}

function getTesseractWorkerPath() {
  return require.resolve("tesseract.js/src/worker-script/node/index.js");
}

function getTesseractCorePath() {
  const tesseractPackageDir = dirname(dirname(dirname(dirname(getTesseractWorkerPath()))));
  return dirname(require.resolve("tesseract.js-core/package.json", { paths: [tesseractPackageDir] }));
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
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  return "";
}

function isPdfDocument(document: WorldlineDocument, file: Blob) {
  const mimeType = getDocumentMimeType(document, file);
  return mimeType.includes("pdf") || /\.pdf$/i.test(document.file_name);
}

function isImageDocument(document: WorldlineDocument, file: Blob) {
  const mimeType = getDocumentMimeType(document, file);
  return mimeType.startsWith("image/") || /\.(jpe?g|png)$/i.test(document.file_name);
}

async function extractPdfText(file: Blob) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const pdfParse = getPdfParse();
  const parsed = await pdfParse(buffer);
  return normalizeText(parsed.text);
}

async function extractImageTextWithTesseract(buffer: Buffer) {
  const [{ createWorker, OEM, PSM }, languageData] = await Promise.all([
    import("tesseract.js"),
    Promise.resolve(getEnglishTesseractData()),
  ]);
  const worker = await createWorker(languageData.code, OEM.LSTM_ONLY, {
    cachePath: "/tmp/tesseract-cache",
    corePath: getTesseractCorePath(),
    gzip: languageData.gzip,
    langPath: languageData.langPath,
    workerPath: getTesseractWorkerPath(),
  });

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: PSM.AUTO,
    });
    const result = await worker.recognize(buffer);
    return normalizeText(result.data.text);
  } finally {
    await worker.terminate();
  }
}

async function extractImageTextWithOpenAi(buffer: Buffer, documentTitle: string, mimeType: string) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new DocumentTextExtractionError(
      `${documentTitle}-controle kon geen tekst lezen uit deze afbeelding. Upload eventueel een PDF of een scherpere JPG/PNG.`,
      503,
    );
  }

  const model = process.env.OPENAI_OCR_MODEL?.trim() || "gpt-4o-mini";
  const imageMimeType = mimeType || "image/jpeg";
  const imageUrl = `data:${imageMimeType};base64,${buffer.toString("base64")}`;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 2200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "Lees alle zichtbare tekst uit deze afbeelding voor een documentcontrole.",
                "Geef alleen de gevonden tekst terug, zonder uitleg of samenvatting.",
                "Behoud belangrijke gegevens zoals datums, IBAN, banknaam, bedrijfsnaam, KvK-nummer, namen en adressen.",
              ].join(" "),
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
    }),
  });

  const json = (await response.json().catch(() => ({}))) as OpenAiChatCompletionResponse;
  if (!response.ok) {
    throw new DocumentTextExtractionError(
      `${documentTitle}-OCR mislukt: ${json.error?.message ?? response.statusText}.`,
      response.status,
    );
  }

  return normalizeText(json.choices?.[0]?.message?.content);
}

async function extractImageText(file: Blob, documentTitle: string, mimeType: string) {
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const text = await extractImageTextWithTesseract(buffer);
    if (text) return text;
  } catch (error) {
    console.warn(`${documentTitle}-OCR via Tesseract mislukt`, error);
  }

  return extractImageTextWithOpenAi(buffer, documentTitle, mimeType || file.type || "image/jpeg");
}

export async function extractWorldlineDocumentText(document: WorldlineDocument, file: Blob, documentTitle: string) {
  const mimeType = getDocumentMimeType(document, file);

  if (isPdfDocument(document, file)) {
    return extractPdfText(file);
  }

  if (isImageDocument(document, file)) {
    return extractImageText(file, documentTitle, mimeType);
  }

  throw new DocumentTextExtractionError(
    `${documentTitle}-controle ondersteunt nu PDF, JPG en PNG.`,
    415,
  );
}
