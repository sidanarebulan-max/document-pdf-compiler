create table public.lead_hub_customer_phones (
 phone_e164 text primary key check (phone_e164 ~ '^601[0-9]{8,9}$'),
 lead_id uuid not null references public.lead_hub_leads(id) on delete cascade
);
create index lead_hub_customer_phones_lead_idx on public.lead_hub_customer_phones(lead_id);
alter table public.lead_hub_customer_phones enable row level security;
revoke all on public.lead_hub_customer_phones from public,anon,authenticated;
grant select,insert,delete on public.lead_hub_customer_phones to service_role;

-- Protect both primary and additional numbers across all existing lead entry points.
create function public.lead_hub_skip_duplicate_phone_alias() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.lead_hub_customer_phones p join public.lead_hub_leads l on l.id=p.lead_id
  where p.phone_e164=new.phone_e164 and l.phone_e164<>p.phone_e164) then
  return null;
 end if;
 return new;
end;$$;

create function public.lead_hub_register_primary_phone() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 insert into public.lead_hub_customer_phones(phone_e164,lead_id) values(new.phone_e164,new.id)
 on conflict (phone_e164) do nothing;
 if not found and not exists(select 1 from public.lead_hub_customer_phones where phone_e164=new.phone_e164 and lead_id=new.id) then
  raise exception using errcode='23505',message='CUSTOMER_PHONE_IN_USE';
 end if;
 return new;
end;$$;

lock table public.lead_hub_leads in share row exclusive mode;
insert into public.lead_hub_customer_phones(phone_e164,lead_id)
select phone_e164,id from public.lead_hub_leads;

create trigger lead_hub_skip_phone_alias before insert on public.lead_hub_leads
for each row execute function public.lead_hub_skip_duplicate_phone_alias();
create trigger lead_hub_register_primary_phone after insert or update of phone_e164 on public.lead_hub_leads
for each row execute function public.lead_hub_register_primary_phone();

create function public.lead_hub_customer_additional_phones(_lead uuid,_primary text) returns text[]
language sql stable security invoker set search_path='' as $$
 select array(select phone_e164 from public.lead_hub_customer_phones
  where lead_id=_lead and phone_e164<>_primary order by phone_e164);
$$;

create function public.lead_hub_customer_phone_matches(_lead uuid,_search text) returns boolean
language sql stable security invoker set search_path='' as $$
 select _search ~ '^\+?[0-9 ().-]+$' and length(regexp_replace(_search,'\D','','g'))>=3 and exists(
  select 1 from public.lead_hub_customer_phones
  where lead_id=_lead and strpos(phone_e164,regexp_replace(_search,'\D','','g'))>0
 );
$$;

create function public.lead_hub_customer_phone_owner(_actor uuid,_phone text) returns uuid
language sql stable security invoker set search_path='' as $$
 select l.id from public.lead_hub_customer_phones p join public.lead_hub_leads l on l.id=p.lead_id
 join public.lead_hub_accounts a on a.id=_actor and a.active and (a.role='admin' or l.assigned_id=a.id)
 where p.phone_e164=_phone;
$$;

