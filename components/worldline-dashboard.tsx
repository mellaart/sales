"use client";

import jsPDF from "jspdf";
import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { Building2, CheckCircle2, ChevronRight, Download, FileText, FolderOpen, Hash, Mail, RefreshCw, Search, Trash2, UploadCloud, WalletCards } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { StatusPill } from "@/components/ui";
import {
  ROLE_TAB_ACCESS,
  canAccessTab,
  canWriteTab,
  normalizeRoleTabAccess,
  type RoleTabAccessMap,
} from "@/lib/role-tabs";
import { getSupabaseClient } from "@/lib/supabase";
import {
  DEFAULT_WORLDLINE_AGREEMENT_FIELDS,
  WORLDLINE_AGREEMENT_FIELD_DEFINITIONS,
  WORLDLINE_CHECK_STATUS_LABELS,
  WORLDLINE_DOCUMENT_BUCKET,
  WORLDLINE_DOCUMENT_DEFINITIONS,
  WORLDLINE_STATUS_LABELS,
  getWorldlineDocumentDefinition,
  normalizeWorldlineAgreementFields,
  type WorldlineAgreementFieldDefinition,
  type WorldlineAgreementFields,
  type WorldlineCheckStatus,
  type WorldlineDocument,
  type WorldlineDocumentType,
  type WorldlineProject,
  type WorldlineProjectStatus,
} from "@/lib/worldline";
import styles from "@/components/assets-dashboard.module.css";

type RelationOption = {
  id: string;
  name: string;
  email: string | null;
  debtorNumber: string | number | null;
};

type RelationSearchResponse = {
  error?: string;
  relations?: RelationOption[];
};

type CheckResult = {
  checklist?: Array<{ text: string; done: boolean }>;
  note?: string;
};

