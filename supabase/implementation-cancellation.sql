-- Existing implementation statuses and archived deals remain unchanged.
begin;
alter table public.implementations drop constraint if exists implementations_status_check;
alter table public.implementations add constraint implementations_status_check
  check (status in ('new', 'assigned', 'planned', 'in_progress', 'waiting_customer', 'completed', 'cancelled'));

create or replace function public.archive_cancelled_implementation_deal()
returns trigger language plpgsql as $$
begin
  if new.status = 'cancelled' then
    update public.deals set archived_at = now(), updated_at = now()
    where id = new.deal_id and archived_at is null;
  end if;
  return new;
end;
$$;
drop trigger if exists archive_cancelled_implementation_deal on public.implementations;
create trigger archive_cancelled_implementation_deal
  after insert or update of status on public.implementations
  for each row execute function public.archive_cancelled_implementation_deal();
commit;
