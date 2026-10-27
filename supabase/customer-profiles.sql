-- One private sales profile per existing (phone-unique) Lead Hub customer.
create table public.lead_hub_customer_profiles (
 lead_id uuid primary key references public.lead_hub_leads(id) on delete cascade,
 sales_status text not null default 'new' check(sales_status in ('new','contacted','interested','documents','bank_submitted','approved','delivery','delivered','on_hold','cancelled')),
 variant text not null default '' check(char_length(variant)<=120),
 next_action text not null default '' check(char_length(next_action)<=500),
 closure_reason text not null default '' check(char_length(closure_reason)<=1000),
 guarantor_required boolean not null default false,
 booking_status text not null default 'none' check(booking_status in ('none','pending','paid','refunded')),
 booking_amount numeric(12,2) check(booking_amount between 0 and 100000000),
 selling_price numeric(12,2) check(selling_price between 0 and 100000000),
 deposit numeric(12,2) check(deposit between 0 and 100000000),
 loan_amount numeric(12,2) check(loan_amount between 0 and 100000000),
 revision integer not null default 0,
 updated_at timestamptz not null default now()
);
create index lead_hub_customer_status_idx on public.lead_hub_customer_profiles(sales_status,updated_at desc);
create function public.lead_hub_customer_seed() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.lead_hub_customer_profiles(lead_id,sales_status) values(new.id,case new.stage when 'contacted' then 'contacted' when 'follow_up' then 'contacted' when 'interested' then 'interested' when 'booked' then 'interested' when 'not_interested' then 'cancelled' else 'new' end);
 return new;
end;$$;
revoke all on function public.lead_hub_customer_seed() from public,anon,authenticated;
create trigger lead_hub_customer_seed after insert on public.lead_hub_leads for each row execute function public.lead_hub_customer_seed();
insert into public.lead_hub_customer_profiles(lead_id,sales_status)
select id,case stage when 'contacted' then 'contacted' when 'follow_up' then 'contacted' when 'interested' then 'interested' when 'booked' then 'interested' when 'not_interested' then 'cancelled' else 'new' end from public.lead_hub_leads;

alter table public.lead_hub_inbox_files add column customer_id uuid references public.lead_hub_leads(id) on delete set null;
create index lead_hub_inbox_customer_idx on public.lead_hub_inbox_files(customer_id,created_at desc) where customer_id is not null;
-- Existing files are deliberately not matched by name; staff explicitly chooses the profile.
create table public.lead_hub_customer_events (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null references public.lead_hub_leads(id) on delete cascade,
 actor_id uuid references public.lead_hub_accounts(id),
 actor_name text not null,
 actor_code text not null,
 event_type text not null,
 details jsonb not null default '{}'::jsonb,
 operation_id uuid,
 created_at timestamptz not null default now()
);
create index lead_hub_customer_events_lead_idx on public.lead_hub_customer_events(lead_id,created_at desc,id);
create index lead_hub_customer_events_actor_idx on public.lead_hub_customer_events(actor_id);
create unique index lead_hub_customer_events_operation_idx on public.lead_hub_customer_events(actor_id,operation_id) where operation_id is not null;
create table public.lead_hub_customer_banks (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null references public.lead_hub_leads(id) on delete cascade,
 bank_name text not null check(char_length(bank_name) between 1 and 100),
 status text not null check(status in ('draft','submitted','documents','approved','rejected','cancelled')),
 amount numeric(12,2) check(amount between 0 and 100000000),
 notes text not null default '' check(char_length(notes)<=2000),
 submitted_at date,
 updated_at timestamptz not null default now()
);
create index lead_hub_customer_banks_lead_idx on public.lead_hub_customer_banks(lead_id);
create table public.lead_hub_customer_checklist (
 lead_id uuid not null references public.lead_hub_leads(id) on delete cascade,
 party text not null check(party in ('HIRER','GUARANTOR')),
 category text not null check(category in ('IC','LESEN','PAYSLIP','BANK')),
 status text not null check(status in ('missing','received','replace','not_required')),
 updated_at timestamptz not null default now(),
 primary key(lead_id,party,category)
);
alter table public.lead_hub_customer_profiles enable row level security;
alter table public.lead_hub_customer_events enable row level security;
alter table public.lead_hub_customer_banks enable row level security;
alter table public.lead_hub_customer_checklist enable row level security;
revoke all on public.lead_hub_customer_profiles,public.lead_hub_customer_events,public.lead_hub_customer_banks,public.lead_hub_customer_checklist from public,anon,authenticated;
grant select,insert,update,delete on public.lead_hub_customer_profiles,public.lead_hub_customer_events,public.lead_hub_customer_banks,public.lead_hub_customer_checklist to service_role;

