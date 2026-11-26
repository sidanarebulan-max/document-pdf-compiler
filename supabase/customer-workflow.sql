alter table public.lead_hub_customer_profiles
 add column if not exists shared_fields jsonb not null default '{}'::jsonb;

create or replace function public.lead_hub_customer_share(
 _actor uuid, _lead uuid, _phone text, _changes jsonb, _previous jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 a public.lead_hub_accounts%rowtype;
 l public.lead_hub_leads%rowtype;
 p public.lead_hub_customer_profiles%rowtype;
 common_keys text[]:=array['customer_name','model','variant','colour','selling_price','deposit','loan_amount'];
 live_values jsonb;
 field text;
begin
 select * into a from public.lead_hub_accounts where id=_actor and active for share;
 if not found then raise exception using errcode='42501',message='Account unavailable'; end if;
 select * into l from public.lead_hub_leads
 where (case when _lead is not null then id=_lead else phone_e164=_phone end)
  and (a.role='admin' or assigned_id=a.id) for update;
 if not found then raise exception using errcode='42501',message='Customer access denied'; end if;
 select * into strict p from public.lead_hub_customer_profiles where lead_id=l.id for update;
 live_values:=p.shared_fields||jsonb_build_object(
  'customer_name',l.customer_name,'model',l.model,'variant',p.variant,'colour',p.colour,
  'selling_price',p.selling_price,'deposit',p.deposit,'loan_amount',p.loan_amount
 );
 if _changes is not null and _changes<>'{}'::jsonb then
  for field in select jsonb_object_keys(_changes) loop
   if (_previous->field) is distinct from coalesce(live_values->field,'null'::jsonb)
      and (_changes->field) is distinct from coalesce(live_values->field,'null'::jsonb) then
    raise exception using errcode='P0001',message='PROFILE_CONFLICT';
   end if;
  end loop;
  update public.lead_hub_customer_profiles
  set variant=case when _changes ? 'variant' then _changes->>'variant' else variant end,
      colour=case when _changes ? 'colour' then _changes->>'colour' else colour end,
      selling_price=case when _changes ? 'selling_price' then (_changes->>'selling_price')::numeric else selling_price end,
      deposit=case when _changes ? 'deposit' then (_changes->>'deposit')::numeric else deposit end,
      loan_amount=case when _changes ? 'loan_amount' then (_changes->>'loan_amount')::numeric else loan_amount end,
      shared_fields=shared_fields||(_changes-common_keys),
      revision=revision+1, updated_at=clock_timestamp()
  where lead_id=l.id returning * into p;
  if _changes ?| array['customer_name','model'] then
   update public.lead_hub_leads set customer_name=coalesce(_changes->>'customer_name',customer_name),
     model=coalesce(_changes->>'model',model),updated_at=clock_timestamp() where id=l.id returning * into l;
  end if;
  if _changes ? 'customer_name' then
   update public.lead_hub_inbox_files set customer_name=l.customer_name where customer_id=l.id;
  end if;
  insert into public.lead_hub_customer_events(lead_id,actor_id,actor_name,actor_code,event_type,details)
   values(l.id,a.id,a.display_name,a.staff_code,'shared_fields_updated',
    jsonb_build_object('fields',(select jsonb_agg(key) from jsonb_object_keys(_changes) key)));
 end if;
 return public.lead_hub_customer_get(a.id,l.id);
end;$$;
revoke all on function public.lead_hub_customer_share(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.lead_hub_customer_share(uuid,uuid,text,jsonb,jsonb) to service_role;

alter table public.lead_hub_inbox_files drop constraint if exists lead_hub_inbox_files_party_check;
alter table public.lead_hub_inbox_files add constraint lead_hub_inbox_files_party_check
 check (party in ('HIRER','GUARANTOR','REBATE','TRADEIN'));
alter table public.lead_hub_inbox_files drop constraint if exists lead_hub_inbox_files_category_check;
alter table public.lead_hub_inbox_files add constraint lead_hub_inbox_files_category_check
 check (category in ('AUTO','VSO','IC','LESEN','PAYSLIP','BANK','OTHER','IC_FRONT','IC_BACK','SURAT_KERJA',
 'SIJIL_LAHIR','SIJIL_NIKAH','EAUTO','GERAN'));

create or replace function public.lead_hub_customer_finish_upload(
 _actor uuid, _lead uuid, _file uuid, _party text, _category text
) returns uuid language plpgsql security invoker set search_path='' as $$
declare
 a public.lead_hub_accounts%rowtype;
 l public.lead_hub_leads%rowtype;
 f public.lead_hub_inbox_files%rowtype;
 existing uuid;
begin
 select * into a from public.lead_hub_accounts where id=_actor and active for share;
 if not found then raise exception using errcode='42501',message='Account unavailable'; end if;
 select * into l from public.lead_hub_leads where id=_lead and (a.role='admin' or assigned_id=a.id) for update;
 if not found then raise exception using errcode='42501',message='Customer access denied'; end if;
 select * into f from public.lead_hub_inbox_files
  where id=_file and uploaded_by=_actor and state='uploading' for update;
 if not found then raise exception using errcode='42501',message='File unavailable'; end if;
 select id into existing from public.lead_hub_inbox_files
  where customer_id=_lead and sha256=f.sha256 and party=_party and category=_category and state='assigned' order by created_at limit 1;
 if existing is not null then return existing; end if;
 if _party not in ('HIRER','GUARANTOR','REBATE','TRADEIN') or
  (_party in ('HIRER','GUARANTOR') and _category not in ('AUTO','VSO','IC','LESEN','PAYSLIP','BANK','OTHER')) or
  (_party='TRADEIN' and _category not in ('AUTO','IC','LESEN','EAUTO','GERAN','SIJIL_LAHIR','SIJIL_NIKAH','OTHER')) or
  (_party='REBATE' and _category not in ('AUTO','IC_FRONT','IC_BACK','LESEN','SURAT_KERJA','SIJIL_LAHIR','SIJIL_NIKAH','OTHER'))
 then raise exception 'Invalid category'; end if;
 update public.lead_hub_inbox_files set customer_id=l.id,customer_name=l.customer_name,
  customer_phone=l.phone_e164,owner_id=coalesce(l.assigned_id,a.id),state='assigned',
  party=_party,category=_category,updated_at=clock_timestamp() where id=f.id;
 insert into public.lead_hub_customer_events(lead_id,actor_id,actor_name,actor_code,event_type,details)
 values(l.id,a.id,a.display_name,a.staff_code,'documents_linked',
  jsonb_build_object('files',jsonb_build_array(jsonb_build_object('id',f.id,'name',f.original_name)),
   'party',_party,'category',_category));
 return f.id;
end;$$;
revoke all on function public.lead_hub_customer_finish_upload(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.lead_hub_customer_finish_upload(uuid,uuid,uuid,text,text) to service_role;
