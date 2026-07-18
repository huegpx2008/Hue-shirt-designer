-- Run once in the Supabase SQL editor for Hue Studio.
-- Adds adjustable full-sheet density pricing without changing the master Hue API.
-- Safe to run more than once.

alter table public.hue_pricing_adjustments
  add column if not exists sheet_included_pieces integer not null default 10;

alter table public.hue_pricing_adjustments
  add column if not exists sheet_extra_percent numeric(7,4) not null default 0.325;

alter table public.hue_pricing_adjustments
  add column if not exists sheet_max_surcharge_percent numeric(6,2) not null default 30;

comment on column public.hue_pricing_adjustments.sheet_included_pieces is
  'Pieces included in each full-sheet base price before density handling begins.';
comment on column public.hue_pricing_adjustments.sheet_extra_percent is
  'Percent of the master one-sheet price added for each piece above the included count.';
comment on column public.hue_pricing_adjustments.sheet_max_surcharge_percent is
  'Maximum density surcharge percentage applied to each production sheet.';
