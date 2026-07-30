export type PdfImageAsset = {
  dataUrl: string;
  format: "JPEG" | "PNG";
  alias: string;
};

type PdfImageOptions = {
  alias: string;
  maxWidth: number;
  maxHeight: number;
  quality?: number;
};

const imageCache = new Map<string, Promise<PdfImageAsset | null>>();

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Afbeelding kon niet worden verwerkt."));
    image.src = url;
  });
}

async function createCompressedImage(
  blob: Blob,
  options: PdfImageOptions,
): Promise<PdfImageAsset> {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(
      1,
      options.maxWidth / image.naturalWidth,
      options.maxHeight / image.naturalHeight,
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Afbeeldingscompressie is niet beschikbaar.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    return {
      dataUrl: canvas.toDataURL("image/jpeg", options.quality ?? 0.9),
      format: "JPEG",
      alias: options.alias,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function fetchPdfImage(
  url: string,
  options: PdfImageOptions,
): Promise<PdfImageAsset | null> {
  if (typeof window === "undefined") return null;

  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) return null;

    const blob = await response.blob();

    try {
      return await createCompressedImage(blob, options);
    } catch {
      return {
        dataUrl: await blobToDataUrl(blob),
        format: blob.type === "image/jpeg" ? "JPEG" : "PNG",
        alias: options.alias,
      };
    }
  } catch {
    return null;
  }
}

export function loadPdfImage(
  url: string,
  options: PdfImageOptions,
): Promise<PdfImageAsset | null> {
  const cacheKey = [
    url,
    options.alias,
    options.maxWidth,
    options.maxHeight,
    options.quality ?? 0.9,
  ].join(":");

  let pendingImage = imageCache.get(cacheKey);
  if (!pendingImage) {
    pendingImage = fetchPdfImage(url, options);
    imageCache.set(cacheKey, pendingImage);
  }

  return pendingImage;
}
