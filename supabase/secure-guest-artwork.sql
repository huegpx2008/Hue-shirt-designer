-- SECURITY FIX: stop signed-out visitors from browsing the shared legacy guest folder.
-- Run this once in the Supabase SQL Editor for the Hue Studio project.
-- Existing files are not deleted. Review and clean up `test-library/` separately.

drop policy if exists "Hue guest artwork can be listed and previewed" on storage.objects;
drop policy if exists "Hue guest artwork can be uploaded" on storage.objects;
drop policy if exists "Hue guest production files can be uploaded" on storage.objects;

-- Stage 3 supersedes direct anonymous uploads. Guest production files now pass
-- through /api/artwork/upload and are written by the server after validation.

-- Cloud Image Zone files are private to the authenticated customer id in either supported path layout.
-- New: customers/{email-safe-folder}/{auth.uid()}/{file}
-- Legacy: customers/{auth.uid()}/{email-safe-folder}/{file}
drop policy if exists "Hue customers can upload their artwork" on storage.objects;

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
