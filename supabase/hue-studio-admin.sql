-- Run once in the Supabase SQL editor for the Hue Studio project.

create extension if not exists pgcrypto;

create table if not exists public.hue_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
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
  order_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hue_orders_customer_email_idx on public.hue_orders (lower(customer_email));
create index if not exists hue_orders_created_at_idx on public.hue_orders (created_at desc);

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

alter table public.hue_orders enable row level security;
alter table public.hue_promo_codes enable row level security;

-- These tables are intentionally service-role only. Customer browsers validate
-- promo codes and submit orders through the protected Next.js API routes.

-- Tables created from the SQL editor are owned by postgres. Explicitly grant
-- the API's service_role access so Supabase secret keys can use them while RLS
-- continues to block browser clients.
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.hue_orders to service_role;
grant select, insert, update, delete on table public.hue_promo_codes to service_role;
