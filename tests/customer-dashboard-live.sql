begin;
do $$
declare admin_id uuid; actor uuid; fixture uuid; marker text:='drill-test-'||gen_random_uuid(); vehicle text; j jsonb; k jsonb; p public.lead_hub_customer_profiles%rowtype; l public.lead_hub_leads%rowtype; payload jsonb;
begin
 select id into admin_id from public.lead_hub_accounts where active and role='admin' limit 1;
 select id into actor from public.lead_hub_accounts where active and role='staff' limit 1;
 actor:=coalesce(actor,admin_id);if actor is null then raise exception 'Test needs active account'; end if;
 vehicle:='e.MAS Test '||marker;
 for i in 1..60 loop
  insert into public.lead_hub_leads(customer_name,phone_e164,model,assigned_id,created_at)
  values(marker||'-'||i,'601'||lpad(floor(random()*1000000000)::text,9,'0'),case when i=5 then 'Other '||marker else vehicle end,actor,case when i=6 then '2026-10-29T15:59:59Z'::timestamptz else '2026-10-29T16:00:00Z'::timestamptz end) returning id into fixture;
  update public.lead_hub_customer_profiles set sales_status=case i when 2 then 'delivered' when 4 then 'on_hold' when 5 then 'cancelled' when 6 then 'approved' else 'new' end,
   lou_received=i in (1,2,4,5),trade_in=i in (1,2),variant=case when i=6 then 'Prime' when i=1 then ' PREMIUM ' else 'premium' end,
   colour=case when i=1 then 'WHITE' when i=2 then ' white ' when i in (4,5) then '' else 'Black' end where lead_id=fixture;
 end loop;
 j:=public.lead_hub_customer_dashboard(actor,'2026-10-30','2026-10-30','day',marker);
 if (j->>'total')::int<>59 or (j->'insights'->'stats'->>'lou')::int<>1 or (j->'insights'->'stats'->>'delivered')::int<>1 or (j->'insights'->'stats'->>'pending')::int<>55 or (j->'insights'->'stats'->>'trade_in')::int<>2 then raise exception 'LOU/Deliver/Pending/Trade In definitions or timezone failed: %',j->'insights'->'stats'; end if;
 if jsonb_array_length(j->'customers')<>50 or (j->>'next_offset')::int<>50 then raise exception 'First page failed'; end if;
 if (select sum((x->>'value')::int) from jsonb_array_elements(j->'insights'->'vehicles') x)<>59 then raise exception 'Vehicle totals truncated'; end if;
 j:=public.lead_hub_customer_dashboard(actor,'2026-10-30','2026-10-30','day',marker,'',vehicle,null,'premium','white');
 if (j->>'total')::int<>2 or exists(select 1 from jsonb_array_elements(j->'customers') x where lower(trim(x->>'colour'))<>'white') then raise exception 'Model / variant / colour chain failed'; end if;
 k:=public.lead_hub_customer_dashboard(actor,'2026-10-30','2026-10-30','day',marker,'',vehicle,null,'premium','white','lou');
 if (k->>'total')::int<>(k->'insights'->'stats'->>'lou')::int or (k->>'total')::int<>1 then raise exception 'LOU card and list mismatch'; end if;
 k:=public.lead_hub_customer_dashboard(actor,'2026-10-30','2026-10-30','day',marker,'',vehicle,null,'premium','white','delivered');
 if (k->>'total')::int<>1 then raise exception 'Deliver card failed'; end if;
 k:=public.lead_hub_customer_dashboard(actor,'2026-10-30','2026-10-30','day',marker,'',vehicle,null,'premium','white','trade_in');
 if (k->>'total')::int<>2 then raise exception 'Trade In overlap failed'; end if;
 j:=public.lead_hub_customer_dashboard(actor,'2026-10-30','2026-10-30','week',marker,'',vehicle,null,'premium','black','pending');
 k:=public.lead_hub_customer_dashboard(actor,'2026-10-30','2026-10-30','week',marker,'',vehicle,null,'premium','black','pending',50);
 if (j->>'total')::int<>55 or jsonb_array_length(k->'customers')<>5 or k->>'next_offset' is not null then raise exception 'Filtered pagination failed'; end if;
 if exists(select 1 from jsonb_array_elements(j->'customers') x join jsonb_array_elements(k->'customers') y on x->>'id'=y->>'id') then raise exception 'Duplicate page records'; end if;
 if j->'insights'->'trend'->0->>'bucket'<>'2026-10-26' then raise exception 'Monday week grouping failed'; end if;
 j:=public.lead_hub_customer_dashboard(actor,'2026-10-30','2026-10-30','month',marker,'on_hold',vehicle,null,'premium','');
 if (j->>'total')::int<>1 or j->'insights'->'trend'->0->>'bucket'<>'2026-10-01' then raise exception 'Missing colour / exact status / month failed'; end if;
 j:=public.lead_hub_customer_dashboard(actor,null,null,'day',marker,'',vehicle,null,'prime',null,'pending');
 if (j->>'total')::int<>1 then raise exception 'Approved without LOU should remain Pending'; end if;
 if actor<>admin_id then
  j:=public.lead_hub_customer_dashboard(actor,null,null,'day',marker,'',null,admin_id);
  if (j->>'total')::int<>0 then raise exception 'Staff selector widened access'; end if;
 end if;
 begin
  perform public.lead_hub_customer_dashboard(gen_random_uuid());raise exception 'Inactive actor accepted';
 exception when insufficient_privilege then null; end;
 if has_function_privilege('anon','public.lead_hub_customer_dashboard(uuid,date,date,text,text,text,text,uuid,text,text,text,integer)','execute') or has_function_privilege('authenticated','public.lead_hub_customer_dashboard(uuid,date,date,text,text,text,text,uuid,text,text,text,integer)','execute') then raise exception 'Public RPC exposure'; end if;
 select * into l from public.lead_hub_leads where customer_name=marker||'-3';select * into p from public.lead_hub_customer_profiles where lead_id=l.id;
 payload:=to_jsonb(p)||jsonb_build_object('customer_name',l.customer_name,'model',l.model,'expected_revision',p.revision,'expected_lead_updated_at',l.updated_at,'lou_received',true,'trade_in',true);
 perform public.lead_hub_customer_write(actor,l.id,'save_profile',payload,gen_random_uuid());
 if not exists(select 1 from public.lead_hub_customer_events where lead_id=l.id and (details->'after'->>'lou_received')::boolean and (details->'after'->>'trade_in')::boolean) then raise exception 'Flag audit failed'; end if;
 select * into l from public.lead_hub_leads where id=l.id;select * into p from public.lead_hub_customer_profiles where lead_id=l.id;
 payload:=(payload-'lou_received'-'trade_in')||jsonb_build_object('expected_revision',p.revision,'expected_lead_updated_at',l.updated_at);
 perform public.lead_hub_customer_write(actor,l.id,'save_profile',payload,gen_random_uuid());
 if not exists(select 1 from public.lead_hub_customer_profiles where lead_id=l.id and lou_received and trade_in) then raise exception 'Old client erased flags'; end if;
end $$;
rollback;
select 'PASS counts and drill-down chain, 50+ pagination, timezone, missing fields, status, account scope, grants, audit and old-client compatibility; all fixtures rolled back' as result;
