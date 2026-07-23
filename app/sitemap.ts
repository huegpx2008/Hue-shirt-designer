import type { MetadataRoute } from 'next';
import { SEO_PRODUCTS } from '@/lib/seo-products';
import { SITE_URL } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL },
    { url: `${SITE_URL}/products` },
    { url: `${SITE_URL}/help` },
    ...SEO_PRODUCTS.map((product) => ({
      url: `${SITE_URL}/products/${product.slug}`,
    })),
  ];
}
