import { query } from "@/lib/local-db";
import { canManageWorldline, canReadAllDeals, isLocalAdmin, type LocalUser } from "@/lib/local-auth";
import type { ProfileRecord, UserRole } from "@/lib/supabase";

export type LocalFilter = {
  column: string;
  op: "eq" | "in";
  value: unknown;
};

export type LocalOrder = {
  column: string;
  ascending?: boolean;
};

export type LocalTableQuery = {
  table: string;
  action: "select" | "insert" | "update" | "delete" | "upsert";
  select?: string;
  payload?: unknown;
  filters?: LocalFilter[];
  order?: LocalOrder | null;
  limit?: number | null;
  single?: boolean;
  maybeSingle?: boolean;
};

type Actor = {
  user: LocalUser;
  profile: ProfileRecord;
};

const TABLES = {
  profiles: new Set([
    "id",
    "email",
    "password_hash",
    "full_name",
    "job_title",
    "workdays",
    "mobile_phone",
    "role",
    "must_set_password",
    "created_at",
    "updated_at",
  ]),
  deals: new Set([
    "id",
    "user_id",
    "created_at",
    "updated_at",
    "customer_name",
    "quote_title",
    "contact_name",
    "sales_name",
    "valid_until",
    "package_key",
    "package_name",
    "selected_package",
    "total_users",
    "extra_users",
    "contract_months",
    "discount_pct",
    "include_vat",
    "manual_monthly_adjustment",
    "manual_implementation_adjustment",
    "monthly_base",
    "monthly_price",
    "monthly_total",
    "implementation_base",
    "implementation_price",
    "implementation_total",
    "contract_value",
    "annual_recurring",
    "modules",
    "notes",
    "calculator_inputs",
  ]),
  worldline_projects: new Set([
    "id",
    "relation_id",
    "relation_name",
    "relation_email",
    "debtor_number",
    "status",
    "agreement_fields",
    "created_by",
    "created_at",
    "updated_at",
  ]),
  worldline_documents: new Set([
    "id",
    "project_id",
    "document_type",
    "file_name",
    "storage_path",
    "mime_type",
    "file_size",
    "version",
    "check_status",
    "check_result",
    "uploaded_by",
    "uploaded_at",
  ]),
} as const;

type TableName = keyof typeof TABLES;

function isTableName(value: string): value is TableName {
  return value in TABLES;
}

function assertTableName(table: string): TableName {
  if (!isTableName(table)) throw new Error(`Tabel wordt niet ondersteund: ${table}`);
  return table;
}

function normalizeColumn(table: TableName, column: string) {
  const clean = column.trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(clean) || !TABLES[table].has(clean as never)) {
    throw new Error(`Kolom wordt niet ondersteund: ${column}`);
  }
  return clean;
}

function normalizeSelect(table: TableName, select?: string) {
  if (!select || select.trim() === "*") return "*";

  const columns = select
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean)
    .map((column) => normalizeColumn(table, column));

  return columns.length ? columns.map((column) => `"${column}"`).join(", ") : "*";
}

function cleanPayload(table: TableName, payload: unknown, actor?: Actor | null) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const next: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (key === "id" && (value === null || value === undefined || value === "")) continue;
    if (!TABLES[table].has(key as never)) continue;
    if (key === "password_hash") continue;
    next[key] = value;
  }

  if (table === "deals" && actor && !next.user_id) next.user_id = actor.user.id;
  if (table === "worldline_projects" && actor && !next.created_by) next.created_by = actor.user.id;
  if (table === "worldline_documents" && actor && !next.uploaded_by) next.uploaded_by = actor.user.id;

  return next;
}

function appendFilters(
  table: TableName,
  filters: LocalFilter[] | undefined,
  values: unknown[],
  startWhere: string[] = [],
) {
  const where = [...startWhere];

  for (const filter of filters ?? []) {
    const column = normalizeColumn(table, filter.column);
    if (filter.op === "eq") {
      values.push(filter.value);
      where.push(`"${column}" = $${values.length}`);
    } else if (filter.op === "in") {
      const list = Array.isArray(filter.value) ? filter.value : [];
      if (list.length === 0) {
        where.push("false");
      } else {
        values.push(list);
        where.push(`"${column}" = any($${values.length})`);
      }
    }
  }

  return where;
}

async function getAccessibleWorldlineProjectIds(actor: Actor) {
  if (canManageWorldline(actor.profile.role) || isLocalAdmin(actor.profile)) return null;

  const { rows } = await query<{ id: string }>(
    `select id from public.worldline_projects where created_by = $1`,
    [actor.user.id],
  );
  return rows.map((row) => row.id);
}

