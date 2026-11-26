-- Add tracking fields without rewriting historical dates or bank records.
alter table public.lead_hub_customer_profiles
 add column lead_received_at timestamptz,
 add column delivered_at timestamptz,
 add column last_contacted_at timestamptz,
 add column follow_up_due_at timestamptz;

alter table public.lead_hub_customer_banks
 add column submitted_time time,
 add column officer_name text not null default '',
 add column officer_phone text not null default '',
 add column term_months integer check(term_months between 1 and 120),
 add column approved_amount numeric(12,2) check(approved_amount between 0 and 100000000),
 add column approved_rate numeric(5,2) check(approved_rate between 0 and 100),
 add column approved_term_months integer check(approved_term_months between 1 and 120),
 add column selected boolean not null default false,
 add column follow_up_due_at timestamptz,
 add column next_action text not null default '';
alter table public.lead_hub_customer_banks drop constraint lead_hub_customer_banks_status_check;
alter table public.lead_hub_customer_banks add constraint lead_hub_customer_banks_status_check
 check(status in ('draft','submitted','review','documents','approved','rejected','cancelled'));
create unique index lead_hub_customer_bank_selected_idx on public.lead_hub_customer_banks(lead_id) where selected;

-- Recover the recorded transition for existing delivered cases when available.
update public.lead_hub_customer_profiles p set delivered_at=(
 select max(e.created_at) from public.lead_hub_customer_events e
 where e.lead_id=p.lead_id and e.event_type='profile_updated'
 and e.details->'after'->>'sales_status'='delivered'
 and e.details->'before'->>'sales_status' is distinct from 'delivered'
) where p.sales_status='delivered';

