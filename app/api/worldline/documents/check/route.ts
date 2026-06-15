import { createRequire } from "node:module";
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin-api";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { ensureProtectedAdminRole } from "@/lib/protected-admin-server";
import { analyzeWorldlineBankStatementText } from "@/lib/worldline-bank-statement-check";
import { analyzeWorldlineKvkText } from "@/lib/worldline-kvk-check";
import { WORLDLINE_DOCUMENT_BUCKET, getWorldlineDocumentDefinition, type WorldlineDocument, type WorldlineProject } from "@/lib/worldline";
import type { UserRole } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PdfParseResult = {
  text?: string;
};

type PdfParse = (data: Buffer, options?: unknown) => Promise<PdfParseResult>;

const require = createRequire(import.meta.url);

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getPdfParse() {
  return require("pdf-parse/lib/pdf-parse.js") as PdfParse;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

async function extractPdfText(file: Blob) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const pdfParse = getPdfParse();
  const parsed = await pdfParse(buffer);
  return normalizeText(parsed.text);
}

function isPdfDocument(document: WorldlineDocument, file: Blob) {
  const mimeType = normalizeText(document.mime_type) || normalizeText(file.type);
  return mimeType.toLowerCase().includes("pdf") || /\.pdf$/i.test(document.file_name);
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

    const body = (await request.json().catch(() => null)) as { documentId?: unknown } | null;
    const documentId = normalizeText(body?.documentId);

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

    if (document.document_type !== "kvk" && document.document_type !== "bank_statement") {
      return jsonResponse({ error: "Deze automatische controle is nu beschikbaar voor KvK en Bankafschrift." }, 400);
    }

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

    const { data: file, error: storageError } = await service.storage
      .from(WORLDLINE_DOCUMENT_BUCKET)
      .download(document.storage_path);

    if (storageError || !file) {
      return jsonResponse({ error: storageError?.message ?? "Document kon niet worden opgehaald." }, 500);
    }

    const documentTitle = getWorldlineDocumentDefinition(document.document_type)?.title ?? "Document";

    if (!isPdfDocument(document, file)) {
      return jsonResponse({ error: `${documentTitle}-controle werkt nu alleen op PDF-bestanden met tekstlaag.` }, 415);
    }

    const pdfText = await extractPdfText(file);

    if (!pdfText) {
      return jsonResponse({ error: `Geen tekst gevonden in de ${documentTitle}-PDF. Controleer of dit geen scan zonder tekstlaag is.` }, 422);
    }

    const currentResult = document.check_result && typeof document.check_result === "object"
      ? document.check_result as { documentTitle?: unknown; kvkNumber?: unknown }
      : {};
    const agreementFields = project.agreement_fields && typeof project.agreement_fields === "object"
      ? project.agreement_fields as Record<string, unknown>
      : {};
    const expectedCompanyName = normalizeText(agreementFields.companyName) || project.relation_name;
    const documentTitleFromResult = normalizeText(currentResult.documentTitle);

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
              return analyzeWorldlineKvkText(pdfText, kvkNumber, new Date(), {
                expectedCompanyName,
                supportingDocumentNames,
              });
            });
        })()
      : Promise.resolve(analyzeWorldlineBankStatementText(pdfText, new Date(), {
          expectedCompanyName,
          expectedIban: normalizeText(agreementFields.iban),
        }));
    const resolvedAnalysis = await analysis;
    const nextCheckResult = {
      ...resolvedAnalysis.result,
      ...(documentTitleFromResult ? { documentTitle: documentTitleFromResult } : {}),
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
    const message = error instanceof Error ? error.message : "Documentcontrole mislukt.";
    return jsonResponse({ error: message }, 500);
  }
}
