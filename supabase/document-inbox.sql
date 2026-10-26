create table public.lead_hub_inbox_files (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.lead_hub_accounts(id),
 uploaded_by uuid not null references public.lead_hub_accounts(id),
 storage_path text not null unique,
 original_name text not null check (char_length(original_name) between 1 and 180),
 mime_type text not null,
 byte_size bigint not null check (byte_size between 1 and 20971520),
 sha256 text not null,
 source text not null check (source in ('web_upload','ios_shortcut')),
 state text not null default 'uploading' check (state in ('uploading','inbox','assigned')),
 customer_name text not null default '',
 customer_phone text not null default '',
 party text not null default 'HIRER' check (party in ('HIRER','GUARANTOR','REBATE')),
 category text not null default 'AUTO' check (category in ('AUTO','VSO','IC','LESEN','PAYSLIP','BANK','OTHER','IC_FRONT','IC_BACK','SURAT_KERJA','SIJIL_LAHIR','SIJIL_NIKAH')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index lead_hub_inbox_owner_state_time_idx on public.lead_hub_inbox_files(owner_id,state,created_at desc,id);
create index lead_hub_inbox_uploader_time_idx on public.lead_hub_inbox_files(uploaded_by,created_at desc);
create index lead_hub_inbox_created_idx on public.lead_hub_inbox_files(created_at desc,id);
alter table public.lead_hub_inbox_files enable row level security;
revoke all on public.lead_hub_inbox_files from public,anon,authenticated;
grant select,insert,update,delete on public.lead_hub_inbox_files to service_role;

-- All selected files change ownership/metadata together, after row locks.
create function public.lead_hub_inbox_assign(_actor uuid,_ids uuid[],_customer text,_phone text,_party text,_category text,_target uuid default null)
returns setof uuid language plpgsql security invoker set search_path='' as $function$
declare actor_role text; total integer;
begin
 select role into actor_role from public.lead_hub_accounts where id=_actor and active;
 if actor_role is null then raise exception 'Account unavailable'; end if;
 if cardinality(_ids) not between 1 and 30 or char_length(_customer) not between 2 and 120 then raise exception 'Invalid assignment'; end if;
 if _target is not null and _target<>_actor then
  if actor_role<>'admin' or not exists(select 1 from public.lead_hub_accounts where id=_target and active and role='staff') then raise exception 'Target not allowed'; end if;
 end if;
 perform id from public.lead_hub_inbox_files where id=any(_ids) order by id for update;
 select count(*) into total from public.lead_hub_inbox_files where id=any(_ids) and state<>'uploading' and (actor_role='admin' or owner_id=_actor);
 if total<>cardinality(_ids) then raise exception 'File access changed'; end if;
 return query update public.lead_hub_inbox_files set customer_name=_customer,customer_phone=_phone,party=_party,category=_category,
  owner_id=coalesce(_target,owner_id),state='assigned',updated_at=now() where id=any(_ids) returning id;
end;
$function$;
revoke all on function public.lead_hub_inbox_assign(uuid,uuid[],text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.lead_hub_inbox_assign(uuid,uuid[],text,text,text,text,uuid) to service_role;

create table public.lead_hub_inbox_upload_keys (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.lead_hub_accounts(id) on delete cascade,
 token_hash text not null unique,
 prefix text not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz
);
create index lead_hub_inbox_upload_key_account_idx on public.lead_hub_inbox_upload_keys(account_id);
alter table public.lead_hub_inbox_upload_keys enable row level security;
revoke all on public.lead_hub_inbox_upload_keys from public,anon,authenticated;
grant select,insert,update,delete on public.lead_hub_inbox_upload_keys to service_role;

-- Keep the key upload-only and revoke it on an account credential reset.
create function public.lead_hub_revoke_inbox_keys() returns trigger
language plpgsql security invoker set search_path='' as $function$
begin
 if new.pass_hash is distinct from old.pass_hash or not new.active then
  update public.lead_hub_inbox_upload_keys set revoked_at=now()
  where account_id=new.id and revoked_at is null;
 end if;
 return new;
end;
$function$;
revoke all on function public.lead_hub_revoke_inbox_keys() from public,anon,authenticated;
create trigger lead_hub_inbox_key_reset after update of pass_hash,active on public.lead_hub_accounts
for each row execute function public.lead_hub_revoke_inbox_keys();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('lead-hub-inbox-private','lead-hub-inbox-private',false,20971520,
 array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.ms-excel','text/plain']);
