import { supabaseAdminFetch } from '@/lib/server/supabase-admin';

export type StudioPricingAdjustment = {
  id?: string;
  product_key: string;
  display_name?: string | null;
  category?: string | null;
  percentage: number;
  active?: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export const STUDIO_PRICING_PRODUCTS = [
  { key: 'banner', name: 'Vinyl Banner', category: 'Banners' },
  { key: 'mesh-banner', name: 'Mesh Banner', category: 'Banners' },
  { key: 'yard-sign', name: 'CORO', category: 'CORO' },
  { key: 'acrylic', name: 'Acrylic Signs', category: 'Rigid Signs' },
  { key: 'acm', name: 'ACM / Aluminum Composite', category: 'Rigid Signs' },
  { key: 'pvc', name: 'PVC Signs', category: 'Rigid Signs' },
  { key: 'foamcore', name: 'Foamcore', category: 'Rigid Signs' },
  { key: 'polystyrene', name: 'Polystyrene', category: 'Rigid Signs' },
  { key: 'aluminum', name: 'Aluminum', category: 'Rigid Signs' },
  { key: 'vinyl', name: 'Adhesive Vinyl', category: 'Decals' },
  { key: 'vehicle-magnet', name: 'Vehicle / Custom Magnet', category: 'Magnets' },
  { key: 'poster', name: 'Poster', category: 'More' },
  { key: 'business-card', name: 'Business Cards', category: 'More' },
  { key: 'handheld-paper', name: 'Handheld Paper', category: 'More' },
  { key: 'carbonless', name: 'Carbonless Forms', category: 'More' },
  { key: 'door-hanger', name: 'Door Hangers', category: 'More' },
  { key: 'dtg', name: 'DTG — Direct to Garment', category: 'Apparel' },
  { key: 'dtf', name: 'DTF — Direct to Film', category: 'Apparel' },
  { key: 'screenprint', name: 'Screen Printing', category: 'Apparel' },
  { key: 'embroidery', name: 'Embroidery', category: 'Apparel' },
] as const;

const safePercentage = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(200, Math.max(0, parsed)) : 100;
};

export const getStudioPricingAdjustment = async (productKey: string): Promise<StudioPricingAdjustment> => {
  try {
    const rows = await supabaseAdminFetch(`/rest/v1/hue_pricing_adjustments?product_key=eq.${encodeURIComponent(productKey)}&select=*&limit=1`) as StudioPricingAdjustment[];
    const row = rows[0];
    if (!row || row.active === false) return { product_key: productKey, percentage: 100, active: true };
    return { ...row, percentage: safePercentage(row.percentage) };
  } catch {
    // Pricing must remain available if the adjustment table has not been installed
    // or Supabase is temporarily unavailable. Master API pricing is the fallback.
    return { product_key: productKey, percentage: 100, active: true };
  }
};

const adjustedNumber = (value: unknown, multiplier: number, precision: number) => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[^0-9.-]/g, '')) : NaN;
  if (!Number.isFinite(parsed)) return value;
  const factor = 10 ** precision;
  return Math.round(parsed * multiplier * factor) / factor;
};

export const applyStudioPricingAdjustment = async (data: unknown, productKey: string) => {
  if (!data || typeof data !== 'object' || (data as { ok?: boolean }).ok === false) return data;
  const adjustment = await getStudioPricingAdjustment(productKey);
  const percentage = safePercentage(adjustment.percentage);
  const multiplier = percentage / 100;
  const source = data as Record<string, unknown>;
  const sourcePrice = source.price && typeof source.price === 'object' ? source.price as Record<string, unknown> : null;
  const price = sourcePrice ? {
    ...sourcePrice,
    retail: adjustedNumber(sourcePrice.retail, multiplier, 2),
    each: adjustedNumber(sourcePrice.each, multiplier, 4),
  } : source.price;

  return {
    ...source,
    ...(sourcePrice ? { price } : {}),
    studioPricing: {
      productKey,
      percentage,
      multiplier,
      masterPricingPercentage: 100,
      adjusted: percentage !== 100,
    },
  };
};
