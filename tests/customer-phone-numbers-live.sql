begin;
set local role service_role;
do $$
declare
 actor uuid;
 other_staff uuid;
 customer uuid;
 other_customer uuid;
 document uuid;
 old_phone text:='6019'||lpad(floor(random()*100000000)::text,8,'0');
 new_phone text:='6018'||lpad(floor(random()*100000000)::text,8,'0');
 extra_phone text:='6017'||lpad(floor(random()*100000000)::text,8,'0');
 other_phone text:='6016'||lpad(floor(random()*100000000)::text,8,'0');
 result jsonb;
begin
 select id into actor from public.lead_hub_accounts where active and role='staff' limit 1;
 insert into public.lead_hub_accounts(staff_code,display_name,role,pass_salt,pass_hash) values('QAPH'||substr(gen_random_uuid()::text,1,8),'QA phone rollback','staff',repeat('a',32),repeat('a',64)) returning id into other_staff;
 assert actor is not null and other_staff is not null;
 insert into public.lead_hub_leads(customer_name,phone_e164,assigned_id,consent_confirmed) values('QA phone rollback',old_phone,actor,true) returning id into customer;
 insert into public.lead_hub_leads(customer_name,phone_e164,assigned_id) values('QA phone rollback 2',other_phone,other_staff) returning id into other_customer;
 result:=public.lead_hub_customer_write_phones(actor,customer,new_phone,array[old_phone,extra_phone],old_phone,array[]::text[],false);
 assert result->'lead'->>'phone_e164'=new_phone and result->'lead'->>'consent_confirmed'='false';
 assert result->'additional_phones' @> to_jsonb(array[old_phone,extra_phone]);
 assert public.lead_hub_customer_share(actor,null,extra_phone,null,null)->'lead'->>'id'=customer::text;
 assert public.lead_hub_customer_phone_owner(actor,old_phone)=customer;
 assert public.lead_hub_customer_phone_owner(other_staff,old_phone) is null;
 insert into public.lead_hub_inbox_files(owner_id,uploaded_by,storage_path,original_name,mime_type,byte_size,sha256,source,state)
 values(actor,actor,'qa/'||gen_random_uuid()||'.pdf','QA phone document.pdf','application/pdf',30,repeat('a',64),'web_upload','inbox')
 returning id into document;
 assert public.lead_hub_customer_phone_link(actor,extra_phone,
  jsonb_build_object('ids',jsonb_build_array(document),'party','HIRER','category','OTHER'),gen_random_uuid())=customer;
 assert (select count(*) from public.lead_hub_customer_list(actor,'+'||extra_phone) where id=customer)=1;
 assert (public.lead_hub_customer_tracking(actor,_search=>'+'||extra_phone)->'customers'->0->>'id')=customer::text;
 assert (public.lead_hub_customer_dashboard(actor,_search=>extra_phone)->'customers'->0->>'id')=customer::text;
 insert into public.lead_hub_leads(customer_name,phone_e164,assigned_id) values('QA duplicate check',extra_phone,actor) on conflict (phone_e164) do nothing;
 assert not found;
 assert exists(select 1 from public.lead_hub_customer_events where lead_id=customer and event_type='phone_numbers_updated');
 begin
  perform public.lead_hub_customer_write_phones(actor,customer,other_phone,array[]::text[],new_phone,array[extra_phone,old_phone],true);
  raise exception 'Expected duplicate rejection';
 exception when unique_violation then assert sqlerrm='CUSTOMER_PHONE_IN_USE'; end;
 begin
  perform public.lead_hub_customer_write_phones(other_staff,customer,new_phone,array[]::text[],new_phone,array[extra_phone,old_phone],false);
  raise exception 'Expected permission rejection';
 exception when insufficient_privilege then null; end;
 begin
  perform public.lead_hub_customer_write_phones(actor,customer,new_phone,array[]::text[],old_phone,array[]::text[],false);
  raise exception 'Expected stale edit rejection';
 exception when raise_exception then assert sqlerrm='PHONE_CONFLICT'; end;
 result:=public.lead_hub_customer_write_phones(actor,customer,extra_phone,array[new_phone],new_phone,array[extra_phone,old_phone],true);
 assert result->'lead'->>'phone_e164'=extra_phone and result->'lead'->>'consent_confirmed'='true';
 assert result->'additional_phones'=to_jsonb(array[new_phone]);
 assert exists(select 1 from public.lead_hub_inbox_files where id=document and customer_id=customer and customer_phone=extra_phone);
 assert public.lead_hub_customer_phone_owner(actor,old_phone) is null;
 assert not has_table_privilege('anon','public.lead_hub_customer_phones','SELECT');
end $$;
rollback;
select 'PASS phone migration, duplicate isolation, search, promotion, audit and permissions' as verification;
