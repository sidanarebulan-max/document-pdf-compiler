-- Exact original-file fingerprints, across all Gallery albums.
-- Nullable only for legacy files pending the one-time authenticated backfill.
alter table public.lead_hub_gallery
 add column content_sha256 text check (content_sha256 ~ '^[a-f0-9]{64}$');
create unique index lead_hub_gallery_content_sha256_key
 on public.lead_hub_gallery(content_sha256) where content_sha256 is not null;
-- RLS, grants and private Storage access remain unchanged.
