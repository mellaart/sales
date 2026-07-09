"use client";

import { useEffect, useMemo, useState } from "react";
import { Hash, Search, ShieldAlert, Table2 } from "lucide-react";
import { WORLDLINE_MCC_RECORDS, WORLDLINE_MCC_RECORDS_BY_DESCRIPTION } from "@/lib/worldline-mcc-data";
import {
  ROLE_TAB_ACCESS,
  canAccessTab,
  normalizeRoleTabAccess,
  type RoleTabAccessMap,
} from "@/lib/role-tabs";
import { useAuth } from "@/components/auth-provider";
import { StatusPill } from "@/components/ui";

type WorldlineMccFilters = {
  mcc: string;
  descriptionNl: string;
  actSector: string;
};

const EMPTY_FILTERS: WorldlineMccFilters = {
  mcc: "",
  descriptionNl: "",
  actSector: "",
};

function normalizeFilterValue(value: string) {
  return value.trim().toLowerCase();
}

export default function WorldlineMccDashboard() {
  const { role } = useAuth();
  const [roleTabAccess, setRoleTabAccess] = useState<RoleTabAccessMap>(ROLE_TAB_ACCESS);
  const [roleAccessLoading, setRoleAccessLoading] = useState(true);
  const [filters, setFilters] = useState<WorldlineMccFilters>(EMPTY_FILTERS);

  const canViewWorldlineMcc = canAccessTab(role, "worldlineMcc", roleTabAccess);
  const actSectorCount = useMemo(
    () => new Set(WORLDLINE_MCC_RECORDS.map((record) => record.actSector)).size,
    [],
  );
  const filteredRows = useMemo(() => {
    const mccFilter = normalizeFilterValue(filters.mcc);
    const descriptionFilter = normalizeFilterValue(filters.descriptionNl);
    const actSectorFilter = normalizeFilterValue(filters.actSector);

    return WORLDLINE_MCC_RECORDS_BY_DESCRIPTION.filter((record) => {
      return (
        record.mcc.toLowerCase().includes(mccFilter) &&
        record.descriptionNl.toLowerCase().includes(descriptionFilter) &&
        record.actSector.toLowerCase().includes(actSectorFilter)
      );
    });
  }, [filters]);

  useEffect(() => {
    if (!role) {
      setRoleAccessLoading(false);
      return;
    }

    let active = true;
    setRoleAccessLoading(true);

    async function loadRoleTabAccess() {
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

  function updateFilter(filterKey: keyof WorldlineMccFilters, value: string) {
    setFilters((currentFilters) => ({ ...currentFilters, [filterKey]: value }));
  }

  if (roleAccessLoading) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="top-row">
              <div>
                <div className="eyebrow">Worldline MCC</div>
                <h1>Worldline MCC wordt geladen...</h1>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (!canViewWorldlineMcc) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <div className="top-row">
              <div>
                <div className="eyebrow">Geen toegang</div>
                <h1>Worldline MCC</h1>
                <p className="subtext">Je rol heeft geen leesrechten voor deze pagina.</p>
              </div>
              <div className="icon-badge"><ShieldAlert size={24} /></div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="container prices-page">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Smart Trade</div>
            <h1>Worldline MCC</h1>
            <p>Zoek MCC-codes, omschrijvingen en Act sectoren voor Worldline aansluitovereenkomsten.</p>
          </div>

          <div className="brand-actions">
            <StatusPill tone="success">Lezen</StatusPill>
          </div>
        </header>

        <section className="deals-stat-grid">
          <article className="deals-stat">
            <div className="stat-icon"><Table2 size={18} /></div>
            <div>
              <span>MCC-regels</span>
              <strong>{WORLDLINE_MCC_RECORDS.length}</strong>
            </div>
          </article>
          <article className="deals-stat">
            <div className="stat-icon"><Hash size={18} /></div>
            <div>
              <span>Act sectoren</span>
              <strong>{actSectorCount}</strong>
            </div>
          </article>
          <article className="deals-stat">
            <div className="stat-icon"><Search size={18} /></div>
            <div>
              <span>Resultaten</span>
              <strong>{filteredRows.length}</strong>
            </div>
          </article>
        </section>

        <section className="card panel prices-card">
          <div className="top-row">
            <div>
              <div className="eyebrow">Worldline MCC</div>
              <h2 className="headline">MCC overzicht</h2>
            </div>
          </div>

          <div className="price-table-wrap">
            <table className="price-table worldline-mcc-table">
              <thead>
                <tr>
                  <th className="price-table-money-cell">MCC</th>
                  <th>Omschrijving</th>
                  <th className="price-table-money-cell">Act sector</th>
                </tr>
                <tr className="price-filter-row">
                  <th>
                    <input
                      aria-label="Filter op MCC"
                      className="price-table-filter-input price-table-input-number"
                      placeholder="Filter"
                      value={filters.mcc}
                      onChange={(event) => updateFilter("mcc", event.target.value)}
                    />
                  </th>
                  <th>
                    <input
                      aria-label="Filter op omschrijving"
                      className="price-table-filter-input"
                      placeholder="Filter"
                      value={filters.descriptionNl}
                      onChange={(event) => updateFilter("descriptionNl", event.target.value)}
                    />
                  </th>
                  <th>
                    <input
                      aria-label="Filter op Act sector"
                      className="price-table-filter-input price-table-input-number"
                      placeholder="Filter"
                      value={filters.actSector}
                      onChange={(event) => updateFilter("actSector", event.target.value)}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((record) => (
                  <tr key={`${record.mcc}-${record.actSector}`}>
                    <td className="price-table-money-cell price-table-static-money">{record.mcc}</td>
                    <td>{record.descriptionNl}</td>
                    <td className="price-table-money-cell price-table-static-money">{record.actSector}</td>
                  </tr>
                ))}
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="worldline-mcc-empty">
                      Geen MCC-regels gevonden.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
