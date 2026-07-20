const normalizeSiteUrl = (value: string) => {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/$/, '');
};

const configuredSiteUrl =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL ||
  'http://localhost:3000';

export const SITE_URL = normalizeSiteUrl(configuredSiteUrl);

// Indexing is deliberately opt-in so preview and temporary Vercel URLs never
// become competing copies of the final Hue Studio domain.
export const ALLOW_INDEXING =
  (process.env.ALLOW_INDEXING || process.env.NEXT_PUBLIC_ALLOW_INDEXING || '').toLowerCase() === 'true';

export const absoluteUrl = (path = '/') => new URL(path, `${SITE_URL}/`).toString();
