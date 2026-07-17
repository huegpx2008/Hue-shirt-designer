-- Stage 3 upload hardening for Hue Studio.
-- Run once immediately before deploying the matching application update.
-- Safe to run again. Existing files are not changed or deleted.

update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/json'
  ]::text[]
where id = 'artwork-files';

-- All new writes now use a short-lived signed upload ticket created by
-- /api/artwork/upload. The browser uploads directly to private storage so large
-- print files do not cross Vercel's request-size limit. Hue then downloads and
-- verifies the real signature, dimensions and byte limit before accepting it.
drop policy if exists "Hue guest artwork can be uploaded" on storage.objects;
drop policy if exists "Hue guest artwork can be listed and previewed" on storage.objects;
drop policy if exists "Hue guest production files can be uploaded" on storage.objects;
drop policy if exists "Hue customers can upload their artwork" on storage.objects;
drop policy if exists "Hue customers can replace their artwork" on storage.objects;

-- Signed-in customers retain read/delete access only to paths containing their
-- authenticated user id. Both current and legacy layouts remain supported.
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
