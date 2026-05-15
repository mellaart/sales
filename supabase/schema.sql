create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'sales' check (role in ('sales', 'support', 'consultant', 'manager', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'sales'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

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
alter table public.deals add column if not exists calculator_inputs jsonb not null default '{}'::jsonb;
update public.deals set user_id = auth.uid() where user_id is null;
alter table public.deals alter column user_id set not null;

create index if not exists deals_user_id_created_at_idx on public.deals(user_id, created_at desc);
create index if not exists profiles_role_idx on public.profiles(role);

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


alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('sales', 'support', 'consultant', 'manager', 'admin'));
