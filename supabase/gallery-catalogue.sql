-- Optional tags keep every existing Gallery row valid.
alter table public.lead_hub_gallery
  add column if not exists variant text,
  add column if not exists colour text,
  add column if not exists view text,
  add column if not exists poster_type text;
