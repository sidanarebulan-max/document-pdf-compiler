-- Add the optional colour field; preserve existing profile, audit and access rules.
alter table public.lead_hub_customer_profiles add column if not exists colour text not null default '' check(char_length(colour)<=80);

CREATE OR REPLACE FUNCTION public.lead_hub_customer_write(_actor uuid, _lead uuid, _action text, _data jsonb, _operation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  update public.lead_hub_customer_profiles set sales_status=_data->>'sales_status',variant=coalesce(_data->>'variant',''),colour=case when _data ? 'colour' then regexp_replace(trim(coalesce(_data->>'colour','')), '\s+', ' ', 'g') else colour end,next_action=coalesce(_data->>'next_action',''),closure_reason=coalesce(_data->>'closure_reason',''),guarantor_required=coalesce((_data->>'guarantor_required')::boolean,false),booking_status=_data->>'booking_status',
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
end;$function$
;


-- Aggregated insights only. The authenticated account is supplied by the Edge Function.
create or replace function public.lead_hub_customer_insights(
 _actor uuid,_from date default null,_to date default null,_group text default 'day',
 _search text default '',_status text default '',_model text default '',_staff uuid default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.lead_hub_accounts where id=_actor and active) then raise exception using errcode='42501',message='Account unavailable'; end if;
 if _group not in ('day','week','month') or (_from is not null and _to is not null and _from>_to) then raise exception 'Invalid insights filters'; end if;
 with visible as (
  select l.created_at,p.sales_status,p.booking_status,nullif(initcap(lower(regexp_replace(trim(p.colour),'\s+',' ','g'))),'') as colour,
   coalesce(nullif(trim(l.model),''),'Belum dipilih') as model,
   case when p.sales_status in ('on_hold','cancelled') then 'inactive'
    when p.booking_status='paid' or p.sales_status in ('approved','delivery','delivered') then 'confirm' else 'pending' end as outcome
  from public.lead_hub_leads l join public.lead_hub_customer_profiles p on p.lead_id=l.id
  where exists(select 1 from public.lead_hub_accounts a where a.id=_actor and a.active and (a.role='admin' or l.assigned_id=_actor))
   and (_from is null or l.created_at>=(_from::timestamp at time zone 'Asia/Kuala_Lumpur'))
   and (_to is null or l.created_at<((_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur'))
   and (_status='' or p.sales_status=_status) and (_model='' or l.model=_model)
   and (_staff is null or l.assigned_id=_staff)
   and (_search='' or strpos(lower(l.customer_name),lower(_search))>0 or strpos(l.phone_e164,_search)>0)
 ), colour_groups as (
  select coalesce(colour,'Belum diisi') as label,count(*) as value from visible group by 1
 ), status_groups as (
  select sales_status as label,count(*) as value from visible group by 1
 ), model_groups as (
  select model as label,count(*) as value from visible group by 1
 ), trend_groups as (
  select date_trunc(_group,created_at at time zone 'Asia/Kuala_Lumpur')::date as bucket,
   count(*) as total,count(*) filter(where outcome='confirm') as confirm,count(*) filter(where outcome='pending') as pending
  from visible group by 1
 ) select jsonb_build_object(
  'total',count(*),'confirm',count(*) filter(where outcome='confirm'),'pending',count(*) filter(where outcome='pending'),
  'on_hold',count(*) filter(where sales_status='on_hold'),'cancelled',count(*) filter(where sales_status='cancelled'),
  'coloured',count(*) filter(where colour is not null),'missing_colour',count(*) filter(where colour is null),
  'colours',coalesce((select jsonb_agg(to_jsonb(c) order by c.value desc,c.label) from colour_groups c),'[]'::jsonb),
  'statuses',coalesce((select jsonb_agg(to_jsonb(s) order by s.value desc,s.label) from status_groups s),'[]'::jsonb),
  'models',coalesce((select jsonb_agg(to_jsonb(m) order by m.value desc,m.label) from model_groups m),'[]'::jsonb),
  'trend',coalesce((select jsonb_agg(to_jsonb(t) order by t.bucket) from trend_groups t),'[]'::jsonb),
  'basis','created_at','timezone','Asia/Kuala_Lumpur','group',_group,'from',_from,'to',_to,'generated_at',now()
 ) into result from visible;
 return result;
end;$$;
revoke all on function public.lead_hub_customer_insights(uuid,date,date,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.lead_hub_customer_insights(uuid,date,date,text,text,text,text,uuid) to service_role;
