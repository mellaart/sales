"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Globe2,
  Link2,
  ListChecks,
  LoaderCircle,
  Mail,
  MapPin,
  Monitor,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import ImplementationCustomerFilesPanel from "@/components/implementation-customer-files-panel";
import ImplementationNotesField from "@/components/implementation-notes-field";
import ImplementationWorkNoteEditor from "@/components/implementation-work-note-editor";
import PriceBreakdown from "@/components/price-breakdown";
import { usePricingConfig } from "@/components/pricing-provider";
import { StatCard, StatusPill } from "@/components/ui";
import {
  customerIntakeStatusLabel,
  type CustomerIntakeStatus,
} from "@/lib/customer-intake";
import {
  IMPLEMENTATION_PROGRESS_ITEMS,
  IMPLEMENTATION_STATUSES,
  IMPLEMENTATION_STATUS_LABELS,
  normalizeImplementationCustomWorkItems,
  normalizeImplementationCustomerWorkApprovals,
  normalizeImplementationItemProgress,
  normalizeImplementationProgress,
  normalizeImplementationWorkItemNotes,
  type ImplementationRecord,
  type ImplementationProgressKey,
  type ImplementationStatus,
} from "@/lib/implementations";
import type { ImplementationItem } from "@/lib/implementation-items";
import { IMPLEMENTATION_TASK_OWNER_LABELS } from "@/lib/price-config";
import {
  IMPLEMENTATION_CUSTOM_TASKS_KEY,
  getConfiguredImplementationTasks,
  getImplementationCustomTaskKey,
  getImplementationWorkItemProgressKey,
  getImplementationWorkItemStatuses,
  isImplementationItemCompleted,
  isImplementationItemSelected,
  withImplementationCustomWorkItems,
  withConfiguredWorkItems,
} from "@/lib/work-activities";
import type { DnsCheckItem, ImplementationDnsCheck } from "@/lib/implementation-dns";
import type {
  ImplementationAppointment,
  ImplementationAppointmentType,
  ImplementationAppointmentWorkItem,
  ImplementationPortalAccess,
} from "@/lib/implementation-portal";
import { getDealPriceSummary } from "@/lib/deal-price-summary";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { euro } from "@/lib/pricing";
import {
  ROLE_TAB_ACCESS,
  canAccessTab,
  canWriteTab,
  normalizeRoleTabAccess,
  type RoleTabAccessMap,
} from "@/lib/role-tabs";
import { getSupabaseClient, type DealRecord, type ProfileRecord } from "@/lib/supabase";

const dateFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const FINANCIAL_PACKAGE_OPTIONS = [
  "Exact Online",
  "Snelstart",
  "Twinfield",
  "King",
  "Overig",
];

function formatDate(value: string | null | undefined) {
  if (!value) return "Geen datum";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Geen datum" : dateFormatter.format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateTimeFormatter.format(date);
}

function sortAppointments(appointments: ImplementationAppointment[]) {
  return [...appointments].sort((left, right) => {
    const leftKey = `${left.appointmentDate} ${left.startTime || "99:99"}`;
    const rightKey = `${right.appointmentDate} ${right.startTime || "99:99"}`;
    return leftKey.localeCompare(rightKey);
  });
}

function getStatusTone(status: ImplementationStatus): "success" | "warning" | "neutral" {
  if (status === "completed") return "success";
  if (status === "new" || status === "waiting_customer") return "warning";
  return "neutral";
}

type CustomerIntakeProgress = {
  status: CustomerIntakeStatus;
  expiresAt: string;
  submittedAt: string | null;
  recipientEmail: string;
  formData: {
    website: string;
    contactFirstName: string;
    contactEmail: string;
    deliveryStreet: string;
    deliveryNumber: string;
    deliveryPostcode: string;
    deliveryCity: string;
    postalStreet: string;
    postalNumber: string;
    postalPostcode: string;
    postalCity: string;
  };
};

type ImplementationDetailField =
  | "administration_name"
  | "implementation_start_date"
  | "planned_go_live_date"
  | "actual_go_live_date"
  | "financial_package"
  | "website_webshop"
  | "dns_domain";

type AppointmentDraft = {
  appointmentDate: string;
  startTime: string;
  endTime: string;
  appointmentType: ImplementationAppointmentType;
  title: string;
  customerNote: string;
  workItems: ImplementationAppointmentWorkItem[];
};

type AppointmentCalendarSync = {
  synced: boolean;
  warning: string;
  reconnectRequired: boolean;
  connectUrl?: string;
};

type AppointmentWorkCategory = "tasks" | "modules";
type AppointmentWorkFilter = "all" | "unplanned" | "scheduled" | "completed";

type AppointmentWorkOption = ImplementationAppointmentWorkItem & {
  category: AppointmentWorkCategory;
  completed: boolean;
};

type AppointmentWorkGroup = {
  key: string;
  category: AppointmentWorkCategory;
  label: string;
  description?: string;
  items: AppointmentWorkOption[];
};

type ImplementationWorkStatus = "" | "todo" | "completed";

const APPOINTMENT_WORK_CATEGORY_LABELS: Record<AppointmentWorkCategory, string> = {
  tasks: "Taken",
  modules: "Modules",
};

const APPOINTMENT_WORK_FILTER_LABELS: Record<AppointmentWorkFilter, string> = {
  all: "Alles",
  unplanned: "Nog te plannen",
  scheduled: "Ingepland",
  completed: "Afgerond",
};

const EMPTY_APPOINTMENT_DRAFT: AppointmentDraft = {
  appointmentDate: "",
  startTime: "09:00",
  endTime: "17:00",
  appointmentType: "on_site",
  title: "Implementatieafspraak",
  customerNote: "",
  workItems: [],
};

function toggleAppointmentWorkItem(
  selected: ImplementationAppointmentWorkItem[],
  workItem: ImplementationAppointmentWorkItem,
  checked: boolean,
) {
  if (!checked) return selected.filter((item) => item.key !== workItem.key);
  if (selected.some((item) => item.key === workItem.key)) return selected;
  return [...selected, {
    key: workItem.key,
    group: workItem.group,
    label: workItem.label,
  }];
}

function normalizedImplementationWorkLabel(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("nl-NL");
}

