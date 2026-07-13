-- Hue Print-Ready Store artwork storage policies
-- Run this in Supabase SQL Editor for the `artwork-files` bucket.
--
-- Current app behavior:
-- - Guests upload/list files under: test-library/{file}
-- - Signed-in customers upload/list files under: customers/{auth.uid()}/{email-safe-folder}/{file}
--   The auth.uid() folder stays second so these policies keep working, while the
--   email-safe folder makes storage easier to browse in Supabase.

create policy "Hue guest artwork can be uploaded"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'artwork-files'
  and (storage.foldername(name))[1] = 'test-library'
);

create policy "Hue guest artwork can be listed and previewed"
on storage.objects
for select
to anon
using (
  bucket_id = 'artwork-files'
  and (storage.foldername(name))[1] = 'test-library'
);

create policy "Hue customers can upload their artwork"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'artwork-files'
  and (storage.foldername(name))[1] = 'customers'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "Hue customers can list and preview their artwork"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'artwork-files'
  and (storage.foldername(name))[1] = 'customers'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "Hue customers can replace their artwork"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'artwork-files'
  and (storage.foldername(name))[1] = 'customers'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'artwork-files'
  and (storage.foldername(name))[1] = 'customers'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "Hue customers can delete their artwork"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'artwork-files'
  and (storage.foldername(name))[1] = 'customers'
  and (storage.foldername(name))[2] = auth.uid()::text
);
