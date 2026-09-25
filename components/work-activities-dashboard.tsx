"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { usePricingConfig } from "@/components/pricing-provider";
import { StatusPill } from "@/components/ui";
import {
  DEFAULT_PRICE_CONFIG,
  IMPLEMENTATION_TASK_OWNER_LABELS,
  IMPLEMENTATION_TASK_OWNERS,
  normalizePricingConfig,
  type EditablePricingConfig,
  type ImplementationTaskConfig,
  type ImplementationTaskWorkItemConfig,
} from "@/lib/price-config";
import {
  ROLE_TAB_ACCESS,
  canAccessTab,
  canWriteTab,
  normalizeRoleTabAccess,
  type RoleTabAccessMap,
} from "@/lib/role-tabs";
import { getSupabaseClient } from "@/lib/supabase";
import { activityBudgetKey } from "@/lib/implementation-estimates";

type WorkActivitiesResponse = {
  error?: string;
  pricingConfig?: unknown;
};

type WorkLinesEditorProps = {
  label: string;
  value: string[];
  disabled: boolean;
  onChange: (value: string[]) => void;
  renderBudget: (label: string) => ReactNode;
  onRename: (before: string, after: string) => void;
};

type DescriptionEditorProps = {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

function clonePricingConfig(config: EditablePricingConfig) {
  return normalizePricingConfig(JSON.parse(JSON.stringify(config)) as unknown);
}

function createImplementationTaskKey() {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createImplementationTaskActivityKey() {
  return `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function moveArrayItem<T>(items: T[], index: number, direction: -1 | 1) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

function WorkLinesEditor({ label, value, disabled, onChange, renderBudget, onRename }: WorkLinesEditorProps) {
  function updateLine(index: number, nextValue: string) {
    onRename(value[index], nextValue);
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
            <div className="work-line work-line-budget" key={`${label}-${index}`}>
              <span className="work-line-number">{index + 1}</span>
              <input
                aria-label={`${label}, regel ${index + 1}`}
                value={line}
                disabled={disabled}
                placeholder="Vul een werkzaamheid in"
                onChange={(event) => updateLine(index, event.target.value)}
              />
              {renderBudget(line)}
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

function TaskWorkItemsEditor({
  groupName,
  value,
  disabled,
  onChange,
  renderBudget,
  onRename,
}: {
  groupName: string;
  value: ImplementationTaskWorkItemConfig[];
  disabled: boolean;
  onChange: (value: ImplementationTaskWorkItemConfig[]) => void;
  renderBudget: (label: string) => ReactNode;
  onRename: (before: string, after: string) => void;
}) {
  function updateItem(index: number, changes: Partial<ImplementationTaskWorkItemConfig>) {
    if (changes.label !== undefined) onRename(value[index].label, changes.label);
    onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  }

  function removeItem(index: number) {
    onChange(value.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="work-task-items-editor">
      <div className="work-task-items-heading" aria-hidden="true">
        <span>Nr.</span><span>Activiteit</span><span>Wie</span><span>Begroting</span><span>Acties</span>
      </div>
      {value.length > 0 ? (
        <div className="work-task-items-list">
          {value.map((item, index) => (
            <div className="work-task-item" key={item.key}>
              <span className="work-line-number">{index + 1}</span>
              <input
                aria-label={`${groupName}, activiteit ${index + 1}`}
                value={item.label}
                disabled={disabled}
                placeholder="Vul een activiteit in"
                onChange={(event) => updateItem(index, { label: event.target.value })}
              />
              <select
                aria-label={`Wie voert activiteit ${index + 1} uit`}
                value={item.owner}
                disabled={disabled}
                onChange={(event) => updateItem(index, {
                  owner: event.target.value as ImplementationTaskWorkItemConfig["owner"],
                })}
              >
                {IMPLEMENTATION_TASK_OWNERS.map((owner) => (
                  <option key={owner} value={owner}>{IMPLEMENTATION_TASK_OWNER_LABELS[owner]}</option>
                ))}
              </select>
              {renderBudget(item.label)}
              <span className="work-task-item-actions">
                <button
                  type="button"
                  className="work-task-move"
                  disabled={disabled || index === 0}
                  aria-label={`Activiteit ${index + 1} omhoog verplaatsen`}
                  title="Omhoog"
                  onClick={() => onChange(moveArrayItem(value, index, -1))}
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  type="button"
                  className="work-task-move"
                  disabled={disabled || index === value.length - 1}
                  aria-label={`Activiteit ${index + 1} omlaag verplaatsen`}
                  title="Omlaag"
                  onClick={() => onChange(moveArrayItem(value, index, 1))}
                >
                  <ChevronDown size={15} />
                </button>
                <button
                  type="button"
                  className="work-line-delete"
                  aria-label={`Activiteit ${index + 1} verwijderen`}
                  title="Activiteit verwijderen"
                  disabled={disabled}
                  onClick={() => removeItem(index)}
                >
                  <Trash2 size={16} />
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="work-lines-empty">Nog geen activiteiten toegevoegd.</p>
      )}
      <button
        type="button"
        className="secondary-button work-line-add"
        disabled={disabled}
        onClick={() => onChange([
          ...value,
          { key: createImplementationTaskActivityKey(), label: "", owner: "consultant" },
        ])}
      >
        <Plus size={16} /> Activiteit toevoegen
      </button>
    </div>
  );
}

function DescriptionEditor({ label, value, disabled, onChange }: DescriptionEditorProps) {
  return (
    <label className="work-description-editor">
      <span>{label}</span>
      <textarea
        rows={2}
        value={value}
        disabled={disabled}
        placeholder="Vul de omschrijving voor de klantpagina in"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function WorkActivityGroup({ title, count, category, open, onToggle, children }: {
  title: string; count: number; category: string; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  return <div className="work-collapsible-group">
    <button type="button" className="work-group-toggle" aria-expanded={open} onClick={onToggle}>
      <span className="work-group-indicator" aria-hidden="true">{open ? "−" : "+"}</span>
      <span className="work-group-title"><strong>{title}</strong><small>{category}</small></span>
      <span className="work-group-count">{count} {count === 1 ? "werkzaamheid" : "werkzaamheden"}</span>
    </button>
    <div hidden={!open}>{children}</div>
  </div>;
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
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const toggleGroup = (key: string) => setOpenGroups(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key]);

  const canView = canAccessTab(role, "workActivities", roleTabAccess);
  const canEdit = canWriteTab(role, "workActivities", roleTabAccess);
  const configuredLineCount = useMemo(() => (
    draftConfig.implementationTasks.filter((task) => task.name.trim()).length
      + draftConfig.implementationTasks.reduce((count, task) => count + task.workItems.filter((line) => line.label.trim()).length, 0)
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

  function addImplementationTask() {
    const key = createImplementationTaskKey();
    setOpenGroups(current => [...current, "category:tasks", `task:${key}`]);
    setDraftConfig((current) => ({
      ...current,
      implementationTasks: [
        ...current.implementationTasks,
        { key, name: "", description: "", workItems: [] },
      ],
    }));
  }

  function updateImplementationTask(
    key: string,
    changes: Partial<Pick<ImplementationTaskConfig, "name" | "description" | "workItems">>,
  ) {
    setDraftConfig((current) => ({
      ...current,
      implementationTasks: current.implementationTasks.map((task) => (
        task.key === key ? { ...task, ...changes } : task
      )),
    }));
  }

  function moveImplementationTask(index: number, direction: -1 | 1) {
    setDraftConfig((current) => ({
      ...current,
      implementationTasks: moveArrayItem(current.implementationTasks, index, direction),
    }));
  }

  function removeImplementationTask(key: string) {
    setDraftConfig((current) => ({
      ...current,
      implementationTasks: current.implementationTasks.filter((task) => task.key !== key),
    }));
  }

  function updateModuleWorkItems(key: string, workItems: string[]) {
    setDraftConfig((current) => ({
      ...current,
      modules: current.modules.map((item) => item.key === key ? { ...item, workItems } : item),
    }));
  }

  function updateModuleDescription(key: string, description: string) {
    setDraftConfig((current) => ({
      ...current,
      modules: current.modules.map((item) => item.key === key ? { ...item, description } : item),
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

  function updateExpansionDescription(key: string, description: string) {
    setDraftConfig((current) => ({
      ...current,
      expansionWorkItems: current.expansionWorkItems.map((item) => (
        item.key === key ? { ...item, description } : item
      )),
    }));
  }

  function updateCustomerPortalDescription(key: string, description: string) {
    setDraftConfig((current) => ({
      ...current,
      customerPortalOptions: current.customerPortalOptions.map((item) => (
        item.key === key ? { ...item, description } : item
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

  function renameBudget(itemKey: string, before: string, after: string) {
    const oldKey = activityBudgetKey(itemKey, before), newKey = activityBudgetKey(itemKey, after);
    if (oldKey === newKey) return;
    setDraftConfig(current => {
      const budgets = { ...current.implementationActivityBudgets };
      if (budgets[oldKey]) { budgets[newKey] = budgets[oldKey]; delete budgets[oldKey]; }
      return { ...current, implementationActivityBudgets: budgets };
    });
  }

  function budgetFields(itemKey: string, label: string) {
    const key = activityBudgetKey(itemKey, label);
    const value = draftConfig.implementationActivityBudgets[key] ?? { days: null, unit: "" };
    const change = (patch: Partial<typeof value>) => setDraftConfig(current => ({
      ...current, implementationActivityBudgets: { ...current.implementationActivityBudgets, [key]: { ...value, ...patch } },
    }));
    return <div className="work-budget-fields">
      <label><span>Begrote dagen</span><input type="number" min="0" max="10000" step="0.0001" value={value.days ?? ""} placeholder="Niet ingesteld"
        aria-label={`Begrote dagen ${label}`} disabled={!canEdit || saving || !label.trim()}
        onChange={event => change({ days: event.target.value === "" ? null : Number(event.target.value) })} /></label>
      <label><span>Per (optioneel)</span><input value={value.unit} maxLength={50} placeholder="Eenmalig"
        aria-label={`Eenheid ${label}`} disabled={!canEdit || saving || !label.trim()} onChange={event => change({ unit: event.target.value })} /></label>
    </div>;
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
            <p>Beheer per onderdeel de klantomschrijving en werkzaamheden voor offertes en implementaties.</p>
            <p>Vul de standaard begrote dagen in. Gebruik 0 voor activiteiten zonder consultancytijd. Vul bij herhaalwerk een eenheid in, bijvoorbeeld prijslijst; op de implementatie geef je het aantal aan. De app verdeelt hiermee het offertebudget automatisch.</p>
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
          <div><strong>{configuredLineCount} taken en werkzaamheden ingesteld</strong><span>Omschrijvingen worden op de klantpagina getoond; iedere niet-lege regel wordt afzonderlijk verwerkt.</span></div>
        </section>

        <div className="button-row compact work-group-controls">
          <button type="button" className="secondary-button" onClick={() => setOpenGroups([
            "category:tasks", "category:expansions",
            ...draftConfig.implementationTasks.map(item => `task:${item.key}`),
            ...draftConfig.expansionWorkItems.map(item => `expansion:${item.key}`),
            ...draftConfig.modules.map(item => `module:${item.key}`),
          ])}>Alles openen</button>
          <button type="button" className="secondary-button" onClick={() => setOpenGroups([])}>Alles sluiten</button>
        </div>

        <section className="card work-activities-section">
          <h2 className="work-category-heading">
            <button type="button" className="work-group-toggle" aria-expanded={openGroups.includes("category:tasks")} aria-controls="work-category-tasks" onClick={() => toggleGroup("category:tasks")}>
              <span className="work-group-indicator" aria-hidden="true">{openGroups.includes("category:tasks") ? "−" : "+"}</span>
              <span className="work-group-title"><strong>Taken</strong><small>Planning</small></span>
              <span className="work-group-count">{draftConfig.implementationTasks.length} onderdelen</span>
            </button>
          </h2>
          <div id="work-category-tasks" className="work-category-content" hidden={!openGroups.includes("category:tasks")}>
          <div className="work-activity-groups">
            {draftConfig.implementationTasks.length > 0 ? draftConfig.implementationTasks.map((task, index) => (
              <WorkActivityGroup key={task.key} title={task.name || `Groep ${index + 1}`} count={task.workItems.filter(item => item.label.trim()).length} category="Taakgroep" open={openGroups.includes(`task:${task.key}`)} onToggle={() => toggleGroup(`task:${task.key}`)}>
<article className="work-activity-group work-task-group">
                <div className="work-task-group-meta">
                  <label className="work-task-name">
                    <span>Groep {index + 1}</span>
                    <input
                      value={task.name}
                      disabled={!canEdit || saving}
                      maxLength={200}
                      placeholder="Bijv. Voor het eerste bezoek"
                      onChange={(event) => updateImplementationTask(task.key, { name: event.target.value })}
                    />
                  </label>
                  <div className="work-task-group-order" aria-label={`Volgorde van ${task.name || `groep ${index + 1}`}`}>
                    <button
                      type="button"
                      className="work-task-move"
                      disabled={!canEdit || saving || index === 0}
                      aria-label={`Groep ${index + 1} omhoog verplaatsen`}
                      title="Groep omhoog"
                      onClick={() => moveImplementationTask(index, -1)}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      className="work-task-move"
                      disabled={!canEdit || saving || index === draftConfig.implementationTasks.length - 1}
                      aria-label={`Groep ${index + 1} omlaag verplaatsen`}
                      title="Groep omlaag"
                      onClick={() => moveImplementationTask(index, 1)}
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                </div>
                <div className="work-task-content">
                  <div className="work-activity-content">
                    <DescriptionEditor
                      label="Omschrijving klantpagina"
                      value={task.description}
                      disabled={!canEdit || saving}
                      onChange={(description) => updateImplementationTask(task.key, { description })}
                    />
                    <TaskWorkItemsEditor
                      renderBudget={label => budgetFields(`task:${task.key}`, label)}
                      onRename={(before, after) => renameBudget(`task:${task.key}`, before, after)}
                      groupName={task.name || `Groep ${index + 1}`}
                      value={task.workItems}
                      disabled={!canEdit || saving}
                      onChange={(workItems) => updateImplementationTask(task.key, { workItems })}
                    />
                  </div>
                  <button
                    type="button"
                    className="work-task-delete"
                    disabled={!canEdit || saving}
                    title="Groep verwijderen"
                    aria-label={`Groep ${index + 1} verwijderen`}
                    onClick={() => removeImplementationTask(task.key)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
              </WorkActivityGroup>
            )) : (
              <div className="work-task-empty">Nog geen taakgroepen toegevoegd.</div>
            )}
          </div>
          <div className="work-task-footer">
            <button
              type="button"
              className="secondary-button work-line-add"
              disabled={!canEdit || saving}
              onClick={addImplementationTask}
            >
              <Plus size={16} /> Groep toevoegen
            </button>
          </div>
          </div>
        </section>

        <section className="card work-activities-section">
          <h2 className="work-category-heading">
            <button type="button" className="work-group-toggle" aria-expanded={openGroups.includes("category:expansions")} aria-controls="work-category-expansions" onClick={() => toggleGroup("category:expansions")}>
              <span className="work-group-indicator" aria-hidden="true">{openGroups.includes("category:expansions") ? "−" : "+"}</span>
              <span className="work-group-title"><strong>Modules en koppelingen</strong><small>Uitbreidingen</small></span>
              <span className="work-group-count">{draftConfig.expansionWorkItems.length + draftConfig.modules.length} onderdelen</span>
            </button>
          </h2>
          <div id="work-category-expansions" className="work-category-content" hidden={!openGroups.includes("category:expansions")}>
          <div className="work-activity-groups">
            {draftConfig.expansionWorkItems.map((item) => (
              <WorkActivityGroup key={item.key} title={item.name} count={item.workItems.filter(line => line.trim()).length} category="Koppeling of uitbreiding" open={openGroups.includes(`expansion:${item.key}`)} onToggle={() => toggleGroup(`expansion:${item.key}`)}>
<article className="work-activity-group">
                <div className="work-activity-label"><strong>{item.name}</strong><span>Koppeling of uitbreiding</span></div>
                <div className="work-activity-content">
                  {item.key === "customerPortal" ? (
                    <div className="work-description-list">
                      {draftConfig.customerPortalOptions.map((option) => (
                        <DescriptionEditor
                          key={option.key}
                          label={`Klantportaal - ${option.name}`}
                          value={option.description ?? item.description}
                          disabled={!canEdit || saving}
                          onChange={(description) => updateCustomerPortalDescription(option.key, description)}
                        />
                      ))}
                    </div>
                  ) : (
                    <DescriptionEditor
                      label="Omschrijving klantpagina"
                      value={item.description}
                      disabled={!canEdit || saving}
                      onChange={(description) => updateExpansionDescription(item.key, description)}
                    />
                  )}
                  <WorkLinesEditor
                    label={item.name}
                    value={item.workItems}
                    renderBudget={label => budgetFields(item.key === "customerPortal" ? "customer-portal" : item.key === "smartConnect" ? "smart-connect" : "planning-app", label)}
                    onRename={(before, after) => renameBudget(item.key === "customerPortal" ? "customer-portal" : item.key === "smartConnect" ? "smart-connect" : "planning-app", before, after)}
                    disabled={!canEdit || saving}
                    onChange={(workItems) => updateExpansionWorkItems(item.key, workItems)}
                  />
                </div>
              </article>
              </WorkActivityGroup>
            ))}
            {draftConfig.modules.map((item) => (
              <WorkActivityGroup key={item.key} title={item.name} count={(item.workItems ?? []).filter(line => line.trim()).length} category="Smart Trade-module" open={openGroups.includes(`module:${item.key}`)} onToggle={() => toggleGroup(`module:${item.key}`)}>
<article className="work-activity-group">
                <div className="work-activity-label"><strong>{item.name}</strong><span>Smart Trade-module</span></div>
                <div className="work-activity-content">
                  <DescriptionEditor
                    label="Omschrijving klantpagina"
                    value={item.description ?? ""}
                    disabled={!canEdit || saving}
                    onChange={(description) => updateModuleDescription(item.key, description)}
                  />
                  <WorkLinesEditor
                    label={item.name}
                    value={item.workItems ?? []}
                    renderBudget={label => budgetFields(`module:${item.key}`, label)}
                    onRename={(before, after) => renameBudget(`module:${item.key}`, before, after)}
                    disabled={!canEdit || saving}
                    onChange={(workItems) => updateModuleWorkItems(item.key, workItems)}
                  />
                </div>
              </article>
              </WorkActivityGroup>
            ))}
          </div>
          </div>
        </section>

        {status ? <div className="save-status work-activities-status">{status}</div> : null}
      </div>
    </div>
  );
}
