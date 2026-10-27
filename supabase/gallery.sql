-- Shared sales images; custom Lead Hub sessions are checked in the Edge Function.
create table public.lead_hub_gallery (
 id uuid primary key default gen_random_uuid(),
 model text not null check (model in ('emas7_phev','emas7_ev','emas5')),
 title text not null check (char_length(title) between 1 and 120),
 original_name text not null check (char_length(original_name) between 1 and 180),
 mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
 byte_size integer not null check (byte_size between 1 and 20971520),
 storage_path text not null unique,
 uploaded_by uuid not null references public.lead_hub_accounts(id),
 state text not null default 'uploading' check (state in ('uploading','ready','deleting')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index lead_hub_gallery_model_time_idx on public.lead_hub_gallery(model,created_at desc,id);
create index lead_hub_gallery_time_idx on public.lead_hub_gallery(created_at desc,id);
create index lead_hub_gallery_uploader_idx on public.lead_hub_gallery(uploaded_by);
alter table public.lead_hub_gallery enable row level security;
revoke all on public.lead_hub_gallery from public,anon,authenticated;
grant select,insert,update,delete on public.lead_hub_gallery to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('lead-hub-gallery-private','lead-hub-gallery-private',false,20971520,array['image/jpeg','image/png','image/webp']);
