-- Hue Studio verified artwork archive registry.
-- Run once in the Supabase SQL Editor before enabling automated cleanup.

create extension if not exists pgcrypto;

create table if not exists public.hue_artwork_archive (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  preview_storage_path text,
  owner_user_id uuid,
  owner_email text,
  guest_session_id text,
  order_id uuid,
  order_number text,
  kind text not null default 'original',
  original_name text,
  mime_type text,
  file_size bigint not null default 0,
  drive_file_id text,
  drive_folder_id text,
  drive_web_view_link text,
  archive_status text not null default 'pending',
  drive_verified_at timestamptz,
  cleanup_eligible_at timestamptz,
  supabase_deleted_at timestamptz,
  restored_storage_path text,
  restored_at timestamptz,
  restore_expires_at timestamptz,
  last_used_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hue_artwork_archive_status_check check (
    archive_status in ('pending', 'verified', 'cleaned', 'restored', 'failed')
  )
);

create index if not exists hue_artwork_archive_owner_idx
  on public.hue_artwork_archive(owner_user_id, created_at desc);
create index if not exists hue_artwork_archive_order_idx
  on public.hue_artwork_archive(order_id, created_at desc);
create index if not exists hue_artwork_archive_cleanup_idx
  on public.hue_artwork_archive(archive_status, cleanup_eligible_at)
  where supabase_deleted_at is null;

alter table public.hue_artwork_archive enable row level security;

-- Deliberately no browser policies. Archive records are accessed only through
-- Hue Studio server routes using the Supabase service role.
