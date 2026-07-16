import { NextResponse } from "next/server";
import { getServiceClient, type ServiceClient } from "@/lib/admin-api";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { ensureProtectedAdminRole } from "@/lib/protected-admin-server";
import {
  WORLDLINE_DOCUMENT_BUCKET,
  getWorldlineDocumentDefinition,
  type WorldlineCheckResult,
  type WorldlineDocument,
  type WorldlineDocumentType,
  type WorldlineProject,
} from "@/lib/worldline";
import type { UserRole } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_DOCUMENT_TYPES = new Set<WorldlineDocumentType>(["kvk", "agreement", "identity", "bank_statement", "refund", "ubo"]);

type UploadPrepareBody = {
  action?: unknown;
  projectId?: unknown;
  documentType?: unknown;
  fileName?: unknown;
  fileSize?: unknown;
  mimeType?: unknown;
  checkResult?: unknown;
};

type UploadCompleteBody = UploadPrepareBody & {
  storagePath?: unknown;
  version?: unknown;
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function getDocumentTitleFromFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop() ?? fileName;
  const title = baseName.replace(/\.[^.]+$/, "").replace(/\s+/g, " ").trim();
  return title || baseName || "Document";
}

function getDocumentTitleKey(value: string) {
  return sanitizeFileName(value) || "document";
}

function extractKvkNumberFromText(value: string) {
  return value.match(/\b\d{8}\b/)?.[0] ?? "";
}

function readCheckResult(value: unknown) {
  return value && typeof value === "object" ? value as WorldlineCheckResult : {};
}

function getDocumentTitle(document: Pick<WorldlineDocument, "file_name" | "check_result">) {
  const checkResult = readCheckResult(document.check_result);
  return normalizeText(checkResult.documentTitle) || getDocumentTitleFromFileName(document.file_name);
}

function getDocumentKvkNumber(document: Pick<WorldlineDocument, "file_name" | "check_result">) {
  const checkResult = readCheckResult(document.check_result);
  return normalizeText(checkResult.kvkNumber) || extractKvkNumberFromText(document.file_name);
}

function parseCheckResult(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as WorldlineCheckResult : {};
  } catch {
    return {};
  }
}

function getFileFromFormData(value: FormDataEntryValue | null) {
  if (!value || typeof value === "string") return null;
  return value;
}

function inferMimeType(file: File) {
  return inferMimeTypeFromName(file.name, file.type);
}

function inferMimeTypeFromName(fileName: string, providedMimeType?: unknown) {
  const mimeType = normalizeText(providedMimeType);
  if (mimeType) return mimeType;

  if (/\.pdf$/i.test(fileName)) return "application/pdf";
  if (/\.jpe?g$/i.test(fileName)) return "image/jpeg";
  if (/\.png$/i.test(fileName)) return "image/png";
  return "application/octet-stream";
}

function normalizeFileSize(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
}

async function verifyUser(request: Request, service: ServiceClient) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return { ok: false as const, message: "Niet ingelogd." };

  const { data: userData, error: userError } = await service.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false as const, message: "Ongeldige sessie." };
  }

  await ensureProtectedAdminRole(service, userData.user);

  const { data: profile } = await service
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  return {
    ok: true as const,
    userId: userData.user.id,
    email: userData.user.email ?? null,
    role: ((profile as { role?: UserRole } | null)?.role ?? "sales") as UserRole,
  };
}

function canUploadDocument(
  user: { userId: string; email: string | null; role: UserRole },
  project: Pick<WorldlineProject, "created_by">,
) {
  return (
    project.created_by === user.userId ||
    user.role === "admin" ||
    user.role === "manager" ||
    user.role === "worldline" ||
    isProtectedAdminEmail(user.email)
  );
}