create function public.lead_hub_customer_list(_actor uuid)
returns table(id uuid,customer_name text,phone_e164 text,model text,source text,assigned_id uuid,staff_name text,staff_code text,sales_status text,variant text,next_action text,follow_up_at date,created_at timestamptz,updated_at timestamptz,doc_count bigint)
language sql stable security invoker set search_path='' as $$
 select l.id,l.customer_name,l.phone_e164,l.model,l.source,l.assigned_id,s.display_name,s.staff_code,p.sales_status,p.variant,p.next_action,l.follow_up_at,l.created_at,greatest(l.updated_at,p.updated_at),
 (select count(*) from public.lead_hub_inbox_files f where f.customer_id=l.id and f.state<>'uploading')
 from public.lead_hub_leads l join public.lead_hub_customer_profiles p on p.lead_id=l.id left join public.lead_hub_accounts s on s.id=l.assigned_id
 where exists(select 1 from public.lead_hub_accounts a where a.id=_actor and a.active and (a.role='admin' or l.assigned_id=_actor));
$$;
create function public.lead_hub_inbox_visible(_actor uuid) returns setof public.lead_hub_inbox_files
language sql stable security invoker set search_path='' as $$
 select f.* from public.lead_hub_inbox_files f where exists(select 1 from public.lead_hub_accounts a where a.id=_actor and a.active and
 (a.role='admin' or (f.customer_id is null and f.owner_id=_actor) or exists(select 1 from public.lead_hub_leads l where l.id=f.customer_id and l.assigned_id=_actor)));
$$;
create function public.lead_hub_customer_get(_actor uuid,_lead uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare l public.lead_hub_leads%rowtype; result jsonb;
begin
 select * into l from public.lead_hub_leads where id=_lead;
 if not found or not exists(select 1 from public.lead_hub_accounts a where a.id=_actor and a.active and (a.role='admin' or l.assigned_id=_actor)) then raise exception using errcode='42501',message='Customer access denied'; end if;
 select jsonb_build_object('lead',to_jsonb(l)-'created_by','profile',to_jsonb(p),
 'staff',(select jsonb_build_object('id',id,'display_name',display_name,'staff_code',staff_code) from public.lead_hub_accounts where id=l.assigned_id),
 'files',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,customer_id,original_name,mime_type,byte_size,party,category,created_at from public.lead_hub_inbox_files where customer_id=_lead and state<>'uploading') x),'[]'::jsonb),
 'banks',coalesce((select jsonb_agg(to_jsonb(b) order by b.updated_at desc) from public.lead_hub_customer_banks b where b.lead_id=_lead),'[]'::jsonb),
 'checklist',coalesce((select jsonb_agg(to_jsonb(c)) from public.lead_hub_customer_checklist c where c.lead_id=_lead),'[]'::jsonb),
 'notes',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from (select id,actor_name,actor_code,details,created_at from public.lead_hub_customer_events where lead_id=_lead and event_type='note_added' order by created_at desc,id desc limit 100) n),'[]'::jsonb)) into result
 from public.lead_hub_customer_profiles p where p.lead_id=_lead;
 return result;
