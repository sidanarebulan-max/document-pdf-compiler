-- Optional display filename per Telegram document case. Existing private RLS/grants remain.
alter table public.lead_hub_telegram_cases
 add column if not exists output_name text
 constraint lead_hub_telegram_cases_output_name_check
 check (output_name is null or length(output_name) between 1 and 140);

alter table public.lead_hub_telegram_dialog
 drop constraint lead_hub_telegram_dialog_pending_step_check;
alter table public.lead_hub_telegram_dialog
 add constraint lead_hub_telegram_dialog_pending_step_check
 check (pending_step is null or pending_step in ('customer_name','output_name'));
