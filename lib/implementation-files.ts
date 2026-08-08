export const IMPLEMENTATION_FILE_BUCKET = "implementation-customer-files";
export const IMPLEMENTATION_FILE_MAX_SIZE = 25 * 1024 * 1024;

export const IMPLEMENTATION_FILE_CATEGORIES = [
  "branding",
  "relations",
  "articles",
] as const;

export type ImplementationFileCategory = typeof IMPLEMENTATION_FILE_CATEGORIES[number];

export const IMPLEMENTATION_FILE_STATUSES = ["received", "checked"] as const;
export type ImplementationFileStatus = typeof IMPLEMENTATION_FILE_STATUSES[number];

export type ImplementationCustomerFile = {
  id: string;
  implementationId: string;
  category: ImplementationFileCategory;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: ImplementationFileStatus;
  uploadedAt: string;
  checkedAt: string | null;
};

export type ImplementationFileCategoryDefinition = {
  key: ImplementationFileCategory;
  label: string;
  description: string;
  acceptedLabel: string;
  accept: string;
  extensions: string[];
};

export const IMPLEMENTATION_FILE_CATEGORY_DEFINITIONS: ImplementationFileCategoryDefinition[] = [
  {
    key: "branding",
    label: "Briefpapier en logo",
    description: "Lever het briefpapier en het logo in de best beschikbare kwaliteit aan.",
    acceptedLabel: "PDF, Word, PNG, JPG of SVG",
    accept: ".pdf,.doc,.docx,.png,.jpg,.jpeg,.svg",
    extensions: ["pdf", "doc", "docx", "png", "jpg", "jpeg", "svg"],
  },
  {
    key: "relations",
    label: "Relaties",
    description: "Lever het bestand met klanten en leveranciers aan.",
    acceptedLabel: "CSV, XLS of XLSX",
    accept: ".csv,.xls,.xlsx",
    extensions: ["csv", "xls", "xlsx"],
  },
  {
    key: "articles",
    label: "Artikelen",
    description: "Lever het bestand met artikelen, prijzen en eventuele voorraadgegevens aan.",
    acceptedLabel: "CSV, XLS of XLSX",
    accept: ".csv,.xls,.xlsx",
    extensions: ["csv", "xls", "xlsx"],
  },
];

export function isImplementationFileCategory(
  value: unknown,
): value is ImplementationFileCategory {
  return IMPLEMENTATION_FILE_CATEGORIES.includes(value as ImplementationFileCategory);
}

export function isImplementationFileStatus(value: unknown): value is ImplementationFileStatus {
  return IMPLEMENTATION_FILE_STATUSES.includes(value as ImplementationFileStatus);
}

export function implementationFileExtension(fileName: string) {
  const match = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

export function implementationFileCategoryDefinition(category: ImplementationFileCategory) {
  return IMPLEMENTATION_FILE_CATEGORY_DEFINITIONS.find((item) => item.key === category)
    ?? IMPLEMENTATION_FILE_CATEGORY_DEFINITIONS[0];
}

export function implementationFileMimeType(fileName: string) {
  const extension = implementationFileExtension(fileName);
  const mimeTypes: Record<string, string> = {
    csv: "text/csv",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    pdf: "application/pdf",
    png: "image/png",
    svg: "image/svg+xml",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return mimeTypes[extension] ?? "application/octet-stream";
}

export function implementationFileAttachmentHeader(fileName: string) {
  const encoded = encodeURIComponent(fileName).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
  return `attachment; filename*=UTF-8''${encoded}`;
}
