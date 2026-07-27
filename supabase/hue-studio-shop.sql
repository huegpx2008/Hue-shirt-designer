-- Hue Studio Featured & Seasonal products and temporary Group Stores.
-- Run once in the Supabase SQL Editor before publishing Shop products.

create extension if not exists pgcrypto;

create table if not exists public.hue_group_stores (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  organization text,
  description text not null default '',
  hero_image_url text,
  visibility text not null default 'unlisted' check (visibility in ('public', 'unlisted')),
  opens_at timestamptz,
  closes_at timestamptz,
  active boolean not null default false,
  delivery_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hue_shop_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.hue_group_stores(id) on delete set null,
  product_type text not null default 'featured' check (product_type in ('featured', 'group')),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  eyebrow text,
  short_description text not null default '',
  description text,
  image_url text,
  base_price numeric(12,2) not null default 0 check (base_price >= 0),
  active boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_product_store_required check (product_type <> 'group' or store_id is not null)
);

create index if not exists hue_shop_products_store_id_idx on public.hue_shop_products(store_id);
create index if not exists hue_shop_products_active_idx on public.hue_shop_products(active, product_type);
create index if not exists hue_group_stores_active_idx on public.hue_group_stores(active, visibility);

alter table public.hue_group_stores enable row level security;
alter table public.hue_shop_products enable row level security;

-- Public reads and every write go through Hue Studio server routes using the service role.
-- No anon/authenticated table policies are intentionally created here.

