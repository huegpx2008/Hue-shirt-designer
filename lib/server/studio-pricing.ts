import { supabaseAdminFetch } from '@/lib/server/supabase-admin';

export type StudioPricingAdjustment = {
  id?: string;
  product_key: string;
  display_name?: string | null;
  category?: string | null;
  percentage: number;
  sheet_included_pieces?: number | null;
  sheet_extra_percent?: number | null;
  sheet_max_surcharge_percent?: number | null;
  active?: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

type PricingPayload = Record<string, string | number | boolean>;

const SHEET_PRICED_PRODUCTS = new Set(['yard-sign', 'pvc', 'foamcore', 'polystyrene']);
export const DEFAULT_SHEET_PRICING = {
  includedPieces: 10,
  extraPercentPerPiece: 0.325,
  maxSurchargePercent: 30,
};

export const STUDIO_PRICING_PRODUCTS = [
  { key: 'banner', name: 'Vinyl Banner', category: 'Banners' },
  { key: 'mesh-banner', name: 'Mesh Banner', category: 'Banners' },
  { key: 'yard-sign', name: 'CORO', category: 'CORO', sourceLabel: 'Custom CORO pricing API' },
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

const safeSheetSetting = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

// Hue Studio's CORO builder is identified as `yard-sign` in orders and Admin,
// but every size (including 24x18) is priced by the master custom CORO API.
// Keep the existing Admin/database key so saved adjustments continue to work.
export const studioPricingKey = (productKey: string) =>
  productKey === 'custom-cut-coroplast' ? 'yard-sign' : productKey;

export const getStudioPricingAdjustment = async (productKey: string): Promise<StudioPricingAdjustment> => {
  const canonicalProductKey = studioPricingKey(productKey);
  try {
    const rows = await supabaseAdminFetch(`/rest/v1/hue_pricing_adjustments?product_key=eq.${encodeURIComponent(canonicalProductKey)}&select=*&limit=1`) as StudioPricingAdjustment[];
    const row = rows[0];
    if (!row || row.active === false) return { product_key: canonicalProductKey, percentage: 100, active: true };
    return {
      ...row,
      percentage: safePercentage(row.percentage),
      sheet_included_pieces: safeSheetSetting(row.sheet_included_pieces, DEFAULT_SHEET_PRICING.includedPieces, 1, 10000),
      sheet_extra_percent: safeSheetSetting(row.sheet_extra_percent, DEFAULT_SHEET_PRICING.extraPercentPerPiece, 0, 100),
      sheet_max_surcharge_percent: safeSheetSetting(row.sheet_max_surcharge_percent, DEFAULT_SHEET_PRICING.maxSurchargePercent, 0, 500),
    };
  } catch {
    // Pricing must remain available if the adjustment table has not been installed
    // or Supabase is temporarily unavailable. Master API pricing is the fallback.
    return { product_key: canonicalProductKey, percentage: 100, active: true };
  }
};

const numericValue = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[^0-9.-]/g, '')) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const sheetLayout = (payload: PricingPayload) => {
  const width = numericValue(payload.width);
  const height = numericValue(payload.height);
  const quantity = Math.max(1, Math.floor(numericValue(payload.quantity) || 1));
  if (!width || !height || width <= 0 || height <= 0) return null;
  const normal = Math.floor(48 / width) * Math.floor(96 / height);
  const rotated = Math.floor(48 / height) * Math.floor(96 / width);
  const piecesPerSheet = Math.max(1, normal, rotated);
  return { quantity, piecesPerSheet, sheetCount: Math.max(1, Math.ceil(quantity / piecesPerSheet)) };
};

