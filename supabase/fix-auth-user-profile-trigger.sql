-- Fix voor Supabase Auth fout: "Database error saving new user"
-- Voer dit uit in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists workdays text;
alter table public.profiles add column if not exists mobile_phone text;
alter table public.profiles add column if not exists role text not null default 'sales';
alter table public.profiles add column if not exists created_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('sales', 'support', 'consultant', 'worldline', 'worldline_consultant', 'manager', 'admin'));

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
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    nullif(new.raw_user_meta_data->>'job_title', ''),
    nullif(new.raw_user_meta_data->>'workdays', ''),
    nullif(new.raw_user_meta_data->>'mobile_phone', ''),
    case
      when new.raw_user_meta_data->>'role' in ('sales', 'support', 'consultant', 'worldline', 'worldline_consultant', 'manager', 'admin')
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

notify pgrst, 'reload schema';
