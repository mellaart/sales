import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import WebSocket from "ws";

const { Pool } = pg;

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const storageRoot = process.env.LOCAL_STORAGE_ROOT || path.join(process.cwd(), "storage");

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Vul SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY tijdelijk in voor de import.");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket },
});

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.PGHOST || "/var/run/postgresql",
      database: process.env.PGDATABASE || "sales_troublefree_nl",
      user: process.env.PGUSER || process.env.USER || "sales.troublefree.nl",
      password: process.env.PGPASSWORD || undefined,
    });

const profileColumns = ["id", "email", "full_name", "job_title", "workdays", "mobile_phone", "employee_relation_id", "role", "must_set_password"];
const dealColumns = [
  "id",
  "user_id",
  "created_at",
  "updated_at",
  "archived_at",
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
];
const worldlineProjectColumns = [
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
  "archived_at",
];
const worldlineDocumentColumns = [
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
];

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeRole(value, email) {
  if (normalizeEmail(email) === "erik@smarttrade.nl") return "admin";
  return ["sales", "support", "consultant", "worldline", "worldline_consultant", "manager", "admin"].includes(value)
    ? value
    : "sales";
}

function jsonValue(value, fallback) {
  if (value === null || value === undefined) return fallback;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function timestampValue(value, fallback = null) {
  return value || fallback || new Date().toISOString();
}

function cleanSafePath(filePath) {
  const normalized = path.posix.normalize(filePath).replace(/^\/+/, "");
  if (!normalized || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Ongeldig opslagpad: ${filePath}`);
  }
  return normalized;
}

async function fetchAll(table) {
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase.from(table).select("*").range(from, to);
    if (error) throw new Error(`${table} ophalen mislukt: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

async function ensureLocalSchema(client) {
  await client.query(`
    create extension if not exists pgcrypto;

    create table if not exists public.profiles (
      id uuid primary key default gen_random_uuid(),
      email text unique,
      password_hash text,
      full_name text,
      job_title text,
      workdays text,
      mobile_phone text,
      employee_relation_id bigint,
      role text not null default 'sales'
        check (role in ('sales', 'support', 'consultant', 'worldline', 'worldline_consultant', 'manager', 'admin')),
      must_set_password boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table public.profiles drop constraint if exists profiles_role_check;
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('sales', 'support', 'consultant', 'worldline', 'worldline_consultant', 'manager', 'admin'));

    create table if not exists public.app_sessions (
      token_hash text primary key,
      user_id uuid not null references public.profiles(id) on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now()
    );

    alter table public.profiles add column if not exists employee_relation_id bigint;

    create index if not exists app_sessions_user_id_idx on public.app_sessions(user_id);
    create index if not exists app_sessions_expires_at_idx on public.app_sessions(expires_at);

    create table if not exists public.deals (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      archived_at timestamptz,
      customer_name text,
      quote_title text,
      contact_name text,
      sales_name text,
      valid_until text,
      package_key text,
      package_name text,
      selected_package text,
      total_users integer,
      extra_users integer,
      contract_months integer,
      discount_pct numeric not null default 0,
      include_vat boolean not null default false,
      manual_monthly_adjustment numeric not null default 0,
      manual_implementation_adjustment numeric not null default 0,
      monthly_base numeric,
      monthly_price numeric,
      monthly_total numeric,
      implementation_base numeric,
      implementation_price numeric,
      implementation_total numeric,
      contract_value numeric,
      annual_recurring numeric,
      modules jsonb not null default '[]'::jsonb,
      notes text,
      calculator_inputs jsonb not null default '{}'::jsonb
    );

    alter table public.deals add column if not exists archived_at timestamptz;

    create index if not exists deals_user_id_created_at_idx on public.deals(user_id, created_at desc);
    create index if not exists deals_archived_at_created_at_idx on public.deals(archived_at, created_at desc);

    create table if not exists public.worldline_projects (
      id uuid primary key default gen_random_uuid(),
      relation_id text not null,
      relation_name text not null,
      relation_email text,
      debtor_number text,
      status text not null default 'concept'
        check (status in ('concept', 'waiting_customer', 'checking', 'complete', 'submitted')),
      agreement_fields jsonb not null default '{}'::jsonb,
      created_by uuid not null references public.profiles(id) on delete cascade,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      archived_at timestamptz
    );

    alter table public.worldline_projects add column if not exists archived_at timestamptz;

    create table if not exists public.worldline_documents (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references public.worldline_projects(id) on delete cascade,
      document_type text not null
        check (document_type in ('kvk', 'agreement', 'identity', 'bank_statement', 'refund', 'ubo')),
      file_name text not null,
      storage_path text not null,
      mime_type text,
      file_size bigint,
      version integer not null default 1,
      check_status text not null default 'uploaded'
        check (check_status in ('missing', 'uploaded', 'checking', 'approved', 'rejected')),
      check_result jsonb not null default '{}'::jsonb,
      uploaded_by uuid not null references public.profiles(id) on delete cascade,
      uploaded_at timestamptz not null default now()
    );

    alter table public.worldline_documents
      drop constraint if exists worldline_documents_document_type_check;
    alter table public.worldline_documents
      drop constraint if exists worldline_documents_type_check;
    alter table public.worldline_documents
      add constraint worldline_documents_type_check
      check (document_type in ('kvk', 'agreement', 'identity', 'bank_statement', 'refund', 'ubo'));

    create index if not exists worldline_projects_relation_idx
      on public.worldline_projects(relation_id, updated_at desc);
    create index if not exists worldline_projects_created_by_idx
      on public.worldline_projects(created_by, updated_at desc);
    create index if not exists worldline_projects_archived_at_updated_at_idx
      on public.worldline_projects(archived_at, updated_at desc);
    create index if not exists worldline_documents_project_idx
      on public.worldline_documents(project_id, document_type, version desc);

    create table if not exists public.app_settings (
      key text primary key,
      payload jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    );
  `);
}

async function upsertRow(client, table, columns, row) {
  const values = columns.map((column) => row[column] ?? null);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const quotedColumns = columns.map((column) => `"${column}"`).join(", ");
  const updates = columns
    .filter((column) => column !== "id")
    .map((column) => `"${column}" = excluded."${column}"`)
    .join(", ");

  await client.query(
    `insert into public.${table} (${quotedColumns})
     values (${placeholders})
     on conflict (id) do update set ${updates}`,
    values,
  );
}

async function loadLocalProfiles(client) {
  const { rows } = await client.query("select id, email from public.profiles");
  return rows;
}

async function getFallbackUserId(client) {
  const { rows } = await client.query(
    `select id
     from public.profiles
     order by case when lower(email) = 'erik@smarttrade.nl' then 0 else 1 end, created_at
     limit 1`,
  );

  if (!rows[0]?.id) {
    throw new Error("Geen lokale gebruiker gevonden om oude records aan te koppelen.");
  }

  return rows[0].id;
}

async function importProfiles(client, sourceProfiles) {
  const localProfiles = await loadLocalProfiles(client);
  const localByEmail = new Map(localProfiles.map((profile) => [normalizeEmail(profile.email), profile]));
  const idMap = new Map();

  for (const profile of sourceProfiles) {
    const email = normalizeEmail(profile.email);
    const existing = email ? localByEmail.get(email) : null;

    if (existing) {
      idMap.set(profile.id, existing.id);
      await client.query(
        `update public.profiles
         set full_name = coalesce($2, full_name),
             job_title = coalesce($3, job_title),
             workdays = coalesce($4, workdays),
             mobile_phone = coalesce($5, mobile_phone),
             employee_relation_id = coalesce($6, employee_relation_id),
             role = $7,
             updated_at = now()
         where id = $1`,
        [
          existing.id,
          profile.full_name ?? null,
          profile.job_title ?? null,
          profile.workdays ?? null,
          profile.mobile_phone ?? null,
          profile.employee_relation_id ?? null,
          normalizeRole(profile.role, email),
        ],
      );
      continue;
    }

    idMap.set(profile.id, profile.id);
    await upsertRow(client, "profiles", profileColumns, {
      id: profile.id,
      email: email || profile.email || null,
      full_name: profile.full_name ?? null,
      job_title: profile.job_title ?? null,
      workdays: profile.workdays ?? null,
      mobile_phone: profile.mobile_phone ?? null,
      employee_relation_id: profile.employee_relation_id ?? null,
      role: normalizeRole(profile.role, email),
      must_set_password: true,
    });
  }

  await client.query("update public.profiles set role = 'admin' where lower(email) = 'erik@smarttrade.nl'");
  return idMap;
}

async function importDeals(client, sourceDeals, idMap) {
  const fallbackUserId = await getFallbackUserId(client);

  for (const deal of sourceDeals) {
    const createdAt = timestampValue(deal.created_at);
    await upsertRow(client, "deals", dealColumns, {
      ...deal,
      user_id: idMap.get(deal.user_id) ?? deal.user_id ?? fallbackUserId,
      created_at: createdAt,
      updated_at: timestampValue(deal.updated_at, createdAt),
      archived_at: deal.archived_at ? timestampValue(deal.archived_at) : null,
      modules: jsonValue(deal.modules, "[]"),
      calculator_inputs: jsonValue(deal.calculator_inputs, "{}"),
      discount_pct: deal.discount_pct ?? 0,
      include_vat: deal.include_vat ?? false,
      manual_monthly_adjustment: deal.manual_monthly_adjustment ?? 0,
      manual_implementation_adjustment: deal.manual_implementation_adjustment ?? 0,
    });
  }
}

async function importWorldlineProjects(client, sourceProjects, idMap) {
  const fallbackUserId = await getFallbackUserId(client);

  for (const project of sourceProjects) {
    const createdAt = timestampValue(project.created_at);
    await upsertRow(client, "worldline_projects", worldlineProjectColumns, {
      ...project,
      created_by: idMap.get(project.created_by) ?? project.created_by ?? fallbackUserId,
      created_at: createdAt,
      updated_at: timestampValue(project.updated_at, createdAt),
      archived_at: project.archived_at ? timestampValue(project.archived_at) : null,
      agreement_fields: jsonValue(project.agreement_fields, "{}"),
    });
  }
}

async function importWorldlineDocuments(client, sourceDocuments, idMap) {
  const fallbackUserId = await getFallbackUserId(client);

  for (const document of sourceDocuments) {
    await upsertRow(client, "worldline_documents", worldlineDocumentColumns, {
      ...document,
      uploaded_by: idMap.get(document.uploaded_by) ?? document.uploaded_by ?? fallbackUserId,
      uploaded_at: timestampValue(document.uploaded_at),
      check_result: jsonValue(document.check_result, "{}"),
    });
  }
}

async function downloadStorageFile(bucket, filePath) {
  const safePath = cleanSafePath(filePath);
  const { data, error } = await supabase.storage.from(bucket).download(safePath);

  if (error || !data) {
    console.warn(`Overslaan: ${bucket}/${safePath} kon niet worden opgehaald${error ? ` (${error.message})` : ""}.`);
    return false;
  }

  const target = path.join(storageRoot, bucket, safePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await data.arrayBuffer()));
  return true;
}

async function importStorage(sourceDocuments) {
  let copied = 0;

  for (const file of ["price-config.json", "role-tab-access.json"]) {
    if (await downloadStorageFile("smart-trade-settings", file)) copied += 1;
  }

  for (const document of sourceDocuments) {
    if (document.storage_path && await downloadStorageFile("worldline-documents", document.storage_path)) copied += 1;
  }

  return copied;
}

async function main() {
  const client = await pool.connect();

  try {
    console.log("Supabase data ophalen...");
    const [profiles, deals, projects, documents] = await Promise.all([
      fetchAll("profiles"),
      fetchAll("deals"),
      fetchAll("worldline_projects"),
      fetchAll("worldline_documents"),
    ]);

    console.log("Lokale database voorbereiden...");
    await ensureLocalSchema(client);

    console.log("Lokale database vullen...");
    await client.query("begin");
    const idMap = await importProfiles(client, profiles);
    await importDeals(client, deals, idMap);
    await importWorldlineProjects(client, projects, idMap);
    await importWorldlineDocuments(client, documents, idMap);
    await client.query("commit");

    console.log("Bestanden kopieren...");
    const copiedFiles = await importStorage(documents);

    console.log("Klaar.");
    console.log(`Profiles: ${profiles.length}`);
    console.log(`Deals: ${deals.length}`);
    console.log(`Worldline projecten: ${projects.length}`);
    console.log(`Worldline documenten: ${documents.length}`);
    console.log(`Bestanden gekopieerd: ${copiedFiles}`);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
