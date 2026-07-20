# Hue Studio SEO launch checklist

The SEO pages can be built and tested before the final domain is connected. Keep
search indexing disabled until the production URL is ready.

## Before launch

1. Set `NEXT_PUBLIC_SITE_URL` in Vercel to the final HTTPS origin, without a trailing slash.
2. Keep `ALLOW_INDEXING=false` on Preview deployments.
3. Set `ALLOW_INDEXING=true` for the Production environment only.
4. Redeploy and verify `/robots.txt`, `/sitemap.xml`, and `/products`.
5. Confirm that page source uses the final domain in canonical and Open Graph URLs.

## After launch

1. Add the final domain as a property in Google Search Console.
2. Submit `https://FINAL-DOMAIN/sitemap.xml`.
3. Request indexing for the homepage and main product pages.
4. Optionally submit the same sitemap to Bing Webmaster Tools.

Do not submit the temporary Vercel URL to search engines.