create function public.lead_hub_customer_phone_link(_actor uuid,_phone text,_data jsonb,_operation uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare target uuid;
begin
 perform id from public.lead_hub_accounts where id=_actor and active for share;
 if not found then raise exception using errcode='42501',message='Account unavailable'; end if;
 select id into target from public.lead_hub_leads where id=(
  select lead_id from public.lead_hub_customer_phones where phone_e164=_phone
 ) for update;
 if not found then return null; end if;
 if not exists(select 1 from public.lead_hub_customer_phones where phone_e164=_phone and lead_id=target) then
  raise exception using errcode='40001',message='Customer phone changed';
 end if;
 perform public.lead_hub_customer_write(_actor,target,'link_files',_data,_operation);
 return target;
end;$$;

create function public.lead_hub_customer_write_phones(
 _actor uuid,_lead uuid,_primary text,_additional text[],_previous_primary text,_previous_additional text[],_consent boolean
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 actor public.lead_hub_accounts%rowtype;
 lead public.lead_hub_leads%rowtype;
 current_additional text[];
 requested text[];
 primary_changed boolean;
begin
 select * into actor from public.lead_hub_accounts where id=_actor and active for share;
 if not found then raise exception using errcode='42501',message='Account unavailable'; end if;
 select * into lead from public.lead_hub_leads where id=_lead and (actor.role='admin' or assigned_id=_actor) for update;
 if not found then raise exception using errcode='42501',message='Customer access denied'; end if;
 if _primary is null or _primary !~ '^601[0-9]{8,9}$' or _additional is null or cardinality(_additional)>5
  or _primary=any(_additional) or exists(select 1 from unnest(_additional) n where n is null or n !~ '^601[0-9]{8,9}$') then
  raise exception using errcode='22023',message='Invalid phone numbers';
 end if;
 _additional:=array(select distinct n from unnest(_additional) n order by n);
 current_additional:=public.lead_hub_customer_additional_phones(_lead,lead.phone_e164);
 primary_changed:=lead.phone_e164<>_primary;
 if not primary_changed and current_additional=_additional then
  return public.lead_hub_customer_get(_actor,_lead);
 end if;
 if lead.phone_e164 is distinct from _previous_primary or current_additional is distinct from _previous_additional then
  raise exception using errcode='P0001',message='PHONE_CONFLICT';
 end if;
 requested:=array_prepend(_primary,_additional);
 insert into public.lead_hub_customer_phones(phone_e164,lead_id)
 select n,_lead from unnest(requested) n order by n on conflict (phone_e164) do nothing;
 if (select count(*) from public.lead_hub_customer_phones where lead_id=_lead and phone_e164=any(requested))<>cardinality(requested) then
  raise exception using errcode='23505',message='CUSTOMER_PHONE_IN_USE';
 end if;
 update public.lead_hub_leads set phone_e164=_primary,updated_at=clock_timestamp(),
  consent_confirmed=case when primary_changed then coalesce(_consent,false) else consent_confirmed end,
  last_opened_at=case when primary_changed then null else last_opened_at end,
  pm_confirmed_at=case when primary_changed then null else pm_confirmed_at end,
  pm_confirmed_by=case when primary_changed then null else pm_confirmed_by end
 where id=_lead;
 delete from public.lead_hub_customer_phones where lead_id=_lead and phone_e164<>all(requested);
 if primary_changed then
  update public.lead_hub_inbox_files set customer_phone=_primary,updated_at=clock_timestamp() where customer_id=_lead;
 end if;
 insert into public.lead_hub_customer_events(lead_id,actor_id,actor_name,actor_code,event_type,details)
 values(_lead,_actor,actor.display_name,actor.staff_code,'phone_numbers_updated',jsonb_build_object(
  'primary_before',lead.phone_e164,'primary_after',_primary,'additional_before',current_additional,'additional_after',_additional));
 return public.lead_hub_customer_get(_actor,_lead);
end;$$;

create function public.lead_hub_customer_list(_actor uuid,_search text)
returns table(id uuid,customer_name text,phone_e164 text,model text,source text,assigned_id uuid,staff_name text,staff_code text,sales_status text,variant text,next_action text,follow_up_at date,created_at timestamptz,updated_at timestamptz,doc_count bigint)
language sql stable security invoker set search_path='' as $$
 select l.* from public.lead_hub_customer_list(_actor) l
 where _search='' or strpos(lower(l.customer_name),lower(_search))>0 or public.lead_hub_customer_phone_matches(l.id,_search);
$$;

revoke all on function public.lead_hub_skip_duplicate_phone_alias(),public.lead_hub_register_primary_phone(),
 public.lead_hub_customer_additional_phones(uuid,text),public.lead_hub_customer_phone_matches(uuid,text),
 public.lead_hub_customer_phone_owner(uuid,text),public.lead_hub_customer_phone_link(uuid,text,jsonb,uuid),
 public.lead_hub_customer_write_phones(uuid,uuid,text,text[],text,text[],boolean),
 public.lead_hub_customer_list(uuid,text) from public,anon,authenticated;
grant execute on function public.lead_hub_skip_duplicate_phone_alias(),public.lead_hub_register_primary_phone(),
 public.lead_hub_customer_additional_phones(uuid,text),public.lead_hub_customer_phone_matches(uuid,text),
 public.lead_hub_customer_phone_owner(uuid,text),public.lead_hub_customer_phone_link(uuid,text,jsonb,uuid),
 public.lead_hub_customer_write_phones(uuid,uuid,text,text[],text,text[],boolean),
 public.lead_hub_customer_list(uuid,text) to service_role;

-- Extend the existing profile and directory queries without changing their response contracts.
create or replace function public.lead_hub_customer_get(_actor uuid,_lead uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare l public.lead_hub_leads%rowtype; result jsonb;
begin
 select * into l from public.lead_hub_leads where id=_lead;
 if not found or not exists(select 1 from public.lead_hub_accounts a where a.id=_actor and a.active and (a.role='admin' or l.assigned_id=_actor)) then raise exception using errcode='42501',message='Customer access denied'; end if;
 select jsonb_build_object('lead',to_jsonb(l)-'created_by','profile',to_jsonb(p),
 'additional_phones',public.lead_hub_customer_additional_phones(l.id,l.phone_e164),
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
 where (case when _lead is not null then id=_lead else id=(select lead_id from public.lead_hub_customer_phones where phone_e164=_phone) end)
  and (a.role='admin' or assigned_id=a.id) for update;
 if not found then raise exception using errcode='42501',message='Customer access denied'; end if;
 if _lead is null and not exists(select 1 from public.lead_hub_customer_phones where phone_e164=_phone and lead_id=l.id) then
  raise exception using errcode='42501',message='Customer phone changed';
 end if;
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
   and (_search='' or strpos(lower(customer_name),lower(_search))>0 or public.lead_hub_customer_phone_matches(d.id,_search))
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

create or replace function public.lead_hub_customer_dashboard(
 _actor uuid,_from date default null,_to date default null,_group text default 'day',
 _search text default '',_status text default '',_model text default null,_staff uuid default null,
 _variant text default null,_colour text default null,_bucket text default '',_offset integer default 0
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.lead_hub_accounts where id=_actor and active) then raise exception using errcode='42501',message='Account unavailable'; end if;
 if _group not in ('day','week','month') or _bucket not in ('','lou','delivered','pending','trade_in')
  or _offset<0 or _offset>1000000000 or (_from is not null and _to is not null and _from>_to)
 then raise exception 'Invalid dashboard filters'; end if;
 with scoped as materialized (
  select l.id,l.customer_name,l.phone_e164,coalesce(trim(l.model),'') as model,l.source,l.assigned_id,l.follow_up_at,l.created_at,
   greatest(l.updated_at,p.updated_at) as updated_at,p.sales_status,p.variant,p.colour,p.next_action,p.lou_received,p.trade_in,
   coalesce(lower(regexp_replace(trim(p.variant),'\s+',' ','g')),'') as variant_key,
   coalesce(lower(regexp_replace(trim(p.colour),'\s+',' ','g')),'') as colour_key,
   s.display_name as staff_name,s.staff_code,
   case when p.sales_status in ('on_hold','cancelled') then 'inactive'
    when p.sales_status='delivered' then 'delivered'
    when p.lou_received then 'lou' else 'pending' end as outcome
  from public.lead_hub_leads l join public.lead_hub_customer_profiles p on p.lead_id=l.id
   left join public.lead_hub_accounts s on s.id=l.assigned_id
  where exists(select 1 from public.lead_hub_accounts a where a.id=_actor and a.active and (a.role='admin' or l.assigned_id=_actor))
 ), base as materialized (
  select * from scoped d where
   (_from is null or created_at>=(_from::timestamp at time zone 'Asia/Kuala_Lumpur'))
   and (_to is null or created_at<((_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur'))
   and (_status='' or sales_status=_status) and (_model is null or model=_model) and (_staff is null or assigned_id=_staff)
   and (_variant is null or variant_key=_variant) and (_colour is null or colour_key=_colour)
   and (_search='' or strpos(lower(customer_name),lower(_search))>0 or public.lead_hub_customer_phone_matches(d.id,_search))
 ), filtered as materialized (
  select * from base where _bucket='' or (_bucket='trade_in' and trade_in) or outcome=_bucket
 ), page as (
  select f.id,f.customer_name,f.phone_e164,f.model,f.source,f.assigned_id,f.staff_name,f.staff_code,f.sales_status,f.variant,f.colour,f.next_action,f.follow_up_at,f.created_at,f.updated_at,f.lou_received,f.trade_in,f.outcome,
   (select count(*) from public.lead_hub_inbox_files d where d.customer_id=f.id and d.state<>'uploading') as doc_count
  from filtered f order by f.updated_at desc,f.id offset _offset limit 50
 ), vehicle_groups as (
  select model,variant_key as variant,coalesce(nullif(model,''),'Model belum dipilih')||' · '||coalesce(nullif(initcap(variant_key),''),'Varian belum diisi') as label,count(*) as value from filtered group by model,variant_key
 ), colour_groups as (
  select colour_key as key,coalesce(nullif(initcap(colour_key),''),'Belum diisi') as label,count(*) as value from filtered group by colour_key
 ), status_groups as (
  select sales_status as label,count(*) as value from filtered group by sales_status
 ), trend_groups as (
  select date_trunc(_group,created_at at time zone 'Asia/Kuala_Lumpur')::date as bucket,count(*) as total,
   count(*) filter(where outcome='lou') as lou,count(*) filter(where outcome='delivered') as delivered,
   count(*) filter(where outcome='pending') as pending,count(*) filter(where trade_in) as trade_in
  from filtered group by 1
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
   'generated_at',now(),'basis','created_at','timezone','Asia/Kuala_Lumpur'),
  'options',jsonb_build_object(
   'models',coalesce((select jsonb_agg(jsonb_build_object('model',m.model) order by m.model) from (select distinct model from scoped) m),'[]'::jsonb),
   'variants',coalesce((select jsonb_agg(jsonb_build_object('value',v.variant_key,'label',coalesce(nullif(initcap(v.variant_key),''),'Varian belum diisi')) order by v.variant_key) from (select distinct variant_key from scoped where _model='' or model=_model) v),'[]'::jsonb),
   'colours',coalesce((select jsonb_agg(jsonb_build_object('value',c.colour_key,'label',coalesce(nullif(initcap(c.colour_key),''),'Belum diisi')) order by c.colour_key) from (select distinct colour_key from scoped) c),'[]'::jsonb),
   'staff',case when exists(select 1 from public.lead_hub_accounts where id=_actor and active and role='admin')
    then coalesce((select jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'staff_code',staff_code) order by display_name) from public.lead_hub_accounts where active),'[]'::jsonb) else '[]'::jsonb end
  )
 ) into result;
 return result;
end;$$;
