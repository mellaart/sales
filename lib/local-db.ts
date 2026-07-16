import { randomUUID } from "node:crypto";
import { Pool, types, type QueryResultRow } from "pg";

types.setTypeParser(1700, (value) => Number(value));
types.setTypeParser(20, (value) => Number(value));

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getDefaultDatabaseUser() {
  return process.env.PGUSER || process.env.USER || "sales.troublefree.nl";
}

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL?.trim();
  pool = connectionString
    ? new Pool({ connectionString })
    : new Pool({
        host: process.env.PGHOST || "/var/run/postgresql",
        database: process.env.PGDATABASE || "sales_troublefree_nl",
        user: getDefaultDatabaseUser(),
        password: process.env.PGPASSWORD || undefined,
      });

  return pool;
}

export function isSelfHostedMode() {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
  await ensureLocalSchema();
  return getPool().query<T>(sql, values);
}

export async function queryWithoutSchema<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
  return getPool().query<T>(sql, values);
}

export function createId() {
  return randomUUID();
}

export async function ensureLocalSchema() {
  if (!isSelfHostedMode()) return;
  if (!schemaReady) {
    schemaReady = (async () => {
      await queryWithoutSchema(`
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
            check (role in ('sales', 'support', 'consultant', 'worldline', 'manager', 'admin')),
          must_set_password boolean not null default false,
          two_factor_enabled boolean not null default false,
          two_factor_secret text,
          two_factor_enabled_at timestamptz,
          two_factor_last_verified_at timestamptz,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );

        alter table public.profiles add column if not exists password_hash text;
        alter table public.profiles add column if not exists full_name text;
        alter table public.profiles add column if not exists job_title text;
        alter table public.profiles add column if not exists workdays text;
        alter table public.profiles add column if not exists mobile_phone text;
        alter table public.profiles add column if not exists employee_relation_id bigint;
        alter table public.profiles add column if not exists must_set_password boolean not null default false;
        alter table public.profiles add column if not exists two_factor_enabled boolean not null default false;
        alter table public.profiles add column if not exists two_factor_secret text;
        alter table public.profiles add column if not exists two_factor_enabled_at timestamptz;
        alter table public.profiles add column if not exists two_factor_last_verified_at timestamptz;
        alter table public.profiles add column if not exists updated_at timestamptz not null default now();

        create table if not exists public.app_sessions (
          token_hash text primary key,
          user_id uuid not null references public.profiles(id) on delete cascade,
          expires_at timestamptz not null,
          created_at timestamptz not null default now(),
          last_seen_at timestamptz not null default now()
        );

        create index if not exists app_sessions_user_id_idx on public.app_sessions(user_id);
        create index if not exists app_sessions_expires_at_idx on public.app_sessions(expires_at);

        create table if not exists public.app_2fa_challenges (
          token_hash text primary key,
          user_id uuid not null references public.profiles(id) on delete cascade,
          mode text not null check (mode in ('setup', 'verify')),
          secret text,
          expires_at timestamptz not null,
          created_at timestamptz not null default now()
        );

        create index if not exists app_2fa_challenges_user_id_idx on public.app_2fa_challenges(user_id);
        create index if not exists app_2fa_challenges_expires_at_idx on public.app_2fa_challenges(expires_at);

        create table if not exists public.app_trusted_devices (
          token_hash text primary key,
          user_id uuid not null references public.profiles(id) on delete cascade,
          expires_at timestamptz not null,
          created_at timestamptz not null default now(),
          last_used_at timestamptz not null default now()
        );

        create index if not exists app_trusted_devices_user_id_idx on public.app_trusted_devices(user_id);
        create index if not exists app_trusted_devices_expires_at_idx on public.app_trusted_devices(expires_at);

        create table if not exists public.deals (
          id uuid primary key default gen_random_uuid(),
          user_id uuid not null references public.profiles(id) on delete cascade,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
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

        alter table public.deals add column if not exists updated_at timestamptz not null default now();
        alter table public.deals add column if not exists customer_name text;
        alter table public.deals add column if not exists quote_title text;
        alter table public.deals add column if not exists contact_name text;
        alter table public.deals add column if not exists sales_name text;
        alter table public.deals add column if not exists valid_until text;
        alter table public.deals add column if not exists package_key text;
        alter table public.deals add column if not exists package_name text;
        alter table public.deals add column if not exists selected_package text;
        alter table public.deals add column if not exists total_users integer;
        alter table public.deals add column if not exists extra_users integer;
        alter table public.deals add column if not exists contract_months integer;
        alter table public.deals add column if not exists discount_pct numeric not null default 0;
        alter table public.deals add column if not exists include_vat boolean not null default false;
        alter table public.deals add column if not exists manual_monthly_adjustment numeric not null default 0;
        alter table public.deals add column if not exists manual_implementation_adjustment numeric not null default 0;
        alter table public.deals add column if not exists monthly_base numeric;
        alter table public.deals add column if not exists monthly_price numeric;
        alter table public.deals add column if not exists monthly_total numeric;
        alter table public.deals add column if not exists implementation_base numeric;
        alter table public.deals add column if not exists implementation_price numeric;
        alter table public.deals add column if not exists implementation_total numeric;
        alter table public.deals add column if not exists contract_value numeric;
        alter table public.deals add column if not exists annual_recurring numeric;
        alter table public.deals add column if not exists modules jsonb not null default '[]'::jsonb;
        alter table public.deals add column if not exists notes text;
        alter table public.deals add column if not exists calculator_inputs jsonb not null default '{}'::jsonb;

        create index if not exists deals_user_id_created_at_idx on public.deals(user_id, created_at desc);

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
          updated_at timestamptz not null default now()
        );

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
        create index if not exists worldline_documents_project_idx
          on public.worldline_documents(project_id, document_type, version desc);

        create table if not exists public.app_settings (
          key text primary key,
          payload jsonb not null default '{}'::jsonb,
          updated_at timestamptz not null default now()
        );
      `);
    })();
  }

  await schemaReady;
}
