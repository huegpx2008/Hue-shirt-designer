-- Run once in the Supabase SQL Editor before enabling PayPal Checkout.
-- Safe to run again: all table/column/index statements are idempotent.

create extension if not exists pgcrypto;

create table if not exists public.hue_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  submission_key text not null unique,
  paypal_order_id text not null unique,
  paypal_capture_id text null unique,
  status text not null default 'created' check (status in ('created', 'approved', 'completed', 'denied', 'refunded', 'reversed', 'failed')),
  customer_user_id uuid null,
  customer_email text not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'USD',
  priced_order jsonb not null default '{}'::jsonb,
  paypal_data jsonb not null default '{}'::jsonb,
  webhook_data jsonb null,
  paid_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hue_orders add column if not exists payment_provider text null;
alter table public.hue_orders add column if not exists payment_status text null;
alter table public.hue_orders add column if not exists paypal_order_id text null;
alter table public.hue_orders add column if not exists paypal_capture_id text null;
alter table public.hue_orders add column if not exists paid_at timestamptz null;
alter table public.hue_orders add column if not exists payment_data jsonb null;

create index if not exists hue_payment_attempts_status_idx on public.hue_payment_attempts (status, updated_at desc);
create index if not exists hue_payment_attempts_customer_email_idx on public.hue_payment_attempts (lower(customer_email), created_at desc);
create unique index if not exists hue_orders_paypal_order_id_uidx on public.hue_orders (paypal_order_id) where paypal_order_id is not null;
create unique index if not exists hue_orders_paypal_capture_id_uidx on public.hue_orders (paypal_capture_id) where paypal_capture_id is not null;

alter table public.hue_payment_attempts enable row level security;
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.hue_payment_attempts to service_role;
grant select, insert, update, delete on table public.hue_orders to service_role;
