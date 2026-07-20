-- Run once in the Supabase SQL editor for the Hue Studio project.

create extension if not exists pgcrypto;

create table if not exists public.hue_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  submission_key text null,
  status text not null default 'received',
  customer_user_id uuid null,
  customer_email text not null,
  customer_name text null,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  promo_code text null,
  shipping numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  currency text not null default 'USD',
  printavo_status text not null default 'not_added' check (printavo_status in ('not_added', 'added')),
  printavo_order_number text null,
  printavo_added_at timestamptz null,
  drive_archive_status text not null default 'pending' check (drive_archive_status in ('pending', 'processing', 'archived', 'failed', 'not_configured')),
  drive_folder_id text null,
  drive_folder_url text null,
  drive_archived_at timestamptz null,
  drive_archive_error text null,
  drive_archive_attempts integer not null default 0,
  admin_email_sent_at timestamptz null,
  customer_email_sent_at timestamptz null,
  last_email_error text null,
  order_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep existing installations current when this setup file is run again.
alter table public.hue_orders add column if not exists printavo_status text not null default 'not_added';
alter table public.hue_orders add column if not exists printavo_order_number text null;
alter table public.hue_orders add column if not exists printavo_added_at timestamptz null;
alter table public.hue_orders add column if not exists drive_archive_status text not null default 'pending';
alter table public.hue_orders add column if not exists drive_folder_id text null;
alter table public.hue_orders add column if not exists drive_folder_url text null;
alter table public.hue_orders add column if not exists drive_archived_at timestamptz null;
alter table public.hue_orders add column if not exists drive_archive_error text null;
alter table public.hue_orders add column if not exists drive_archive_attempts integer not null default 0;
alter table public.hue_orders add column if not exists submission_key text null;
alter table public.hue_orders add column if not exists admin_email_sent_at timestamptz null;
alter table public.hue_orders add column if not exists customer_email_sent_at timestamptz null;
alter table public.hue_orders add column if not exists last_email_error text null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hue_orders_printavo_status_check') then
    alter table public.hue_orders add constraint hue_orders_printavo_status_check check (printavo_status in ('not_added', 'added'));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hue_orders_drive_archive_status_check') then
    alter table public.hue_orders add constraint hue_orders_drive_archive_status_check check (drive_archive_status in ('pending', 'processing', 'archived', 'failed', 'not_configured'));
  end if;
end $$;

-- Create indexes only after older installations have received all newer
-- columns. `create table if not exists` does not add columns to an existing
-- table, so placing these earlier would fail during an upgrade.
create index if not exists hue_orders_customer_email_idx on public.hue_orders (lower(customer_email));
create index if not exists hue_orders_created_at_idx on public.hue_orders (created_at desc);
create index if not exists hue_orders_printavo_status_idx on public.hue_orders (printavo_status, created_at desc);
create index if not exists hue_orders_drive_archive_status_idx on public.hue_orders (drive_archive_status, created_at desc);
create unique index if not exists hue_orders_submission_key_uidx on public.hue_orders (submission_key) where submission_key is not null;
create index if not exists hue_orders_status_updated_idx on public.hue_orders (status, updated_at desc);

create table if not exists public.hue_promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text null,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  minimum_order numeric(12,2) null check (minimum_order is null or minimum_order >= 0),
  maximum_discount numeric(12,2) null check (maximum_discount is null or maximum_discount > 0),
  starts_at timestamptz null,
  expires_at timestamptz null,
  max_uses integer null check (max_uses is null or max_uses > 0),
  uses_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hue_promo_codes_code_idx on public.hue_promo_codes (code);

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

alter table public.hue_pricing_adjustments add column if not exists sheet_included_pieces integer not null default 10;
alter table public.hue_pricing_adjustments add column if not exists sheet_extra_percent numeric(7,4) not null default 0.325;
alter table public.hue_pricing_adjustments add column if not exists sheet_max_surcharge_percent numeric(6,2) not null default 30;

create index if not exists hue_pricing_adjustments_product_key_idx on public.hue_pricing_adjustments (product_key);

alter table public.hue_orders enable row level security;
alter table public.hue_promo_codes enable row level security;
alter table public.hue_pricing_adjustments enable row level security;

-- These tables are intentionally service-role only. Customer browsers validate
-- promo codes and submit orders through the protected Next.js API routes.

-- Tables created from the SQL editor are owned by postgres. Explicitly grant
-- the API's service_role access so Supabase secret keys can use them while RLS
-- continues to block browser clients.
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.hue_orders to service_role;
grant select, insert, update, delete on table public.hue_promo_codes to service_role;
grant select, insert, update, delete on table public.hue_pricing_adjustments to service_role;
