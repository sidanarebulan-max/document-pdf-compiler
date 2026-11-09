-- Add Poster Posting while preserving Gallery rows and permissions.
begin;
alter table public.lead_hub_gallery
 drop constraint lead_hub_gallery_model_check;
alter table public.lead_hub_gallery
 add constraint lead_hub_gallery_model_check
 check (model in ('emas7_phev','emas7_ev','emas5','poster_posting'));
commit;
