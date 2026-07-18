-- Run once in the Supabase SQL editor for Hue Studio.
-- This table stores Hue Studio pricing controls only. Master prices continue to
-- come from the main Hue pricing APIs, so future master-price updates flow through.

create table if not exists public.hue_pricing_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_key text not null unique,
  display_name text null,
  category text null,
  percentage numeric(6,2) not null default 100 check (percentage >= 0 and percentage <= 200),
  sheet_included_pieces integer not null default 10,
  sheet_extra_percent numeric(7,4) not null default 0.325,
  sheet_max_surcharge_percent numeric(6,2) not null default 30,
  active boolean not null default true,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Safe to run again when the table was created by an earlier version.
alter table public.hue_pricing_adjustments add column if not exists sheet_included_pieces integer not null default 10;
alter table public.hue_pricing_adjustments add column if not exists sheet_extra_percent numeric(7,4) not null default 0.325;
alter table public.hue_pricing_adjustments add column if not exists sheet_max_surcharge_percent numeric(6,2) not null default 30;

create index if not exists hue_pricing_adjustments_product_key_idx on public.hue_pricing_adjustments (product_key);
alter table public.hue_pricing_adjustments enable row level security;

-- Only protected server routes use this table. Customer browsers cannot read or
-- modify storefront pricing controls directly.
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.hue_pricing_adjustments to service_role;
