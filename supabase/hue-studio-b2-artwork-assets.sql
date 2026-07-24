-- Hybrid artwork registry: Supabase owns customer identity, previews and metadata;
-- Backblaze B2 owns active production originals; Google Drive owns verified archives.

create extension if not exists pgcrypto;

create table if not exists public.hue_artwork_assets (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  original_name text not null,
  production_reference text not null unique,
  original_provider text not null default 'b2',
  original_object_key text not null unique,
  preview_storage_path text not null unique,
  thumbnail_storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  width integer,
  height integer,
  dpi_x numeric,
  dpi_y numeric,
  content_etag text,
  drive_file_id text,
  drive_folder_id text,
  drive_web_view_link text,
  archive_status text not null default 'uploading',
  ordered_at timestamptz,
  drive_verified_at timestamptz,
  cleanup_eligible_at timestamptz,
  source_deleted_at timestamptz,
  last_used_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hue_artwork_assets_provider_check check (original_provider in ('b2', 'supabase', 'drive')),
  constraint hue_artwork_assets_status_check check (
    archive_status in ('uploading', 'active', 'ordered', 'archiving', 'archived', 'failed', 'deleted')
  )
);

create index if not exists hue_artwork_assets_owner_idx
  on public.hue_artwork_assets(owner_user_id, created_at desc);
create index if not exists hue_artwork_assets_archive_idx
  on public.hue_artwork_assets(archive_status, cleanup_eligible_at);
create index if not exists hue_artwork_assets_preview_idx
  on public.hue_artwork_assets(preview_storage_path);

alter table public.hue_artwork_assets enable row level security;

-- Browser access deliberately goes through authenticated Hue Studio API routes.
-- B2 credentials and permanent original locations never reach the customer.
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.hue_artwork_assets to service_role;
