-- Hue Print-Ready Store artwork storage policies
-- Run this in Supabase SQL Editor for the `artwork-files` bucket.
--
-- Current app behavior:
-- - Guest files stay in the browser session and are not uploaded to Image Zone.
-- - Guest checkout production files may upload to guest-orders/{random-session}/{file}; guests cannot list that folder.
-- - Signed-in customers upload/list new files under: customers/{email-safe-folder}/{auth.uid()}/{file}
-- - The previous customers/{auth.uid()}/{email-safe-folder}/{file} layout remains readable.

create policy "Hue guest production files can be uploaded"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'artwork-files'
  and (storage.foldername(name))[1] = 'guest-orders'
  and length((storage.foldername(name))[2]) >= 20
);

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
