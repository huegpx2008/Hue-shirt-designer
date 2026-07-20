import type { MetadataRoute } from 'next';
import { ALLOW_INDEXING, SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: ALLOW_INDEXING
      ? [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/catalog-debug', '/order-confirmation'] }]
      : [{ userAgent: '*', disallow: '/' }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