CREATE OR REPLACE FUNCTION public.lead_hub_customer_write(_actor uuid, _lead uuid, _action text, _data jsonb, _operation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a public.lead_hub_accounts%rowtype; l public.lead_hub_leads%rowtype; p public.lead_hub_customer_profiles%rowtype; old_profile jsonb; after_profile jsonb; old_bank public.lead_hub_customer_banks%rowtype;
 details jsonb:='{}'; event_type text; prior public.lead_hub_customer_events%rowtype; file_record public.lead_hub_inbox_files%rowtype; ids uuid[]; total integer; v_id uuid; v_status text; v_party text; v_category text; bank_values public.lead_hub_customer_banks%rowtype; previous_selected jsonb;
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
  update public.lead_hub_customer_profiles set lou_received=case when _data ? 'lou_received' then (_data->>'lou_received')::boolean else lou_received end,trade_in=case when _data ? 'trade_in' then (_data->>'trade_in')::boolean else trade_in end,sales_status=_data->>'sales_status',variant=coalesce(_data->>'variant',''),lead_received_at=case when _data ? 'lead_received_at' then (_data->>'lead_received_at')::timestamptz else p.lead_received_at end,
   delivered_at=case when _data->>'sales_status'<>'delivered' then p.delivered_at
    when nullif(_data->>'delivered_at','') is not null then (_data->>'delivered_at')::timestamptz
    when p.sales_status<>'delivered' then now() else p.delivered_at end,
   follow_up_due_at=case when _data ? 'follow_up_due_at' then (_data->>'follow_up_due_at')::timestamptz
    when nullif(_data->>'follow_up_at','')::date is distinct from l.follow_up_at then null else p.follow_up_due_at end,
   colour=case when _data ? 'colour' then regexp_replace(trim(coalesce(_data->>'colour','')), '\s+', ' ', 'g') else colour end,next_action=coalesce(_data->>'next_action',''),closure_reason=coalesce(_data->>'closure_reason',''),guarantor_required=coalesce((_data->>'guarantor_required')::boolean,false),booking_status=_data->>'booking_status',
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
  v_id:=coalesce(nullif(_data->>'id','')::uuid,gen_random_uuid());
  if nullif(_data->>'id','') is not null then
   select * into old_bank from public.lead_hub_customer_banks where id=v_id and lead_id=_lead for update;
   if not found then raise exception using errcode='42501',message='Bank access denied'; end if;
   if _data ? 'expected_updated_at' and (_data->>'expected_updated_at')::timestamptz is distinct from old_bank.updated_at then
    raise exception using errcode='P0001',message='PROFILE_CONFLICT';
   end if;
  end if;
  bank_values:=jsonb_populate_record(old_bank,_data - 'lead_id' - 'id' - 'updated_at');
  if bank_values.selected then
   select to_jsonb(b) into previous_selected from public.lead_hub_customer_banks b where lead_id=_lead and selected and id<>v_id;
   update public.lead_hub_customer_banks set selected=false,updated_at=now() where lead_id=_lead and selected and id<>v_id;
  end if;
  insert into public.lead_hub_customer_banks as b
   (id,lead_id,bank_name,status,amount,notes,submitted_at,submitted_time,officer_name,officer_phone,term_months,approved_amount,approved_rate,approved_term_months,selected,follow_up_due_at,next_action)
  values(v_id,_lead,bank_values.bank_name,bank_values.status,bank_values.amount,bank_values.notes,bank_values.submitted_at,bank_values.submitted_time,
   coalesce(bank_values.officer_name,''),coalesce(bank_values.officer_phone,''),bank_values.term_months,bank_values.approved_amount,bank_values.approved_rate,bank_values.approved_term_months,
   coalesce(bank_values.selected,false),bank_values.follow_up_due_at,coalesce(bank_values.next_action,''))
  on conflict(id) do update set bank_name=excluded.bank_name,status=excluded.status,amount=excluded.amount,notes=excluded.notes,
   submitted_at=excluded.submitted_at,submitted_time=excluded.submitted_time,officer_name=excluded.officer_name,officer_phone=excluded.officer_phone,
   term_months=excluded.term_months,approved_amount=excluded.approved_amount,approved_rate=excluded.approved_rate,approved_term_months=excluded.approved_term_months,
   selected=excluded.selected,follow_up_due_at=excluded.follow_up_due_at,next_action=excluded.next_action,updated_at=now();
  details:=jsonb_build_object('before',to_jsonb(old_bank),'after',(select to_jsonb(b) from public.lead_hub_customer_banks b where id=v_id),'previous_selected',previous_selected->>'bank_name');
  event_type:='bank_updated';
 elsif _action='record_contact' then
  update public.lead_hub_customer_profiles set last_contacted_at=now(),updated_at=now(),revision=revision+1 where lead_id=_lead;
  details:=jsonb_build_object('note',_data->>'note');event_type:='contact_recorded';
 elsif _action='complete_follow_up' then
  v_id:=nullif(_data->>'id','')::uuid;
  if v_id is null then
   if (_data->>'expected_revision')::integer is distinct from p.revision or (_data->>'expected_lead_updated_at')::timestamptz is distinct from l.updated_at then
    raise exception using errcode='P0001',message='PROFILE_CONFLICT';
   end if;
   if l.follow_up_at is null then raise exception 'No scheduled follow-up'; end if;
   details:=jsonb_build_object('task',p.next_action,'due_date',l.follow_up_at,'due_at',p.follow_up_due_at);
   update public.lead_hub_customer_profiles set follow_up_due_at=null,next_action='',revision=revision+1,updated_at=now() where lead_id=_lead;
   update public.lead_hub_leads set follow_up_at=null,updated_at=now() where id=_lead;
  else
   select * into old_bank from public.lead_hub_customer_banks where id=v_id and lead_id=_lead;
   if not found then raise exception using errcode='42501',message='Bank access denied'; end if;
   if (_data->>'expected_updated_at')::timestamptz is distinct from old_bank.updated_at then raise exception using errcode='P0001',message='PROFILE_CONFLICT'; end if;
   if old_bank.follow_up_due_at is null then raise exception 'No scheduled follow-up'; end if;
   details:=jsonb_build_object('bank',old_bank.bank_name,'task',old_bank.next_action,'due_at',old_bank.follow_up_due_at);
   update public.lead_hub_customer_banks set follow_up_due_at=null,next_action='',updated_at=now() where id=v_id;
  end if;
  details:=details||jsonb_build_object('note',_data->>'note');event_type:='follow_up_completed';
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
end;$function$;

create or replace function public.lead_hub_customer_get(_actor uuid,_lead uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare l public.lead_hub_leads%rowtype; result jsonb;
begin
 select * into l from public.lead_hub_leads where id=_lead;
 if not found or not exists(select 1 from public.lead_hub_accounts a where a.id=_actor and a.active and (a.role='admin' or l.assigned_id=_actor)) then raise exception using errcode='42501',message='Customer access denied'; end if;
 select jsonb_build_object('lead',to_jsonb(l)-'created_by','profile',to_jsonb(p),
 'tracking',jsonb_build_object(
  'updated_at',greatest(l.updated_at,p.updated_at,last_event.created_at),
  'updated_by',case when last_event.created_at>=greatest(l.updated_at,p.updated_at) then last_event.actor_name end),
 'staff',(select jsonb_build_object('id',id,'display_name',display_name,'staff_code',staff_code) from public.lead_hub_accounts where id=l.assigned_id),
 'files',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,customer_id,original_name,mime_type,byte_size,party,category,created_at from public.lead_hub_inbox_files where customer_id=_lead and state<>'uploading') x),'[]'::jsonb),
 'banks',coalesce((select jsonb_agg(to_jsonb(b) order by b.updated_at desc) from public.lead_hub_customer_banks b where b.lead_id=_lead),'[]'::jsonb),
 'checklist',coalesce((select jsonb_agg(to_jsonb(c)) from public.lead_hub_customer_checklist c where c.lead_id=_lead),'[]'::jsonb),
 'notes',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from (select id,actor_name,actor_code,details,created_at from public.lead_hub_customer_events where lead_id=_lead and event_type='note_added' order by created_at desc,id desc limit 100) n),'[]'::jsonb)) into result
 from public.lead_hub_customer_profiles p
 left join lateral (
  select e.created_at,e.actor_name from public.lead_hub_customer_events e where e.lead_id=l.id
  order by e.created_at desc,e.id desc limit 1
 ) last_event on true where p.lead_id=_lead;
 return result;
