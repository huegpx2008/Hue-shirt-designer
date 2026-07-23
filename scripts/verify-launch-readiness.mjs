const failures = [];
const warnings = [];

const value = (name) => String(process.env[name] || '').trim();
const required = (name, label = name) => {
  if (!value(name)) failures.push(`${label} is missing.`);
};
const minLength = (name, length, label = name) => {
  const current = value(name);
  if (!current) failures.push(`${label} is missing.`);
  else if (current.length < length) failures.push(`${label} must be at least ${length} characters.`);
};
const validEmail = (input) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
const emailFromHeader = (input) => input.match(/<([^>]+)>/)?.[1] || input;
const validHttpsUrl = (input) => {
  try {
    const parsed = new URL(input);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
};
const allOrNone = (names, label) => {
  const present = names.filter((name) => value(name));
  if (present.length > 0 && present.length < names.length) failures.push(`${label} is only partially configured.`);
};

required('NEXT_PUBLIC_SUPABASE_URL');
required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
required('SUPABASE_SERVICE_ROLE_KEY');
required('RESEND_API_KEY');
required('QUOTE_TO_EMAIL');
required('QUOTE_FROM_EMAIL');
required('NEXT_PUBLIC_SITE_URL');
minLength('ADMIN_DASHBOARD_SECRET', 24);
minLength('ADMIN_SESSION_SECRET', 32);
minLength('CRON_SECRET', 32);

if (value('NEXT_PUBLIC_SUPABASE_URL') && !validHttpsUrl(value('NEXT_PUBLIC_SUPABASE_URL'))) failures.push('NEXT_PUBLIC_SUPABASE_URL must be a valid HTTPS URL.');
if (value('NEXT_PUBLIC_SITE_URL') && !validHttpsUrl(value('NEXT_PUBLIC_SITE_URL'))) failures.push('NEXT_PUBLIC_SITE_URL must be the deployed HTTPS origin.');
if (value('QUOTE_TO_EMAIL') && !validEmail(value('QUOTE_TO_EMAIL'))) failures.push('QUOTE_TO_EMAIL is not a valid email address.');
if (value('QUOTE_FROM_EMAIL') && !validEmail(emailFromHeader(value('QUOTE_FROM_EMAIL')))) failures.push('QUOTE_FROM_EMAIL is not a valid email address or From header.');
if (value('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') && value('SUPABASE_SERVICE_ROLE_KEY') && value('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') === value('SUPABASE_SERVICE_ROLE_KEY')) failures.push('The Supabase publishable and service-role keys must be different.');
if (value('ADMIN_DASHBOARD_SECRET') && value('ADMIN_SESSION_SECRET') && value('ADMIN_DASHBOARD_SECRET') === value('ADMIN_SESSION_SECRET')) failures.push('ADMIN_SESSION_SECRET must differ from ADMIN_DASHBOARD_SECRET.');
if (!value('ARTWORK_LINK_SECRET')) warnings.push('ARTWORK_LINK_SECRET is missing; private artwork links fall back to the service-role key. A dedicated 32+ character secret is recommended.');
else if (value('ARTWORK_LINK_SECRET').length < 32) warnings.push('ARTWORK_LINK_SECRET should be at least 32 characters.');

const indexingValue = (value('ALLOW_INDEXING') || value('NEXT_PUBLIC_ALLOW_INDEXING')).toLowerCase();
if (!['true', 'false'].includes(indexingValue)) failures.push('ALLOW_INDEXING must be explicitly set to true or false.');
if (value('NEXT_PUBLIC_SITE_URL') && validHttpsUrl(value('NEXT_PUBLIC_SITE_URL'))) {
  const siteHostname = new URL(value('NEXT_PUBLIC_SITE_URL')).hostname.toLowerCase();
  if (siteHostname === 'studio.huegraphics.cc' && indexingValue !== 'true') failures.push('ALLOW_INDEXING must be true on the production Hue Studio domain.');
  if ((siteHostname.endsWith('.vercel.app') || siteHostname === 'localhost' || siteHostname === '127.0.0.1') && indexingValue === 'true') failures.push('ALLOW_INDEXING must stay false on preview and local deployments.');
}
if (!value('GOOGLE_SITE_VERIFICATION')) warnings.push('GOOGLE_SITE_VERIFICATION is not configured; add it after connecting Google Search Console.');

const checkoutValue = value('CHECKOUT_ENABLED').toLowerCase();
if (!checkoutValue) warnings.push('CHECKOUT_ENABLED is unset and therefore defaults to true. Set it explicitly for launch.');
else if (!['true', 'false'].includes(checkoutValue)) failures.push('CHECKOUT_ENABLED must be true or false.');

const paypalCheckoutValue = value('PAYPAL_CHECKOUT_ENABLED').toLowerCase();
if (paypalCheckoutValue && !['true', 'false'].includes(paypalCheckoutValue)) failures.push('PAYPAL_CHECKOUT_ENABLED must be true or false.');

const paypalEnvironment = value('PAYPAL_ENV').toLowerCase();
if (paypalEnvironment && !['sandbox', 'live'].includes(paypalEnvironment)) failures.push('PAYPAL_ENV must be sandbox or live.');

if (paypalCheckoutValue === 'true') {
  required('PAYPAL_CLIENT_ID');
  required('PAYPAL_CLIENT_SECRET');
  minLength('PAYPAL_ORDER_SIGNING_SECRET', 32);
  required('PAYPAL_WEBHOOK_ID');

  if (!paypalEnvironment) failures.push('PAYPAL_ENV is required when PayPal checkout is enabled.');
  if (checkoutValue === 'false') failures.push('CHECKOUT_ENABLED must be true when PayPal checkout is enabled.');
  if (paypalEnvironment === 'live' && /vercel\.app|localhost|127\.0\.0\.1/i.test(value('NEXT_PUBLIC_SITE_URL'))) {
    failures.push('PAYPAL_ENV cannot be live while NEXT_PUBLIC_SITE_URL is a preview or local address.');
  }
}

allOrNone(['CANVA_CLIENT_ID', 'CANVA_CLIENT_SECRET', 'CANVA_REDIRECT_URI'], 'Canva integration');
if (value('CANVA_REDIRECT_URI') && (!validHttpsUrl(value('CANVA_REDIRECT_URI')) || !value('CANVA_REDIRECT_URI').endsWith('/api/canva/connect/callback'))) failures.push('CANVA_REDIRECT_URI must be the HTTPS /api/canva/connect/callback URL.');
allOrNone(['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'], 'Cloudinary integration');

console.log('Hue Studio launch readiness');
console.log(`Critical checks: ${failures.length ? `${failures.length} failed` : 'passed'}`);
for (const failure of failures) console.log(`  FAIL: ${failure}`);
for (const warning of warnings) console.log(`  WARN: ${warning}`);
if (!failures.length && !warnings.length) console.log('  All configured launch checks passed.');
console.log('No secret values were printed.');

if (failures.length) process.exitCode = 1;