end;$$;
create function public.lead_hub_customer_timeline(_actor uuid,_lead uuid,_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.lead_hub_leads l join public.lead_hub_accounts a on a.id=_actor and a.active where l.id=_lead and (a.role='admin' or l.assigned_id=_actor)) then raise exception using errcode='42501',message='Customer access denied'; end if;
 with events as (
 select 'profile:'||id as key,event_type,actor_name,actor_code,details,created_at from public.lead_hub_customer_events where lead_id=_lead
 union all select 'wa:'||id,event_type,actor_name,actor_code,jsonb_build_object('stage_before',stage_before,'stage_after',stage_after),created_at from public.lead_hub_lead_activity where lead_id=_lead
 union all select 'assignment:'||id,event_type,null,null,jsonb_build_object('assignee_name',assignee_name,'assignee_code',assignee_code,'assigned_at',assigned_at),coalesce(assigned_at,recorded_at) from public.lead_hub_assignment_history where lead_id=_lead
 union all select 'created:'||id,'lead_created',null,null,jsonb_build_object('source',source),created_at from public.lead_hub_leads where id=_lead
 ), page as (select * from events order by created_at desc,key desc offset greatest(0,_offset) limit 51)
 select jsonb_build_object('events',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc,p.key desc) from (select * from page order by created_at desc,key desc limit 50) p),'[]'::jsonb),'next_offset',case when (select count(*) from page)>50 then greatest(0,_offset)+50 else null end) into result;
 return result;
end;$$;

