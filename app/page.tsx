'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ActiveSelection, Canvas, FabricImage, IText, Object as FabricObject } from 'fabric';
import TshirtShape from '@/components/tshirt-shape';
import { PRINT_AREA_CONFIG, ProductCatalogItem, PrintLocation, SAMPLE_PRODUCT_CATALOG } from '@/components/product-catalog';
import { calculateDtfPricing } from '@/lib/pricing/dtf-pricing';
import { recommendPrintMethodByCost } from '@/lib/pricing/recommend-print-method';
import { calculateScreenPrintPricing } from '@/lib/pricing/screen-print-pricing';
import generatedSanMarCatalog from '@/public/data/catalog/t-shirts.generated.json';
import fallbackSanMarPreview from '@/public/data/catalog-preview-25.json';
import catalogAuditData from '@/public/data/catalog/catalog-audit.generated.json';

type ShirtView = 'front' | 'back';
type FontOption = { label: string; value: string };
type LayerItem = { id: string; name: string; type: string; isActive: boolean };
type ImageZoneItem = { id: string; name: string; dataUrl: string; width: number; height: number; dpi: number; uploadedAt: string; storagePath?: string; storageUrl?: string; source?: 'local' | 'supabase'; mimeType?: string };
type ImageType = 'flat' | 'model';
type ProductMode = 'apparel' | 'signage';
type SignProductId = 'banner' | 'yard-sign';
type StoreView = 'store' | 'builder';
type StoreCategoryId = 'banners' | 'coro' | 'rigid' | 'decals' | 'magnets' | 'apparel' | 'misc';
type CoroOptionPanel = 'images' | 'size' | 'material' | 'sides' | 'grommets' | 'stakes' | 'gloss' | null;
type SignFieldType = 'number' | 'select' | 'checkbox';
type SignFieldOption = { label: string; value: string };
type SignField = { name: string; label: string; type: SignFieldType; defaultValue: string | boolean; step?: string; options?: SignFieldOption[] };
type SignProductConfig = { id: SignProductId; name: string; apiSlug: string; description: string; preview: 'banner' | 'yard-sign'; fields: SignField[] };
type StoreProductCard = { id: string; category: StoreCategoryId; title: string; subtitle: string; description: string; mode: ProductMode; signProductId?: SignProductId; badge?: string; disabled?: boolean };
type SignEstimate = { ok?: boolean; product?: string; currency?: string; price?: { retail?: number | string; each?: number | string }; summary?: Record<string, unknown>; warnings?: string[]; error?: { message?: string; fields?: Record<string, string> } };
type ApparelApiEstimate = { ok?: boolean; currency?: string; price?: { retail?: number | string; each?: number | string }; summary?: Record<string, unknown>; warnings?: string[]; error?: { message?: string; fields?: Record<string, string> } };
type SanMarPreviewItem = { styleNumber: string; productName: string; brand: string; category?: string; colorName: string; availableSizes: string[]; frontModelImageUrl?: string; backModelImageUrl?: string; frontFlatImageUrl?: string; backFlatImageUrl?: string; productImageUrl?: string; colorSwatchImageUrl?: string };
type CategoryChunkSlug = 't-shirts' | 'hoodies' | 'long-sleeve' | 'sweatshirts' | 'polos' | 'bags' | 'caps' | 'other' | 'other-part-3' | 'other-part-4';
type SizeKey = 'YS' | 'YM' | 'YL' | 'YXL' | 'AS' | 'AM' | 'AL' | 'AXL' | '2XL' | '3XL' | '4XL';
type CustomerInfo = {

  name: string;
  organization: string;
  email: string;
  phone: string;
  neededByDate: string;
  notes: string;
};

type ArtworkAnalysis = {
  fileName: string;
  width: number;
  height: number;
  visibleColorCount: number;
  sampledPixelCount: number;
  transparentPixelRatio: number;
  hasTransparency: boolean;
  hasOpaqueBackground: boolean;
  hasGradientLikeDetail: boolean;
  complexity: 'Simple 1 color' | '2-3 colors' | 'Full color / photo';
  recommendation: 'Screen Print' | 'DTF' | 'Manual review';
  confidence: 'High' | 'Medium' | 'Low';
  warnings: string[];
  dominantColors: string[];
};

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zcugxtcbvkrquxeuonop.supabase.co').replace(/\/$/, '');
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_cK1tQvEVsg69SIMrrdLQpQ_Sw2ot5qb';
const SUPABASE_STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'artwork-files';
const SUPABASE_LIBRARY_PREFIX = 'test-library';
const isSupabaseStorageConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && SUPABASE_STORAGE_BUCKET);

const getSupabaseStorageHeaders = () => ({
  apikey: SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
});

const encodeStoragePath = (path: string) => path.split('/').map((part) => encodeURIComponent(part)).join('/');

const getSupabasePublicUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${encodeStoragePath(path)}`;

const getSafeStorageFileName = (name: string) => {
  const cleanName = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleanName || 'artwork-file';
};

const isPreviewableImageFile = (file: File) => file.type.startsWith('image/');

const getErrorMessage = async (response: Response) => {
  try {
    const payload = await response.json() as { message?: string; error?: string };
    return payload.message || payload.error || response.statusText;
  } catch {
    return response.statusText;
  }
};

const uploadArtworkFileToSupabase = async (file: File) => {
  if (!isSupabaseStorageConfigured) throw new Error('Supabase is not configured.');
  const storagePath = `${SUPABASE_LIBRARY_PREFIX}/${Date.now()}-${getSafeStorageFileName(file.name)}`;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${encodeStoragePath(storagePath)}`, {
    method: 'POST',
    headers: {
      ...getSupabaseStorageHeaders(),
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'false'
    },
    body: file
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return {
    storagePath,
    storageUrl: getSupabasePublicUrl(storagePath)
  };
};


type DraftPayload = {
  selectedPrintLocations?: PrintLocation[];
  locationSettings?: Record<PrintLocation, LocationSettings>;
  selectedProductId: string;
  selectedPreviewStyleNumber: string;
  selectedPreviewColorName: string;
  shirtColor: string;
  shirtView: ShirtView;
  imageType: ImageType;
  sizeQuantities: Record<SizeKey, number>;
  printMethod: string;
  imageComplexity: string;
  artworkAnalysis?: ArtworkAnalysis | null;
  customerInfo: CustomerInfo;
  printLocation: PrintLocation;
  printSizePreset: string;
  customPrintWidthInches: string;
  customPrintHeightInches: string;
  capturedDesignPreview: string | null;
};

type QuotePackagePayload = {
  selectedPrintLocations?: PrintLocation[];
  locationSettings?: Record<PrintLocation, LocationSettings>;
  customerInfo: CustomerInfo;
  selectedProductDetails: {
    styleNumber: string;
    name: string;
    brand: string;
    category: string;
    selectedProductId: string;
    selectedPreviewStyleNumber: string;
    selectedPreviewColorName: string;
  };
  selectedColor: string;
  shirtView: ShirtView;
  imageType: ImageType;
  sizeBreakdown: string;
  sizeQuantities: Record<SizeKey, number>;
  totalQuantity: number;
  printMethod: string;
  imageComplexity: string;
  artworkAnalysis?: ArtworkAnalysis | null;
  pricingEstimate: {
    setupFee: number;
    decorationCost: number;
    perShirt: number;
    recommendedMethod: 'DTF' | 'Screen Print';
  };
  quoteReadinessStatus: string;
  notes: string;
  timestamp: string;
  capturedDesignPreviewData: string | null;
  capturedDesignPreviewStatus: string;
  printLocation: PrintLocation;
  printSizePreset: string;
  customPrintWidthInches: string;
  customPrintHeightInches: string;
};

type PrintSizePreset = 'left-chest-3_5' | 'standard-front-10' | 'large-front-12' | 'full-back-12' | 'custom';
type ArtboardRect = { top: number; left: number; width: number; height: number };
type LocationSettings = { printSizePreset: PrintSizePreset; customPrintWidthInches: string; customPrintHeightInches: string; notes: string; artboard: ArtboardRect };

const LOCAL_DRAFT_KEY = 'hue-shirt-designer:draft';
const MOCKUP_CANVAS_WIDTH = 420;
const MOCKUP_CANVAS_HEIGHT = 520;

const FONT_OPTIONS: FontOption[] = [
  { label: 'Inter', value: 'Inter, Arial, sans-serif' },
  { label: 'Poppins', value: 'Poppins, Arial, sans-serif' },
  { label: 'Montserrat', value: 'Montserrat, Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier New', value: 'Courier New, monospace' }
];

const SIZE_FIELDS: SizeKey[] = ['YS', 'YM', 'YL', 'YXL', 'AS', 'AM', 'AL', 'AXL', '2XL', '3XL', '4XL'];

const COLOR_MAP: Record<string, string> = { white: '#ffffff', black: '#111111', ash: '#d1d5db', navy: '#1f365f', 'true red': '#b91c1c', 'forest green': '#166534' };
const CHUNKED_CATEGORY_LABELS: Record<CategoryChunkSlug, string> = {
  't-shirts': 'T-Shirts',
  hoodies: 'Hoodies',
  'long-sleeve': 'Long Sleeve',
  sweatshirts: 'Sweatshirts',
  polos: 'Polos',
  bags: 'Bags',
  caps: 'Caps',
  other: 'Other',
  'other-part-3': 'Other (Part 3)',
  'other-part-4': 'Other (Part 4)'
};
const PRODUCTS_PAGE_SIZE = 24;
const ALL_CATEGORY_SLUGS: CategoryChunkSlug[] = ['t-shirts', 'hoodies', 'long-sleeve', 'sweatshirts', 'polos', 'bags', 'caps', 'other', 'other-part-3', 'other-part-4'];
const STORE_CATEGORIES: { id: StoreCategoryId; label: string; description: string }[] = [
  { id: 'banners', label: 'Banners', description: 'Vinyl banners and event signs' },
  { id: 'coro', label: 'CORO', description: 'Sheet-priced coroplast signs' },
  { id: 'rigid', label: 'Rigid Signs', description: 'Acrylic, PVC, foam board, and panels' },
  { id: 'decals', label: 'Decals', description: 'Adhesive vinyl and window graphics' },
  { id: 'magnets', label: 'Magnets', description: 'Vehicle and display magnets' },
  { id: 'apparel', label: 'Apparel', description: 'Shirts and wearable print items' },
  { id: 'misc', label: 'More', description: 'Additional print-ready products' }
];
const STORE_PRODUCTS: StoreProductCard[] = [
  { id: 'banner-vinyl', category: 'banners', title: 'Vinyl Banner', subtitle: 'Indoor / outdoor banner', description: 'Upload finished banner art, check fit, and price online.', mode: 'signage', signProductId: 'banner', badge: 'Online order' },
  { id: 'coro-sheet', category: 'coro', title: 'CORO', subtitle: '48 x 96 sheet-based signs', description: 'Choose a cut size, upload finished art, and see sheet usage before ordering.', mode: 'signage', signProductId: 'yard-sign', badge: 'Sheet price' },
  { id: 'rigid-acrylic', category: 'rigid', title: 'Acrylic Signs', subtitle: 'Printed rigid panels', description: 'Rigid sign ordering is coming into this store flow next.', mode: 'signage', disabled: true, badge: 'Soon' },
  { id: 'rigid-pvc', category: 'rigid', title: 'PVC / Foam Board', subtitle: 'Indoor displays and panels', description: 'A ready-art upload flow for rigid signage.', mode: 'signage', disabled: true, badge: 'Soon' },
  { id: 'decals-vinyl', category: 'decals', title: 'Adhesive Vinyl', subtitle: 'Decals and window graphics', description: 'Upload-ready decal ordering will use the same fit checks.', mode: 'signage', disabled: true, badge: 'Soon' },
  { id: 'magnets-vehicle', category: 'magnets', title: 'Vehicle Magnets', subtitle: 'Car and truck magnets', description: 'Self-serve magnet orders will be added after signs.', mode: 'signage', disabled: true, badge: 'Soon' },
  { id: 'apparel-shirts', category: 'apparel', title: 'Custom Apparel', subtitle: 'Shirts and garments', description: 'Open the apparel designer and SanMar catalog.', mode: 'apparel', badge: 'Designer' }
];
const CORO_SHEET = { width: 48, height: 96 };
const CORO_SIZE_OPTIONS = [
  { label: '6" x 6" (128 per sheet)', value: '6x6' },
  { label: '6" x 12" (64 per sheet)', value: '6x12' },
  { label: '12" x 6" (64 per sheet)', value: '12x6' },
  { label: '8" x 12" (48 per sheet)', value: '8x12' },
  { label: '12" x 8" (48 per sheet)', value: '12x8' },
  { label: '11" x 11" (32 per sheet)', value: '11x11' },
  { label: '12" x 12" (32 per sheet)', value: '12x12' },
  { label: '12" x 18" (20 per sheet)', value: '12x18' },
  { label: '18" x 12" (20 per sheet)', value: '18x12' },
  { label: '11" x 17" (20 per sheet)', value: '11x17' },
  { label: '17" x 11" (20 per sheet)', value: '17x11' },
  { label: '12" x 24" (16 per sheet)', value: '12x24' },
  { label: '24" x 12" (16 per sheet)', value: '24x12' },
  { label: '10.5" x 29" (12 per sheet) alternate layout', value: '10.5x29' },
  { label: '24" x 18" (10 per sheet)', value: '24x18' },
  { label: '18" x 24" (10 per sheet)', value: '18x24' },
  { label: '24" x 24" (8 per sheet)', value: '24x24' },
  { label: '18" x 36" (6 per sheet)', value: '18x36' },
  { label: '36" x 18" (6 per sheet)', value: '36x18' },
  { label: '24" x 36" (4 per sheet)', value: '24x36' },
  { label: '36" x 24" (4 per sheet)', value: '36x24' },
  { label: '48" x 24" (4 per sheet)', value: '48x24' },
  { label: '24" x 48" (4 per sheet)', value: '24x48' },
  { label: '32" x 48" (2 per sheet)', value: '32x48' },
  { label: '48" x 32" (2 per sheet)', value: '48x32' },
  { label: '48" x 48" (2 per sheet)', value: '48x48' },
  { label: '48" x 96" (1 per sheet)', value: '48x96' }
];
const SIGN_PRODUCT_CONFIGS: SignProductConfig[] = [
  {
    id: 'banner',
    name: 'Vinyl Banner',
    apiSlug: 'banner',
    description: 'Indoor and outdoor vinyl banners with finishing options.',
    preview: 'banner',
    fields: [
      { name: 'width', label: 'Width (inches)', type: 'number', defaultValue: '36', step: '0.25' },
      { name: 'height', label: 'Height (inches)', type: 'number', defaultValue: '24', step: '0.25' },
      { name: 'quantity', label: 'Quantity', type: 'number', defaultValue: '1', step: '1' },
      {
        name: 'material',
        label: 'Material',
        type: 'select',
        defaultValue: '13-single',
        options: [
          { label: '13oz Single-Sided', value: '13-single' },
          { label: '15oz Single-Sided', value: '15-single' },
          { label: '18oz Single-Sided', value: '18-single' },
          { label: '18oz Double-Sided', value: '18-double' }
        ]
      },
      { name: 'polePocket', label: 'Pole Pocket', type: 'checkbox', defaultValue: false },
      { name: 'rope', label: 'Rope', type: 'checkbox', defaultValue: false },
      { name: 'windSlits', label: 'Wind Slits', type: 'checkbox', defaultValue: false },
      { name: 'rush', label: 'Rush', type: 'checkbox', defaultValue: false }
    ]
  },
  {
    id: 'yard-sign',
    name: 'CORO',
    apiSlug: 'yard-sign',
    description: 'Sheet-priced coroplast signs with preset cut sizes.',
    preview: 'yard-sign',
    fields: [
      {
        name: 'size',
        label: 'Size',
        type: 'select',
        defaultValue: '24x18',
        options: CORO_SIZE_OPTIONS
      },
      { name: 'quantity', label: 'Quantity', type: 'number', defaultValue: '10', step: '1' },
      {
        name: 'material',
        label: 'Material',
        type: 'select',
        defaultValue: '4mm',
        options: [
          { label: '4mm CORO', value: '4mm' },
          { label: '10mm CORO', value: '10mm' }
        ]
      },
      {
        name: 'sides',
        label: 'Print Sides',
        type: 'select',
        defaultValue: 'single',
        options: [
          { label: 'Single-Sided', value: 'single' },
          { label: 'Double-Sided', value: 'double' }
        ]
      },
      { name: 'grommets', label: 'Grommets', type: 'checkbox', defaultValue: false },
      { name: 'stepStakes', label: 'Step Stakes', type: 'number', defaultValue: '0', step: '1' },
      { name: 'gloss', label: 'Gloss', type: 'checkbox', defaultValue: false },
      {
        name: 'stakeType',
        label: 'Stakes',
        type: 'select',
        defaultValue: 'standard',
        options: [
          { label: 'No Stakes', value: 'none' },
          { label: 'Standard Stakes', value: 'standard' },
          { label: 'Heavy-Duty Stakes', value: 'heavy-duty' }
        ]
      }
    ]
  }
];

const CHUNKED_CATEGORY_LOAD_MESSAGES: Record<CategoryChunkSlug, string> = {
  't-shirts': 'Loading T-Shirts…',
  hoodies: 'Loading Hoodies…',
  'long-sleeve': 'Loading Long Sleeve…',
  sweatshirts: 'Loading Sweatshirts…',
  polos: 'Loading Polos…',
  bags: 'Loading Bags…',
  caps: 'Loading Caps…',
  other: 'Loading Other…',
  'other-part-3': 'Loading Other (Part 3)…',
  'other-part-4': 'Loading Other (Part 4)…'
};

const swapImageToken = (url: string, nextType: ImageType, nextView: ShirtView) => {
  const typeToken = nextType === 'flat' ? 'flat' : 'model';
  const viewToken = nextView === 'front' ? 'front' : 'back';
  let nextUrl = url;
  nextUrl = nextUrl.replace(/_(model|flat)_/i, `_${typeToken}_`);
  nextUrl = nextUrl.replace(/_(front|back)\./i, `_${viewToken}.`);
  return nextUrl;
};

const getImageCandidates = (item: SanMarPreviewItem | undefined, type: ImageType, view: ShirtView) => {
  if (!item) return [];
  const direct = type === 'flat'
    ? (view === 'front' ? item.frontFlatImageUrl : item.backFlatImageUrl)
    : (view === 'front' ? item.frontModelImageUrl : item.backModelImageUrl);
  const oppositeView = type === 'flat'
    ? (view === 'front' ? item.backFlatImageUrl : item.frontFlatImageUrl)
    : (view === 'front' ? item.backModelImageUrl : item.frontModelImageUrl);
  const fallbackTypePrimary = type === 'flat'
    ? (view === 'front' ? item.frontModelImageUrl : item.backModelImageUrl)
    : (view === 'front' ? item.frontFlatImageUrl : item.backFlatImageUrl);
  const tokenSource = direct || fallbackTypePrimary || item.productImageUrl;
  const tokenCandidates = tokenSource ? [
    swapImageToken(tokenSource, type, view),
    swapImageToken(tokenSource, type === 'flat' ? 'model' : 'flat', view),
    swapImageToken(tokenSource, type, view === 'front' ? 'back' : 'front')
  ] : [];
  return Array.from(new Set([direct, oppositeView, fallbackTypePrimary, item.productImageUrl, item.productImageUrl, ...tokenCandidates].filter(Boolean) as string[]));
};


const normalizeLocationSettings = (raw?: Partial<Record<PrintLocation, Partial<LocationSettings>>>): Record<PrintLocation, LocationSettings> => ({
  'left-chest': {
    printSizePreset: (raw?.['left-chest']?.printSizePreset as PrintSizePreset) || 'left-chest-3_5',
    customPrintWidthInches: raw?.['left-chest']?.customPrintWidthInches || '',
    customPrintHeightInches: raw?.['left-chest']?.customPrintHeightInches || '',
    notes: raw?.['left-chest']?.notes || '',
    artboard: { ...(raw?.['left-chest']?.artboard || PRINT_AREA_CONFIG['left-chest']) }
  },
  'full-front': {
    printSizePreset: (raw?.['full-front']?.printSizePreset as PrintSizePreset) || 'standard-front-10',
    customPrintWidthInches: raw?.['full-front']?.customPrintWidthInches || '',
    customPrintHeightInches: raw?.['full-front']?.customPrintHeightInches || '',
    notes: raw?.['full-front']?.notes || '',
    artboard: { ...(raw?.['full-front']?.artboard || PRINT_AREA_CONFIG['full-front']) }
  },
  'full-back': {
    printSizePreset: (raw?.['full-back']?.printSizePreset as PrintSizePreset) || 'full-back-12',
    customPrintWidthInches: raw?.['full-back']?.customPrintWidthInches || '',
    customPrintHeightInches: raw?.['full-back']?.customPrintHeightInches || '',
    notes: raw?.['full-back']?.notes || '',
    artboard: { ...(raw?.['full-back']?.artboard || PRINT_AREA_CONFIG['full-back']) }
  },
  sleeve: {
    printSizePreset: (raw?.sleeve?.printSizePreset as PrintSizePreset) || 'custom',
    customPrintWidthInches: raw?.sleeve?.customPrintWidthInches || '',
    customPrintHeightInches: raw?.sleeve?.customPrintHeightInches || '',
    notes: raw?.sleeve?.notes || '',
    artboard: { ...(raw?.sleeve?.artboard || PRINT_AREA_CONFIG.sleeve) }
  }
});

const PRODUCT_IMAGE_PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="8" fill="#f1f5f9"/><path d="M22 30l10-8h32l10 8 8 12-10 8-6-8v32a4 4 0 0 1-4 4H34a4 4 0 0 1-4-4V42l-6 8-10-8z" fill="#cbd5e1" stroke="#94a3b8" stroke-width="2"/><text x="48" y="88" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#64748b">No Image</text></svg>');
const FABRIC_CONTROL_STYLE = {
  cornerColor: '#0f766e',
  cornerStrokeColor: '#ecfeff',
  cornerStyle: 'circle' as const,
  cornerSize: 12,
  touchCornerSize: 26,
  borderColor: '#0f766e',
  borderScaleFactor: 1.5,
  transparentCorners: false
};