function getAppointmentLocation(
  appointmentType: ImplementationAppointmentType,
  intake: CustomerIntakeProgress | null,
  customerName: string,
) {
  if (appointmentType === "remote") return "Online / op afstand";

  const deliveryAddress = [
    [intake?.formData.deliveryStreet, intake?.formData.deliveryNumber].filter(Boolean).join(" "),
    [intake?.formData.deliveryPostcode, intake?.formData.deliveryCity].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
  if (deliveryAddress) return deliveryAddress;

  const postalAddress = [
    [intake?.formData.postalStreet, intake?.formData.postalNumber].filter(Boolean).join(" "),
    [intake?.formData.postalPostcode, intake?.formData.postalCity].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
  if (postalAddress) return postalAddress;

  return customerName ? `Op locatie bij ${customerName}` : "Op locatie bij de klant";
}

function AppointmentWorkSelector({
  groups,
  selected,
  appointments,
  currentAppointmentId,
  disabled,
  onSelectionChange,
  onMove,
}: {
  groups: AppointmentWorkGroup[];
  selected: ImplementationAppointmentWorkItem[];
  appointments: ImplementationAppointment[];
  currentAppointmentId: string | null;
  disabled: boolean;
  onSelectionChange: (workItems: ImplementationAppointmentWorkItem[]) => void;
  onMove?: (
    workItem: ImplementationAppointmentWorkItem,
    sourceAppointmentId: string,
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<AppointmentWorkCategory>("tasks");
  const [filter, setFilter] = useState<AppointmentWorkFilter>("all");
  const [search, setSearch] = useState("");
  const selectedKeys = new Set(selected.map((item) => item.key));
  const allOptions = groups.flatMap((group) => group.items);
  const optionByKey = new Map(allOptions.map((option) => [option.key, option]));
  const assignmentByKey = new Map<string, ImplementationAppointment[]>();

  for (const appointment of appointments) {
    for (const workItem of appointment.workItems) {
      const assignedAppointments = assignmentByKey.get(workItem.key) ?? [];
      assignedAppointments.push(appointment);
      assignmentByKey.set(workItem.key, assignedAppointments);
    }
  }

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const otherAssignment = (workItemKey: string) => (
    (assignmentByKey.get(workItemKey) ?? []).find((appointment) => (
      appointment.id !== currentAppointmentId
    ))
  );
  const isScheduled = (workItemKey: string) => (
    selectedKeys.has(workItemKey) || (assignmentByKey.get(workItemKey)?.length ?? 0) > 0
  );
  const matchesFilter = (option: AppointmentWorkOption) => {
    if (filter === "completed") return option.completed;
    if (filter === "scheduled") return isScheduled(option.key);
    if (filter === "unplanned") return !isScheduled(option.key) && !option.completed;
    return true;
  };
  const normalizedSearch = search.trim().toLocaleLowerCase("nl-NL");
  const visibleGroups = groups
    .filter((group) => group.category === category)
    .map((group) => ({
      ...group,
      items: group.items.filter((option) => (
        matchesFilter(option) && (
          !normalizedSearch || `${group.label} ${option.label}`
            .toLocaleLowerCase("nl-NL")
            .includes(normalizedSearch)
        )
      )),
    }))
    .filter((group) => group.items.length > 0);
  const selectedOptions = selected.map((workItem) => optionByKey.get(workItem.key) ?? {
    ...workItem,
    category: "tasks" as const,
    completed: false,
  });
  const selectedGroups = selectedOptions.reduce<Array<{
    label: string;
    items: AppointmentWorkOption[];
  }>>((result, option) => {
    const label = option.group || APPOINTMENT_WORK_CATEGORY_LABELS[option.category];
    const existingGroup = result.find((group) => group.label === label);
    if (existingGroup) existingGroup.items.push(option);
    else result.push({ label, items: [option] });
    return result;
  }, []);

  function changeOption(option: AppointmentWorkOption, checked: boolean) {
    if (checked && otherAssignment(option.key)) return;
    onSelectionChange(toggleAppointmentWorkItem(selected, option, checked));
  }

  function changeGroup(groupKey: string) {
    const group = groups.find((candidate) => candidate.key === groupKey);
    if (!group) return;
    const selectableItems = group.items.filter((option) => (
      selectedKeys.has(option.key) || !otherAssignment(option.key)
    ));
    const allSelected = selectableItems.length > 0 && selectableItems.every((option) => (
      selectedKeys.has(option.key)
    ));
    let nextSelected = selected;
    for (const option of selectableItems) {
      nextSelected = toggleAppointmentWorkItem(nextSelected, option, !allSelected);
    }
    onSelectionChange(nextSelected);
  }

  const modal = open && typeof document !== "undefined" ? createPortal(
    <div
      className="implementation-work-picker-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <section
        className="implementation-work-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="implementation-work-picker-title"
      >
        <header className="implementation-work-picker-header">
          <div>
            <span>Afspraak</span>
            <h3 id="implementation-work-picker-title">Werkzaamheden plannen</h3>
            <p>Kies precies wat tijdens deze afspraak wordt uitgevoerd.</p>
          </div>
          <button
            type="button"
            className="icon-button"
            title="Sluiten"
            aria-label="Werkzaamheden sluiten"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </header>

        <div className="implementation-work-picker-controls">
          <div className="implementation-work-picker-tabs" role="tablist" aria-label="Soort werkzaamheden">
            {(Object.keys(APPOINTMENT_WORK_CATEGORY_LABELS) as AppointmentWorkCategory[]).map((key) => (
              <button
                type="button"
                role="tab"
                aria-selected={category === key}
                className={category === key ? "active" : ""}
                key={key}
                onClick={() => setCategory(key)}
              >
                {APPOINTMENT_WORK_CATEGORY_LABELS[key]}
                <span>{groups.filter((group) => group.category === key).reduce((total, group) => (
                  total + group.items.length
                ), 0)}</span>
              </button>
            ))}
          </div>
          <label className="implementation-work-picker-search">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              placeholder="Zoek werkzaamheden"
              aria-label="Zoek werkzaamheden"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select
            className="implementation-work-picker-filter"
            value={filter}
            aria-label="Filter werkzaamheden"
            onChange={(event) => setFilter(event.target.value as AppointmentWorkFilter)}
          >
            {(Object.keys(APPOINTMENT_WORK_FILTER_LABELS) as AppointmentWorkFilter[]).map((key) => (
              <option key={key} value={key}>{APPOINTMENT_WORK_FILTER_LABELS[key]}</option>
            ))}
          </select>
        </div>

        <div className="implementation-work-picker-content">
          <div className="implementation-work-picker-catalog">
            {visibleGroups.length === 0 ? (
              <div className="implementation-work-picker-empty">
                <Search size={20} /> Geen werkzaamheden gevonden binnen dit filter.
              </div>
            ) : visibleGroups.map((group) => {
              const sourceGroup = groups.find((candidate) => candidate.key === group.key) ?? group;
              const selectableItems = sourceGroup.items.filter((option) => (
                selectedKeys.has(option.key) || !otherAssignment(option.key)
              ));
              const allSelected = selectableItems.length > 0 && selectableItems.every((option) => (
                selectedKeys.has(option.key)
              ));
              const selectedCount = sourceGroup.items.filter((option) => (
                selectedKeys.has(option.key)
              )).length;
              const assignedElsewhereCount = sourceGroup.items.filter((option) => (
                !selectedKeys.has(option.key) && Boolean(otherAssignment(option.key))
              )).length;
              const categoryGroups = groups.filter((candidate) => candidate.category === group.category);
              const groupNumber = categoryGroups.findIndex((candidate) => candidate.key === group.key) + 1;

              return (
                <section key={group.key} className="implementation-work-picker-group">
                  <div className="implementation-work-picker-group-heading">
                    <div>
                      <small>{group.category === "tasks" ? `Taakgroep ${groupNumber}` : `Module ${groupNumber}`}</small>
                      <strong>{group.label}</strong>
                      {group.description ? <p>{group.description}</p> : null}
                    </div>
                    <label className="implementation-work-picker-group-toggle">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={disabled || selectableItems.length === 0}
                        aria-label={`Volledige groep ${group.label} selecteren`}
                        onChange={() => changeGroup(group.key)}
                      />
                      <span>{allSelected
                        ? assignedElsewhereCount > 0
                          ? "Alle beschikbare regels geselecteerd"
                          : "Volledige groep geselecteerd"
                        : "Volledige groep selecteren"}</span>
                    </label>
                    <small className="implementation-work-picker-group-count">
                      {selectedCount}/{sourceGroup.items.length} geselecteerd
                      {group.items.length !== sourceGroup.items.length
                        ? ` · ${group.items.length} zichtbaar`
                        : ""}
                      {assignedElsewhereCount > 0
                        ? ` · ${assignedElsewhereCount} al ingepland`
                        : ""}
                    </small>
                  </div>
                  <div className="implementation-work-picker-group-items">
                    {group.items.map((option) => {
                      const assignedElsewhere = otherAssignment(option.key);
                      const selectedHere = selectedKeys.has(option.key);
                      return (
                        <div className="implementation-work-picker-row" key={option.key}>
                          <label>
                            <input
                              type="checkbox"
                              checked={selectedHere}
                              disabled={disabled || Boolean(assignedElsewhere && !selectedHere)}
                              onChange={(event) => changeOption(option, event.target.checked)}
                            />
                            <span>{option.label}</span>
                          </label>
                          <div className="implementation-work-picker-statuses">
                            {option.completed ? (
                              <span className="completed"><CheckCircle2 size={14} /> Afgerond</span>
                            ) : null}
                            {selectedHere ? <span>Deze afspraak</span> : null}
                            {assignedElsewhere ? (
                              <span>
                                <CalendarDays size={14} /> {formatDate(assignedElsewhere.appointmentDate)}
                              </span>
                            ) : null}
                          </div>
                          {assignedElsewhere && !selectedHere && currentAppointmentId && onMove ? (
                            <button
                              type="button"
                              className="implementation-work-picker-move"
                              disabled={disabled}
                              onClick={() => onMove(option, assignedElsewhere.id)}
                            >
                              <ArrowRightLeft size={15} /> Verplaatsen
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          <aside className="implementation-work-picker-summary" aria-label="Geselecteerde werkzaamheden">
            <div>
              <span>Deze afspraak</span>
              <strong>{selected.length} geselecteerd</strong>
            </div>
            {selectedGroups.length === 0 ? (
              <p>Nog geen werkzaamheden aan deze afspraak gekoppeld.</p>
            ) : selectedGroups.map((group) => (
              <section key={group.label}>
                <h4>{group.label}</h4>
                {group.items.map((option) => (
                  <div key={option.key}>
                    <span>{option.label}</span>
                    <button
                      type="button"
                      className="icon-button"
                      title="Verwijderen uit afspraak"
                      aria-label={`${option.label} verwijderen uit afspraak`}
                      disabled={disabled}
                      onClick={() => changeOption(option, false)}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </section>
            ))}
          </aside>
        </div>

        <footer className="implementation-work-picker-footer">
          <span>{currentAppointmentId
            ? "Wijzigingen worden direct opgeslagen."
            : "De selectie wordt opgeslagen wanneer je de afspraak toevoegt."}</span>
          <button type="button" className="primary-button" onClick={() => setOpen(false)}>
            Gereed
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        type="button"
        className="implementation-work-picker-trigger"
        onClick={() => setOpen(true)}
      >
        <span>
          <ClipboardCheck size={18} aria-hidden="true" />
          <span>
            <strong>Werkzaamheden kiezen</strong>
            <small>Plan taken en modules</small>
          </span>
        </span>
        <span>{selected.length} geselecteerd</span>
      </button>
      {modal}
    </>
  );
}

function DnsCheckRow({
  label,
  value,
  result,
  loading,
}: {
  label?: string;
  value: string;
  result?: DnsCheckItem;
  loading: boolean;
}) {
  const status = loading ? "loading" : result?.status ?? "pending";

  return (
    <div className={`implementation-dns-row ${status}`}>
      <span className="implementation-dns-status" aria-hidden="true">
        {status === "loading" ? <LoaderCircle className="implementation-dns-spinner" size={17} /> : null}
        {status === "pass" ? <CheckCircle2 size={17} /> : null}
        {status === "fail" || status === "error" ? <AlertTriangle size={17} /> : null}
      </span>
      <div>
        {label ? <span>{label}</span> : null}
        <strong>{value}</strong>
        {!loading && result?.message ? <small>{result.message}</small> : null}
      </div>
    </div>
  );
}

function getWebsiteDomain(website: string) {
  const value = website.trim();
  if (!value) return "";

  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    const domain = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    const labels = domain.split(".");
    if (
      domain.length > 253
      || labels.length < 2
      || labels.some((label) => (
        !label
        || label.length > 63
        || !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label)
      ))
    ) return "";
    return domain;
  } catch {
    return "";
  }
}

function showOutlookPopupStatus(
  outlookWindow: Window | null,
  title: string,
  description: string,
  tone: "loading" | "error" = "loading",
) {
  if (!outlookWindow || outlookWindow.closed) return;

  try {
    const popupDocument = outlookWindow.document;
    popupDocument.title = title;
    popupDocument.documentElement.lang = "nl";
    popupDocument.body.replaceChildren();
    Object.assign(popupDocument.body.style, {
      margin: "0",
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      padding: "24px",
      boxSizing: "border-box",
      background: "#0b1425",
      color: "#eef4ff",
      fontFamily: "Calibri, Arial, sans-serif",
    });

    const panel = popupDocument.createElement("main");
    Object.assign(panel.style, {
      width: "min(100%, 520px)",
      padding: "28px",
      border: `1px solid ${tone === "error" ? "#7f3540" : "#274a7f"}`,
      borderRadius: "8px",
      background: "#131f34",
      boxSizing: "border-box",
    });

    const heading = popupDocument.createElement("h1");
    heading.textContent = title;
    Object.assign(heading.style, { margin: "0 0 12px", fontSize: "24px", lineHeight: "1.2" });

    const message = popupDocument.createElement("p");
    message.textContent = description;
    Object.assign(message.style, {
      margin: "0",
      color: tone === "error" ? "#fecaca" : "#b9c8df",
      fontSize: "16px",
      lineHeight: "1.5",
    });

    panel.append(heading, message);
    popupDocument.body.append(panel);
  } catch {
    // Het tabblad kan al naar Microsoft zijn genavigeerd.
  }
}

function navigateOutlookPopup(outlookWindow: Window | null, url: string) {
  if (!outlookWindow || outlookWindow.closed) return false;

  try {
    outlookWindow.location.replace(url);
    return true;
  } catch {
    return false;
  }
}

function getCustomerIntakePresentation(
  loaded: boolean,
  loadFailed: boolean,
  intake: CustomerIntakeProgress | null,
): { label: string; tone: "success" | "warning" | "danger" } {
  if (!loaded) return { label: "Laden...", tone: "warning" };
  if (loadFailed) return { label: "Niet beschikbaar", tone: "danger" };
  if (!intake) return { label: "Niet aangemaakt", tone: "warning" };

  const label = customerIntakeStatusLabel(intake.status, intake.expiresAt);
  if (label === "Ontvangen" || label === "Verwerkt") return { label, tone: "success" };
  if (label === "Verlopen" || label === "Ingetrokken") return { label, tone: "danger" };
  return { label, tone: "warning" };
}

export default function ImplementationEditor({ implementationId }: { implementationId: string }) {
  const { user, role } = useAuth();
  const { pricingConfig } = usePricingConfig();
  const supabase = getSupabaseClient();
  const [roleTabAccess, setRoleTabAccess] = useState<RoleTabAccessMap>(ROLE_TAB_ACCESS);
  const [accessLoaded, setAccessLoaded] = useState(false);
  const [implementation, setImplementation] = useState<ImplementationRecord | null>(null);
  const [linkedDeal, setLinkedDeal] = useState<DealRecord | null>(null);
  const [linkedDealError, setLinkedDealError] = useState("");
  const [assignableUsers, setAssignableUsers] = useState<ProfileRecord[]>([]);
  const [customerIntake, setCustomerIntake] = useState<CustomerIntakeProgress | null>(null);
  const [customerIntakeLoaded, setCustomerIntakeLoaded] = useState(false);
  const [customerIntakeLoadFailed, setCustomerIntakeLoadFailed] = useState(false);
  const [implementationItems, setImplementationItems] = useState<ImplementationItem[]>([]);
  const [implementationItemsLoaded, setImplementationItemsLoaded] = useState(false);
  const [implementationItemsError, setImplementationItemsError] = useState("");
  const [portalAccess, setPortalAccess] = useState<ImplementationPortalAccess | null>(null);
  const [portalLoaded, setPortalLoaded] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState("");
  const [appointments, setAppointments] = useState<ImplementationAppointment[]>([]);
  const [appointmentsLoaded, setAppointmentsLoaded] = useState(false);
  const [appointmentsBusy, setAppointmentsBusy] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState("");
  const [appointmentsWarning, setAppointmentsWarning] = useState("");
  const [appointmentDraft, setAppointmentDraft] = useState<AppointmentDraft>(EMPTY_APPOINTMENT_DRAFT);
  const [customWorkEditorKey, setCustomWorkEditorKey] = useState<string | null>(null);
  const [customWorkDraft, setCustomWorkDraft] = useState("");
  const [customTaskEditorOpen, setCustomTaskEditorOpen] = useState(false);
  const [customTaskDraft, setCustomTaskDraft] = useState("");
  const [calendarStatusLoaded, setCalendarStatusLoaded] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarConnectUrl, setCalendarConnectUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dnsOutlookBusy, setDnsOutlookBusy] = useState(false);
  const [newCustomerOutlookBusy, setNewCustomerOutlookBusy] = useState(false);
  const [customerOutlookBusyKey, setCustomerOutlookBusyKey] = useState<string | null>(null);
  const [dnsCheck, setDnsCheck] = useState<ImplementationDnsCheck | null>(null);
  const [dnsCheckLoading, setDnsCheckLoading] = useState(false);
  const [dnsCheckError, setDnsCheckError] = useState("");
  const [dnsDomainInput, setDnsDomainInput] = useState("");
  const dnsDomainInputRef = useRef("");
  const [detailSaveState, setDetailSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [detailSaveMessage, setDetailSaveMessage] = useState("Automatisch opgeslagen");
  const detailSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingDetailSavesRef = useRef(0);
  const appointmentSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingAppointmentSavesRef = useRef(0);
  const [message, setMessage] = useState("");

  const canAssign = isProtectedAdminEmail(user?.email);
  const canView = canAssign || canAccessTab(role, "implementation", roleTabAccess);
  const canEdit = canAssign || canWriteTab(role, "implementation", roleTabAccess);
  const dealPriceSummary = useMemo(
    () => linkedDeal ? getDealPriceSummary(linkedDeal, pricingConfig) : null,
    [linkedDeal, pricingConfig],
  );
  const implementationCustomWorkItems = useMemo(
    () => normalizeImplementationCustomWorkItems(implementation?.implementation_custom_work_items),
    [implementation?.implementation_custom_work_items],
  );
  const implementationCustomerWorkApprovals = useMemo(
    () => normalizeImplementationCustomerWorkApprovals(
      implementation?.implementation_customer_work_approvals,
    ),
    [implementation?.implementation_customer_work_approvals],
  );
  const implementationWorkItemNotes = useMemo(
    () => normalizeImplementationWorkItemNotes(implementation?.implementation_work_item_notes),
    [implementation?.implementation_work_item_notes],
  );
  const configuredImplementationTasks = useMemo(
    () => getConfiguredImplementationTasks(pricingConfig, implementationCustomWorkItems),
    [implementationCustomWorkItems, pricingConfig],
  );
  const configuredImplementationItems = useMemo(
    () => implementationItems.map((item) => {
      const configuredItem = withImplementationCustomWorkItems(
        withConfiguredWorkItems(item, pricingConfig),
        implementationCustomWorkItems,
      );
      return configuredItem.key === "planning-app"
        ? { ...configuredItem, label: "Planningsapp" }
        : configuredItem;
    }),
    [implementationCustomWorkItems, implementationItems, pricingConfig],
  );
  const implementationItemProgress = useMemo(
    () => normalizeImplementationItemProgress(implementation?.implementation_item_progress),
    [implementation?.implementation_item_progress],
  );
  const appointmentWorkGroups = useMemo(() => {
    const groups: AppointmentWorkGroup[] = [];

    const appendGroups = (
      category: AppointmentWorkCategory,
      items: ImplementationItem[],
    ) => {
      const standaloneItems: AppointmentWorkOption[] = [];

      for (const item of items) {
        const workItems = getImplementationWorkItemStatuses(item, implementationItemProgress);
        if (workItems.length === 0) {
          standaloneItems.push({
            key: item.key,
            group: APPOINTMENT_WORK_CATEGORY_LABELS[category],
            label: item.label,
            category,
            completed: isImplementationItemCompleted(item, implementationItemProgress),
          });
          continue;
        }

        groups.push({
          key: `${category}:${item.key}`,
          category,
          label: item.label,
          description: item.description,
          items: workItems.map((workItem) => ({
            key: workItem.key,
            group: item.label,
            label: workItem.label,
            category,
            completed: workItem.completed,
          })),
        });
      }

      if (standaloneItems.length > 0) {
        groups.unshift({
          key: `${category}:standalone`,
          category,
          label: APPOINTMENT_WORK_CATEGORY_LABELS[category],
          items: standaloneItems,
        });
      }
    };

    appendGroups("tasks", configuredImplementationTasks);
    appendGroups("modules", configuredImplementationItems);
    return groups;
  }, [
    configuredImplementationItems,
    configuredImplementationTasks,
    implementationItemProgress,
  ]);

  const loadRoleAccess = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/role-tabs", { cache: "no-store" });
      const json = await response.json().catch(() => ({})) as { roleTabAccess?: unknown };
      if (response.ok) setRoleTabAccess(normalizeRoleTabAccess(json.roleTabAccess));
    } finally {
      setAccessLoaded(true);
    }
  }, []);

  const loadCalendarStatus = useCallback(async () => {
    setCalendarStatusLoaded(false);
    try {
      const returnTo = `/implementatie/${encodeURIComponent(implementationId)}`;
      const response = await fetch(
        `/api/outlook/status?returnTo=${encodeURIComponent(returnTo)}`,
        { cache: "no-store" },
      );
      const json = await response.json().catch(() => ({})) as {
        calendarConnected?: boolean;
        connectUrl?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(json.error || "Outlook-agenda controleren mislukt.");
      setCalendarConnected(json.calendarConnected === true);
      setCalendarConnectUrl(json.connectUrl ?? "");
    } catch (error) {
      setCalendarConnected(false);
      setAppointmentsWarning(
        error instanceof Error ? error.message : "Outlook-agenda controleren mislukt.",
      );
    } finally {
      setCalendarStatusLoaded(true);
    }
  }, [implementationId]);

  const loadImplementation = useCallback(async () => {
    if (!user || !supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");
    setCustomerIntakeLoaded(false);
    setCustomerIntakeLoadFailed(false);
    setImplementationItemsLoaded(false);
    setImplementationItemsError("");
    setPortalLoaded(false);
    setPortalError("");
    setAppointmentsLoaded(false);
    setAppointmentsError("");
    setAppointmentsWarning("");
    setLinkedDeal(null);
    setLinkedDealError("");
    setDnsDomainInput("");
    dnsDomainInputRef.current = "";

    const { data, error } = await supabase
      .from("implementations")
      .select("*")
      .eq("id", implementationId)
      .maybeSingle();
    const loadedImplementation = data as ImplementationRecord | null;
    const storedDnsDomain = getWebsiteDomain(loadedImplementation?.dns_domain ?? "");

    if (error) {
      setMessage(`Implementatie laden mislukt: ${error.message}`);
    } else {
      setImplementation(loadedImplementation);
      setDnsDomainInput(storedDnsDomain);
      dnsDomainInputRef.current = storedDnsDomain;
    }

    if (loadedImplementation?.deal_id) {
      const { data: dealData, error: dealError } = await supabase
        .from("deals")
        .select("*")
        .eq("id", loadedImplementation.deal_id)
        .maybeSingle();

      if (dealError) {
        setLinkedDealError(`Prijsopbouw laden mislukt: ${dealError.message}`);
      } else {
        setLinkedDeal((dealData as DealRecord | null) ?? null);
        if (!dealData) setLinkedDealError("De gekoppelde deal is niet gevonden.");
      }
    }

    try {
      if (data) {
        const intakeResponse = await fetch(
          `/api/implementations/${encodeURIComponent(implementationId)}/customer-intake`,
          { cache: "no-store" },
        );
        const intakeJson = await intakeResponse.json().catch(() => ({})) as {
          intake?: CustomerIntakeProgress | null;
        };
        const loadedIntake = intakeResponse.ok ? intakeJson.intake ?? null : null;
        setCustomerIntake(loadedIntake);
        if (!storedDnsDomain && loadedIntake?.submittedAt) {
          const intakeDomain = getWebsiteDomain(loadedIntake.formData.website);
          setDnsDomainInput(intakeDomain);
          dnsDomainInputRef.current = intakeDomain;
        }
        setCustomerIntakeLoadFailed(!intakeResponse.ok);
      } else {
        setCustomerIntake(null);
      }
    } catch {
      setCustomerIntake(null);
      setCustomerIntakeLoadFailed(true);
    } finally {
      setCustomerIntakeLoaded(true);
    }

    try {
      if (data) {
        const itemsResponse = await fetch(
          `/api/implementations/${encodeURIComponent(implementationId)}/items`,
          { cache: "no-store" },
        );
        const itemsJson = await itemsResponse.json().catch(() => ({})) as {
          items?: ImplementationItem[];
          error?: string;
        };
        if (!itemsResponse.ok) throw new Error(itemsJson.error || "Modules laden mislukt.");
        setImplementationItems(Array.isArray(itemsJson.items) ? itemsJson.items : []);
      } else {
        setImplementationItems([]);
      }
    } catch (error) {
      setImplementationItems([]);
      setImplementationItemsError(error instanceof Error ? error.message : "Modules laden mislukt.");
    } finally {
      setImplementationItemsLoaded(true);
    }

    try {
      if (data) {
        const portalResponse = await fetch(
          `/api/implementations/${encodeURIComponent(implementationId)}/portal`,
          { cache: "no-store" },
        );
        const portalJson = await portalResponse.json().catch(() => ({})) as {
          portalAccess?: ImplementationPortalAccess | null;
          error?: string;
        };
        if (!portalResponse.ok) throw new Error(portalJson.error || "Klanttoegang laden mislukt.");
        setPortalAccess(portalJson.portalAccess ?? null);
      } else {
        setPortalAccess(null);
      }
    } catch (error) {
      setPortalAccess(null);
      setPortalError(error instanceof Error ? error.message : "Klanttoegang laden mislukt.");
    } finally {
      setPortalLoaded(true);
    }

    try {
      if (data) {
        const appointmentsResponse = await fetch(
          `/api/implementations/${encodeURIComponent(implementationId)}/appointments`,
          { cache: "no-store" },
        );
        const appointmentsJson = await appointmentsResponse.json().catch(() => ({})) as {
          appointments?: ImplementationAppointment[];
          error?: string;
        };
        if (!appointmentsResponse.ok) {
          throw new Error(appointmentsJson.error || "Afspraken laden mislukt.");
        }
        setAppointments(Array.isArray(appointmentsJson.appointments) ? appointmentsJson.appointments : []);
      } else {
        setAppointments([]);
      }
    } catch (error) {
      setAppointments([]);
      setAppointmentsError(error instanceof Error ? error.message : "Afspraken laden mislukt.");
    } finally {
      setAppointmentsLoaded(true);
    }

    if (canAssign) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id,email,full_name,role")
        .order("full_name", { ascending: true });

      if (profileError) {
        setMessage(`Gebruikers laden mislukt: ${profileError.message}`);
      } else {
        setAssignableUsers((profileData ?? []) as ProfileRecord[]);
      }
    }

    setLoading(false);
  }, [canAssign, implementationId, supabase, user]);

  const loadDnsCheck = useCallback(async (domainOverride?: string) => {
    const rawDomain = domainOverride ?? dnsDomainInputRef.current;
    const domain = getWebsiteDomain(rawDomain);
    if (!domain) {
      setDnsCheck(null);
      setDnsCheckError(rawDomain.trim() ? "Vul een geldige domeinnaam in." : "");
      return;
    }

    setDnsCheckLoading(true);
    setDnsCheckError("");

    try {
      const response = await fetch(
        `/api/implementations/${encodeURIComponent(implementationId)}/dns-check?domain=${encodeURIComponent(domain)}`,
        { cache: "no-store" },
      );
      const json = await response.json().catch(() => ({})) as ImplementationDnsCheck & { error?: string };
      if (!response.ok) throw new Error(json.error || "DNS-controle mislukt.");
      setDnsCheck(json);
    } catch (error) {
      setDnsCheck(null);
      setDnsCheckError(error instanceof Error ? error.message : "DNS-controle mislukt.");
    } finally {
      setDnsCheckLoading(false);
    }
  }, [implementationId]);

  useEffect(() => {
    void loadRoleAccess();
  }, [loadRoleAccess]);

  useEffect(() => {
    if (!accessLoaded || !canView) {
      if (accessLoaded) setLoading(false);
      return;
    }
    void loadImplementation();
  }, [accessLoaded, canView, loadImplementation]);

  useEffect(() => {
    if (!accessLoaded || !canView) return;
    void loadCalendarStatus();
  }, [accessLoaded, canView, loadCalendarStatus]);

  useEffect(() => {
    if (!customerIntakeLoaded) return;
    void loadDnsCheck();
  }, [customerIntakeLoaded, loadDnsCheck]);

  useEffect(() => {
    if (loading || typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("outlook") !== "connected") return;

    setMessage("Outlook is verbonden. Nieuwe en gewijzigde afspraken worden met je agenda gesynchroniseerd.");
    void loadCalendarStatus();
    url.searchParams.delete("outlook");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [loadCalendarStatus, loading]);

  async function saveImplementation(
    patch: Partial<ImplementationRecord>,
    successMessage: string,
    optimistic = false,
  ) {
    if (!implementation || !supabase || saving) return false;

    const previousImplementation = implementation;
    if (optimistic) setImplementation({ ...implementation, ...patch });
    setSaving(true);
    setMessage("Implementatie wordt opgeslagen...");

    const { data, error } = await supabase
      .from("implementations")
      .update(patch as never)
      .eq("id", implementation.id)
      .select("*")
      .single();

    if (error) {
      if (optimistic) setImplementation(previousImplementation);
      setMessage(`Opslaan mislukt: ${error.message}`);
    } else {
      setImplementation(data as ImplementationRecord);
      setMessage(successMessage);
    }

    setSaving(false);
    return !error;
  }

  function updateProgress(key: ImplementationProgressKey, checked: boolean) {
    if (!implementation || !canEdit || saving) return;

    const progress = {
      ...normalizeImplementationProgress(implementation.progress),
      [key]: checked,
    };
    void saveImplementation({ progress }, `${IMPLEMENTATION_PROGRESS_ITEMS.find((item) => item.key === key)?.label ?? "Stap"} bijgewerkt.`, true);
  }

  function updateImplementationItem(
    item: ImplementationItem,
    checked: boolean,
    workItem?: string,
  ) {
    if (!implementation || !canEdit || saving) return;

    const implementationItemProgress = {
      ...normalizeImplementationItemProgress(implementation.implementation_item_progress),
    };
    const existingWorkItems = getImplementationWorkItemStatuses(item, implementationItemProgress);
    if (!item.selectableWorkItems) {
      for (const existingWorkItem of existingWorkItems) {
        if (!Object.prototype.hasOwnProperty.call(implementationItemProgress, existingWorkItem.key)) {
          implementationItemProgress[existingWorkItem.key] = existingWorkItem.completed;
        }
      }
    }
    const progressKey = workItem
      ? getImplementationWorkItemProgressKey(item.key, workItem)
      : item.key;
    implementationItemProgress[progressKey] = checked;

    if (workItem) {
      implementationItemProgress[item.key] = (item.workItems ?? []).every((candidate) => {
        const candidateKey = getImplementationWorkItemProgressKey(item.key, candidate);
        return implementationItemProgress[candidateKey] === true;
      });
    }

    void saveImplementation(
      { implementation_item_progress: implementationItemProgress },
      `${workItem || item.label} bijgewerkt.`,
      true,
    );
  }

  function updateImplementationWorkStatus(
    item: ImplementationItem,
    workItem: string | undefined,
    status: ImplementationWorkStatus,
  ) {
    if (!implementation || !canEdit || saving) return;

    const implementationItemProgress = {
      ...normalizeImplementationItemProgress(implementation.implementation_item_progress),
    };
    const progressKey = workItem
      ? getImplementationWorkItemProgressKey(item.key, workItem)
      : item.key;

    if (!status) delete implementationItemProgress[progressKey];
    else implementationItemProgress[progressKey] = status === "completed";

    if (workItem) {
      delete implementationItemProgress[item.key];
      const statuses = getImplementationWorkItemStatuses(item, implementationItemProgress);
      const selectedStatuses = statuses.filter((candidate) => candidate.selected);
      if (selectedStatuses.length === 0) delete implementationItemProgress[item.key];
      else implementationItemProgress[item.key] = selectedStatuses.every((candidate) => candidate.completed);
    }

    void saveImplementation(
      { implementation_item_progress: implementationItemProgress },
      `${workItem || item.label} bijgewerkt.`,
      true,
    );
  }

  async function addImplementationCustomWorkItem(item: ImplementationItem) {
    if (!implementation || !canEdit || saving) return;

    const label = customWorkDraft.trim().replace(/\s+/g, " ").slice(0, 300);
    if (!label) {
      setMessage("Vul eerst een werkzaamheid in.");
      return;
    }

    const normalizedLabel = normalizedImplementationWorkLabel(label);
    if ((item.workItems ?? []).some((workItem) => (
      normalizedImplementationWorkLabel(workItem) === normalizedLabel
    ))) {
      setMessage("Deze werkzaamheid staat al bij dit onderdeel.");
      return;
    }

    const nextCustomWorkItems = {
      ...implementationCustomWorkItems,
      [item.key]: [...(implementationCustomWorkItems[item.key] ?? []), label],
    };
    const implementationItemProgress = {
      ...normalizeImplementationItemProgress(implementation.implementation_item_progress),
    };

    if (!item.selectableWorkItems) {
      for (const existingWorkItem of getImplementationWorkItemStatuses(item, implementationItemProgress)) {
        if (!Object.prototype.hasOwnProperty.call(implementationItemProgress, existingWorkItem.key)) {
          implementationItemProgress[existingWorkItem.key] = existingWorkItem.completed;
        }
      }
    }
    implementationItemProgress[getImplementationWorkItemProgressKey(item.key, label)] = false;
    implementationItemProgress[item.key] = false;

    const saved = await saveImplementation(
      {
        implementation_custom_work_items: nextCustomWorkItems,
        implementation_item_progress: implementationItemProgress,
      },
      `${label} toegevoegd aan ${item.label}.`,
      true,
    );
    if (!saved) return;

    setCustomWorkDraft("");
    setCustomWorkEditorKey(null);
  }

  async function removeImplementationCustomWorkItem(item: ImplementationItem, label: string) {
    if (!implementation || !canEdit || saving) return;

    const normalizedLabel = normalizedImplementationWorkLabel(label);
    const remainingCustomItems = (implementationCustomWorkItems[item.key] ?? []).filter((workItem) => (
      normalizedImplementationWorkLabel(workItem) !== normalizedLabel
    ));
    const nextCustomWorkItems = { ...implementationCustomWorkItems };
    if (remainingCustomItems.length > 0) nextCustomWorkItems[item.key] = remainingCustomItems;
    else delete nextCustomWorkItems[item.key];

    const implementationItemProgress = {
      ...normalizeImplementationItemProgress(implementation.implementation_item_progress),
    };
    if (!item.selectableWorkItems) {
      for (const existingWorkItem of getImplementationWorkItemStatuses(item, implementationItemProgress)) {
        if (!Object.prototype.hasOwnProperty.call(implementationItemProgress, existingWorkItem.key)) {
          implementationItemProgress[existingWorkItem.key] = existingWorkItem.completed;
        }
      }
    }
    delete implementationItemProgress[getImplementationWorkItemProgressKey(item.key, label)];
    if (item.selectableWorkItems) delete implementationItemProgress[item.key];

    const remainingWorkItems = (item.workItems ?? []).filter((workItem) => (
      normalizedImplementationWorkLabel(workItem) !== normalizedLabel
    ));
    if (remainingWorkItems.length > 0) {
      const remainingStatuses = getImplementationWorkItemStatuses(
        { ...item, workItems: remainingWorkItems },
        implementationItemProgress,
      );
      const relevantStatuses = item.selectableWorkItems
        ? remainingStatuses.filter((workItem) => workItem.selected)
        : remainingStatuses;
      if (relevantStatuses.length > 0) {
        implementationItemProgress[item.key] = relevantStatuses.every((workItem) => workItem.completed);
      } else {
        delete implementationItemProgress[item.key];
      }
    } else {
      delete implementationItemProgress[item.key];
    }

    await saveImplementation(
      {
        implementation_custom_work_items: nextCustomWorkItems,
        implementation_item_progress: implementationItemProgress,
      },
      `${label} verwijderd uit ${item.label}.`,
      true,
    );
  }

  async function addImplementationCustomTask() {
    if (!implementation || !canEdit || saving) return;

    const label = customTaskDraft.trim().replace(/\s+/g, " ").slice(0, 300);
    if (!label) {
      setMessage("Vul eerst een taak in.");
      return;
    }
    const normalizedLabel = normalizedImplementationWorkLabel(label);
    if (configuredImplementationTasks.some((task) => (
      normalizedImplementationWorkLabel(task.label) === normalizedLabel
    ))) {
      setMessage("Deze taak staat al bij deze implementatie.");
      return;
    }

    const nextCustomWorkItems = {
      ...implementationCustomWorkItems,
      [IMPLEMENTATION_CUSTOM_TASKS_KEY]: [
        ...(implementationCustomWorkItems[IMPLEMENTATION_CUSTOM_TASKS_KEY] ?? []),
        label,
      ],
    };
    const implementationItemProgress = {
      ...normalizeImplementationItemProgress(implementation.implementation_item_progress),
      [getImplementationCustomTaskKey(label)]: false,
    };
    const saved = await saveImplementation(
      {
        implementation_custom_work_items: nextCustomWorkItems,
        implementation_item_progress: implementationItemProgress,
      },
      `${label} toegevoegd aan Taken.`,
      true,
    );
    if (!saved) return;

    setCustomTaskDraft("");
    setCustomTaskEditorOpen(false);
  }

  async function removeImplementationCustomTask(item: ImplementationItem) {
    if (!implementation || !canEdit || saving) return;

    const normalizedLabel = normalizedImplementationWorkLabel(item.label);
    const remainingTasks = (
      implementationCustomWorkItems[IMPLEMENTATION_CUSTOM_TASKS_KEY] ?? []
    ).filter((label) => normalizedImplementationWorkLabel(label) !== normalizedLabel);
    const nextCustomWorkItems = { ...implementationCustomWorkItems };
    if (remainingTasks.length > 0) {
      nextCustomWorkItems[IMPLEMENTATION_CUSTOM_TASKS_KEY] = remainingTasks;
    } else {
      delete nextCustomWorkItems[IMPLEMENTATION_CUSTOM_TASKS_KEY];
    }
    delete nextCustomWorkItems[item.key];
    const implementationItemProgress = {
      ...normalizeImplementationItemProgress(implementation.implementation_item_progress),
    };
    for (const workItem of getImplementationWorkItemStatuses(item, implementationItemProgress)) {
      delete implementationItemProgress[workItem.key];
    }
    delete implementationItemProgress[item.key];

    await saveImplementation(
      {
        implementation_custom_work_items: nextCustomWorkItems,
        implementation_item_progress: implementationItemProgress,
      },
      `${item.label} verwijderd uit Taken.`,
      true,
    );
  }

  async function assignConsultant(consultantId: string) {
    if (!implementation || !canAssign) return;

    const assignedUser = assignableUsers.find((profile) => profile.id === consultantId) ?? null;
    const nextStatus = assignedUser && implementation.status === "new"
      ? "assigned"
      : !assignedUser && implementation.status === "assigned"
        ? "new"
        : implementation.status;

    await saveImplementation({
      assigned_consultant_id: assignedUser?.id ?? null,
      assigned_consultant_name: assignedUser?.full_name || assignedUser?.email || null,
      assigned_consultant_email: assignedUser?.email ?? null,
      assigned_by: user?.id ?? null,
      assigned_at: assignedUser ? new Date().toISOString() : null,
      status: nextStatus,
    }, assignedUser
      ? `Implementatie toegewezen aan ${assignedUser.full_name || assignedUser.email}.`
      : "Toewijzing verwijderd.");
  }

  function saveImplementationDetail(
    field: ImplementationDetailField,
    rawValue: string,
    label: string,
  ) {
    if (!implementation || !supabase || !canEdit) return;

    const value = field === "planned_go_live_date"
      || field === "implementation_start_date"
      || field === "actual_go_live_date"
      ? rawValue || null
      : rawValue.trim() || null;
    const implementationIdToSave = implementation.id;

    setImplementation((current) => current ? { ...current, [field]: value } : current);
    pendingDetailSavesRef.current += 1;
    setDetailSaveState("saving");
    setDetailSaveMessage(`${label} wordt opgeslagen...`);

    const persist = async () => {
      try {
        const { data, error } = await supabase
          .from("implementations")
          .update({ [field]: value } as never)
          .eq("id", implementationIdToSave)
          .select("*")
          .single();

        if (error) throw new Error(error.message);
        const persistedValue = (data as ImplementationRecord | null)?.[field] ?? null;
        if (persistedValue !== value) {
          throw new Error("De database heeft de wijziging niet bevestigd.");
        }
        setImplementation((current) => current ? { ...current, [field]: persistedValue } : current);
        setDetailSaveState("saved");
        setDetailSaveMessage(`${label} opgeslagen`);
      } catch (error) {
        setDetailSaveState("error");
        setDetailSaveMessage(
          `${label} opslaan mislukt: ${error instanceof Error ? error.message : "onbekende fout"}`,
        );
      } finally {
        pendingDetailSavesRef.current -= 1;
        if (pendingDetailSavesRef.current > 0) {
          setDetailSaveState("saving");
          setDetailSaveMessage("Wijzigingen worden opgeslagen...");
        }
      }
    };

    detailSaveQueueRef.current = detailSaveQueueRef.current.then(persist, persist);
  }

  function updateDnsDomainInput(value: string) {
    setDnsDomainInput(value);
    dnsDomainInputRef.current = value;
    if (dnsCheck?.domain !== getWebsiteDomain(value)) setDnsCheck(null);
    setDnsCheckError("");
  }

  function saveDnsDomain() {
    if (!implementation || !canEdit) return;

    const rawDomain = dnsDomainInputRef.current.trim();
    const domain = getWebsiteDomain(rawDomain);
    if (rawDomain && !domain) {
      setDnsCheck(null);
      setDnsCheckError("Vul een geldige domeinnaam in, bijvoorbeeld klant.nl.");
      return;
    }

    setDnsDomainInput(domain);
    dnsDomainInputRef.current = domain;
    if ((implementation.dns_domain ?? "") !== domain) {
      saveImplementationDetail("dns_domain", domain, "Domeinnaam");
    }
    if (domain) void loadDnsCheck(domain);
  }

  async function createOrRefreshPortal(regenerate: boolean) {
    if (!implementation || !canEdit || portalBusy) return;

    setPortalBusy(true);
    setPortalError("");
    try {
      const response = await fetch(
        `/api/implementations/${encodeURIComponent(implementation.id)}/portal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ regenerate }),
        },
      );
      const json = await response.json().catch(() => ({})) as {
        portalAccess?: ImplementationPortalAccess;
        error?: string;
      };
      if (!response.ok || !json.portalAccess) {
        throw new Error(json.error || "Klantlink maken mislukt.");
      }
      setPortalAccess(json.portalAccess);
      setMessage(regenerate ? "Nieuwe klantlink gemaakt." : "Klantpagina geactiveerd.");
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : "Klantlink maken mislukt.");
    } finally {
      setPortalBusy(false);
    }
  }

  async function revokePortal() {
    if (!implementation || !canEdit || portalBusy || !portalAccess?.active) return;
    if (!window.confirm("Klantlink intrekken? De klant kan deze link daarna niet meer openen.")) return;

    setPortalBusy(true);
    setPortalError("");
    try {
      const response = await fetch(
        `/api/implementations/${encodeURIComponent(implementation.id)}/portal`,
        { method: "DELETE" },
      );
      const json = await response.json().catch(() => ({})) as {
        portalAccess?: ImplementationPortalAccess | null;
        error?: string;
      };
      if (!response.ok) throw new Error(json.error || "Klantlink intrekken mislukt.");
      setPortalAccess(json.portalAccess ?? null);
      setMessage("Klantlink is ingetrokken.");
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : "Klantlink intrekken mislukt.");
    } finally {
      setPortalBusy(false);
    }
  }

  async function copyPortalUrl() {
    if (!portalAccess?.publicUrl) return;
    try {
      await navigator.clipboard.writeText(portalAccess.publicUrl);
      setMessage("Klantlink gekopieerd.");
    } catch {
      setPortalError("Kopiëren is niet gelukt. Selecteer de link en kopieer deze handmatig.");
    }
  }

  async function createCustomerOutlookDraft(input: {
    busyKey: string;
    popupTitle: string;
    popupDescription: string;
    successMessage: string;
    payload: Record<string, unknown>;
  }) {
    if (
      !implementation
      || customerOutlookBusyKey
      || portalBusy
    ) return;

    const recipientEmail = (
      customerIntake?.recipientEmail || customerIntake?.formData.contactEmail || ""
    ).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(recipientEmail)) {
      setMessage("In het klantformulier ontbreekt een geldig e-mailadres.");
      return;
    }

    const outlookWindow = window.open("about:blank", "_blank");
    if (outlookWindow) outlookWindow.opener = null;
    showOutlookPopupStatus(
      outlookWindow,
      input.popupTitle,
      input.popupDescription,
    );
    setCustomerOutlookBusyKey(input.busyKey);
    setMessage("Outlook-verbinding wordt gecontroleerd...");
    const returnTo = `/implementatie/${encodeURIComponent(implementation.id)}`;

    try {
      const statusResponse = await fetch(
        `/api/outlook/status?returnTo=${encodeURIComponent(returnTo)}`,
        { cache: "no-store" },
      );
      const statusJson = await statusResponse.json().catch(() => ({})) as {
        connected?: boolean;
        connectUrl?: string;
        error?: string;
      };
      if (!statusResponse.ok) {
        throw new Error(statusJson.error || "Outlook-verbinding controleren mislukt.");
      }
      if (!statusJson.connected) {
        const connectUrl = statusJson.connectUrl
          || `/api/outlook/connect?returnTo=${encodeURIComponent(returnTo)}`;
        setMessage("Outlook wordt eenmalig verbonden...");
        if (!navigateOutlookPopup(outlookWindow, connectUrl)) window.location.assign(connectUrl);
        return;
      }

      let activePortal = portalAccess;
      if (!activePortal?.active || !activePortal.publicUrl) {
        setPortalBusy(true);
        setPortalError("");
        const portalResponse = await fetch(
          `/api/implementations/${encodeURIComponent(implementation.id)}/portal`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ regenerate: Boolean(activePortal) }),
          },
        );
        const portalJson = await portalResponse.json().catch(() => ({})) as {
          portalAccess?: ImplementationPortalAccess;
          error?: string;
        };
        if (!portalResponse.ok || !portalJson.portalAccess?.publicUrl) {
          throw new Error(portalJson.error || "Klantlink maken mislukt.");
        }
        activePortal = portalJson.portalAccess;
        setPortalAccess(activePortal);
      }

      setMessage("Outlook-concept wordt gemaakt...");
      const response = await fetch(
        `/api/outlook/drafts?returnTo=${encodeURIComponent(returnTo)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...input.payload,
            recipientEmail,
            customerName: implementation.customer_name,
            contactName:
              customerIntake?.formData.contactFirstName
              || implementation.contact_name
              || "",
            publicUrl: activePortal.publicUrl,
          }),
        },
      );
      const json = await response.json().catch(() => ({})) as {
        webLink?: string;
        reconnectRequired?: boolean;
        connectUrl?: string;
        error?: string;
      };

      if (json.reconnectRequired && json.connectUrl) {
        setMessage("Outlook moet opnieuw worden verbonden...");
        if (!navigateOutlookPopup(outlookWindow, json.connectUrl)) window.location.assign(json.connectUrl);
        return;
      }
      if (!response.ok || !json.webLink) {
        throw new Error(json.error || "Outlook-concept maken mislukt.");
      }

      if (!navigateOutlookPopup(outlookWindow, json.webLink)) window.location.assign(json.webLink);
      setMessage(input.successMessage);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Outlook-concept maken mislukt.";
      showOutlookPopupStatus(outlookWindow, "Outlook-concept niet gemaakt", errorMessage, "error");
      setMessage(errorMessage);
    } finally {
      setPortalBusy(false);
      setCustomerOutlookBusyKey(null);
    }
  }

  function handleAppointmentOutlookDraft(appointment: ImplementationAppointment) {
    if (!implementation) return;

    void createCustomerOutlookDraft({
      busyKey: `appointment:${appointment.id}`,
      popupTitle: "Implementatieafspraak voorbereiden",
      popupDescription: "De klantmail en het agenda-bestand worden klaargezet in Outlook.",
      successMessage: "Implementatieafspraak is met agenda-bestand in Outlook klaargezet.",
      payload: {
        template: "implementation-appointment",
        appointmentId: appointment.id,
        appointmentDate: appointment.appointmentDate,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        appointmentType: appointment.appointmentType,
        title: appointment.title,
        customerNote: appointment.customerNote,
        location: getAppointmentLocation(
          appointment.appointmentType,
          customerIntake,
          implementation.customer_name,
        ),
        workItems: appointment.workItems,
      },
    });
  }

  function handleProgressOutlookDraft() {
    void createCustomerOutlookDraft({
      busyKey: "implementation-progress",
      popupTitle: "Klantpagina voorbereiden",
      popupDescription: "De klantmail met de beveiligde voortgangslink wordt klaargezet in Outlook.",
      successMessage: "Klantpagina is in Outlook klaargezet.",
      payload: { template: "implementation-progress" },
    });
  }

  function updateAppointmentLocal(
    appointmentId: string,
    patch: Partial<ImplementationAppointment>,
  ) {
    setAppointments((current) => current.map((appointment) => (
      appointment.id === appointmentId ? { ...appointment, ...patch } : appointment
    )));
  }

  function applyAppointmentCalendarSync(
    calendar: AppointmentCalendarSync | undefined,
    salesMessage: string,
    outlookMessage: string,
  ) {
    if (!calendar) {
      setMessage(salesMessage);
      return;
    }
    if (calendar.connectUrl) setCalendarConnectUrl(calendar.connectUrl);
    if (calendar.synced) {
      setAppointmentsWarning("");
      setMessage(outlookMessage);
      return;
    }
    if (calendar.reconnectRequired) setCalendarConnected(false);
    setAppointmentsWarning(calendar.warning || "De Outlook-agenda kon niet worden bijgewerkt.");
    setMessage(salesMessage);
  }

  async function saveAppointment(appointment: ImplementationAppointment) {
    if (!implementation || !canEdit) return;

    const implementationIdToSave = implementation.id;
    pendingAppointmentSavesRef.current += 1;
    setAppointmentsBusy(true);
    setAppointmentsError("");

    const persist = async () => {
      try {
        const response = await fetch(
          `/api/implementations/${encodeURIComponent(implementationIdToSave)}/appointments/${encodeURIComponent(appointment.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(appointment),
          },
        );
        const json = await response.json().catch(() => ({})) as {
          appointment?: ImplementationAppointment;
          calendar?: AppointmentCalendarSync;
          error?: string;
        };
        if (!response.ok || !json.appointment) {
          throw new Error(json.error || "Afspraak opslaan mislukt.");
        }
        const savedAppointment = json.appointment;
        setAppointments((current) => sortAppointments(current.map((item) => (
          item.id === savedAppointment.id ? savedAppointment : item
        ))));
        applyAppointmentCalendarSync(
          json.calendar,
          "Afspraak automatisch opgeslagen.",
          "Afspraak automatisch opgeslagen en bijgewerkt in Outlook.",
        );
      } catch (error) {
        setAppointmentsError(error instanceof Error ? error.message : "Afspraak opslaan mislukt.");
      } finally {
        pendingAppointmentSavesRef.current -= 1;
        if (pendingAppointmentSavesRef.current === 0) setAppointmentsBusy(false);
      }
    };

    appointmentSaveQueueRef.current = appointmentSaveQueueRef.current.then(persist, persist);
  }

  async function addAppointment() {
    if (!implementation || !canEdit || appointmentsBusy) return;
    if (!appointmentDraft.appointmentDate) {
      setAppointmentsError("Kies eerst een datum voor de afspraak.");
      return;
    }

    setAppointmentsBusy(true);
    setAppointmentsError("");
    try {
      const response = await fetch(
        `/api/implementations/${encodeURIComponent(implementation.id)}/appointments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(appointmentDraft),
        },
      );
      const json = await response.json().catch(() => ({})) as {
        appointment?: ImplementationAppointment;
        calendar?: AppointmentCalendarSync;
        error?: string;
      };
      if (!response.ok || !json.appointment) {
        throw new Error(json.error || "Afspraak toevoegen mislukt.");
      }
      setAppointments((current) => sortAppointments([...current, json.appointment as ImplementationAppointment]));
      setAppointmentDraft(EMPTY_APPOINTMENT_DRAFT);
      applyAppointmentCalendarSync(
        json.calendar,
        "Afspraak toegevoegd en zichtbaar voor de klant.",
        "Afspraak toegevoegd, zichtbaar voor de klant en in Outlook.",
      );
    } catch (error) {
      setAppointmentsError(error instanceof Error ? error.message : "Afspraak toevoegen mislukt.");
    } finally {
      setAppointmentsBusy(false);
    }
  }

  function updateAppointmentWorkSelection(
    appointment: ImplementationAppointment,
    workItems: ImplementationAppointmentWorkItem[],
  ) {
    const nextAppointment = {
      ...appointment,
      workItems,
    };
    updateAppointmentLocal(appointment.id, nextAppointment);
    void saveAppointment(nextAppointment);
  }

  function moveAppointmentWorkItem(
    targetAppointment: ImplementationAppointment,
    workItem: ImplementationAppointmentWorkItem,
    sourceAppointmentId: string,
  ) {
    const sourceAppointment = appointments.find((appointment) => (
      appointment.id === sourceAppointmentId
    ));
    if (!sourceAppointment || sourceAppointment.id === targetAppointment.id) return;

    const nextSourceAppointment = {
      ...sourceAppointment,
      workItems: sourceAppointment.workItems.filter((item) => item.key !== workItem.key),
    };
    const nextTargetAppointment = {
      ...targetAppointment,
      workItems: toggleAppointmentWorkItem(targetAppointment.workItems, workItem, true),
    };

    updateAppointmentLocal(sourceAppointment.id, nextSourceAppointment);
    updateAppointmentLocal(targetAppointment.id, nextTargetAppointment);
    void saveAppointment(nextSourceAppointment);
    void saveAppointment(nextTargetAppointment);
  }

  async function deleteAppointment(appointment: ImplementationAppointment) {
    if (!implementation || !canEdit || appointmentsBusy) return;
    if (!window.confirm(`Afspraak op ${formatDate(appointment.appointmentDate)} verwijderen?`)) return;

    setAppointmentsBusy(true);
    setAppointmentsError("");
    try {
      const response = await fetch(
        `/api/implementations/${encodeURIComponent(implementation.id)}/appointments/${encodeURIComponent(appointment.id)}`,
        { method: "DELETE" },
      );
      const json = await response.json().catch(() => ({})) as {
        calendar?: AppointmentCalendarSync;
        error?: string;
      };
      if (!response.ok) throw new Error(json.error || "Afspraak verwijderen mislukt.");
      setAppointments((current) => current.filter((item) => item.id !== appointment.id));
      applyAppointmentCalendarSync(
        json.calendar,
        "Afspraak verwijderd uit Sales.",
        "Afspraak verwijderd uit Sales en Outlook.",
      );
    } catch (error) {
      setAppointmentsError(error instanceof Error ? error.message : "Afspraak verwijderen mislukt.");
    } finally {
      setAppointmentsBusy(false);
    }
  }

  async function handleDnsOutlookDraft() {
    if (!implementation || dnsOutlookBusy) return;

    const recipientEmail = (
      customerIntake?.recipientEmail || customerIntake?.formData.contactEmail || ""
    ).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(recipientEmail)) {
      setMessage("Er ontbreekt een geldig klant-e-mailadres voor het Outlook-concept.");
      return;
    }

    const domain = getWebsiteDomain(dnsDomainInputRef.current);
    if (!domain) {
      setMessage("Vul eerst een geldige domeinnaam in.");
      return;
    }

    const outlookWindow = window.open("about:blank", "_blank");
    if (outlookWindow) outlookWindow.opener = null;
    showOutlookPopupStatus(
      outlookWindow,
      "DNS-instructies voorbereiden",
      "Het Outlook-concept met de SPF- en DKIM-instructies wordt gemaakt.",
    );
    setDnsOutlookBusy(true);
    setMessage("Outlook-verbinding wordt gecontroleerd...");

    const returnTo = `/implementatie/${encodeURIComponent(implementation.id)}`;

    try {
      const statusResponse = await fetch(
        `/api/outlook/status?returnTo=${encodeURIComponent(returnTo)}`,
        { cache: "no-store" },
      );
      const statusJson = await statusResponse.json().catch(() => ({})) as {
        connected?: boolean;
        connectUrl?: string;
        error?: string;
      };
      if (!statusResponse.ok) {
        throw new Error(statusJson.error || "Outlook-verbinding controleren mislukt.");
      }
      if (!statusJson.connected) {
        const connectUrl = statusJson.connectUrl || `/api/outlook/connect?returnTo=${encodeURIComponent(returnTo)}`;
        setMessage("Outlook wordt eenmalig verbonden...");
        if (!navigateOutlookPopup(outlookWindow, connectUrl)) window.location.assign(connectUrl);
        return;
      }

      setMessage("DNS-concept wordt gemaakt...");
      const response = await fetch(
        `/api/outlook/drafts?returnTo=${encodeURIComponent(returnTo)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template: "dns-instructions",
            recipientEmail,
            customerName: implementation.customer_name,
            contactName:
              customerIntake?.formData.contactFirstName || implementation.contact_name || "",
            domain,
          }),
        },
      );
      const json = await response.json().catch(() => ({})) as {
        webLink?: string;
        reconnectRequired?: boolean;
        connectUrl?: string;
        error?: string;
      };

      if (json.reconnectRequired && json.connectUrl) {
        setMessage("Outlook moet opnieuw worden verbonden...");
        if (!navigateOutlookPopup(outlookWindow, json.connectUrl)) window.location.assign(json.connectUrl);
        return;
      }
      if (!response.ok || !json.webLink) {
        throw new Error(json.error || "DNS-concept maken mislukt.");
      }
      if (!navigateOutlookPopup(outlookWindow, json.webLink)) window.location.assign(json.webLink);
      setMessage(`DNS-concept voor ${domain} is aangemaakt.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "DNS-concept maken mislukt.";
      showOutlookPopupStatus(outlookWindow, "DNS-concept niet gemaakt", errorMessage, "error");
      setMessage(errorMessage);
    } finally {
      setDnsOutlookBusy(false);
    }
  }

  async function handleNewCustomerOutlookDraft() {
    if (!implementation || newCustomerOutlookBusy) return;

    const outlookWindow = window.open("about:blank", "_blank");
    if (outlookWindow) outlookWindow.opener = null;
    showOutlookPopupStatus(
      outlookWindow,
      "Nieuwe klantmail voorbereiden",
      "Het Outlook-concept met alle klant- en implementatiegegevens wordt gemaakt.",
    );
    setNewCustomerOutlookBusy(true);
    setMessage("Outlook-verbinding wordt gecontroleerd...");

    const returnTo = `/implementatie/${encodeURIComponent(implementation.id)}`;

    try {
      const statusResponse = await fetch(
        `/api/outlook/status?returnTo=${encodeURIComponent(returnTo)}`,
        { cache: "no-store" },
      );
      const statusJson = await statusResponse.json().catch(() => ({})) as {
        connected?: boolean;
        connectUrl?: string;
        error?: string;
      };
      if (!statusResponse.ok) {
        throw new Error(statusJson.error || "Outlook-verbinding controleren mislukt.");
      }
      if (!statusJson.connected) {
        const connectUrl = statusJson.connectUrl || `/api/outlook/connect?returnTo=${encodeURIComponent(returnTo)}`;
        setMessage("Outlook wordt eenmalig verbonden...");
        if (!navigateOutlookPopup(outlookWindow, connectUrl)) window.location.assign(connectUrl);
        return;
      }

      setMessage("Nieuwe klantmail wordt gemaakt...");
      const response = await fetch(
        `/api/implementations/${encodeURIComponent(implementation.id)}/new-customer-draft?returnTo=${encodeURIComponent(returnTo)}`,
        { method: "POST" },
      );
      const json = await response.json().catch(() => ({})) as {
        webLink?: string;
        reconnectRequired?: boolean;
        connectUrl?: string;
        error?: string;
      };

      if (json.reconnectRequired && json.connectUrl) {
        setMessage("Outlook moet opnieuw worden verbonden...");
        if (!navigateOutlookPopup(outlookWindow, json.connectUrl)) window.location.assign(json.connectUrl);
        return;
      }
      if (!response.ok || !json.webLink) {
        throw new Error(json.error || "Nieuwe klantmail maken mislukt.");
      }
      if (!navigateOutlookPopup(outlookWindow, json.webLink)) window.location.assign(json.webLink);
      setMessage("Nieuwe klantmail is in Outlook klaargezet.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Nieuwe klantmail maken mislukt.";
      showOutlookPopupStatus(outlookWindow, "Nieuwe klantmail niet gemaakt", errorMessage, "error");
      setMessage(errorMessage);
    } finally {
      setNewCustomerOutlookBusy(false);
    }
  }

  if (!accessLoaded || loading) {
    return (
      <div className="page-shell">
        <div className="container">
          <div className="save-status">Implementatie wordt geladen...</div>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="eyebrow">Geen toegang</div>
            <h1>Implementatie</h1>
            <p className="subtext">Je rol heeft geen toegang tot deze pagina.</p>
          </section>
        </div>
      </div>
    );
  }

  if (!implementation) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="eyebrow">Niet gevonden</div>
            <h1>Implementatie niet beschikbaar</h1>
            <p className="subtext">Dit dossier bestaat niet of is niet aan jou toegewezen.</p>
            <Link href="/implementatie" className="secondary-button">
              <ArrowLeft size={16} /> Terug naar implementaties
            </Link>
          </section>
        </div>
      </div>
    );
  }

  const loadedImplementationId = implementation.id;
  const progress = normalizeImplementationProgress(implementation.progress);
  const intakePresentation = getCustomerIntakePresentation(
    customerIntakeLoaded,
    customerIntakeLoadFailed,
    customerIntake,
  );
  const customerIntakeComplete = intakePresentation.tone === "success";
  const customerDomain = getWebsiteDomain(dnsDomainInput);
  const customerEmail = customerIntake?.recipientEmail || customerIntake?.formData.contactEmail || "";
  const hasCustomerEmail = /^\S+@\S+\.\S+$/.test(customerEmail.trim());
  const newCustomerMailMissingFields = [
    !customerIntake?.submittedAt ? "klantformulier" : "",
    !implementation.assigned_consultant_name?.trim() ? "consultant" : "",
    !implementation.administration_name?.trim() ? "administratie" : "",
    !implementation.planned_go_live_date?.trim() ? "livegang" : "",
    !implementation.financial_package?.trim() ? "financieel pakket" : "",
  ].filter(Boolean);
  const newCustomerMailReady = newCustomerMailMissingFields.length === 0;
  const progressRows = [
    ...IMPLEMENTATION_PROGRESS_ITEMS.map((item) => ({ kind: "check" as const, ...item })),
    { kind: "intake" as const, number: 2, key: "customerIntake", label: "Klantformulier" },
  ].sort((left, right) => left.number - right.number);
  const progressRequiresAction = (key: ImplementationProgressKey) => (
    key === "implementationStartInvoice" && Boolean(implementation.implementation_start_date)
  ) || (
    key === "implementationEndInvoice" && Boolean(implementation.actual_go_live_date)
  );
  const completedImplementationTasks = configuredImplementationTasks.filter(
    (item) => isImplementationItemCompleted(item, implementationItemProgress),
  ).length;
  const selectedImplementationTasks = configuredImplementationTasks.filter(
    (item) => isImplementationItemSelected(item, implementationItemProgress),
  ).length;
  const completedImplementationItems = configuredImplementationItems.filter(
    (item) => (
      isImplementationItemSelected(item, implementationItemProgress)
      && isImplementationItemCompleted(item, implementationItemProgress)
    ),
  ).length;
  const selectedImplementationItems = configuredImplementationItems.filter(
    (item) => isImplementationItemSelected(item, implementationItemProgress),
  ).length;
  const customerWorkApprovalRows = Object.values(implementationCustomerWorkApprovals).sort((left, right) => (
    new Date(right.approvedAt).getTime() - new Date(left.approvedAt).getTime()
  ));
  const expectedOnSiteAppointments = dealPriceSummary?.onSiteAppointments ?? 0;
  const scheduledOnSiteAppointments = appointments.filter(
    (appointment) => appointment.appointmentType === "on_site",
  ).length;
  const customImplementationTaskLabels = new Set(
    (implementationCustomWorkItems[IMPLEMENTATION_CUSTOM_TASKS_KEY] ?? []).map((label) => (
      normalizedImplementationWorkLabel(label)
    )),
  );

  function renderImplementationWorkItems(
    item: ImplementationItem,
    workItems: ReturnType<typeof getImplementationWorkItemStatuses>,
  ) {
    const customLabels = new Set(
      (implementationCustomWorkItems[item.key] ?? []).map((label) => (
        normalizedImplementationWorkLabel(label)
      )),
    );
    const editorOpen = customWorkEditorKey === item.key;

    return (
      <>
        {workItems.length > 0 ? (
          <div className="implementation-work-items">
            {workItems.map((workItem) => {
              const custom = customLabels.has(normalizedImplementationWorkLabel(workItem.label));
              const customerApproval = implementationCustomerWorkApprovals[workItem.key];
              const workStatus: ImplementationWorkStatus = !workItem.selected
                ? ""
                : workItem.completed ? "completed" : "todo";
              const approvalStatus = customerApproval ? (
                <small className="implementation-customer-approval-status approved">
                  <CheckCircle2 size={13} aria-hidden="true" />
                  Klant akkoord op {formatDateTime(customerApproval.approvedAt)}
                </small>
              ) : workItem.completed ? (
                <small className="implementation-customer-approval-status">
                  <Clock3 size={13} aria-hidden="true" /> Wacht op akkoord van de klant
                </small>
              ) : null;
              return (
                <div
                  key={workItem.key}
                  className={`implementation-work-item-row ${custom ? "custom" : ""} ${
                    item.selectableWorkItems ? "selectable" : ""
                  }`}
                >
                  {item.selectableWorkItems ? (
                    <span className={`implementation-task-status-row ${workItem.completed ? "completed" : ""}`}>
                      <span className="implementation-work-item-details">
                        <span className="implementation-work-item-label">{workItem.label}</span>
                        <span className="implementation-task-owner">
                          {IMPLEMENTATION_TASK_OWNER_LABELS[workItem.owner]}
                        </span>
                        {approvalStatus}
                      </span>
                      <select
                        value={workStatus}
                        disabled={!canEdit || saving || Boolean(customerApproval)}
                        aria-label={`Status van ${workItem.label}`}
                        onChange={(event) => updateImplementationWorkStatus(
                          item,
                          workItem.label,
                          event.target.value as ImplementationWorkStatus,
                        )}
                      >
                        <option value="">Niet geselecteerd</option>
                        <option value="todo">Te doen</option>
                        <option value="completed">Afgerond</option>
                      </select>
                    </span>
                  ) : (
                    <label
                      className={`implementation-work-item-check ${workItem.completed ? "completed" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={workItem.completed}
                        disabled={!canEdit || saving}
                        aria-label={`${workItem.label} afgerond`}
                        onChange={(event) => updateImplementationItem(
                          item,
                          event.target.checked,
                          workItem.label,
                        )}
                      />
                      <span className="implementation-work-item-details">
                        <span className="implementation-work-item-label">{workItem.label}</span>
                        {approvalStatus}
                      </span>
                    </label>
                  )}
                  {custom && canEdit ? (
                    <button
                      type="button"
                      className="implementation-custom-work-delete"
                      disabled={saving || Boolean(customerApproval)}
                      aria-label={`${workItem.label} verwijderen`}
                      title={customerApproval
                        ? "Deze werkzaamheid kan na klantakkoord niet meer worden verwijderd"
                        : "Deze implementatiespecifieke werkzaamheid verwijderen"}
                      onClick={() => void removeImplementationCustomWorkItem(item, workItem.label)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  ) : null}
                  <ImplementationWorkNoteEditor
                    implementationId={loadedImplementationId}
                    workItemKey={workItem.key}
                    workItemLabel={workItem.label}
                    initialNotes={implementationWorkItemNotes[workItem.key] ?? {}}
                    canEdit={canEdit}
                    onSaved={(notes) => setImplementation((current) => current
                      ? { ...current, implementation_work_item_notes: notes }
                      : current)}
                  />
                </div>
              );
            })}
          </div>
        ) : null}

        {workItems.length === 0 && (
          implementationCustomerWorkApprovals[item.key] ||
          isImplementationItemCompleted(item, implementationItemProgress)
        ) ? (
          <small className={`implementation-customer-approval-status implementation-item-customer-approval ${
            implementationCustomerWorkApprovals[item.key] ? "approved" : ""
          }`}>
            {implementationCustomerWorkApprovals[item.key] ? (
              <>
                <CheckCircle2 size={13} aria-hidden="true" />
                Klant akkoord op {formatDateTime(
                  implementationCustomerWorkApprovals[item.key].approvedAt,
                )}
              </>
            ) : (
              <><Clock3 size={13} aria-hidden="true" /> Wacht op akkoord van de klant</>
            )}
          </small>
        ) : null}

        {workItems.length === 0 ? (
          <ImplementationWorkNoteEditor
            implementationId={loadedImplementationId}
            workItemKey={item.key}
            workItemLabel={item.label}
            initialNotes={implementationWorkItemNotes[item.key] ?? {}}
            canEdit={canEdit}
            onSaved={(notes) => setImplementation((current) => current
              ? { ...current, implementation_work_item_notes: notes }
              : current)}
          />
        ) : null}

        {canEdit ? (
          editorOpen ? (
            <form
              className="implementation-custom-work-form"
              onSubmit={(event) => {
                event.preventDefault();
                void addImplementationCustomWorkItem(item);
              }}
            >
              <input
                autoFocus
                type="text"
                value={customWorkDraft}
                maxLength={300}
                disabled={saving}
                placeholder="Bijv. extra inrichting controleren"
                aria-label={`Werkzaamheid toevoegen aan ${item.label}`}
                onChange={(event) => setCustomWorkDraft(event.target.value)}
              />
              <button
                type="submit"
                disabled={saving || !customWorkDraft.trim()}
                aria-label="Werkzaamheid toevoegen"
                title="Werkzaamheid toevoegen"
              >
                <Plus size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={saving}
                aria-label="Annuleren"
                title="Annuleren"
                onClick={() => {
                  setCustomWorkDraft("");
                  setCustomWorkEditorKey(null);
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="implementation-custom-work-trigger"
              disabled={saving}
              onClick={() => {
                setCustomWorkDraft("");
                setCustomWorkEditorKey(item.key);
              }}
            >
              <Plus size={14} aria-hidden="true" /> Werkzaamheid toevoegen
            </button>
          )
        ) : null}
      </>
    );
  }

  return (
    <div className="page-shell">
      <div className="container">
        <header className="brand-hero card implementation-detail-hero">
          <div>
            <div className="brand-mark">Implementatiedossier</div>
            <h1>{implementation.customer_name}</h1>
            <p>{implementation.quote_title || "Nieuwe Smart Trade-klant"}</p>
          </div>
          <div className="brand-actions">
            <Link href="/implementatie" className="secondary-button">
              <ArrowLeft size={16} /> Terug naar overzicht
            </Link>
            <Link href={`/deals/${implementation.deal_id}`} className="secondary-button">
              <ExternalLink size={16} /> Open deal
            </Link>
            <StatusPill tone={getStatusTone(implementation.status)}>
              {IMPLEMENTATION_STATUS_LABELS[implementation.status]}
            </StatusPill>
          </div>
        </header>

        <section className="kpi-grid">
          <StatCard title="Pakket" value={implementation.package_name || "-"} icon={Package} sublabel="Gekozen pakket" />
          <StatCard
            title="Implementatie"
            value={euro.format(Number(implementation.implementation_total || 0))}
            icon={CircleDollarSign}
            sublabel="Bedrag uit de deal"
          />
          <StatCard
            title="Toegewezen aan"
            value={implementation.assigned_consultant_name || "Niet toegewezen"}
            icon={UserRoundCheck}
            sublabel={implementation.assigned_consultant_email || "Nog te plannen"}
          />
          <StatCard title="Aangemaakt" value={formatDate(implementation.created_at)} icon={CalendarDays} sublabel="Start van het dossier" />
        </section>

        <section className="card panel implementation-price-breakdown">
          <div className="top-row">
            <div>
              <div className="eyebrow">Offerte</div>
              <h2 className="headline">Prijsopbouw</h2>
            </div>
            <CircleDollarSign size={28} aria-hidden="true" />
          </div>
          {dealPriceSummary ? (
            <div className="summary-list">
              <PriceBreakdown summary={dealPriceSummary} />
            </div>
          ) : (
            <div className="empty-state">
              {linkedDealError || "Prijsopbouw is niet beschikbaar voor deze implementatie."}
            </div>
          )}
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Klant en offerte</div>
              <h2 className="headline">Dossiergegevens</h2>
            </div>
            <ClipboardCheck size={28} aria-hidden="true" />
          </div>
          <div className="implementation-meta-grid implementation-detail-meta">
            <span>Klant<strong>{implementation.customer_name}</strong></span>
            <span>Contactpersoon<strong>{implementation.contact_name || "-"}</strong></span>
            <span>Offerte<strong>{implementation.quote_title || "-"}</strong></span>
            <span>Sales<strong>{implementation.sales_name || "-"}</strong></span>
            <span>Status<strong>{IMPLEMENTATION_STATUS_LABELS[implementation.status]}</strong></span>
            <span>Laatst gewijzigd<strong>{formatDate(implementation.updated_at)}</strong></span>
          </div>
        </section>

        <section className="card panel implementation-data-panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Inrichting</div>
              <h2 className="headline">Implementatiegegevens</h2>
            </div>
            <Database size={28} aria-hidden="true" />
          </div>

          <div className="implementation-data-grid">
            <label className="input-wrap">
              <span className="input-label">Administratie</span>
              <input
                className="input"
                type="text"
                maxLength={180}
                value={implementation.administration_name ?? ""}
                disabled={!canEdit}
                placeholder="Databasenaam"
                onChange={(event) => setImplementation({
                  ...implementation,
                  administration_name: event.target.value,
                })}
                onBlur={(event) => saveImplementationDetail(
                  "administration_name",
                  event.currentTarget.value,
                  "Administratie",
                )}
              />
            </label>

            <label className="input-wrap">
              <span className="input-label">Start implementatie</span>
              <input
                className="input"
                type="date"
                value={implementation.implementation_start_date ?? ""}
                disabled={!canEdit}
                onChange={(event) => saveImplementationDetail(
                  "implementation_start_date",
                  event.currentTarget.value,
                  "Start implementatie",
                )}
                onBlur={(event) => saveImplementationDetail(
                  "implementation_start_date",
                  event.currentTarget.value,
                  "Start implementatie",
                )}
              />
            </label>

            <label className="input-wrap">
              <span className="input-label">Geplande livegang</span>
              <input
                className="input"
                type="date"
                value={implementation.planned_go_live_date ?? ""}
                disabled={!canEdit}
                onChange={(event) => saveImplementationDetail(
                  "planned_go_live_date",
                  event.currentTarget.value,
                  "Geplande livegang",
                )}
                onBlur={(event) => saveImplementationDetail(
                  "planned_go_live_date",
                  event.currentTarget.value,
                  "Geplande livegang",
                )}
              />
            </label>

            <label className="input-wrap">
              <span className="input-label">Livegang</span>
              <input
                className="input"
                type="date"
                value={implementation.actual_go_live_date ?? ""}
                disabled={!canEdit}
                onChange={(event) => saveImplementationDetail(
                  "actual_go_live_date",
                  event.currentTarget.value,
                  "Livegang",
                )}
                onBlur={(event) => saveImplementationDetail(
                  "actual_go_live_date",
                  event.currentTarget.value,
                  "Livegang",
                )}
              />
            </label>

            <label className="input-wrap">
              <span className="input-label">Financieel pakket</span>
              <select
                className="input implementation-dark-select"
                value={FINANCIAL_PACKAGE_OPTIONS.includes(implementation.financial_package ?? "")
                  ? implementation.financial_package ?? ""
                  : implementation.financial_package
                    ? "Overig"
                    : ""}
                disabled={!canEdit}
                onChange={(event) => saveImplementationDetail(
                  "financial_package",
                  event.currentTarget.value,
                  "Financieel pakket",
                )}
              >
                <option value="">Selecteer financieel pakket</option>
                {FINANCIAL_PACKAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="input-wrap">
              <span className="input-label">Website/webshop (optioneel)</span>
              <input
                className="input"
                type="text"
                maxLength={180}
                value={implementation.website_webshop ?? ""}
                disabled={!canEdit}
                placeholder="Naam extern pakket"
                onChange={(event) => setImplementation({
                  ...implementation,
                  website_webshop: event.target.value,
                })}
                onBlur={(event) => saveImplementationDetail(
                  "website_webshop",
                  event.currentTarget.value,
                  "Website/webshop",
                )}
              />
            </label>
          </div>

          <div className={`implementation-data-save-state ${detailSaveState}`} aria-live="polite">
            {detailSaveMessage}
          </div>
        </section>

        <section className="card panel implementation-customer-access-panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Klanttoegang</div>
              <h2 className="headline">Voortgang delen</h2>
              <p className="subtext">
                Deel een beveiligde pagina met alleen de voortgang, onderdelen en afspraken van deze implementatie.
              </p>
            </div>
            <div className="implementation-portal-heading-actions">
              {canEdit ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={Boolean(customerOutlookBusyKey) || portalBusy}
                  onClick={handleProgressOutlookDraft}
                >
                  {customerOutlookBusyKey === "implementation-progress"
                    ? <LoaderCircle className="implementation-dns-spinner" size={16} />
                    : <Mail size={16} />}
                  {customerOutlookBusyKey === "implementation-progress"
                    ? "Concept maken..."
                    : "Klaarzetten in Outlook"}
                </button>
              ) : <Link2 size={28} aria-hidden="true" />}
            </div>
          </div>

          {!portalLoaded ? (
            <div className="implementation-items-state">
              <LoaderCircle className="implementation-dns-spinner" size={17} /> Klanttoegang wordt geladen...
            </div>
          ) : portalAccess?.active ? (
            <div className="implementation-portal-active">
              <label className="input-wrap implementation-portal-url">
                <span className="input-label">Beveiligde klantlink</span>
                <input className="input" type="text" readOnly value={portalAccess.publicUrl} />
              </label>
              <div className="implementation-portal-actions">
                <button type="button" className="secondary-button" onClick={() => void copyPortalUrl()}>
                  <Copy size={16} /> Kopiëren
                </button>
                <a
                  className="primary-button"
                  href={portalAccess.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={16} /> Open klantpagina
                </a>
                {canEdit ? (
                  <>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={portalBusy}
                      onClick={() => void createOrRefreshPortal(true)}
                    >
                      <RefreshCw size={16} /> Nieuwe link
                    </button>
                    <button
                      type="button"
                      className="secondary-button danger"
                      disabled={portalBusy}
                      onClick={() => void revokePortal()}
                    >
                      <Trash2 size={16} /> Intrekken
                    </button>
                  </>
                ) : null}
              </div>
              <span className="implementation-portal-meta">
                Geldig tot {formatDate(portalAccess.expiresAt)}
                {portalAccess.lastViewedAt
                  ? ` · laatst bekeken ${formatDateTime(portalAccess.lastViewedAt)}`
                  : " · nog niet door de klant bekeken"}
              </span>
            </div>
          ) : (
            <div className="implementation-portal-empty">
              <div>
                <strong>{portalAccess?.revokedAt ? "Klantlink ingetrokken" : "Nog geen klantpagina actief"}</strong>
                <span>Maak een unieke link die op ieder moment weer kan worden ingetrokken.</span>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={portalBusy}
                  onClick={() => void createOrRefreshPortal(Boolean(portalAccess))}
                >
                  <Link2 size={16} /> {portalBusy ? "Link maken..." : "Klantlink maken"}
                </button>
              ) : null}
            </div>
          )}
          {portalError ? <div className="implementation-inline-error">{portalError}</div> : null}
        </section>

        <ImplementationCustomerFilesPanel
          implementationId={implementation.id}
          canEdit={canEdit}
        />

        <section className="card panel implementation-appointments-panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Planning</div>
              <h2 className="headline">Afspraken</h2>
              <p className="subtext">Iedere afspraak wordt direct zichtbaar op de beveiligde klantpagina.</p>
            </div>
            <div className="implementation-calendar-actions">
              {!calendarStatusLoaded ? (
                <span className="implementation-calendar-state">
                  <LoaderCircle className="implementation-dns-spinner" size={17} /> Outlook controleren...
                </span>
              ) : calendarConnected ? (
                <span className="implementation-calendar-state connected">
                  <CheckCircle2 size={17} /> Outlook-agenda verbonden
                </span>
              ) : canEdit && calendarConnectUrl ? (
                <a className="secondary-button" href={calendarConnectUrl}>
                  <CalendarDays size={17} /> Outlook-agenda koppelen
                </a>
              ) : (
                <span className="implementation-calendar-state">Outlook-agenda niet verbonden</span>
              )}
            </div>
          </div>

          <div className="implementation-appointment-stats">
            <span>
              <strong>{expectedOnSiteAppointments}</strong>
              Afspraken op locatie volgens offerte
            </span>
            <span>
              <strong>{scheduledOnSiteAppointments}</strong>
              Op locatie ingepland
            </span>
            <span>
              <strong>{appointments.length}</strong>
              Totaal in agenda
            </span>
          </div>

          {canEdit ? (
            <div className="implementation-appointment-create">
              <label className="input-wrap">
                <span className="input-label">Datum</span>
                <input
                  className="input"
                  type="date"
                  value={appointmentDraft.appointmentDate}
                  onChange={(event) => setAppointmentDraft({
                    ...appointmentDraft,
                    appointmentDate: event.target.value,
                  })}
                />
              </label>
              <label className="input-wrap">
                <span className="input-label">Van</span>
                <input
                  className="input"
                  type="time"
                  value={appointmentDraft.startTime}
                  onChange={(event) => setAppointmentDraft({
                    ...appointmentDraft,
                    startTime: event.target.value,
                  })}
                />
              </label>
              <label className="input-wrap">
                <span className="input-label">Tot</span>
                <input
                  className="input"
                  type="time"
                  value={appointmentDraft.endTime}
                  onChange={(event) => setAppointmentDraft({
                    ...appointmentDraft,
                    endTime: event.target.value,
                  })}
                />
              </label>
              <label className="input-wrap">
                <span className="input-label">Soort afspraak</span>
                <select
                  className="input implementation-dark-select"
                  value={appointmentDraft.appointmentType}
                  onChange={(event) => setAppointmentDraft({
                    ...appointmentDraft,
                    appointmentType: event.target.value as ImplementationAppointmentType,
                  })}
                >
                  <option value="on_site">Op locatie</option>
                  <option value="remote">Online / op afstand</option>
                </select>
              </label>
              <label className="input-wrap implementation-appointment-title-field">
                <span className="input-label">Onderwerp</span>
                <input
                  className="input"
                  type="text"
                  maxLength={180}
                  value={appointmentDraft.title}
                  onChange={(event) => setAppointmentDraft({
                    ...appointmentDraft,
                    title: event.target.value,
                  })}
                />
              </label>
              <ImplementationNotesField
                className="implementation-appointment-note-field"
                label="Toelichting klant"
                value={appointmentDraft.customerNote}
                maxLength={1000}
                multiline
                placeholder="Bijv. ontvangst om 09:00 uur"
                onChange={(value) => setAppointmentDraft({
                  ...appointmentDraft,
                  customerNote: value,
                })}
                onBlur={() => undefined}
              />
              <button
                type="button"
                className="primary-button implementation-appointment-add"
                disabled={appointmentsBusy}
                onClick={() => void addAppointment()}
              >
                <Plus size={17} /> {appointmentsBusy ? "Toevoegen..." : "Afspraak toevoegen"}
              </button>
              <AppointmentWorkSelector
                groups={appointmentWorkGroups}
                selected={appointmentDraft.workItems}
                appointments={appointments}
                currentAppointmentId={null}
                disabled={appointmentsBusy}
                onSelectionChange={(workItems) => setAppointmentDraft({
                  ...appointmentDraft,
                  workItems,
                })}
              />
            </div>
          ) : null}

          {!appointmentsLoaded ? (
            <div className="implementation-items-state">
              <LoaderCircle className="implementation-dns-spinner" size={17} /> Afspraken worden geladen...
            </div>
          ) : appointments.length === 0 ? (
            <div className="implementation-appointments-empty">
              <Clock3 size={22} /> Nog geen afspraken ingepland.
            </div>
          ) : (
            <div className="implementation-appointment-list">
              {appointments.map((appointment) => (
                <article key={appointment.id} className="implementation-appointment-row">
                  <label className="input-wrap">
                    <span className="input-label">Datum</span>
                    <input
                      className="input"
                      type="date"
                      disabled={!canEdit}
                      value={appointment.appointmentDate}
                      onChange={(event) => updateAppointmentLocal(appointment.id, {
                        appointmentDate: event.target.value,
                      })}
                      onBlur={(event) => void saveAppointment({
                        ...appointment,
                        appointmentDate: event.currentTarget.value,
                      })}
                    />
                  </label>
                  <label className="input-wrap">
                    <span className="input-label">Van</span>
                    <input
                      className="input"
                      type="time"
                      disabled={!canEdit}
                      value={appointment.startTime}
                      onChange={(event) => updateAppointmentLocal(appointment.id, {
                        startTime: event.target.value,
                      })}
                      onBlur={(event) => void saveAppointment({
                        ...appointment,
                        startTime: event.currentTarget.value,
                      })}
                    />
                  </label>
                  <label className="input-wrap">
                    <span className="input-label">Tot</span>
                    <input
                      className="input"
                      type="time"
                      disabled={!canEdit}
                      value={appointment.endTime}
                      onChange={(event) => updateAppointmentLocal(appointment.id, {
                        endTime: event.target.value,
                      })}
                      onBlur={(event) => void saveAppointment({
                        ...appointment,
                        endTime: event.currentTarget.value,
                      })}
                    />
                  </label>
                  <label className="input-wrap">
                    <span className="input-label">Soort</span>
                    <select
                      className="input implementation-dark-select"
                      disabled={!canEdit}
                      value={appointment.appointmentType}
                      onChange={(event) => {
                        const nextAppointment = {
                          ...appointment,
                          appointmentType: event.target.value as ImplementationAppointmentType,
                        };
                        updateAppointmentLocal(appointment.id, nextAppointment);
                        void saveAppointment(nextAppointment);
                      }}
                    >
                      <option value="on_site">Op locatie</option>
                      <option value="remote">Online / op afstand</option>
                    </select>
                  </label>
                  <label className="input-wrap implementation-appointment-row-title">
                    <span className="input-label">Onderwerp</span>
                    <input
                      className="input"
                      type="text"
                      maxLength={180}
                      disabled={!canEdit}
                      value={appointment.title}
                      onChange={(event) => updateAppointmentLocal(appointment.id, {
                        title: event.target.value,
                      })}
                      onBlur={(event) => void saveAppointment({
                        ...appointment,
                        title: event.currentTarget.value,
                      })}
                    />
                  </label>
                  <ImplementationNotesField
                    className="implementation-appointment-row-note"
                    label="Toelichting klant"
                    value={appointment.customerNote}
                    maxLength={1000}
                    multiline
                    disabled={!canEdit}
                    onChange={(value) => updateAppointmentLocal(appointment.id, {
                      customerNote: value,
                    })}
                    onBlur={(value) => void saveAppointment({
                      ...appointment,
                      customerNote: value,
                    })}
                  />
                  <label className="input-wrap">
                    <span className="input-label">Status</span>
                    <select
                      className="input implementation-dark-select"
                      disabled={!canEdit}
                      value={appointment.status}
                      onChange={(event) => {
                        const nextAppointment = {
                          ...appointment,
                          status: event.target.value as ImplementationAppointment["status"],
                        };
                        updateAppointmentLocal(appointment.id, nextAppointment);
                        void saveAppointment(nextAppointment);
                      }}
                    >
                      <option value="planned">Gepland</option>
                      <option value="completed">Afgerond</option>
                    </select>
                  </label>
                  <div className="implementation-appointment-kind" aria-hidden="true">
                    {appointment.appointmentType === "on_site"
                      ? <><MapPin size={17} /> Op locatie</>
                      : <><Monitor size={17} /> Online</>}
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      className="icon-button implementation-appointment-delete"
                      title="Afspraak verwijderen"
                      aria-label="Afspraak verwijderen"
                      disabled={appointmentsBusy}
                      onClick={() => void deleteAppointment(appointment)}
                    >
                      <Trash2 size={17} />
                    </button>
                  ) : null}
                  {canEdit ? (
                    <div className="implementation-appointment-outlook-action">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={Boolean(customerOutlookBusyKey) || portalBusy}
                        onClick={() => handleAppointmentOutlookDraft(appointment)}
                      >
                        {customerOutlookBusyKey === `appointment:${appointment.id}`
                          ? <LoaderCircle className="implementation-dns-spinner" size={16} />
                          : <Mail size={16} />}
                        {customerOutlookBusyKey === `appointment:${appointment.id}`
                          ? "Concept maken..."
                          : "Klaarzetten in Outlook"}
                      </button>
                    </div>
                  ) : null}
                  <AppointmentWorkSelector
                    groups={appointmentWorkGroups}
                    selected={appointment.workItems}
                    appointments={appointments}
                    currentAppointmentId={appointment.id}
                    disabled={!canEdit || appointmentsBusy}
                    onSelectionChange={(workItems) => updateAppointmentWorkSelection(
                      appointment,
                      workItems,
                    )}
                    onMove={(workItem, sourceAppointmentId) => moveAppointmentWorkItem(
                      appointment,
                      workItem,
                      sourceAppointmentId,
                    )}
                  />
                </article>
              ))}
            </div>
          )}
          {appointmentsError ? (
            <div className="implementation-inline-error">{appointmentsError}</div>
          ) : null}
          {appointmentsWarning ? (
            <div className="implementation-inline-warning">
              <AlertTriangle size={17} />
              <span>{appointmentsWarning}</span>
              {!calendarConnected && canEdit && calendarConnectUrl ? (
                <a href={calendarConnectUrl}>Outlook-agenda koppelen</a>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Planning en voortgang</div>
              <h2 className="headline">Implementatie beheren</h2>
            </div>
            <StatusPill tone={canEdit ? "success" : "neutral"}>{canEdit ? "Schrijven" : "Lezen"}</StatusPill>
          </div>

          <div className="implementation-controls implementation-detail-controls">
            {canAssign ? (
              <label className="input-wrap">
                <span className="input-label">Toewijzen aan gebruiker</span>
                <select
                  className="input implementation-dark-select"
                  value={implementation.assigned_consultant_id ?? ""}
                  disabled={saving}
                  onChange={(event) => void assignConsultant(event.target.value)}
                >
                  <option value="">Nog niet toegewezen</option>
                  {assignableUsers.map((assignableUser) => (
                    <option key={assignableUser.id} value={assignableUser.id}>{assignableUser.full_name || assignableUser.email}</option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="implementation-readonly-field">
                <span>Toegewezen gebruiker</span>
                <strong>{implementation.assigned_consultant_name || "Nog niet toegewezen"}</strong>
              </div>
            )}

            <label className="input-wrap">
              <span className="input-label">Status</span>
              <select
                className="input implementation-dark-select"
                value={implementation.status}
                disabled={!canEdit || saving}
                onChange={(event) => void saveImplementation(
                  { status: event.target.value as ImplementationStatus },
                  "Status bijgewerkt.",
                )}
              >
                {IMPLEMENTATION_STATUSES.map((status) => (
                  <option key={status} value={status}>{IMPLEMENTATION_STATUS_LABELS[status]}</option>
                ))}
              </select>
            </label>

            <ImplementationNotesField
              label="Interne notities"
              value={implementation.notes ?? ""}
              disabled={!canEdit || saving}
              placeholder="Planning, afspraken of aandachtspunten"
              onChange={(value) => setImplementation({ ...implementation, notes: value })}
              onBlur={(value) => void saveImplementation(
                  { notes: value },
                  "Notities opgeslagen.",
                )}
            />
          </div>

          <div className="implementation-progress-block">
            <div className="implementation-progress-heading">
              <div>
                <span>Werkzaamheden</span>
                <strong>Voortgang implementatie</strong>
              </div>
              <span>Automatisch opgeslagen</span>
            </div>
            <div className="implementation-progress-list">
              {progressRows.map((item) => (
                item.kind === "intake" ? (
                  <div
                    key={item.key}
                    className={`implementation-progress-row ${customerIntakeComplete ? "completed" : ""}`}
                  >
                    <span className="implementation-progress-number">{item.number}</span>
                    <strong>{item.label}</strong>
                    <StatusPill tone={intakePresentation.tone}>{intakePresentation.label}</StatusPill>
                  </div>
                ) : (
                  <label
                    key={item.key}
                    className={`implementation-progress-row implementation-progress-check ${
                      progress[item.key]
                        ? "completed"
                        : progressRequiresAction(item.key)
                          ? "requires-action"
                          : ""
                    }`}
                  >
                    <span className="implementation-progress-number">{item.number}</span>
                    <strong>{item.label}</strong>
                    <input
                      type="checkbox"
                      checked={Boolean(progress[item.key])}
                      disabled={!canEdit || saving}
                      aria-label={`${item.label} afgerond`}
                      onChange={(event) => updateProgress(item.key, event.target.checked)}
                    />
                  </label>
                )
              ))}
            </div>
          </div>

          <div className="implementation-communication-stack">
            <article className="implementation-communication-card">
              <div className="implementation-communication-icon"><FileText size={22} /></div>
              <div className="implementation-communication-copy">
                <span>Klantformulier</span>
                <strong>{intakePresentation.label}</strong>
                <p>{customerEmail || "Nog geen e-mailadres beschikbaar"}</p>
              </div>
              <StatusPill tone={intakePresentation.tone}>{intakePresentation.label}</StatusPill>
            </article>

            <article className="implementation-communication-card implementation-dns-card">
              <div className="implementation-communication-icon"><Globe2 size={22} /></div>
              <div className="implementation-communication-copy">
                <span>DNS-instructies</span>
                <strong>{customerDomain || "Domeinnaam nog niet ingevuld"}</strong>
                <p>Automatische controle van de verplichte SPF- en DKIM-records.</p>
              </div>
              <div className="implementation-dns-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!customerDomain || dnsCheckLoading}
                  onClick={() => void loadDnsCheck()}
                >
                  <RefreshCw className={dnsCheckLoading ? "implementation-dns-spinner" : ""} size={16} />
                  {dnsCheckLoading ? "Controleren..." : "Opnieuw controleren"}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!canEdit || !customerDomain || !hasCustomerEmail || dnsOutlookBusy}
                  title={hasCustomerEmail
                    ? "DNS-instructies in Outlook klaarzetten"
                    : "Een klant-e-mailadres is nodig voor een Outlook-concept"}
                  onClick={() => void handleDnsOutlookDraft()}
                >
                  <Mail size={16} /> {dnsOutlookBusy ? "Concept maken..." : "Klaarzetten in Outlook"}
                </button>
              </div>

              <label className="input-wrap implementation-dns-domain-field">
                <span className="input-label">Domeinnaam</span>
                <input
                  className="input"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  maxLength={253}
                  value={dnsDomainInput}
                  disabled={!canEdit}
                  placeholder="bijv. klant.nl"
                  onChange={(event) => updateDnsDomainInput(event.currentTarget.value)}
                  onBlur={saveDnsDomain}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
              </label>

              <div className="implementation-dns-results">
                <div className="implementation-dns-group">
                  <h4>SPF-record</h4>
                  <DnsCheckRow
                    value="include:_spf.smartsoft.nu"
                    result={dnsCheck?.checks.spfSmartsoft}
                    loading={dnsCheckLoading}
                  />
                  <DnsCheckRow
                    value="include:_spf.troublefreehosting.nl"
                    result={dnsCheck?.checks.spfTroublefree}
                    loading={dnsCheckLoading}
                  />
                </div>

                <div className="implementation-dns-group">
                  <h4>DKIM-record 1</h4>
                  <DnsCheckRow
                    label="Naam: smtp01-smartsoft._domainkey"
                    value="Type: CNAME | Waarde: smtp01._domainkey.smartsoft.nu"
                    result={dnsCheck?.checks.dkimSmartsoft}
                    loading={dnsCheckLoading}
                  />
                </div>

                <div className="implementation-dns-group">
                  <h4>DKIM-record 2</h4>
                  <DnsCheckRow
                    label="Naam: smtp02-tfh._domainkey"
                    value="Type: CNAME | Waarde: smtp02-tfh._domainkey.troublefreehosting.nl"
                    result={dnsCheck?.checks.dkimTroublefree}
                    loading={dnsCheckLoading}
                  />
                </div>
              </div>

              <div className={`implementation-dns-summary ${dnsCheckError ? "error" : ""}`}>
                {dnsCheckError
                  ? dnsCheckError
                  : dnsCheck?.checkedAt
                    ? `Laatst gecontroleerd: ${formatDateTime(dnsCheck.checkedAt)}`
                    : customerDomain
                      ? "DNS-controle wordt voorbereid."
                      : "Vul een domeinnaam in om de DNS-records te controleren."}
              </div>
            </article>

            <article className="implementation-communication-card">
              <div className="implementation-communication-icon"><Mail size={22} /></div>
              <div className="implementation-communication-copy">
                <span>Nieuwe klantmail</span>
                <strong>{newCustomerMailReady ? "Klaar om te maken" : "Nog niet compleet"}</strong>
                <p>
                  {newCustomerMailReady
                    ? "Aan martijn@troublefree.nl, met de overige gebruikers in CC."
                    : `Nog nodig: ${newCustomerMailMissingFields.join(", ")}.`}
                </p>
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={!canEdit || !newCustomerMailReady || newCustomerOutlookBusy}
                title={newCustomerMailReady
                  ? "Maak de interne nieuwe klantmail in Outlook"
                  : `Nog nodig: ${newCustomerMailMissingFields.join(", ")}`}
                onClick={() => void handleNewCustomerOutlookDraft()}
              >
                <Mail size={16} /> {newCustomerOutlookBusy ? "Concept maken..." : "Klaarzetten in Outlook"}
              </button>
            </article>
          </div>

          <div className="implementation-progress-block implementation-items-progress">
            <div className="implementation-progress-heading">
              <div>
                <span>Planning</span>
                <strong>Taken</strong>
              </div>
              <span>
                {completedImplementationTasks}/{selectedImplementationTasks} geselecteerde groepen afgerond
              </span>
            </div>
            <div className="implementation-progress-list">
              {configuredImplementationTasks.length === 0 ? (
                <div className="implementation-items-state">Nog geen taken toegevoegd.</div>
              ) : configuredImplementationTasks.map((item) => {
                const workItems = getImplementationWorkItemStatuses(item, implementationItemProgress);
                const completed = isImplementationItemCompleted(item, implementationItemProgress);
                const selected = isImplementationItemSelected(item, implementationItemProgress);
                const selectedWorkItems = workItems.filter((workItem) => workItem.selected);
                const customerApproval = implementationCustomerWorkApprovals[item.key];
                const hasCustomerApproval = Boolean(customerApproval) || workItems.some((workItem) => (
                  Boolean(implementationCustomerWorkApprovals[workItem.key])
                ));
                const custom = customImplementationTaskLabels.has(
                  normalizedImplementationWorkLabel(item.label),
                );

                return (
                  <div
                    key={item.key}
                    className={`implementation-progress-row ${completed ? "completed" : ""} ${selected ? "selected" : ""}`}
                  >
                    <span className="implementation-progress-number"><ListChecks size={15} /></span>
                    <div className="implementation-item-copy">
                      <strong>{item.label}</strong>
                      {item.description ? <small>{item.description}</small> : null}
                      {renderImplementationWorkItems(item, workItems)}
                    </div>
                    <div className="implementation-task-actions">
                      {workItems.length > 0 ? (
                        selectedWorkItems.length > 0 ? (
                          <span className="implementation-work-progress-summary">
                            {selectedWorkItems.filter((workItem) => workItem.completed).length}/{selectedWorkItems.length}
                          </span>
                        ) : null
                      ) : item.selectableWorkItems ? (
                        <select
                          className="implementation-task-status-select"
                          value={!selected ? "" : completed ? "completed" : "todo"}
                          disabled={!canEdit || saving || Boolean(customerApproval)}
                          aria-label={`Status van ${item.label}`}
                          onChange={(event) => updateImplementationWorkStatus(
                            item,
                            undefined,
                            event.target.value as ImplementationWorkStatus,
                          )}
                        >
                          <option value="">Niet geselecteerd</option>
                          <option value="todo">Te doen</option>
                          <option value="completed">Afgerond</option>
                        </select>
                      ) : (
                        <label className="implementation-item-toggle">
                          <input
                            type="checkbox"
                            checked={completed}
                            disabled={!canEdit || saving}
                            aria-label={`${item.label} afgerond`}
                            onChange={(event) => updateImplementationItem(item, event.target.checked)}
                          />
                        </label>
                      )}
                      {custom && canEdit ? (
                        <button
                          type="button"
                          className="implementation-custom-work-delete"
                          disabled={saving || hasCustomerApproval}
                          aria-label={`${item.label} verwijderen`}
                          title={hasCustomerApproval
                            ? "Deze taak kan na klantakkoord niet meer worden verwijderd"
                            : "Deze implementatiespecifieke taak verwijderen"}
                          onClick={() => void removeImplementationCustomTask(item)}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {canEdit ? (
              <div className="implementation-task-add">
                {customTaskEditorOpen ? (
                  <form
                    className="implementation-custom-work-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void addImplementationCustomTask();
                    }}
                  >
                    <input
                      autoFocus
                      type="text"
                      value={customTaskDraft}
                      maxLength={300}
                      disabled={saving}
                      placeholder="Vul een extra taak voor deze implementatie in"
                      aria-label="Extra taak toevoegen"
                      onChange={(event) => setCustomTaskDraft(event.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={saving || !customTaskDraft.trim()}
                      aria-label="Taak toevoegen"
                      title="Taak toevoegen"
                    >
                      <Plus size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      aria-label="Annuleren"
                      title="Annuleren"
                      onClick={() => {
                        setCustomTaskDraft("");
                        setCustomTaskEditorOpen(false);
                      }}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="implementation-custom-work-trigger"
                    disabled={saving}
                    onClick={() => {
                      setCustomTaskDraft("");
                      setCustomTaskEditorOpen(true);
                    }}
                  >
                    <Plus size={14} aria-hidden="true" /> Extra taak toevoegen
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <div className="implementation-progress-block implementation-items-progress">
            <div className="implementation-progress-heading">
              <div>
                <span>Uitbreidingen</span>
                <strong>Modules en koppelingen</strong>
              </div>
              <span>
                {implementationItemsLoaded && !implementationItemsError
                  ? `${completedImplementationItems}/${selectedImplementationItems} geselecteerde modules afgerond`
                  : "Wordt geladen..."}
              </span>
            </div>
            <div className="implementation-progress-list">
              {!implementationItemsLoaded ? (
                <div className="implementation-items-state">
                  <LoaderCircle className="implementation-dns-spinner" size={17} /> Modules worden geladen...
                </div>
              ) : implementationItemsError ? (
                <div className="implementation-items-state error">
                  <AlertTriangle size={17} /> {implementationItemsError}
                </div>
              ) : configuredImplementationItems.length === 0 ? (
                <div className="implementation-items-state">Geen modules gevonden in de calculator-deal.</div>
              ) : configuredImplementationItems.map((item) => {
                const workItems = getImplementationWorkItemStatuses(item, implementationItemProgress);
                const completed = isImplementationItemCompleted(item, implementationItemProgress);
                const selected = isImplementationItemSelected(item, implementationItemProgress);
                const selectedWorkItems = workItems.filter((workItem) => workItem.selected);

                return (
                  <div
                    key={item.key}
                    className={`implementation-progress-row ${completed ? "completed" : ""} ${selected ? "selected" : ""}`}
                  >
                    <span className="implementation-progress-number"><Package size={15} /></span>
                    <div className="implementation-item-copy">
                      <strong>{item.label}</strong>
                      {renderImplementationWorkItems(item, workItems)}
                    </div>
                    {workItems.length > 0 ? (
                      selectedWorkItems.length > 0 ? (
                        <span className="implementation-work-progress-summary">
                          {selectedWorkItems.filter((workItem) => workItem.completed).length}/{selectedWorkItems.length}
                        </span>
                      ) : null
                    ) : item.selectableWorkItems ? (
                      <select
                        className="implementation-task-status-select"
                        value={!selected ? "" : completed ? "completed" : "todo"}
                        disabled={!canEdit || saving || Boolean(implementationCustomerWorkApprovals[item.key])}
                        aria-label={`Status van ${item.label}`}
                        onChange={(event) => updateImplementationWorkStatus(
                          item,
                          undefined,
                          event.target.value as ImplementationWorkStatus,
                        )}
                      >
                        <option value="">Niet geselecteerd</option>
                        <option value="todo">Te doen</option>
                        <option value="completed">Afgerond</option>
                      </select>
                    ) : (
                      <label className="implementation-item-toggle">
                        <input
                          type="checkbox"
                          checked={completed}
                          disabled={!canEdit || saving}
                          aria-label={`${item.label} afgerond`}
                          onChange={(event) => updateImplementationItem(item, event.target.checked)}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {customerWorkApprovalRows.length > 0 ? (
            <div className="implementation-progress-block implementation-customer-approval-log">
              <div className="implementation-progress-heading">
                <div>
                  <span>Vastgelegd</span>
                  <strong>Klantakkoorden</strong>
                </div>
                <span>{customerWorkApprovalRows.length} bevestigd</span>
              </div>
              <div className="implementation-progress-list">
                {customerWorkApprovalRows.map((approval) => (
                  <div key={approval.workItemKey} className="implementation-progress-row completed">
                    <span className="implementation-progress-number">
                      <CheckCircle2 size={15} aria-hidden="true" />
                    </span>
                    <div className="implementation-item-copy">
                      <strong>{approval.workItemLabel}</strong>
                      <small>{approval.itemLabel}</small>
                    </div>
                    <time dateTime={approval.approvedAt}>{formatDateTime(approval.approvedAt)}</time>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {message ? (
            <div className="implementation-save-row">
              <div className="save-status">{message}</div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
