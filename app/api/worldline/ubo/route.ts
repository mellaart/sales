import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin-api";
import { verifyWorldlineAccess } from "@/lib/worldline-access-server";
import { extractWorldlineDocumentText } from "@/lib/worldline-document-text";
import { buildUboPrefill } from "@/lib/worldline-ubo";
import { WORLDLINE_DOCUMENT_BUCKET, type WorldlineCheckResult, type WorldlineDocument, type WorldlineProject } from "@/lib/worldline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  try {
    const service = getServiceClient();
    if (!service) return json({ error: "Server configuratie ontbreekt." }, 500);
    const access = await verifyWorldlineAccess(request, service, "read");
    if (!access.ok) return json({ error: access.message }, access.status);
    const body = await request.json();
    if (typeof body.projectId !== "string" || !body.projectId) return json({ error: "Geen project ontvangen." }, 400);
    const { data: project, error } = await service.from("worldline_projects").select("*").eq("id", body.projectId).maybeSingle();
    if (error || !project) return json({ error: "Project niet gevonden." }, 404);
    const { data: rows, error: docsError } = await service.from("worldline_documents").select("*").eq("project_id", body.projectId).eq("document_type", "kvk");
    if (docsError) throw new Error("KvK-documenten konden niet worden opgehaald.");
    const latest = new Map<string, WorldlineDocument>();
    for (const doc of (rows ?? []) as WorldlineDocument[]) {
      const check = doc.check_result as WorldlineCheckResult | null;
      const key = check?.kvkNumber || doc.file_name.match(/\b\d{8}\b/)?.[0] || doc.file_name;
      const previous = latest.get(key);
      if (!previous || doc.version > previous.version || (doc.version === previous.version && String(doc.uploaded_at) > String(previous.uploaded_at))) latest.set(key, doc);
    }
    const texts = await Promise.all([...latest.values()].map(async doc => {
      const ocr = (doc.check_result as WorldlineCheckResult | null)?.ocrText;
      if (typeof ocr === "string" && ocr.trim()) return ocr;
      const { data: file, error } = await service.storage.from(WORLDLINE_DOCUMENT_BUCKET).download(doc.storage_path);
      if (error || !file) throw new Error(`KvK-bestand ${doc.file_name} kon niet worden gelezen.`);
      const text = await extractWorldlineDocumentText(doc, file, "KvK");
      if (!text.trim()) throw new Error(`Voer eerst OCR uit voor ${doc.file_name}.`);
      return text;
    }));
    const p = project as WorldlineProject;
    return json(buildUboPrefill(texts, { ...p.agreement_fields, companyName: p.agreement_fields?.companyName || p.relation_name } as Record<string, string>));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "UBO-gegevens konden niet worden gelezen." }, 422);
  }
}
