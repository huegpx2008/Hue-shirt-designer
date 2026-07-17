-- Hue Studio customer-first artwork folders
-- Run this once in Supabase SQL Editor BEFORE deploying the matching app update.
--
-- New files: customers/{email-safe-folder}/{auth.uid()}/{file}
-- Old files: customers/{auth.uid()}/{email-safe-folder}/{file}
--
-- Both layouts remain private and usable. This changes policies only; it does not delete or move files.

drop policy if exists "Hue customers can upload their artwork" on storage.objects;
create policy "Hue customers can upload their artwork"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'artwork-files'
  and (storage.foldername(name))[1] = 'customers'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or (storage.foldername(name))[3] = auth.uid()::text
  )
);

drop policy if exists "Hue customers can list and preview their artwork" on storage.objects;
create policy "Hue customers can list and preview their artwork"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'artwork-files'
  and (storage.foldername(name))[1] = 'customers'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or (storage.foldername(name))[3] = auth.uid()::text
  )
);

drop policy if exists "Hue customers can replace their artwork" on storage.objects;
create policy "Hue customers can replace their artwork"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'artwork-files'
  and (storage.foldername(name))[1] = 'customers'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or (storage.foldername(name))[3] = auth.uid()::text
  )
)
with check (
  bucket_id = 'artwork-files'
  and (storage.foldername(name))[1] = 'customers'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or (storage.foldername(name))[3] = auth.uid()::text
  )
);

drop policy if exists "Hue customers can delete their artwork" on storage.objects;
create policy "Hue customers can delete their artwork"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'artwork-files'
  and (storage.foldername(name))[1] = 'customers'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or (storage.foldername(name))[3] = auth.uid()::text
  )
);
