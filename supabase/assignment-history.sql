-- Team-visible assignment audit. Browser roles cannot access this table directly.
create table public.lead_hub_assignment_history (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.lead_hub_leads(id) on delete cascade,
  assignee_id uuid references public.lead_hub_accounts(id) on delete set null,
  assignee_name text not null,
  assignee_code text not null,
  event_type text not null check (event_type in ('claimed','assigned','legacy_assignment')),
  assigned_at timestamptz,
  recorded_at timestamptz not null default now()
);
create index lead_hub_assignment_history_lead_idx on public.lead_hub_assignment_history(lead_id);
create index lead_hub_assignment_history_account_idx on public.lead_hub_assignment_history(assignee_id);
create index lead_hub_assignment_history_time_idx on public.lead_hub_assignment_history(recorded_at desc,id desc);
alter table public.lead_hub_assignment_history enable row level security;
revoke all on public.lead_hub_assignment_history from public,anon,authenticated;
grant select,insert on public.lead_hub_assignment_history to service_role;
grant usage,select on sequence public.lead_hub_assignment_history_id_seq to service_role;

-- Invoker rights: only existing privileged server paths can change assignments.
-- A database trigger covers website, Telegram and the atomic claim RPC together.
create function public.lead_hub_record_assignment() returns trigger
language plpgsql security invoker set search_path = '' as $function$
declare
  changed boolean;
begin
  if new.assigned_id is null then return new; end if;
  if tg_op = 'INSERT' then
    changed := true;
  else
    changed := new.assigned_id is distinct from old.assigned_id
      or (new.stage = 'claimed' and old.stage = 'new');
  end if;
  if changed then
    insert into public.lead_hub_assignment_history
      (lead_id,assignee_id,assignee_name,assignee_code,event_type,assigned_at)
    select new.id,a.id,a.display_name,a.staff_code,
      case when new.stage = 'claimed' then 'claimed' else 'assigned' end,now()
    from public.lead_hub_accounts a where a.id = new.assigned_id;
  end if;
  return new;
end;
$function$;
revoke all on function public.lead_hub_record_assignment() from public,anon,authenticated;
create trigger lead_hub_assignment_audit
after insert or update of assigned_id,stage on public.lead_hub_leads
for each row execute function public.lead_hub_record_assignment();

-- Existing assignments have no reliable claim timestamp. Preserve that fact.
insert into public.lead_hub_assignment_history
  (lead_id,assignee_id,assignee_name,assignee_code,event_type,assigned_at)
select l.id,a.id,a.display_name,a.staff_code,'legacy_assignment',null
from public.lead_hub_leads l join public.lead_hub_accounts a on a.id=l.assigned_id;
