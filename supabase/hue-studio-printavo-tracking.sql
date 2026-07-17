-- Run once in the Supabase SQL editor for the Hue Studio project.
-- Adds private manual Printavo workflow tracking to existing Hue Studio orders.

alter table public.hue_orders
  add column if not exists printavo_status text not null default 'not_added',
  add column if not exists printavo_order_number text null,
  add column if not exists printavo_added_at timestamptz null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hue_orders_printavo_status_check') then
    alter table public.hue_orders
      add constraint hue_orders_printavo_status_check
      check (printavo_status in ('not_added', 'added'));
  end if;
end $$;

create index if not exists hue_orders_printavo_status_idx
  on public.hue_orders (printavo_status, created_at desc);

grant select, insert, update, delete on table public.hue_orders to service_role;