async function getAccessWhere(table: TableName, actor: Actor | null, serviceMode: boolean, values: unknown[]) {
  if (serviceMode) return [];
  if (!actor) throw new Error("Niet ingelogd.");

  if (table === "profiles") {
    if (isLocalAdmin(actor.profile)) return [];
    values.push(actor.user.id);
    return [`"id" = $${values.length}`];
  }

  if (table === "deals") {
    if (canReadAllDeals(actor.profile.role) || isLocalAdmin(actor.profile)) return [];
    values.push(actor.user.id);
    return [`"user_id" = $${values.length}`];
  }

  if (table === "worldline_projects") {
    if (canManageWorldline(actor.profile.role) || isLocalAdmin(actor.profile)) return [];
    values.push(actor.user.id);
    return [`"created_by" = $${values.length}`];
  }

  if (table === "worldline_documents") {
    const projectIds = await getAccessibleWorldlineProjectIds(actor);
    if (projectIds === null) return [];
    values.push(projectIds);
    return [`"project_id" = any($${values.length})`];
  }

  return [];
}

function withOrderAndLimit(table: TableName, input: LocalTableQuery, values: unknown[]) {
  const parts: string[] = [];

  if (input.order?.column) {
    const column = normalizeColumn(table, input.order.column);
    parts.push(`order by "${column}" ${input.order.ascending === false ? "desc" : "asc"}`);
  }

  if (input.limit && Number.isFinite(input.limit) && input.limit > 0) {
    values.push(Math.floor(input.limit));
    parts.push(`limit $${values.length}`);
  }

  return parts.join(" ");
}

function formatResult(rows: unknown[], input: LocalTableQuery) {
  if (input.single) {
    return rows.length === 1
      ? { data: rows[0], error: null }
      : { data: null, error: { message: rows.length === 0 ? "Geen record gevonden." : "Meerdere records gevonden." } };
  }

  if (input.maybeSingle) {
    return rows.length > 1
      ? { data: null, error: { message: "Meerdere records gevonden." } }
      : { data: rows[0] ?? null, error: null };
  }

  return { data: rows, error: null };
}

export async function executeLocalTableQuery(input: LocalTableQuery, actor: Actor | null, serviceMode = false) {
  const table = assertTableName(input.table);
  const values: unknown[] = [];

  if (input.action === "select") {
    const accessWhere = await getAccessWhere(table, actor, serviceMode, values);
    const where = appendFilters(table, input.filters, values, accessWhere);
    const sql = [
      `select ${normalizeSelect(table, input.select)} from public.${table}`,
      where.length ? `where ${where.join(" and ")}` : "",
      withOrderAndLimit(table, input, values),
    ].filter(Boolean).join(" ");
    const { rows } = await query(sql, values);
    return formatResult(rows, input);
  }

  if (!serviceMode && !actor) throw new Error("Niet ingelogd.");

  if (input.action === "delete") {
    const accessWhere = await getAccessWhere(table, actor, serviceMode, values);
    const where = appendFilters(table, input.filters, values, accessWhere);
    if (where.length === 0) throw new Error("Verwijderen zonder selectie is niet toegestaan.");
    const { rows } = await query(`delete from public.${table} where ${where.join(" and ")} returning *`, values);
    return formatResult(rows, input);
  }

  const payload = cleanPayload(table, input.payload, actor);
  const columns = Object.keys(payload).map((column) => normalizeColumn(table, column));
  if (columns.length === 0) throw new Error("Geen gegevens ontvangen.");

  if (input.action === "insert") {
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const insertValues = columns.map((column) => payload[column]);
    const { rows } = await query(
      `insert into public.${table} (${columns.map((column) => `"${column}"`).join(", ")})
       values (${placeholders.join(", ")})
       returning *`,
      insertValues,
    );
    return formatResult(rows, input);
  }

  if (input.action === "upsert") {
    const insertValues = columns.map((column) => payload[column]);
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const conflictColumn = table === "profiles" ? "id" : "id";
    const updateColumns = columns.filter((column) => column !== conflictColumn);
    const setClause = updateColumns.map((column) => `"${column}" = excluded."${column}"`).join(", ");
    const { rows } = await query(
      `insert into public.${table} (${columns.map((column) => `"${column}"`).join(", ")})
       values (${placeholders.join(", ")})
       on conflict ("${conflictColumn}") do update
       set ${setClause || `"${conflictColumn}" = excluded."${conflictColumn}"`}
       returning *`,
      insertValues,
    );
    return formatResult(rows, input);
  }

  const accessWhere = await getAccessWhere(table, actor, serviceMode, values);
  const where = appendFilters(table, input.filters, values, accessWhere);
  if (where.length === 0) throw new Error("Wijzigen zonder selectie is niet toegestaan.");

  const setValues = columns.map((column) => payload[column]);
  const setClause = columns.map((column, index) => `"${column}" = $${values.length + index + 1}`);
  if (TABLES[table].has("updated_at" as never) && !columns.includes("updated_at")) {
    setClause.push("updated_at = now()");
  }

  const { rows } = await query(
    `update public.${table}
     set ${setClause.join(", ")}
     where ${where.join(" and ")}
     returning *`,
    [...values, ...setValues],
  );
  return formatResult(rows, input);
}

export function toUserRole(value: unknown): UserRole {
  return value === "admin" || value === "manager" || value === "support" || value === "consultant" || value === "worldline"
    ? value
    : "sales";
}
