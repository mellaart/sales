create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  job_title text,
  workdays text,
  mobile_phone text,
  role text not null default 'sales' check (role in ('sales', 'support', 'consultant', 'worldline', 'manager', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists workdays text;
alter table public.profiles add column if not exists mobile_phone text;
alter table public.profiles add column if not exists role text not null default 'sales';
alter table public.profiles add column if not exists created_at timestamptz not null default now();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, job_title, workdays, mobile_phone, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'job_title',
    new.raw_user_meta_data->>'workdays',
    new.raw_user_meta_data->>'mobile_phone',
    case
      when new.raw_user_meta_data->>'role' in ('sales', 'support', 'consultant', 'worldline', 'manager', 'admin')
        then new.raw_user_meta_data->>'role'
      else 'sales'
    end
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        job_title = coalesce(public.profiles.job_title, excluded.job_title),
        workdays = coalesce(public.profiles.workdays, excluded.workdays),
        mobile_phone = coalesce(public.profiles.mobile_phone, excluded.mobile_phone),
        role = coalesce(public.profiles.role, excluded.role);
  return new;
end;
$$;

do $$
declare
  trigger_record record;
begin
  for trigger_record in
    select trigger_name
    from information_schema.triggers
    where event_object_schema = 'auth'
      and event_object_table = 'users'
      and action_statement ilike '%public.handle_new_user%'
  loop
    execute format('drop trigger if exists %I on auth.users', trigger_record.trigger_name);
  end loop;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'sales')
$$;

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  customer_name text,
  quote_title text not null,
  contact_name text,
  sales_name text,
  valid_until text,
  package_key text not null,
  package_name text not null,
  total_users integer not null,
  contract_months integer not null,
  discount_pct numeric not null default 0,
  include_vat boolean not null default false,
  manual_monthly_adjustment numeric not null default 0,
  manual_implementation_adjustment numeric not null default 0,
  monthly_base numeric not null,
  monthly_total numeric not null,
  implementation_total numeric not null,
  contract_value numeric not null,
  annual_recurring numeric not null,
  modules jsonb not null default '[]'::jsonb,
  notes text,
  calculator_inputs jsonb not null default '{}'::jsonb
);

alter table public.deals enable row level security;

alter table public.deals add column if not exists user_id uuid;
alter table public.deals alter column user_id set default auth.uid();
alter table public.deals add column if not exists archived_at timestamptz;
alter table public.deals add column if not exists calculator_inputs jsonb not null default '{}'::jsonb;
update public.deals set user_id = auth.uid() where user_id is null;
alter table public.deals alter column user_id set not null;

create index if not exists deals_user_id_created_at_idx on public.deals(user_id, created_at desc);
create index if not exists deals_archived_at_created_at_idx on public.deals(archived_at, created_at desc);
create index if not exists profiles_role_idx on public.profiles(role);

create table if not exists public.worldline_projects (
  id uuid primary key default gen_random_uuid(),
  relation_id text not null,
  relation_name text not null,
  relation_email text,
  debtor_number text,
  status text not null default 'concept',
  agreement_fields jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worldline_projects_status_check
    check (status in ('concept', 'waiting_customer', 'checking', 'complete', 'submitted'))
);

create table if not exists public.worldline_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.worldline_projects(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint,
  version integer not null default 1,
  check_status text not null default 'uploaded',
  check_result jsonb not null default '{}'::jsonb,
  uploaded_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  uploaded_at timestamptz not null default now(),
  constraint worldline_documents_type_check
    check (document_type in ('kvk', 'agreement', 'identity', 'bank_statement', 'refund', 'ubo')),
  constraint worldline_documents_status_check
    check (check_status in ('missing', 'uploaded', 'checking', 'approved', 'rejected'))
);

alter table public.worldline_documents
  drop constraint if exists worldline_documents_document_type_check;
alter table public.worldline_documents
  drop constraint if exists worldline_documents_type_check;
alter table public.worldline_documents
  add constraint worldline_documents_type_check
  check (document_type in ('kvk', 'agreement', 'identity', 'bank_statement', 'refund', 'ubo'));

alter table public.worldline_projects enable row level security;
alter table public.worldline_documents enable row level security;