const masterSheetPrice = async (productKey: string, payload: PricingPayload) => {
  const apiSlug = productKey === 'yard-sign' ? 'custom-cut-coroplast' : productKey;
  const referencePayload: PricingPayload = { ...payload, quantity: 1, sheetCount: 1 };
  const response = await fetch(`https://quotes.huegraphics.cc/api/pricing/${apiSlug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(referencePayload),
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null) as { ok?: boolean; price?: { retail?: unknown } } | null;
  if (!data || data.ok === false) return null;
  const retail = numericValue(data.price?.retail);
  return retail && retail > 0 ? retail : null;
};

const applySheetDensityPricing = async (
  source: Record<string, unknown>,
  productKey: string,
  payload: PricingPayload | undefined,
  adjustment: StudioPricingAdjustment,
) => {
  if (!payload || !SHEET_PRICED_PRODUCTS.has(productKey)) return { source, sheetPricing: null };
  const layout = sheetLayout(payload);
  if (!layout) return { source, sheetPricing: null };
  const referencePerSheet = await masterSheetPrice(productKey, payload).catch(() => null);
  if (!referencePerSheet) return { source, sheetPricing: null };

  const includedPieces = Math.round(safeSheetSetting(adjustment.sheet_included_pieces, DEFAULT_SHEET_PRICING.includedPieces, 1, 10000));
  const extraPercentPerPiece = safeSheetSetting(adjustment.sheet_extra_percent, DEFAULT_SHEET_PRICING.extraPercentPerPiece, 0, 100);
  const maxSurchargePercent = safeSheetSetting(adjustment.sheet_max_surcharge_percent, DEFAULT_SHEET_PRICING.maxSurchargePercent, 0, 500);
  const filledSheetSurchargePercent = Math.min(
    maxSurchargePercent,
    Math.max(0, layout.piecesPerSheet - includedPieces) * extraPercentPerPiece,
  );
  const filledSheetPreAdjustmentTotal = Number((referencePerSheet * (1 + filledSheetSurchargePercent / 100)).toFixed(2));
  let remaining = layout.quantity;
  let surchargeTotal = 0;
  for (let sheet = 0; sheet < layout.sheetCount; sheet += 1) {
    const piecesOnSheet = Math.min(layout.piecesPerSheet, remaining);
    remaining -= piecesOnSheet;
    const surchargePercent = Math.min(maxSurchargePercent, Math.max(0, piecesOnSheet - includedPieces) * extraPercentPerPiece);
    surchargeTotal += referencePerSheet * surchargePercent / 100;
  }
  const densityTotal = Number((referencePerSheet * layout.sheetCount + surchargeTotal).toFixed(2));
  const sourcePrice = source.price && typeof source.price === 'object' ? source.price as Record<string, unknown> : null;
  if (!sourcePrice || densityTotal <= 0) return { source, sheetPricing: null };
  return {
    source: {
      ...source,
      price: {
        ...sourcePrice,
        retail: densityTotal,
        each: Number((densityTotal / layout.quantity).toFixed(4)),
      },
    },
    sheetPricing: {
      applied: true,
      sheetCount: layout.sheetCount,
      piecesPerSheet: layout.piecesPerSheet,
      includedPieces,
      extraPercentPerPiece,
      maxSurchargePercent,
      masterReferencePerSheet: referencePerSheet,
      filledSheetSurchargePercent,
      filledSheetPreAdjustmentTotal,
      surchargeTotal: Number(surchargeTotal.toFixed(2)),
      preAdjustmentTotal: densityTotal,
    },
  };
};

const adjustedNumber = (value: unknown, multiplier: number, precision: number) => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[^0-9.-]/g, '')) : NaN;
  if (!Number.isFinite(parsed)) return value;
  const factor = 10 ** precision;
  return Math.round(parsed * multiplier * factor) / factor;
};

export const applyStudioPricingAdjustment = async (data: unknown, productKey: string, payload?: PricingPayload) => {
  if (!data || typeof data !== 'object' || (data as { ok?: boolean }).ok === false) return data;
  const canonicalProductKey = studioPricingKey(productKey);
  const adjustment = await getStudioPricingAdjustment(canonicalProductKey);
  const percentage = safePercentage(adjustment.percentage);
  const multiplier = percentage / 100;
  const densityResult = await applySheetDensityPricing(data as Record<string, unknown>, canonicalProductKey, payload, adjustment);
  const source = densityResult.source;
  const sourcePrice = source.price && typeof source.price === 'object' ? source.price as Record<string, unknown> : null;
  const price = sourcePrice ? {
    ...sourcePrice,
    retail: adjustedNumber(sourcePrice.retail, multiplier, 2),
    each: adjustedNumber(sourcePrice.each, multiplier, 4),
  } : source.price;
  const sheetPricing = densityResult.sheetPricing ? {
    ...densityResult.sheetPricing,
    filledSheetTotal: adjustedNumber(densityResult.sheetPricing.filledSheetPreAdjustmentTotal, multiplier, 2),
  } : null;

  return {
    ...source,
    ...(sourcePrice ? { price } : {}),
    studioPricing: {
      productKey: canonicalProductKey,
      percentage,
      multiplier,
      masterPricingPercentage: 100,
      adjusted: percentage !== 100,
      ...(sheetPricing ? { sheetPricing } : {}),
    },
  };
};