end;$$;

create or replace function public.lead_hub_customer_tracking(
 _actor uuid,_from date default null,_to date default null,_group text default 'day',
 _search text default '',_status text default '',_model text default null,_staff uuid default null,
 _variant text default null,_colour text default null,_bucket text default '',_offset integer default 0,
 _basis text default 'received',_bank text default '',_bank_status text default '',
 _bank_from date default null,_bank_to date default null,_follow text default ''
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.lead_hub_accounts where id=_actor and active) then raise exception using errcode='42501',message='Account unavailable'; end if;
 if _group not in ('day','week','month') or _bucket not in ('','lou','delivered','pending','trade_in')
  or _offset<0 or _offset>1000000000 or (_from is not null and _to is not null and _from>_to)
 then raise exception 'Invalid dashboard filters'; end if;
 with actor as materialized (
  select id,role from public.lead_hub_accounts where id=_actor and active
 ), scoped as materialized (
  select l.id,l.customer_name,l.phone_e164,coalesce(trim(l.model),'') as model,l.source,l.assigned_id,l.follow_up_at,l.created_at,
   greatest(l.updated_at,p.updated_at,last_event.created_at) as updated_at,
   p.lead_received_at,p.delivered_at,case when last_event.created_at>=greatest(l.updated_at,p.updated_at) then last_event.actor_name end as updated_by,
   case when (p.follow_up_due_at at time zone 'Asia/Kuala_Lumpur')::date=l.follow_up_at then p.follow_up_due_at end as follow_up_due_at,p.sales_status,p.variant,p.colour,p.next_action,p.lou_received,p.trade_in,
   coalesce(lower(regexp_replace(trim(p.variant),'\s+',' ','g')),'') as variant_key,
   coalesce(lower(regexp_replace(trim(p.colour),'\s+',' ','g')),'') as colour_key,
   s.display_name as staff_name,s.staff_code,
   case when p.sales_status in ('on_hold','cancelled') then 'inactive'
    when p.sales_status='delivered' then 'delivered'
    when p.lou_received then 'lou' else 'pending' end as outcome
  from public.lead_hub_leads l join public.lead_hub_customer_profiles p on p.lead_id=l.id
   left join public.lead_hub_accounts s on s.id=l.assigned_id
   join actor a on a.role='admin' or l.assigned_id=a.id
   left join lateral (
    select e.actor_name,e.created_at from public.lead_hub_customer_events e where e.lead_id=l.id
    order by e.created_at desc,e.id desc limit 1
   ) last_event on true
 ), dated as (
  select *,case _basis when 'created' then created_at when 'updated' then updated_at
    when 'delivered' then delivered_at else coalesce(lead_received_at,created_at) end as filter_at
  from scoped
 ), banks as materialized (
  select b.* from public.lead_hub_customer_banks b join scoped s on s.id=b.lead_id
 ), reminders as materialized (
  select s.id,s.customer_name,s.staff_name,null::uuid as bank_id,null::text as bank_name,s.next_action,
   s.follow_up_at as due_date,s.follow_up_due_at as due_at,
   coalesce(s.follow_up_due_at,((s.follow_up_at+1)::timestamp at time zone 'Asia/Kuala_Lumpur')) as sort_at
  from scoped s where s.follow_up_at is not null
  union all
  select s.id,s.customer_name,s.staff_name,b.id,b.bank_name,b.next_action,(b.follow_up_due_at at time zone 'Asia/Kuala_Lumpur')::date,
   b.follow_up_due_at,b.follow_up_due_at
  from banks b join scoped s on s.id=b.lead_id where b.follow_up_due_at is not null
 ), due as materialized (
  select *,case when sort_at<=now() then 'overdue' when due_date=(now() at time zone 'Asia/Kuala_Lumpur')::date then 'today' else 'upcoming' end as urgency
  from reminders
 ), base as materialized (
  select * from dated d where
   (_from is null or filter_at>=(_from::timestamp at time zone 'Asia/Kuala_Lumpur'))
   and (_to is null or filter_at<((_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur'))
   and (_status='' or sales_status=_status) and (_model is null or model=_model) and (_staff is null or assigned_id=_staff)
   and (_variant is null or variant_key=_variant) and (_colour is null or colour_key=_colour)
   and (_basis<>'delivered' or (d.delivered_at is not null and d.sales_status='delivered'))
   and (case when _bank_status='not_submitted' then not exists(select 1 from banks b where b.lead_id=d.id and (b.submitted_at is not null or b.status in ('submitted','review','documents','approved','rejected')) and (_bank='' or lower(trim(b.bank_name))=_bank))
    when _bank<>'' or _bank_status<>'' or _bank_from is not null or _bank_to is not null then exists(
      select 1 from banks b where b.lead_id=d.id and (_bank='' or lower(trim(b.bank_name))=_bank)
       and (_bank_status='' or b.status=_bank_status) and (_bank_from is null or b.submitted_at>=_bank_from) and (_bank_to is null or b.submitted_at<=_bank_to))
    else true end)
   and (case _follow
    when 'today' then exists(select 1 from due r where r.id=d.id and r.due_date=(now() at time zone 'Asia/Kuala_Lumpur')::date)
    when 'overdue' then exists(select 1 from due r where r.id=d.id and r.urgency='overdue')
    when 'no_action' then trim(d.next_action)=''
    when 'missing_vehicle' then d.model='' or d.variant_key='' or d.colour_key=''
    when 'mine' then d.assigned_id=_actor
    else true end)
   and (_search='' or strpos(lower(customer_name),lower(_search))>0 or strpos(phone_e164,case when length(regexp_replace(_search,'\D','','g'))>=3 then regexp_replace(_search,'\D','','g') else _search end)>0)
 ), filtered as materialized (
  select * from base where _bucket='' or (_bucket='trade_in' and trade_in) or outcome=_bucket
 ), page as (
  select f.id,f.customer_name,f.phone_e164,f.model,f.source,f.assigned_id,f.staff_name,f.staff_code,f.sales_status,f.variant,f.colour,f.next_action,f.follow_up_at,f.follow_up_due_at,f.created_at,f.updated_at,f.updated_by,
   (select count(*) from banks b where b.lead_id=f.id) as bank_count,
   (select count(*) from banks b where b.lead_id=f.id and b.status in ('submitted','review','documents')) as bank_processing,
   (select count(*) from banks b where b.lead_id=f.id and b.status='approved') as bank_approved,
   f.lou_received,f.trade_in,f.outcome,
   (select count(*) from public.lead_hub_inbox_files d where d.customer_id=f.id and d.state<>'uploading') as doc_count
  from filtered f order by f.updated_at desc,f.id offset _offset limit 50
 ), vehicle_groups as (
  select model,variant_key as variant,coalesce(nullif(model,''),'Model belum dipilih')||' · '||coalesce(nullif(initcap(variant_key),''),'Varian belum diisi') as label,count(*) as value from filtered group by model,variant_key
 ), colour_groups as (
  select colour_key as key,coalesce(nullif(initcap(colour_key),''),'Belum diisi') as label,count(*) as value from filtered group by colour_key
 ), status_groups as (
  select sales_status as label,count(*) as value from filtered group by sales_status
 ), trend_groups as (
  select date_trunc(_group,filter_at at time zone 'Asia/Kuala_Lumpur')::date as bucket,count(*) as total,
   count(*) filter(where outcome='lou') as lou,count(*) filter(where outcome='delivered') as delivered,
   count(*) filter(where outcome='pending') as pending,count(*) filter(where trade_in) as trade_in
  from filtered where filter_at is not null group by 1
 ), counts as (
  select count(*) as total,count(*) filter(where outcome='lou') as lou,count(*) filter(where outcome='delivered') as delivered,
   count(*) filter(where outcome='pending') as pending,count(*) filter(where trade_in) as trade_in,
   count(*) filter(where sales_status='on_hold') as on_hold,count(*) filter(where sales_status='cancelled') as cancelled from base
 )
 select jsonb_build_object(
  'total',(select count(*) from filtered),
  'customers',coalesce((select jsonb_agg(to_jsonb(p) order by p.updated_at desc,p.id) from page p),'[]'::jsonb),
  'next_offset',case when _offset+50<(select count(*) from filtered) then _offset+50 else null end,
  'insights',jsonb_build_object(
   'stats',(select to_jsonb(c) from counts c),'total',(select count(*) from filtered),
   'vehicles',coalesce((select jsonb_agg(to_jsonb(v) order by v.value desc,v.label) from vehicle_groups v),'[]'::jsonb),
   'colours',coalesce((select jsonb_agg(to_jsonb(c) order by c.value desc,c.label) from colour_groups c),'[]'::jsonb),
   'statuses',coalesce((select jsonb_agg(to_jsonb(s) order by s.value desc,s.label) from status_groups s),'[]'::jsonb),
   'trend',coalesce((select jsonb_agg(to_jsonb(t) order by t.bucket) from trend_groups t),'[]'::jsonb),
   'generated_at',now(),'basis',_basis,'timezone','Asia/Kuala_Lumpur'),
  'reminders',jsonb_build_object(
   'overdue',(select count(*) from due where urgency='overdue'),
   'today',(select count(*) from due where due_date=(now() at time zone 'Asia/Kuala_Lumpur')::date),
   'items',coalesce((select jsonb_agg(to_jsonb(r) order by r.sort_at,r.id,r.bank_id) from
    (select * from due where urgency in ('overdue','today') order by sort_at,id,bank_id limit 50) r),'[]'::jsonb)),
  'options',jsonb_build_object(
   'banks',coalesce((select jsonb_agg(jsonb_build_object('value',k,'label',label) order by k)
    from (select lower(trim(bank_name)) k,min(bank_name) label from banks group by 1) names),'[]'::jsonb),
   'models',coalesce((select jsonb_agg(jsonb_build_object('model',m.model) order by m.model) from (select distinct model from scoped) m),'[]'::jsonb),
   'variants',coalesce((select jsonb_agg(jsonb_build_object('value',v.variant_key,'label',coalesce(nullif(initcap(v.variant_key),''),'Varian belum diisi')) order by v.variant_key) from (select distinct variant_key from scoped where _model is null or model=_model) v),'[]'::jsonb),
   'colours',coalesce((select jsonb_agg(jsonb_build_object('value',c.colour_key,'label',coalesce(nullif(initcap(c.colour_key),''),'Belum diisi')) order by c.colour_key) from (select distinct colour_key from scoped) c),'[]'::jsonb),
   'staff',case when exists(select 1 from public.lead_hub_accounts where id=_actor and active and role='admin')
    then coalesce((select jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'staff_code',staff_code) order by display_name) from public.lead_hub_accounts where active),'[]'::jsonb) else '[]'::jsonb end
  )
 ) into result;
 return result;
end;$$;
revoke all on function public.lead_hub_customer_tracking(uuid,date,date,text,text,text,text,uuid,text,text,text,integer,text,text,text,date,date,text) from public,anon,authenticated;
grant execute on function public.lead_hub_customer_tracking(uuid,date,date,text,text,text,text,uuid,text,text,text,integer,text,text,text,date,date,text) to service_role;

