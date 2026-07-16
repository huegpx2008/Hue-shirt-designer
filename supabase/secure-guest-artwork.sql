à-- SECURITY FIX: stop signed-out visitors from browsing the shared legacy guest folder.
-- Run this once in the Supabase SQL Editor for the Hue Studio project.
-- Existing files are not deleted. Review and clean up `test-library/` separately.

drop policy if exists "Hue guest artwork can be listed and previewed" on storage.objects;
drop policy if exists "Hue guest artwork can be uploaded" on storage.objects;
drop policy if exists "Hue guest production files can be uploaded" on storage.objects;

-- Guest checkout may save final production files into an unlisted random session folder.
-- There is intentionally no anonymous SELECT policy, so this does not create a guest library.
create policy "Hue guest production files can be uploaded"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'artwork-files'
  and (storage.foldername(name))[1] = 'guest-orders'
  and length((storage.foldername(name))[2]) >= 20
);

-- Cloud Image Zone files are private to the authenticated customer id in the path.
drop policy if exists "Hue customers can upload their artwork" on storage.objects;
create policy "Hue customers can upload their artwork"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'artwork-files'
  and (storage.foldername(name))[1] = 'customers'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Hue customers can list and preview their artwork" on storage.objects;
create policy "Hue customers can list and preview their artwork"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'artwork-files'
  and (storage.foldername(name))[1] = 'customers'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Hue customers can replace their artwork" on storage.objects;
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

drop policy if exists "Hue customers can delete their artwork" on storage.objects;
create policy "Hue customers can delete their artwork"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'artwork-files'
  and (storage.foldername(name))[1] = 'customers'
  and (storage.foldername(name))[2] = auth.uid()::text
);
