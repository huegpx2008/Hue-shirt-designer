-- Stage 2 order-integrity migration for Hue Studio.
-- Run once in the Supabase SQL editor. It is safe to run again.

alter table public.hue_orders add column if not exists submission_key text null;
alter table public.hue_orders add column if not exists admin_email_sent_at timestamptz null;
alter table public.hue_orders add column if not exists customer_email_sent_at timestamptz null;
alter table public.hue_orders add column if not exists last_email_error text null;

create unique index if not exists hue_orders_submission_key_uidx
  on public.hue_orders (submission_key)
  where submission_key is not null;

create index if not exists hue_orders_status_updated_idx
  on public.hue_orders (status, updated_at desc);

grant select, insert, update, delete on table public.hue_orders to service_role;
