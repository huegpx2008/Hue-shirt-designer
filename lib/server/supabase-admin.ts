export type PromoCodeRecord = {
  id?: string;
  code: string;
  description?: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  minimum_order?: number | null;
  maximum_discount?: number | null;
  starts_at?: string | null;
  expires_at?: string | null;
  max_uses?: number | null;
  uses_count?: number | null;
  active?: boolean;
  created_at?: string;
};

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const storageBucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'artwork-files';

export const hasSupabaseAdminConfig = () => Boolean(supabaseUrl && serviceRoleKey);

export const supabaseAdminFetch = async (path: string, init: RequestInit = {}) => {
  if (!hasSupabaseAdminConfig()) throw new Error('Supabase admin access is not configured. Add SUPABASE_SERVICE_ROLE_KEY.');
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers
    }
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || `Supabase admin request failed (${response.status}).`);
  }
  if (response.status === 204) return null;
  return response.json();
};

export const getPromoCode = async (code: string) => {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!normalized) return null;
  const records = await supabaseAdminFetch(`/rest/v1/hue_promo_codes?code=eq.${encodeURIComponent(normalized)}&select=*&limit=1`) as PromoCodeRecord[];
  return records[0] || null;
};

export const calculatePromoDiscount = (promo: PromoCodeRecord, subtotal: number) => {
  const now = Date.now();
  if (promo.active === false) throw new Error('This promo code is not active.');
  if (promo.starts_at && new Date(promo.starts_at).getTime() > now) throw new Error('This promo code is not active yet.');
  if (promo.expires_at && new Date(promo.expires_at).getTime() < now) throw new Error('This promo code has expired.');
  if (promo.max_uses && (promo.uses_count || 0) >= promo.max_uses) throw new Error('This promo code has reached its usage limit.');
  if (promo.minimum_order && subtotal < promo.minimum_order) throw new Error(`This promo code requires a minimum order of $${promo.minimum_order.toFixed(2)}.`);
  const rawDiscount = promo.discount_type === 'percent'
    ? subtotal * (Math.max(0, promo.discount_value) / 100)
    : Math.max(0, promo.discount_value);
  const cappedDiscount = promo.maximum_discount ? Math.min(rawDiscount, promo.maximum_discount) : rawDiscount;
  return Number(Math.min(subtotal, cappedDiscount).toFixed(2));
};

export const getStorageBucket = () => storageBucket;
