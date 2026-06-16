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

function getDutchTesseractData() {
  return require("@tesseract.js-data/nld") as TesseractLanguageData;
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

async function createOcrImageVariants(buffer: Buffer) {
  const variants: Array<{ label: string; buffer: Buffer }> = [{ label: "origineel", buffer }];

  try {
    const sharp = (await import("sharp")).default;
    const image = sharp(buffer, { failOn: "none", limitInputPixels: false }).rotate();
    const metadata = await image.metadata();
    const sourceWidth = metadata.width ?? 0;
    const sourceHeight = metadata.height ?? 0;
    const targetWidth = sourceWidth > 0 && sourceWidth < 1800 ? 2600 : 2800;
    const base = image
      .resize({ width: targetWidth, withoutEnlargement: sourceWidth >= 1800 })
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1 });

    const normalized = await base.clone().png({ compressionLevel: 9 }).toBuffer();
    variants.unshift({ label: "opgeschoond", buffer: normalized });

    const highContrast = await base.clone().linear(1.15, -12).threshold(160).png({ compressionLevel: 9 }).toBuffer();
    variants.push({ label: "hoog contrast", buffer: highContrast });

    const highContrastSoft = await base.clone().linear(1.08, -6).threshold(190).png({ compressionLevel: 9 }).toBuffer();
    variants.push({ label: "hoog contrast licht", buffer: highContrastSoft });

    const inverted = await base.clone().negate().normalize().png({ compressionLevel: 9 }).toBuffer();
    variants.push({ label: "donkere modus", buffer: inverted });

    if (sourceWidth > sourceHeight * 1.2) {
      const rotateRight = await base.clone().rotate(90).png({ compressionLevel: 9 }).toBuffer();
      const rotateLeft = await base.clone().rotate(270).png({ compressionLevel: 9 }).toBuffer();
      variants.push({ label: "90 graden", buffer: rotateRight });
      variants.push({ label: "270 graden", buffer: rotateLeft });
    }
  } catch (error) {
    console.warn("Afbeelding voorbereiden voor OCR mislukt", error);
  }

  return variants;
}

function combineUniqueText(values: string[]) {
  const seen = new Set<string>();
  return values
    .map(normalizeText)
    .filter(Boolean)
    .filter((value) => {
      const key = value.replace(/\s+/g, " ").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n\n");
}

function uniqueList(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getOpenAiOcrModels() {
  const configuredModels = [
    process.env.OPENAI_OCR_MODELS,
    process.env.OPENAI_OCR_MODEL,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim());

  return uniqueList([
    ...configuredModels,
    "gpt-4.1-mini",
    "gpt-4o-mini",
    "gpt-4.1",
    "gpt-4o",
  ]);
}

async function createTesseractWorker(languageData: TesseractLanguageData) {
  const { createWorker, OEM } = await import("tesseract.js");
  return createWorker(languageData.code, OEM.LSTM_ONLY, {
    cachePath: "/tmp/tesseract-cache",
    corePath: getTesseractCorePath(),
    gzip: languageData.gzip,
    langPath: languageData.langPath,
    workerPath: getTesseractWorkerPath(),
  });
}

async function recognizeImageWithTesseractWorker(
  worker: import("tesseract.js").Worker,
  buffer: Buffer,
  pageSegmentationMode: import("tesseract.js").PSM,
) {
  await worker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: pageSegmentationMode,
    user_defined_dpi: "300",
  });
  const result = await worker.recognize(buffer);
  return normalizeText(result.data.text);
}

async function recognizeImagesWithTesseract(
  attempts: Array<{ variant: { label: string; buffer: Buffer }; psm: import("tesseract.js").PSM }>,
  languageData: TesseractLanguageData,
) {
  const worker = await createTesseractWorker(languageData);
  const results: string[] = [];

  try {
    for (const attempt of attempts) {
      try {
        const text = await recognizeImageWithTesseractWorker(worker, attempt.variant.buffer, attempt.psm);
        if (text) results.push(text);
      } catch (error) {
        console.warn(
          `OCR-poging mislukt (${attempt.variant.label}, ${languageData.code}, PSM ${attempt.psm})`,
          error,
        );
      }
    }
  } finally {
    await worker.terminate();
  }

  return results;
}

async function extractImageTextWithTesseract(buffer: Buffer) {
  const { PSM } = await import("tesseract.js");
  const variants = await createOcrImageVariants(buffer);
  const getVariant = (label: string) => variants.find((item) => item.label === label);
  const dutchAttempts = [
    { variant: getVariant("opgeschoond"), psm: PSM.AUTO },
    { variant: getVariant("opgeschoond"), psm: PSM.SPARSE_TEXT },
    { variant: getVariant("hoog contrast"), psm: PSM.SPARSE_TEXT },
    { variant: getVariant("hoog contrast licht"), psm: PSM.SPARSE_TEXT },
    { variant: getVariant("donkere modus"), psm: PSM.SPARSE_TEXT },
    { variant: getVariant("90 graden"), psm: PSM.SPARSE_TEXT },
    { variant: getVariant("270 graden"), psm: PSM.SPARSE_TEXT },
    { variant: getVariant("origineel"), psm: PSM.SPARSE_TEXT },
  ].filter((attempt): attempt is { variant: { label: string; buffer: Buffer }; psm: import("tesseract.js").PSM } => Boolean(attempt.variant));
  const englishAttempts = [
    { variant: getVariant("opgeschoond"), psm: PSM.SPARSE_TEXT },
    { variant: getVariant("donkere modus"), psm: PSM.SPARSE_TEXT },
  ].filter((attempt): attempt is { variant: { label: string; buffer: Buffer }; psm: import("tesseract.js").PSM } => Boolean(attempt.variant));
  const results = [
    ...await recognizeImagesWithTesseract(dutchAttempts, getDutchTesseractData()),
  ];

  if (!combineUniqueText(results)) {
    results.push(...await recognizeImagesWithTesseract(englishAttempts, getEnglishTesseractData()));
  }

  return combineUniqueText(results);
}

async function extractImageTextWithOpenAi(buffer: Buffer, documentTitle: string, mimeType: string) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new DocumentTextExtractionError(
      `${documentTitle}-controle kon geen tekst lezen uit deze afbeelding. Upload eventueel een PDF of een scherpere JPG/PNG.`,
      503,
    );
  }

  const imageMimeType = mimeType || "image/jpeg";
  const imageUrl = `data:${imageMimeType};base64,${buffer.toString("base64")}`;
  const errors: string[] = [];

  for (const model of getOpenAiOcrModels()) {
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
    if (response.ok) {
      const text = normalizeText(json.choices?.[0]?.message?.content);
      if (text) return text;
      errors.push(`${model}: geen tekst teruggekregen`);
      continue;
    }

    const message = json.error?.message ?? response.statusText;
    errors.push(`${model}: ${message}`);

    if (response.status === 401 || response.status === 403) {
      throw new DocumentTextExtractionError(
        `${documentTitle}-OCR mislukt: OpenAI API-sleutel of rechten zijn niet geldig (${message}).`,
        response.status,
      );
    }
  }

  const attemptedModels = getOpenAiOcrModels().join(", ");
  const lastError = errors.at(-1) ?? "geen details ontvangen";
  throw new DocumentTextExtractionError(
    `${documentTitle}-OCR is tijdelijk niet beschikbaar of kon geen tekst lezen. Geprobeerd: ${attemptedModels}. Laatste melding: ${lastError}.`,
    503,
  );
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