const WORLDLINE_REQUEST_TIMEOUT_MS = 15000;
const ONGOING_WORLDLINE_STATUSES: WorldlineProjectStatus[] = ["concept", "waiting_customer", "checking"];

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function withWorldlineTimeout<T>(request: PromiseLike<T>, action: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${action} duurt te lang. Vernieuw de pagina en controleer of de Worldline SQL volledig in Supabase is uitgevoerd.`));
    }, WORLDLINE_REQUEST_TIMEOUT_MS);

    Promise.resolve(request)
      .then((result) => {
        window.clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function getCheckTone(status: WorldlineCheckStatus): "success" | "warning" | "danger" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

function getProjectTone(status: WorldlineProjectStatus): "success" | "warning" | "danger" {
  if (status === "complete" || status === "submitted") return "success";
  if (status === "checking") return "warning";
  return "warning";
}

function isOngoingWorldlineProject(project: WorldlineProject) {
  return ONGOING_WORLDLINE_STATUSES.includes(project.status);
}

function getRelationFromProject(project: WorldlineProject): RelationOption {
  return {
    id: project.relation_id,
    name: project.relation_name,
    email: project.relation_email ?? null,
    debtorNumber: project.debtor_number ?? null,
  };
}

function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getLatestDocument(documents: WorldlineDocument[], documentType: WorldlineDocumentType) {
  return documents
    .filter((document) => document.document_type === documentType)
    .sort((a, b) => b.version - a.version || String(b.uploaded_at ?? "").localeCompare(String(a.uploaded_at ?? "")))[0] ?? null;
}

function createInitialCheckResult(documentType: WorldlineDocumentType): CheckResult {
  const definition = getWorldlineDocumentDefinition(documentType);

  return {
    checklist: (definition?.checklist ?? []).map((text) => ({ text, done: false })),
    note: "",
  };
}

function getCheckResult(document: WorldlineDocument | null, documentType: WorldlineDocumentType): CheckResult {
  if (!document?.check_result || typeof document.check_result !== "object") {
    return createInitialCheckResult(documentType);
  }

  const source = document.check_result as CheckResult;
  const fallback = createInitialCheckResult(documentType);

  return {
    checklist: Array.isArray(source.checklist) ? source.checklist : fallback.checklist,
    note: typeof source.note === "string" ? source.note : "",
  };
}

function fileSizeLabel(size?: number | null) {
  if (!size) return "-";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} kB`;
  return `${(size / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function getAgreementFieldValue(fields: WorldlineAgreementFields, definition: WorldlineAgreementFieldDefinition) {
  const value = fields[definition.key] ?? "";
  if (definition.type === "checkbox") return value === "ja" ? "Ja" : "Nee";
  return value.trim() || "-";
}

function getAgreementSections() {
  return WORLDLINE_AGREEMENT_FIELD_DEFINITIONS.reduce((sections, definition) => {
    const currentFields = sections.get(definition.section) ?? [];
    currentFields.push(definition);
    sections.set(definition.section, currentFields);
    return sections;
  }, new Map<string, WorldlineAgreementFieldDefinition[]>());
}

function downloadAgreementPdf(
  relation: RelationOption,
  project: WorldlineProject,
  fields: WorldlineAgreementFields,
) {
  const doc = new jsPDF();
  const left = 16;
  let y = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(17, 58, 86);
  doc.text("Worldline aansluitovereenkomst", left, y);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(74, 91, 112);
  doc.text(`Relatie: ${relation.name}`, left, y);
  y += 6;
  doc.text(`Relatie ID: ${relation.id}${relation.debtorNumber ? ` | Debiteur: ${relation.debtorNumber}` : ""}`, left, y);
  y += 6;
  doc.text(`Project: ${project.id}`, left, y);
  y += 12;

  getAgreementSections().forEach((definitions, sectionTitle) => {
    if (y > 250) {
      doc.addPage();
      y = 18;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(17, 58, 86);
    doc.text(sectionTitle, left, y);
    y += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(25, 40, 55);

    definitions.forEach((definition) => {
      if (y > 270) {
        doc.addPage();
        y = 18;
      }

      const valueText = getAgreementFieldValue(fields, definition);
      const wrapped = doc.splitTextToSize(valueText, 104);
      doc.setFont("helvetica", "bold");
      doc.text(definition.label, left, y);
      doc.setFont("helvetica", "normal");
      doc.text(wrapped, 82, y);
      y += Math.max(7, wrapped.length * 5);
    });

    y += 5;
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(74, 91, 112);
  doc.text("Let op: klant dient de originele Worldline overeenkomst volledig aan te vullen en nat te ondertekenen.", left, 286);

  doc.save(`${relation.name.replace(/\s+/g, "-").toLowerCase()}-worldline-aansluitgegevens.pdf`);
}

function renderAgreementFieldControl(
  definition: WorldlineAgreementFieldDefinition,
  value: string,
  disabled: boolean,
  onChange: (value: string) => void,
) {
  if (definition.type === "checkbox") {
    return (
      <label className="worldline-checkbox-control">
        <input
          type="checkbox"
          checked={value === "ja"}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked ? "ja" : "nee")}
        />
        <span>Ja</span>
      </label>
    );
  }

  if (definition.type === "select") {
    return (
      <select
        className="input worldline-field-input"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {(definition.options ?? []).map((option) => (
          <option key={option || "empty"} value={option}>
            {option || "-"}
          </option>
        ))}
      </select>
    );
  }

  if (definition.type === "textarea") {
    return (
      <textarea
        className="textarea worldline-field-input"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <input
      className="input worldline-field-input"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export default function WorldlineDashboard() {
  const { user, role, loading: authLoading } = useAuth();
  const supabase = getSupabaseClient();
  const [roleTabAccess, setRoleTabAccess] = useState<RoleTabAccessMap>(ROLE_TAB_ACCESS);
  const [roleAccessLoading, setRoleAccessLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [relations, setRelations] = useState<RelationOption[]>([]);
  const [selectedRelation, setSelectedRelation] = useState<RelationOption | null>(null);
  const [ongoingProjects, setOngoingProjects] = useState<WorldlineProject[]>([]);
  const [projects, setProjects] = useState<WorldlineProject[]>([]);
  const [activeProject, setActiveProject] = useState<WorldlineProject | null>(null);
  const [documents, setDocuments] = useState<WorldlineDocument[]>([]);
  const [agreementFields, setAgreementFields] = useState<WorldlineAgreementFields>(DEFAULT_WORLDLINE_AGREEMENT_FIELDS);
  const [searching, setSearching] = useState(false);
  const [loadingOngoingProjects, setLoadingOngoingProjects] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const latestDocuments = useMemo(() => {
    return Object.fromEntries(
      WORLDLINE_DOCUMENT_DEFINITIONS.map((definition) => [definition.key, getLatestDocument(documents, definition.key)]),
    ) as Record<WorldlineDocumentType, WorldlineDocument | null>;
  }, [documents]);

  const canAccessWorldline = canAccessTab(role, "worldline", roleTabAccess);
  const canWriteWorldline = canWriteTab(role, "worldline", roleTabAccess);

  useEffect(() => {
    if (!user) {
      setRoleAccessLoading(false);
      return;
    }

    let active = true;

    async function loadRoleTabAccess() {
      setRoleAccessLoading(true);

      try {
        const response = await fetch("/api/admin/role-tabs", { cache: "no-store" });
        const json = (await response.json().catch(() => ({}))) as { roleTabAccess?: unknown };

        if (active && response.ok) {
          setRoleTabAccess(normalizeRoleTabAccess(json.roleTabAccess));
        }
      } catch {
        if (active) {
          setRoleTabAccess(ROLE_TAB_ACCESS);
        }
      } finally {
        if (active) {
          setRoleAccessLoading(false);
        }
      }
    }

    void loadRoleTabAccess();

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    setAgreementFields(normalizeWorldlineAgreementFields(activeProject?.agreement_fields));
  }, [activeProject]);

  const loadOngoingProjects = useCallback(async () => {
    if (!supabase) return;

    setLoadingOngoingProjects(true);

    const { data, error } = await supabase
      .from("worldline_projects")
      .select("*")
      .in("status", ONGOING_WORLDLINE_STATUSES)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      setStatus(`Lopende projecten laden mislukt: ${error.message}`);
      setOngoingProjects([]);
      setLoadingOngoingProjects(false);
      return;
    }

    setOngoingProjects((data ?? []) as WorldlineProject[]);
    setLoadingOngoingProjects(false);
  }, [supabase]);

  useEffect(() => {
    if (!supabase || roleAccessLoading || !canAccessWorldline) return;
    void loadOngoingProjects();
  }, [canAccessWorldline, loadOngoingProjects, roleAccessLoading, supabase]);

  function syncOngoingProject(project: WorldlineProject) {
    setOngoingProjects((currentProjects) => {
      const remainingProjects = currentProjects.filter((item) => item.id !== project.id);
      if (!isOngoingWorldlineProject(project)) {
        return remainingProjects;
      }
      return [project, ...remainingProjects].sort((a, b) => String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? "")));
    });
  }

  async function loadProjects(relation: RelationOption, preferredProjectId?: string) {
    if (!supabase) return;

    setLoadingProjects(true);
    setStatus("");

    const { data, error } = await supabase
      .from("worldline_projects")
      .select("*")
      .eq("relation_id", relation.id)
      .order("updated_at", { ascending: false });

    if (error) {
      setStatus(`Worldline-projecten laden mislukt: ${error.message}`);
      setProjects([]);
      setActiveProject(null);
      setDocuments([]);
      setLoadingProjects(false);
      return;
    }

    const nextProjects = (data ?? []) as WorldlineProject[];
    setProjects(nextProjects);
    setActiveProject(nextProjects.find((project) => project.id === preferredProjectId) ?? nextProjects[0] ?? null);
    setLoadingProjects(false);
  }

  const loadDocuments = useCallback(async (projectId: string) => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("worldline_documents")
      .select("*")
      .eq("project_id", projectId)
      .order("uploaded_at", { ascending: false });

    if (error) {
      setStatus(`Documenten laden mislukt: ${error.message}`);
      setDocuments([]);
      return;
    }

    setDocuments((data ?? []) as WorldlineDocument[]);
  }, [supabase]);

  const activeProjectId = activeProject?.id;
  useEffect(() => {
    if (activeProjectId) {
      void loadDocuments(activeProjectId);
    } else {
      setDocuments([]);
    }
  }, [activeProjectId, loadDocuments]);

  async function handleSearchRelations(event: FormEvent) {
    event.preventDefault();
    setSearching(true);
    setStatus("");
    setRelations([]);
    setSelectedRelation(null);
    setProjects([]);
    setActiveProject(null);
    setDocuments([]);

    try {
      const response = await fetch(`/api/smart-trade/relations/search?query=${encodeURIComponent(query)}`);
      const json = (await response.json().catch(() => ({}))) as RelationSearchResponse;

      if (!response.ok) {
        setStatus(json.error ?? "Relaties zoeken mislukt.");
        return;
      }

      setRelations(json.relations ?? []);
      if ((json.relations ?? []).length === 0) {
        setStatus("Geen relaties gevonden.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Relaties zoeken mislukt.");
    } finally {
      setSearching(false);
    }
  }

  async function selectRelation(relation: RelationOption) {
    setSelectedRelation(relation);
    await loadProjects(relation);
  }

  async function openProject(project: WorldlineProject) {
    const relation = getRelationFromProject(project);
    setSelectedRelation(relation);
    setQuery("");
    setRelations([]);
    setStatus(`${project.relation_name} geopend.`);
    await loadProjects(relation, project.id);
  }

  async function deleteProject(project: WorldlineProject) {
    if (!supabase) return;
    if (!canWriteWorldline) {
      setStatus("Je hebt alleen leesrechten voor Worldline.");
      return;
    }

    const confirmed = window.confirm(`Weet je zeker dat je het Worldline-project voor ${project.relation_name} wilt verwijderen?`);
    if (!confirmed) return;

    setBusy(true);
    setStatus("Worldline-project wordt verwijderd...");

    const { data: projectDocuments } = await supabase
      .from("worldline_documents")
      .select("storage_path")
      .eq("project_id", project.id);

    const storagePaths = ((projectDocuments ?? []) as Array<{ storage_path?: string | null }>)
      .map((document) => document.storage_path)
      .filter((path): path is string => Boolean(path));

    if (storagePaths.length > 0) {
      await supabase.storage.from(WORLDLINE_DOCUMENT_BUCKET).remove(storagePaths);
    }

    const { error } = await supabase
      .from("worldline_projects")
      .delete()
      .eq("id", project.id);

    if (error) {
      setStatus(`Project verwijderen mislukt: ${error.message}`);
      setBusy(false);
      return;
    }

    const nextProjects = projects.filter((item) => item.id !== project.id);
    setOngoingProjects((currentProjects) => currentProjects.filter((item) => item.id !== project.id));
    setProjects(nextProjects);
    if (activeProject?.id === project.id) {
      setActiveProject(nextProjects[0] ?? null);
    }
    setStatus("Worldline-project verwijderd.");
    setBusy(false);
  }

  async function createProject() {
    if (!supabase || !user || !selectedRelation) return;
    if (!canWriteWorldline) {
      setStatus("Je hebt alleen leesrechten voor Worldline.");
      return;
    }

    setBusy(true);
    setStatus("Worldline-project wordt aangemaakt...");

    try {
      const { data, error } = await withWorldlineTimeout(
        supabase
          .from("worldline_projects")
          .insert({
            relation_id: selectedRelation.id,
            relation_name: selectedRelation.name,
            relation_email: selectedRelation.email,
            debtor_number: selectedRelation.debtorNumber ? String(selectedRelation.debtorNumber) : null,
            status: "concept",
            agreement_fields: DEFAULT_WORLDLINE_AGREEMENT_FIELDS,
            created_by: user.id,
          } as never)
          .select("*")
          .single(),
        "Worldline-project aanmaken",
      );

      if (error) {
        setStatus(`Project aanmaken mislukt: ${error.message}`);
        return;
      }

      const nextProject = data as WorldlineProject;
      setProjects((currentProjects) => [nextProject, ...currentProjects]);
      setActiveProject(nextProject);
      syncOngoingProject(nextProject);
      setStatus("Worldline-project aangemaakt.");
    } catch (error) {
      setStatus(`Project aanmaken mislukt: ${getErrorMessage(error, "Supabase gaf geen antwoord.")}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveAgreementFields() {
    if (!supabase || !activeProject) return;
    if (!canWriteWorldline) {
      setStatus("Je hebt alleen leesrechten voor Worldline.");
      return;
    }

    setBusy(true);
    setStatus("Aansluitgegevens worden opgeslagen...");

    const { data, error } = await supabase
      .from("worldline_projects")
      .update({
        agreement_fields: agreementFields,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", activeProject.id)
      .select("*")
      .single();

    if (error) {
      setStatus(`Aansluitgegevens opslaan mislukt: ${error.message}`);
      setBusy(false);
      return;
    }

    const nextProject = data as WorldlineProject;
    setActiveProject(nextProject);
    setProjects((currentProjects) => currentProjects.map((project) => project.id === nextProject.id ? nextProject : project));
    syncOngoingProject(nextProject);
    setStatus("Aansluitgegevens opgeslagen.");
    setBusy(false);
  }

  async function updateProjectStatus(nextStatus: WorldlineProjectStatus) {
    if (!supabase || !activeProject) return;
    if (!canWriteWorldline) {
      setStatus("Je hebt alleen leesrechten voor Worldline.");
      return;
    }

    setBusy(true);
    const { data, error } = await supabase
      .from("worldline_projects")
      .update({ status: nextStatus, updated_at: new Date().toISOString() } as never)
      .eq("id", activeProject.id)
      .select("*")
      .single();

    if (error) {
      setStatus(`Status wijzigen mislukt: ${error.message}`);
      setBusy(false);
      return;
    }

    const nextProject = data as WorldlineProject;
    setActiveProject(nextProject);
    setProjects((currentProjects) => currentProjects.map((project) => project.id === nextProject.id ? nextProject : project));
    syncOngoingProject(nextProject);
    setStatus("Projectstatus bijgewerkt.");
    setBusy(false);
  }

  function updateAgreementField(field: string, value: string) {
    if (!canWriteWorldline) return;
    setAgreementFields((currentFields) => ({ ...currentFields, [field]: value }));
  }

  async function uploadDocument(documentType: WorldlineDocumentType, file: File | null | undefined) {
    if (!file || !supabase || !activeProject || !selectedRelation || !user) return;
    if (!canWriteWorldline) {
      setStatus("Je hebt alleen leesrechten voor Worldline.");
      return;
    }

    const definition = getWorldlineDocumentDefinition(documentType);
    const latestVersion = Math.max(0, ...documents.filter((document) => document.document_type === documentType).map((document) => document.version));
    const nextVersion = latestVersion + 1;
    const storagePath = `${selectedRelation.id}/${activeProject.id}/${documentType}/v${nextVersion}-${Date.now()}-${sanitizeFileName(file.name)}`;

    setBusy(true);
    setStatus(`${definition?.title ?? "Document"} wordt geupload...`);

    const uploadResult = await supabase.storage
      .from(WORLDLINE_DOCUMENT_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadResult.error) {
      setStatus(`Upload mislukt: ${uploadResult.error.message}`);
      setBusy(false);
      return;
    }

    const { data, error } = await supabase
      .from("worldline_documents")
      .insert({
        project_id: activeProject.id,
        document_type: documentType,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type,
        file_size: file.size,
        version: nextVersion,
        check_status: "uploaded",
        check_result: createInitialCheckResult(documentType),
        uploaded_by: user.id,
      } as never)
      .select("*")
      .single();

    if (error) {
      setStatus(`Document registreren mislukt: ${error.message}`);
      setBusy(false);
      return;
    }

    setDocuments((currentDocuments) => [data as WorldlineDocument, ...currentDocuments]);
    setStatus(`${definition?.title ?? "Document"} is opgeslagen onder dit Worldline-project.`);
    setBusy(false);
  }

  async function updateDocumentStatus(document: WorldlineDocument, nextStatus: WorldlineCheckStatus) {
    if (!supabase) return;
    if (!canWriteWorldline) {
      setStatus("Je hebt alleen leesrechten voor Worldline.");
      return;
    }

    setBusy(true);
    const { data, error } = await supabase
      .from("worldline_documents")
      .update({ check_status: nextStatus } as never)
      .eq("id", document.id)
      .select("*")
      .single();

    if (error) {
      setStatus(`Documentstatus wijzigen mislukt: ${error.message}`);
      setBusy(false);
      return;
    }

    const nextDocument = data as WorldlineDocument;
    setDocuments((currentDocuments) => currentDocuments.map((item) => item.id === nextDocument.id ? nextDocument : item));
    setStatus("Documentstatus bijgewerkt.");
    setBusy(false);
  }

  async function downloadDocument(document: WorldlineDocument) {
    if (!supabase) return;

    const { data, error } = await supabase.storage
      .from(WORLDLINE_DOCUMENT_BUCKET)
      .createSignedUrl(document.storage_path, 600, { download: document.file_name });

    if (error || !data?.signedUrl) {
      setStatus(`Downloadlink maken mislukt: ${error?.message ?? "geen link ontvangen"}.`);
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>, documentType: WorldlineDocumentType) {
    event.preventDefault();
    void uploadDocument(documentType, event.dataTransfer.files.item(0));
  }

  if (authLoading) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="eyebrow">Worldline</div>
            <h1>Sessie controleren</h1>
            <p className="subtext">Een moment, je rechten worden geladen.</p>
          </section>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="eyebrow">Worldline</div>
            <h1>Inloggen vereist</h1>
            <p className="subtext">Log in om Worldline-dossiers te beheren.</p>
          </section>
        </div>
      </div>
    );
  }

  if (roleAccessLoading) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="eyebrow">Worldline</div>
            <h1>Rechten laden</h1>
            <p className="subtext">De Worldline-toegang wordt gecontroleerd.</p>
          </section>
        </div>
      </div>
    );
  }

  if (!canAccessWorldline) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="eyebrow">Worldline</div>
            <h1>Geen toegang</h1>
            <p className="subtext">Deze pagina is alleen zichtbaar voor rollen die in Admin toegang tot Worldline hebben.</p>
          </section>
        </div>
      </div>
    );
  }

  if (!supabase) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="eyebrow">Worldline</div>
            <h1>Configuratie ontbreekt</h1>
            <p className="subtext">Supabase keys ontbreken.</p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="container worldline-page">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Smart Trade</div>
            <h1>Worldline</h1>
            <p>Beheer aansluitovereenkomsten, KvK, ID, bankafschrift en refund-documenten per relatie.</p>
          </div>
          <div className="brand-actions">
            {!canWriteWorldline ? <StatusPill tone="warning">Alleen lezen</StatusPill> : null}
            <StatusPill tone={activeProject ? getProjectTone(activeProject.status) : "warning"}>
              {activeProject ? WORLDLINE_STATUS_LABELS[activeProject.status] : "Geen project"}
            </StatusPill>
          </div>
        </header>

        <section className="card panel worldline-ongoing-panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Lopende projecten</div>
              <h2 className="headline">Worldline-projecten</h2>
              <p className="subtext">Open direct een lopend dossier of verwijder een project dat niet meer nodig is.</p>
            </div>
            <div className="button-row compact">
              <StatusPill tone="warning">{ongoingProjects.length} project(en)</StatusPill>
              <button type="button" className="secondary-button" onClick={() => void loadOngoingProjects()} disabled={loadingOngoingProjects || busy}>
                <RefreshCw size={16} />
                Vernieuwen
              </button>
            </div>
          </div>

          {loadingOngoingProjects ? <div className="save-status">Lopende projecten worden geladen...</div> : null}

          {!loadingOngoingProjects && ongoingProjects.length === 0 ? (
            <div className="empty-state">Geen lopende Worldline-projecten gevonden.</div>
          ) : null}

          {ongoingProjects.length > 0 ? (
            <div className="worldline-ongoing-list">
              {ongoingProjects.map((project) => (
                <article key={project.id} className={`worldline-ongoing-card ${activeProject?.id === project.id ? "active" : ""}`}>
                  <div className="worldline-ongoing-main">
                    <strong>{project.relation_name}</strong>
                    <span>
                      {project.relation_email || "Geen e-mail"}
                      {project.debtor_number ? ` · Debiteur ${project.debtor_number}` : ""}
                    </span>
                    <small>Laatst bijgewerkt: {formatDate(project.updated_at ?? project.created_at)}</small>
                  </div>

                  <div className="worldline-ongoing-actions">
                    <StatusPill tone={getProjectTone(project.status)}>{WORLDLINE_STATUS_LABELS[project.status]}</StatusPill>
                    <button type="button" className="secondary-button" onClick={() => void openProject(project)} disabled={busy}>
                      <FolderOpen size={16} />
                      Openen
                    </button>
                    <button type="button" className="secondary-button danger" onClick={() => void deleteProject(project)} disabled={busy || !canWriteWorldline}>
                      <Trash2 size={16} />
                      Verwijderen
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Stap 1</div>
              <h2 className="headline">Relatie selecteren</h2>
              <p className="subtext">Zoek op bedrijfsnaam, contactnaam, e-mail of relatienummer.</p>
            </div>
            <div className="icon-badge"><Search size={26} /></div>
          </div>

          <form onSubmit={handleSearchRelations} className={styles.assetSearchForm}>
            <input
              className={`input ${styles.assetSearchInput}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Bijv. Joella, debiteur, e-mail of ID..."
              required
            />
            <button type="submit" className={`primary-button ${styles.assetSearchButton}`} disabled={searching || busy}>
              <Search size={16} />
              {searching ? "Zoeken..." : "Zoeken"}
            </button>
          </form>

          {relations.length > 0 ? (
            <div className={styles.relationResults}>
              <div className={styles.relationResultsHeader}>
                <span>Gevonden relaties</span>
                <span>{relations.length} resultaten</span>
              </div>
              <div className={styles.relationResultList}>
                {relations.map((relation) => (
                  <button
                    key={relation.id}
                    type="button"
                    className={`${styles.relationResultCard} ${selectedRelation?.id === relation.id ? styles.selectedResultCard : ""}`}
                    onClick={() => void selectRelation(relation)}
                  >
                    <span className={styles.relationResultIcon}><Building2 size={18} /></span>
                    <span className={styles.relationResultContent}>
                      <strong>{relation.name}</strong>
                      <span className={styles.relationResultMeta}>
                        <span><Hash size={13} />ID {relation.id}</span>
                        {relation.debtorNumber ? <span>Debiteur {relation.debtorNumber}</span> : null}
                        {relation.email ? <span><Mail size={13} />{relation.email}</span> : null}
                      </span>
                    </span>
                    <span className={styles.relationResultAction}>
                      {selectedRelation?.id === relation.id ? "Geselecteerd" : "Selecteer"}
                      <ChevronRight size={16} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {selectedRelation ? (
          <section className="card panel worldline-project-panel">
            <div className="top-row">
              <div>
                <div className="eyebrow">Project</div>
                <h2 className="headline">Worldline-dossier voor {selectedRelation.name}</h2>
                <p className="subtext">
                  {loadingProjects ? "Projecten worden geladen..." : projects.length === 0 ? "Nog geen project voor deze relatie." : `${projects.length} project(en) gevonden.`}
                </p>
              </div>
              <button type="button" className="primary-button" onClick={() => void createProject()} disabled={busy || !canWriteWorldline}>
                <FileText size={16} />
                Nieuw project
              </button>
            </div>

            {projects.length > 0 ? (
              <div className="worldline-project-list">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={`worldline-project-card ${activeProject?.id === project.id ? "active" : ""}`}
                    onClick={() => setActiveProject(project)}
                  >
                    <span>
                      <strong>{WORLDLINE_STATUS_LABELS[project.status]}</strong>
                      <small>{formatDate(project.updated_at ?? project.created_at)}</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {activeProject && selectedRelation ? (
          <>
            <section className="card panel">
              <div className="top-row">
                <div>
                  <div className="eyebrow">Stap 3</div>
                  <h2 className="headline">Aansluitovereenkomst voorbereiden</h2>
                  <p className="subtext">Vul de bekende gegevens in en download een PDF voor het dossier of de klantmail.</p>
                </div>
                <div className="button-row compact">
                  <button type="button" className="secondary-button" onClick={() => void saveAgreementFields()} disabled={busy || !canWriteWorldline}>
                    <RefreshCw size={16} />
                    Opslaan
                  </button>
                  <button type="button" className="primary-button" onClick={() => downloadAgreementPdf(selectedRelation, activeProject, agreementFields)}>
                    <Download size={16} />
                    Download PDF
                  </button>
                </div>
              </div>

              <div className="worldline-field-list">
                {Array.from(getAgreementSections()).map(([sectionTitle, definitions]) => (
                  <div key={sectionTitle} className="worldline-field-section">
                    <h3>{sectionTitle}</h3>
                    <div className="worldline-field-rows">
                      {definitions.map((definition) => (
                        <div key={definition.key} className="worldline-yellow-field">
                          <span className="worldline-field-label">{definition.label}</span>
                          <div className="worldline-field-control">
                            {renderAgreementFieldControl(
                              definition,
                              agreementFields[definition.key] ?? definition.defaultValue ?? "",
                              !canWriteWorldline,
                              (value) => updateAgreementField(definition.key, value),
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="card panel">
              <div className="top-row">
                <div>
                  <div className="eyebrow">Documenten</div>
                  <h2 className="headline">Uploaden en controleren</h2>
                  <p className="subtext">Sleep PDF-bestanden of afbeeldingen naar de juiste stap. Nieuwe uploads worden als nieuwe versie bewaard.</p>
                </div>
                <select
                  className="input worldline-status-select"
                  value={activeProject.status}
                  disabled={busy || !canWriteWorldline}
                  aria-label="Worldline projectstatus"
                  onChange={(event) => void updateProjectStatus(event.target.value as WorldlineProjectStatus)}
                >
                  {Object.entries(WORLDLINE_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="worldline-document-grid">
                {WORLDLINE_DOCUMENT_DEFINITIONS.map((definition) => {
                  const latestDocument = latestDocuments[definition.key];
                  const checkResult = getCheckResult(latestDocument, definition.key);
                  const inputId = `worldline-${definition.key}`;

                  return (
                    <article key={definition.key} className="worldline-document-card">
                      <div className="worldline-document-top">
                        <div>
                          <div className="eyebrow">{definition.step}</div>
                          <h3>{definition.title}</h3>
                          <p>{definition.description}</p>
                        </div>
                        <StatusPill tone={getCheckTone(latestDocument?.check_status ?? "missing")}>
                          {WORLDLINE_CHECK_STATUS_LABELS[latestDocument?.check_status ?? "missing"]}
                        </StatusPill>
                      </div>

                      <label
                        className="worldline-dropzone"
                        htmlFor={inputId}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleDrop(event, definition.key)}
                      >
                        <UploadCloud size={22} />
                        <span>Sleep bestand hierheen of kies bestand</span>
                        <small>{definition.accept.includes("image") ? "PDF, JPG of PNG" : "PDF"}</small>
                        <input
                          id={inputId}
                          type="file"
                          accept={definition.accept}
                          onChange={(event) => void uploadDocument(definition.key, event.target.files?.item(0))}
                          disabled={busy || !canWriteWorldline}
                        />
                      </label>

                      {latestDocument ? (
                        <div className="worldline-document-meta">
                          <div><span>Laatste versie</span><strong>v{latestDocument.version}</strong></div>
                          <div><span>Bestand</span><strong>{latestDocument.file_name}</strong></div>
                          <div><span>Grootte</span><strong>{fileSizeLabel(latestDocument.file_size)}</strong></div>
                          <div><span>Upload</span><strong>{formatDate(latestDocument.uploaded_at)}</strong></div>
                        </div>
                      ) : null}

                      <div className="worldline-checklist">
                        {checkResult.checklist?.map((item) => (
                          <div key={item.text} className="worldline-check-item">
                            <CheckCircle2 size={15} />
                            <span>{item.text}</span>
                          </div>
                        ))}
                      </div>

                      <div className="button-row compact">
                        {latestDocument ? (
                          <>
                            <button type="button" className="secondary-button" onClick={() => void downloadDocument(latestDocument)}>
                              <Download size={16} />
                              Download
                            </button>
                            <button type="button" className="secondary-button" onClick={() => void updateDocumentStatus(latestDocument, "checking")} disabled={busy || !canWriteWorldline}>
                              Controleren
                            </button>
                            <button type="button" className="secondary-button" onClick={() => void updateDocumentStatus(latestDocument, "approved")} disabled={busy || !canWriteWorldline}>
                              Akkoord
                            </button>
                            <button type="button" className="secondary-button danger" onClick={() => void updateDocumentStatus(latestDocument, "rejected")} disabled={busy || !canWriteWorldline}>
                              Afkeur
                            </button>
                          </>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}

        {status ? <div className="save-status">{status}</div> : null}

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Klantmail</div>
              <h2 className="headline">Tekst voor begeleidende e-mail</h2>
              <p className="subtext">Gebruik deze tekst bij het versturen van de ingevulde aansluitovereenkomst.</p>
            </div>
            <div className="icon-badge"><WalletCards size={24} /></div>
          </div>
          <div className="worldline-mail-copy">
            <p>Hierbij ontvangt u de overeenkomst voor het accepteren van betaalkaarten via Worldline.</p>
            <p>Graag ontvangen we deze overeenkomst volledig ingevuld en nat ondertekend terug, samen met een geldig legitimatiebewijs, KvK-uittreksel, bankafschrift en indien nodig het refund formulier.</p>
            <p>Na ontvangst controleren wij de documenten en starten wij de aanvraag bij Worldline.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
