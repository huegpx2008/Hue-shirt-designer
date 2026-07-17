# Hue Studio launch checklist

Use this checklist before the first public launch and after security, pricing, checkout, or infrastructure changes.

## Automated checks

1. Load the production environment variables into the current shell without committing them.
2. Run `npm run launch:check`. It validates configuration but never prints secret values.
3. Run `npm run build`.
4. Run `npm audit --omit=dev` and review every remaining advisory.

## Production smoke test

- Confirm a signed-in customer can upload artwork, sign out, and no other account or guest can see it.
- Confirm two separate guest browsers cannot see each other's artwork.
- Submit one signed-in and one guest test order. Confirm unique order numbers, final production files, admin records, and both confirmation emails.
- Retry the same submission and confirm it does not create a duplicate order.
- Temporarily make the upstream pricing request fail and confirm Add to Cart and checkout remain unavailable instead of using $0 or stale client totals.
- Test a valid, expired, disabled, and over-limit promo code.
- Confirm `/admin` and every `/api/admin/*` route reject an unauthenticated request.
- Open production and original artwork from Admin and confirm fresh private links work.
- Confirm the Printavo tracking status can be updated and persists.

## Emergency controls

- To pause new orders, set `CHECKOUT_ENABLED=false` in Vercel and redeploy. Existing orders and Admin remain available.
- Restore checkout only after pricing, Supabase, Resend, and artwork storage checks pass.
- Rotate `ADMIN_DASHBOARD_SECRET`, `ADMIN_SESSION_SECRET`, Supabase service-role, Resend, Canva, or Cloudinary credentials immediately if any value is exposed.

## Known dependency follow-up

Fabric 6 currently reports an SVG-serialization advisory. Hue Studio does not export Fabric SVG and its upload paths reject SVG, which contains the known route. Upgrade Fabric to 7.4+ in a dedicated designer regression pass because that is a breaking major-version change. Re-test text, layers, templates, save/reopen, front/back, mobile controls, and PNG export before deploying that upgrade.
