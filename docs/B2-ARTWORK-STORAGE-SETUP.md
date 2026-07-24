# Backblaze B2 artwork storage setup

Hue Studio uses three deliberately separate layers:

- Backblaze B2: private production originals.
- Supabase: authentication, the artwork registry, private medium working previews, and small Image Zone thumbnails.
- Google Drive: verified long-term copies of ordered production originals.

## Required setup

1. Create a private B2 bucket dedicated to Hue Studio production artwork.
2. Create a bucket-restricted application key with `listFiles`, `readFiles`, `writeFiles`, and `deleteFiles` capabilities.
3. Add the five `B2_*` values from `.env.example` to the production Vercel project. Do not add `NEXT_PUBLIC_` to any B2 credential.
4. Run `supabase/hue-studio-b2-artwork-assets.sql` in the Supabase SQL editor.
5. Configure the B2 bucket CORS rules to allow `PUT` from `https://studio.huegraphics.cc` and the local development origin, and to allow the `Content-Type` request header. Do not make the bucket public.
6. Keep the existing Google Drive server credentials configured so ordered originals can be archived and verified.

## Data flow

The browser asks Hue Studio for a short-lived upload ticket, sends the original directly to B2, creates a maximum-2400-pixel WebP working preview and a maximum-480-pixel WebP thumbnail locally, and sends only those reduced files to Supabase. The server verifies the B2 object size, file signature, preview, and thumbnail before activating the artwork record.

Image Zone always displays `original_name`, never the B2 object key or Drive file id. An internal `HUE-ART-*` production reference joins the preview, B2 original, order, and Drive archive.

After checkout, Hue Studio attempts the Drive archive immediately. The scheduled maintenance route retries pending orders. A B2 original is eligible for deletion only after Drive metadata verifies the file and the configured safety-retention window has elapsed. The Supabase preview and registry record remain available to the customer.
