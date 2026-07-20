-- Run once in the Supabase SQL editor for an existing Hue Studio installation.
-- Supabase remains the order source of truth. These fields only track the
-- optional secondary Google Drive production archive.

alter table public.hue_orders add column if not exists drive_archive_status text not null default 'pending';
alter table public.hue_orders add column if not exists drive_folder_id text null;
alter table public.hue_orders add column if not exists drive_folder_url text null;
alter table public.hue_orders add column if not exists drive_archived_at timestamptz null;
alter table public.hue_orders add column if not exists drive_archive_error text null;
alter table public.hue_orders add column if not exists drive_archive_attempts integer not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hue_orders_drive_archive_status_check') then
    alter table public.hue_orders add constraint hue_orders_drive_archive_status_check
      check (drive_archive_status in ('pending', 'processing', 'archived', 'failed', 'not_configured'));
  end if;
end $$;

create index if not exists hue_orders_drive_archive_status_idx
  on public.hue_orders (drive_archive_status, created_at desc);