create function public.lead_hub_customer_write(_actor uuid,_lead uuid,_action text,_data jsonb,_operation uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.lead_hub_accounts%rowtype; l public.lead_hub_leads%rowtype; p public.lead_hub_customer_profiles%rowtype; old_profile jsonb; after_profile jsonb; old_bank public.lead_hub_customer_banks%rowtype;
 details jsonb:='{}'; event_type text; prior public.lead_hub_customer_events%rowtype; file_record public.lead_hub_inbox_files%rowtype; ids uuid[]; total integer; v_id uuid; v_status text; v_party text; v_category text;
begin
 select * into a from public.lead_hub_accounts where id=_actor and active;
 if not found then raise exception using errcode='42501',message='Account unavailable'; end if;
 select * into l from public.lead_hub_leads where id=_lead for update;
 if not found or (a.role<>'admin' and l.assigned_id is distinct from _actor) then raise exception using errcode='42501',message='Customer access denied'; end if;
 if _operation is null then raise exception 'Operation required'; end if;
 select * into prior from public.lead_hub_customer_events where actor_id=_actor and operation_id=_operation;
 if found then
  if prior.lead_id<>_lead or prior.details->>'action'<>_action or prior.details->'request' is distinct from _data then raise exception 'Operation already used'; end if;
  return jsonb_build_object('ok',true,'already_recorded',true);
 end if;
 select * into p from public.lead_hub_customer_profiles where lead_id=_lead for update;
 if _action='save_profile' then
  if (_data->>'expected_revision')::integer is distinct from p.revision or (_data->>'expected_lead_updated_at')::timestamptz is distinct from l.updated_at then raise exception using errcode='P0001',message='PROFILE_CONFLICT'; end if;
  if char_length(trim(_data->>'customer_name')) not between 1 and 120 or char_length(coalesce(_data->>'model',''))>120 or char_length(coalesce(_data->>'next_action',''))>500 or char_length(coalesce(_data->>'variant',''))>120 or char_length(coalesce(_data->>'closure_reason',''))>1000 then raise exception 'Invalid profile'; end if;
  if _data->>'sales_status' in ('on_hold','cancelled') and char_length(trim(coalesce(_data->>'closure_reason','')))=0 then raise exception 'Reason required'; end if;
  old_profile:=(to_jsonb(p)-'revision'-'updated_at')||jsonb_build_object('customer_name',l.customer_name,'model',l.model,'follow_up_at',l.follow_up_at);
  update public.lead_hub_customer_profiles set sales_status=_data->>'sales_status',variant=coalesce(_data->>'variant',''),next_action=coalesce(_data->>'next_action',''),closure_reason=coalesce(_data->>'closure_reason',''),guarantor_required=coalesce((_data->>'guarantor_required')::boolean,false),booking_status=_data->>'booking_status',
   booking_amount=nullif(_data->>'booking_amount','')::numeric,selling_price=nullif(_data->>'selling_price','')::numeric,deposit=nullif(_data->>'deposit','')::numeric,loan_amount=nullif(_data->>'loan_amount','')::numeric,revision=revision+1,updated_at=now() where lead_id=_lead returning * into p;
  update public.lead_hub_leads set customer_name=trim(_data->>'customer_name'),model=coalesce(_data->>'model',''),follow_up_at=nullif(_data->>'follow_up_at','')::date,updated_at=now() where id=_lead returning * into l;
  update public.lead_hub_inbox_files set customer_name=l.customer_name,customer_phone=l.phone_e164 where customer_id=_lead;
  after_profile:=(to_jsonb(p)-'revision'-'updated_at')||jsonb_build_object('customer_name',l.customer_name,'model',l.model,'follow_up_at',l.follow_up_at);
  details:=jsonb_build_object('before',old_profile,'after',after_profile);event_type:='profile_updated';
 elsif _action='add_note' then
  if char_length(trim(coalesce(_data->>'note',''))) not between 1 and 4000 then raise exception 'Invalid note'; end if;
  details:=jsonb_build_object('note',trim(_data->>'note'));event_type:='note_added';
 elsif _action='save_bank' then
  if char_length(trim(coalesce(_data->>'bank_name',''))) not between 1 and 100 or char_length(coalesce(_data->>'notes',''))>2000 then raise exception 'Invalid bank'; end if;
  if nullif(_data->>'id','') is not null then
   v_id:=(_data->>'id')::uuid;
   select * into old_bank from public.lead_hub_customer_banks where id=v_id and lead_id=_lead for update;
   if not found then raise exception using errcode='42501',message='Bank access denied'; end if;
   update public.lead_hub_customer_banks set bank_name=trim(_data->>'bank_name'),status=_data->>'status',amount=nullif(_data->>'amount','')::numeric,notes=coalesce(_data->>'notes',''),submitted_at=nullif(_data->>'submitted_at','')::date,updated_at=now() where id=v_id and lead_id=_lead;
  else
   v_id:=gen_random_uuid();
   insert into public.lead_hub_customer_banks(id,lead_id,bank_name,status,amount,notes,submitted_at)
   values(v_id,_lead,trim(_data->>'bank_name'),_data->>'status',nullif(_data->>'amount','')::numeric,coalesce(_data->>'notes',''),nullif(_data->>'submitted_at','')::date);
  end if;
  details:=jsonb_build_object('before',to_jsonb(old_bank),'after',(select to_jsonb(b) from public.lead_hub_customer_banks b where id=v_id));event_type:='bank_updated';
 elsif _action='delete_bank' then
  delete from public.lead_hub_customer_banks where id=(_data->>'id')::uuid and lead_id=_lead returning * into old_bank;
  if not found then raise exception 'Bank unavailable'; end if;
  details:=jsonb_build_object('before',to_jsonb(old_bank));event_type:='bank_removed';
 elsif _action='checklist' then
  v_party:=_data->>'party';v_category:=_data->>'category';v_status:=_data->>'status';
  details:=jsonb_build_object('party',v_party,'category',v_category,'before',(select status from public.lead_hub_customer_checklist where lead_id=_lead and party=v_party and category=v_category),'after',v_status);
  if v_status='auto' then delete from public.lead_hub_customer_checklist where lead_id=_lead and party=v_party and category=v_category;
  else insert into public.lead_hub_customer_checklist(lead_id,party,category,status) values(_lead,v_party,v_category,v_status) on conflict(lead_id,party,category) do update set status=excluded.status,updated_at=now(); end if;
  event_type:='checklist_updated';
 elsif _action='link_files' then
  select array_agg(distinct x::uuid) into ids from jsonb_array_elements_text(_data->'ids') x;
  if coalesce(cardinality(ids),0) not between 1 and 30 then raise exception 'Choose 1-30 files'; end if;
  v_party:=_data->>'party';v_category:=_data->>'category';
  if v_party not in ('HIRER','GUARANTOR','REBATE') or v_category not in ('AUTO','VSO','IC','LESEN','PAYSLIP','BANK','OTHER','IC_FRONT','IC_BACK','SURAT_KERJA','SIJIL_LAHIR','SIJIL_NIKAH') then raise exception 'Invalid category'; end if;
  if (v_party='REBATE' and v_category not in ('AUTO','IC_FRONT','IC_BACK','LESEN','SURAT_KERJA','SIJIL_LAHIR','SIJIL_NIKAH','OTHER')) or (v_party<>'REBATE' and v_category not in ('AUTO','VSO','IC','LESEN','PAYSLIP','BANK','OTHER')) then raise exception 'Category does not match party'; end if;
  perform id from public.lead_hub_inbox_files where id=any(ids) order by id for update;
  select count(*) into total from public.lead_hub_inbox_files where id=any(ids) and state<>'uploading' and (customer_id is null or customer_id=_lead) and (a.role='admin' or (customer_id is null and owner_id=_actor) or customer_id=_lead);
  if total<>cardinality(ids) then raise exception using errcode='42501',message='File access changed'; end if;
  details:=jsonb_build_object('files',(select jsonb_agg(jsonb_build_object('id',id,'name',original_name,'party',party,'category',category)) from public.lead_hub_inbox_files where id=any(ids)),'party',v_party,'category',v_category);
  update public.lead_hub_inbox_files set customer_id=_lead,customer_name=l.customer_name,customer_phone=l.phone_e164,owner_id=coalesce(l.assigned_id,_actor),party=v_party,category=v_category,state='assigned',updated_at=now() where id=any(ids);
  event_type:='documents_linked';
 elsif _action='unlink_file' then
  select * into file_record from public.lead_hub_inbox_files where id=(_data->>'id')::uuid and customer_id=_lead for update;
  if not found then raise exception 'File unavailable'; end if;
  update public.lead_hub_inbox_files set customer_id=null,owner_id=coalesce(l.assigned_id,_actor),customer_name='',customer_phone='',state='inbox',updated_at=now() where id=file_record.id;
  details:=jsonb_build_object('id',file_record.id,'name',file_record.original_name,'party',file_record.party,'category',file_record.category);event_type:='document_unlinked';
 else raise exception 'Unknown customer action'; end if;
 insert into public.lead_hub_customer_events(lead_id,actor_id,actor_name,actor_code,event_type,details,operation_id)
 values(_lead,_actor,a.display_name,a.staff_code,event_type,details||jsonb_build_object('action',_action,'request',_data),_operation);
 return jsonb_build_object('ok',true);
end;$$;

-- Preserve the old Inbox assign endpoint for unlinked documents. Linked files
-- are managed through their profile to prevent accidental reassignment/leaks.
create or replace function public.lead_hub_inbox_assign(_actor uuid,_ids uuid[],_customer text,_phone text,_party text,_category text,_target uuid default null)
returns setof uuid language plpgsql security invoker set search_path='' as $$
declare actor_role text; total integer;
begin
 select role into actor_role from public.lead_hub_accounts where id=_actor and active;
 if actor_role is null then raise exception 'Account unavailable'; end if;
 if cardinality(_ids) not between 1 and 30 or char_length(_customer) not between 2 and 120 then raise exception 'Invalid assignment'; end if;
 if _target is not null and _target<>_actor and (actor_role<>'admin' or not exists(select 1 from public.lead_hub_accounts where id=_target and active and role='staff')) then raise exception 'Target not allowed'; end if;
 perform id from public.lead_hub_inbox_files where id=any(_ids) order by id for update;
 select count(*) into total from public.lead_hub_inbox_files where id=any(_ids) and state<>'uploading' and customer_id is null and (actor_role='admin' or owner_id=_actor);
 if total<>cardinality(_ids) then raise exception 'File linked or access changed. Use customer profile'; end if;
 return query update public.lead_hub_inbox_files set customer_name=_customer,customer_phone=_phone,party=_party,category=_category,owner_id=coalesce(_target,owner_id),state='assigned',updated_at=now() where id=any(_ids) returning id;
end;$$;
revoke all on function public.lead_hub_customer_list(uuid),public.lead_hub_inbox_visible(uuid),public.lead_hub_customer_get(uuid,uuid),public.lead_hub_customer_timeline(uuid,uuid,integer),public.lead_hub_customer_write(uuid,uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.lead_hub_customer_list(uuid),public.lead_hub_inbox_visible(uuid),public.lead_hub_customer_get(uuid,uuid),public.lead_hub_customer_timeline(uuid,uuid,integer),public.lead_hub_customer_write(uuid,uuid,text,jsonb,uuid) to service_role;
create function public.lead_hub_customer_models(_actor uuid) returns table(model text)
language sql stable security invoker set search_path='' as $$ select distinct l.model from public.lead_hub_leads l where exists(select 1 from public.lead_hub_accounts a where a.id=_actor and a.active and (a.role='admin' or l.assigned_id=_actor)) and l.model<>'' order by l.model; $$;
revoke all on function public.lead_hub_customer_models(uuid) from public,anon,authenticated;
grant execute on function public.lead_hub_customer_models(uuid) to service_role;

-- Existing WhatsApp edits are audited with the authenticated actor in the same transaction.
create function public.lead_hub_customer_save_whatsapp(_actor uuid,_lead uuid,_stage text,_notes text,_follow date)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.lead_hub_accounts%rowtype; l public.lead_hub_leads%rowtype;
begin
 select * into a from public.lead_hub_accounts where id=_actor and active;
 if not found then raise exception using errcode='42501',message='Account unavailable'; end if;
 select * into l from public.lead_hub_leads where id=_lead for update;
 if not found or (a.role<>'admin' and l.assigned_id is distinct from _actor) then raise exception using errcode='42501',message='Customer access denied'; end if;
 if (a.role<>'admin' and _stage='new') or _stage not in ('new','claimed','contacted','follow_up','interested','booked','not_interested') or char_length(_notes)>3000 then raise exception 'Invalid WhatsApp details'; end if;
 update public.lead_hub_leads set stage=_stage,notes=_notes,follow_up_at=_follow,updated_at=now() where id=_lead;
 if l.stage is distinct from _stage then insert into public.lead_hub_lead_activity(lead_id,actor_id,event_type,stage_before,stage_after) values(_lead,_actor,'status_updated',l.stage,_stage); end if;
 if l.notes is distinct from _notes or l.follow_up_at is distinct from _follow then
  insert into public.lead_hub_customer_events(lead_id,actor_id,actor_name,actor_code,event_type,details)
  values(_lead,_actor,a.display_name,a.staff_code,'whatsapp_details_updated',jsonb_build_object('note_changed',l.notes is distinct from _notes,'notes_before',l.notes,'notes_after',_notes,'follow_up_before',l.follow_up_at,'follow_up_after',_follow));
 end if;
 return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.lead_hub_customer_save_whatsapp(uuid,uuid,text,text,date) from public,anon,authenticated;
grant execute on function public.lead_hub_customer_save_whatsapp(uuid,uuid,text,text,date) to service_role;
