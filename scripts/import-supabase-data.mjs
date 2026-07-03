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

const profileColumns = ["id", "email", "full_name", "job_title", "workdays", "mobile_phone", "role", "must_set_password"];
const dealColumns = [
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
  return ["sales", "support", "consultant", "worldline", "manager", "admin"].includes(value) ? value : "sales";
}

function jsonValue(value, fallback) {
  if (value === null || value === undefined) return fallback;
  return typeof value === "string" ? value : JSON.stringify(value);
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
             role = $6,
             updated_at = now()
         where id = $1`,
        [
          existing.id,
          profile.full_name ?? null,
          profile.job_title ?? null,
          profile.workdays ?? null,
          profile.mobile_phone ?? null,
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
      role: normalizeRole(profile.role, email),
      must_set_password: true,
    });
  }

  await client.query("update public.profiles set role = 'admin' where lower(email) = 'erik@smarttrade.nl'");
  return idMap;
}

async function importDeals(client, sourceDeals, idMap) {
  for (const deal of sourceDeals) {
    await upsertRow(client, "deals", dealColumns, {
      ...deal,
      user_id: idMap.get(deal.user_id) ?? deal.user_id,
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
  for (const project of sourceProjects) {
    await upsertRow(client, "worldline_projects", worldlineProjectColumns, {
      ...project,
      created_by: idMap.get(project.created_by) ?? project.created_by,
      agreement_fields: jsonValue(project.agreement_fields, "{}"),
    });
  }
}

async function importWorldlineDocuments(client, sourceDocuments, idMap) {
  for (const document of sourceDocuments) {
    await upsertRow(client, "worldline_documents", worldlineDocumentColumns, {
      ...document,
      uploaded_by: idMap.get(document.uploaded_by) ?? document.uploaded_by,
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
