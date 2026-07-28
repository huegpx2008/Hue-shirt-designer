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
  configured?: boolean;
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
  { key: 'yard-sign-24x18', name: 'Standard 24 x 18 Yard Signs', category: 'CORO', sourceLabel: '24 x 18 only · uses CORO full-sheet math' },
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
    if (!row) return { product_key: canonicalProductKey, percentage: 100, active: true, configured: false };
    if (row.active === false) return { product_key: canonicalProductKey, percentage: 100, active: false, configured: true };
    return {
      ...row,
      percentage: safePercentage(row.percentage),
      sheet_included_pieces: safeSheetSetting(row.sheet_included_pieces, DEFAULT_SHEET_PRICING.includedPieces, 1, 10000),
      sheet_extra_percent: safeSheetSetting(row.sheet_extra_percent, DEFAULT_SHEET_PRICING.extraPercentPerPiece, 0, 100),
      sheet_max_surcharge_percent: safeSheetSetting(row.sheet_max_surcharge_percent, DEFAULT_SHEET_PRICING.maxSurchargePercent, 0, 500),
      configured: true,
    };
  } catch {
    // Pricing must remain available if the adjustment table has not been installed
    // or Supabase is temporarily unavailable. Master API pricing is the fallback.
    return { product_key: canonicalProductKey, percentage: 100, active: true, configured: false };
  }
};

const numericValue = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[^0-9.-]/g, '')) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const isStandardYardSignSize = (payload?: PricingPayload) => {
  if (!payload) return false;
  const width = numericValue(payload.width);
  const height = numericValue(payload.height);
  if (width === null || height === null) return false;
  const same = (first: number, second: number) => Math.abs(first - second) < 0.001;
  return (same(width, 24) && same(height, 18)) || (same(width, 18) && same(height, 24));
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

const masterFilledSheetPrice = async (productKey: string, payload: PricingPayload, piecesPerSheet: number) => {
  const apiSlug = productKey === 'yard-sign' ? 'custom-cut-coroplast' : productKey;
  const referencePayload: PricingPayload = { ...payload, quantity: piecesPerSheet, sheetCount: 1 };
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
  const referenceFilledSheetTotal = await masterFilledSheetPrice(productKey, payload, layout.piecesPerSheet).catch(() => null);

  const includedPieces = Math.round(safeSheetSetting(adjustment.sheet_included_pieces, DEFAULT_SHEET_PRICING.includedPieces, 1, 10000));
  const extraPercentPerPiece = safeSheetSetting(adjustment.sheet_extra_percent, DEFAULT_SHEET_PRICING.extraPercentPerPiece, 0, 100);
  const maxSurchargePercent = safeSheetSetting(adjustment.sheet_max_surcharge_percent, DEFAULT_SHEET_PRICING.maxSurchargePercent, 0, 500);
  const filledSheetSurchargePercent = Math.min(
    maxSurchargePercent,
    Math.max(0, layout.piecesPerSheet - includedPieces) * extraPercentPerPiece,
  );
  const filledSheetPreAdjustmentTotal = referenceFilledSheetTotal && referenceFilledSheetTotal > 0
    ? Number(referenceFilledSheetTotal.toFixed(2))
    : null;

  return {
    source,
    sheetPricing: {
      applied: true,
      sheetCount: layout.sheetCount,
      piecesPerSheet: layout.piecesPerSheet,
      includedPieces,
      extraPercentPerPiece,
      maxSurchargePercent,
      masterFilledSheetTotal: referenceFilledSheetTotal,
      filledSheetSurchargePercent,
      filledSheetPreAdjustmentTotal,
      preAdjustmentTotal: numericValue((source.price as Record<string, unknown> | undefined)?.retail),
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
  const baseAdjustment = await getStudioPricingAdjustment(canonicalProductKey);
  const standardYardSignAdjustment = canonicalProductKey === 'yard-sign' && isStandardYardSignSize(payload)
    ? await getStudioPricingAdjustment('yard-sign-24x18')
    : null;
  const usesStandardYardSignOverride = Boolean(
    standardYardSignAdjustment?.configured
    && standardYardSignAdjustment.active !== false,
  );
  const percentage = safePercentage(usesStandardYardSignOverride ? standardYardSignAdjustment?.percentage : baseAdjustment.percentage);
  const multiplier = percentage / 100;
  // The 24 x 18 override changes only the final Studio percentage. Sheet yield,
  // included pieces, and density handling always come from the main CORO row.
  const densityResult = await applySheetDensityPricing(data as Record<string, unknown>, canonicalProductKey, payload, baseAdjustment);
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
      adjustmentKey: usesStandardYardSignOverride ? 'yard-sign-24x18' : canonicalProductKey,
      percentage,
      multiplier,
      masterPricingPercentage: 100,
      adjusted: percentage !== 100,
      ...(sheetPricing ? { sheetPricing } : {}),
    },
  };
};
