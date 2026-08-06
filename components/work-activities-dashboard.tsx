"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  ClipboardList,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { usePricingConfig } from "@/components/pricing-provider";
import { StatusPill } from "@/components/ui";
import { IMPLEMENTATION_BASE_FUNCTIONALITIES } from "@/lib/base-functionalities";
import {
  DEFAULT_PRICE_CONFIG,
  normalizePricingConfig,
  type EditablePricingConfig,
} from "@/lib/price-config";
import {
  ROLE_TAB_ACCESS,
  canAccessTab,
  canWriteTab,
  normalizeRoleTabAccess,
  type RoleTabAccessMap,
} from "@/lib/role-tabs";
import { getSupabaseClient } from "@/lib/supabase";

type WorkActivitiesResponse = {
  error?: string;
  pricingConfig?: unknown;
};

type WorkLinesEditorProps = {
  label: string;
  value: string[];
  disabled: boolean;
  onChange: (value: string[]) => void;
};

function clonePricingConfig(config: EditablePricingConfig) {
  return normalizePricingConfig(JSON.parse(JSON.stringify(config)) as unknown);
}

function WorkLinesEditor({ label, value, disabled, onChange }: WorkLinesEditorProps) {
  function updateLine(index: number, nextValue: string) {
    onChange(value.map((line, lineIndex) => lineIndex === index ? nextValue : line));
  }

  function removeLine(index: number) {
    onChange(value.filter((_, lineIndex) => lineIndex !== index));
  }

  return (
    <div className="work-lines-editor">
      {value.length > 0 ? (
        <div className="work-lines-list">
          {value.map((line, index) => (
            <div className="work-line" key={`${label}-${index}`}>
              <span className="work-line-number">{index + 1}</span>
              <input
                aria-label={`${label}, regel ${index + 1}`}
                value={line}
                disabled={disabled}
                placeholder="Vul een werkzaamheid in"
                onChange={(event) => updateLine(index, event.target.value)}
              />
              <button
                type="button"
                className="work-line-delete"
                aria-label={`Verwijder regel ${index + 1} bij ${label}`}
                title="Regel verwijderen"
                disabled={disabled}
                onClick={() => removeLine(index)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="work-lines-empty">Nog geen werkzaamheden toegevoegd.</p>
      )}
      <button
        type="button"
        className="secondary-button work-line-add"
        disabled={disabled}
        onClick={() => onChange([...value, ""])}
      >
        <Plus size={16} /> Regel toevoegen
      </button>
    </div>
  );
}

export default function WorkActivitiesDashboard() {
  const { role } = useAuth();
  const router = useRouter();
  const supabase = getSupabaseClient();
  const { pricingConfig, refreshPricingConfig } = usePricingConfig();
  const [draftConfig, setDraftConfig] = useState<EditablePricingConfig>(DEFAULT_PRICE_CONFIG);
  const [roleTabAccess, setRoleTabAccess] = useState<RoleTabAccessMap>(ROLE_TAB_ACCESS);
  const [roleAccessLoading, setRoleAccessLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const canView = canAccessTab(role, "workActivities", roleTabAccess);
  const canEdit = canWriteTab(role, "workActivities", roleTabAccess);
  const configuredLineCount = useMemo(() => (
    draftConfig.baseFunctionalityWorkItems.reduce((count, item) => count + item.workItems.filter((line) => line.trim()).length, 0)
      + draftConfig.modules.reduce((count, item) => count + (item.workItems ?? []).filter((line) => line.trim()).length, 0)
      + draftConfig.expansionWorkItems.reduce((count, item) => count + item.workItems.filter((line) => line.trim()).length, 0)
  ), [draftConfig]);

  useEffect(() => {
    setDraftConfig(clonePricingConfig(pricingConfig));
    setLoading(false);
  }, [pricingConfig]);

  useEffect(() => {
    if (!role) return;

    let active = true;
    setRoleAccessLoading(true);

    async function loadRoleTabAccess() {
      try {
        const response = await fetch("/api/admin/role-tabs", { cache: "no-store" });
        const json = (await response.json().catch(() => ({}))) as { roleTabAccess?: unknown };
        if (active && response.ok) setRoleTabAccess(normalizeRoleTabAccess(json.roleTabAccess));
      } catch {
        if (active) setRoleTabAccess(ROLE_TAB_ACCESS);
      } finally {
        if (active) setRoleAccessLoading(false);
      }
    }

    function handleRoleTabAccessUpdated(event: Event) {
      setRoleTabAccess(normalizeRoleTabAccess((event as CustomEvent).detail));
    }

    void loadRoleTabAccess();
    window.addEventListener("role-tab-access-updated", handleRoleTabAccessUpdated);
    return () => {
      active = false;
      window.removeEventListener("role-tab-access-updated", handleRoleTabAccessUpdated);
    };
  }, [role]);

  function updateBaseWorkItems(key: string, workItems: string[]) {
    setDraftConfig((current) => ({
      ...current,
      baseFunctionalityWorkItems: current.baseFunctionalityWorkItems.map((item) => (
        item.key === key ? { ...item, workItems } : item
      )),
    }));
  }

  function updateModuleWorkItems(key: string, workItems: string[]) {
    setDraftConfig((current) => ({
      ...current,
      modules: current.modules.map((item) => item.key === key ? { ...item, workItems } : item),
    }));
  }

  function updateExpansionWorkItems(key: string, workItems: string[]) {
    setDraftConfig((current) => ({
      ...current,
      expansionWorkItems: current.expansionWorkItems.map((item) => (
        item.key === key ? { ...item, workItems } : item
      )),
    }));
  }

  async function reloadActivities() {
    setLoading(true);
    setStatus("Werkzaamheden worden geladen...");
    await refreshPricingConfig();
    setStatus("Werkzaamheden opnieuw geladen.");
    setLoading(false);
  }

  async function saveActivities() {
    if (!canEdit) {
      setStatus("Je hebt alleen leesrechten voor Werkzaamheden.");
      return;
    }
    if (!supabase) {
      setStatus("De verbinding met de server ontbreekt.");
      return;
    }

    setSaving(true);
    setStatus("Werkzaamheden worden opgeslagen...");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Je sessie is verlopen. Log opnieuw in.");

      const response = await fetch("/api/admin/prices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ pricingConfig: draftConfig, tabKey: "workActivities" }),
      });
      const json = (await response.json().catch(() => ({}))) as WorkActivitiesResponse;
      if (!response.ok) throw new Error(json.error || "Werkzaamheden opslaan mislukt.");

      const savedConfig = normalizePricingConfig(json.pricingConfig ?? draftConfig);
      setDraftConfig(savedConfig);
      window.dispatchEvent(new CustomEvent("pricing-config-updated", { detail: savedConfig }));
      setStatus("Werkzaamheden opgeslagen en direct beschikbaar in offertes en implementaties.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Werkzaamheden opslaan mislukt.");
    } finally {
      setSaving(false);
    }
  }

  if (roleAccessLoading) {
    return (
      <div className="page-shell"><div className="container"><section className="card panel">
        <div className="eyebrow">Admin</div><h1>Werkzaamheden worden geladen...</h1>
      </section></div></div>
    );
  }

  if (!canView) {
    return (
      <div className="page-shell"><div className="container"><section className="card panel">
        <div className="top-row">
          <div><div className="eyebrow">Geen toegang</div><h1>Werkzaamheden</h1><p className="subtext">Je rol heeft geen leesrechten voor deze pagina.</p></div>
          <div className="icon-badge"><ShieldAlert size={24} /></div>
        </div>
      </section></div></div>
    );
  }

  return (
    <div className="page-shell">
      <div className="container work-activities-page">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Admin</div>
            <h1>Werkzaamheden</h1>
            <p>Beheer per basisfunctionaliteit en module welke werkzaamheden in offertes en implementaties worden getoond.</p>
          </div>
          <div className="brand-actions">
            <StatusPill tone={loading ? "warning" : "success"}>{loading ? "Laden" : canEdit ? "Schrijven" : "Lezen"}</StatusPill>
            <button type="button" className="secondary-button" onClick={() => void reloadActivities()} disabled={loading || saving}>
              <RefreshCw size={16} /> Vernieuwen
            </button>
            <button type="button" className="primary-button" onClick={() => void saveActivities()} disabled={loading || saving || !canEdit}>
              <Save size={16} /> {saving ? "Opslaan..." : "Opslaan"}
            </button>
          </div>
        </header>

        <section className="work-activities-summary">
          <ClipboardList size={20} />
          <div><strong>{configuredLineCount} werkzaamheden ingesteld</strong><span>Iedere niet-lege regel wordt afzonderlijk getoond.</span></div>
        </section>

        <section className="card work-activities-section">
          <header className="work-activities-heading">
            <div className="icon-badge"><PackageCheck size={22} /></div>
            <div><span>Pakket</span><h2>Basisfunctionaliteiten</h2></div>
          </header>
          <div className="work-activity-groups">
            {IMPLEMENTATION_BASE_FUNCTIONALITIES.map((item) => {
              const config = draftConfig.baseFunctionalityWorkItems.find((row) => row.key === item.key);
              return (
                <article className="work-activity-group" key={item.key}>
                  <div className="work-activity-label"><strong>{item.label}</strong><span>{item.description}</span></div>
                  <WorkLinesEditor
                    label={item.label}
                    value={config?.workItems ?? []}
                    disabled={!canEdit || saving}
                    onChange={(workItems) => updateBaseWorkItems(item.key, workItems)}
                  />
                </article>
              );
            })}
          </div>
        </section>

        <section className="card work-activities-section">
          <header className="work-activities-heading">
            <div className="icon-badge"><Boxes size={22} /></div>
            <div><span>Uitbreidingen</span><h2>Modules en koppelingen</h2></div>
          </header>
          <div className="work-activity-groups">
            {draftConfig.expansionWorkItems.map((item) => (
              <article className="work-activity-group" key={item.key}>
                <div className="work-activity-label"><strong>{item.name}</strong><span>Koppeling of uitbreiding</span></div>
                <WorkLinesEditor
                  label={item.name}
                  value={item.workItems}
                  disabled={!canEdit || saving}
                  onChange={(workItems) => updateExpansionWorkItems(item.key, workItems)}
                />
              </article>
            ))}
            {draftConfig.modules.map((item) => (
              <article className="work-activity-group" key={item.key}>
                <div className="work-activity-label"><strong>{item.name}</strong><span>Smart Trade-module</span></div>
                <WorkLinesEditor
                  label={item.name}
                  value={item.workItems ?? []}
                  disabled={!canEdit || saving}
                  onChange={(workItems) => updateModuleWorkItems(item.key, workItems)}
                />
              </article>
            ))}
          </div>
        </section>

        {status ? <div className="save-status work-activities-status">{status}</div> : null}
      </div>
    </div>
  );
}
