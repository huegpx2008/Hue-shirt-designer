# Hue T-shirt Designer

A simple, modern single-page T-shirt designer MVP built with **Next.js 15**, **React**, **Tailwind CSS**, and **Fabric.js**.

## Features

- Centered T-shirt mockup preview with editable design area
- Shirt color picker (white, black, gray, navy, red)
- Upload logo/image and place it on the shirt
- Add editable text objects
- Drag, resize, and rotate text/images directly on the shirt via Fabric.js controls
- Responsive mobile-friendly layout
- Download final artwork as PNG

## Tech Stack

- Next.js 15 (App Router)
- React 19
- Tailwind CSS
- Fabric.js
- TypeScript

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Run the development server:

```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000)

## Production Build

```bash
npm run build
npm run start
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. Go to [https://vercel.com/new](https://vercel.com/new)
3. Import your GitHub repository.
4. Keep defaults for Next.js and click **Deploy**.

Vercel will auto-detect the framework and build command.

## Notes

- The project now includes customer authentication, artwork-library storage, pricing proxies, checkout prototyping, and multiple print-product builders.

## Launch and security checks

- Run `npm run launch:check` with the deployment environment loaded to validate required configuration without printing secret values.
- Run `npm run build` before deployment.
- Follow [SECURITY-LAUNCH-CHECKLIST.md](./SECURITY-LAUNCH-CHECKLIST.md) for privacy, pricing, order, email, and Admin smoke tests.
- Set `CHECKOUT_ENABLED=false` in Vercel and redeploy to pause new order submissions during an incident.
- Supabase stores private customer artwork; public catalog and website imagery may be delivered by Vercel, Cloudinary, or the SanMar CDN depending on the asset.
- Experimental integrations should remain disabled until their server-side credentials, usage caps, and customer-facing error handling are configured.

## Hue Studio Admin and Promo Codes

The ordering app includes a protected management dashboard at `/admin`. It is designed to be linked from `huegraphics.cc/admin` while remaining hosted with this ordering project. The dashboard shows Supabase customer accounts, centralized Hue Studio orders, private artwork-file metadata, and promotional codes.

Initial setup:

1. Run [`supabase/hue-studio-admin.sql`](supabase/hue-studio-admin.sql) once in the Supabase SQL editor.
2. Add `SUPABASE_SERVICE_ROLE_KEY`, a long unique `ADMIN_DASHBOARD_SECRET`, and a separate random `ADMIN_SESSION_SECRET` to the local and Vercel server environment variables.
3. Redeploy the project, then open `/admin` and sign in using `ADMIN_DASHBOARD_SECRET`.
4. Add the deployed `/admin` URL as a link inside the existing `huegraphics.cc/admin` page.

The Supabase service-role key is server-only and must never use a `NEXT_PUBLIC_` prefix. Promo codes created in the dashboard can be percentage or fixed-dollar discounts with optional minimum orders, discount caps, expiration dates, and usage limits. Checkout validates codes through a server route and records the applied discount with the order.

## Accounts & Services Inventory

Last reviewed: July 14, 2026

This section is the reference list for the external accounts and services connected to, used by, or evaluated for the Hue online ordering project. Do not place passwords, API secrets, recovery codes, or full private credentials in this file. Store secrets only in local `.env.local` files and the hosting provider's protected environment-variable settings.

### Active services

| Service | Purpose | Plan / cost noted | Important account notes |
| --- | --- | --- | --- |
| [GitHub](https://github.com/) | Source control and backup for this codebase | Account currently in use | Repository: `huegpx2008/Hue-shirt-designer`. Keep recovery methods and repository-owner access current. |
| [Vercel](https://vercel.com/dashboard) | Hosts and deploys the customer-facing Next.js store and may also host other Hue web projects | Pro, $20/month | Includes $20 in monthly infrastructure credit. Configure Spend Management and enable **Pause Projects** if the on-demand budget must act as a hard limit. The original site assets can be delivered by Vercel; Cloudinary reduces image delivery load but was not required merely to keep those static files working. |
| [Cloudinary](https://console.cloudinary.com/) | Hosts and optimizes public website images and powers the Image Zone AI proof tools | Free, 25 credits over a rolling 30-day usage window | July 2026 usage snapshot: about 128 transformations, 361.51 MB bandwidth, and 316.36 MB storage—approximately 0.8 of 25 credits. The app can run restore, background removal/replacement, object removal/replacement, and recoloring. Each AI proof uses Cloudinary special transformations, so monitor credits. Temporary AI source uploads are deleted after the proof is returned. Configure the three server-only `CLOUDINARY_*` variables documented in `.env.example`. |
| [Supabase](https://supabase.com/dashboard) | Customer authentication and private Image Zone artwork storage | Plan not recorded here | The app uses Supabase Auth and the `artwork-files` storage bucket. Storage access policies are documented in `supabase/storage-policies.sql`. Customer originals and saved AI/editor results should remain here rather than in the public website-image library. |
| [Resend](https://resend.com/) | Sends website contact-form and quote-request emails | Plan / cost not recorded here | Used by the Hue website's email workflow. Keep the sending domain verified, confirm its required DNS records remain present, and store `RESEND_API_KEY` only in the appropriate server/hosting environment variables. Record which deployed website project owns the integration. |
| [SanMar](https://www.sanmar.com/) | Apparel catalog data and product photography | Vendor account / terms not recorded here | Catalog data is imported into local generated JSON files. Product-image URLs also reference SanMar's `cdnm.sanmar.com` CDN. Keep the SanMar account and permission to use catalog content current. |
| Hue pricing service (`quotes.huegraphics.cc`) | Supplies banner, rigid-sign, apparel, DTF, embroidery, and screen-print pricing to this storefront | Hue-owned service; hosting/project cost not recorded here | This is a separate production dependency. Record which Vercel project/repository and domain/DNS account own it so pricing can be restored if an account is lost. |
| [Adobe Creative Cloud](https://account.adobe.com/) | Internal design and production work in Adobe applications | Paid subscription | Included Firefly credits apply inside eligible Adobe apps and the Firefly website. Standard individual Creative Cloud access does not automatically provide customer-facing Firefly Services API access. |
| [ChatGPT / Codex](https://chatgpt.com/) | Development assistance, planning, and code changes | Paid ChatGPT/Codex account | This is a development tool, not a runtime dependency of the customer website. ChatGPT billing does not include OpenAI API usage. |

### Evaluated but not currently connected

| Service | Decision / status |
| --- | --- |
| [Clipdrop](https://clipdrop.co/) / Jasper API | Evaluated for Cleanup and Remove Text. The consumer Free/Pro website quotas do not power another website. The API currently offers 100 one-time development credits, then requires additional API credits. Not connected. |
| [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) | Evaluated as a low-cost hosted AI option. Not connected. |
| Local [ComfyUI](https://docs.comfy.org/) | Evaluated as a no-per-image local AI option. It would require a suitable GPU computer to remain online and is not connected. |
| Adobe Firefly Services API | Evaluated, but ordinary individual Creative Cloud plans do not provide the enterprise Firefly Services entitlement needed for a customer-facing API integration. Not connected. |

### Accounts still worth documenting

The following ownership details are not discoverable from this repository and should be added when known:

- Domain registrar for `huegraphics.cc`
- DNS provider for `huegraphics.cc` and `quotes.huegraphics.cc`
- Vercel project name and GitHub repository that power `quotes.huegraphics.cc`
- Primary owner email and recovery email for GitHub, Vercel, Cloudinary, Supabase, Resend, SanMar, and Adobe
- Where two-factor authentication recovery codes are stored (record the location only, never the codes)
- Renewal date and payment method owner for each paid service

### Suggested quarterly check

Every three months, confirm that:

1. The owner email and two-factor authentication still work for every active account.
2. Vercel Spend Management still has the intended budget and pause behavior.
3. Cloudinary usage remains comfortably below 25 rolling credits.
4. Supabase authentication, storage policies, and customer artwork retrieval still work.
5. Resend can still deliver a test contact/quote email and its sending-domain DNS records remain verified.
6. The Hue pricing service and its domain/DNS ownership are documented and reachable.
7. Inactive trials or unused paid subscriptions have been cancelled.
