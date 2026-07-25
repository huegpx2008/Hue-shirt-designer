-- Cross-device saved carts for signed-in Hue Studio customers.
-- Run once in the Supabase SQL editor. It is safe to run again.

create table if not exists public.hue_customer_carts (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  cart_data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint hue_customer_carts_data_is_array check (jsonb_typeof(cart_data) = 'array')
);

create index if not exists hue_customer_carts_expires_at_idx
  on public.hue_customer_carts (expires_at);

alter table public.hue_customer_carts enable row level security;

revoke all on table public.hue_customer_carts from anon, authenticated;
grant select, insert, update, delete on table public.hue_customer_carts to service_role;
