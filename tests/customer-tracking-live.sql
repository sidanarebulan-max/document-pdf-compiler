begin;
do $$
declare
 actor uuid;
 fixture uuid;
 bank_a uuid;
 bank_b uuid;
 operation uuid:=gen_random_uuid();
 marker text:='tracking-test-'||gen_random_uuid();
 target_date date:=(now() at time zone 'Asia/Kuala_Lumpur')::date;
 snapshot jsonb;
 payload jsonb;
begin
 select id into actor from public.lead_hub_accounts where active order by (role='staff') desc limit 1;
 if actor is null then raise exception 'Test requires an active staff account'; end if;
 insert into public.lead_hub_leads(customer_name,phone_e164,model,assigned_id,created_at)
 values(marker,'601'||lpad(floor(random()*1000000000)::text,9,'0'),'e.MAS 7 PHEV',actor,now()-interval '3 days')
 returning id into fixture;

 payload:=jsonb_build_object('bank_name','Maybank','status','review','submitted_at',target_date,
  'submitted_time','09:45','amount',100000,'notes','','next_action','Semak keputusan',
  'selected',true,'follow_up_due_at',now()-interval '2 hours');
 perform public.lead_hub_customer_write(actor,fixture,'save_bank',payload,operation);
 perform public.lead_hub_customer_write(actor,fixture,'save_bank',payload,operation);
 perform public.lead_hub_customer_write(actor,fixture,'save_bank',
  jsonb_build_object('bank_name','CIMB','status','approved','submitted_at',target_date,'notes','','selected',true),gen_random_uuid());
 select id into bank_a from public.lead_hub_customer_banks where lead_id=fixture and bank_name='Maybank';
 select id into bank_b from public.lead_hub_customer_banks where lead_id=fixture and bank_name='CIMB';
 snapshot:=public.lead_hub_customer_get(actor,fixture);
 if jsonb_array_length(snapshot->'banks')<>2 or not exists(
  select 1 from public.lead_hub_customer_banks where id=bank_b and selected
 ) then raise exception 'Bank multiplicity, idempotency or selection failed'; end if;
 if not exists(select 1 from public.lead_hub_customer_banks where id=bank_a and submitted_time='09:45') then
  raise exception 'Bank submit time was not saved';
 end if;

 snapshot:=public.lead_hub_customer_tracking(actor,_search=>marker,_bank=>'maybank',_bank_status=>'review',
  _bank_from=>target_date,_bank_to=>target_date,_follow=>'overdue');
 if (snapshot->>'total')::integer<>1 or (snapshot->'customers'->0->>'bank_count')::integer<>2 then
  raise exception 'Combined bank/date/reminder filter or bank summary failed';
 end if;
 snapshot:=public.lead_hub_customer_tracking(actor,_search=>marker,_bank=>'maybank',_bank_status=>'approved');
 if (snapshot->>'total')::integer<>0 then raise exception 'Status matched a different bank'; end if;
 begin
  perform public.lead_hub_customer_write(actor,fixture,'complete_follow_up',
   jsonb_build_object('id',bank_a,'expected_updated_at',now()-interval '1 day'),gen_random_uuid());
  raise exception 'Bank conflict was accepted';
 exception when others then
  if sqlerrm<>'PROFILE_CONFLICT' then raise; end if;
 end;
 perform public.lead_hub_customer_write(actor,fixture,'complete_follow_up',
  jsonb_build_object('id',bank_a,'expected_updated_at',(select updated_at from public.lead_hub_customer_banks where id=bank_a),'note','Selesai semak'),gen_random_uuid());
 if exists(select 1 from public.lead_hub_customer_banks where id=bank_a and follow_up_due_at is not null) or not exists(
  select 1 from public.lead_hub_customer_events where lead_id=fixture and event_type='follow_up_completed' and details->>'bank'='Maybank'
 ) then raise exception 'Bank reminder completion or history failed'; end if;

 select to_jsonb(p)||jsonb_build_object('customer_name',l.customer_name,'model',l.model,'sales_status','delivered',
  'colour','Emerald Green','variant','Premium','expected_revision',p.revision,'expected_lead_updated_at',l.updated_at,
  'lead_received_at',now()-interval '4 days','delivered_at',now()-interval '2 days',
  'follow_up_at',target_date,'follow_up_due_at',target_date::timestamp at time zone 'Asia/Kuala_Lumpur','next_action','Semak serahan')
 into payload from public.lead_hub_customer_profiles p join public.lead_hub_leads l on l.id=p.lead_id where l.id=fixture;
 perform public.lead_hub_customer_write(actor,fixture,'save_profile',payload,gen_random_uuid());
 snapshot:=public.lead_hub_customer_tracking(actor,_search=>marker,_basis=>'delivered',_model=>'e.MAS 7 PHEV',_variant=>'premium',
  _colour=>'emerald green',_from=>target_date-2,_to=>target_date-2,_follow=>'today');
 if (snapshot->>'total')::integer<>1 then raise exception 'Delivery, vehicle and customer reminder filters failed'; end if;
 snapshot:=public.lead_hub_customer_tracking(actor,_search=>marker,_basis=>'created',_from=>target_date-2,_to=>target_date-2);
 if (snapshot->>'total')::integer<>0 then raise exception 'Record creation confused with delivery'; end if;
 if not exists(select 1 from public.lead_hub_customer_events where lead_id=fixture and event_type='profile_updated' and details->'after'->>'delivered_at' is not null)
 then raise exception 'Delivery audit failed'; end if;

 begin
  perform public.lead_hub_customer_tracking(gen_random_uuid());
  raise exception 'Unknown actor accepted';
 exception when insufficient_privilege then null; end;
 if exists(select 1 from pg_proc where proname='lead_hub_customer_tracking' and
  (has_function_privilege('anon',oid,'execute') or has_function_privilege('authenticated',oid,'execute')))
 then raise exception 'Tracking function has public access'; end if;
end $$;
rollback;
select 'PASS multi-bank, selected bank, submit time, reminder conflict/completion, history, access, vehicle and actual delivery date filters' as result;