async function loadAuthorizedProject(
  service: ServiceClient,
  user: { userId: string; email: string | null; role: UserRole },
  projectId: string,
) {
  const { data: projectRow, error: projectError } = await service
    .from("worldline_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError || !projectRow) {
    return {
      ok: false as const,
      response: jsonResponse({ error: projectError?.message ?? "Worldline-project niet gevonden." }, 404),
    };
  }

  const project = projectRow as WorldlineProject;
  if (!canUploadDocument(user, project)) {
    return {
      ok: false as const,
      response: jsonResponse({ error: "Geen toegang tot dit Worldline-project." }, 403),
    };
  }

  return { ok: true as const, project };
}

function validateDocumentInput(documentType: WorldlineDocumentType, fileName: string, mimeType: string) {
  const definition = getWorldlineDocumentDefinition(documentType);
  const acceptedTypes = (definition?.accept ?? "").split(",").map((item) => item.trim()).filter(Boolean);

  if (!fileName) {
    return "Geen bestandsnaam ontvangen.";
  }

  if (acceptedTypes.length > 0 && !acceptedTypes.includes(mimeType)) {
    return `Bestandstype wordt niet ondersteund: ${mimeType || "onbekend"}.`;
  }

  return "";
}

async function prepareSignedUpload(service: ServiceClient, verified: Extract<Awaited<ReturnType<typeof verifyUser>>, { ok: true }>, body: UploadPrepareBody) {
  const projectId = normalizeText(body.projectId);
  const documentType = normalizeText(body.documentType) as WorldlineDocumentType;
  const fileName = normalizeText(body.fileName);
  const mimeType = inferMimeTypeFromName(fileName, body.mimeType);
  const checkResult = readCheckResult(body.checkResult);

  if (!projectId || !VALID_DOCUMENT_TYPES.has(documentType)) {
    return jsonResponse({ error: "Documentgegevens ontbreken." }, 400);
  }

  const validationError = validateDocumentInput(documentType, fileName, mimeType);
  if (validationError) {
    return jsonResponse({ error: validationError }, 400);
  }

  const projectResult = await loadAuthorizedProject(service, verified, projectId);
  if (!projectResult.ok) return projectResult.response;

  const project = projectResult.project;
  const documentTitle = normalizeText(checkResult.documentTitle) || getDocumentTitleFromFileName(fileName);
  const documentTitleKey = getDocumentTitleKey(documentTitle);
  const kvkNumber = documentType === "kvk"
    ? normalizeText(checkResult.kvkNumber) || extractKvkNumberFromText(fileName)
    : "";

  if (documentType === "kvk" && !kvkNumber) {
    return jsonResponse({ error: "Gebruik voor KvK een bestandsnaam zoals 'Uittreksel - 58048472.pdf'." }, 400);
  }

  const { data: versionRows, error: versionError } = await service
    .from("worldline_documents")
    .select("file_name,version,check_result")
    .eq("project_id", projectId)
    .eq("document_type", documentType);

  if (versionError) {
    return jsonResponse({ error: versionError.message }, 500);
  }

  const matchingDocuments = ((versionRows ?? []) as Array<Pick<WorldlineDocument, "file_name" | "version" | "check_result">>)
    .filter((document) => {
      if (documentType === "kvk") return getDocumentKvkNumber(document) === kvkNumber;
      return getDocumentTitleKey(getDocumentTitle(document)) === documentTitleKey;
    });
  const nextVersion = Math.max(0, ...matchingDocuments.map((document) => document.version)) + 1;
  const storageGroup = documentType === "kvk" ? `${documentType}/${kvkNumber}` : `${documentType}/${documentTitleKey}`;
  const storagePath = `${project.relation_id}/${project.id}/${storageGroup}/v${nextVersion}-${Date.now()}-${sanitizeFileName(fileName) || "document"}`;

  const signedUpload = await service.storage
    .from(WORLDLINE_DOCUMENT_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (signedUpload.error || !signedUpload.data) {
    return jsonResponse({ error: signedUpload.error?.message ?? "Uploadlink aanmaken mislukt." }, 500);
  }

  return jsonResponse({
    upload: {
      storagePath,
      signedPath: signedUpload.data.path,
      token: signedUpload.data.token,
      version: nextVersion,
      mimeType,
      documentTitle,
      kvkNumber,
    },
  });
}

async function completeSignedUpload(service: ServiceClient, verified: Extract<Awaited<ReturnType<typeof verifyUser>>, { ok: true }>, body: UploadCompleteBody) {
  const projectId = normalizeText(body.projectId);
  const documentType = normalizeText(body.documentType) as WorldlineDocumentType;
  const fileName = normalizeText(body.fileName);
  const storagePath = normalizeText(body.storagePath);
  const version = Number(body.version);
  const mimeType = inferMimeTypeFromName(fileName, body.mimeType);
  const fileSize = normalizeFileSize(body.fileSize);
  const checkResult = readCheckResult(body.checkResult);

  if (!projectId || !VALID_DOCUMENT_TYPES.has(documentType)) {
    return jsonResponse({ error: "Documentgegevens ontbreken." }, 400);
  }

  if (!storagePath || !Number.isInteger(version) || version < 1) {
    return jsonResponse({ error: "Uploadregistratie is niet compleet." }, 400);
  }

  const validationError = validateDocumentInput(documentType, fileName, mimeType);
  if (validationError) {
    return jsonResponse({ error: validationError }, 400);
  }

  const projectResult = await loadAuthorizedProject(service, verified, projectId);
  if (!projectResult.ok) return projectResult.response;

  const project = projectResult.project;
  const expectedPrefix = `${project.relation_id}/${project.id}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    return jsonResponse({ error: "Uploadpad hoort niet bij dit Worldline-project." }, 400);
  }

  const documentTitle = normalizeText(checkResult.documentTitle) || getDocumentTitleFromFileName(fileName);
  const kvkNumber = documentType === "kvk"
    ? normalizeText(checkResult.kvkNumber) || extractKvkNumberFromText(fileName)
    : "";

  if (documentType === "kvk" && !kvkNumber) {
    return jsonResponse({ error: "Gebruik voor KvK een bestandsnaam zoals 'Uittreksel - 58048472.pdf'." }, 400);
  }

  const nextCheckResult: WorldlineCheckResult = {
    ...checkResult,
    documentTitle,
    ...(documentType === "kvk" ? { kvkNumber } : {}),
  };

  const { data, error } = await service
    .from("worldline_documents")
    .insert({
      project_id: projectId,
      document_type: documentType,
      file_name: fileName,
      storage_path: storagePath,
      mime_type: mimeType,
      file_size: fileSize,
      version,
      check_status: "uploaded",
      check_result: nextCheckResult,
      uploaded_by: verified.userId,
    } as never)
    .select("*")
    .single();

  if (error) {
    await service.storage.from(WORLDLINE_DOCUMENT_BUCKET).remove([storagePath]);
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ document: data as WorldlineDocument });
}

export async function POST(request: Request) {
  let uploadedStoragePath = "";

  try {
    const service = getServiceClient();
    if (!service) {
      return jsonResponse({ error: "Server configuratie ontbreekt." }, 500);
    }

    const verified = await verifyUser(request, service);
    if (!verified.ok) {
      return jsonResponse({ error: verified.message }, 401);
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as UploadPrepareBody | UploadCompleteBody | null;
      const action = normalizeText(body?.action);

      if (action === "prepare") {
        return prepareSignedUpload(service, verified, body ?? {});
      }

      if (action === "complete") {
        return completeSignedUpload(service, verified, body ?? {});
      }

      return jsonResponse({ error: "Onbekende uploadactie." }, 400);
    }

    const formData = await request.formData();
    const projectId = normalizeText(formData.get("projectId"));
    const documentType = normalizeText(formData.get("documentType")) as WorldlineDocumentType;
    const file = getFileFromFormData(formData.get("file"));
    const checkResult = parseCheckResult(formData.get("checkResult"));

    if (!projectId || !VALID_DOCUMENT_TYPES.has(documentType)) {
      return jsonResponse({ error: "Documentgegevens ontbreken." }, 400);
    }

    if (!file) {
      return jsonResponse({ error: "Geen bestand ontvangen." }, 400);
    }

    const definition = getWorldlineDocumentDefinition(documentType);
    const mimeType = inferMimeType(file);
    const acceptedTypes = (definition?.accept ?? "").split(",").map((item) => item.trim()).filter(Boolean);

    if (acceptedTypes.length > 0 && !acceptedTypes.includes(mimeType)) {
      return jsonResponse({ error: `Bestandstype wordt niet ondersteund: ${mimeType || "onbekend"}.` }, 400);
    }

    const { data: projectRow, error: projectError } = await service
      .from("worldline_projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError || !projectRow) {
      return jsonResponse({ error: projectError?.message ?? "Worldline-project niet gevonden." }, 404);
    }

    const project = projectRow as WorldlineProject;
    if (!canUploadDocument(verified, project)) {
      return jsonResponse({ error: "Geen toegang tot dit Worldline-project." }, 403);
    }

    const documentTitle = normalizeText(checkResult.documentTitle) || getDocumentTitleFromFileName(file.name);
    const documentTitleKey = getDocumentTitleKey(documentTitle);
    const kvkNumber = documentType === "kvk"
      ? normalizeText(checkResult.kvkNumber) || extractKvkNumberFromText(file.name)
      : "";

    if (documentType === "kvk" && !kvkNumber) {
      return jsonResponse({ error: "Gebruik voor KvK een bestandsnaam zoals 'Uittreksel - 58048472.pdf'." }, 400);
    }

    const { data: versionRows, error: versionError } = await service
      .from("worldline_documents")
      .select("file_name,version,check_result")
      .eq("project_id", projectId)
      .eq("document_type", documentType);

    if (versionError) {
      return jsonResponse({ error: versionError.message }, 500);
    }

    const matchingDocuments = ((versionRows ?? []) as Array<Pick<WorldlineDocument, "file_name" | "version" | "check_result">>)
      .filter((document) => {
        if (documentType === "kvk") return getDocumentKvkNumber(document) === kvkNumber;
        return getDocumentTitleKey(getDocumentTitle(document)) === documentTitleKey;
      });
    const nextVersion = Math.max(0, ...matchingDocuments.map((document) => document.version)) + 1;
    const storageGroup = documentType === "kvk" ? `${documentType}/${kvkNumber}` : `${documentType}/${documentTitleKey}`;
    uploadedStoragePath = `${project.relation_id}/${project.id}/${storageGroup}/v${nextVersion}-${Date.now()}-${sanitizeFileName(file.name) || "document"}`;

    const uploadResult = await service.storage
      .from(WORLDLINE_DOCUMENT_BUCKET)
      .upload(uploadedStoragePath, file, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadResult.error) {
      return jsonResponse({ error: uploadResult.error.message }, 500);
    }

    const nextCheckResult: WorldlineCheckResult = {
      ...checkResult,
      documentTitle,
      ...(documentType === "kvk" ? { kvkNumber } : {}),
    };

    const { data, error } = await service
      .from("worldline_documents")
      .insert({
        project_id: projectId,
        document_type: documentType,
        file_name: file.name,
        storage_path: uploadedStoragePath,
        mime_type: mimeType,
        file_size: file.size,
        version: nextVersion,
        check_status: "uploaded",
        check_result: nextCheckResult,
        uploaded_by: verified.userId,
      } as never)
      .select("*")
      .single();

    if (error) {
      await service.storage.from(WORLDLINE_DOCUMENT_BUCKET).remove([uploadedStoragePath]);
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ document: data as WorldlineDocument });
  } catch (error) {
    const service = getServiceClient();
    if (service && uploadedStoragePath) {
      await service.storage.from(WORLDLINE_DOCUMENT_BUCKET).remove([uploadedStoragePath]);
    }

    const message = error instanceof Error ? error.message : "Document uploaden mislukt.";
    return jsonResponse({ error: message }, 500);
  }
}
