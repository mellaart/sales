import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin-api";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { ensureProtectedAdminRole } from "@/lib/protected-admin-server";
import { DocumentTextExtractionError, extractWorldlineDocumentText } from "@/lib/worldline-document-text";
import { analyzeWorldlineBankStatementText } from "@/lib/worldline-bank-statement-check";
import { analyzeWorldlineGenericDocumentText } from "@/lib/worldline-generic-document-check";
import { analyzeWorldlineKvkText } from "@/lib/worldline-kvk-check";
import { WORLDLINE_DOCUMENT_BUCKET, getWorldlineDocumentDefinition, type WorldlineCheckResult, type WorldlineDocument, type WorldlineProject } from "@/lib/worldline";
import type { UserRole } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function keepString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function keepNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readCheckResult(value: unknown) {
  return value && typeof value === "object" ? value as WorldlineCheckResult : {};
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

async function verifyUser(request: Request, service: NonNullable<ReturnType<typeof getServiceClient>>) {
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

function canCheckWorldlineDocument(
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
  try {
    const service = getServiceClient();

    if (!service) {
      return jsonResponse({ error: "Server configuratie ontbreekt." }, 500);
    }

    const verified = await verifyUser(request, service);
    if (!verified.ok) {
      return jsonResponse({ error: verified.message }, 401);
    }

    const body = (await request.json().catch(() => null)) as { documentId?: unknown; ocrText?: unknown } | null;
    const documentId = normalizeText(body?.documentId);
    const incomingOcrText = normalizeText(body?.ocrText);

    if (!documentId) {
      return jsonResponse({ error: "Geen document ontvangen." }, 400);
    }

    const { data: documentRow, error: documentError } = await service
      .from("worldline_documents")
      .select("*")
      .eq("id", documentId)
      .maybeSingle();

    if (documentError || !documentRow) {
      return jsonResponse({ error: documentError?.message ?? "Document niet gevonden." }, 404);
    }

    const document = documentRow as WorldlineDocument;

    const { data: projectRow, error: projectError } = await service
      .from("worldline_projects")
      .select("*")
      .eq("id", document.project_id)
      .maybeSingle();

    if (projectError || !projectRow) {
      return jsonResponse({ error: projectError?.message ?? "Worldline-project niet gevonden." }, 404);
    }

    const project = projectRow as WorldlineProject;

    if (!canCheckWorldlineDocument(verified, project)) {
      return jsonResponse({ error: "Geen toegang tot dit Worldline-project." }, 403);
    }

    const documentTitle = getWorldlineDocumentDefinition(document.document_type)?.title ?? "Document";
    const currentResult = readCheckResult(document.check_result);
    let documentText = incomingOcrText || normalizeText(currentResult.ocrText);

    if (!documentText) {
      const { data: file, error: storageError } = await service.storage
        .from(WORLDLINE_DOCUMENT_BUCKET)
        .download(document.storage_path);

      if (storageError || !file) {
        return jsonResponse({ error: storageError?.message ?? "Document kon niet worden opgehaald." }, 500);
      }

      documentText = await extractWorldlineDocumentText(document, file, documentTitle);
    }

    if (!documentText) {
      return jsonResponse({ error: `Geen selecteerbare tekst gevonden in ${documentTitle}. Automatische controle werkt alleen met PDF's waarin tekst selecteerbaar is.` }, 422);
    }

    const agreementFields = project.agreement_fields && typeof project.agreement_fields === "object"
      ? project.agreement_fields as Record<string, unknown>
      : {};
    const expectedCompanyName = normalizeText(agreementFields.companyName) || project.relation_name;
    const documentTitleFromResult = normalizeText(currentResult.documentTitle);
    let expectedSignerNames = normalizeText(agreementFields.signers) || normalizeText(agreementFields.contactPerson);
    let supportingIdentityDocumentNames: string[] = [];
    let supportingIdentityOcrTexts: string[] = [];

    if (document.document_type === "identity") {
      const { data: projectDocuments } = await service
        .from("worldline_documents")
        .select("id,document_type,file_name,check_result")
        .eq("project_id", document.project_id)
        .in("document_type", ["identity", "kvk"]);

      const rows = (projectDocuments ?? []) as Array<{
        id?: string | null;
        document_type?: WorldlineDocument["document_type"] | null;
        file_name?: string | null;
        check_result?: unknown;
      }>;
      const currentFileName = normalizeText(document.file_name).toLowerCase();
      supportingIdentityDocumentNames = rows
        .filter((item) => item.document_type === "identity" && item.id !== document.id)
        .map((item) => normalizeText(item.file_name))
        .filter((fileName) => fileName.toLowerCase() !== currentFileName)
        .filter(Boolean);
      supportingIdentityOcrTexts = rows
        .filter((item) => item.document_type === "identity" && item.id !== document.id)
        .map((item) => normalizeText(readCheckResult(item.check_result).ocrText))
        .filter(Boolean);

      const kvkSignerNames = rows
        .filter((item) => item.document_type === "kvk")
        .flatMap((item) => getStringArray(readCheckResult(item.check_result).authorizedSigners));
      expectedSignerNames = uniqueStrings([expectedSignerNames, ...kvkSignerNames]).join(", ");
    }

    const analysis = document.document_type === "kvk"
      ? (() => {
          const kvkNumber = normalizeText(currentResult.kvkNumber) || (document.file_name.match(/\b\d{8}\b/)?.[0] ?? "");
          return service
            .from("worldline_documents")
            .select("id,file_name")
            .eq("project_id", document.project_id)
            .eq("document_type", "kvk")
            .then(({ data: projectKvkDocuments }) => {
              const supportingDocumentNames = ((projectKvkDocuments ?? []) as Array<{ id?: string | null; file_name?: string | null }>)
                .filter((item) => item.id !== document.id)
                .map((item) => normalizeText(item.file_name))
                .filter(Boolean);
              return analyzeWorldlineKvkText(documentText, kvkNumber, new Date(), {
                expectedCompanyName,
                supportingDocumentNames,
              });
            });
        })()
      : document.document_type === "bank_statement"
        ? Promise.resolve(analyzeWorldlineBankStatementText(documentText, new Date(), {
            expectedCompanyName,
            expectedIban: normalizeText(agreementFields.iban),
          }))
        : Promise.resolve(analyzeWorldlineGenericDocumentText(document.document_type, documentText, {
            expectedCompanyName,
            expectedIban: normalizeText(agreementFields.iban),
            expectedSignerNames,
            documentName: normalizeText(document.file_name),
            supportingDocumentNames: supportingIdentityDocumentNames,
            supportingOcrTexts: supportingIdentityOcrTexts,
          }));
    const resolvedAnalysis = await analysis;
    const nextOcrText = incomingOcrText || keepString(currentResult.ocrText);
    const nextCheckResult = {
      ...resolvedAnalysis.result,
      ...(currentResult.convertedFromImage === true ? { convertedFromImage: true } : {}),
      ...(currentResult.uploadedAsImage === true ? { uploadedAsImage: true } : {}),
      ...(documentTitleFromResult ? { documentTitle: documentTitleFromResult } : {}),
      ...(keepNumber(currentResult.ocrConfidence) !== undefined ? { ocrConfidence: keepNumber(currentResult.ocrConfidence) } : {}),
      ...(incomingOcrText ? { ocrEngine: "tesseract.js/pdf" } : keepString(currentResult.ocrEngine) ? { ocrEngine: keepString(currentResult.ocrEngine) } : {}),
      ...(keepString(currentResult.ocrError) ? { ocrError: keepString(currentResult.ocrError) } : {}),
      ...(nextOcrText ? { ocrText: nextOcrText } : {}),
      ...(keepString(currentResult.originalFileName) ? { originalFileName: keepString(currentResult.originalFileName) } : {}),
      ...(keepString(currentResult.originalMimeType) ? { originalMimeType: keepString(currentResult.originalMimeType) } : {}),
    };

    const { data: updatedDocument, error: updateError } = await service
      .from("worldline_documents")
      .update({
        check_status: resolvedAnalysis.status,
        check_result: nextCheckResult,
      } as never)
      .eq("id", document.id)
      .select("*")
      .single();

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
    }

    return jsonResponse({
      document: updatedDocument,
      message: resolvedAnalysis.message,
    });
  } catch (error) {
    if (error instanceof DocumentTextExtractionError) {
      return jsonResponse({ error: error.message }, error.status);
    }

    const message = error instanceof Error ? error.message : "Documentcontrole mislukt.";
    return jsonResponse({ error: message }, 500);
  }
}
