begin;
do $$
declare actor uuid; fixture uuid; marker text:='insights-test-'||gen_random_uuid(); j jsonb; p public.lead_hub_customer_profiles%rowtype; l public.lead_hub_leads%rowtype; payload jsonb;
begin
 select id into actor from public.lead_hub_accounts where active and role='admin' limit 1;
 if actor is null then raise exception 'Test needs an active admin'; end if;
 for i in 1..6 loop
  insert into public.lead_hub_leads(customer_name,phone_e164,assigned_id,created_at)
  values(marker||'-'||i,'601'||lpad(floor(random()*1000000000)::text,9,'0'),actor,case when i=6 then '2026-10-29T15:59:59Z'::timestamptz else '2026-10-29T16:00:00Z'::timestamptz end) returning id into fixture;
  update public.lead_hub_customer_profiles set sales_status=case i when 2 then 'approved' when 4 then 'on_hold' when 5 then 'cancelled' else 'new' end,
   booking_status=case when i>=3 and i<=5 then 'paid' else 'none' end,colour=case when i=1 then 'WHITE' when i=2 then ' white ' when i=3 then 'BLACK' else '' end where lead_id=fixture;
 end loop;
 j:=public.lead_hub_customer_insights(actor,'2026-10-30','2026-10-30','day',marker);
 if (j->>'total')::int<>5 or (j->>'confirm')::int<>2 or (j->>'pending')::int<>1 or (j->>'on_hold')::int<>1 or (j->>'cancelled')::int<>1 then raise exception 'Outcome or Malaysia date boundary failed'; end if;
 if (j->>'coloured')::int<>3 or (j->>'missing_colour')::int<>2 then raise exception 'Colour coverage failed'; end if;
 if not exists(select 1 from jsonb_array_elements(j->'colours') x where x->>'label'='White' and (x->>'value')::int=2) then raise exception 'Colour case grouping failed'; end if;
 if public.lead_hub_customer_insights(actor,'2026-10-30','2026-10-30','week',marker)->'trend'->0->>'bucket'<>'2026-10-26' then raise exception 'Monday week failed'; end if;
 select * into l from public.lead_hub_leads where customer_name=marker||'-1';select * into p from public.lead_hub_customer_profiles where lead_id=l.id;
 payload:=to_jsonb(p)||jsonb_build_object('customer_name',l.customer_name,'model',l.model,'expected_revision',p.revision,'expected_lead_updated_at',l.updated_at,'colour','Snow White');
 perform public.lead_hub_customer_write(actor,l.id,'save_profile',payload,gen_random_uuid());
 if (select colour from public.lead_hub_customer_profiles where lead_id=l.id)<>'Snow White' then raise exception 'Colour save failed'; end if;
 if not exists(select 1 from public.lead_hub_customer_events where lead_id=l.id and details->'after'->>'colour'='Snow White') then raise exception 'Colour audit failed'; end if;
 select * into l from public.lead_hub_leads where id=l.id;select * into p from public.lead_hub_customer_profiles where lead_id=l.id;
 payload:=(payload-'colour')||jsonb_build_object('expected_revision',p.revision,'expected_lead_updated_at',l.updated_at);
 perform public.lead_hub_customer_write(actor,l.id,'save_profile',payload,gen_random_uuid());
 if (select colour from public.lead_hub_customer_profiles where lead_id=l.id)<>'Snow White' then raise exception 'Older client erased colour'; end if;
end $$;
rollback;
select 'PASS fixture totals, timezone cutoffs, colour grouping, weekly grouping, colour save/audit and older-client compatibility; all fixtures rolled back' as result;
