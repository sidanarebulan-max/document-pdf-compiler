alter table public.lead_hub_lead_activity add column operation_id uuid;
alter table public.lead_hub_lead_activity add column actor_name text;
alter table public.lead_hub_lead_activity add column actor_code text;
create unique index lead_hub_activity_operation_idx on public.lead_hub_lead_activity(actor_id,operation_id) where operation_id is not null;

create function public.lead_hub_activity_actor_snapshot() returns trigger
language plpgsql security invoker set search_path='' as $snapshot$
begin
 select display_name,staff_code into new.actor_name,new.actor_code
 from public.lead_hub_accounts where id=new.actor_id;
 return new;
end;
$snapshot$;
revoke all on function public.lead_hub_activity_actor_snapshot() from public,anon,authenticated;
create trigger lead_hub_activity_actor_snapshot before insert on public.lead_hub_lead_activity
for each row execute function public.lead_hub_activity_actor_snapshot();
update public.lead_hub_lead_activity e set actor_name=a.display_name,actor_code=a.staff_code
from public.lead_hub_accounts a where a.id=e.actor_id;

-- The Edge Function supplies the authenticated actor. Only service_role can
-- invoke this RPC; shared PM never transfers a lead or exposes private notes.
create function public.lead_hub_contact_shared(_actor uuid,_lead uuid,_event text,_operation uuid)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare l public.lead_hub_leads%rowtype; prior public.lead_hub_lead_activity%rowtype;
 event_id bigint; at_time timestamptz:=now(); after_stage text;
begin
 if _operation is null or _event not in ('whatsapp_opened','pm_confirmed') then raise exception 'Invalid shared contact'; end if;
 if not exists(select 1 from public.lead_hub_accounts where id=_actor and active) then raise exception 'Account not active'; end if;
 select * into l from public.lead_hub_leads where id=_lead for update;
 if not found or not exists(select 1 from public.lead_hub_assignment_history where lead_id=_lead) then raise exception 'Number not in shared history'; end if;
 if not l.consent_confirmed then raise exception 'Contact consent not confirmed'; end if;
 after_stage:=case when _event='pm_confirmed' and l.assigned_id=_actor and l.stage in ('new','claimed') then 'contacted' else l.stage end;
 insert into public.lead_hub_lead_activity(lead_id,actor_id,event_type,stage_before,stage_after,operation_id)
 values(_lead,_actor,_event,l.stage,after_stage,_operation)
 on conflict(actor_id,operation_id) where operation_id is not null do nothing returning id into event_id;
 if event_id is null then
  select * into prior from public.lead_hub_lead_activity where actor_id=_actor and operation_id=_operation;
  if prior.lead_id is distinct from _lead or prior.event_type is distinct from _event then raise exception 'Operation already used'; end if;
  return jsonb_build_object('event_id',prior.id,'at',prior.created_at,'already_recorded',true);
 end if;
 if l.assigned_id=_actor then
  if _event='whatsapp_opened' then
   update public.lead_hub_leads set last_opened_at=at_time where id=_lead;
  else
   update public.lead_hub_leads set pm_confirmed_at=coalesce(pm_confirmed_at,at_time),
    pm_confirmed_by=coalesce(pm_confirmed_by,_actor),stage=after_stage,updated_at=at_time where id=_lead;
  end if;
 end if;
 return jsonb_build_object('event_id',event_id,'at',at_time,'already_recorded',false);
end;
$function$;
revoke all on function public.lead_hub_contact_shared(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.lead_hub_contact_shared(uuid,uuid,text,uuid) to service_role;
