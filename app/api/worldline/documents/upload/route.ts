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

const VALID_DOCUMENT_TYPES = new Set<WorldlineDocumentType>(["kvk", "agreement", "identity", "bank_statement", "refund"]);

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
  if (file.type) return file.type;

  if (/\.pdf$/i.test(file.name)) return "application/pdf";
  if (/\.jpe?g$/i.test(file.name)) return "image/jpeg";
  if (/\.png$/i.test(file.name)) return "image/png";
  return "application/octet-stream";
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