create index if not exists worldline_projects_relation_idx on public.worldline_projects(relation_id, updated_at desc);
create index if not exists worldline_projects_created_by_idx on public.worldline_projects(created_by, updated_at desc);
create index if not exists worldline_documents_project_idx on public.worldline_documents(project_id, document_type, version desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'worldline-documents',
  'worldline-documents',
  false,
  20971520,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Profiles self view" on public.profiles;
drop policy if exists "Profiles admin view" on public.profiles;
drop policy if exists "Profiles admin update" on public.profiles;
drop policy if exists "Users insert own deals" on public.deals;
drop policy if exists "Users view own deals" on public.deals;
drop policy if exists "Users update own deals" on public.deals;
drop policy if exists "Users delete own deals" on public.deals;
drop policy if exists "Managers and admins view all deals" on public.deals;
drop policy if exists "Managers and admins update all deals" on public.deals;
drop policy if exists "Managers and admins delete all deals" on public.deals;
drop policy if exists "Users insert own worldline projects" on public.worldline_projects;
drop policy if exists "Users view own worldline projects" on public.worldline_projects;
drop policy if exists "Users update own worldline projects" on public.worldline_projects;
drop policy if exists "Users delete own worldline projects" on public.worldline_projects;
drop policy if exists "Managers and admins view all worldline projects" on public.worldline_projects;
drop policy if exists "Managers and admins update all worldline projects" on public.worldline_projects;
drop policy if exists "Managers and admins delete all worldline projects" on public.worldline_projects;
drop policy if exists "Users insert worldline documents" on public.worldline_documents;
drop policy if exists "Users view worldline documents" on public.worldline_documents;
drop policy if exists "Users update worldline documents" on public.worldline_documents;
drop policy if exists "Users delete worldline documents" on public.worldline_documents;
drop policy if exists "Authenticated users manage worldline storage" on storage.objects;

create policy "Profiles self view"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Profiles admin view"
  on public.profiles
  for select
  to authenticated
  using (public.current_user_role() = 'admin');

create policy "Profiles admin update"
  on public.profiles
  for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "Users insert own deals"
  on public.deals
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users view own deals"
  on public.deals
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users update own deals"
  on public.deals
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own deals"
  on public.deals
  for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "Managers and admins view all deals"
  on public.deals
  for select
  to authenticated
  using (public.current_user_role() in ('manager', 'admin'));

create policy "Managers and admins update all deals"
  on public.deals
  for update
  to authenticated
  using (public.current_user_role() in ('manager', 'admin'))
  with check (public.current_user_role() in ('manager', 'admin'));

create policy "Managers and admins delete all deals"
  on public.deals
  for delete
  to authenticated
  using (public.current_user_role() in ('manager', 'admin'));

create policy "Users insert own worldline projects"
  on public.worldline_projects
  for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Users view own worldline projects"
  on public.worldline_projects
  for select
  to authenticated
  using (auth.uid() = created_by);

create policy "Users update own worldline projects"
  on public.worldline_projects
  for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "Users delete own worldline projects"
  on public.worldline_projects
  for delete
  to authenticated
  using (auth.uid() = created_by);

create policy "Managers and admins view all worldline projects"
  on public.worldline_projects
  for select
  to authenticated
  using (public.current_user_role() in ('manager', 'admin', 'worldline'));

create policy "Managers and admins update all worldline projects"
  on public.worldline_projects
  for update
  to authenticated
  using (public.current_user_role() in ('manager', 'admin', 'worldline'))
  with check (public.current_user_role() in ('manager', 'admin', 'worldline'));

create policy "Managers and admins delete all worldline projects"
  on public.worldline_projects
  for delete
  to authenticated
  using (public.current_user_role() in ('manager', 'admin', 'worldline'));

create policy "Users insert worldline documents"
  on public.worldline_documents
  for insert
  to authenticated
  with check (
    auth.uid() = uploaded_by
    and exists (
      select 1
      from public.worldline_projects project
      where project.id = project_id
        and (project.created_by = auth.uid() or public.current_user_role() in ('manager', 'admin', 'worldline'))
    )
  );

create policy "Users view worldline documents"
  on public.worldline_documents
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.worldline_projects project
      where project.id = project_id
        and (project.created_by = auth.uid() or public.current_user_role() in ('manager', 'admin', 'worldline'))
    )
  );

create policy "Users update worldline documents"
  on public.worldline_documents
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.worldline_projects project
      where project.id = project_id
        and (project.created_by = auth.uid() or public.current_user_role() in ('manager', 'admin', 'worldline'))
    )
  )
  with check (
    exists (
      select 1
      from public.worldline_projects project
      where project.id = project_id
        and (project.created_by = auth.uid() or public.current_user_role() in ('manager', 'admin', 'worldline'))
    )
  );

create policy "Users delete worldline documents"
  on public.worldline_documents
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.worldline_projects project
      where project.id = project_id
        and (project.created_by = auth.uid() or public.current_user_role() in ('manager', 'admin', 'worldline'))
    )
  );

create policy "Authenticated users manage worldline storage"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'worldline-documents')
  with check (bucket_id = 'worldline-documents');


alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('sales', 'support', 'consultant', 'worldline', 'manager', 'admin'));

notify pgrst, 'reload schema';