const rgbToHex = (r: number, g: number, b: number) => `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

const getDefaultSignValues = (product: SignProductConfig) => Object.fromEntries(product.fields.map((field) => [field.name, field.defaultValue])) as Record<string, string | boolean>;

const toSignPricingPayload = (product: SignProductConfig, values: Record<string, string | boolean>): Record<string, string | number | boolean> => {
  if (product.id === 'yard-sign') {
    return {
      quantity: Number(values.quantity),
      sides: values.sides || 'single',
      stakeType: Number(values.stepStakes || 0) > 0 ? 'standard' : values.stakeType || 'none'
    };
  }

  return Object.fromEntries(product.fields.map((field) => {
    const value = values[field.name];
    return [field.name, field.type === 'number' ? Number(value) : value];
  }));
};

const getSignQuantity = (values: Record<string, string | boolean>) => {
  const quantity = Number(values.quantity);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
};

const parseCoroSize = (value: string | boolean | undefined) => {
  if (typeof value !== 'string') return { width: 24, height: 18 };
  const [rawWidth, rawHeight] = value.split('x').map((part) => Number(part));
  return {
    width: Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 24,
    height: Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 18
  };
};

const getCoroSheetLayout = (width: number, height: number, quantity: number) => {
  const normal = {
    columns: Math.max(1, Math.floor(CORO_SHEET.width / Math.max(1, width))),
    rows: Math.max(1, Math.floor(CORO_SHEET.height / Math.max(1, height))),
    rotated: false
  };
  const rotated = {
    columns: Math.max(1, Math.floor(CORO_SHEET.width / Math.max(1, height))),
    rows: Math.max(1, Math.floor(CORO_SHEET.height / Math.max(1, width))),
    rotated: true
  };
  const normalCount = normal.columns * normal.rows;
  const rotatedCount = rotated.columns * rotated.rows;
  const best = rotatedCount > normalCount ? rotated : normal;
  const signsPerSheet = Math.max(1, best.columns * best.rows);
  return {
    ...best,
    signsPerSheet,
    sheetCount: Math.max(1, Math.ceil(quantity / signsPerSheet))
  };
};

const formatSignPrice = (value: number | string | undefined, currency = 'USD') => {
  if (typeof value === 'number') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  }

  return value || 'Request pricing';
};

const numericPrice = (value: number | string | undefined) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getSignOptionLabel = (field: SignField, value: string | boolean) => {
  if (typeof value === 'boolean') return value ? field.label : '';
  return field.options?.find((option) => option.value === value)?.label || value;
};

const getSignConfigurationText = (product: SignProductConfig, values: Record<string, string | boolean>) => product.fields.map((field) => {
  const value = values[field.name];
  if (field.type === 'checkbox') return value ? field.label : '';
  return `${field.label}: ${getSignOptionLabel(field, value)}`;
}).filter(Boolean).join(', ');

const resolveDtfPlacement = (location: PrintLocation) => {
  if (location === 'full-back') return 'back';
  if (location === 'left-chest') return 'leftChest';
  if (location === 'sleeve') return 'leftSleeve';
  return 'front';
};

const resolveLocationSize = (settings: LocationSettings) => {
  if (settings.printSizePreset === 'left-chest-3_5') return { width: 3.5, height: 3.5 };
  if (settings.printSizePreset === 'standard-front-10') return { width: 10, height: 12 };
  if (settings.printSizePreset === 'large-front-12') return { width: 12, height: 14 };
  if (settings.printSizePreset === 'full-back-12') return { width: 12, height: 14 };

  const width = Number(settings.customPrintWidthInches);
  const height = Number(settings.customPrintHeightInches);
  return {
    width: Number.isFinite(width) && width > 0 ? width : 10,
    height: Number.isFinite(height) && height > 0 ? height : 12
  };
};

const analyzeArtworkImage = (file: File, dataUrl: string): Promise<ArtworkAnalysis> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    const maxSampleDimension = 240;
    const scale = Math.min(1, maxSampleDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
      reject(new Error('Could not read artwork pixels.'));
      return;
    }

    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const colorBuckets = new Map<string, { count: number; r: number; g: number; b: number }>();
    const detailedBuckets = new Set<string>();
    let visiblePixels = 0;
    let transparentPixels = 0;
    let edgePixels = 0;
    const quantize = 32;
    const detailedQuantize = 12;

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 24) {
        transparentPixels += 1;
        continue;
      }

      visiblePixels += 1;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const bucketR = Math.min(255, Math.round(r / quantize) * quantize);
      const bucketG = Math.min(255, Math.round(g / quantize) * quantize);
      const bucketB = Math.min(255, Math.round(b / quantize) * quantize);
      const key = `${bucketR},${bucketG},${bucketB}`;
      const current = colorBuckets.get(key) || { count: 0, r: bucketR, g: bucketG, b: bucketB };
      current.count += 1;
      colorBuckets.set(key, current);
      detailedBuckets.add(`${Math.round(r / detailedQuantize)},${Math.round(g / detailedQuantize)},${Math.round(b / detailedQuantize)}`);

      if (index % (width * 4) < 4 || index % (width * 4) >= (width - 1) * 4 || index < width * 4 || index >= pixels.length - width * 4) {
        edgePixels += 1;
      }
    }

    const significantColors = Array.from(colorBuckets.values())
      .filter((bucket) => visiblePixels > 0 && bucket.count / visiblePixels >= 0.006)
      .sort((a, b) => b.count - a.count);
    const visibleColorCount = Math.max(1, significantColors.length);
    const transparentPixelRatio = (transparentPixels / Math.max(1, transparentPixels + visiblePixels));
    const hasTransparency = transparentPixelRatio > 0.03;
    const edgeFillRatio = edgePixels / Math.max(1, (width * 2) + (height * 2) - 4);
    const hasOpaqueBackground = !hasTransparency && edgeFillRatio > 0.6;
    const hasGradientLikeDetail = detailedBuckets.size > Math.max(40, visibleColorCount * 10);
    const warnings: string[] = [];

    if (image.naturalWidth < 900 || image.naturalHeight < 900) warnings.push('Low resolution may need review before production.');
    if (hasOpaqueBackground) warnings.push('Artwork appears to have a solid background.');
    if (visibleColorCount > 4) warnings.push('More than 4 color families makes screen print less predictable.');
    if (hasGradientLikeDetail) warnings.push('Gradient/photo-like detail detected.');

    const complexity: ArtworkAnalysis['complexity'] = hasGradientLikeDetail || visibleColorCount > 6
      ? 'Full color / photo'
      : visibleColorCount <= 2
        ? 'Simple 1 color'
        : '2-3 colors';
    const recommendation: ArtworkAnalysis['recommendation'] = complexity === 'Full color / photo' || hasOpaqueBackground
      ? 'DTF'
      : visibleColorCount <= 4
        ? 'Screen Print'
        : 'Manual review';
    const confidence: ArtworkAnalysis['confidence'] = warnings.length >= 2 ? 'Medium' : warnings.length === 1 ? 'Medium' : 'High';

    resolve({
      fileName: file.name,
      width: image.naturalWidth,
      height: image.naturalHeight,
      visibleColorCount,
      sampledPixelCount: visiblePixels,
      transparentPixelRatio,
      hasTransparency,
      hasOpaqueBackground,
      hasGradientLikeDetail,
      complexity,
      recommendation,
      confidence,
      warnings,
      dominantColors: significantColors.slice(0, 6).map((color) => rgbToHex(color.r, color.g, color.b)),
    });
  };
  image.onerror = () => reject(new Error('Could not load artwork for analysis.'));
  image.src = dataUrl;
});

const getProductCardImage = (item: SanMarPreviewItem | undefined) => {
  if (!item) return PRODUCT_IMAGE_PLACEHOLDER;
  return item.frontFlatImageUrl || item.productImageUrl || item.frontModelImageUrl || item.colorSwatchImageUrl || PRODUCT_IMAGE_PLACEHOLDER;
};

export default function Home() {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const [storeView, setStoreView] = useState<StoreView>('store');
  const [storeCategory, setStoreCategory] = useState<StoreCategoryId>('coro');
  const [coroSizeSearch, setCoroSizeSearch] = useState('');
  const [productMode, setProductMode] = useState<ProductMode>('signage');
  const [signProductId, setSignProductId] = useState<SignProductId>('banner');
  const selectedSignProduct = useMemo(() => SIGN_PRODUCT_CONFIGS.find((product) => product.id === signProductId) || SIGN_PRODUCT_CONFIGS[0], [signProductId]);
  const [signValues, setSignValues] = useState<Record<string, string | boolean>>(() => getDefaultSignValues(SIGN_PRODUCT_CONFIGS[0]));
  const [signEstimate, setSignEstimate] = useState<SignEstimate | null>(null);
  const [signEstimateStatus, setSignEstimateStatus] = useState('');
  const [isSignEstimateLoading, setIsSignEstimateLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(SAMPLE_PRODUCT_CATALOG[0].id);
  const selectedProduct = useMemo<ProductCatalogItem>(() => SAMPLE_PRODUCT_CATALOG.find((item) => item.id === selectedProductId) || SAMPLE_PRODUCT_CATALOG[0], [selectedProductId]);
  const [shirtColor, setShirtColor] = useState(selectedProduct.availableColors[0].value);
  const [shirtView, setShirtView] = useState<ShirtView>('front');
  const [selectedPrintLocations, setSelectedPrintLocations] = useState<PrintLocation[]>([SAMPLE_PRODUCT_CATALOG[0].defaultPrintLocations[0]]);
  const [printLocation, setPrintLocation] = useState<PrintLocation>(SAMPLE_PRODUCT_CATALOG[0].defaultPrintLocations[0]);
  const [locationSettings, setLocationSettings] = useState<Record<PrintLocation, LocationSettings>>({
    'left-chest': { printSizePreset: 'left-chest-3_5', customPrintWidthInches: '', customPrintHeightInches: '', notes: '', artboard: { ...PRINT_AREA_CONFIG['left-chest'] } },
    'full-front': { printSizePreset: 'standard-front-10', customPrintWidthInches: '', customPrintHeightInches: '', notes: '', artboard: { ...PRINT_AREA_CONFIG['full-front'] } },
    'full-back': { printSizePreset: 'full-back-12', customPrintWidthInches: '', customPrintHeightInches: '', notes: '', artboard: { ...PRINT_AREA_CONFIG['full-back'] } },
    sleeve: { printSizePreset: 'custom', customPrintWidthInches: '', customPrintHeightInches: '', notes: '', artboard: { ...PRINT_AREA_CONFIG.sleeve } }
  });
  const [textValue, setTextValue] = useState('Your text');
  const [activeObject, setActiveObject] = useState<FabricObject | null>(null);
  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0].value);
  const [fontSize, setFontSize] = useState(30);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [textColor, setTextColor] = useState('#111827');
  const [zoom, setZoom] = useState(1);
  const [layers, setLayers] = useState<LayerItem[]>([]);
  const fallbackPreviewCatalog = useMemo<SanMarPreviewItem[]>(() => {
    const generated = (generatedSanMarCatalog as SanMarPreviewItem[]);
    return generated.length > 0 ? generated : (fallbackSanMarPreview as unknown as SanMarPreviewItem[]);
  }, []);
  const [previewCatalog, setPreviewCatalog] = useState<SanMarPreviewItem[]>(fallbackPreviewCatalog);
  const [globalCatalog, setGlobalCatalog] = useState<SanMarPreviewItem[]>(fallbackPreviewCatalog);
  const [visibleProductCount, setVisibleProductCount] = useState(PRODUCTS_PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPreviewId, setSelectedPreviewId] = useState(0);
  const [brandFilter, setBrandFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isCategoryCatalogLoading, setIsCategoryCatalogLoading] = useState(false);
  const [categoryCatalogStatus, setCategoryCatalogStatus] = useState('Loaded category file: t-shirts.generated.json');
  const [sortOption, setSortOption] = useState<'style' | 'name' | 'brand'>('style');
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [showPrintArtboard, setShowPrintArtboard] = useState(true);
  const [showAdvancedArtboard, setShowAdvancedArtboard] = useState(false);
  const hasActiveCatalogFilters = searchQuery.trim().length > 0 || brandFilter !== 'all' || categoryFilter !== 'all';
  const [imageType, setImageType] = useState<ImageType>('flat');
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(null);
  const [imageFallbackUsed, setImageFallbackUsed] = useState(false);
  const [sizeQuantities, setSizeQuantities] = useState<Record<SizeKey, number>>({
    YS: 0, YM: 0, YL: 0, YXL: 0, AS: 0, AM: 0, AL: 0, AXL: 0, '2XL': 0, '3XL': 0, '4XL': 0
  });
  const [printMethod, setPrintMethod] = useState('Not sure / Recommend for me');
  const [imageComplexity, setImageComplexity] = useState('Simple 1 color');
  const [artworkAnalysis, setArtworkAnalysis] = useState<ArtworkAnalysis | null>(null);
  const [artworkAnalysisStatus, setArtworkAnalysisStatus] = useState('');
  const [signArtworkSize, setSignArtworkSize] = useState<{ width: number; height: number } | null>(null);
  const [signArtworkPreviewUrl, setSignArtworkPreviewUrl] = useState<string | null>(null);
  const [coroSheetArtworkItems, setCoroSheetArtworkItems] = useState<ImageZoneItem[]>([]);
  const [coroMultipleImages, setCoroMultipleImages] = useState(false);
  const [showImageZone, setShowImageZone] = useState(false);
  const [imageZoneItems, setImageZoneItems] = useState<ImageZoneItem[]>([]);
  const [selectedImageZoneId, setSelectedImageZoneId] = useState<string | null>(null);
  const [imageLibraryStatus, setImageLibraryStatus] = useState('');
  const [isImageLibraryLoading, setIsImageLibraryLoading] = useState(false);
  const [activeCoroOptionPanel, setActiveCoroOptionPanel] = useState<CoroOptionPanel>(null);
  const [apparelEstimate, setApparelEstimate] = useState<ApparelApiEstimate | null>(null);
  const [apparelEstimateMethod, setApparelEstimateMethod] = useState<'dtf' | 'screen_print' | null>(null);
  const [apparelEstimateStatus, setApparelEstimateStatus] = useState('');
  const [isApparelEstimateLoading, setIsApparelEstimateLoading] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({ name: '', organization: '', email: '', phone: '', neededByDate: '', notes: '' });
  const [capturedDesignPreview, setCapturedDesignPreview] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState('');
  const [quotePackageStatus, setQuotePackageStatus] = useState('');
  const importQuotePackageInputRef = useRef<HTMLInputElement | null>(null);
  const artworkUploadInputRef = useRef<HTMLInputElement | null>(null);
  const imageZoneUploadInputRef = useRef<HTMLInputElement | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  useEffect(() => {
    if (!isSupabaseStorageConfigured) {
      setImageLibraryStatus('Supabase storage is not configured. Uploads will stay in this browser session.');
      return;
    }
    let mounted = true;
    const loadImageLibrary = async () => {
      setIsImageLibraryLoading(true);
      try {
        const response = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}`, {
          method: 'POST',
          headers: {
            ...getSupabaseStorageHeaders(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prefix: SUPABASE_LIBRARY_PREFIX,
            limit: 100,
            offset: 0,
            sortBy: { column: 'created_at', order: 'desc' }
          })
        });
        if (!response.ok) throw new Error(await getErrorMessage(response));
        const files = await response.json() as Array<{ id?: string; name: string; updated_at?: string; created_at?: string; metadata?: { size?: number; mimetype?: string } }>;
        if (!mounted) return;
        const remoteItems = files
          .filter((file) => file.name && file.name !== '.emptyFolderPlaceholder')
          .map((file) => {
            const storagePath = `${SUPABASE_LIBRARY_PREFIX}/${file.name}`;
            return {
              id: file.id || storagePath,
              name: file.name,
              dataUrl: getSupabasePublicUrl(storagePath),
              width: 0,
              height: 0,
              dpi: 300,
              uploadedAt: file.updated_at || file.created_at || 'Supabase',
              storagePath,
              storageUrl: getSupabasePublicUrl(storagePath),
              source: 'supabase' as const,
              mimeType: file.metadata?.mimetype
            };
          });
        setImageZoneItems((prev) => {
          const localItems = prev.filter((item) => item.source !== 'supabase');
          return [...remoteItems, ...localItems];
        });
        setImageLibraryStatus(`Connected to Supabase library. ${remoteItems.length} stored file${remoteItems.length === 1 ? '' : 's'} found.`);
      } catch (error) {
        if (!mounted) return;
        setImageLibraryStatus(`Supabase library not readable yet: ${error instanceof Error ? error.message : 'unknown error'}. Local previews still work.`);
      } finally {
        if (mounted) setIsImageLibraryLoading(false);
      }
    };
    void loadImageLibrary();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    setSignValues(getDefaultSignValues(selectedSignProduct));
    setSignEstimate(null);
    setSignEstimateStatus('');
  }, [selectedSignProduct]);

  const activeLocationSettings = locationSettings[printLocation];
  const printSizePreset = activeLocationSettings.printSizePreset;
  const customPrintWidthInches = activeLocationSettings.customPrintWidthInches;
  const customPrintHeightInches = activeLocationSettings.customPrintHeightInches;
  const designArea = useMemo(() => locationSettings[printLocation]?.artboard || PRINT_AREA_CONFIG[printLocation], [locationSettings, printLocation]);
  const designAreaRef = useRef(designArea);
  const productModeRef = useRef(productMode);
  const GARMENT_BOUNDS = { left: 0.24, top: 0.16, width: 0.52, height: 0.72 };
  const artboardPercent = {
    top: (designArea.top / 520) * 100,
    left: (designArea.left / 420) * 100,
    width: (designArea.width / 420) * 100,
    height: (designArea.height / 520) * 100
  };
  const centerArtboardOnShirt = () => {
    const width = designArea.width;
    const height = designArea.height;
    const shirtLeft = GARMENT_BOUNDS.left * 420;
    const shirtTop = GARMENT_BOUNDS.top * 520;
    const shirtWidth = GARMENT_BOUNDS.width * 420;
    const shirtHeight = GARMENT_BOUNDS.height * 520;
    const next = {
      left: Math.round(shirtLeft + (shirtWidth - width) / 2),
      top: Math.round(shirtTop + (shirtHeight - height) / 2),
      width,
      height
    };
    setLocationSettings((prev) => ({ ...prev, [printLocation]: { ...prev[printLocation], artboard: next } }));
  };
  const selectedPreview = previewCatalog[selectedPreviewId];
  const groupedStyles = useMemo(() => {
    const groups = new Map<string, SanMarPreviewItem[]>();
    previewCatalog.forEach((item) => {
      const key = item.styleNumber;
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    });

    return Array.from(groups.entries()).map(([styleNumber, items]) => ({
      styleNumber,
      items,
      name: items[0]?.productName || '',
      brand: items[0]?.brand || '',
      category: items[0]?.category || ''
    }));
  }, [previewCatalog]);

  const groupedStylesFromGlobalCatalog = useMemo(() => {
    const groups = new Map<string, SanMarPreviewItem[]>();
    globalCatalog.forEach((item) => {
      const key = item.styleNumber;
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    });

    return Array.from(groups.entries()).map(([styleNumber, items]) => ({
      styleNumber,
      items,
      name: items[0]?.productName || '',
      brand: items[0]?.brand || '',
      category: items[0]?.category || ''
    }));
  }, [globalCatalog]);

  const totalSampleRowsLoaded = previewCatalog.length;
  const totalUniqueStyles = groupedStyles.length;


  const catalogAudit = catalogAuditData as { totalUsableCatalogRows?: number; totalUniqueStyles?: number; missingUnclassifiedRowCount?: number };
  const categoriesLoadedCount = useMemo(() => new Set(globalCatalog.map((item) => item.category || 'Uncategorized')).size, [globalCatalog]);
  const brandsLoadedCount = useMemo(() => new Set(globalCatalog.map((item) => item.brand).filter(Boolean)).size, [globalCatalog]);
  const generatedCatalogFilesDetected = ALL_CATEGORY_SLUGS.length;
  const currentlyLoadedCategoryFiles = categoryFilter === 'all' ? ALL_CATEGORY_SLUGS : [categoryFilter as CategoryChunkSlug];
  const topBrands = useMemo(() => Array.from(globalCatalog.reduce((acc, item) => {
    if (!item.brand) return acc;
    acc.set(item.brand, (acc.get(item.brand) || 0) + 1);
    return acc;
  }, new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1]).slice(0, 8), [globalCatalog]);
  const categoryBreakdown = useMemo(() => {
    const rowCounts = new Map<string, number>();
    const styleSets = new Map<string, Set<string>>();
    globalCatalog.forEach((item) => {
      const category = item.category || 'Uncategorized';
      rowCounts.set(category, (rowCounts.get(category) || 0) + 1);
      const styleSet = styleSets.get(category) || new Set<string>();
      styleSet.add(item.styleNumber);
      styleSets.set(category, styleSet);
    });
    return Array.from(rowCounts.entries()).map(([category, rows]) => ({
      category,
      rows,
      uniqueStyles: styleSets.get(category)?.size || 0,
      status: rows > 0 ? 'Loaded' : 'Generated only'
    })).sort((a, b) => b.rows - a.rows).slice(0, 12);
  }, [globalCatalog]);
  const missingCoverageRows = catalogAudit.missingUnclassifiedRowCount || 0;
  const coverageRatio = catalogAudit.totalUsableCatalogRows ? Math.min(1, globalCatalog.length / catalogAudit.totalUsableCatalogRows) : 0;
  const catalogHealth = coverageRatio < 0.25 ? 'Limited Sample' : coverageRatio < 0.6 ? 'Partial Catalog' : coverageRatio < 0.9 ? 'Mostly Complete' : 'Near Full Coverage';
  const approxLoadedJsonSizeKb = (new Blob([JSON.stringify(globalCatalog)]).size / 1024).toFixed(1);

  const filteredPreviewCatalog = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const sourceGroups = searchQuery.trim() ? groupedStylesFromGlobalCatalog : groupedStyles;

    return sourceGroups.filter((group) => {
      if (brandFilter !== 'all' && group.brand !== brandFilter) return false;
      if (!query) return true;

      const groupMatch = [group.styleNumber, group.name, group.brand, group.category]
        .some((value) => value.toLowerCase().includes(query));
      if (groupMatch) return true;

      return group.items.some((item) => [item.styleNumber, item.productName, item.brand, item.category || '', item.colorName, item.productImageUrl || '', item.frontModelImageUrl || '', item.backModelImageUrl || '', item.frontFlatImageUrl || '', item.backFlatImageUrl || '', item.productImageUrl || '']
        .some((value) => value.toLowerCase().includes(query)));
    });
  }, [brandFilter, groupedStyles, groupedStylesFromGlobalCatalog, searchQuery]);

  const sortedPreviewCatalog = useMemo(() => {
    return [...filteredPreviewCatalog].sort((a, b) => {
      if (sortOption === 'name') return a.name.localeCompare(b.name);
      if (sortOption === 'brand') return a.brand.localeCompare(b.brand);
      return a.styleNumber.localeCompare(b.styleNumber);
    });
  }, [filteredPreviewCatalog, sortOption]);

  const brandOptions = useMemo(() => Array.from(new Set((searchQuery.trim() ? groupedStylesFromGlobalCatalog : groupedStyles).map((group) => group.brand).filter(Boolean))).sort(), [groupedStyles, groupedStylesFromGlobalCatalog, searchQuery]);
  const categoryOptions = useMemo(() => Object.entries(CHUNKED_CATEGORY_LABELS).map(([value, label]) => ({ value, label })), []);
  const pagedPreviewCatalog = useMemo(() => sortedPreviewCatalog.slice(0, visibleProductCount), [sortedPreviewCatalog, visibleProductCount]);
  const hasMoreProducts = pagedPreviewCatalog.length < sortedPreviewCatalog.length;
  const hasPreviewImage = Boolean(resolvedImageUrl);
  const totalQuantity = useMemo(() => Object.values(sizeQuantities).reduce((sum, qty) => sum + qty, 0), [sizeQuantities]);
  const isSimpleArtwork = imageComplexity === 'Simple 1 color' || imageComplexity === '2-3 colors';
  const isFullColorArtwork = imageComplexity === 'Full color / photo';
  const printRecommendation = useMemo(() => {
    if (totalQuantity < 24) return { method: 'DTF', reason: 'Lower quantities are usually best suited for DTF.', badge: 'Recommended: DTF', reviewNeeded: false };
    if (totalQuantity <= 47 && isFullColorArtwork) return { method: 'DTF', reason: 'Mid-size orders with full-color artwork are usually better with DTF.', badge: 'Recommended: DTF', reviewNeeded: false };
    if (totalQuantity <= 47 && isSimpleArtwork) return { method: 'Either method', reason: 'At this quantity and artwork complexity, DTF or Screen Print can work well.', badge: 'Review Needed', reviewNeeded: true };
    if (totalQuantity >= 48 && isSimpleArtwork) return { method: 'Screen Print', reason: 'Higher quantities with simpler artwork usually benefit from Screen Print.', badge: 'Recommended: Screen Print', reviewNeeded: false };
    return { method: 'DTF or artwork review needed', reason: 'High quantity with full-color artwork may still fit DTF, but should be reviewed.', badge: 'Review Needed', reviewNeeded: true };
  }, [isFullColorArtwork, isSimpleArtwork, totalQuantity]);
  const recommendationBadgeClass = printRecommendation.badge === 'Recommended: DTF'
    ? 'bg-indigo-100 text-indigo-700'
    : printRecommendation.badge === 'Recommended: Screen Print'
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-amber-100 text-amber-700';
  const manualMethodWarning = useMemo(() => {
    if (printMethod === 'Not sure / Recommend for me') return '';
    if (printMethod === 'DTF' && totalQuantity >= 48 && isSimpleArtwork) return 'DTF works, but Screen Print may be more ideal for high-quantity simple artwork.';
    if (printMethod === 'Screen Print' && totalQuantity < 24) return 'Screen Print works, but DTF is usually more practical for low quantities.';
    if (printMethod === 'Screen Print' && isFullColorArtwork) return 'Screen Print may be less ideal for full-color/photo artwork; DTF is often preferred.';
    return '';
  }, [isFullColorArtwork, isSimpleArtwork, printMethod, totalQuantity]);
  const formatPrintSizeLabel = (settings: LocationSettings) => settings.printSizePreset === 'left-chest-3_5'
    ? 'Left Chest: 3.5" wide'
    : settings.printSizePreset === 'standard-front-10'
      ? 'Standard Front: 10" wide'
      : settings.printSizePreset === 'large-front-12'
        ? 'Large Front: 12" wide'
        : settings.printSizePreset === 'full-back-12'
          ? 'Full Back: 12" wide'
          : `Custom Size: ${settings.customPrintWidthInches || 'N/A'}" W${settings.customPrintHeightInches ? ` × ${settings.customPrintHeightInches}" H` : ''}`;
  const selectedPrintLocationLabel = PRINT_AREA_CONFIG[printLocation].label;
  const selectedPrintSizeLabel = formatPrintSizeLabel(activeLocationSettings);
  const selectedLocationDetails = selectedPrintLocations.map((location) => ({ location, label: PRINT_AREA_CONFIG[location].label, sizeLabel: formatPrintSizeLabel(locationSettings[location]), notes: locationSettings[location]?.notes || 'No notes', artboard: locationSettings[location]?.artboard || PRINT_AREA_CONFIG[location] }));
  const estimatedLocationName = printLocation === 'full-front' ? 'Front' : printLocation === 'full-back' ? 'Back' : printLocation === 'sleeve' ? 'Sleeve' : 'Left Chest';
  const estimatedColorCount: 1 | 2 | 3 | 4 = imageComplexity === 'Simple 1 color' ? 1 : imageComplexity === '2-3 colors' ? 3 : 4;
  const estimatedDtfSize = imageComplexity === 'Simple 1 color' ? { width: 10, height: 10 } : imageComplexity === '2-3 colors' ? { width: 11, height: 11 } : { width: 12, height: 12 };
  const dtfEstimate = useMemo(() => calculateDtfPricing({ pieces: [{ ...estimatedDtfSize, quantity: totalQuantity }] }), [estimatedDtfSize, totalQuantity]);
  const screenEstimate = useMemo(() => calculateScreenPrintPricing({ quantity: totalQuantity, setupFeeEnabled: true, locations: [{ name: estimatedLocationName, colors: estimatedColorCount }] }), [estimatedColorCount, estimatedLocationName, totalQuantity]);
  const recommendationByCost = useMemo(() => recommendPrintMethodByCost({ pieces: [{ ...estimatedDtfSize, quantity: totalQuantity }] }, { quantity: totalQuantity, setupFeeEnabled: true, locations: [{ name: estimatedLocationName, colors: estimatedColorCount }] }), [estimatedColorCount, estimatedDtfSize, estimatedLocationName, totalQuantity]);
  const estimatedMethod = printMethod === 'Not sure / Recommend for me' ? recommendationByCost.recommendedMethod : printMethod === 'DTF' ? 'dtf' : 'screen_print';
  const estimatedSetupFee = estimatedMethod === 'screen_print' ? screenEstimate.setupFee : 0;
  const estimatedDecorationCost = estimatedMethod === 'screen_print' ? screenEstimate.totalPrintCharge : dtfEstimate.totalCost;
  const estimatedPerShirt = totalQuantity > 0 ? estimatedDecorationCost / totalQuantity : 0;
  const apparelApiTotal = apparelEstimateMethod === estimatedMethod ? numericPrice(apparelEstimate?.price?.retail) : null;
  const apparelApiEach = apparelEstimateMethod === estimatedMethod ? numericPrice(apparelEstimate?.price?.each) : null;
  const displayedDecorationCost = apparelApiTotal ?? estimatedDecorationCost;
  const displayedPerShirt = apparelApiEach ?? estimatedPerShirt;
  const selectedColorName = selectedPreview?.colorName || selectedProduct.availableColors.find((color) => color.value === shirtColor)?.name || shirtColor;
  const selectedProductName = selectedPreview?.productName || selectedProduct.name;
  const designerProductName = productMode === 'signage' ? selectedSignProduct.name : selectedProductName;
  const designerProductDetail = productMode === 'signage'
    ? getSignConfigurationText(selectedSignProduct, signValues)
    : `${selectedColorName} / ${selectedPreview?.brand || 'Catalog'}`;
  const selectedCoroSize = parseCoroSize(signValues.size);
  const signWidth = selectedSignProduct.id === 'yard-sign' ? selectedCoroSize.width : Number(signValues.width || 36);
  const signHeight = selectedSignProduct.id === 'yard-sign' ? selectedCoroSize.height : Number(signValues.height || 24);
  const designerQuantity = productMode === 'signage' ? getSignQuantity(signValues) : totalQuantity;
  const coroSheetLayout = getCoroSheetLayout(signWidth, signHeight, designerQuantity);
  const isCoroBuilder = productMode === 'signage' && selectedSignProduct.id === 'yard-sign';
  const signPreviewAspect = selectedSignProduct.id === 'yard-sign' ? CORO_SHEET.width / CORO_SHEET.height : Math.max(0.45, Math.min(4.5, signWidth / Math.max(1, signHeight)));
  const hasCoroSheetArtwork = isCoroBuilder && coroSheetArtworkItems.length > 0;
  const signArtworkMatchesSize = Boolean(signArtworkSize && Math.abs(signArtworkSize.width - signWidth) < 0.05 && Math.abs(signArtworkSize.height - signHeight) < 0.05);
  const signArtworkStatusLabel = !layers.length && !hasCoroSheetArtwork ? 'Select Image' : signArtworkMatchesSize || hasCoroSheetArtwork ? 'OK' : 'Select Fit/Center';
  const signArtworkStatusOk = hasCoroSheetArtwork || (layers.length > 0 && signArtworkMatchesSize);
  const sizeBreakdown = useMemo(() => SIZE_FIELDS.filter((size) => sizeQuantities[size] > 0).map((size) => `${size}: ${sizeQuantities[size]}`).join(', ') || 'No sizes added', [sizeQuantities]);
  const designerQuantityBreakdown = productMode === 'signage' ? `Each: ${designerQuantity}` : sizeBreakdown;
  const signRetailTotal = numericPrice(signEstimate?.price?.retail);
  const signPricePerSheet = signRetailTotal !== null ? signRetailTotal / coroSheetLayout.sheetCount : null;
  const artworkAnalysisSummary = useMemo(() => {
    if (!artworkAnalysis) return 'No uploaded artwork analysis yet.';
    const warnings = artworkAnalysis.warnings.length ? artworkAnalysis.warnings.join('; ') : 'No first-pass warnings';
    return `${artworkAnalysis.visibleColorCount} estimated color families; ${artworkAnalysis.width} x ${artworkAnalysis.height}px; ${artworkAnalysis.hasTransparency ? 'transparent/soft edge' : artworkAnalysis.hasOpaqueBackground ? 'likely solid background' : 'opaque'}; suggested ${artworkAnalysis.recommendation}; ${warnings}.`;
  }, [artworkAnalysis]);
  const designPreviewStatus = capturedDesignPreview ? 'Captured design preview available' : 'No captured design preview';
  const hasCustomerName = customerInfo.name.trim().length > 0;
  const hasContactMethod = customerInfo.email.trim().length > 0 || customerInfo.phone.trim().length > 0;
  const hasProductSelection = Boolean(designerProductName.trim());
  const hasValidQuantity = designerQuantity > 0;
  const missingQuoteRequirements = useMemo(() => {
    const missing: string[] = [];
    if (!hasCustomerName) missing.push('customer name');
    if (!hasContactMethod) missing.push('email or phone');
    if (!hasProductSelection) missing.push('product selection');
    if (!hasValidQuantity) missing.push('total quantity greater than 0');
    return missing;
  }, [hasContactMethod, hasCustomerName, hasProductSelection, hasValidQuantity]);

  useEffect(() => {
    setApparelEstimate(null);
    setApparelEstimateMethod(null);
    setApparelEstimateStatus('');
  }, [estimatedColorCount, estimatedMethod, printLocation, selectedColorName, selectedPreview?.styleNumber, selectedPrintLocations, sizeQuantities]);


  const applyArtboardPreset = (preset: 'standard-full-front' | 'large-full-front' | 'left-chest' | 'full-back' | 'sleeve' | 'reset-default') => {
    const presets: Record<string, { location: PrintLocation; printSizePreset: PrintSizePreset; artboard: ArtboardRect }> = {
      'standard-full-front': { location: 'full-front', printSizePreset: 'standard-front-10', artboard: { top: 104, left: 88, width: 204, height: 224 } },
      'large-full-front': { location: 'full-front', printSizePreset: 'large-front-12', artboard: { top: 96, left: 78, width: 224, height: 248 } },
      'left-chest': { location: 'left-chest', printSizePreset: 'left-chest-3_5', artboard: { ...PRINT_AREA_CONFIG['left-chest'] } },
      'full-back': { location: 'full-back', printSizePreset: 'full-back-12', artboard: { ...PRINT_AREA_CONFIG['full-back'] } },
      sleeve: { location: 'sleeve', printSizePreset: 'custom', artboard: { ...PRINT_AREA_CONFIG.sleeve } },
      'reset-default': { location: printLocation, printSizePreset: locationSettings[printLocation].printSizePreset, artboard: { ...PRINT_AREA_CONFIG[printLocation] } }
    };
    const next = presets[preset];
    setSelectedPrintLocations((prev) => Array.from(new Set([...prev, next.location])));
    setPrintLocation(next.location);
    setLocationSettings((prev) => ({
      ...prev,
      [next.location]: {
        ...prev[next.location],
        printSizePreset: next.printSizePreset,
        artboard: next.artboard
      }
    }));
  };
  const saveDraftToLocal = () => {
    if (typeof window === 'undefined') return;
    const draft: DraftPayload = {
      selectedProductId,
      selectedPreviewStyleNumber: selectedPreview?.styleNumber || '',
      selectedPreviewColorName: selectedPreview?.colorName || '',
      shirtColor,
      shirtView,
      imageType,
      sizeQuantities,
      printMethod,
      imageComplexity,
      artworkAnalysis,
      customerInfo,
      printLocation,
      selectedPrintLocations: selectedPrintLocations as unknown as PrintLocation[],
      locationSettings: locationSettings as unknown as Record<PrintLocation, LocationSettings>,
      printSizePreset,
      customPrintWidthInches,
      customPrintHeightInches,
      capturedDesignPreview
    };
    window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(draft));
    setDraftStatus('Draft saved');
  };

  const loadDraftFromLocal = () => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(LOCAL_DRAFT_KEY);
    if (!raw) {
      setDraftStatus('No saved draft found');
      return;
    }

    try {
      const draft = JSON.parse(raw) as Partial<DraftPayload>;
      if (draft.selectedProductId) setSelectedProductId(draft.selectedProductId);
      if (draft.shirtColor) setShirtColor(draft.shirtColor);
      if (draft.shirtView === 'front' || draft.shirtView === 'back') setShirtView(draft.shirtView);
      if (draft.imageType === 'flat' || draft.imageType === 'model') setImageType(draft.imageType);
      if (draft.printMethod) setPrintMethod(draft.printMethod);
      if (draft.imageComplexity) setImageComplexity(draft.imageComplexity);
      if (draft.artworkAnalysis !== undefined) setArtworkAnalysis(draft.artworkAnalysis || null);
      if ((draft as any).selectedPrintLocations) setSelectedPrintLocations((draft as any).selectedPrintLocations);
      if ((draft as any).locationSettings) setLocationSettings(normalizeLocationSettings((draft as any).locationSettings));
      if (draft.printLocation) setPrintLocation(draft.printLocation);
      if (draft.sizeQuantities) {
        setSizeQuantities((prev) => ({ ...prev, ...draft.sizeQuantities }));
      }
      if (draft.customerInfo) {
        setCustomerInfo((prev) => ({ ...prev, ...draft.customerInfo }));
      }
      setCapturedDesignPreview(typeof draft.capturedDesignPreview === 'string' ? draft.capturedDesignPreview : null);
      if (draft.selectedPreviewStyleNumber) {
        const idx = previewCatalog.findIndex((item) => item.styleNumber === draft.selectedPreviewStyleNumber && (!draft.selectedPreviewColorName || item.colorName === draft.selectedPreviewColorName));
        if (idx >= 0) setSelectedPreviewId(idx);
      }
      setDraftStatus('Draft loaded');
    } catch {
      setDraftStatus('No saved draft found');
    }
  };

  const clearDraftFromLocal = () => {
    if (typeof window === 'undefined') return;
    if (!window.confirm('Clear saved draft?')) return;
    window.localStorage.removeItem(LOCAL_DRAFT_KEY);
    setDraftStatus('No saved draft found');
  };

  const quoteReadiness = useMemo(() => {
    const readyChecks = [hasCustomerName, hasContactMethod, hasProductSelection, hasValidQuantity].filter(Boolean).length;
    if (readyChecks === 4) return 'Ready';
    if (readyChecks >= 2) return 'Almost Ready';
    return 'Not Ready';
  }, [hasContactMethod, hasCustomerName, hasProductSelection, hasValidQuantity]);
  const quoteReadinessClass = quoteReadiness === 'Ready'
    ? 'bg-emerald-100 text-emerald-700'
    : quoteReadiness === 'Almost Ready'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-rose-100 text-rose-700';

  const quoteSummaryText = useMemo(() => [
    'Hue Shirt Design Studio - Quote Summary',
    '',
    'Customer Info',
    `Name: ${customerInfo.name || 'N/A'}`,
    `Business/Organization: ${customerInfo.organization || 'N/A'}`,
    `Email: ${customerInfo.email || 'N/A'}`,
    `Phone: ${customerInfo.phone || 'N/A'}`,
    `Needed-by Date: ${customerInfo.neededByDate || 'N/A'}`,
    '',
    'Product Info',
    `Selected Product: ${selectedProductName}`,
    `Selected Color: ${selectedColorName}`,
    '',
    'Design Info',
    `Active Print Location: ${selectedPrintLocationLabel}`,
    `Active Print Size: ${selectedPrintSizeLabel}`,
    `All Print Locations: ${selectedLocationDetails.map((item) => `${item.label} (${item.sizeLabel}) - ${item.notes} - Artboard x:${Math.round(item.artboard.left)} y:${Math.round(item.artboard.top)} w:${Math.round(item.artboard.width)} h:${Math.round(item.artboard.height)}`).join(' | ')}`,
    `Shirt View: ${shirtView}`,
    `Image Complexity: ${imageComplexity}`,
    `Artwork Analysis: ${artworkAnalysisSummary}`,
    `Design Preview Status: ${designPreviewStatus}`,
    `Design Preview Captured: ${capturedDesignPreview ? 'Yes' : 'No'}`,
    `Design Export Status: Ready (${shirtView} / ${printLocation})`,
    '',
    'Quantity Breakdown',
    `Total Quantity: ${totalQuantity}`,
    `Size Breakdown: ${sizeBreakdown}`,
    '',
    'Print Method Recommendation',
    `Recommendation: ${recommendationByCost.recommendedMethod === 'dtf' ? 'DTF' : 'Screen Print'}`,
    '',
    'Estimate Only Pricing',
    `Setup Fee: ${estimatedSetupFee.toFixed(2)}`,
    `Decoration Cost: ${displayedDecorationCost.toFixed(2)}`,
    `Per Shirt: ${displayedPerShirt.toFixed(2)}`,
    '',
    'Notes',
    `Notes: ${customerInfo.notes || 'N/A'}`,
    '',
    'This is an estimate only. Final pricing may change after artwork review, garment availability, and exact production requirements.',
    'Print size is approximate and may be adjusted during production.',
    selectedPrintLocations.length > 1 ? 'Multiple print locations selected; final pricing may be affected.' : 'Single print location selected.'
  ].join('\n'), [artworkAnalysisSummary, capturedDesignPreview, customerInfo, customPrintHeightInches, customPrintWidthInches, designPreviewStatus, displayedDecorationCost, displayedPerShirt, estimatedSetupFee, imageComplexity, printLocation, printSizePreset, recommendationByCost.recommendedMethod, selectedColorName, selectedLocationDetails, selectedProductName, selectedPrintLocationLabel, selectedPrintSizeLabel, shirtView, sizeBreakdown, totalQuantity]);

  const [emailSummaryText, setEmailSummaryText] = useState('');

  const emailSubjectLine = useMemo(() => {
    const recipientLabel = customerInfo.name.trim() || customerInfo.organization.trim() || 'Customer';
    return `Custom Shirt Quote Request - ${recipientLabel}`;
  }, [customerInfo.name, customerInfo.organization]);

  const generatedEmailSummary = useMemo(() => [
    `Subject: ${emailSubjectLine}`,
    '',
    'Hello Hue Shirt Design Team,',
    '',
    'Please review this custom shirt quote request:',
    '',
    `Customer Name: ${customerInfo.name || 'N/A'}`,
    `Business/Organization: ${customerInfo.organization || 'N/A'}`,
    `Email: ${customerInfo.email || 'N/A'}`,
    `Phone: ${customerInfo.phone || 'N/A'}`,
    `Needed-by Date: ${customerInfo.neededByDate || 'N/A'}`,
    `Selected Product/Style: ${selectedProductName}${selectedPreview?.styleNumber ? ` (${selectedPreview.styleNumber})` : ''}`,
    `Selected Color: ${selectedColorName}`,
    `Active Print Placement: ${selectedPrintLocationLabel}`,
    `Active Print Size: ${selectedPrintSizeLabel}`,
    `All Print Locations: ${selectedLocationDetails.map((item) => `${item.label} (${item.sizeLabel}) - ${item.notes} - Artboard x:${Math.round(item.artboard.left)} y:${Math.round(item.artboard.top)} w:${Math.round(item.artboard.width)} h:${Math.round(item.artboard.height)}`).join(' | ')}`,
    `Size Breakdown: ${sizeBreakdown}`,
    `Total Quantity: ${totalQuantity}`,
    `Artwork Analysis: ${artworkAnalysisSummary}`,
    `Print Method Recommendation: ${recommendationByCost.recommendedMethod === 'dtf' ? 'DTF' : 'Screen Print'}`,
    `Estimate-Only Pricing: Setup $${estimatedSetupFee.toFixed(2)} | Decoration $${displayedDecorationCost.toFixed(2)} | Per Shirt $${displayedPerShirt.toFixed(2)}`,
    `Notes: ${customerInfo.notes || 'N/A'}`,
    `Design Preview Captured: ${capturedDesignPreview ? 'Yes' : 'No'}`,
    `Timestamp: ${new Date().toISOString()}`,
    '',
    'This is an estimate-only request and not a final order.',
    'Print size is approximate and may be adjusted during production.',
    selectedPrintLocations.length > 1 ? 'Multiple print locations selected; final pricing may be affected.' : 'Single print location selected.'
  ].join('\n'), [artworkAnalysisSummary, capturedDesignPreview, customerInfo.email, customerInfo.name, customerInfo.neededByDate, customerInfo.notes, customerInfo.organization, customerInfo.phone, emailSubjectLine, displayedDecorationCost, displayedPerShirt, estimatedSetupFee, recommendationByCost.recommendedMethod, selectedColorName, selectedLocationDetails, selectedPrintLocationLabel, selectedPrintSizeLabel, selectedProductName, selectedPreview?.styleNumber, sizeBreakdown, totalQuantity]);

  const generateEmailSummary = () => {
    setEmailSummaryText(generatedEmailSummary);
  };

  const copyEmailSummary = async () => {
    if (!emailSummaryText) {
      window.alert('Generate the email summary first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(emailSummaryText);
      window.alert('Email summary copied to clipboard.');
    } catch {
      window.alert('Unable to access clipboard. Please copy from the email preview box.');
    }
  };

  const openEmailRequest = () => {
    if (missingQuoteRequirements.length > 0) {
      window.alert(`Please complete the quote request requirements before opening email:\n- ${missingQuoteRequirements.join('\n- ')}`);
      return;
    }
    const emailBody = emailSummaryText || generatedEmailSummary;
    const mailtoUrl = `mailto:jason@huegraphics.cc?subject=${encodeURIComponent(emailSubjectLine)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoUrl;
  };


  const captureDesignPreview = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1 });
    setCapturedDesignPreview(dataUrl);
    window.alert('Design preview captured for quote summary.');
  };

  const copyQuoteSummary = async () => {
    if (missingQuoteRequirements.length > 0) {
      window.alert(`Please complete the quote request requirements before copying:\n- ${missingQuoteRequirements.join('\n- ')}`);
      return;
    }
    try {
      await navigator.clipboard.writeText(quoteSummaryText);
      window.alert('Quote summary copied to clipboard.');
    } catch {
      window.alert('Unable to access clipboard. Please copy from the quote summary text.');
    }
  };

  const exportQuoteSummary = (format: 'txt' | 'json') => {
    if (missingQuoteRequirements.length > 0) {
      window.alert(`Please complete the quote request requirements before exporting:\n- ${missingQuoteRequirements.join('\n- ')}`);
      return;
    }
    const quoteData = {
      customerInfo,
      selectedProduct: selectedProductName,
      selectedColor: selectedColorName,
      sizeBreakdown,
      totalQuantity,
      artworkAnalysis,
      printMethodRecommendation: recommendationByCost.recommendedMethod === 'dtf' ? 'DTF' : 'Screen Print',
      estimateOnlyPricing: {
        setupFee: Number(estimatedSetupFee.toFixed(2)),
        decorationCost: Number(displayedDecorationCost.toFixed(2)),
        perShirt: Number(displayedPerShirt.toFixed(2))
      },
      capturedDesignPreviewStatus: capturedDesignPreview ? 'Captured' : 'Not captured',
      timestamp: new Date().toISOString(),
      summary: {
        selectedProduct: selectedProductName,
        selectedColor: selectedColorName,
        totalQuantity,
        sizeBreakdown,
        artworkAnalysis,
        printMethodRecommendation: recommendationByCost.recommendedMethod === 'dtf' ? 'DTF' : 'Screen Print',
        estimateOnlyPricing: {
          setupFee: Number(estimatedSetupFee.toFixed(2)),
          decorationCost: Number(displayedDecorationCost.toFixed(2)),
          perShirt: Number(displayedPerShirt.toFixed(2))
        },
        designPreviewStatus,
        capturedDesignPreview: Boolean(capturedDesignPreview),
        designExportStatus: `Ready (${shirtView} / ${printLocation})`,
        printPlacement: selectedPrintLocationLabel,
        printSize: selectedPrintSizeLabel,
        allPrintLocations: selectedLocationDetails
      }
    };
    const content = format === 'json' ? JSON.stringify(quoteData, null, 2) : quoteSummaryText;
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `quote-summary.${format}`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportQuotePackage = () => {
    const quotePackage: QuotePackagePayload = {
      customerInfo,
      selectedProductDetails: {
        styleNumber: selectedPreview?.styleNumber || 'N/A',
        name: selectedProductName,
        brand: selectedPreview?.brand || 'N/A',
        category: selectedPreview?.category || 'N/A',
        selectedProductId,
        selectedPreviewStyleNumber: selectedPreview?.styleNumber || '',
        selectedPreviewColorName: selectedPreview?.colorName || ''
      },
      selectedColor: selectedColorName,
      shirtView,
      imageType,
      sizeBreakdown,
      sizeQuantities,
      totalQuantity,
      printMethod,
      imageComplexity,
      artworkAnalysis,
      pricingEstimate: {
        setupFee: Number(estimatedSetupFee.toFixed(2)),
        decorationCost: Number(displayedDecorationCost.toFixed(2)),
        perShirt: Number(displayedPerShirt.toFixed(2)),
        recommendedMethod: recommendationByCost.recommendedMethod === 'dtf' ? 'DTF' : 'Screen Print'
      },
      quoteReadinessStatus: quoteReadiness,
      notes: customerInfo.notes || '',
      timestamp: new Date().toISOString(),
      capturedDesignPreviewData: capturedDesignPreview,
      capturedDesignPreviewStatus: capturedDesignPreview ? 'Captured design preview available' : 'No captured design preview',
      printLocation,
      selectedPrintLocations,
      locationSettings,
      printSizePreset,
      customPrintWidthInches,
      customPrintHeightInches
    };
    const blob = new Blob([JSON.stringify(quotePackage, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'quote-package.json';
    link.click();
    URL.revokeObjectURL(link.href);
    setQuotePackageStatus('Quote package exported');
  };

  const importQuotePackage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      const quotePackage = JSON.parse(raw) as Partial<QuotePackagePayload>;
      if (!quotePackage.customerInfo || !quotePackage.selectedProductDetails || !quotePackage.sizeQuantities) {
        setQuotePackageStatus('Invalid quote package file');
        event.target.value = '';
        return;
      }
      const details = quotePackage.selectedProductDetails;
      if (details.selectedProductId) setSelectedProductId(details.selectedProductId);
      if (quotePackage.shirtView === 'front' || quotePackage.shirtView === 'back') setShirtView(quotePackage.shirtView);
      if (quotePackage.imageType === 'flat' || quotePackage.imageType === 'model') setImageType(quotePackage.imageType);
      if (quotePackage.printMethod) setPrintMethod(quotePackage.printMethod);
      if (quotePackage.imageComplexity) setImageComplexity(quotePackage.imageComplexity);
      if (quotePackage.artworkAnalysis !== undefined) setArtworkAnalysis(quotePackage.artworkAnalysis || null);
      if (quotePackage.selectedPrintLocations) setSelectedPrintLocations(quotePackage.selectedPrintLocations);
      if (quotePackage.locationSettings) setLocationSettings(normalizeLocationSettings(quotePackage.locationSettings));
      if (quotePackage.printLocation) setPrintLocation(quotePackage.printLocation);
      setCustomerInfo((prev) => ({ ...prev, ...quotePackage.customerInfo }));
      setSizeQuantities((prev) => ({ ...prev, ...quotePackage.sizeQuantities }));
      if (quotePackage.capturedDesignPreviewData !== undefined) {
        setCapturedDesignPreview(typeof quotePackage.capturedDesignPreviewData === 'string' ? quotePackage.capturedDesignPreviewData : null);
      }
      if (details.selectedPreviewStyleNumber) {
        const idx = previewCatalog.findIndex((item) => item.styleNumber === details.selectedPreviewStyleNumber && (!details.selectedPreviewColorName || item.colorName === details.selectedPreviewColorName));
        if (idx >= 0) {
          setSelectedPreviewId(idx);
          if (previewCatalog[idx]?.colorName) {
            const loadedColor = previewCatalog[idx].colorName.toLowerCase();
            setShirtColor(COLOR_MAP[loadedColor] || shirtColor);
          }
        }
      }
      setQuotePackageStatus('Quote package imported');
    } catch {
      setQuotePackageStatus('Invalid quote package file');
    } finally {
      event.target.value = '';
    }
  };

  const getLabel = (obj: FabricObject, index: number) => {
    if (obj.type === 'i-text') return `Text ${index}`;
    if (obj.type === 'image') return `Image ${index}`;
    return `${obj.type} ${index}`;
  };

  const refreshLayers = (canvas: Canvas) => {
    const selected = canvas.getActiveObject();
    const items = canvas.getObjects().filter((obj) => {
      const objectLocation = (obj as FabricObject & { data?: { printLocation?: PrintLocation } }).data?.printLocation;
      return !objectLocation || objectLocation === printLocation;
    }).map((obj, idx) => {
      const layerObj = obj as FabricObject & { data?: { layerId?: string } };
      if (!layerObj.data) layerObj.data = {};
      if (!layerObj.data.layerId) layerObj.data.layerId = `layer-${Date.now()}-${idx}`;
      return {
        id: layerObj.data.layerId,
        name: getLabel(obj, idx + 1),
        type: obj.type,
        isActive: selected === obj
      };
    }).reverse();
    setLayers(items);
  };

  const clampToArea = (obj: FabricObject) => {
    obj.setCoords();
    const bounds = obj.getBoundingRect();
    let left = obj.left || 0;
    let top = obj.top || 0;

    if (bounds.left < 0) left -= bounds.left;
    if (bounds.top < 0) top -= bounds.top;
    if (bounds.left + bounds.width > MOCKUP_CANVAS_WIDTH) left -= bounds.left + bounds.width - MOCKUP_CANVAS_WIDTH;
    if (bounds.top + bounds.height > MOCKUP_CANVAS_HEIGHT) top -= bounds.top + bounds.height - MOCKUP_CANVAS_HEIGHT;

    obj.set({ left, top });
    obj.setCoords();
  };

  useEffect(() => {
    const nextColor = selectedProduct.availableColors[0]?.value;
    if (nextColor && !selectedProduct.availableColors.some((color) => color.value === shirtColor)) setShirtColor(nextColor);
    const validLocations = Object.keys(PRINT_AREA_CONFIG) as PrintLocation[];
    if (!validLocations.includes(printLocation)) setPrintLocation('full-front');
    setSelectedPrintLocations((prev) => prev.filter((loc) => validLocations.includes(loc)).length ? prev.filter((loc) => validLocations.includes(loc)) : ['full-front']);
  }, [selectedProduct, shirtColor, printLocation]);

  useEffect(() => {
    designAreaRef.current = designArea;
  }, [designArea]);

  useEffect(() => {
    productModeRef.current = productMode;
  }, [productMode]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    // TODO: Persist full per-location canvas state snapshots for richer location isolation.
    canvas.getObjects().forEach((obj) => {
      const objectLocation = (obj as FabricObject & { data?: { printLocation?: PrintLocation } }).data?.printLocation;
      obj.visible = !objectLocation || objectLocation === printLocation;
    });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    refreshLayers(canvas);
  }, [printLocation]);

  const selectedStyleItems = useMemo(() => selectedPreview ? previewCatalog.filter((item) => item.styleNumber === selectedPreview.styleNumber) : [], [previewCatalog, selectedPreview]);
  const availableStyleColors = useMemo(() => Array.from(new Map(selectedStyleItems.map((item) => [item.colorName, { name: item.colorName, value: COLOR_MAP[item.colorName.toLowerCase()] || '#94a3b8', swatchUrl: item.colorSwatchImageUrl }] )).values()), [selectedStyleItems]);

  useEffect(() => {
    if (!selectedPreview) return;
    const next = COLOR_MAP[selectedPreview.colorName.toLowerCase()];
    if (next) setShirtColor(next);
  }, [selectedPreview]);

  useEffect(() => {
    const candidates = getImageCandidates(selectedPreview, imageType, shirtView);
    if (!candidates.length) {
      setResolvedImageUrl(null);
      setImageFallbackUsed(false);
      return;
    }
    let canceled = false;
    (async () => {
      for (let i = 0; i < candidates.length; i += 1) {
        try {
          const result = await fetch(candidates[i], { method: 'HEAD' });
          if (result.ok) {
            if (!canceled) {
              setResolvedImageUrl(candidates[i]);
              setImageFallbackUsed(i > 0);
            }
            return;
          }
        } catch {}
      }
      if (!canceled) {
        setResolvedImageUrl(candidates[0]);
        setImageFallbackUsed(true);
      }
    })();
    return () => { canceled = true; };
  }, [imageType, selectedPreview, shirtView]);

  const captureHistory = (canvas: Canvas) => {
    const json = JSON.stringify(canvas.toJSON());
    if (historyRef.current[historyIndexRef.current] === json) return;
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(json);
    historyIndexRef.current = historyRef.current.length - 1;
  };

  const restoreHistory = (offset: number) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const nextIndex = historyIndexRef.current + offset;
    if (nextIndex < 0 || nextIndex >= historyRef.current.length) return;
    historyIndexRef.current = nextIndex;
    canvas.loadFromJSON(historyRef.current[nextIndex], () => {
      canvas.requestRenderAll();
      refreshLayers(canvas);
    });
  };

  const syncTextControls = (obj: FabricObject | null) => {
    if (obj && obj.type === 'i-text') {
      const textObj = obj as IText;
      setFontFamily(textObj.fontFamily || FONT_OPTIONS[0].value);
      setFontSize(typeof textObj.fontSize === 'number' ? textObj.fontSize : 30);
      setIsBold((textObj.fontWeight as string) === 'bold');
      setIsItalic(textObj.fontStyle === 'italic');
      setTextColor(typeof textObj.fill === 'string' ? textObj.fill : '#111827');
    }
  };

  useEffect(() => {
    const canvasEl = canvasElRef.current;
    if (!canvasEl) return;
    const fabricCanvas = new Canvas(canvasEl, { width: MOCKUP_CANVAS_WIDTH, height: MOCKUP_CANVAS_HEIGHT, backgroundColor: 'transparent', preserveObjectStacking: true, selectionColor: 'rgba(15,118,110,0.08)', selectionBorderColor: '#0f766e' });
    fabricCanvas.forEachObject((obj) => obj.set(FABRIC_CONTROL_STYLE));

    const updateSelection = () => {
      const selected = fabricCanvas.getActiveObject();
      setActiveObject(selected || null);
      syncTextControls(selected || null);
      refreshLayers(fabricCanvas);
    };

    fabricCanvas.on('selection:created', updateSelection);
    fabricCanvas.on('selection:updated', updateSelection);
    fabricCanvas.on('selection:cleared', () => {
      setActiveObject(null);
      refreshLayers(fabricCanvas);
    });

    fabricCanvas.on('object:moving', (event) => {
      const obj = event.target;
      if (!obj) return;
      const activeDesignArea = designAreaRef.current;
      const snapArea = productModeRef.current === 'signage' ? { left: 0, top: 0, width: MOCKUP_CANVAS_WIDTH, height: MOCKUP_CANVAS_HEIGHT } : activeDesignArea;
      const centerPoint = obj.getCenterPoint();
      const centerX = snapArea.left + snapArea.width / 2;
      const centerY = snapArea.top + snapArea.height / 2;
      if (Math.abs(centerPoint.x - centerX) <= 14) obj.left = (obj.left || 0) + (centerX - centerPoint.x);
      if (Math.abs(centerPoint.y - centerY) <= 14) obj.top = (obj.top || 0) + (centerY - centerPoint.y);
      obj.setCoords();
    });
    fabricCanvas.on('object:scaling', (event) => {
      const obj = event.target;
      if (obj) obj.setCoords();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const command = isMac ? event.metaKey : event.ctrlKey;
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        restoreHistory(event.shiftKey ? 1 : -1);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    fabricCanvas.on('object:added', () => { captureHistory(fabricCanvas); refreshLayers(fabricCanvas); });
    fabricCanvas.on('object:modified', () => { captureHistory(fabricCanvas); refreshLayers(fabricCanvas); });
    fabricCanvas.on('object:removed', () => { captureHistory(fabricCanvas); refreshLayers(fabricCanvas); });
    captureHistory(fabricCanvas);
    refreshLayers(fabricCanvas);

    fabricCanvasRef.current = fabricCanvas;
    return () => { window.removeEventListener('keydown', onKeyDown); fabricCanvas.dispose(); fabricCanvasRef.current = null; };
  }, []);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.setDimensions({ width: MOCKUP_CANVAS_WIDTH, height: MOCKUP_CANVAS_HEIGHT });
    canvas.requestRenderAll();
  }, [designArea]);

  const addText = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const activeArea = productMode === 'signage' ? { left: 0, top: 0, width: MOCKUP_CANVAS_WIDTH, height: MOCKUP_CANVAS_HEIGHT } : designArea;
    const text = new IText(textValue.trim() || 'Your text', { left: activeArea.left + activeArea.width / 2, top: activeArea.top + activeArea.height / 2, originX: 'center', originY: 'center', fontSize, fontFamily, fontWeight: isBold ? 'bold' : 'normal', fontStyle: isItalic ? 'italic' : 'normal', fill: textColor, ...FABRIC_CONTROL_STYLE });
    (text as FabricObject & { data?: { printLocation?: PrintLocation } }).data = { ...((text as FabricObject & { data?: { printLocation?: PrintLocation } }).data || {}), printLocation };
    canvas.add(text); canvas.setActiveObject(text); canvas.renderAll();
  };

  const editSelected = (fn: (obj: FabricObject) => void) => { const canvas = fabricCanvasRef.current; const selected = canvas?.getActiveObject(); if (!canvas || !selected) return; fn(selected); clampToArea(selected); canvas.requestRenderAll(); refreshLayers(canvas); };
  const deleteSelected = () => { const canvas = fabricCanvasRef.current; if (!canvas) return; const selected = canvas.getActiveObject(); if (!selected) return; if (selected.type === 'activeSelection') (selected as ActiveSelection).getObjects().forEach((obj) => canvas.remove(obj)); else canvas.remove(selected); if (productMode === 'signage' && canvas.getObjects().length === 0) { setSignArtworkSize(null); setSignArtworkPreviewUrl(null); } canvas.discardActiveObject(); canvas.requestRenderAll(); refreshLayers(canvas); };
  const clearSignArtwork = () => {
    const canvas = fabricCanvasRef.current;
    if (canvas) {
      canvas.getObjects().forEach((obj) => canvas.remove(obj));
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      refreshLayers(canvas);
    }
    setActiveObject(null);
    setLayers([]);
    setSignArtworkSize(null);
    setSignArtworkPreviewUrl(null);
    setCoroSheetArtworkItems([]);
    setArtworkAnalysis(null);
    setArtworkAnalysisStatus('');
  };

  const duplicateSelected = () => { const canvas = fabricCanvasRef.current; const selected = canvas?.getActiveObject(); if (!canvas || !selected || selected.type === 'activeSelection') return; selected.clone().then((cloned) => { const clone = cloned as FabricObject; clone.set({ left: (selected.left || 0) + 14, top: (selected.top || 0) + 14 }); canvas.add(clone); canvas.setActiveObject(clone); clampToArea(clone); canvas.requestRenderAll(); refreshLayers(canvas); }); };
  const moveLayer = (direction: 'forward' | 'backward') => { const canvas = fabricCanvasRef.current; const selected = canvas?.getActiveObject(); if (!canvas || !selected) return; if (direction === 'forward') canvas.bringObjectForward(selected); else canvas.sendObjectBackwards(selected); canvas.requestRenderAll(); refreshLayers(canvas); };
  const toggleLockSelected = () => editSelected((obj) => { const next = !obj.selectable; obj.set({ selectable: next, evented: next, lockMovementX: !next, lockMovementY: !next, lockScalingX: !next, lockScalingY: !next, lockRotation: !next, hasControls: next }); });

  const getActiveArtworkArea = () => productMode === 'signage'
    ? { left: 0, top: 0, width: MOCKUP_CANVAS_WIDTH, height: MOCKUP_CANVAS_HEIGHT }
    : designArea;

  const calculateContainedSignArtworkSize = (sourceWidth: number, sourceHeight: number) => {
    const safeSourceWidth = Math.max(1, sourceWidth || 1);
    const safeSourceHeight = Math.max(1, sourceHeight || 1);
    const scale = Math.min(signWidth / safeSourceWidth, signHeight / safeSourceHeight);
    return {
      width: Number((safeSourceWidth * scale).toFixed(2)),
      height: Number((safeSourceHeight * scale).toFixed(2))
    };
  };

  const fitObjectToArtworkArea = (obj: FabricObject, mode: 'contain' | 'cover' | 'stretch' | 'ratio') => {
    const area = getActiveArtworkArea();
    const objectWidth = Math.max(1, obj.width || 1);
    const objectHeight = Math.max(1, obj.height || 1);
    const paddedWidth = productMode === 'signage' ? area.width * 0.94 : area.width * 0.78;
    const paddedHeight = productMode === 'signage' ? area.height * 0.94 : area.height * 0.78;
    const containScale = Math.min(paddedWidth / objectWidth, paddedHeight / objectHeight);
    const coverScale = Math.max(area.width / objectWidth, area.height / objectHeight);

    if (mode === 'stretch') {
      obj.set({ scaleX: area.width / objectWidth, scaleY: area.height / objectHeight });
    } else if (mode === 'cover') {
      obj.set({ scaleX: coverScale, scaleY: coverScale });
    } else if (mode === 'ratio') {
      const currentScale = Math.min(Number(obj.scaleX) || containScale, Number(obj.scaleY) || containScale);
      obj.set({ scaleX: currentScale, scaleY: currentScale });
    } else {
      obj.set({ scaleX: containScale, scaleY: containScale });
    }

    obj.set({
      left: area.left + area.width / 2,
      top: area.top + area.height / 2,
      originX: 'center',
      originY: 'center'
    });
    obj.setCoords();
  };

  const fitSelectedArtwork = (mode: 'contain' | 'cover' | 'stretch' | 'ratio') => {
    const canvas = fabricCanvasRef.current;
    const selected = canvas?.getActiveObject();
    if (!canvas || !selected) return;
    fitObjectToArtworkArea(selected, mode);
    if (productMode === 'signage') {
      const nextSize = mode === 'contain'
        ? calculateContainedSignArtworkSize(selected.width || 1, selected.height || 1)
        : { width: signWidth, height: signHeight };
      setSignArtworkSize(nextSize);
    }
    canvas.requestRenderAll();
    refreshLayers(canvas);
  };

  const centerSelectedArtwork = () => {
    const canvas = fabricCanvasRef.current;
    const selected = canvas?.getActiveObject();
    if (!canvas || !selected) return;
    const area = getActiveArtworkArea();
    selected.set({
      left: area.left + area.width / 2,
      top: area.top + area.height / 2,
      originX: 'center',
      originY: 'center'
    });
    selected.setCoords();
    canvas.requestRenderAll();
    refreshLayers(canvas);
  };

  const placeImageOnDesign = async (dataUrl: string, sourceName = 'Uploaded artwork') => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    if (productMode === 'signage') {
      canvas.getObjects().forEach((obj) => canvas.remove(obj));
      canvas.discardActiveObject();
    }
    const img = await FabricImage.fromURL(dataUrl);
    if (productMode === 'signage') setSignArtworkPreviewUrl(dataUrl);
    img.set({ ...FABRIC_CONTROL_STYLE });
    fitObjectToArtworkArea(img, 'contain');
    (img as FabricObject & { data?: { printLocation?: PrintLocation; originalWidth?: number; originalHeight?: number; fileName?: string } }).data = {
      ...((img as FabricObject & { data?: { printLocation?: PrintLocation; originalWidth?: number; originalHeight?: number; fileName?: string } }).data || {}),
      printLocation,
      originalWidth: img.width || undefined,
      originalHeight: img.height || undefined,
      fileName: sourceName
    };
    if (productMode === 'signage') setSignArtworkSize(calculateContainedSignArtworkSize(img.width || 1, img.height || 1));
    canvas.add(img);
    clampToArea(img);
    canvas.setActiveObject(img);
    canvas.renderAll();
    refreshLayers(canvas);
  };

  const triggerArtworkUpload = () => {
    setImageLibraryStatus('Choose an image or PDF artwork file.');
    artworkUploadInputRef.current?.click();
  };

  const canPlaceImageZoneItem = (item: ImageZoneItem) => item.mimeType?.startsWith('image/') || item.dataUrl.startsWith('data:image/');

  const placeCoroArtworkOnSheet = (item: ImageZoneItem) => {
    setCoroSheetArtworkItems((prev) => {
      const withoutDuplicate = prev.filter((entry) => entry.id !== item.id);
      return coroMultipleImages ? [...withoutDuplicate, item] : [item];
    });
    setSignArtworkPreviewUrl(item.dataUrl);
    setSignArtworkSize({ width: signWidth, height: signHeight });
    setActiveCoroOptionPanel('images');
    setImageLibraryStatus(`${item.name} placed on the CORO sheet.`);
  };

  const useImageZoneItem = async (item: ImageZoneItem) => {
    setSelectedImageZoneId(item.id);
    if (!canPlaceImageZoneItem(item)) {
      setImageLibraryStatus(`${item.name} is selected for production. PDF placement preview is coming next.`);
      return;
    }
    if (isCoroBuilder || productMode === 'signage') placeCoroArtworkOnSheet(item);
    if (!fabricCanvasRef.current) {
      setProductMode('signage');
      setSignProductId('yard-sign');
      setStoreCategory('coro');
      setStoreView('builder');
      setShowImageZone(false);
      setActiveCoroOptionPanel('images');
      return;
    }
    await placeImageOnDesign(item.dataUrl, item.name);
    setShowImageZone(false);
  };

  const onUploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const canvas = fabricCanvasRef.current;
    const isImageFile = isPreviewableImageFile(file);
    const canPlaceOnCanvas = Boolean(isImageFile && canvas);
    if (isImageFile && !canPlaceOnCanvas) setImageLibraryStatus('Adding file to the library. Open the CORO sheet to place it on the design.');
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      let imagePixels = { width: 0, height: 0 };
      if (isImageFile) {
        try {
          const analysis = await analyzeArtworkImage(file, dataUrl);
          imagePixels = { width: analysis.width, height: analysis.height };
          setArtworkAnalysis(analysis);
          setArtworkAnalysisStatus(`Analyzed ${analysis.fileName}`);
          setImageComplexity(analysis.complexity);
        } catch (error) {
          setArtworkAnalysis(null);
          setArtworkAnalysisStatus(error instanceof Error ? error.message : 'Artwork analysis failed.');
        }
      } else {
        setArtworkAnalysis(null);
        setArtworkAnalysisStatus(`${file.name} saved as a production file. PDF preview placement is coming next.`);
      }

      const localItemId = `${Date.now()}-${file.name}`;
      const item: ImageZoneItem = {
        id: localItemId,
        name: file.name,
        dataUrl,
        width: imagePixels.width,
        height: imagePixels.height,
        dpi: 300,
        uploadedAt: new Date().toLocaleString(),
        source: 'local',
        mimeType: file.type
      };
      setImageZoneItems((prev) => [item, ...prev]);
      setSelectedImageZoneId(item.id);
      if (isImageFile && isCoroBuilder) placeCoroArtworkOnSheet(item);
      if (canPlaceOnCanvas) await placeImageOnDesign(dataUrl, file.name);
      event.target.value = '';

      if (isSupabaseStorageConfigured) {
        setImageLibraryStatus(`${canPlaceOnCanvas ? 'Preview ready' : 'Library file ready'}. Saving original file to ${SUPABASE_STORAGE_BUCKET}...`);
        try {
          const storageInfo = await uploadArtworkFileToSupabase(file);
          setImageZoneItems((prev) => prev.map((entry) => entry.id === localItemId ? {
            ...entry,
            id: storageInfo.storagePath,
            storagePath: storageInfo.storagePath,
            storageUrl: storageInfo.storageUrl,
            source: 'supabase'
          } : entry));
          setCoroSheetArtworkItems((prev) => prev.map((entry) => entry.id === localItemId ? {
            ...entry,
            id: storageInfo.storagePath,
            storagePath: storageInfo.storagePath,
            storageUrl: storageInfo.storageUrl,
            source: 'supabase'
          } : entry));
          setSelectedImageZoneId(storageInfo.storagePath);
          setImageLibraryStatus(`Saved original file to Supabase: ${storageInfo.storagePath}`);
        } catch (error) {
          setImageLibraryStatus(`Preview ready. Supabase upload failed: ${error instanceof Error ? error.message : 'unknown error'}. Check bucket policies.`);
        }
      } else {
        setImageLibraryStatus('Local preview only. Supabase storage is not configured.');
      }
    };
    reader.onerror = () => {
      setImageLibraryStatus('The browser could not read that file. Try exporting it as PNG, JPG, or PDF and upload again.');
      event.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const alignSelected = (axis: 'horizontal' | 'vertical') => editSelected((obj) => {
    const center = obj.getCenterPoint();
    const activeArea = productMode === 'signage' ? { left: 0, top: 0, width: MOCKUP_CANVAS_WIDTH, height: MOCKUP_CANVAS_HEIGHT } : designArea;
    if (axis === 'horizontal') obj.left = (obj.left || 0) + (activeArea.left + activeArea.width / 2 - center.x);
    if (axis === 'vertical') obj.top = (obj.top || 0) + (activeArea.top + activeArea.height / 2 - center.y);
  });


  useEffect(() => {
    let canceled = false;

    Promise.all(ALL_CATEGORY_SLUGS.map(async (slug) => {
      const response = await fetch(`/data/catalog/${slug}.generated.json`);
      if (!response.ok) return [];
      const rows = await response.json();
      return Array.isArray(rows) ? rows as SanMarPreviewItem[] : [];
    }))
      .then((datasets) => {
        if (canceled) return;
        const flattened = datasets.flat();
        setGlobalCatalog(flattened.length > 0 ? flattened : fallbackPreviewCatalog);
      })
      .catch(() => {
        if (!canceled) setGlobalCatalog(fallbackPreviewCatalog);
      });

    return () => {
      canceled = true;
    };
  }, [fallbackPreviewCatalog]);

  useEffect(() => {
    const slug = categoryFilter as CategoryChunkSlug;
    if (categoryFilter === 'all') {
      setPreviewCatalog(globalCatalog.length > 0 ? globalCatalog : fallbackPreviewCatalog);
      setCategoryCatalogStatus('Loaded catalog mode: all generated category chunks');
      return;
    }

    if (!(slug in CHUNKED_CATEGORY_LABELS)) {
      setPreviewCatalog(fallbackPreviewCatalog);
      setCategoryCatalogStatus('Loaded category file: fallback catalog-preview-25.json');
      return;
    }

    let canceled = false;
    setIsCategoryCatalogLoading(true);
    setCategoryCatalogStatus(CHUNKED_CATEGORY_LOAD_MESSAGES[slug]);

    fetch(`/data/catalog/${slug}.generated.json`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('missing category file'))))
      .then((rows) => {
        if (canceled) return;
        const nextRows = Array.isArray(rows) ? rows as SanMarPreviewItem[] : [];
        if (nextRows.length > 0) {
          setPreviewCatalog(nextRows);
          setCategoryCatalogStatus(`Loaded category file: ${slug}.generated.json`);
          return;
        }
        setPreviewCatalog(fallbackPreviewCatalog);
        setCategoryCatalogStatus(`Loaded category file: fallback catalog-preview-25.json (${slug}.generated.json is empty)`);
      })
      .catch(() => {
        if (canceled) return;
        setPreviewCatalog(fallbackPreviewCatalog);
        setCategoryCatalogStatus(`Loaded category file: fallback catalog-preview-25.json (${slug}.generated.json missing)`);
      })
      .finally(() => {
        if (!canceled) setIsCategoryCatalogLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [categoryFilter, fallbackPreviewCatalog, globalCatalog]);


  useEffect(() => {
    setVisibleProductCount(PRODUCTS_PAGE_SIZE);
  }, [searchQuery, brandFilter, categoryFilter, sortOption]);

  const clearCatalogFilters = () => {
    setSearchQuery('');
    setBrandFilter('all');
    setCategoryFilter('all');
    setSortOption('style');
  };

  const exportDesign = () => {
    const canvas = fabricCanvasRef.current; if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 });
    const link = document.createElement('a'); link.download = `${productMode}-design-${productMode === 'apparel' ? `${shirtView}-${printLocation}` : selectedSignProduct.id}.png`; link.href = dataUrl; link.click();
  };

  const requestApparelEstimate = async () => {
    setApparelEstimate(null);
    setApparelEstimateStatus('');

    if (totalQuantity <= 0) {
      setApparelEstimateStatus('Add at least one garment quantity before requesting pricing.');
      return;
    }

    const sizes = Object.fromEntries(Object.entries(sizeQuantities).filter(([, quantity]) => Number(quantity) > 0));
    const style = selectedPreview?.styleNumber || selectedProduct.id;
    const title = selectedProductName;
    const color = selectedColorName;
    const nextMethod = estimatedMethod;
    const activeLocations = selectedPrintLocations.length ? selectedPrintLocations : [printLocation];
    const endpoint = nextMethod === 'dtf' ? '/api/pricing/dtf' : '/api/pricing/screenprint';
    const payload = nextMethod === 'dtf'
      ? {
          apparel: { style, title, color, sizes, sizeQty: sizes },
          printLocations: activeLocations.map((location) => {
            const size = resolveLocationSize(locationSettings[location]);
            return {
              placement: resolveDtfPlacement(location),
              enabled: true,
              size
            };
          }),
          sameDesign: true
        }
      : {
          lineItems: [
            { style, title, color, sizes, sizeQty: sizes }
          ],
          printLines: [
            {
              id: 'front',
              name: 'Front',
              colors: activeLocations.some((location) => location !== 'full-back') ? estimatedColorCount : 0
            },
            {
              id: 'back',
              name: 'Back',
              colors: activeLocations.includes('full-back') ? estimatedColorCount : 0
            }
          ],
          sameDesign: true
        };

    setIsApparelEstimateLoading(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json() as ApparelApiEstimate;

      if (!response.ok || data.ok === false) {
        const fieldMessages = data.error?.fields ? Object.entries(data.error.fields).map(([field, message]) => `${field}: ${message}`).join(' ') : '';
        setApparelEstimateStatus([data.error?.message || 'The apparel estimate could not be returned.', fieldMessages].filter(Boolean).join(' '));
        return;
      }

      setApparelEstimate(data);
      setApparelEstimateMethod(nextMethod);
      setApparelEstimateStatus(`${nextMethod === 'dtf' ? 'DTF' : 'Screen print'} estimate loaded from pricing API.`);
    } catch {
      setApparelEstimateStatus('The apparel estimate could not be loaded right now.');
    } finally {
      setIsApparelEstimateLoading(false);
    }
  };

  const requestSignEstimate = async () => {
    setSignEstimate(null);
    setSignEstimateStatus('');
    const payload = toSignPricingPayload(selectedSignProduct, signValues);
    const missingNumber = selectedSignProduct.id === 'yard-sign'
      ? !payload.quantity || Number.isNaN(payload.quantity)
      : selectedSignProduct.fields.some((field) => field.type === 'number' && (!payload[field.name] || Number.isNaN(payload[field.name])));

    if (missingNumber) {
      setSignEstimateStatus('Please enter valid sign dimensions and quantity.');
      return;
    }

    setIsSignEstimateLoading(true);
    try {
      const response = await fetch(`/api/pricing/${selectedSignProduct.apiSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json() as SignEstimate;

      if (!response.ok || data.ok === false) {
        const fieldMessages = data.error?.fields ? Object.entries(data.error.fields).map(([field, message]) => `${field}: ${message}`).join(' ') : '';
        setSignEstimateStatus([data.error?.message || 'The sign estimate could not be returned.', fieldMessages].filter(Boolean).join(' '));
        return;
      }

      setSignEstimate(data);
      setSignEstimateStatus(`${selectedSignProduct.name} estimate loaded.`);
    } catch {
      setSignEstimateStatus('The sign estimate could not be loaded right now.');
    } finally {
      setIsSignEstimateLoading(false);
    }
  };

  const visibleStoreProducts = STORE_PRODUCTS.filter((product) => product.category === storeCategory);
  const filteredCoroSizeOptions = CORO_SIZE_OPTIONS.filter((option) => {
    const query = coroSizeSearch.trim().toLowerCase();
    if (!query) return true;
    return option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query.replace(/\s/g, ''));
  });

  const openStoreCategory = (categoryId: StoreCategoryId) => {
    setStoreCategory(categoryId);
    if (categoryId === 'coro') {
      setProductMode('signage');
      setSignProductId('yard-sign');
      setStoreView('builder');
      return;
    }
    if (categoryId === 'apparel') {
      setProductMode('apparel');
      setStoreView('builder');
      return;
    }
    setStoreView('store');
  };

  const openStoreProduct = (product: StoreProductCard) => {
    if (product.disabled) return;
    setProductMode(product.mode);
    if (product.signProductId) setSignProductId(product.signProductId);
    setStoreView('builder');
  };

  const updateSignOption = (name: string, value: string | boolean) => {
    setSignValues((prev) => ({ ...prev, [name]: value }));
    setSignEstimate(null);
  };

  const openCoroOptionPanel = (panel: CoroOptionPanel) => {
    setActiveCoroOptionPanel((current) => current === panel ? null : panel);
  };

  const handleCoroTileClick = (label: string) => {
    if (label === 'Images') {
      openCoroOptionPanel('images');
      return;
    }
    if (label === 'Size') {
      openCoroOptionPanel('size');
      return;
    }
    if (label === 'Material') {
      openCoroOptionPanel('material');
      return;
    }
    if (label === 'Print Sides') {
      openCoroOptionPanel('sides');
      return;
    }
    if (label === 'Grommets') {
      updateSignOption('grommets', !Boolean(signValues.grommets));
      return;
    }
    if (label === 'Step Stakes') {
      openCoroOptionPanel('stakes');
      return;
    }
    if (label === 'Gloss') {
      updateSignOption('gloss', !Boolean(signValues.gloss));
    }
  };

  return (
    <main className={`min-h-screen ${isCoroBuilder ? 'bg-[#202224] pb-0 text-slate-100' : 'bg-[#f4f8fc] pb-24 text-slate-950'}`}>
      <input id="artwork-upload-input" ref={artworkUploadInputRef} onChange={onUploadImage} className="fixed -left-96 top-0 h-px w-px opacity-0" type="file" accept="image/*,application/pdf,.pdf" />
      <header className={`${isCoroBuilder ? 'border-b border-slate-200 bg-white px-4 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.18)] md:px-5' : 'border-b border-white/70 bg-white/90 px-4 py-3 shadow-[0_8px_30px_rgba(7,17,31,0.06)] backdrop-blur md:px-6'}`}>
        <div className={`mx-auto flex max-w-[1800px] flex-wrap items-center gap-3 ${isCoroBuilder ? 'justify-between' : ''}`}>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className={`${isCoroBuilder ? 'h-12 w-12 rounded-md border-2' : 'h-14 w-14 rounded-lg border-[3px]'} flex shrink-0 items-center justify-center overflow-hidden border-[#1678b8] bg-[#030706] shadow-sm`}>
              <img src="/brand/hue-graphics-mark.png" alt="Hue Graphics" className="h-full w-full object-cover" />
            </div>
            <div className={`min-w-0 ${isCoroBuilder ? 'hidden xl:block' : ''}`}>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#1f73be]">Hue Graphics / Est. 2008</p>
              <h1 className="truncate text-xl font-black tracking-tight text-[#05090b] md:text-2xl">Print-Ready Store</h1>
            </div>
          </div>
          {isCoroBuilder ? <nav className="order-3 flex w-full items-center justify-center gap-1 overflow-x-auto px-1 pt-2 text-[10px] font-semibold uppercase text-slate-500 md:order-none md:w-auto md:flex-1 md:pt-0">
            {STORE_CATEGORIES.map((category) => {
              const active = storeCategory === category.id;
              const icon = category.id === 'banners' ? 'BN' : category.id === 'rigid' ? 'RG' : category.id === 'decals' ? 'AD' : category.id === 'magnets' ? 'MG' : category.id === 'apparel' ? 'AP' : category.id === 'misc' ? 'MS' : 'CO';
              return <button key={category.id} type="button" onClick={() => openStoreCategory(category.id)} className={`group flex min-w-20 flex-col items-center gap-1 border-b-2 px-2 py-1 transition ${active ? 'border-[#1678b8] text-[#1678b8]' : 'border-transparent hover:border-slate-300 hover:text-slate-800'}`}>
                <span className={`flex h-8 w-8 items-center justify-center border text-[10px] font-black ${active ? 'border-[#1678b8] bg-[#eaf5fb]' : 'border-slate-300 bg-white group-hover:bg-slate-50'}`}>{icon}</span>
                <span>{category.label}</span>
              </button>;
            })}
          </nav> : null}
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => setStoreView('store')} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium hover:bg-slate-50">Products</button>
            {storeView === 'builder' && !isCoroBuilder ? <button onClick={saveDraftToLocal} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium hover:bg-slate-50">Save</button> : null}
            {storeView === 'builder' && !isCoroBuilder ? <button onClick={exportDesign} className="rounded-md bg-[#1678b8] px-3 py-2 font-bold text-white hover:bg-[#0f5f94]">Download PNG</button> : null}
            {isCoroBuilder ? <button type="button" onClick={() => setShowImageZone(true)} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-bold text-slate-700 hover:bg-slate-50">Image Zone</button> : null}
            <button className="rounded-md border border-[#1f73be]/25 bg-[#eef6ff] px-3 py-2 font-bold text-[#125b99] hover:bg-[#dff0ff]">Cart</button>
            {isCoroBuilder ? <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-2 font-bold text-slate-600 hover:bg-slate-50">Menu</button> : null}
          </div>
        </div>
      </header>

      {storeView === 'store' ? (
        <section className="mx-auto max-w-[1800px] px-4 py-5 md:px-6">
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="rounded-lg border border-white/80 bg-white/92 p-4 shadow-[0_18px_48px_rgba(7,17,31,0.08)]">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#1f73be]">Online ordering</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Shop ready artwork products</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Upload finished artwork, check fit, get online pricing, and checkout separately from the quote system.</p>
              <div className="mt-5 space-y-2">
                {STORE_CATEGORIES.map((category) => <button key={category.id} type="button" onClick={() => setStoreCategory(category.id)} className={`w-full rounded-md border p-3 text-left transition ${storeCategory === category.id ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94] shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><span className="block text-sm font-bold">{category.label}</span><span className="mt-1 block text-xs text-slate-500">{category.description}</span></button>)}
              </div>
            </aside>

            <section className="overflow-hidden rounded-lg border border-white/80 bg-white/88 shadow-[0_18px_48px_rgba(7,17,31,0.08)]">
              <div className="relative min-h-64 overflow-hidden bg-[#dff0ff]">
                <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(22,120,184,0.92),rgba(255,255,255,0.58)),linear-gradient(90deg,rgba(5,9,11,0.16)_1px,transparent_1px)] bg-[size:auto,34px_34px]" />
                <div className="relative grid min-h-64 items-center gap-6 px-6 py-8 md:grid-cols-[minmax(0,1fr)_360px] lg:px-10">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-white/90">Hue Graphics online store</p>
                    <h2 className="mt-3 max-w-2xl text-4xl font-black tracking-tight text-white md:text-5xl">Fast print-ready ordering</h2>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-white/90">For finished artwork that is ready to print. If the file needs design help, cleanup, or quoting, use the regular request path.</p>
                  </div>
                  <div className="rounded-lg border border-white/50 bg-white/85 p-4 shadow-[0_18px_40px_rgba(7,17,31,0.18)]">
                    <p className="text-sm font-black text-slate-950">Ready artwork checklist</p>
                    <div className="mt-3 grid gap-2 text-sm text-slate-700">
                      <span className="rounded-md bg-green-50 px-3 py-2 text-green-700">Fits selected size</span>
                      <span className="rounded-md bg-green-50 px-3 py-2 text-green-700">Artwork uploaded before checkout</span>
                      <span className="rounded-md bg-amber-50 px-3 py-2 text-amber-700">Design help routes to quote</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 md:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-black text-slate-950">{STORE_CATEGORIES.find((category) => category.id === storeCategory)?.label || 'Products'}</h3>
                    <p className="mt-1 text-sm text-slate-500">Choose a product to open the print-ready builder.</p>
                  </div>
                  <button type="button" onClick={() => setStoreCategory('apparel')} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">Apparel Designer</button>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {visibleStoreProducts.map((product) => <button key={product.id} type="button" onClick={() => openStoreProduct(product)} className={`group min-h-52 rounded-lg border p-5 text-left shadow-sm transition ${product.disabled ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-75' : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-[#1678b8] hover:shadow-[0_18px_42px_rgba(7,17,31,0.12)]'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-md bg-[#07111f] text-sm font-black uppercase text-white ring-4 ring-[#eaf5fb]">{product.category === 'apparel' ? 'T' : product.title.slice(0, 2)}</div>
                      {product.badge ? <span className={`rounded-full px-2 py-1 text-xs font-bold ${product.disabled ? 'bg-slate-200 text-slate-500' : 'bg-[#eaf5fb] text-[#0f5f94]'}`}>{product.badge}</span> : null}
                    </div>
                    <p className="mt-5 text-xl font-black tracking-tight text-slate-950">{product.title}</p>
                    <p className="mt-1 text-sm font-semibold text-[#1678b8]">{product.subtitle}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{product.description}</p>
                    <span className={`mt-5 inline-flex rounded-md px-3 py-2 text-sm font-bold ${product.disabled ? 'bg-slate-200 text-slate-500' : 'bg-[#1678b8] text-white group-hover:bg-[#0f5f94]'}`}>{product.disabled ? 'Coming soon' : 'Start order'}</span>
                  </button>)}
                </div>
              </div>
            </section>
          </div>
        </section>
      ) : (
      <>
      <div className={`mx-auto grid gap-4 xl:items-start ${isCoroBuilder ? 'max-w-none px-0 py-0 xl:grid-cols-1' : 'max-w-[1800px] px-4 py-4 md:px-6 xl:grid-cols-[300px_minmax(520px,1fr)_360px]'}`}>
        <aside id="product" className={`${isCoroBuilder ? 'hidden' : 'rounded-lg border border-white/80 bg-white/92 shadow-[0_18px_48px_rgba(7,17,31,0.08)] backdrop-blur xl:sticky xl:top-4 xl:max-h-[calc(100vh-8rem)] xl:overflow-hidden'}`}>
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Product</h2>
                <p className="mt-1 truncate text-sm font-medium">{designerProductName}</p>
                <p className="truncate text-xs text-slate-500">{designerProductDetail}</p>
              </div>
              {productMode === 'apparel' ? <img src={getProductCardImage(selectedPreview)} alt={selectedProductName} className="h-14 w-14 rounded-md border border-slate-200 bg-slate-100 object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-md border border-[#1678b8]/25 bg-[#eaf5fb] text-xs font-bold text-[#1678b8]">Sign</div>}
            </div>
          </div>

          <div className="space-y-3 p-4">
            <div className={`grid grid-cols-2 gap-2 ${isCoroBuilder ? 'hidden' : ''}`}>
              {(['apparel', 'signage'] as ProductMode[]).map((mode) => <button key={mode} type="button" onClick={() => setProductMode(mode)} className={`rounded-md border px-3 py-2 text-xs font-bold ${productMode === mode ? 'border-[#1678b8] bg-[#1678b8] text-white shadow-sm' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{mode === 'apparel' ? 'Apparel' : 'Signs'}</button>)}
            </div>
            {productMode === 'apparel' ? <>
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search catalog" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#1678b8] focus:ring-2 focus:ring-[#1678b8]/15" />
              <div className="grid grid-cols-2 gap-2">
                <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)} className="min-w-0 rounded-md border border-slate-300 px-2 py-2 text-xs"><option value="all">All Brands</option>{brandOptions.map((brand) => <option key={brand} value={brand}>{brand}</option>)}</select>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="min-w-0 rounded-md border border-slate-300 px-2 py-2 text-xs"><option value="all">All Categories</option>{categoryOptions.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select>
                <select value={sortOption} onChange={(event) => setSortOption(event.target.value as 'style' | 'name' | 'brand')} className="col-span-2 rounded-md border border-slate-300 px-2 py-2 text-xs"><option value="style">Style number A-Z</option><option value="name">Product name A-Z</option><option value="brand">Brand A-Z</option></select>
              </div>
              {hasActiveCatalogFilters ? <button onClick={clearCatalogFilters} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium hover:bg-slate-50">Clear Filters</button> : null}
            </> : isCoroBuilder ? <div className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Size</p>
                  <span className="rounded bg-green-100 px-2 py-1 text-xs font-bold text-green-700">{coroSheetLayout.signsPerSheet} / sheet</span>
                </div>
                <input value={coroSizeSearch} onChange={(event) => setCoroSizeSearch(event.target.value)} placeholder="Search sizes" className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#1678b8] focus:ring-2 focus:ring-[#1678b8]/15" />
                <div className="mt-2 max-h-[48vh] space-y-1 overflow-y-auto pr-1">
                  {filteredCoroSizeOptions.map((option) => {
                    const parsed = parseCoroSize(option.value);
                    const layout = getCoroSheetLayout(parsed.width, parsed.height, designerQuantity);
                    const selected = String(signValues.size || '24x18') === option.value;
                    return <button key={option.value} type="button" onClick={() => { setSignValues((prev) => ({ ...prev, size: option.value })); setSignEstimate(null); }} className={`w-full rounded border px-3 py-2 text-left text-xs ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><span className="block font-bold">{option.label}</span><span className="mt-1 block text-slate-500">{layout.columns} across x {layout.rows} down / {layout.sheetCount} sheet{layout.sheetCount === 1 ? '' : 's'}</span></button>;
                  })}
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Order</p>
                <div className="mt-3 grid gap-3">
                  <label className="text-xs font-medium text-slate-600">Quantity<input type="number" min={1} value={String(signValues.quantity ?? '')} onChange={(event) => { setSignValues((prev) => ({ ...prev, quantity: event.target.value })); setSignEstimate(null); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950" /></label>
                  <label className="text-xs font-medium text-slate-600">Material<select value={String(signValues.material ?? '4mm')} onChange={(event) => { setSignValues((prev) => ({ ...prev, material: event.target.value })); setSignEstimate(null); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950"><option value="4mm">4mm CORO</option><option value="10mm">10mm CORO</option></select></label>
                  <label className="text-xs font-medium text-slate-600">Print Sides<select value={String(signValues.sides ?? 'single')} onChange={(event) => { setSignValues((prev) => ({ ...prev, sides: event.target.value })); setSignEstimate(null); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950"><option value="single">Single-Sided</option><option value="double">Double-Sided</option></select></label>
                </div>
              </div>
              <button type="button" onClick={() => isCoroBuilder ? setShowImageZone(true) : triggerArtworkUpload()} className="w-full rounded-md bg-[#1678b8] px-3 py-3 text-sm font-black uppercase tracking-wide text-white hover:bg-[#0f5f94]">{signArtworkPreviewUrl ? 'Replace Artwork' : 'Upload Artwork'}</button>
            </div> : <div className="space-y-3">
              <div className="grid gap-2">
                {SIGN_PRODUCT_CONFIGS.map((product) => <button key={product.id} type="button" onClick={() => setSignProductId(product.id)} className={`rounded-md border p-3 text-left ${signProductId === product.id ? 'border-[#1678b8] bg-[#eaf5fb] ring-1 ring-[#1678b8]/15' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><p className="text-sm font-bold">{product.name}</p><p className="mt-1 text-xs text-slate-500">{product.description}</p></button>)}
              </div>
              {selectedSignProduct.id === 'yard-sign' ? <div className="rounded-md border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Preset sizes</p>
                  <span className="rounded bg-green-100 px-2 py-1 text-xs font-bold text-green-700">{coroSheetLayout.signsPerSheet} / sheet</span>
                </div>
                <button type="button" className="mt-3 w-full rounded-md bg-green-500 px-3 py-2 text-xs font-bold text-white hover:bg-green-600">Switch to Custom Cut</button>
                <input value={coroSizeSearch} onChange={(event) => setCoroSizeSearch(event.target.value)} placeholder="Search sizes" className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#1678b8] focus:ring-2 focus:ring-[#1678b8]/15" />
                <div className="mt-2 max-h-52 space-y-1 overflow-y-auto pr-1">
                  {filteredCoroSizeOptions.map((option) => {
                    const parsed = parseCoroSize(option.value);
                    const layout = getCoroSheetLayout(parsed.width, parsed.height, designerQuantity);
                    const selected = String(signValues.size || '24x18') === option.value;
                    return <button key={option.value} type="button" onClick={() => { setSignValues((prev) => ({ ...prev, size: option.value })); setSignEstimate(null); }} className={`w-full rounded-md border px-3 py-2 text-left text-xs ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'}`}><span className="block font-semibold">{option.label}</span><span className="mt-1 block text-slate-500">{layout.columns} across x {layout.rows} down / {layout.sheetCount} sheet{layout.sheetCount === 1 ? '' : 's'} for qty</span></button>;
                  })}
                </div>
              </div> : null}
              <div className="grid gap-2">
                {selectedSignProduct.fields.filter((field) => selectedSignProduct.id !== 'yard-sign' || field.name !== 'size').map((field) => field.type === 'checkbox' ? <label key={field.name} className="flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"><input type="checkbox" checked={Boolean(signValues[field.name])} onChange={(event) => { setSignValues((prev) => ({ ...prev, [field.name]: event.target.checked })); setSignEstimate(null); }} /><span>{field.label}</span></label> : <label key={field.name} className="text-xs font-medium text-slate-600">{field.label}{field.type === 'select' ? <select value={String(signValues[field.name] ?? '')} onChange={(event) => { setSignValues((prev) => ({ ...prev, [field.name]: event.target.value })); setSignEstimate(null); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950">{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input type="number" min={field.name === 'quantity' ? 1 : 0.25} step={field.step} value={String(signValues[field.name] ?? '')} onChange={(event) => { setSignValues((prev) => ({ ...prev, [field.name]: event.target.value })); setSignEstimate(null); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950" />}</label>)}
              </div>
            </div>}
          </div>

          {productMode === 'apparel' ? <><div className="border-y border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">{sortedPreviewCatalog.length} results / {totalUniqueStyles} loaded styles</div>
          <div className="max-h-[42vh] space-y-2 overflow-y-auto p-3 xl:max-h-[calc(100vh-25rem)]">
            {sortedPreviewCatalog.length === 0 ? <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">No matching products.</p><button onClick={clearCatalogFilters} className="mt-2 rounded-md border border-amber-400 bg-white px-2 py-1 text-xs">Clear Filters</button></div> : null}
            {pagedPreviewCatalog.map((group, index) => {
              const catalogIndex = previewCatalog.findIndex((product) => product.styleNumber === group.styleNumber);
              const selected = selectedPreview?.styleNumber === group.styleNumber;
              return <button key={`${group.styleNumber}-${index}`} onClick={() => { if (catalogIndex >= 0) setSelectedPreviewId(catalogIndex); }} className={`w-full rounded-md border p-2 text-left transition ${selected ? 'border-[#1678b8] bg-[#eaf5fb] shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}><div className="flex gap-2"><img src={getProductCardImage(group.items[0])} alt={group.name} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = PRODUCT_IMAGE_PLACEHOLDER; }} className="h-14 w-14 shrink-0 rounded-md border border-slate-200 bg-slate-100 object-cover p-1" /><div className="min-w-0"><p className="text-sm font-semibold">{group.styleNumber}</p><p className="truncate text-sm text-slate-700">{group.name}</p><p className="truncate text-xs text-slate-500">{group.brand} / {group.items.length} colors</p></div></div></button>;
            })}
            {hasMoreProducts ? <button onClick={() => setVisibleProductCount((prev) => prev + PRODUCTS_PAGE_SIZE)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">Load More</button> : null}
          </div></> : <div className="border-t border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">Sign mode uses the same artwork tools with sign-specific sizing and pricing.</div>}
        </aside>

        <section className={`${isCoroBuilder ? 'border-0 bg-transparent shadow-none' : 'rounded-lg border border-white/80 bg-white/88 shadow-[0_18px_48px_rgba(7,17,31,0.08)] backdrop-blur xl:sticky xl:top-4 xl:min-h-[calc(100vh-8rem)]'}`}>
          <div className={`flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 ${isCoroBuilder ? 'hidden' : ''}`}>
            <button onClick={() => restoreHistory(-1)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">Undo</button>
            <button onClick={() => restoreHistory(1)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">Redo</button>
            <div className="ml-auto flex items-center rounded-md border border-slate-300 bg-white">
              <button aria-label="Zoom out" onClick={() => { const next = Math.max(0.5, zoom - 0.1); setZoom(next); fabricCanvasRef.current?.setZoom(next); }} className="px-3 py-2 text-sm font-semibold">-</button>
              <span className="min-w-14 border-x border-slate-200 px-2 text-center text-sm">{Math.round(zoom * 100)}%</span>
              <button aria-label="Zoom in" onClick={() => { const next = Math.min(2, zoom + 0.1); setZoom(next); fabricCanvasRef.current?.setZoom(next); }} className="px-3 py-2 text-sm font-semibold">+</button>
            </div>
          </div>

          <div className={`grid gap-3 ${isCoroBuilder ? 'p-0' : 'p-3'} ${productMode === 'signage' ? '' : 'lg:grid-cols-[minmax(0,1fr)_210px]'}`}>
            <div className={`relative flex items-center justify-center ${isCoroBuilder ? 'rounded-none p-0' : 'rounded-lg p-4'} ${productMode === 'signage' ? `${isCoroBuilder ? 'min-h-[calc(100vh-8.5rem)] pb-28 bg-[radial-gradient(circle_at_52%_35%,rgba(22,120,184,0.32),rgba(22,120,184,0.13)_22%,transparent_48%),linear-gradient(rgba(255,255,255,0.075)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.075)_1px,transparent_1px)] bg-[size:auto,24px_24px,24px_24px]' : 'min-h-[660px] bg-[linear-gradient(#e5e7eb_1px,transparent_1px),linear-gradient(90deg,#e5e7eb_1px,transparent_1px)] bg-[size:24px_24px]'} overflow-hidden bg-[#202224]` : 'min-h-[520px] overflow-hidden bg-[#e2e7ed]'}`}>
              {productMode === 'apparel' ? <div className="absolute bottom-4 left-4 top-4 z-20 hidden w-20 overflow-hidden rounded-lg border border-white/35 bg-[#07111f]/88 text-white shadow-[0_18px_45px_rgba(7,17,31,0.22)] backdrop-blur md:block">
                <div className="flex h-full flex-col items-stretch py-3 text-center text-[11px]">
                  <button type="button" className="px-2 py-3 text-[#1678b8] hover:bg-white/10" title="AI Design"><span className="block text-xl">AI</span><span>Design</span></button>
                  <button type="button" onClick={() => triggerArtworkUpload()} className="px-2 py-3 hover:bg-white/10" title="Upload artwork"><span className="block text-xl">Up</span><span>Upload</span></button>
                  <button type="button" onClick={addText} className="px-2 py-3 hover:bg-white/10" title="Add text"><span className="block text-xl">T</span><span>Add Text</span></button>
                  <button type="button" onClick={() => setTextValue('Custom art')} className="px-2 py-3 hover:bg-white/10" title="Add art"><span className="block text-xl">Art</span><span>Add Art</span></button>
                  <a href="#product" className="px-2 py-3 hover:bg-white/10" title="Product details"><span className="block text-xl">P</span><span>Product</span></a>
                  <a href="#quote" className="px-2 py-3 hover:bg-white/10" title="Names and quantities"><span className="block text-xl">00</span><span>Names</span></a>
                </div>
              </div> : null}
              {productMode === 'signage' ? <div className={`absolute z-10 grid items-start gap-3 text-slate-700 ${isCoroBuilder ? 'left-[9vw] right-[9vw] top-10 lg:grid-cols-[minmax(220px,1fr)_minmax(360px,0.9fr)_180px]' : 'inset-x-6 top-4 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1.1fr)_minmax(160px,0.6fr)_160px]'}`}>
                <div className="flex items-start gap-3">
                  <div className={`${isCoroBuilder ? 'hidden' : 'hidden h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 border-[#1678b8] bg-[#05090b] sm:block'}`}><img src="/brand/hue-graphics-mark.png" alt="Hue Graphics" className="h-full w-full object-cover" /></div>
                  <div>
                    <p className={`${isCoroBuilder ? 'hidden' : 'text-[10px] font-black uppercase tracking-[0.22em] text-[#1678b8]'}`}>Hue Production Builder</p>
                    <p className={`${isCoroBuilder ? 'text-3xl font-normal tracking-tight text-white' : 'text-2xl font-black tracking-tight text-slate-950'}`}>{selectedSignProduct.name}</p>
                    <p className={`mt-1 text-xs ${isCoroBuilder ? 'text-slate-300' : 'text-slate-500'}`}>{selectedSignProduct.name} {String(signValues.material || '4mm')} Single Sided , {signWidth || 0}&quot; x {signHeight || 0}&quot;</p>
                  </div>
                </div>
                <div className={`text-xs ${isCoroBuilder ? 'rounded-md border border-white/10 bg-[#1b1d1f]/55 px-4 py-2 text-slate-300 shadow-[0_0_42px_rgba(22,120,184,0.16)] backdrop-blur' : ''}`}>
                  <p className={`font-semibold uppercase ${isCoroBuilder ? 'text-center text-slate-200 underline decoration-slate-500' : 'text-slate-500'}`}>Pricing and Shipping</p>
                  <div className={`mt-1 grid gap-x-5 gap-y-1 ${isCoroBuilder ? 'grid-cols-[70px_1fr_1fr] text-center' : 'grid-cols-2'}`}>
                    {isCoroBuilder ? <>
                      <span />
                      <span className="font-bold text-slate-200">Single-Sided</span>
                      <span className="font-bold text-slate-200">Double-Sided</span>
                      <span>4mm</span>
                      <span>$44.00 per sheet</span>
                      <span>$55.00 per sheet</span>
                      <span>10mm</span>
                      <span>$70.00 per sheet</span>
                      <span>$90.00 per sheet</span>
                    </> : <>
                      <span>Single-Sided</span><span>Double-Sided</span>
                      <span>{selectedSignProduct.id === 'banner' ? '13oz / 15oz / 18oz' : `${String(signValues.material || '4mm')} CORO`}</span><span>{selectedSignProduct.id === 'yard-sign' ? 'Priced per sheet' : String(signValues.sides || 'single') === 'double' ? 'Enabled' : 'Optional'}</span>
                    </>}
                  </div>
                </div>
                <div className={`text-right ${isCoroBuilder ? 'pt-5' : ''}`}>
                  <p className={`${isCoroBuilder ? 'text-3xl' : 'text-2xl'} font-semibold text-green-500`}>{selectedSignProduct.id === 'yard-sign' && signPricePerSheet !== null ? formatSignPrice(signPricePerSheet, signEstimate?.currency) : signEstimate ? formatSignPrice(signEstimate.price?.retail, signEstimate.currency) : '$0.00'}</p>
                  <p className={`text-xs ${isCoroBuilder ? 'text-slate-300' : 'text-slate-500'}`}>{selectedSignProduct.id === 'yard-sign' ? `${coroSheetLayout.sheetCount} sheet${coroSheetLayout.sheetCount === 1 ? '' : 's'} / ${coroSheetLayout.signsPerSheet} per sheet` : `${signWidth * signHeight > 0 ? `${Math.round((signWidth * signHeight) / 144)} sqft` : '0 sqft'} / Production estimate`}</p>
                </div>
                <button type="button" onClick={requestSignEstimate} disabled={isSignEstimateLoading} className={`${isCoroBuilder ? 'hidden' : 'min-h-14'} bg-green-500 px-4 text-sm font-bold uppercase text-white hover:bg-green-600 disabled:cursor-wait disabled:opacity-70`}>{isSignEstimateLoading ? 'Pricing...' : signEstimate ? 'Update Price' : 'Price It'}</button>
              </div> : null}
              {productMode === 'apparel' && layers.length === 0 ? <div className="absolute bottom-20 left-24 top-6 z-10 hidden w-[min(540px,42vw)] rounded-lg bg-white p-8 shadow-sm lg:block">
                <h2 className="text-center text-2xl font-black text-[#05090b]">What&apos;s next for you?</h2>
                <div className="mx-auto mt-10 grid max-w-xs grid-cols-2 gap-8 text-center text-sm text-slate-700">
                  <button type="button" onClick={() => triggerArtworkUpload()} className="rounded-md p-3 hover:bg-[#eaf5fb]"><span className="mx-auto block h-14 w-20 rounded-full border-2 border-slate-400 text-3xl leading-[3rem] text-[#1678b8]">Up</span><span className="mt-2 block">Uploads</span></button>
                  <button type="button" onClick={addText} className="rounded-md p-3 hover:bg-[#eaf5fb]"><span className="mx-auto flex h-14 w-20 items-center justify-center rounded border-2 border-slate-400 text-lg font-bold text-slate-700">abc</span><span className="mt-2 block">Add Text</span></button>
                  <button type="button" onClick={() => triggerArtworkUpload()} className="rounded-md p-3 hover:bg-[#eaf5fb]"><span className="mx-auto flex h-14 w-20 items-center justify-center rounded border-2 border-slate-400 text-lg text-[#1678b8]">Img</span><span className="mt-2 block">Add Art</span></button>
                  <a href="#product" className="rounded-md p-3 hover:bg-[#eaf5fb]"><span className="mx-auto flex h-14 w-20 items-center justify-center rounded border-2 border-slate-400 text-lg text-slate-700">Shirt</span><span className="mt-2 block">Change Products</span></a>
                </div>
                <div className="absolute bottom-8 left-1/2 w-80 -translate-x-1/2 text-sm text-slate-700">
                  <p className="font-bold text-slate-950">Uploading anytime is simple.</p>
                  <p className="mt-3">Drag and drop artwork or use the upload button.</p>
                  <p className="mt-2">Copy and paste from your clipboard.</p>
                </div>
              </div> : null}
              {productMode === 'apparel' ? <div className="absolute right-4 top-4 z-20 hidden w-20 space-y-2 md:block">
                <button type="button" onClick={() => setShirtView('front')} className={`w-full rounded-lg bg-white p-2 text-xs shadow-sm ${shirtView === 'front' ? 'ring-2 ring-[#1678b8]' : ''}`}><span className="block h-12 rounded bg-slate-100" />Front</button>
                <button type="button" onClick={() => setShirtView('back')} className={`w-full rounded-lg bg-white p-2 text-xs shadow-sm ${shirtView === 'back' ? 'ring-2 ring-[#1678b8]' : ''}`}><span className="block h-12 rounded bg-slate-100" />Back</button>
                <button type="button" onClick={() => setPrintLocation('sleeve')} className="w-full rounded-lg bg-white p-2 text-xs shadow-sm">Sleeve<br />Design</button>
                <button type="button" onClick={() => { const next = Math.min(2, zoom + 0.1); setZoom(next); fabricCanvasRef.current?.setZoom(next); }} className="w-full rounded-lg bg-white p-2 text-xs shadow-sm">+<br />Zoom</button>
              </div> : null}
              <div id="design-canvas" className={`relative w-full ${productMode === 'signage' ? `${isCoroBuilder ? 'mt-20' : 'mt-24'} aspect-[4/3] max-w-[1040px]` : productMode === 'apparel' ? 'aspect-[420/520] max-w-[860px]' : 'aspect-[420/520] max-w-[760px]'}`}>
                {productMode === 'signage' ? <div className="absolute inset-0 flex items-center justify-center">
                  {selectedSignProduct.id === 'yard-sign' ? <div className="relative flex w-[23%] min-w-56 max-w-[360px] items-center justify-center" style={{ aspectRatio: CORO_SHEET.width / CORO_SHEET.height }}>
                    <div className="absolute -top-8 left-0 right-0 text-center text-sm font-bold text-slate-100">{coroSheetLayout.signsPerSheet} signs / Top of Sheet</div>
                    <div className="absolute -bottom-8 left-0 right-0 text-center text-xs text-slate-300">Sheet #1 / 48&quot; x 96&quot; / Front Side</div>
                    <div className="absolute -left-8 bottom-0 top-0 text-xs text-slate-300"><span className="absolute left-[-10px] top-1/2 -translate-y-1/2 -rotate-90 bg-[#202224]/80 px-2">Left</span></div>
                    <div className="absolute -right-8 bottom-0 top-0 text-xs text-slate-300"><span className="absolute right-[-12px] top-1/2 -translate-y-1/2 rotate-90 bg-[#202224]/80 px-2">Right</span></div>
                    <button type="button" onClick={() => { if (!hasCoroSheetArtwork) setShowImageZone(true); }} className="absolute inset-0 border border-slate-500 bg-white text-left shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
                      <div className="grid h-full w-full gap-[2px] p-1" style={{ gridTemplateColumns: `repeat(${coroSheetLayout.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${coroSheetLayout.rows}, minmax(0, 1fr))` }}>
                        {Array.from({ length: coroSheetLayout.signsPerSheet }).map((_, index) => {
                          const sheetItem = coroSheetArtworkItems.length ? coroSheetArtworkItems[coroMultipleImages ? index % coroSheetArtworkItems.length : 0] : null;
                          const cellImage = sheetItem?.dataUrl || signArtworkPreviewUrl;
                          return <div key={index} className="relative flex items-center justify-center overflow-hidden border border-dashed border-[#64748b] bg-[repeating-linear-gradient(90deg,#f8fafc_0,#f8fafc_6px,#e2e8f0_6px,#e2e8f0_7px)]">{cellImage ? <img src={cellImage} alt="" className="h-full w-full object-cover" /> : <span className="px-1 text-center text-[8px] font-bold uppercase leading-tight text-slate-400">add art</span>}</div>;
                        })}
                      </div>
                    </button>
                    {!hasCoroSheetArtwork && layers.length === 0 ? <button type="button" onClick={() => setShowImageZone(true)} className="relative z-10 rounded bg-[#1678b8] px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-[#0f5f94]">Upload artwork</button> : null}
                  </div> : <div className="relative flex w-[82%] items-center justify-center" style={{ aspectRatio: signPreviewAspect }}>
                    <div className="absolute -top-7 left-0 right-0 border-t border-slate-300 text-center text-xs text-slate-500"><span className="bg-white/80 px-2">{signWidth || 0}&quot;</span></div>
                    <div className="absolute -bottom-7 left-0 right-0 text-center text-xs text-slate-500">Top of Image</div>
                    <div className="absolute -left-9 bottom-0 top-0 border-l border-slate-300 text-xs text-slate-500"><span className="absolute left-[-12px] top-1/2 -translate-y-1/2 -rotate-90 bg-white/80 px-2">{signHeight || 0}&quot;</span></div>
                    <div className="absolute -right-9 bottom-0 top-0 border-r border-slate-300 text-xs text-slate-500"><span className="absolute right-[-12px] top-1/2 -translate-y-1/2 rotate-90 bg-white/80 px-2">{signHeight || 0}&quot;</span></div>
                    <div className="absolute inset-0 rounded-sm border border-slate-300 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
                      <div className="absolute inset-3 border border-dashed border-slate-300" />
                      <div className="absolute inset-1">{[0, 1, 2, 3].map((dot) => <span key={dot} className={`absolute h-2 w-2 rounded-full border border-slate-400 bg-slate-100 ${dot === 0 ? 'left-0 top-0' : dot === 1 ? 'right-0 top-0' : dot === 2 ? 'bottom-0 left-0' : 'bottom-0 right-0'}`} />)}</div>
                    </div>
                    {layers.length === 0 ? <span className="pointer-events-none relative z-10 rounded bg-white/85 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Upload artwork or add text</span> : null}
                  </div>}
                </div> : hasPreviewImage && resolvedImageUrl ? <img src={resolvedImageUrl} alt={`${selectedPreview?.productName || 'Selected product'} ${selectedPreview?.colorName || ''}`} className="h-full w-full rounded-md object-contain" /> : <TshirtShape color={shirtColor} bodyPath={selectedProduct.mockups[shirtView]} view={shirtView} />}
                {productMode === 'apparel' && showPrintArtboard ? <div className="pointer-events-none absolute rounded-md border border-dashed border-[#1678b8]/60 bg-[#1678b8]/10 shadow-[0_0_0_9999px_rgba(255,255,255,0.04)]" style={{ top: `${artboardPercent.top}%`, left: `${artboardPercent.left}%`, width: `${artboardPercent.width}%`, height: `${artboardPercent.height}%` }}><span className="absolute -top-7 left-0 rounded bg-[#1678b8] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">{PRINT_AREA_CONFIG[printLocation].label}</span></div> : null}
                <div className={`designer-fabric-layer absolute ${productMode === 'signage' ? selectedSignProduct.id === 'yard-sign' ? 'pointer-events-none left-1/2 top-1/2 w-[23%] min-w-56 max-w-[360px] -translate-x-1/2 -translate-y-1/2 opacity-0' : 'left-1/2 top-1/2 w-[82%] -translate-x-1/2 -translate-y-1/2' : 'inset-0'}`} style={productMode === 'signage' ? { aspectRatio: signPreviewAspect } : undefined}><canvas ref={canvasElRef} className="h-full w-full touch-none" /></div>
              </div>
              {productMode === 'signage' && selectedSignProduct.id === 'yard-sign' && activeCoroOptionPanel !== 'images' ? <div className="absolute bottom-24 left-12 z-10 text-sm">
                <label className="flex items-center gap-2 text-xs text-slate-200">
                  <input type="checkbox" checked={coroMultipleImages} onChange={(event) => setCoroMultipleImages(event.target.checked)} />
                  <span className="font-medium">Multiple Images?</span>
                </label>
              </div> : null}
              {productMode === 'signage' && selectedSignProduct.id === 'yard-sign' && !isCoroBuilder ? <div className="absolute left-4 top-24 z-10 w-60 rounded border border-slate-200 bg-white/95 p-3 text-sm shadow-[0_12px_30px_rgba(7,17,31,0.10)]">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-yellow-300 text-xs font-black text-slate-950">1</span>
                  <p className="font-bold text-slate-950">Artwork</p>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">{signArtworkPreviewUrl ? `${coroSheetLayout.signsPerSheet} placed on this sheet.` : 'Upload finished artwork.'}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setShowImageZone(true)} className="rounded-md bg-[#1678b8] px-3 py-2 text-xs font-bold text-white hover:bg-[#0f5f94]">{signArtworkPreviewUrl ? 'Replace' : 'Upload'}</button>
                  <button type="button" onClick={clearSignArtwork} disabled={!signArtworkPreviewUrl} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45">Clear</button>
                </div>
                <label className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <input type="checkbox" checked={coroMultipleImages} onChange={(event) => setCoroMultipleImages(event.target.checked)} />
                  <span>Multiple images on one sheet</span>
                </label>
                {coroMultipleImages ? <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">Multiple-image placement is next. For now, one image fills every cut position.</p> : null}
              </div> : null}
              {isCoroBuilder && activeCoroOptionPanel === 'images' ? <aside className="absolute bottom-24 left-4 top-24 z-20 w-[min(330px,calc(100vw-2rem))] overflow-y-auto rounded-md border border-slate-500 bg-[#f8fafc] p-3 text-slate-950 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
                <div className={`rounded p-3 ${signArtworkStatusOk ? 'bg-green-100' : 'bg-red-100'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className={`text-base font-black uppercase leading-tight ${signArtworkStatusOk ? 'text-green-700' : 'text-red-600'}`}>Item #1 / {signArtworkStatusLabel}</h3>
                      <p className="mt-2 text-xs text-slate-700">width: <span className="font-bold">{signWidth || 0}</span>&quot; <span className="ml-3">height: <span className="font-bold">{signHeight || 0}</span>&quot;</span> <span className="ml-3">qty: <span className="font-bold">{designerQuantity}</span></span></p>
                    </div>
                    <button type="button" onClick={clearSignArtwork} disabled={!signArtworkPreviewUrl && layers.length === 0} className="rounded border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45">delete</button>
                  </div>
                  {signArtworkPreviewUrl ? <button type="button" onClick={() => setShowImageZone(true)} className="mt-3 flex min-h-28 w-full items-center justify-center border border-slate-300 bg-white p-2 text-center text-[10px] uppercase text-slate-400 hover:border-[#1678b8] hover:text-[#1678b8]">
                    {signArtworkPreviewUrl ? <span className="w-full">
                      <img src={signArtworkPreviewUrl} alt="" className="mx-auto max-h-24 max-w-full object-contain" />
                      <span className="mt-2 block text-[10px] font-bold text-slate-600">Placed {coroSheetLayout.signsPerSheet} per sheet</span>
                      {signArtworkSize ? <span className="mt-1 block text-[10px] text-slate-500">Actual: {signArtworkSize.width}&quot; x {signArtworkSize.height}&quot;</span> : null}
                    </span> : <span>Click here to upload or select front image</span>}
                  </button> : <label htmlFor="artwork-upload-input" onClick={() => setImageLibraryStatus('Choose an image or PDF artwork file.')} className="mt-3 flex min-h-28 w-full cursor-pointer items-center justify-center border border-slate-300 bg-white p-2 text-center text-[10px] uppercase text-slate-400 hover:border-[#1678b8] hover:text-[#1678b8]">Click here to upload or select front image</label>}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <button type="button" className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-400">Contour Cut</button>
                    <button type="button" className="rounded border border-slate-300 bg-white px-2 py-2">Color Matching</button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <button type="button" onClick={() => fitSelectedArtwork('cover')} disabled={!activeObject} className="rounded bg-[#1678b8] px-2 py-2 font-bold text-white hover:bg-[#0f5f94] disabled:cursor-not-allowed disabled:opacity-40">Fit</button>
                    <button type="button" onClick={centerSelectedArtwork} disabled={!activeObject} className="rounded border border-[#1678b8] bg-white px-2 py-2 font-bold text-[#1678b8] hover:bg-[#eaf5fb] disabled:cursor-not-allowed disabled:opacity-40">Center</button>
                    <button type="button" onClick={() => fitSelectedArtwork('stretch')} disabled={!activeObject} className="rounded border border-slate-300 bg-white px-2 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40">Stretch</button>
                    <button type="button" onClick={() => setShowImageZone(true)} className="rounded border border-slate-300 bg-white px-2 py-2 font-medium hover:bg-slate-50">Image Zone</button>
                  </div>
                </div>
                <button type="button" className="mt-3 flex h-24 w-full items-center justify-center border border-dashed border-slate-300 bg-white text-sm font-medium text-slate-700 hover:border-[#1678b8] hover:text-[#1678b8]">+ Add Sign</button>
                <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={coroMultipleImages} onChange={(event) => setCoroMultipleImages(event.target.checked)} />
                  <span className="font-medium">Multiple Images?</span>
                </label>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label htmlFor="artwork-upload-input" onClick={() => setImageLibraryStatus('Choose an image or PDF artwork file.')} className="cursor-pointer rounded bg-[#1678b8] px-3 py-2 text-center text-xs font-black uppercase text-white hover:bg-[#0f5f94]">Upload File</label>
                  <button type="button" onClick={() => setShowImageZone(true)} className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase text-slate-700 hover:bg-slate-50">Library</button>
                </div>
                {imageLibraryStatus ? <p className="mt-3 rounded border border-slate-200 bg-white p-2 text-xs leading-5 text-slate-600">{isImageLibraryLoading ? 'Loading library... ' : ''}{imageLibraryStatus}</p> : null}
                <div className="mt-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Sheet Images</p>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">{imageZoneItems.length}</span>
                  </div>
                  <div className="mt-2 max-h-60 space-y-2 overflow-y-auto pr-1">
                    {imageZoneItems.length === 0 ? <p className="rounded border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">Uploaded art will show here for this session.</p> : imageZoneItems.map((item) => {
                      const selected = selectedImageZoneId === item.id;
                      return <button key={item.id} type="button" onClick={async () => { await useImageZoneItem(item); }} className={`flex w-full items-center gap-3 rounded border bg-white p-2 text-left text-xs transition ${selected ? 'border-[#1678b8] ring-2 ring-[#1678b8]/20' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                        {item.mimeType?.startsWith('image/') || item.dataUrl.startsWith('data:image/') ? <img src={item.dataUrl} alt="" className="h-12 w-16 shrink-0 rounded border border-slate-200 object-contain" /> : <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[10px] font-black text-slate-500">PDF</span>}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold text-slate-800">{item.name}</span>
                          <span className="mt-1 block text-slate-500">{item.width} x {item.height}px</span>
                          <span className="mt-1 block text-slate-400">{item.source === 'supabase' ? 'Stored in Supabase' : 'Browser preview'}</span>
                        </span>
                        <span className="rounded bg-green-500 px-2 py-1 font-black uppercase text-white">Use</span>
                      </button>;
                    })}
                  </div>
                </div>
                <button type="button" onClick={() => setActiveCoroOptionPanel(null)} className="mt-4 w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase text-slate-600 hover:bg-slate-50">Close Panel</button>
              </aside> : null}
              {isCoroBuilder && activeCoroOptionPanel && activeCoroOptionPanel !== 'images' ? <div className="absolute bottom-24 left-1/2 z-20 w-[min(760px,92vw)] -translate-x-1/2 rounded-lg border border-slate-600 bg-[#f8fafc] p-4 text-slate-950 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#1678b8]">{activeCoroOptionPanel === 'sides' ? 'Print Sides' : activeCoroOptionPanel}</p>
                    <h3 className="mt-1 text-lg font-black">{activeCoroOptionPanel === 'size' ? 'Select Size' : activeCoroOptionPanel === 'material' ? 'Select Material' : activeCoroOptionPanel === 'sides' ? 'Select Print Sides' : activeCoroOptionPanel === 'stakes' ? 'Step Stakes' : 'Options'}</h3>
                  </div>
                  <button type="button" onClick={() => setActiveCoroOptionPanel(null)} className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-bold uppercase text-slate-600 hover:bg-slate-50">Close</button>
                </div>
                {activeCoroOptionPanel === 'size' ? <div className="mt-4 grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                  {CORO_SIZE_OPTIONS.map((option) => {
                    const parsed = parseCoroSize(option.value);
                    const layout = getCoroSheetLayout(parsed.width, parsed.height, designerQuantity);
                    const selected = String(signValues.size || '24x18') === option.value;
                    return <button key={option.value} type="button" onClick={() => { updateSignOption('size', option.value); setActiveCoroOptionPanel(null); }} className={`rounded border px-3 py-3 text-left text-xs ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}><span className="block font-black">{option.label}</span><span className="mt-1 block text-slate-500">{layout.signsPerSheet} per sheet / {layout.sheetCount} sheet{layout.sheetCount === 1 ? '' : 's'}</span></button>;
                  })}
                </div> : null}
                {activeCoroOptionPanel === 'material' ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[{ value: '4mm', label: '4mm CORO', price: '$44.00 single / $55.00 double' }, { value: '10mm', label: '10mm CORO', price: '$70.00 single / $90.00 double' }].map((option) => {
                    const selected = String(signValues.material || '4mm') === option.value;
                    return <button key={option.value} type="button" onClick={() => { updateSignOption('material', option.value); setActiveCoroOptionPanel(null); }} className={`rounded border px-4 py-4 text-left ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}><span className="block text-base font-black">{option.label}</span><span className="mt-1 block text-xs text-slate-500">{option.price}</span></button>;
                  })}
                </div> : null}
                {activeCoroOptionPanel === 'sides' ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[{ value: 'single', label: 'Single-Sided', note: 'Front side only' }, { value: 'double', label: 'Double-Sided', note: 'Front and back print' }].map((option) => {
                    const selected = String(signValues.sides || 'single') === option.value;
                    return <button key={option.value} type="button" onClick={() => { updateSignOption('sides', option.value); setActiveCoroOptionPanel(null); }} className={`rounded border px-4 py-4 text-left ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}><span className="block text-base font-black">{option.label}</span><span className="mt-1 block text-xs text-slate-500">{option.note}</span></button>;
                  })}
                </div> : null}
                {activeCoroOptionPanel === 'stakes' ? <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  {['0', '10', '25', '50'].map((count) => {
                    const selected = String(signValues.stepStakes || '0') === count;
                    return <button key={count} type="button" onClick={() => { updateSignOption('stepStakes', count); setActiveCoroOptionPanel(null); }} className={`rounded border px-4 py-4 text-center ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}><span className="block text-lg font-black">{count}</span><span className="mt-1 block text-xs text-slate-500">stakes</span></button>;
                  })}
                </div> : null}
              </div> : null}
              {productMode === 'signage' ? <div className={`absolute z-10 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase ${isCoroBuilder ? 'inset-x-0 bottom-8 justify-center' : 'inset-x-3 bottom-4 justify-center'}`}>
                {[
                  ['Images', String(coroSheetArtworkItems.length || layers.length || 1), signArtworkStatusOk],
                  ['Size', `${signWidth || 0}" x ${signHeight || 0}"`, signWidth > 0 && signHeight > 0],
                  ['Material', String(signValues.material || (selectedSignProduct.id === 'yard-sign' ? '4mm' : '15oz')), true],
                  ['Print Sides', String(signValues.sides || 'single'), true],
                  ...(selectedSignProduct.id === 'yard-sign'
                    ? [
                        ['Grommets', signValues.grommets ? 'Yes' : 'No', Boolean(signValues.grommets)],
                        ['Step Stakes', String(signValues.stepStakes || '0'), Number(signValues.stepStakes || 0) > 0],
                        ['Gloss', signValues.gloss ? 'Yes' : 'No', Boolean(signValues.gloss)]
                      ] as [string, string, boolean][]
                    : [
                        ['Welding', 'Yes', true],
                        ['Rope', signValues.rope ? 'Yes' : 'None', Boolean(signValues.rope)],
                        ['Grommets', 'Yes', true],
                        ['Pole Pockets', signValues.polePocket ? 'Yes' : 'None', Boolean(signValues.polePocket)],
                        ['Wind Slits', signValues.windSlits ? 'Yes' : 'No', Boolean(signValues.windSlits)]
                      ] as [string, string, boolean][])
                ].map(([label, value, active]) => {
                  const isImagesTile = String(label) === 'Images';
                  const needsArtworkFit = isImagesTile && (layers.length > 0 || coroSheetArtworkItems.length > 0) && !signArtworkStatusOk;
                  return <button type="button" onClick={() => handleCoroTileClick(String(label))} key={String(label)} className={`flex min-h-12 min-w-36 items-center justify-between gap-4 border-2 bg-white px-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(0,0,0,0.22)] ${needsArtworkFit ? 'border-red-500 text-red-600' : active ? 'border-[#1678b8] text-[#1678b8]' : 'border-slate-300 text-slate-400'}`}><span>{label}</span><span className={`${needsArtworkFit ? 'bg-red-500' : active ? 'bg-[#1678b8]' : 'bg-slate-300'} px-3 py-2 text-white`}>{value}</span></button>;
                })}
              </div> : null}
            </div>

            {productMode === 'apparel' ? <aside className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Layers</p><span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{layers.length}</span></div>
              <div className="mt-3 space-y-1">{layers.length === 0 ? <p className="rounded-md border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">No objects yet</p> : layers.map((layer) => <button key={layer.id} onClick={() => { const canvas = fabricCanvasRef.current; if (!canvas) return; const target = canvas.getObjects().find((obj) => (obj as FabricObject & { data?: { layerId?: string } }).data?.layerId === layer.id); if (!target) return; canvas.setActiveObject(target); canvas.requestRenderAll(); setActiveObject(target); refreshLayers(canvas); }} className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs ${layer.isActive ? 'bg-[#1678b8] text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}><span className="truncate">{layer.name}</span><span className="ml-2 shrink-0 opacity-70">{layer.type}</span></button>)}</div>
            </aside> : null}
          </div>
        </section>

        <aside id="design" className={`${isCoroBuilder ? 'hidden' : 'space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto'}`}>
          <section className="rounded-lg border border-white/80 bg-white/92 p-4 shadow-[0_12px_34px_rgba(7,17,31,0.06)]">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Create</h2>
            <div className="mt-3 space-y-2"><input value={textValue} onChange={(event) => setTextValue(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#1f73be] focus:ring-2 focus:ring-[#1f73be]/15" placeholder="Type your text" /><button onClick={addText} className="w-full rounded-md bg-[#1f73be] px-3 py-2 text-sm font-bold text-white hover:bg-[#2a86d8]">Add Text</button><button type="button" onClick={triggerArtworkUpload} className="block w-full cursor-pointer rounded-md border border-dashed border-slate-400 bg-slate-50 p-3 text-center text-sm font-medium hover:bg-slate-100">Upload Artwork</button></div>
          </section>

          <section className="rounded-lg border border-white/80 bg-white/92 p-4 shadow-[0_12px_34px_rgba(7,17,31,0.06)]">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Edit</h2>
            {activeObject ? <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={deleteSelected} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Delete</button><button onClick={duplicateSelected} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Duplicate</button><button onClick={() => moveLayer('forward')} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Forward</button><button onClick={() => moveLayer('backward')} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Backward</button><button onClick={() => alignSelected('horizontal')} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Center X</button><button onClick={() => alignSelected('vertical')} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Center Y</button><button onClick={toggleLockSelected} className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">{activeObject.selectable ? 'Lock Object' : 'Unlock Object'}</button></div> : <p className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">Select artwork on the design to edit it.</p>}
          </section>

          {productMode === 'signage' ? <section className="rounded-lg border border-white/80 bg-white/92 p-4 shadow-[0_12px_34px_rgba(7,17,31,0.06)]">
            <div className={`rounded-md p-3 ${signArtworkStatusOk ? 'bg-green-100' : 'bg-rose-100'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className={`text-sm font-bold uppercase tracking-wide ${signArtworkStatusOk ? 'text-green-700' : 'text-red-600'}`}>Item #1 / {signArtworkStatusLabel}</h2>
                  <p className="mt-1 text-xs text-slate-600">{signWidth || 0}&quot; x {signHeight || 0}&quot; / Qty {designerQuantity}</p>
                </div>
                <button type="button" onClick={clearSignArtwork} className="rounded border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">delete</button>
              </div>
              <div className="mt-3 flex min-h-28 items-center justify-center border border-slate-300 bg-white p-2 text-center text-[10px] uppercase text-slate-400">
                {signArtworkPreviewUrl ? <div className="w-full">
                  <img src={signArtworkPreviewUrl} alt="" className="mx-auto max-h-20 max-w-full object-contain" />
                  <p className="mt-2 text-[10px] text-slate-600">{selectedSignProduct.id === 'yard-sign' ? `Placed ${coroSheetLayout.signsPerSheet} times on sheet` : signArtworkSize ? `Actual: ${signArtworkSize.width}" x ${signArtworkSize.height}"` : 'Artwork uploaded'}</p>
                </div> : signArtworkSize ? `Actual: ${signArtworkSize.width}" x ${signArtworkSize.height}"` : layers.length ? `${layers.length} design object${layers.length === 1 ? '' : 's'}` : 'Upload artwork or add text'}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <button className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-400">Contour Cut</button>
                <button className="rounded border border-slate-300 bg-white px-2 py-1">Color Matching</button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <button type="button" onClick={() => fitSelectedArtwork('contain')} className="rounded bg-[#1678b8] px-2 py-2 font-bold text-white disabled:opacity-40" disabled={!activeObject}>Fit Art</button>
                <button type="button" onClick={centerSelectedArtwork} className="rounded border border-[#1678b8] bg-white px-2 py-2 font-bold text-[#1678b8] disabled:opacity-40" disabled={!activeObject}>Center</button>
                <button type="button" onClick={() => fitSelectedArtwork('cover')} className="rounded border border-slate-300 bg-white px-2 py-2 font-medium disabled:opacity-40" disabled={!activeObject}>Fill Sign</button>
                <button type="button" onClick={() => fitSelectedArtwork('stretch')} className="rounded border border-slate-300 bg-white px-2 py-2 font-medium disabled:opacity-40" disabled={!activeObject}>Stretch</button>
              </div>
            </div>
            <button type="button" className="mt-3 flex h-16 w-full items-center justify-center rounded-md border border-dashed border-slate-300 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50">+ Add Sign</button>
            <div className="mt-4">
              <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Layers</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{layers.length}</span></div>
              <div className="mt-2 space-y-1">{layers.length === 0 ? <p className="rounded-md border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">No objects yet</p> : layers.map((layer) => <button key={layer.id} onClick={() => { const canvas = fabricCanvasRef.current; if (!canvas) return; const target = canvas.getObjects().find((obj) => (obj as FabricObject & { data?: { layerId?: string } }).data?.layerId === layer.id); if (!target) return; canvas.setActiveObject(target); canvas.requestRenderAll(); setActiveObject(target); refreshLayers(canvas); }} className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs ${layer.isActive ? 'bg-[#1678b8] text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}><span className="truncate">{layer.name}</span><span className="ml-2 shrink-0 opacity-70">{layer.type}</span></button>)}</div>
            </div>
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-950">{selectedSignProduct.name}</p>
              <p className="mt-1 leading-5">{getSignConfigurationText(selectedSignProduct, signValues)}</p>
              {signEstimateStatus ? <p className={`mt-2 ${signEstimate ? 'text-slate-500' : 'text-amber-700'}`}>{signEstimateStatus}</p> : null}
            </div>
          </section> : null}

          <section style={{ display: productMode === 'signage' ? 'none' : undefined }} className="rounded-lg border border-white/80 bg-white/92 p-4 shadow-[0_12px_34px_rgba(7,17,31,0.06)]">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Shirt</h2>
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-2 gap-2">{(['front', 'back'] as ShirtView[]).map((view) => <button key={view} onClick={() => setShirtView(view)} className={`rounded-md border px-3 py-2 text-sm font-medium capitalize ${shirtView === view ? 'border-[#1f73be] bg-[#1f73be] text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>{view}</button>)}</div>
              <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">{SAMPLE_PRODUCT_CATALOG.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
              <div className="grid grid-cols-2 gap-2">{availableStyleColors.map((color) => <button key={color.name} type="button" onClick={() => { const match = selectedStyleItems.find((item) => item.colorName === color.name); if (match) { const idx = previewCatalog.findIndex((entry) => entry.styleNumber === match.styleNumber && entry.colorName === match.colorName); if (idx >= 0) setSelectedPreviewId(idx); } setShirtColor(color.value); }} className={`flex min-w-0 items-center gap-2 rounded-md border px-2 py-2 text-left text-xs ${shirtColor === color.value ? 'border-[#1f73be] bg-[#eef6ff] ring-1 ring-[#1f73be]/20' : 'border-slate-300 bg-white hover:bg-slate-50'}`} title={color.name}>{color.swatchUrl ? <img src={color.swatchUrl} alt={color.name} className="h-5 w-5 shrink-0 rounded-full border object-cover" /> : <span className="h-5 w-5 shrink-0 rounded-full border" style={{ background: color.value }} />}<span className="truncate">{color.name}</span></button>)}</div>
              <div className="grid grid-cols-2 gap-2">{(['flat', 'model'] as ImageType[]).map((type) => <button key={type} onClick={() => setImageType(type)} className={`rounded-md border px-3 py-2 text-sm font-medium ${imageType === type ? 'border-[#1f73be] bg-[#1f73be] text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>{type === 'flat' ? 'Flat' : 'Model'}</button>)}</div>
            </div>
          </section>

          <section style={{ display: productMode === 'signage' ? 'none' : undefined }} className="rounded-lg border border-white/80 bg-white/92 p-4 shadow-[0_12px_34px_rgba(7,17,31,0.06)]">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Placement</h2>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">{(Object.keys(PRINT_AREA_CONFIG) as PrintLocation[]).map((location) => <label key={location} className="flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-2 text-xs"><input type="checkbox" checked={selectedPrintLocations.includes(location)} onChange={(event) => { const checked = event.target.checked; setSelectedPrintLocations((prev) => { const next = checked ? Array.from(new Set([...prev, location])) : prev.filter((p) => p !== location); return next.length ? next : [location]; }); if (!selectedPrintLocations.includes(location)) setPrintLocation(location); }} /><span>{PRINT_AREA_CONFIG[location].label}</span></label>)}</div>
              <select value={printLocation} onChange={(event) => setPrintLocation(event.target.value as PrintLocation)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">{selectedPrintLocations.map((location) => <option key={location} value={location}>{PRINT_AREA_CONFIG[location].label}</option>)}</select>
              <select value={printSizePreset} onChange={(event) => setLocationSettings((prev) => ({ ...prev, [printLocation]: { ...prev[printLocation], printSizePreset: event.target.value as PrintSizePreset } }))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="left-chest-3_5">Left Chest: 3.5&quot;</option><option value="standard-front-10">Standard Front: 10&quot;</option><option value="large-front-12">Large Front: 12&quot;</option><option value="full-back-12">Full Back: 12&quot;</option><option value="custom">Custom Size</option></select>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => applyArtboardPreset('standard-full-front')} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Full Front</button>
                <button onClick={() => applyArtboardPreset('large-full-front')} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Large Front</button>
                <button onClick={() => applyArtboardPreset('left-chest')} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Left Chest</button>
                <button onClick={() => applyArtboardPreset('full-back')} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Full Back</button>
                <button onClick={() => applyArtboardPreset('sleeve')} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Sleeve</button>
                <button onClick={() => applyArtboardPreset('reset-default')} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Reset</button>
              </div>
              <div className="grid grid-cols-2 gap-2"><button onClick={centerArtboardOnShirt} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Center Guide</button><button onClick={() => setShowPrintArtboard((prev) => !prev)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">{showPrintArtboard ? 'Hide Guides' : 'Show Guides'}</button></div>
            </div>
          </section>
        </aside>
      </div>

      <section id="quote" className={`mx-auto max-w-[1800px] px-4 pb-6 md:px-6 ${isCoroBuilder ? 'hidden' : ''}`}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section id="qty" className="rounded-lg border border-white/80 bg-white/92 p-4 shadow-[0_12px_34px_rgba(7,17,31,0.06)]">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Quantity & Estimate</h2><p className="mt-1 text-sm text-slate-600">Total quantity: <span className="font-semibold text-slate-950">{designerQuantity}</span></p></div>{productMode === 'apparel' ? <span className={`rounded-full px-3 py-1 text-xs font-semibold ${recommendationBadgeClass}`}>{printRecommendation.badge}</span> : <span className="rounded-full bg-[#eef6ff] px-3 py-1 text-xs font-semibold text-[#125b99]">Signs & Banners</span>}</div>
            {productMode === 'apparel' ? <>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">{SIZE_FIELDS.map((size) => <label key={size} className="text-xs font-medium text-slate-600">{size}<input type="number" min={0} value={sizeQuantities[size]} onChange={(event) => setSizeQuantities((prev) => ({ ...prev, [size]: Math.max(0, Number(event.target.value) || 0) }))} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm text-slate-950" /></label>)}</div>
              <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-sm font-medium">Print Method<select value={printMethod} onChange={(event) => setPrintMethod(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"><option>Not sure / Recommend for me</option><option>DTF</option><option>Screen Print</option></select></label><label className="text-sm font-medium">Artwork Complexity<select value={imageComplexity} onChange={(event) => setImageComplexity(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"><option>Simple 1 color</option><option>2-3 colors</option><option>Full color / photo</option></select></label></div>
            </> : <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-950">{selectedSignProduct.name}</p>
              <p className="mt-1 text-xs leading-5">{getSignConfigurationText(selectedSignProduct, signValues)}</p>
              <button type="button" onClick={requestSignEstimate} disabled={isSignEstimateLoading} className="mt-3 w-full rounded-md bg-[#1678b8] px-3 py-2 text-sm font-bold text-white hover:bg-[#0f5f94] disabled:cursor-wait disabled:opacity-70">{isSignEstimateLoading ? 'Loading estimate...' : 'Get Sign Estimate'}</button>
              {signEstimate ? <div className="mt-3 rounded-md border border-[#1678b8]/20 bg-white p-3 text-slate-950"><p className="font-semibold">Estimated total: {formatSignPrice(signEstimate.price?.retail, signEstimate.currency)}</p><p className="mt-1">Each: {formatSignPrice(signEstimate.price?.each, signEstimate.currency)}</p>{signEstimate.warnings?.length ? <p className="mt-2 text-xs text-amber-700">{signEstimate.warnings.join(' ')}</p> : null}</div> : null}
              {signEstimateStatus ? <p className={`mt-3 text-xs ${signEstimate ? 'text-slate-500' : 'text-amber-700'}`}>{signEstimateStatus}</p> : null}
            </div>}
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-950">Artwork Check</p>
                {artworkAnalysis ? <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">{artworkAnalysis.confidence} confidence</span> : null}
              </div>
              {artworkAnalysis ? <div className="mt-3 space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <p><span className="font-medium text-slate-950">Colors:</span> {artworkAnalysis.visibleColorCount} estimated families</p>
                  <p><span className="font-medium text-slate-950">Best fit:</span> {artworkAnalysis.recommendation}</p>
                  <p><span className="font-medium text-slate-950">Size:</span> {artworkAnalysis.width} x {artworkAnalysis.height}px</p>
                  <p><span className="font-medium text-slate-950">Background:</span> {artworkAnalysis.hasTransparency ? 'Transparent/soft edge' : artworkAnalysis.hasOpaqueBackground ? 'Likely solid background' : 'Opaque'}</p>
                </div>
                {artworkAnalysis.dominantColors.length > 0 ? <div className="flex flex-wrap gap-1.5">{artworkAnalysis.dominantColors.map((color) => <span key={color} className="h-5 w-5 rounded border border-slate-300" style={{ backgroundColor: color }} title={color} />)}</div> : null}
                {artworkAnalysis.warnings.length > 0 ? <div className="space-y-1 text-xs text-amber-700">{artworkAnalysis.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : <p className="text-xs text-emerald-700">No production warnings from the first-pass analyzer.</p>}
              </div> : <p className="mt-2 text-xs text-slate-500">{artworkAnalysisStatus || 'Upload artwork to estimate colors and production fit.'}</p>}
              {artworkAnalysisStatus && artworkAnalysis ? <p className="mt-2 text-xs text-slate-500">{artworkAnalysisStatus}</p> : null}
            </div>
            {productMode === 'apparel' ? <div id="estimate" className="mt-4 rounded-md border border-[#1678b8]/20 bg-[#eaf5fb] p-4 text-sm text-slate-950">
              <p className="font-semibold">{printMethod === 'Not sure / Recommend for me' ? printRecommendation.method : printMethod}</p>
              <p className="mt-1">{printMethod === 'Not sure / Recommend for me' ? printRecommendation.reason : `You selected ${printMethod}.`}</p>
              {manualMethodWarning ? <p className="mt-1 text-amber-800">{manualMethodWarning}</p> : null}
              <button type="button" onClick={requestApparelEstimate} disabled={isApparelEstimateLoading} className="mt-3 w-full rounded-md bg-[#1678b8] px-3 py-2 text-sm font-bold text-white hover:bg-[#0f5f94] disabled:cursor-wait disabled:opacity-70">{isApparelEstimateLoading ? 'Loading real estimate...' : 'Get Real Apparel Estimate'}</button>
              {apparelEstimateStatus ? <p className={`mt-2 text-xs ${apparelEstimate ? 'text-[#1678b8]' : 'text-amber-800'}`}>{apparelEstimateStatus}</p> : null}
              <p className="mt-3 font-semibold">{apparelEstimate ? 'Pricing API' : 'Local fallback'} / Decoration ${displayedDecorationCost.toFixed(2)} / Per Shirt ${displayedPerShirt.toFixed(2)}</p>
            </div> : null}
          </section>

          <section className="rounded-lg border border-white/80 bg-white/92 p-4 shadow-[0_12px_34px_rgba(7,17,31,0.06)]"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Quote Request</h2><p className="mt-2 text-sm">Status: <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${quoteReadinessClass}`}>{quoteReadiness}</span></p>{missingQuoteRequirements.length > 0 ? <p className="mt-2 text-xs text-amber-700">Missing: {missingQuoteRequirements.join(', ')}</p> : <p className="mt-2 text-xs text-emerald-700">Ready to request.</p>}<div className="mt-3 space-y-2 text-sm"><input value={customerInfo.name} onChange={(event) => setCustomerInfo((prev) => ({ ...prev, name: event.target.value }))} placeholder="Name" className="w-full rounded-md border border-slate-300 px-3 py-2" /><input value={customerInfo.organization} onChange={(event) => setCustomerInfo((prev) => ({ ...prev, organization: event.target.value }))} placeholder="Business / Organization" className="w-full rounded-md border border-slate-300 px-3 py-2" /><input value={customerInfo.email} onChange={(event) => setCustomerInfo((prev) => ({ ...prev, email: event.target.value }))} placeholder="Email" className="w-full rounded-md border border-slate-300 px-3 py-2" /><input value={customerInfo.phone} onChange={(event) => setCustomerInfo((prev) => ({ ...prev, phone: event.target.value }))} placeholder="Phone" className="w-full rounded-md border border-slate-300 px-3 py-2" /><input type="date" value={customerInfo.neededByDate} onChange={(event) => setCustomerInfo((prev) => ({ ...prev, neededByDate: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" /><textarea value={customerInfo.notes} onChange={(event) => setCustomerInfo((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notes" rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2" /></div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><button onClick={captureDesignPreview} className="col-span-2 rounded-md border border-[#1f73be] bg-white px-3 py-2 font-medium text-[#125b99] hover:bg-[#eef6ff]">Capture Preview</button><button onClick={copyQuoteSummary} className="rounded-md bg-[#1f73be] px-3 py-2 font-medium text-white hover:bg-[#2a86d8]">Copy Summary</button><button onClick={openEmailRequest} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium hover:bg-slate-50">Email</button><button onClick={exportQuotePackage} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium hover:bg-slate-50">Export</button><button onClick={() => importQuotePackageInputRef.current?.click()} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium hover:bg-slate-50">Import</button><input ref={importQuotePackageInputRef} type="file" accept="application/json,.json" className="hidden" onChange={importQuotePackage} /></div>{draftStatus || quotePackageStatus ? <p className="mt-3 text-xs text-slate-600">{draftStatus || quotePackageStatus}</p> : null}</section>
        </div>
      </section>

      {showImageZone ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
        <section className="flex h-[min(760px,86vh)] w-[min(1320px,94vw)] flex-col overflow-hidden rounded-lg border border-slate-700 bg-[#f5f7fa] text-slate-950 shadow-[0_28px_80px_rgba(0,0,0,0.45)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-5 py-4">
            <div className="mr-auto">
              <h2 className="text-2xl font-normal tracking-tight">Image Zone</h2>
              <p className="text-xs text-slate-500">Upload finished artwork, choose existing files, then place onto the sheet.</p>
            </div>
            <select className="h-9 min-w-52 rounded border border-slate-300 bg-white px-3 text-sm">
              <option>Home</option>
              <option>Recent Uploads</option>
              <option>CORO Orders</option>
            </select>
            <label htmlFor="artwork-upload-input" onClick={() => setImageLibraryStatus('Choose an image or PDF artwork file.')} className="flex h-9 cursor-pointer items-center rounded bg-green-500 px-4 text-xs font-black uppercase text-white hover:bg-green-600">Upload Image</label>
            <button type="button" className="h-9 rounded bg-[#1678b8] px-4 text-xs font-black uppercase text-white hover:bg-[#0f5f94]">Create Folder</button>
            <button type="button" className="h-9 rounded bg-[#1678b8] px-4 text-xs font-black uppercase text-white hover:bg-[#0f5f94]">Rename Folder</button>
            <button type="button" className="h-9 rounded bg-[#1678b8] px-4 text-xs font-black uppercase text-white hover:bg-[#0f5f94]">Image Setup</button>
            <input className="h-9 min-w-56 flex-1 rounded border border-slate-300 px-3 text-sm" placeholder="Search Images" />
            <select className="h-9 rounded border border-slate-300 bg-white px-3 text-sm">
              <option>Sort: Date</option>
              <option>Sort: Name</option>
              <option>Sort: Size</option>
            </select>
            <button type="button" onClick={() => setShowImageZone(false)} className="h-9 rounded border border-slate-300 bg-white px-4 text-xs font-bold uppercase text-slate-600 hover:bg-slate-50">Close</button>
          </div>
          <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs">
            <button type="button" className="rounded bg-[#1678b8] px-4 py-2 font-bold uppercase text-white">Select All</button>
            <span className="text-slate-500">{imageZoneItems.length} item{imageZoneItems.length === 1 ? '' : 's'} in the artwork library</span>
            {imageLibraryStatus ? <span className="hidden max-w-xl truncate text-slate-500 lg:inline">{isImageLibraryLoading ? 'Loading library... ' : ''}{imageLibraryStatus}</span> : null}
            {selectedImageZoneId ? <span className="ml-auto rounded-full bg-[#eaf5fb] px-3 py-1 font-semibold text-[#1678b8]">Selected image ready</span> : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-white p-4">
            {imageZoneItems.length === 0 ? <div className="flex h-full min-h-80 items-center justify-center rounded border-2 border-dashed border-slate-300 bg-slate-50 text-center">
              <div>
                <p className="text-lg font-semibold text-slate-800">No images uploaded yet</p>
                <p className="mt-2 text-sm text-slate-500">Upload artwork here, then place it on the CORO sheet.</p>
                <label htmlFor="artwork-upload-input" onClick={() => setImageLibraryStatus('Choose an image or PDF artwork file.')} className="mt-5 inline-flex cursor-pointer rounded bg-green-500 px-5 py-3 text-sm font-black uppercase text-white hover:bg-green-600">Upload Image</label>
              </div>
            </div> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {imageZoneItems.map((item) => {
                const selected = selectedImageZoneId === item.id;
                return <button key={item.id} type="button" onClick={() => setSelectedImageZoneId(item.id)} className={`grid min-h-32 grid-cols-[112px_minmax(0,1fr)] gap-3 rounded border bg-white p-3 text-left shadow-sm transition ${selected ? 'border-[#1678b8] ring-2 ring-[#1678b8]/20' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                  <div className="flex h-28 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
                    {item.mimeType?.startsWith('image/') || item.dataUrl.startsWith('data:image/') ? <img src={item.dataUrl} alt="" className="max-h-full max-w-full object-contain" /> : <span className="flex h-full w-full items-center justify-center text-sm font-black text-slate-500">PDF</span>}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.width || '-'} x {item.height || '-'} px</p>
                    <p className="text-xs text-slate-500">{item.dpi} DPI</p>
                    <p className="text-xs text-slate-500">{item.source === 'supabase' ? 'Stored in Supabase' : 'Browser preview'}</p>
                    <p className="mt-2 text-xs text-slate-400">{item.uploadedAt}</p>
                    <span className={`mt-3 inline-flex rounded px-3 py-1 text-xs font-bold uppercase ${selected ? 'bg-[#1678b8] text-white' : 'bg-slate-100 text-slate-600'}`}>{selected ? 'Selected' : 'Select'}</span>
                    <span onClick={async (event) => { event.stopPropagation(); await useImageZoneItem(item); }} className="ml-2 mt-3 inline-flex rounded bg-green-500 px-3 py-1 text-xs font-bold uppercase text-white">Use Image</span>
                  </div>
                </button>;
              })}
            </div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
            <p className="text-xs text-slate-500">{isSupabaseStorageConfigured ? `Original files save to Supabase bucket: ${SUPABASE_STORAGE_BUCKET}.` : 'Original production files need Supabase config before they can persist.'}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowImageZone(false)} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button" disabled={!selectedImageZoneId} onClick={async () => {
                const item = imageZoneItems.find((entry) => entry.id === selectedImageZoneId);
                if (!item) return;
                await useImageZoneItem(item);
              }} className="rounded bg-[#1678b8] px-5 py-2 text-sm font-black uppercase text-white hover:bg-[#0f5f94] disabled:cursor-not-allowed disabled:opacity-40">Use Selected Image</button>
            </div>
          </div>
        </section>
      </div> : null}

      <div className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/80 bg-white/90 shadow-[0_-14px_34px_rgba(7,17,31,0.08)] backdrop-blur ${isCoroBuilder ? 'hidden' : ''}`}>
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-3 px-4 py-3 text-xs md:px-6 md:text-sm">
          <button type="button" onClick={() => setStoreView('store')} className="rounded-md border border-[#1678b8] bg-white px-4 py-3 font-bold text-[#1678b8] hover:bg-[#eaf5fb]">{isCoroBuilder ? 'Products' : '+ Add Products'}</button>
          {productMode === 'apparel' ? <img src={getProductCardImage(selectedPreview)} alt={selectedProductName} className="h-12 w-12 rounded-md border border-slate-200 bg-slate-100 object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-md border border-[#1678b8]/25 bg-[#eaf5fb] text-[10px] font-bold uppercase text-[#1678b8]">Sign</div>}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{designerProductName}</p>
            <p className="truncate text-slate-600">{productMode === 'apparel' ? `${selectedColorName} / Qty: ${totalQuantity} / Est: $${displayedPerShirt.toFixed(2)}/ea` : isCoroBuilder ? `${signWidth}" x ${signHeight}" / Qty ${designerQuantity} / ${coroSheetLayout.sheetCount} sheet${coroSheetLayout.sheetCount === 1 ? '' : 's'}` : `Qty: ${designerQuantity} / Est: ${signEstimate ? formatSignPrice(signEstimate.price?.each, signEstimate.currency) + '/ea' : 'Run sign estimate'}`}</p>
          </div>
          <button onClick={saveDraftToLocal} className={`rounded-md border border-[#1678b8] bg-white px-4 py-3 font-bold text-[#1678b8] hover:bg-[#eaf5fb] ${isCoroBuilder ? 'hidden sm:block' : ''}`}>{isCoroBuilder ? 'Save' : 'Save | Share'}</button>
          <button onClick={productMode === 'apparel' ? requestApparelEstimate : requestSignEstimate} className="rounded-md bg-[#1f73be] px-5 py-3 font-bold text-white hover:bg-[#2a86d8]">{productMode === 'apparel' ? 'Get Price' : isCoroBuilder && signEstimate ? 'Add to Cart' : 'Price It'}</button>
        </div>
      </div>
      </>
      )}
    </main>
  );
}
