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
type ArtworkFitState = 'unresolved' | 'fit' | 'stretch';
type ImageZoneItem = { id: string; name: string; dataUrl: string; width: number; height: number; dpi: number; uploadedAt: string; storagePath?: string; storageUrl?: string; source?: 'local' | 'supabase'; mimeType?: string; frontFitState?: ArtworkFitState; backDataUrl?: string; backName?: string; backWidth?: number; backHeight?: number; backCopiedFromFront?: boolean; backFitState?: ArtworkFitState; signWidth?: number; signHeight?: number; fluteDirection?: string };
type BannerOrderItem = { id: string; name: string; dataUrl: string | null; width: number; height: number; quantity: number; artworkSize: { width: number; height: number } | null; fitState: ArtworkFitState };
type CoroArtworkQuantityMap = Record<string, number>;
type CoroArtworkSide = 'front' | 'back';
type CoroPlacementTarget = { itemId: string | null; side: CoroArtworkSide };
type ImageType = 'flat' | 'model';
type ProductMode = 'apparel' | 'signage';
type SignProductId = 'banner' | 'mesh-banner' | 'yard-sign' | 'acm' | 'poster' | 'acrylic' | 'foamcore' | 'pvc' | 'polystyrene' | 'aluminum' | 'vinyl' | 'custom-cut-coroplast' | 'vehicle-magnet' | 'business-card' | 'handheld-paper' | 'carbonless' | 'door-hanger';
type StoreView = 'store' | 'builder';
type StoreCategoryId = 'banners' | 'coro' | 'rigid' | 'decals' | 'magnets' | 'apparel' | 'misc';
type CoroOptionPanel = 'images' | 'size' | 'material' | 'sides' | 'grommets' | 'stakes' | 'gloss' | 'rope' | 'polePocket' | 'windSlits' | 'webbing' | 'roundedCorners' | null;
type SignFieldType = 'number' | 'select' | 'checkbox';
type SignFieldOption = { label: string; value: string };
type SignField = { name: string; label: string; type: SignFieldType; defaultValue: string | boolean; step?: string; options?: SignFieldOption[] };
type SignProductConfig = { id: SignProductId; name: string; apiSlug: string; description: string; preview: 'banner' | 'yard-sign'; fields: SignField[] };
type StoreProductCard = { id: string; category: StoreCategoryId; title: string; subtitle: string; description: string; mode: ProductMode; signProductId?: SignProductId; badge?: string; disabled?: boolean; initialSignValues?: Partial<Record<string, string | boolean>> };
type SignEstimate = { ok?: boolean; product?: string; currency?: string; price?: { retail?: number | string; each?: number | string }; summary?: Record<string, unknown>; warnings?: string[]; error?: { message?: string; fields?: Record<string, string> } };
type ApparelApiEstimate = { ok?: boolean; currency?: string; price?: { retail?: number | string; each?: number | string }; summary?: Record<string, unknown>; warnings?: string[]; error?: { message?: string; fields?: Record<string, string> } };
type CustomerSession = { access_token: string; refresh_token?: string; expires_at?: number; user?: { id?: string; email?: string } };
type CartArtworkFile = { role: string; name: string; storagePath?: string; storageUrl?: string; source?: 'local' | 'supabase'; previewUrl?: string };
type CartItem = {
  id: string;
  addedAt: string;
  mode: ProductMode;
  productId: string;
  productName: string;
  quantity: number;
  sizeLabel: string;
  optionSummary: string[];
  price: { total: number | null; each: number | null; currency: string; sheetCount?: number; pricePerSheet?: number | null };
  artworkFiles: CartArtworkFile[];
  productionSummary: string[];
  customer: { userId?: string; email?: string; checkoutMode: 'account' | 'quick' };
};
type CheckoutFulfillment = 'pickup' | 'direct_ship';
type TestOrder = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: 'test_submitted';
  paymentMode: 'test_no_payment';
  customer: { name: string; organization?: string; email: string; phone: string; notes?: string; taxExempt: boolean; userId?: string; checkoutMode: 'account' | 'quick' };
  fulfillment: {
    method: CheckoutFulfillment;
    address?: { line1: string; line2: string; city: string; state: string; postalCode: string };
  };
  items: CartItem[];
  subtotal: number;
  tax: { rate: number; amount: number; label: string };
  total: number;
  currency: string;
};
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
const CUSTOMER_SESSION_STORAGE_KEY = 'hue-customer-session';
const CART_STORAGE_KEY = 'hue-print-ready-cart';
const TEST_ORDER_STORAGE_KEY = 'hue-test-orders';
const GEORGIA_SALES_TAX_RATE = 0.08;
const GEORGIA_SALES_TAX_LABEL = 'GA sales tax';
const isSupabaseStorageConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && SUPABASE_STORAGE_BUCKET);

const getSupabaseStorageHeaders = (accessToken?: string) => ({
  apikey: SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${accessToken || SUPABASE_PUBLISHABLE_KEY}`
});

const encodeStoragePath = (path: string) => path.split('/').map((part) => encodeURIComponent(part)).join('/');

const getSupabasePublicUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${encodeStoragePath(path)}`;

const getSupabaseSignedUrl = async (path: string, session: CustomerSession | null) => {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${encodeStoragePath(path)}`, {
    method: 'POST',
    headers: {
      ...getSupabaseStorageHeaders(session?.access_token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ expiresIn: 3600 })
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  const payload = await response.json() as { signedURL?: string; signedUrl?: string };
  const signedUrl = payload.signedURL || payload.signedUrl;
  if (!signedUrl) throw new Error('Supabase did not return a signed preview URL.');
  return signedUrl.startsWith('http') ? signedUrl : `${SUPABASE_URL}${signedUrl}`;
};

const getSafeStorageFileName = (name: string) => {
  const cleanName = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleanName || 'artwork-file';
};

const getSafeStorageFolderName = (name: string, fallback: string) => getSafeStorageFileName(name.toLowerCase()).slice(0, 80) || fallback;

const getCustomerLibraryPrefix = (session: CustomerSession | null) => {
  if (!session?.user?.id) return SUPABASE_LIBRARY_PREFIX;
  const customerLabel = getSafeStorageFolderName(session.user.email || 'customer', 'customer');
  return `customers/${session.user.id}/${customerLabel}`;
};

const getCustomerLegacyLibraryPrefix = (session: CustomerSession | null) => session?.user?.id ? `customers/${session.user.id}` : null;

const isPreviewableImageFile = (file: File) => file.type.startsWith('image/');

const getImageNaturalSize = (dataUrl: string): Promise<{ width: number; height: number }> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
  image.onerror = () => reject(new Error('Could not read image size.'));
  image.src = dataUrl;
});

const getErrorMessage = async (response: Response) => {
  try {
    const payload = await response.json() as { message?: string; error?: string };
    return payload.message || payload.error || response.statusText;
  } catch {
    return response.statusText;
  }
};

const uploadArtworkFileToSupabase = async (file: File, session: CustomerSession | null) => {
  if (!isSupabaseStorageConfigured) throw new Error('Supabase is not configured.');
  const storagePath = `${getCustomerLibraryPrefix(session)}/${Date.now()}-${getSafeStorageFileName(file.name)}`;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${encodeStoragePath(storagePath)}`, {
    method: 'POST',
    headers: {
      ...getSupabaseStorageHeaders(session?.access_token),
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'false'
    },
    body: file
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  const previewUrl = await getSupabaseSignedUrl(storagePath, session).catch(() => getSupabasePublicUrl(storagePath));
  return {
    storagePath,
    storageUrl: previewUrl
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
  { id: 'banner-vinyl', category: 'banners', title: 'Vinyl Banner', subtitle: 'Indoor / outdoor banner', description: 'Upload finished banner art, check fit, and price online.', mode: 'signage', signProductId: 'banner', badge: 'Online order', initialSignValues: { material: '15-single', sides: 'single' } },
  { id: 'banner-mesh', category: 'banners', title: 'Mesh Banner', subtitle: 'Air-flow perforated banner', description: 'Use the banner layout tool for finished mesh banner artwork.', mode: 'signage', signProductId: 'mesh-banner', badge: 'Mesh', initialSignValues: { material: 'mesh-single', sides: 'single', webbing: false, rope: false, windSlits: false } },
  { id: 'coro-sheet', category: 'coro', title: 'CORO', subtitle: '48 x 96 sheet-based signs', description: 'Choose a cut size, upload finished art, and see sheet usage before ordering.', mode: 'signage', signProductId: 'yard-sign', badge: 'Sheet price' },
  { id: 'rigid-acrylic', category: 'rigid', title: 'Acrylic Signs', subtitle: 'Printed rigid panels', description: 'Upload finished acrylic art, set size, and pull Hue API pricing.', mode: 'signage', signProductId: 'acrylic', badge: 'Online order' },
  { id: 'rigid-acm', category: 'rigid', title: 'ACM / Aluminum Composite', subtitle: 'Outdoor panel signs', description: 'Finished art upload flow for ACM sign panels.', mode: 'signage', signProductId: 'acm', badge: 'Online order' },
  { id: 'rigid-pvc', category: 'rigid', title: 'PVC Signs', subtitle: 'Smooth rigid plastic', description: 'Upload-ready PVC signage with size and pricing checks.', mode: 'signage', signProductId: 'pvc', badge: 'Online order' },
  { id: 'rigid-foamcore', category: 'rigid', title: 'Foamcore', subtitle: 'Indoor display boards', description: 'Ready-art upload flow for foam board signage.', mode: 'signage', signProductId: 'foamcore', badge: 'Online order' },
  { id: 'rigid-polystyrene', category: 'rigid', title: 'Polystyrene', subtitle: 'Lightweight rigid signs', description: 'Upload finished art and price polystyrene panels.', mode: 'signage', signProductId: 'polystyrene', badge: 'Online order' },
  { id: 'rigid-aluminum', category: 'rigid', title: 'Aluminum', subtitle: 'Durable metal signage', description: 'Upload finished art and price aluminum signs.', mode: 'signage', signProductId: 'aluminum', badge: 'Online order' },
  { id: 'decals-vinyl', category: 'decals', title: 'Adhesive Vinyl', subtitle: 'Decals and window graphics', description: 'Upload-ready decal ordering with fit checks.', mode: 'signage', signProductId: 'vinyl', badge: 'Online order' },
  { id: 'decals-custom-cut-coro', category: 'decals', title: 'Custom Cut Coroplast', subtitle: 'Cut-shape coroplast signs', description: 'Upload finished custom-cut art and price through Hue API.', mode: 'signage', signProductId: 'custom-cut-coroplast', badge: 'Online order' },
  { id: 'magnets-vehicle', category: 'magnets', title: 'Vehicle Magnet', subtitle: 'Mobile advertising, premium weight', description: 'Standard vehicle magnet ordering with size and artwork checks.', mode: 'signage', signProductId: 'vehicle-magnet', badge: 'Premium' },
  { id: 'magnets-custom', category: 'magnets', title: 'Custom Magnet', subtitle: 'Custom sizes and contour cuts', description: 'Upload custom magnet art, set size, and price through Hue API.', mode: 'signage', signProductId: 'vehicle-magnet', badge: 'Custom', initialSignValues: { customCut: true, contourCut: true, size: 'custom', width: '0', height: '0' } },
  { id: 'misc-poster', category: 'misc', title: 'Poster', subtitle: 'Printed posters', description: 'Upload finished poster art, set size, and price online.', mode: 'signage', signProductId: 'poster', badge: 'Online order' },
  { id: 'misc-business-card', category: 'misc', title: 'Business Cards', subtitle: 'Print-ready cards', description: 'Upload finished card art and price through Hue API.', mode: 'signage', signProductId: 'business-card', badge: 'Online order', initialSignValues: { quantity: '250' } },
  { id: 'misc-handheld-paper', category: 'misc', title: 'Handheld Paper', subtitle: 'Flyers and handouts', description: 'Upload finished paper artwork and price online.', mode: 'signage', signProductId: 'handheld-paper', badge: 'Online order' },
  { id: 'misc-carbonless', category: 'misc', title: 'Carbonless Forms', subtitle: 'NCR form printing', description: 'Print-ready carbonless form pricing.', mode: 'signage', signProductId: 'carbonless', badge: 'Online order' },
  { id: 'misc-door-hanger', category: 'misc', title: 'Door Hangers', subtitle: 'Print-ready door hangers', description: 'Upload finished door hanger art and price online.', mode: 'signage', signProductId: 'door-hanger', badge: 'Online order' },
  { id: 'apparel-shirts', category: 'apparel', title: 'Custom Apparel', subtitle: 'Shirts and garments', description: 'Open the apparel designer and SanMar catalog.', mode: 'apparel', badge: 'Designer' }
];
const CORO_SHEET = { width: 48, height: 96 };
const BANNER_PREVIEW_DPI = 150;
const BANNER_MATERIAL_OPTIONS = [
  { value: '13-single', label: '13oz Vinyl', note: 'Single-sided everyday banner' },
  { value: '15-single', label: '15oz Vinyl', note: 'Heavier indoor/outdoor vinyl' },
  { value: '18-single', label: '18oz Vinyl', note: 'Required for double-sided banners' }
];
const MESH_BANNER_MATERIAL = { value: 'mesh-single', label: 'Mesh Banner', note: 'Air-flow perforated banner' };
const BASIC_SIGN_MATERIAL_OPTIONS = [
  { value: 'standard', label: 'Standard', note: 'Default material from Hue pricing API' }
];
const RIGID_PANEL_MATERIAL_OPTIONS = [
  { value: 'standard', label: 'Standard', note: 'Default rigid panel option' }
];
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
const MAGNET_SIZE_OPTIONS = [
  { label: 'Choose size', value: '' },
  { label: '18" x 12"', value: '18x12' },
  { label: '24" x 12"', value: '24x12' },
  { label: '24" x 18"', value: '24x18' },
  { label: '42" x 12"', value: '42x12' },
  { label: '72" x 24"', value: '72x24' }
];
const ROUNDED_CORNER_OPTIONS = [
  { label: '1"', value: '1' },
  { label: '1/2"', value: '0.5' },
  { label: 'None', value: 'none' }
];
const SIGN_PRODUCT_CONFIGS: SignProductConfig[] = [
  {
    id: 'banner',
    name: 'Vinyl Banner',
    apiSlug: 'banner',
    description: 'Indoor and outdoor vinyl banners with finishing options.',
    preview: 'banner',
    fields: [
      { name: 'width', label: 'Width (inches)', type: 'number', defaultValue: '0', step: '0.25' },
      { name: 'height', label: 'Height (inches)', type: 'number', defaultValue: '0', step: '0.25' },
      { name: 'quantity', label: 'Quantity', type: 'number', defaultValue: '1', step: '1' },
      {
        name: 'material',
        label: 'Material',
        type: 'select',
        defaultValue: '15-single',
        options: BANNER_MATERIAL_OPTIONS
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
      { name: 'grommets', label: 'Grommets', type: 'checkbox', defaultValue: true },
      { name: 'polePocket', label: 'Pole Pocket', type: 'checkbox', defaultValue: false },
      { name: 'welding', label: 'Welding', type: 'checkbox', defaultValue: true },
      { name: 'rope', label: 'Rope', type: 'checkbox', defaultValue: false },
      { name: 'webbing', label: 'Webbing', type: 'checkbox', defaultValue: false },
      { name: 'windSlits', label: 'Wind Slits', type: 'checkbox', defaultValue: false },
      { name: 'rush', label: 'Rush', type: 'checkbox', defaultValue: false }
    ]
  },
  {
    id: 'mesh-banner',
    name: 'Mesh Banner',
    apiSlug: 'mesh-banner',
    description: 'Air-flow mesh banners with finished artwork upload.',
    preview: 'banner',
    fields: [
      { name: 'width', label: 'Width (inches)', type: 'number', defaultValue: '0', step: '0.25' },
      { name: 'height', label: 'Height (inches)', type: 'number', defaultValue: '0', step: '0.25' },
      { name: 'quantity', label: 'Quantity', type: 'number', defaultValue: '1', step: '1' },
      { name: 'material', label: 'Material', type: 'select', defaultValue: 'mesh-single', options: [MESH_BANNER_MATERIAL] },
      { name: 'sides', label: 'Print Sides', type: 'select', defaultValue: 'single', options: [{ label: 'Single-Sided', value: 'single' }] },
      { name: 'grommets', label: 'Grommets', type: 'checkbox', defaultValue: true },
      { name: 'welding', label: 'Welding', type: 'checkbox', defaultValue: true },
      { name: 'webbing', label: 'Webbing', type: 'checkbox', defaultValue: false },
      { name: 'rope', label: 'Rope', type: 'checkbox', defaultValue: false },
      { name: 'polePocket', label: 'Pole Pocket', type: 'checkbox', defaultValue: false },
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
        defaultValue: 'custom',
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
  },
  ...([
    ['acrylic', 'Acrylic Signs', 'Printed rigid acrylic panels.', RIGID_PANEL_MATERIAL_OPTIONS],
    ['acm', 'ACM / Aluminum Composite', 'Outdoor aluminum composite panel signs.', RIGID_PANEL_MATERIAL_OPTIONS],
    ['pvc', 'PVC Signs', 'Durable smooth PVC material.', RIGID_PANEL_MATERIAL_OPTIONS],
    ['foamcore', 'Foamcore', 'Indoor foam board display signs.', RIGID_PANEL_MATERIAL_OPTIONS],
    ['polystyrene', 'Polystyrene', 'Lightweight rigid polystyrene signs.', RIGID_PANEL_MATERIAL_OPTIONS],
    ['aluminum', 'Aluminum', 'Durable printed aluminum signage.', RIGID_PANEL_MATERIAL_OPTIONS],
    ['vinyl', 'Adhesive Vinyl', 'Adhesive vinyl decals and window graphics.', BASIC_SIGN_MATERIAL_OPTIONS],
    ['custom-cut-coroplast', 'Custom Cut Coroplast', 'Custom-cut coroplast sign shapes.', BASIC_SIGN_MATERIAL_OPTIONS],
    ['vehicle-magnet', 'Vehicle Magnet', 'Vehicle and display magnets.', BASIC_SIGN_MATERIAL_OPTIONS],
    ['poster', 'Poster', 'Printed poster products.', BASIC_SIGN_MATERIAL_OPTIONS],
    ['business-card', 'Business Cards', 'Print-ready business cards.', BASIC_SIGN_MATERIAL_OPTIONS],
    ['handheld-paper', 'Handheld Paper', 'Flyers and handout printing.', BASIC_SIGN_MATERIAL_OPTIONS],
    ['carbonless', 'Carbonless Forms', 'Carbonless NCR form printing.', BASIC_SIGN_MATERIAL_OPTIONS],
    ['door-hanger', 'Door Hanger', 'Print-ready door hanger products.', BASIC_SIGN_MATERIAL_OPTIONS]
  ] as [SignProductId, string, string, SignFieldOption[]][]).map(([id, name, description, materialOptions]) => ({
    id,
    name,
    apiSlug: id,
    description,
    preview: 'banner' as const,
    fields: id === 'vehicle-magnet'
      ? [
          { name: 'size', label: 'Size', type: 'select' as const, defaultValue: '', options: MAGNET_SIZE_OPTIONS },
          { name: 'quantity', label: 'Quantity', type: 'number' as const, defaultValue: '1', step: '1' },
          { name: 'roundedCorners', label: 'Rounded Corners', type: 'select' as const, defaultValue: 'none', options: ROUNDED_CORNER_OPTIONS },
          { name: 'material', label: 'Material', type: 'select' as const, defaultValue: materialOptions[0]?.value || 'standard', options: materialOptions },
          { name: 'sides', label: 'Print Sides', type: 'select' as const, defaultValue: 'single', options: [{ label: 'Single-Sided', value: 'single' }] },
          { name: 'customCut', label: 'Custom Cut', type: 'checkbox' as const, defaultValue: false },
          { name: 'contourCut', label: 'Contour Cut', type: 'checkbox' as const, defaultValue: false }
        ]
      : [
          { name: 'width', label: 'Width (inches)', type: 'number' as const, defaultValue: '0', step: '0.25' },
          { name: 'height', label: 'Height (inches)', type: 'number' as const, defaultValue: '0', step: '0.25' },
          { name: 'quantity', label: 'Quantity', type: 'number' as const, defaultValue: id === 'business-card' ? '250' : '1', step: '1' },
          { name: 'material', label: 'Material', type: 'select' as const, defaultValue: materialOptions[0]?.value || 'standard', options: materialOptions },
          {
            name: 'sides',
            label: 'Print Sides',
            type: 'select' as const,
            defaultValue: 'single',
            options: [
              { label: 'Single-Sided', value: 'single' },
              { label: 'Double-Sided', value: 'double' }
            ]
          },
          { name: 'grommets', label: 'Grommets', type: 'checkbox' as const, defaultValue: false },
          { name: 'rush', label: 'Rush', type: 'checkbox' as const, defaultValue: false }
        ]
  }))
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
    const stepStakes = Number(values.stepStakes || 0);
    const isDoubleSided = String(values.sides || 'single') === 'double';
    const material = String(values.material || '4mm');
    const fluteDirection = String(values.fluteDirection || 'auto') === 'auto' ? 'best' : String(values.fluteDirection || 'best');
    return {
      quantity: Number(values.quantity),
      material,
      thickness: material,
      sides: values.sides || 'single',
      printSides: values.sides || 'single',
      sideCount: isDoubleSided ? 2 : 1,
      doubleSided: isDoubleSided,
      isDoubleSided,
      stakeType: stepStakes > 0 ? 'standard' : 'none',
      stepStakes,
      grommets: Boolean(values.grommets),
      gloss: Boolean(values.gloss),
      glossLaminate: Boolean(values.gloss),
      customCut: String(values.size || '') === 'custom',
      fluteDirection
    };
  }

  if (product.preview === 'banner') {
    const sides = String(values.sides || 'single');
    const isDoubleSided = sides === 'double';
    const material = String(values.material || '15-single');
    const isCustomMagnet = product.id === 'vehicle-magnet' && Boolean(values.customCut);
    const presetSize = product.id === 'vehicle-magnet' && !isCustomMagnet ? parsePresetSize(values.size) : null;
    return {
      width: presetSize?.width ?? Number(values.width || 0),
      height: presetSize?.height ?? Number(values.height || 0),
      quantity: Number(values.quantity),
      material: product.id === 'banner' && isDoubleSided ? '18-single' : material,
      sides,
      printSides: sides,
      sideCount: isDoubleSided ? 2 : 1,
      doubleSided: isDoubleSided,
      isDoubleSided,
      grommets: product.id === 'banner' && material !== 'mesh-single' ? true : Boolean(values.grommets),
      welding: product.id === 'banner' && material !== 'mesh-single' ? true : Boolean(values.welding),
      rope: Boolean(values.rope),
      webbing: Boolean(values.webbing),
      polePocket: Boolean(values.polePocket),
      windSlits: Boolean(values.windSlits),
      roundedCorners: values.roundedCorners || 'none',
      customCut: Boolean(values.customCut),
      contourCut: Boolean(values.contourCut),
      rush: Boolean(values.rush)
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
  if (typeof value !== 'string' || !value) return { width: 0, height: 0 };
  if (value === 'custom') return { width: 0, height: 0 };
  const [rawWidth, rawHeight] = value.split('x').map((part) => Number(part));
  return {
    width: Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 0,
    height: Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 0
  };
};

const parsePresetSize = (value: string | boolean | undefined, fallback = { width: 0, height: 0 }) => {
  if (typeof value !== 'string') return fallback;
  const [rawWidth, rawHeight] = value.split('x').map((part) => Number(part));
  return {
    width: Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : fallback.width,
    height: Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : fallback.height
  };
};

const getCoroSheetLayout = (width: number, height: number, quantity: number) => {
  if (width <= 0 || height <= 0) {
    return { columns: 1, rows: 1, rotated: false, signsPerSheet: 1, sheetCount: 1 };
  }
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

const packCustomCoroSheets = (items: ImageZoneItem[], quantities: CoroArtworkQuantityMap, fallbackWidth: number, fallbackHeight: number) => {
  const sheets: { sheetNumber: number; quantity: number; cells: { item: ImageZoneItem; x: number; y: number; width: number; height: number }[] }[] = [{ sheetNumber: 1, quantity: 0, cells: [] }];
  let x = 0;
  let y = 0;
  let rowHeight = 0;

  items.forEach((item) => {
    const width = Math.min(CORO_SHEET.width, Math.max(1, Number(item.signWidth || fallbackWidth || 1)));
    const height = Math.min(CORO_SHEET.height, Math.max(1, Number(item.signHeight || fallbackHeight || 1)));
    const quantity = Math.max(1, Number(quantities[item.id] || 1));

    Array.from({ length: quantity }).forEach(() => {
      if (x > 0 && x + width > CORO_SHEET.width) {
        x = 0;
        y += rowHeight;
        rowHeight = 0;
      }
      if (y > 0 && y + height > CORO_SHEET.height) {
        sheets.push({ sheetNumber: sheets.length + 1, quantity: 0, cells: [] });
        x = 0;
        y = 0;
        rowHeight = 0;
      }
      const currentSheet = sheets[sheets.length - 1];
      currentSheet.cells.push({ item, x, y, width, height });
      currentSheet.quantity += 1;
      x += width;
      rowHeight = Math.max(rowHeight, height);
    });
  });

  return sheets;
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

const aspectRatioMismatch = (imageWidth: number | undefined, imageHeight: number | undefined, targetWidth: number, targetHeight: number) => {
  if (!imageWidth || !imageHeight || !targetWidth || !targetHeight) return false;
  const imageRatio = imageWidth / imageHeight;
  const targetRatio = targetWidth / targetHeight;
  return Math.abs(imageRatio - targetRatio) / targetRatio > 0.03;
};

const getFittedArtworkSize = (imageWidth: number | undefined, imageHeight: number | undefined, targetWidth: number, targetHeight: number) => {
  if (!imageWidth || !imageHeight || !targetWidth || !targetHeight) return { width: targetWidth, height: targetHeight };
  const imageRatio = imageWidth / imageHeight;
  return { width: targetWidth, height: targetWidth / imageRatio };
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
  const [bannerArtworkName, setBannerArtworkName] = useState('');
  const [bannerArtworkFitState, setBannerArtworkFitState] = useState<ArtworkFitState>('unresolved');
  const [bannerOrderItems, setBannerOrderItems] = useState<BannerOrderItem[]>([]);
  const [pendingBannerPlacement, setPendingBannerPlacement] = useState<{ dataUrl: string; name: string; width: number; height: number } | null>(null);
  const [coroSheetArtworkItems, setCoroSheetArtworkItems] = useState<ImageZoneItem[]>([]);
  const [coroArtworkQuantities, setCoroArtworkQuantities] = useState<CoroArtworkQuantityMap>({});
  const [showImageZone, setShowImageZone] = useState(false);
  const [imageZoneItems, setImageZoneItems] = useState<ImageZoneItem[]>([]);
  const [selectedImageZoneId, setSelectedImageZoneId] = useState<string | null>(null);
  const [imageLibraryStatus, setImageLibraryStatus] = useState('');
  const [isImageLibraryLoading, setIsImageLibraryLoading] = useState(false);
  const [customerSession, setCustomerSession] = useState<CustomerSession | null>(null);
  const [showCustomerLogin, setShowCustomerLogin] = useState(false);
  const [customerAuthMode, setCustomerAuthMode] = useState<'signin' | 'signup'>('signin');
  const [customerAuthEmail, setCustomerAuthEmail] = useState('');
  const [customerAuthPassword, setCustomerAuthPassword] = useState('');
  const [customerAuthStatus, setCustomerAuthStatus] = useState('');
  const [isGuestCheckout, setIsGuestCheckout] = useState(false);
  const [isCustomerAuthLoading, setIsCustomerAuthLoading] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [cartStatus, setCartStatus] = useState('');
  const [showTestCheckout, setShowTestCheckout] = useState(false);
  const [testOrders, setTestOrders] = useState<TestOrder[]>([]);
  const [checkoutStep, setCheckoutStep] = useState<'contact' | 'fulfillment' | 'review' | 'complete'>('contact');
  const [checkoutStatus, setCheckoutStatus] = useState('');
  const [checkoutContact, setCheckoutContact] = useState({ name: '', organization: '', email: '', phone: '', notes: '' });
  const [checkoutTaxExempt, setCheckoutTaxExempt] = useState(false);
  const [checkoutFulfillment, setCheckoutFulfillment] = useState<CheckoutFulfillment>('pickup');
  const [checkoutAddress, setCheckoutAddress] = useState({ line1: '', line2: '', city: '', state: '', postalCode: '' });
  const [lastTestOrder, setLastTestOrder] = useState<TestOrder | null>(null);
  const [activeCoroOptionPanel, setActiveCoroOptionPanel] = useState<CoroOptionPanel>(null);
  const [isAddingCoroSign, setIsAddingCoroSign] = useState(false);
  const [showCoroSheetWarning, setShowCoroSheetWarning] = useState(false);
  const [showBannerDoubleSidedWarning, setShowBannerDoubleSidedWarning] = useState(false);
  const [coroPlacementTarget, setCoroPlacementTarget] = useState<CoroPlacementTarget>({ itemId: null, side: 'front' });
  const [coroSheetViewSide, setCoroSheetViewSide] = useState<CoroArtworkSide>('front');
  const [activeCoroSheetIndex, setActiveCoroSheetIndex] = useState(0);
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
    try {
      const storedSession = window.localStorage.getItem(CUSTOMER_SESSION_STORAGE_KEY);
      if (!storedSession) return;
      const parsedSession = JSON.parse(storedSession) as CustomerSession;
      if (parsedSession?.access_token) {
        setCustomerSession(parsedSession);
        setIsGuestCheckout(false);
        setCustomerAuthStatus(`Signed in as ${parsedSession.user?.email || 'customer'}.`);
      }
    } catch {
      window.localStorage.removeItem(CUSTOMER_SESSION_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    try {
      const storedCart = window.localStorage.getItem(CART_STORAGE_KEY);
      if (!storedCart) return;
      const parsedCart = JSON.parse(storedCart) as CartItem[];
      if (Array.isArray(parsedCart)) setCartItems(parsedCart);
    } catch {
      window.localStorage.removeItem(CART_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
  }, [cartItems]);

  useEffect(() => {
    try {
      const storedOrders = window.localStorage.getItem(TEST_ORDER_STORAGE_KEY);
      if (!storedOrders) return;
      const parsedOrders = JSON.parse(storedOrders) as TestOrder[];
      if (Array.isArray(parsedOrders)) setTestOrders(parsedOrders);
    } catch {
      window.localStorage.removeItem(TEST_ORDER_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(TEST_ORDER_STORAGE_KEY, JSON.stringify(testOrders));
  }, [testOrders]);

  useEffect(() => {
    if (!isSupabaseStorageConfigured) {
      setImageLibraryStatus('Supabase storage is not configured. Uploads will stay in this browser session.');
      return;
    }
    let mounted = true;
    const loadImageLibrary = async () => {
      const libraryPrefix = getCustomerLibraryPrefix(customerSession);
      const legacyLibraryPrefix = getCustomerLegacyLibraryPrefix(customerSession);
      const libraryPrefixes = Array.from(new Set([libraryPrefix, legacyLibraryPrefix].filter(Boolean) as string[]));
      setIsImageLibraryLoading(true);
      try {
        const libraryResponses = await Promise.all(libraryPrefixes.map(async (prefix) => {
          const response = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}`, {
            method: 'POST',
            headers: {
              ...getSupabaseStorageHeaders(customerSession?.access_token),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              prefix,
              limit: 100,
              offset: 0,
              sortBy: { column: 'created_at', order: 'desc' }
            })
          });
          if (!response.ok) throw new Error(await getErrorMessage(response));
          const files = await response.json() as Array<{ id?: string; name: string; updated_at?: string; created_at?: string; metadata?: { size?: number; mimetype?: string } }>;
          return { prefix, files };
        }));
        if (!mounted) return;
        const remoteItems = await Promise.all(libraryResponses
          .flatMap(({ prefix, files }) => files
          .filter((file) => file.name && file.name !== '.emptyFolderPlaceholder' && file.metadata?.mimetype)
          .map(async (file) => {
            const storagePath = `${prefix}/${file.name}`;
            const previewUrl = await getSupabaseSignedUrl(storagePath, customerSession).catch(() => getSupabasePublicUrl(storagePath));
            const imageSize = file.metadata?.mimetype?.startsWith('image/')
              ? await getImageNaturalSize(previewUrl).catch(() => ({ width: 0, height: 0 }))
              : { width: 0, height: 0 };
            return {
              id: file.id || storagePath,
              name: file.name,
              dataUrl: previewUrl,
              width: imageSize.width,
              height: imageSize.height,
              dpi: 300,
              uploadedAt: file.updated_at || file.created_at || 'Supabase',
              storagePath,
              storageUrl: previewUrl,
              source: 'supabase' as const,
              mimeType: file.metadata?.mimetype
            };
          })));
        setImageZoneItems((prev) => {
          const localItems = prev.filter((item) => item.source !== 'supabase');
          return [...remoteItems, ...localItems];
        });
        setImageLibraryStatus(customerSession?.user?.email
          ? `Signed in as ${customerSession.user.email}. ${remoteItems.length} saved file${remoteItems.length === 1 ? '' : 's'} found.`
          : `Guest library ready. ${remoteItems.length} stored file${remoteItems.length === 1 ? '' : 's'} found.`);
      } catch (error) {
        if (!mounted) return;
        setImageLibraryStatus(`Supabase library not readable yet: ${error instanceof Error ? error.message : 'unknown error'}. Local previews still work.`);
      } finally {
        if (mounted) setIsImageLibraryLoading(false);
      }
    };
    void loadImageLibrary();
    return () => { mounted = false; };
  }, [customerSession]);

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
  const isCustomCoro = selectedSignProduct.id === 'yard-sign' && String(signValues.size || '') === 'custom';
  const selectedMagnetSize = parsePresetSize(signValues.size);
  const isCustomMagnet = selectedSignProduct.id === 'vehicle-magnet' && Boolean(signValues.customCut);
  const magnetDisplayName = isCustomMagnet ? 'Custom Magnets' : selectedSignProduct.name;
  const signWidth = selectedSignProduct.id === 'yard-sign' ? isCustomCoro ? Number(signValues.width || 0) : selectedCoroSize.width : selectedSignProduct.id === 'vehicle-magnet' ? isCustomMagnet ? Number(signValues.width || 0) : selectedMagnetSize.width : Number(signValues.width || 0);
  const signHeight = selectedSignProduct.id === 'yard-sign' ? isCustomCoro ? Number(signValues.height || 0) : selectedCoroSize.height : selectedSignProduct.id === 'vehicle-magnet' ? isCustomMagnet ? Number(signValues.height || 0) : selectedMagnetSize.height : Number(signValues.height || 0);
  const designerQuantity = productMode === 'signage' ? getSignQuantity(signValues) : totalQuantity;
  const coroSheetArtworkQuantity = coroSheetArtworkItems.reduce((total, item) => total + Math.max(1, Number(coroArtworkQuantities[item.id] || 1)), 0);
  const effectiveCoroQuantity = selectedSignProduct.id === 'yard-sign' && coroSheetArtworkItems.length > 0 ? coroSheetArtworkQuantity : designerQuantity;
  const standardCoroSheetLayout = getCoroSheetLayout(signWidth, signHeight, effectiveCoroQuantity);
  const customCoroSheetPreviews = isCustomCoro && coroSheetArtworkItems.length > 0 ? packCustomCoroSheets(coroSheetArtworkItems, coroArtworkQuantities, signWidth, signHeight) : [];
  const coroSheetLayout = isCustomCoro && customCoroSheetPreviews.length > 0 ? { columns: 1, rows: 1, rotated: false, signsPerSheet: 1, sheetCount: customCoroSheetPreviews.length } : standardCoroSheetLayout;
  const coroSheetCells = coroSheetArtworkItems.flatMap((item) => Array.from({ length: Math.max(1, Number(coroArtworkQuantities[item.id] || 1)) }, () => item));
  const coroUnusedSheetSpaces = isCustomCoro ? 0 : Math.max(0, (coroSheetLayout.sheetCount * coroSheetLayout.signsPerSheet) - effectiveCoroQuantity);
  const hasCoroUnusedSheetSpace = !isCustomCoro && selectedSignProduct.id === 'yard-sign' && coroSheetLayout.sheetCount > 1 && coroUnusedSheetSpaces > 0;
  const hasCoroDoubleSided = selectedSignProduct.id === 'yard-sign' && String(signValues.sides || 'single') === 'double';
  const hasCoroAspectMismatch = selectedSignProduct.id === 'yard-sign' && coroSheetArtworkItems.some((item) => {
    const itemSignWidth = isCustomCoro ? Number(item.signWidth || signWidth) : signWidth;
    const itemSignHeight = isCustomCoro ? Number(item.signHeight || signHeight) : signHeight;
    const frontMismatch = aspectRatioMismatch(item.width, item.height, itemSignWidth, itemSignHeight) && item.frontFitState !== 'fit' && item.frontFitState !== 'stretch';
    const backMismatch = hasCoroDoubleSided && item.backDataUrl ? aspectRatioMismatch(item.backWidth, item.backHeight, itemSignWidth, itemSignHeight) && item.backFitState !== 'fit' && item.backFitState !== 'stretch' : false;
    return frontMismatch || backMismatch;
  });
  const hasCoroSheetWarning = hasCoroUnusedSheetSpace || hasCoroAspectMismatch;
  const standardCoroSheetPreviews = Array.from({ length: standardCoroSheetLayout.sheetCount }, (_, sheetIndex) => {
    const start = sheetIndex * standardCoroSheetLayout.signsPerSheet;
    const end = start + standardCoroSheetLayout.signsPerSheet;
    return {
      sheetNumber: sheetIndex + 1,
      quantity: Math.min(standardCoroSheetLayout.signsPerSheet, Math.max(0, effectiveCoroQuantity - start)),
      cells: coroSheetCells.slice(start, end)
    };
  });
  const coroSheetPreviews = isCustomCoro && customCoroSheetPreviews.length > 0 ? customCoroSheetPreviews : standardCoroSheetPreviews;
  const customCoroHasValidSizes = !isCustomCoro
    || (coroSheetArtworkItems.length > 0
      ? coroSheetArtworkItems.every((item) => Number(item.signWidth || 0) > 0 && Number(item.signHeight || 0) > 0)
      : signWidth > 0 && signHeight > 0);
  const primaryCustomCoroItem = isCustomCoro ? coroSheetArtworkItems.find((item) => Number(item.signWidth || 0) > 0 && Number(item.signHeight || 0) > 0) : null;
  const isCoroBuilder = productMode === 'signage' && selectedSignProduct.id === 'yard-sign';
  const isBannerBuilder = productMode === 'signage' && selectedSignProduct.preview === 'banner';
  const isProductionBuilder = isCoroBuilder || isBannerBuilder;
  const bannerArtworkActualSize = signArtworkSize || (signArtworkPreviewUrl ? { width: signWidth, height: signHeight } : null);
  const rawBannerAspectMismatch = isBannerBuilder && Boolean(signArtworkPreviewUrl) && aspectRatioMismatch(signArtworkSize?.width, signArtworkSize?.height, signWidth, signHeight);
  const bannerFitResolved = isBannerBuilder && Boolean(signArtworkPreviewUrl) && (bannerArtworkFitState === 'fit' || bannerArtworkFitState === 'stretch');
  const bannerAspectMismatch = rawBannerAspectMismatch && !bannerFitResolved;
  const isMeshBanner = isBannerBuilder && (selectedSignProduct.id === 'mesh-banner' || String(signValues.material || '') === 'mesh-single');
  const productMaterialOptions = selectedSignProduct.fields.find((field) => field.name === 'material')?.options || BASIC_SIGN_MATERIAL_OPTIONS;
  const bannerMaterialOptions = selectedSignProduct.id === 'banner'
    ? String(signValues.sides || 'single') === 'double'
      ? BANNER_MATERIAL_OPTIONS.filter((option) => option.value === '18-single')
      : BANNER_MATERIAL_OPTIONS
    : productMaterialOptions;
  const selectedBannerMaterial = bannerMaterialOptions.find((option) => option.value === String(signValues.material || productMaterialOptions[0]?.value || 'standard')) || bannerMaterialOptions[0] || productMaterialOptions[0];
  const selectedRoundedCornerOption = ROUNDED_CORNER_OPTIONS.find((option) => option.value === String(signValues.roundedCorners || 'none')) || ROUNDED_CORNER_OPTIONS[2];
  const bannerDisplayName = isMeshBanner ? 'Mesh Banner' : selectedSignProduct.name;
  const bannerLocalOptionTotal = isBannerBuilder && Boolean(signValues.windSlits) ? 10 : 0;
  const bannerSquareFeet = signWidth * signHeight > 0 ? (signWidth * signHeight) / 144 : 0;
  const signPreviewAspect = selectedSignProduct.id === 'yard-sign' ? CORO_SHEET.width / CORO_SHEET.height : signWidth > 0 && signHeight > 0 ? Math.max(0.45, Math.min(4.5, signWidth / Math.max(1, signHeight))) : 1.5;
  const hasCoroSheetArtwork = isCoroBuilder && coroSheetArtworkItems.length > 0;
  const hasBannerArtwork = isBannerBuilder && Boolean(signArtworkPreviewUrl);
  const signArtworkMatchesSize = Boolean(signArtworkSize && Math.abs(signArtworkSize.width - signWidth) < 0.05 && Math.abs(signArtworkSize.height - signHeight) < 0.05);
  const signArtworkStatusOk = hasCoroSheetArtwork || (hasBannerArtwork ? (!rawBannerAspectMismatch || bannerFitResolved) : (layers.length > 0 && signArtworkMatchesSize));
  const signArtworkStatusLabel = !layers.length && !hasCoroSheetArtwork && !hasBannerArtwork ? 'Needs Artwork' : signArtworkStatusOk ? 'Print Ready' : 'Needs Fit Check';
  const hueQualityStatus = signArtworkStatusOk ? 'Hue check ready' : 'Needs artwork check';
  const hueOrderPathLabel = customerSession?.user?.email ? 'Saved customer library' : 'Guest checkout path';
  const customerAccountButtonLabel = customerSession?.user?.email || (isGuestCheckout ? 'Quick checkout' : 'Account');
  const sizeBreakdown = useMemo(() => SIZE_FIELDS.filter((size) => sizeQuantities[size] > 0).map((size) => `${size}: ${sizeQuantities[size]}`).join(', ') || 'No sizes added', [sizeQuantities]);
  const designerQuantityBreakdown = productMode === 'signage' ? `Each: ${designerQuantity}` : sizeBreakdown;
  const signRetailBase = numericPrice(signEstimate?.price?.retail);
  const signEachBase = numericPrice(signEstimate?.price?.each);
  const signRetailTotal = signRetailBase !== null ? signRetailBase + bannerLocalOptionTotal : null;
  const signEachTotal = signEachBase !== null ? signEachBase + (bannerLocalOptionTotal / Math.max(1, designerQuantity)) : null;
  const signPricePerSheet = signRetailTotal !== null ? signRetailTotal / coroSheetLayout.sheetCount : null;
  const coroPricePerSign = signEachTotal ?? (signRetailTotal !== null ? signRetailTotal / Math.max(1, effectiveCoroQuantity) : null);
  const coroPricePerFullSheet = coroPricePerSign !== null ? coroPricePerSign * coroSheetLayout.signsPerSheet : null;
  const coroPricingCurrency = signEstimate?.currency || 'USD';
  const coroPricingIsLoaded = isCoroBuilder && signEstimate && signRetailTotal !== null;
  const cartSubtotal = cartItems.reduce((total, item) => total + (item.price.total || 0), 0);
  const checkoutShipState = checkoutAddress.state.trim().toUpperCase();
  const checkoutIsGeorgiaOrder = checkoutFulfillment === 'pickup' || checkoutShipState === 'GA' || checkoutShipState === 'GEORGIA';
  const checkoutTaxRate = checkoutTaxExempt || !checkoutIsGeorgiaOrder ? 0 : GEORGIA_SALES_TAX_RATE;
  const checkoutTaxAmount = Number((cartSubtotal * checkoutTaxRate).toFixed(2));
  const checkoutOrderTotal = Number((cartSubtotal + checkoutTaxAmount).toFixed(2));
  const checkoutTaxLabel = checkoutTaxExempt ? 'Tax exempt' : checkoutIsGeorgiaOrder ? `${GEORGIA_SALES_TAX_LABEL} (${(GEORGIA_SALES_TAX_RATE * 100).toFixed(2)}%)` : 'No GA tax for out-of-state shipping';
  const canAddCurrentDesignToCart = productMode === 'signage' && Boolean(signEstimate) && signRetailTotal !== null && signArtworkStatusOk;
  const openTestCheckout = () => {
    if (cartItems.length === 0) {
      setCartStatus('Add at least one print-ready item before starting test checkout.');
      setShowCart(true);
      return;
    }
    setCheckoutContact((current) => ({
      name: current.name || customerInfo.name,
      organization: current.organization || customerInfo.organization,
      email: current.email || customerSession?.user?.email || customerInfo.email,
      phone: current.phone || customerInfo.phone,
      notes: current.notes || customerInfo.notes
    }));
    setCheckoutStep('contact');
    setCheckoutStatus('');
    setShowTestCheckout(true);
  };
  const submitTestOrder = () => {
    const contactName = checkoutContact.name.trim();
    const contactEmail = checkoutContact.email.trim();
    if (!contactName || !contactEmail) {
      setCheckoutStatus('Enter a customer name and email before submitting the test order.');
      setCheckoutStep('contact');
      return;
    }
    if (checkoutFulfillment === 'direct_ship') {
      const hasAddress = checkoutAddress.line1.trim() && checkoutAddress.city.trim() && checkoutAddress.state.trim() && checkoutAddress.postalCode.trim();
      if (!hasAddress) {
        setCheckoutStatus('Direct shipping needs a street address, city, state, and ZIP code.');
        setCheckoutStep('fulfillment');
        return;
      }
    }
    const timestamp = Date.now();
    const order: TestOrder = {
      id: `test-order-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      orderNumber: `TEST-${timestamp.toString().slice(-6)}`,
      createdAt: new Date(timestamp).toISOString(),
      status: 'test_submitted',
      paymentMode: 'test_no_payment',
      customer: {
        name: contactName,
        organization: checkoutContact.organization.trim() || undefined,
        email: contactEmail,
        phone: checkoutContact.phone.trim(),
        notes: checkoutContact.notes.trim() || undefined,
        taxExempt: checkoutTaxExempt,
        userId: customerSession?.user?.id,
        checkoutMode: customerSession?.user?.id ? 'account' : 'quick'
      },
      fulfillment: {
        method: checkoutFulfillment,
        address: checkoutFulfillment === 'direct_ship' ? {
          line1: checkoutAddress.line1.trim(),
          line2: checkoutAddress.line2.trim(),
          city: checkoutAddress.city.trim(),
          state: checkoutAddress.state.trim(),
          postalCode: checkoutAddress.postalCode.trim()
        } : undefined
      },
      items: cartItems,
      subtotal: cartSubtotal,
      tax: { rate: checkoutTaxRate, amount: checkoutTaxAmount, label: checkoutTaxLabel },
      total: checkoutOrderTotal,
      currency: 'USD'
    };
    setTestOrders((current) => [order, ...current]);
    setLastTestOrder(order);
    setCartItems([]);
    setShowCart(false);
    setCheckoutStep('complete');
    setCheckoutStatus(`Test order ${order.orderNumber} submitted. No payment was collected.`);
  };
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

  useEffect(() => {
    if (!hasCoroDoubleSided) setCoroSheetViewSide('front');
  }, [hasCoroDoubleSided]);

  useEffect(() => {
    setActiveCoroSheetIndex((current) => Math.min(current, Math.max(0, coroSheetPreviews.length - 1)));
  }, [coroSheetPreviews.length]);


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
  const deleteSelected = () => { const canvas = fabricCanvasRef.current; if (!canvas) return; const selected = canvas.getActiveObject(); if (!selected) return; if (selected.type === 'activeSelection') (selected as ActiveSelection).getObjects().forEach((obj) => canvas.remove(obj)); else canvas.remove(selected); if (productMode === 'signage' && canvas.getObjects().length === 0) { setSignArtworkSize(null); setSignArtworkPreviewUrl(null); setBannerArtworkName(''); setBannerArtworkFitState('unresolved'); } canvas.discardActiveObject(); canvas.requestRenderAll(); refreshLayers(canvas); };
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
    setBannerArtworkName('');
    setBannerArtworkFitState('unresolved');
    setCoroSheetArtworkItems([]);
    setCoroArtworkQuantities({});
    setArtworkAnalysis(null);
    setArtworkAnalysisStatus('');
  };

  const resetPlacedArtworkForProduct = () => {
    clearSignArtwork();
    setBannerOrderItems([]);
    setPendingBannerPlacement(null);
    setBannerArtworkName('');
    setBannerArtworkFitState('unresolved');
    setCoroPlacementTarget({ itemId: null, side: 'front' });
    setCoroSheetViewSide('front');
    setIsAddingCoroSign(false);
    setSelectedImageZoneId(null);
    setActiveObject(null);
    setShowImageZone(false);
    setImageLibraryStatus('');
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
    if (!canvas || !selected) {
      if (isBannerBuilder && signArtworkPreviewUrl && (mode === 'contain' || mode === 'stretch')) {
        setBannerArtworkFitState(mode === 'stretch' ? 'stretch' : 'fit');
      }
      return;
    }
    fitObjectToArtworkArea(selected, mode);
    if (productMode === 'signage') {
      const nextSize = mode === 'contain'
        ? calculateContainedSignArtworkSize(selected.width || 1, selected.height || 1)
        : { width: signWidth, height: signHeight };
      setSignArtworkSize(nextSize);
      if (isBannerBuilder && (mode === 'contain' || mode === 'stretch')) {
        setBannerArtworkFitState(mode === 'stretch' ? 'stretch' : 'fit');
      }
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
    if (productMode === 'signage') setSignArtworkPreviewUrl(dataUrl);
    if (productMode === 'signage') {
      canvas.getObjects().forEach((obj) => canvas.remove(obj));
      canvas.discardActiveObject();
    }
    const img = await FabricImage.fromURL(dataUrl);
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

  const isLikelyImagePath = (value: string) => /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(value);
  const canPlaceImageZoneItem = (item: ImageZoneItem) => Boolean(item.mimeType?.startsWith('image/') || item.dataUrl.startsWith('data:image/') || isLikelyImagePath(item.name) || isLikelyImagePath(item.dataUrl));

  const hydrateImageZoneItemSize = async (item: ImageZoneItem) => {
    if (item.width > 0 && item.height > 0) return item;
    try {
      const size = await getImageNaturalSize(item.dataUrl);
      const sizedItem = { ...item, width: size.width, height: size.height };
      setImageZoneItems((prev) => prev.map((entry) => entry.id === item.id ? sizedItem : entry));
      return sizedItem;
    } catch {
      return item;
    }
  };

  const applyBannerSizeFromPixels = (width: number, height: number) => {
    if (!width || !height) return;
    const nextWidth = Math.max(1, Number((width / BANNER_PREVIEW_DPI).toFixed(2)));
    const nextHeight = Math.max(1, Number((height / BANNER_PREVIEW_DPI).toFixed(2)));
    setSignValues((prev) => ({ ...prev, width: String(nextWidth), height: String(nextHeight) }));
    setSignArtworkSize({ width: nextWidth, height: nextHeight });
    setBannerArtworkFitState('unresolved');
    setSignEstimate(null);
  };

  const clearCurrentBannerArtwork = () => {
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
    setBannerArtworkName('');
    setBannerArtworkFitState('unresolved');
  };

  const makeCurrentBannerOrderItem = (): BannerOrderItem => ({
    id: `banner-${Date.now()}-${Math.round(Math.random() * 10000)}`,
    name: bannerArtworkName || 'Banner artwork',
    dataUrl: signArtworkPreviewUrl,
    width: signWidth,
    height: signHeight,
    quantity: designerQuantity,
    artworkSize: signArtworkSize,
    fitState: bannerArtworkFitState
  });

  const startAddBannerItem = () => {
    setBannerOrderItems((prev) => {
      const hasCurrentItem = Boolean(signArtworkPreviewUrl || signArtworkSize);
      return hasCurrentItem ? [...prev, makeCurrentBannerOrderItem()] : prev;
    });
    clearCurrentBannerArtwork();
    setActiveCoroOptionPanel('images');
    setImageLibraryStatus('Choose artwork for the next banner.');
  };

  const loadBannerOrderItem = async (item: BannerOrderItem) => {
    setBannerOrderItems((prev) => prev.filter((entry) => entry.id !== item.id));
    setSignValues((prev) => ({ ...prev, width: String(item.width), height: String(item.height), quantity: String(item.quantity) }));
    setSignArtworkSize(item.artworkSize);
    setSignArtworkPreviewUrl(item.dataUrl);
    setBannerArtworkName(item.name);
    setBannerArtworkFitState(item.fitState);
    setActiveCoroOptionPanel('images');
    if (item.dataUrl) {
      await placeImageOnDesign(item.dataUrl, item.name);
    } else {
      clearCurrentBannerArtwork();
    }
    setImageLibraryStatus(`${item.name} loaded for editing.`);
  };

  const removeBannerOrderItem = (itemId: string) => {
    setBannerOrderItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const placeCoroArtworkOnSheet = (item: ImageZoneItem) => {
    if (coroPlacementTarget.itemId && coroPlacementTarget.side === 'back') {
      setCoroSheetArtworkItems((prev) => prev.map((entry) => entry.id === coroPlacementTarget.itemId ? {
        ...entry,
        backDataUrl: item.dataUrl,
        backName: item.name,
        backWidth: item.width,
        backHeight: item.height,
        backCopiedFromFront: false,
        backFitState: 'unresolved'
      } : entry));
      setActiveCoroOptionPanel('images');
      setImageLibraryStatus(`${item.name} placed on the back side.`);
      setCoroPlacementTarget({ itemId: null, side: 'front' });
      return;
    }

    if (coroPlacementTarget.itemId && coroPlacementTarget.side === 'front') {
      setCoroSheetArtworkItems((prev) => prev.map((entry) => entry.id === coroPlacementTarget.itemId ? {
        ...entry,
        ...item,
        frontFitState: 'unresolved',
        signWidth: entry.signWidth,
        signHeight: entry.signHeight,
        fluteDirection: entry.fluteDirection,
        backDataUrl: entry.backDataUrl,
        backName: entry.backName,
        backWidth: entry.backWidth,
        backHeight: entry.backHeight,
        backCopiedFromFront: entry.backCopiedFromFront
      } : entry));
      setSignArtworkPreviewUrl(item.dataUrl);
      setActiveCoroOptionPanel('images');
      setImageLibraryStatus(`${item.name} replaced the front side.`);
      setCoroPlacementTarget({ itemId: null, side: 'front' });
      return;
    }

    const shouldAppend = isAddingCoroSign || coroSheetArtworkItems.length > 0;
    setCoroSheetArtworkItems((prev) => {
      const withoutDuplicate = prev.filter((entry) => entry.id !== item.id);
      const newItem = {
        ...item,
        frontFitState: 'unresolved' as ArtworkFitState,
        backFitState: 'unresolved' as ArtworkFitState,
        signWidth: isCustomCoro ? Number(signValues.width || 0) : undefined,
        signHeight: isCustomCoro ? Number(signValues.height || 0) : undefined,
        fluteDirection: isCustomCoro ? String(signValues.fluteDirection || 'auto') : undefined
      };
      return shouldAppend ? [...withoutDuplicate, newItem] : [newItem];
    });
    setCoroArtworkQuantities((prev) => shouldAppend ? { ...prev, [item.id]: prev[item.id] || 1 } : { [item.id]: designerQuantity });
    if (isAddingCoroSign) {
      setIsAddingCoroSign(false);
    }
    setSignArtworkPreviewUrl(item.dataUrl);
    setSignArtworkSize({ width: signWidth, height: signHeight });
    setActiveCoroOptionPanel('images');
    setImageLibraryStatus(`${item.name} placed on the CORO sheet.`);
    setCoroPlacementTarget({ itemId: null, side: 'front' });
  };

  const updateCoroArtworkQuantity = (itemId: string, value: string) => {
    const quantity = Math.max(1, Math.floor(Number(value) || 1));
    setCoroArtworkQuantities((prev) => ({ ...prev, [itemId]: quantity }));
    if (coroSheetArtworkItems[0]?.id === itemId) updateSignOption('quantity', String(quantity));
  };

  const updateCoroArtworkSize = (itemId: string, dimension: 'signWidth' | 'signHeight', value: string) => {
    const nextValue = Math.max(0, Number(value) || 0);
    setCoroSheetArtworkItems((prev) => prev.map((item) => item.id === itemId ? {
      ...item,
      [dimension]: nextValue,
      frontFitState: 'unresolved',
      backFitState: item.backDataUrl ? 'unresolved' : item.backFitState
    } : item));
    setSignEstimate(null);
  };

  const updateCoroArtworkFlute = (itemId: string, value: string) => {
    setCoroSheetArtworkItems((prev) => prev.map((item) => item.id === itemId ? { ...item, fluteDirection: value } : item));
    setSignEstimate(null);
  };

  const removeCoroArtworkItem = (itemId: string) => {
    setCoroSheetArtworkItems((prev) => {
      const next = prev.filter((item) => item.id !== itemId);
      setSignArtworkPreviewUrl(next[0]?.dataUrl || null);
      if (next.length === 0) setSignArtworkSize(null);
      return next;
    });
    setCoroArtworkQuantities((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const startAddCoroSign = () => {
    setIsAddingCoroSign(true);
    setCoroPlacementTarget({ itemId: null, side: 'front' });
    setShowImageZone(true);
    setImageLibraryStatus('Choose another artwork file to add to this sheet.');
  };

  const chooseCoroSideImage = (itemId: string, side: CoroArtworkSide) => {
    setCoroPlacementTarget({ itemId, side });
    setShowImageZone(true);
    setActiveCoroOptionPanel('images');
    setImageLibraryStatus(`Choose artwork for the ${side} side.`);
  };

  const copyCoroFrontToBack = (itemId: string) => {
    setCoroSheetArtworkItems((prev) => prev.map((item) => item.id === itemId ? {
      ...item,
      backDataUrl: item.dataUrl,
      backName: item.name,
      backWidth: item.width,
      backHeight: item.height,
      backCopiedFromFront: true,
      backFitState: item.frontFitState || 'unresolved'
    } : item));
    setImageLibraryStatus('Front artwork copied to the back side.');
  };

  const resolveCoroArtworkFit = (itemId: string, fitState: Exclude<ArtworkFitState, 'unresolved'>) => {
    setCoroSheetArtworkItems((prev) => prev.map((item) => item.id === itemId ? {
      ...item,
      frontFitState: fitState,
      backFitState: item.backDataUrl ? fitState : item.backFitState
    } : item));
    setImageLibraryStatus(fitState === 'fit' ? 'Artwork fit accepted for this sign.' : 'Artwork stretch accepted for this sign.');
  };

  const useImageZoneItem = async (item: ImageZoneItem) => {
    setSelectedImageZoneId(item.id);
    if (!canPlaceImageZoneItem(item)) {
      setImageLibraryStatus(`${item.name} is selected for production. PDF placement preview is coming next.`);
      return;
    }
    const imageItem = await hydrateImageZoneItemSize(item);
    if (isCoroBuilder) placeCoroArtworkOnSheet(imageItem);
    if (isBannerBuilder) {
      setSignArtworkPreviewUrl(imageItem.dataUrl);
      setBannerArtworkName(imageItem.name);
      applyBannerSizeFromPixels(imageItem.width, imageItem.height);
      setPendingBannerPlacement({ dataUrl: imageItem.dataUrl, name: imageItem.name, width: imageItem.width, height: imageItem.height });
      setImageLibraryStatus(`${imageItem.name} selected for the banner.`);
      setShowImageZone(false);
      setActiveCoroOptionPanel('images');
      return;
    }
    if (!fabricCanvasRef.current) {
      const targetProductId = selectedSignProduct.id;
      setProductMode('signage');
      setSignProductId(targetProductId);
      setStoreCategory(targetProductId === 'banner' ? 'banners' : 'coro');
      setStoreView('builder');
      setShowImageZone(false);
      setActiveCoroOptionPanel('images');
      return;
    }
    try {
      await placeImageOnDesign(imageItem.dataUrl, imageItem.name);
    } catch (error) {
      setImageLibraryStatus(`Could not place ${imageItem.name}: ${error instanceof Error ? error.message : 'image failed to load'}. Try uploading the original file again.`);
      return;
    }
    setShowImageZone(false);
  };

  const onUploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const canvas = fabricCanvasRef.current;
    const isImageFile = isPreviewableImageFile(file);
    const canPlaceOnCanvas = Boolean(isImageFile && canvas);
    if (isImageFile && !canPlaceOnCanvas) setImageLibraryStatus(`Adding file to the library. Open the ${selectedSignProduct.name} builder to place it on the design.`);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      let imagePixels = { width: 0, height: 0 };
      if (isImageFile) {
        try {
          imagePixels = await getImageNaturalSize(dataUrl);
          const analysis = await analyzeArtworkImage(file, dataUrl);
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
      if (isImageFile && isBannerBuilder) {
        setSignArtworkPreviewUrl(dataUrl);
        setBannerArtworkName(file.name);
        applyBannerSizeFromPixels(imagePixels.width, imagePixels.height);
        setPendingBannerPlacement({ dataUrl, name: file.name, width: imagePixels.width, height: imagePixels.height });
        setImageLibraryStatus(`${file.name} selected for the banner.`);
      } else if (canPlaceOnCanvas) {
        await placeImageOnDesign(dataUrl, file.name);
      }
      event.target.value = '';

      if (isSupabaseStorageConfigured) {
        setImageLibraryStatus(`${canPlaceOnCanvas ? 'Preview ready' : 'Library file ready'}. Saving original file to ${SUPABASE_STORAGE_BUCKET}...`);
        try {
          const storageInfo = await uploadArtworkFileToSupabase(file, customerSession);
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
          setImageLibraryStatus(customerSession?.user?.email
            ? `Saved original file to ${customerSession.user.email}'s library.`
            : `Saved original file to guest library: ${storageInfo.storagePath}`);
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

  useEffect(() => {
    if (!pendingBannerPlacement || !isBannerBuilder || !fabricCanvasRef.current) return;
    let canceled = false;
    const placement = pendingBannerPlacement;
    window.requestAnimationFrame(() => {
      void (async () => {
        try {
          await placeImageOnDesign(placement.dataUrl, placement.name);
          if (canceled) return;
          setSignArtworkPreviewUrl(placement.dataUrl);
          setBannerArtworkName(placement.name);
          setSignArtworkSize(calculateContainedSignArtworkSize(placement.width || 1, placement.height || 1));
          setImageLibraryStatus(`${placement.name} placed on the banner.`);
          setPendingBannerPlacement(null);
        } catch (error) {
          if (canceled) return;
          setImageLibraryStatus(`Could not place ${placement.name}: ${error instanceof Error ? error.message : 'image failed to load'}.`);
          setPendingBannerPlacement(null);
        }
      })();
    });
    return () => { canceled = true; };
  }, [isBannerBuilder, pendingBannerPlacement, signHeight, signWidth]);

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
    const pricingApiSlug = selectedSignProduct.id === 'yard-sign' ? 'custom-cut-coroplast' : selectedSignProduct.apiSlug;
    if (selectedSignProduct.id === 'yard-sign') {
      payload.quantity = effectiveCoroQuantity;
      payload.width = primaryCustomCoroItem ? Number(primaryCustomCoroItem.signWidth || signWidth) : signWidth;
      payload.height = primaryCustomCoroItem ? Number(primaryCustomCoroItem.signHeight || signHeight) : signHeight;
      payload.material = signValues.material || '4mm';
      payload.thickness = signValues.material || '4mm';
      payload.sheetCount = coroSheetLayout.sheetCount;
    }
    const missingNumber = selectedSignProduct.id === 'yard-sign'
      ? !payload.quantity || Number.isNaN(payload.quantity) || !customCoroHasValidSizes
      : selectedSignProduct.fields.some((field) => field.type === 'number' && (!payload[field.name] || Number.isNaN(payload[field.name])));

    if (missingNumber) {
      setSignEstimateStatus('Please enter valid sign dimensions and quantity.');
      return;
    }

    setIsSignEstimateLoading(true);
    try {
      const response = await fetch(`/api/pricing/${pricingApiSlug}`, {
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

  const handleAddCurrentDesignToCart = () => {
    if (productMode !== 'signage') {
      setCartStatus('Apparel cart support is coming next. Use sign products for this cart test.');
      setShowCart(true);
      return;
    }
    if (!signEstimate || signRetailTotal === null) {
      setCartStatus('Run pricing before adding this item to the cart.');
      setShowCart(true);
      return;
    }
    if (!signArtworkStatusOk) {
      setCartStatus('Resolve artwork fit or upload missing artwork before adding to cart.');
      setShowCart(true);
      return;
    }

    const findArtworkSource = (name: string | undefined, dataUrl: string | null | undefined) => imageZoneItems.find((item) => (name && item.name === name) || (dataUrl && item.dataUrl === dataUrl));
    const artworkFiles: CartArtworkFile[] = [];
    if (isCoroBuilder) {
      coroSheetArtworkItems.forEach((item, index) => {
        artworkFiles.push({
          role: `Artwork set ${index + 1} front`,
          name: item.name,
          storagePath: item.storagePath,
          storageUrl: item.storageUrl,
          source: item.source,
          previewUrl: item.dataUrl
        });
        if (item.backDataUrl) {
          const backSource = item.backCopiedFromFront ? item : findArtworkSource(item.backName, item.backDataUrl);
          artworkFiles.push({
            role: `Artwork set ${index + 1} back`,
            name: item.backName || `${item.name} back`,
            storagePath: backSource?.storagePath,
            storageUrl: backSource?.storageUrl,
            source: backSource?.source,
            previewUrl: item.backDataUrl
          });
        }
      });
    } else if (isBannerBuilder) {
      bannerOrderItems.forEach((item, index) => {
        const source = findArtworkSource(item.name, item.dataUrl);
        artworkFiles.push({
          role: `Banner set ${index + 1}`,
          name: item.name,
          storagePath: source?.storagePath,
          storageUrl: source?.storageUrl,
          source: source?.source,
          previewUrl: item.dataUrl || undefined
        });
      });
      if (signArtworkPreviewUrl) {
        const source = findArtworkSource(bannerArtworkName, signArtworkPreviewUrl);
        const alreadyIncluded = artworkFiles.some((file) => file.previewUrl === signArtworkPreviewUrl && file.name === (bannerArtworkName || source?.name));
        if (!alreadyIncluded) artworkFiles.push({
          role: `Banner set ${bannerOrderItems.length + 1}`,
          name: bannerArtworkName || source?.name || 'Banner artwork',
          storagePath: source?.storagePath,
          storageUrl: source?.storageUrl,
          source: source?.source,
          previewUrl: signArtworkPreviewUrl
        });
      }
    } else if (signArtworkPreviewUrl) {
      const source = findArtworkSource(bannerArtworkName, signArtworkPreviewUrl);
      artworkFiles.push({
        role: 'Artwork',
        name: bannerArtworkName || source?.name || `${selectedSignProduct.name} artwork`,
        storagePath: source?.storagePath,
        storageUrl: source?.storageUrl,
        source: source?.source,
        previewUrl: signArtworkPreviewUrl
      });
    }

    const pricePerSheet = isCoroBuilder ? signPricePerSheet : null;
    const cartItem: CartItem = {
      id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      addedAt: new Date().toISOString(),
      mode: productMode,
      productId: selectedSignProduct.id,
      productName: isBannerBuilder ? bannerDisplayName : selectedSignProduct.id === 'vehicle-magnet' ? magnetDisplayName : selectedSignProduct.name,
      quantity: isCoroBuilder ? effectiveCoroQuantity : designerQuantity,
      sizeLabel: `${signWidth || 0}" x ${signHeight || 0}"`,
      optionSummary: [
        getSignConfigurationText(selectedSignProduct, signValues),
        isCoroBuilder ? `${coroSheetLayout.sheetCount} sheet${coroSheetLayout.sheetCount === 1 ? '' : 's'} / ${coroSheetLayout.signsPerSheet} per sheet` : '',
        isBannerBuilder ? `${bannerSquareFeet.toFixed(1)} sqft` : ''
      ].filter(Boolean),
      price: {
        total: signRetailTotal,
        each: isCoroBuilder ? coroPricePerSign : signEachTotal,
        currency: signEstimate.currency || 'USD',
        sheetCount: isCoroBuilder ? coroSheetLayout.sheetCount : undefined,
        pricePerSheet
      },
      artworkFiles,
      productionSummary: [
        signArtworkStatusOk ? 'Artwork fit approved' : 'Artwork needs review',
        isCoroBuilder ? `Sheet layout: ${coroSheetLayout.columns} across x ${coroSheetLayout.rows} down` : '',
        hasCoroDoubleSided ? 'Double-sided CORO' : '',
        String(signValues.sides || 'single') === 'double' && isBannerBuilder ? 'Double-sided banner' : ''
      ].filter(Boolean),
      customer: {
        userId: customerSession?.user?.id,
        email: customerSession?.user?.email,
        checkoutMode: customerSession?.user?.id ? 'account' : 'quick'
      }
    };
    setCartItems((prev) => [cartItem, ...prev]);
    setCartStatus(`${cartItem.productName} added to cart with ${artworkFiles.length} artwork file${artworkFiles.length === 1 ? '' : 's'} attached.`);
    setShowCart(true);
  };

  useEffect(() => {
    if (!isProductionBuilder) return;
    const pricingQuantity = isCoroBuilder ? effectiveCoroQuantity : designerQuantity;
    if (pricingQuantity <= 0) return;
    if (isCoroBuilder && !customCoroHasValidSizes) {
      setSignEstimate(null);
      setSignEstimateStatus('Enter a custom CORO width and height to load pricing.');
      return;
    }
    if (!isCoroBuilder && (signWidth <= 0 || signHeight <= 0)) {
      setSignEstimate(null);
      setSignEstimateStatus('Enter a width and height or upload artwork to load pricing.');
      return;
    }

    let canceled = false;
    const payload = toSignPricingPayload(selectedSignProduct, signValues);
    const pricingApiSlug = selectedSignProduct.id === 'yard-sign' ? 'custom-cut-coroplast' : selectedSignProduct.apiSlug;
    payload.quantity = pricingQuantity;
    if (selectedSignProduct.id === 'yard-sign') {
      payload.width = primaryCustomCoroItem ? Number(primaryCustomCoroItem.signWidth || signWidth) : signWidth;
      payload.height = primaryCustomCoroItem ? Number(primaryCustomCoroItem.signHeight || signHeight) : signHeight;
      payload.material = signValues.material || '4mm';
      payload.thickness = signValues.material || '4mm';
      payload.sheetCount = coroSheetLayout.sheetCount;
    }

    setIsSignEstimateLoading(true);
    setSignEstimateStatus(`Loading ${selectedSignProduct.name} pricing...`);

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/pricing/${pricingApiSlug}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json() as SignEstimate;

        if (canceled) return;

        if (!response.ok || data.ok === false) {
          const fieldMessages = data.error?.fields ? Object.entries(data.error.fields).map(([field, message]) => `${field}: ${message}`).join(' ') : '';
          setSignEstimate(null);
          setSignEstimateStatus([data.error?.message || `The ${selectedSignProduct.name} estimate could not be returned.`, fieldMessages].filter(Boolean).join(' '));
          return;
        }

        setSignEstimate(data);
        setSignEstimateStatus(`${selectedSignProduct.name} pricing loaded from Hue pricing API.`);
      } catch {
        if (!canceled) {
          setSignEstimate(null);
          setSignEstimateStatus(`The ${selectedSignProduct.name} estimate could not be loaded right now.`);
        }
      } finally {
        if (!canceled) setIsSignEstimateLoading(false);
      }
    }, 350);

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [coroSheetLayout.sheetCount, customCoroHasValidSizes, designerQuantity, effectiveCoroQuantity, isCoroBuilder, isProductionBuilder, primaryCustomCoroItem, selectedSignProduct, signHeight, signValues, signWidth]);

  const saveCustomerSession = (session: CustomerSession) => {
    setCustomerSession(session);
    window.localStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, JSON.stringify(session));
  };

  const handleCustomerAuth = async () => {
    const email = customerAuthEmail.trim();
    const password = customerAuthPassword;
    if (!email || !password) {
      setCustomerAuthStatus('Enter an email and password.');
      return;
    }
    setIsCustomerAuthLoading(true);
    setCustomerAuthStatus(customerAuthMode === 'signin' ? 'Signing in...' : 'Creating account...');
    try {
      const endpoint = customerAuthMode === 'signin'
        ? `${SUPABASE_URL}/auth/v1/token?grant_type=password`
        : `${SUPABASE_URL}/auth/v1/signup`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json() as Partial<CustomerSession> & { msg?: string; message?: string; error_description?: string };
      if (!response.ok) throw new Error(data.error_description || data.message || data.msg || 'Supabase sign-in failed.');
      if (!data.access_token) {
        setCustomerAuthStatus('Account created. Check email confirmation if Supabase requires it, then sign in.');
        setCustomerAuthMode('signin');
        return;
      }
      const nextSession: CustomerSession = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
        user: data.user
      };
      saveCustomerSession(nextSession);
      setIsGuestCheckout(false);
      setCustomerAuthStatus(`Signed in as ${nextSession.user?.email || email}.`);
      setImageLibraryStatus(`Signed in as ${nextSession.user?.email || email}. Loading saved artwork library...`);
      setShowCustomerLogin(false);
    } catch (error) {
      setCustomerAuthStatus(error instanceof Error ? error.message : 'Customer sign-in failed.');
    } finally {
      setIsCustomerAuthLoading(false);
    }
  };

  const handleGuestMode = () => {
    setIsGuestCheckout(true);
    setShowCustomerLogin(false);
    setCustomerAuthStatus('Continuing without an account.');
    if (!customerSession) setImageLibraryStatus('Quick checkout: artwork previews work now, saved libraries need an account.');
  };

  const handleCustomerSignOut = async () => {
    const sessionToClose = customerSession;
    setCustomerSession(null);
    setIsGuestCheckout(true);
    window.localStorage.removeItem(CUSTOMER_SESSION_STORAGE_KEY);
    setImageZoneItems((prev) => prev.filter((item) => item.source !== 'supabase'));
    setSelectedImageZoneId(null);
    setCustomerAuthStatus('Signed out. Quick checkout is active.');
    setImageLibraryStatus('Signed out. Quick checkout is active.');
    if (sessionToClose?.access_token) {
      try {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: 'POST',
          headers: getSupabaseStorageHeaders(sessionToClose.access_token)
        });
      } catch {
        // Local sign-out already completed; remote logout can fail harmlessly in dev.
      }
    }
  };

  const visibleStoreProducts = STORE_PRODUCTS.filter((product) => product.category === storeCategory);
  const filteredCoroSizeOptions = CORO_SIZE_OPTIONS.filter((option) => {
    const query = coroSizeSearch.trim().toLowerCase();
    if (!query) return true;
    return option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query.replace(/\s/g, ''));
  });

  const openStoreCategory = (categoryId: StoreCategoryId) => {
    const categoryChanged = categoryId !== storeCategory;
    if (categoryChanged) resetPlacedArtworkForProduct();
    setStoreCategory(categoryId);
    if (categoryId === 'banners') {
      setStoreView('store');
      return;
    }
    if (categoryId === 'coro') {
      setProductMode('signage');
      setSignProductId('yard-sign');
      setStoreView('builder');
      setActiveCoroOptionPanel('images');
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
    resetPlacedArtworkForProduct();
    setProductMode(product.mode);
    if (product.signProductId) {
      const nextProduct = SIGN_PRODUCT_CONFIGS.find((config) => config.id === product.signProductId);
      setSignProductId(product.signProductId);
      if (nextProduct) setSignValues({ ...getDefaultSignValues(nextProduct), ...(product.initialSignValues || {}) } as Record<string, string | boolean>);
      setSignEstimate(null);
    }
    setStoreView('builder');
    if (product.signProductId) setActiveCoroOptionPanel('images');
  };

  const selectSignProductForBuilder = (nextProductId: SignProductId) => {
    if (nextProductId !== signProductId) resetPlacedArtworkForProduct();
    const nextProduct = SIGN_PRODUCT_CONFIGS.find((config) => config.id === nextProductId);
    setSignProductId(nextProductId);
    if (nextProduct) setSignValues(getDefaultSignValues(nextProduct));
    setSignEstimate(null);
    setActiveCoroOptionPanel(nextProductId === 'yard-sign' || nextProduct?.preview === 'banner' ? 'images' : null);
  };

  const updateSignOption = (name: string, value: string | boolean) => {
    if (isProductionBuilder && (name === 'width' || name === 'height' || name === 'size')) {
      setBannerArtworkFitState('unresolved');
      setCoroSheetArtworkItems((prev) => prev.map((item) => ({
        ...item,
        frontFitState: 'unresolved',
        backFitState: item.backDataUrl ? 'unresolved' : item.backFitState
      })));
    }
    setSignValues((prev) => ({ ...prev, [name]: value }));
    setSignEstimate(null);
  };

  const updatePrintSides = (value: string) => {
    if (isBannerBuilder) {
      setBannerArtworkFitState('unresolved');
      setSignValues((prev) => ({
        ...prev,
        sides: value,
        material: value === 'double' ? '18-single' : prev.material
      }));
      setSignEstimate(null);
      setActiveCoroOptionPanel('images');
      if (value === 'double') setShowBannerDoubleSidedWarning(true);
      return;
    }
    updateSignOption('sides', value);
    setActiveCoroOptionPanel('images');
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
    if (label === 'Welding') {
      updateSignOption('welding', !Boolean(signValues.welding));
      return;
    }
    if (label === 'Webbing') {
      openCoroOptionPanel('webbing');
      return;
    }
    if (label === 'Rounded Corners') {
      openCoroOptionPanel('roundedCorners');
      return;
    }
    if (label === 'Rope') {
      updateSignOption('rope', !Boolean(signValues.rope));
      return;
    }
    if (label === 'Pole Pockets') {
      updateSignOption('polePocket', !Boolean(signValues.polePocket));
      return;
    }
    if (label === 'Wind Slits') {
      updateSignOption('windSlits', !Boolean(signValues.windSlits));
      return;
    }
    if (label === 'Step Stakes') {
      openCoroOptionPanel('stakes');
      return;
    }
    if (label === 'Flutes') {
      openCoroOptionPanel('size');
      return;
    }
    if (label === 'Gloss') {
      updateSignOption('gloss', !Boolean(signValues.gloss));
    }
  };

  return (
    <main className={`${isProductionBuilder ? 'flex h-screen flex-col overflow-hidden bg-[#050b12] pb-0 text-slate-100' : 'min-h-screen bg-[#f4f8fc] pb-24 text-slate-950'}`}>
      <input id="artwork-upload-input" ref={artworkUploadInputRef} onChange={onUploadImage} className="fixed -left-96 top-0 h-px w-px opacity-0" type="file" accept="image/*,application/pdf,.pdf" />
      <header className={`${isProductionBuilder ? 'border-b border-white/10 bg-[#080d14]/96 px-5 py-3 shadow-[0_10px_32px_rgba(0,0,0,0.42)] backdrop-blur md:px-7' : 'border-b border-white/70 bg-white/90 px-4 py-3 shadow-[0_8px_30px_rgba(7,17,31,0.06)] backdrop-blur md:px-6'}`}>
        <div className={`mx-auto flex max-w-[1800px] flex-wrap items-center gap-3 ${isProductionBuilder ? 'justify-between' : ''}`}>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className={`${isProductionBuilder ? 'h-12 w-12 rounded-md border border-white/35 shadow-[0_0_28px_rgba(22,120,184,0.20)]' : 'h-14 w-14 rounded-lg border-[3px]'} flex shrink-0 items-center justify-center overflow-hidden border-[#1678b8] bg-[#030706] shadow-sm`}>
              <img src="/brand/hue-graphics-mark.png" alt="Hue Graphics" className="h-full w-full object-cover" />
            </div>
            <div className={`min-w-0 ${isProductionBuilder ? 'hidden xl:block' : ''}`}>
              <p className={`text-xs font-black uppercase tracking-[0.22em] ${isProductionBuilder ? 'text-[#57c8ff]' : 'text-[#1f73be]'}`}>Hue Graphics / Est. 2008</p>
              <h1 className={`truncate text-xl font-black tracking-tight md:text-2xl ${isProductionBuilder ? 'text-white' : 'text-[#05090b]'}`}>Print-Ready Store</h1>
            </div>
          </div>
          {isProductionBuilder ? <nav className="order-3 flex w-full items-center justify-center gap-3 overflow-x-auto px-1 pt-2 text-[10px] font-semibold text-slate-400 md:order-none md:w-auto md:flex-1 md:pt-0">
            {STORE_CATEGORIES.map((category) => {
              const active = storeCategory === category.id;
              const icon = category.id === 'banners' ? 'BN' : category.id === 'rigid' ? 'RG' : category.id === 'decals' ? 'AD' : category.id === 'magnets' ? 'MG' : category.id === 'apparel' ? 'AP' : category.id === 'misc' ? 'MS' : 'CO';
              return <button key={category.id} type="button" onClick={() => openStoreCategory(category.id)} className={`group flex min-w-14 flex-col items-center gap-1 border-b-2 px-1 pb-2 pt-0 transition ${active ? 'border-[#0ea5e9] text-[#50c7ff]' : 'border-transparent text-slate-400 hover:border-slate-600 hover:text-slate-200'}`}>
                <span className={`flex h-8 w-8 items-center justify-center rounded border text-[10px] font-black shadow-sm ${active ? 'border-[#0ea5e9] bg-[#071827] text-[#65d5ff] shadow-[0_0_16px_rgba(14,165,233,0.40)]' : 'border-white/20 bg-[#0c1118] text-slate-300 group-hover:border-slate-500'}`}>{icon}</span>
                <span>{category.label}</span>
              </button>;
            })}
          </nav> : null}
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => setStoreView('store')} className={`${isProductionBuilder ? 'rounded border border-white/15 bg-[#0b1018] px-4 py-2 font-semibold text-slate-400 hover:border-slate-500 hover:text-slate-100' : 'rounded-md border border-slate-300 bg-white px-3 py-2 font-medium hover:bg-slate-50'}`}>Products</button>
            {storeView === 'builder' && !isProductionBuilder ? <button onClick={saveDraftToLocal} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium hover:bg-slate-50">Save</button> : null}
            {storeView === 'builder' && !isProductionBuilder ? <button onClick={exportDesign} className="rounded-md bg-[#1678b8] px-3 py-2 font-bold text-white hover:bg-[#0f5f94]">Download PNG</button> : null}
            {isProductionBuilder ? <button type="button" onClick={() => setShowImageZone(true)} className="rounded border border-[#0ea5e9] bg-[#071827] px-4 py-2 font-black text-white shadow-[0_0_18px_rgba(14,165,233,0.22)] hover:bg-[#0b263d]">Image Zone</button> : null}
            <button type="button" onClick={() => setShowCustomerLogin(true)} className={`${isProductionBuilder ? 'max-w-36 truncate rounded border border-white/20 bg-[#0b1018] px-4 py-2 font-bold text-white hover:border-[#0ea5e9]/70' : 'max-w-36 truncate rounded-md border border-[#1f73be]/25 bg-white px-3 py-2 font-bold text-[#125b99] hover:bg-[#eef6ff]'}`}>{customerAccountButtonLabel}</button>
            <button type="button" onClick={() => setShowCart(true)} className={`${isProductionBuilder ? 'rounded border border-white/20 bg-[#0b1018] px-4 py-2 font-bold text-white hover:border-slate-500' : 'rounded-md border border-[#1f73be]/25 bg-[#eef6ff] px-3 py-2 font-bold text-[#125b99] hover:bg-[#dff0ff]'}`}>Cart{cartItems.length ? ` (${cartItems.length})` : ''}</button>
            {isProductionBuilder ? <button type="button" className="rounded border border-white/20 bg-[#0b1018] px-4 py-2 font-bold text-white hover:border-slate-500">Menu</button> : null}
          </div>
        </div>
      </header>

      {storeView === 'store' ? (
        <section className="mx-auto max-w-[1800px] px-4 py-5 md:px-6">
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className={`rounded-lg p-4 shadow-[0_18px_48px_rgba(7,17,31,0.08)] ${isProductionBuilder ? 'border border-white/25 bg-[#07111f]/82 text-slate-100 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur' : 'border border-white/80 bg-white/92'}`}>
              <p className={`text-xs font-black uppercase tracking-[0.22em] ${isProductionBuilder ? 'text-[#57c8ff]' : 'text-[#1f73be]'}`}>Online ordering</p>
              <h2 className={`mt-2 text-2xl font-black tracking-tight ${isProductionBuilder ? 'text-white' : 'text-slate-950'}`}>Shop ready artwork products</h2>
              <p className={`mt-2 text-sm leading-6 ${isProductionBuilder ? 'text-slate-300' : 'text-slate-600'}`}>Upload finished artwork, check fit, get online pricing, and checkout separately from the quote system.</p>
              <div className="mt-5 space-y-2">
                {STORE_CATEGORIES.map((category) => <button key={category.id} type="button" onClick={() => setStoreCategory(category.id)} className={`w-full rounded-md border p-3 text-left transition ${isProductionBuilder ? storeCategory === category.id ? 'border-[#0ea5e9] bg-[#0b263d] text-white shadow-[0_0_18px_rgba(14,165,233,0.16)]' : 'border-white/15 bg-white/[0.06] text-slate-200 hover:border-[#0ea5e9]/60 hover:bg-white/[0.10]' : storeCategory === category.id ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94] shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><span className="block text-sm font-bold">{category.label}</span><span className={`mt-1 block text-xs ${isProductionBuilder ? 'text-slate-400' : 'text-slate-500'}`}>{category.description}</span></button>)}
              </div>
            </aside>

            <section className={`overflow-hidden rounded-lg shadow-[0_18px_48px_rgba(7,17,31,0.08)] ${isProductionBuilder ? 'border border-white/25 bg-[#07111f]/72 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur' : 'border border-white/80 bg-white/88'}`}>
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
                    <h3 className={`text-xl font-black ${isProductionBuilder ? 'text-white' : 'text-slate-950'}`}>{STORE_CATEGORIES.find((category) => category.id === storeCategory)?.label || 'Products'}</h3>
                    <p className={`mt-1 text-sm ${isProductionBuilder ? 'text-slate-300' : 'text-slate-500'}`}>Choose a product to open the print-ready builder.</p>
                  </div>
                  <button type="button" onClick={() => setStoreCategory('apparel')} className={`rounded-md border px-3 py-2 text-sm font-medium ${isProductionBuilder ? 'border-white/20 bg-white/[0.06] text-slate-200 hover:border-[#0ea5e9]/60 hover:bg-white/[0.10]' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>Apparel Designer</button>
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
      <div className={`mx-auto grid gap-4 xl:items-start ${isProductionBuilder ? 'min-h-0 w-full flex-1 max-w-none px-0 py-0 xl:grid-cols-1' : 'max-w-[1800px] px-4 py-4 md:px-6 xl:grid-cols-[300px_minmax(520px,1fr)_360px]'}`}>
        <aside id="product" className={`${isProductionBuilder ? 'hidden' : 'rounded-lg border border-white/80 bg-white/92 shadow-[0_18px_48px_rgba(7,17,31,0.08)] backdrop-blur xl:sticky xl:top-4 xl:max-h-[calc(100vh-8rem)] xl:overflow-hidden'}`}>
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
            <div className={`grid grid-cols-2 gap-2 ${isProductionBuilder ? 'hidden' : ''}`}>
              {(['apparel', 'signage'] as ProductMode[]).map((mode) => <button key={mode} type="button" onClick={() => { if (mode !== productMode) resetPlacedArtworkForProduct(); setProductMode(mode); }} className={`rounded-md border px-3 py-2 text-xs font-bold ${productMode === mode ? 'border-[#1678b8] bg-[#1678b8] text-white shadow-sm' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{mode === 'apparel' ? 'Apparel' : 'Signs'}</button>)}
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
                    const selected = String(signValues.size || '') === option.value;
                    return <button key={option.value} type="button" onClick={() => { setSignValues((prev) => ({ ...prev, size: option.value })); setSignEstimate(null); }} className={`w-full rounded border px-3 py-2 text-left text-xs ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><span className="block font-bold">{option.label}</span><span className="mt-1 block text-slate-500">{layout.columns} across x {layout.rows} down / {layout.sheetCount} sheet{layout.sheetCount === 1 ? '' : 's'}</span></button>;
                  })}
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Order</p>
                <div className="mt-3 grid gap-3">
                  <label className="text-xs font-medium text-slate-600">Quantity<input type="number" min={1} value={String(signValues.quantity ?? '')} onChange={(event) => { setSignValues((prev) => ({ ...prev, quantity: event.target.value })); setSignEstimate(null); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950" /></label>
                  <label className="text-xs font-medium text-slate-600">Material<select value={String(signValues.material ?? '4mm')} onChange={(event) => { setSignValues((prev) => ({ ...prev, material: event.target.value })); setSignEstimate(null); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950"><option value="4mm">4mm CORO</option><option value="10mm">10mm CORO</option></select></label>
                  <label className="text-xs font-medium text-slate-600">Print Sides<select value={String(signValues.sides ?? 'single')} onChange={(event) => updatePrintSides(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950"><option value="single">Single-Sided</option><option value="double">Double-Sided</option></select></label>
                </div>
              </div>
              <button type="button" onClick={() => isCoroBuilder ? setShowImageZone(true) : triggerArtworkUpload()} className="w-full rounded-md bg-[#1678b8] px-3 py-3 text-sm font-black uppercase tracking-wide text-white hover:bg-[#0f5f94]">{signArtworkPreviewUrl ? 'Replace Artwork' : 'Upload Artwork'}</button>
            </div> : <div className="space-y-3">
              <div className="grid gap-2">
                {SIGN_PRODUCT_CONFIGS.map((product) => <button key={product.id} type="button" onClick={() => selectSignProductForBuilder(product.id)} className={`rounded-md border p-3 text-left ${signProductId === product.id ? 'border-[#1678b8] bg-[#eaf5fb] ring-1 ring-[#1678b8]/15' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><p className="text-sm font-bold">{product.name}</p><p className="mt-1 text-xs text-slate-500">{product.description}</p></button>)}
              </div>
              {selectedSignProduct.id === 'yard-sign' ? <div className="rounded-md border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Preset sizes</p>
                  <span className="rounded bg-green-100 px-2 py-1 text-xs font-bold text-green-700">{coroSheetLayout.signsPerSheet} / sheet</span>
                </div>
                <button type="button" className="mt-3 w-full rounded-md bg-[#1678b8] px-3 py-2 text-xs font-bold text-white hover:bg-[#0f5f94]">Switch to Custom Cut</button>
                <input value={coroSizeSearch} onChange={(event) => setCoroSizeSearch(event.target.value)} placeholder="Search sizes" className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#1678b8] focus:ring-2 focus:ring-[#1678b8]/15" />
                <div className="mt-2 max-h-52 space-y-1 overflow-y-auto pr-1">
                  {filteredCoroSizeOptions.map((option) => {
                    const parsed = parseCoroSize(option.value);
                    const layout = getCoroSheetLayout(parsed.width, parsed.height, designerQuantity);
                    const selected = String(signValues.size || '') === option.value;
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

        <section className={`${isProductionBuilder ? 'h-full border-0 bg-transparent shadow-none' : 'rounded-lg border border-white/80 bg-white/88 shadow-[0_18px_48px_rgba(7,17,31,0.08)] backdrop-blur xl:sticky xl:top-4 xl:min-h-[calc(100vh-8rem)]'}`}>
          <div className={`flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 ${isProductionBuilder ? 'hidden' : ''}`}>
            <button onClick={() => restoreHistory(-1)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">Undo</button>
            <button onClick={() => restoreHistory(1)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">Redo</button>
            <div className="ml-auto flex items-center rounded-md border border-slate-300 bg-white">
              <button aria-label="Zoom out" onClick={() => { const next = Math.max(0.5, zoom - 0.1); setZoom(next); fabricCanvasRef.current?.setZoom(next); }} className="px-3 py-2 text-sm font-semibold">-</button>
              <span className="min-w-14 border-x border-slate-200 px-2 text-center text-sm">{Math.round(zoom * 100)}%</span>
              <button aria-label="Zoom in" onClick={() => { const next = Math.min(2, zoom + 0.1); setZoom(next); fabricCanvasRef.current?.setZoom(next); }} className="px-3 py-2 text-sm font-semibold">+</button>
            </div>
          </div>

          <div className={`grid gap-3 ${isProductionBuilder ? 'h-full p-0' : 'p-3'} ${productMode === 'signage' ? '' : 'lg:grid-cols-[minmax(0,1fr)_210px]'}`}>
            <div className={`relative flex items-center justify-center ${isProductionBuilder ? 'coro-hex-bg h-full rounded-none p-0' : 'rounded-lg p-4'} ${productMode === 'signage' ? `${isProductionBuilder ? '' : 'min-h-[660px] bg-[linear-gradient(#e5e7eb_1px,transparent_1px),linear-gradient(90deg,#e5e7eb_1px,transparent_1px)] bg-[size:24px_24px]'} overflow-hidden bg-[#202224]` : 'min-h-[520px] overflow-hidden bg-[#e2e7ed]'}`}>
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
              {productMode === 'signage' ? <div className={`absolute z-10 grid items-start gap-3 text-slate-700 ${isProductionBuilder ? `${activeCoroOptionPanel === 'images' ? 'left-[380px]' : 'left-[8vw]'} right-[6vw] top-7 lg:grid-cols-[minmax(220px,1fr)_minmax(360px,520px)_minmax(190px,250px)]` : 'inset-x-6 top-4 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1.1fr)_minmax(160px,0.6fr)_160px]'}`}>
                <div className={`flex items-start gap-3 ${isProductionBuilder ? 'max-w-sm rounded-xl border border-white/10 bg-[#06111d]/54 px-4 py-3 shadow-[0_0_38px_rgba(14,165,233,0.12)] backdrop-blur' : ''}`}>
                  <div className={`${isProductionBuilder ? 'hidden' : 'hidden h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 border-[#1678b8] bg-[#05090b] sm:block'}`}><img src="/brand/hue-graphics-mark.png" alt="Hue Graphics" className="h-full w-full object-cover" /></div>
                  <div>
                    <p className={`${isProductionBuilder ? 'hidden' : 'text-[10px] font-black uppercase tracking-[0.22em] text-[#1678b8]'}`}>Hue Production Builder</p>
                    <p className={`${isProductionBuilder ? 'text-3xl font-normal tracking-tight text-white' : 'text-2xl font-black tracking-tight text-slate-950'}`}>{selectedSignProduct.id === 'vehicle-magnet' ? magnetDisplayName : isBannerBuilder ? bannerDisplayName : selectedSignProduct.name}</p>
                    <p className={`mt-1 text-xs ${isProductionBuilder ? 'text-slate-300' : 'text-slate-500'}`}>{selectedSignProduct.id === 'vehicle-magnet' ? magnetDisplayName : isBannerBuilder ? bannerDisplayName : selectedSignProduct.name} {selectedSignProduct.id === 'vehicle-magnet' ? '' : isBannerBuilder ? selectedBannerMaterial?.label : String(signValues.material || '4mm')} {String(signValues.sides || 'single') === 'double' || String(signValues.material || '').includes('double') ? 'Double Sided' : 'Single Sided'} , {signWidth || 0}&quot; x {signHeight || 0}&quot;</p>
                  </div>
                </div>
                <div className={`text-xs ${isProductionBuilder ? 'rounded-xl border border-[#0ea5e9]/35 bg-[#06111d]/90 px-6 py-4 text-slate-300 shadow-[0_0_42px_rgba(22,120,184,0.24)] backdrop-blur lg:col-start-2 lg:row-start-1' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={`font-black uppercase tracking-[0.18em] ${isProductionBuilder ? 'text-[#62d4ff]' : 'text-slate-500'}`}>Hue Production Summary</p>
                    {isProductionBuilder ? <span className="rounded-full border border-[#0ea5e9]/35 bg-[#0b263d] px-2.5 py-1 text-[10px] font-black uppercase text-[#9be6ff]">{hueQualityStatus}</span> : null}
                  </div>
                  <div className={`mt-3 grid gap-x-5 gap-y-1 ${isProductionBuilder ? 'grid-cols-[90px_1fr_1fr] text-center' : 'grid-cols-2'}`}>
                    {isCoroBuilder ? <>
                      <span />
                      <span className="font-bold text-slate-100">Sheet Price</span>
                      <span className="font-bold text-slate-100">Single Sign</span>
                      <span>{String(signValues.material || '4mm')}</span>
                      <span>{coroPricingIsLoaded && signPricePerSheet !== null ? `${formatSignPrice(signPricePerSheet, coroPricingCurrency)} / sheet` : isSignEstimateLoading ? 'Loading...' : 'Run pricing'}</span>
                      <span>{coroPricingIsLoaded && coroPricePerSign !== null ? `${formatSignPrice(coroPricePerSign, coroPricingCurrency)} / each` : isSignEstimateLoading ? 'Loading...' : 'Run pricing'}</span>
                      <span>Full sheet</span>
                      <span>{coroPricePerFullSheet !== null ? `${formatSignPrice(coroPricePerFullSheet, coroPricingCurrency)} if filled` : '-'}</span>
                      <span>{coroSheetLayout.signsPerSheet} signs max</span>
                    </> : isBannerBuilder ? <>
                      <span />
                      <span className="font-bold text-slate-100">Banner Price</span>
                      <span className="font-bold text-slate-100">Single Banner</span>
                      <span>{selectedBannerMaterial?.label || String(signValues.material || 'standard')}</span>
                      <span>{signRetailTotal !== null ? `${formatSignPrice(signRetailTotal, signEstimate?.currency)} total` : isSignEstimateLoading ? 'Loading...' : 'Run pricing'}</span>
                      <span>{signEachTotal !== null ? `${formatSignPrice(signEachTotal, signEstimate?.currency)} each` : isSignEstimateLoading ? 'Loading...' : 'Run pricing'}</span>
                      <span>{bannerSquareFeet.toFixed(1)} sqft</span>
                      <span>Grommets included</span>
                      <span>{signValues.windSlits ? '+ $10 wind slits' : 'Standard finishing'}</span>
                    </> : <>
                      <span>Single-Sided</span><span>Double-Sided</span>
                      <span>{isBannerBuilder ? selectedBannerMaterial?.label || String(signValues.material || 'standard') : `${String(signValues.material || '4mm')} CORO`}</span><span>{selectedSignProduct.id === 'yard-sign' ? 'Priced per sheet' : String(signValues.sides || 'single') === 'double' ? 'Enabled' : 'Optional'}</span>
                    </>}
                  </div>
                  {isProductionBuilder ? <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                    <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1">Hue API pricing</span>
                    <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1">{hueOrderPathLabel}</span>
                  </div> : null}
                </div>
                <div className={`text-right ${isProductionBuilder ? 'rounded-xl border border-[#22c55e]/25 bg-[#06111d]/78 px-6 py-4 shadow-[0_0_34px_rgba(34,197,94,0.12)] backdrop-blur lg:col-start-3 lg:row-start-1' : ''}`}>
                  {isProductionBuilder ? <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7dd3fc]">Ready total</p> : null}
                  <p className={`${isProductionBuilder ? 'text-4xl' : 'text-2xl'} font-semibold text-green-500`}>{selectedSignProduct.id === 'yard-sign' && signPricePerSheet !== null ? formatSignPrice(signPricePerSheet, coroPricingCurrency) : isSignEstimateLoading ? '...' : signRetailTotal !== null ? formatSignPrice(signRetailTotal, signEstimate?.currency) : '$0.00'}</p>
                  <p className={`text-sm ${isProductionBuilder ? 'text-slate-100' : 'text-slate-500'}`}>{selectedSignProduct.id === 'yard-sign' ? `${coroSheetLayout.sheetCount} sheet${coroSheetLayout.sheetCount === 1 ? '' : 's'} / ${coroSheetLayout.signsPerSheet} per sheet` : `${bannerSquareFeet > 0 ? `${bannerSquareFeet.toFixed(1)} sqft` : '0 sqft'} / Production estimate`}</p>
                  {isCoroBuilder && coroPricePerSign !== null ? <p className="mt-1 text-xs text-slate-300">{formatSignPrice(coroPricePerSign, coroPricingCurrency)} each / {formatSignPrice(signRetailTotal ?? undefined, coroPricingCurrency)} total</p> : null}
                  {isBannerBuilder && signEachTotal !== null ? <p className="mt-1 text-xs text-slate-300">{formatSignPrice(signEachTotal, signEstimate?.currency)} each / {formatSignPrice(signRetailTotal ?? undefined, signEstimate?.currency)} total</p> : null}
                  {hasCoroSheetWarning ? <button type="button" onClick={() => setShowCoroSheetWarning(true)} className="mt-3 rounded bg-red-600 px-3 py-1.5 text-xs font-black text-white shadow-[0_10px_24px_rgba(220,38,38,0.24)] hover:bg-red-500">{(hasCoroUnusedSheetSpace ? 1 : 0) + (hasCoroAspectMismatch ? 1 : 0)} warning{(hasCoroUnusedSheetSpace ? 1 : 0) + (hasCoroAspectMismatch ? 1 : 0) === 1 ? '' : 's'}</button> : null}
                  {isProductionBuilder ? <button type="button" onClick={canAddCurrentDesignToCart ? handleAddCurrentDesignToCart : requestSignEstimate} disabled={isSignEstimateLoading} className="mt-3 w-full rounded border border-[#22c55e]/40 bg-[#22c55e] px-4 py-2.5 text-xs font-black uppercase text-white shadow-[0_0_24px_rgba(34,197,94,0.20)] hover:bg-[#16a34a] disabled:cursor-wait disabled:opacity-60">{isSignEstimateLoading ? 'Pricing...' : canAddCurrentDesignToCart ? 'Add To Cart' : signEstimate ? 'Check Artwork' : 'Run Pricing'}</button> : null}
                </div>
                <button type="button" onClick={requestSignEstimate} disabled={isSignEstimateLoading} className={`${isProductionBuilder ? 'hidden' : 'min-h-14'} bg-[#1678b8] px-4 text-sm font-bold uppercase text-white hover:bg-[#0f5f94] disabled:cursor-wait disabled:opacity-70`}>{isSignEstimateLoading ? 'Pricing...' : signEstimate ? 'Update Price' : 'Price It'}</button>
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
              <div id="design-canvas" className={`${isProductionBuilder ? `absolute inset-x-0 mx-auto w-full ${isCoroBuilder ? 'bottom-32 top-56' : 'bottom-20 top-60'}` : 'relative w-full'} ${productMode === 'signage' ? `${isProductionBuilder ? 'max-w-none' : 'mt-24 aspect-[4/3] max-w-[1040px]'}` : productMode === 'apparel' ? 'aspect-[420/520] max-w-[860px]' : 'aspect-[420/520] max-w-[760px]'}`}>
                {productMode === 'signage' ? <div className="absolute inset-0 flex items-center justify-center">
                  {selectedSignProduct.id === 'yard-sign' ? <div className={`relative flex w-full items-center justify-center ${activeCoroOptionPanel === 'images' ? 'pl-[360px]' : ''}`}>
                    {coroSheetPreviews.length > 1 ? <button type="button" onClick={() => setActiveCoroSheetIndex((current) => Math.max(0, current - 1))} disabled={activeCoroSheetIndex === 0} className={`${activeCoroOptionPanel === 'images' ? 'left-[370px]' : 'left-8'} absolute z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/55 text-2xl font-black text-white shadow-[0_0_24px_rgba(14,165,233,0.22)] backdrop-blur hover:bg-[#0b263d] disabled:cursor-not-allowed disabled:opacity-35`}>‹</button> : null}
                    <div className={`flex items-center gap-14 overflow-x-auto px-8 pb-24 pt-10 ${activeCoroOptionPanel === 'images' ? 'max-w-[calc(100vw-540px)]' : 'max-w-[74vw]'}`}>
                    {coroSheetPreviews.map((sheetPreview, sheetIndex) => {
                      const selectedSheet = sheetIndex === activeCoroSheetIndex;
                      return <div key={sheetPreview.sheetNumber} onClick={() => setActiveCoroSheetIndex(sheetIndex)} className={`relative flex shrink-0 cursor-pointer items-center justify-center transition ${selectedSheet ? 'z-10 scale-105' : 'opacity-80 hover:opacity-100'} ${activeCoroOptionPanel === 'images' ? 'w-[min(13vw,20vh)] min-w-32 max-w-[210px]' : coroSheetPreviews.length > 1 ? 'w-[min(13vw,21vh)] min-w-36 max-w-[220px]' : 'w-[min(16vw,23vh)] min-w-36 max-w-[250px]'}`} style={{ aspectRatio: CORO_SHEET.width / CORO_SHEET.height }}>
                      <div className="absolute -top-12 left-1/2 flex w-max -translate-x-1/2 flex-col items-center gap-1 text-center">
                        <span className="text-sm font-black text-slate-100 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">{sheetPreview.quantity} sign{sheetPreview.quantity === 1 ? '' : 's'} / Hue Sheet Map</span>
                        {selectedSheet ? <span className="rounded-full border border-[#0ea5e9]/35 bg-[#06111d]/85 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-[#9be6ff] shadow-[0_0_18px_rgba(14,165,233,0.22)]">Fit / sheet / price check</span> : null}
                      </div>
                      <div className="absolute -bottom-8 left-0 right-0 text-center text-xs text-slate-300">Sheet #{sheetPreview.sheetNumber} / 48&quot; x 96&quot; / {coroSheetViewSide === 'back' ? 'Back Side' : 'Front Side'}</div>
                      {hasCoroDoubleSided ? <div className="absolute -bottom-16 left-1/2 flex -translate-x-1/2 overflow-hidden rounded border border-white/20 bg-black/45 text-[10px] font-black uppercase text-slate-200 backdrop-blur">
                        <button type="button" onClick={() => setCoroSheetViewSide('front')} className={`px-3 py-1 ${coroSheetViewSide === 'front' ? 'bg-[#0ea5e9] text-white' : 'hover:bg-white/10'}`}>Front</button>
                        <button type="button" onClick={() => setCoroSheetViewSide('back')} className={`border-l border-white/15 px-3 py-1 ${coroSheetViewSide === 'back' ? 'bg-[#0ea5e9] text-white' : 'hover:bg-white/10'}`}>Back</button>
                      </div> : null}
                      <div className="absolute -left-8 bottom-0 top-0 text-xs text-slate-300"><span className="absolute left-[-10px] top-1/2 -translate-y-1/2 -rotate-90 bg-[#050b12]/80 px-2">Left</span></div>
                      <div className="absolute -right-8 bottom-0 top-0 text-xs text-slate-300"><span className="absolute right-[-12px] top-1/2 -translate-y-1/2 rotate-90 bg-[#050b12]/80 px-2">Right</span></div>
                      <button type="button" onClick={() => { setActiveCoroSheetIndex(sheetIndex); if (!hasCoroSheetArtwork) setShowImageZone(true); }} className={`absolute inset-0 border bg-white text-left shadow-[0_24px_55px_rgba(0,0,0,0.50),0_0_42px_rgba(96,165,250,0.22)] ${selectedSheet ? 'border-[#0ea5e9] ring-4 ring-[#0ea5e9]/35' : 'border-white'}`}>
                        {isCustomCoro && customCoroSheetPreviews.length > 0 ? <div className="relative h-full w-full overflow-hidden bg-[repeating-linear-gradient(90deg,#f8fafc_0,#f8fafc_6px,#e2e8f0_6px,#e2e8f0_7px)] p-1">
                          {(sheetPreview.cells as { item: ImageZoneItem; x: number; y: number; width: number; height: number }[]).map((cell, index) => {
                            const cellImage = coroSheetViewSide === 'back' ? cell.item.backDataUrl || null : cell.item.dataUrl || signArtworkPreviewUrl;
                            const cellFitState = coroSheetViewSide === 'back' ? cell.item.backFitState : cell.item.frontFitState;
                            return <div key={`${cell.item.id}-${index}`} className="absolute flex items-center justify-center overflow-hidden border border-dashed border-[#94a3b8] bg-white" style={{ left: `${(cell.x / CORO_SHEET.width) * 100}%`, top: `${(cell.y / CORO_SHEET.height) * 100}%`, width: `${(cell.width / CORO_SHEET.width) * 100}%`, height: `${(cell.height / CORO_SHEET.height) * 100}%` }}>{cellImage ? <img src={cellImage} alt="" className={`h-full w-full ${cellFitState === 'fit' ? 'object-contain' : 'object-fill'}`} /> : <span className="px-1 text-center text-[9px] font-black uppercase italic leading-tight text-slate-400">add art</span>}</div>;
                          })}
                        </div> : <div className="grid h-full w-full gap-[2px] p-1" style={{ gridTemplateColumns: `repeat(${coroSheetLayout.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${coroSheetLayout.rows}, minmax(0, 1fr))` }}>
                          {Array.from({ length: coroSheetLayout.signsPerSheet }).map((_, index) => {
                            const shouldFillCell = index < sheetPreview.quantity;
                            const sheetItem = shouldFillCell ? sheetPreview.cells[index] as ImageZoneItem | undefined : null;
                            const cellImage = coroSheetViewSide === 'back' ? sheetItem?.backDataUrl || null : sheetItem?.dataUrl || signArtworkPreviewUrl;
                            const cellFitState = coroSheetViewSide === 'back' ? sheetItem?.backFitState : sheetItem?.frontFitState;
                            return <div key={index} className="relative flex items-center justify-center overflow-hidden border border-dashed border-[#94a3b8] bg-[repeating-linear-gradient(90deg,#f8fafc_0,#f8fafc_6px,#e2e8f0_6px,#e2e8f0_7px)]">{shouldFillCell && cellImage ? <img src={cellImage} alt="" className={`h-full w-full ${cellFitState === 'fit' ? 'object-contain' : 'object-fill'}`} /> : <span className="px-1 text-center text-[9px] font-black uppercase italic leading-tight text-slate-400">{shouldFillCell ? 'add art' : ''}</span>}</div>;
                          })}
                        </div>}
                      </button>
                    </div>;
                    })}
                    </div>
                    {coroSheetPreviews.length > 1 ? <button type="button" onClick={() => setActiveCoroSheetIndex((current) => Math.min(coroSheetPreviews.length - 1, current + 1))} disabled={activeCoroSheetIndex >= coroSheetPreviews.length - 1} className="absolute right-8 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/55 text-2xl font-black text-white shadow-[0_0_24px_rgba(14,165,233,0.22)] backdrop-blur hover:bg-[#0b263d] disabled:cursor-not-allowed disabled:opacity-35">›</button> : null}
                    {!hasCoroSheetArtwork && layers.length === 0 ? <button type="button" onClick={() => setShowImageZone(true)} className="absolute z-10 rounded bg-[#1678b8] px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-[#0f5f94]">Upload artwork</button> : null}
                  </div> : <div className={`relative flex items-center justify-center ${isBannerBuilder && activeCoroOptionPanel === 'images' ? 'ml-[360px]' : ''} ${isBannerBuilder ? activeCoroOptionPanel === 'images' ? 'w-[min(44vw,760px)] max-h-[48vh]' : 'w-[min(50vw,900px)] max-h-[50vh]' : 'w-[82%]'}`} style={{ aspectRatio: signPreviewAspect }}>
                    <div className={`absolute -top-8 left-0 right-0 border-t text-center text-xs ${isBannerBuilder ? 'border-slate-500 text-slate-300' : 'border-slate-300 text-slate-500'}`}><span className={isBannerBuilder ? 'bg-[#07111f]/90 px-2' : 'bg-white/80 px-2'}>{signWidth || 0}&quot;</span></div>
                    <div className={`absolute -bottom-9 left-0 right-0 text-center text-xs ${isBannerBuilder ? 'text-slate-300' : 'text-slate-500'}`}>Front Side</div>
                    <div className={`absolute -left-9 bottom-0 top-0 border-l text-xs ${isBannerBuilder ? 'border-slate-500 text-slate-300' : 'border-slate-300 text-slate-500'}`}><span className={`absolute left-[-12px] top-1/2 -translate-y-1/2 -rotate-90 px-2 ${isBannerBuilder ? 'bg-[#07111f]/90' : 'bg-white/80'}`}>{signHeight || 0}&quot;</span></div>
                    <div className={`absolute -right-9 bottom-0 top-0 border-r text-xs ${isBannerBuilder ? 'border-slate-500 text-slate-300' : 'border-slate-300 text-slate-500'}`}><span className={`absolute right-[-12px] top-1/2 -translate-y-1/2 rotate-90 px-2 ${isBannerBuilder ? 'bg-[#07111f]/90' : 'bg-white/80'}`}>{signHeight || 0}&quot;</span></div>
                    <div className="absolute inset-0 rounded-sm border border-slate-300 bg-white shadow-[0_24px_58px_rgba(0,0,0,0.45),0_0_44px_rgba(96,165,250,0.18)]">
                      <div className="absolute inset-3 border border-dashed border-slate-300" />
                      {signArtworkPreviewUrl ? <img src={signArtworkPreviewUrl} alt="" className={`absolute inset-0 h-full w-full ${bannerArtworkFitState === 'fit' ? 'object-contain' : 'object-fill'}`} /> : null}
                      <div className="absolute inset-1">{[0, 1, 2, 3, 4, 5].map((dot) => <span key={dot} className={`absolute h-2 w-2 rounded-full border border-slate-500 bg-white ${dot === 0 ? 'left-0 top-0' : dot === 1 ? 'right-0 top-0' : dot === 2 ? 'bottom-0 left-0' : dot === 3 ? 'bottom-0 right-0' : dot === 4 ? 'left-1/2 top-0 -translate-x-1/2' : 'bottom-0 left-1/2 -translate-x-1/2'}`} />)}</div>
                    </div>
                    {layers.length === 0 ? <button type="button" onClick={() => setShowImageZone(true)} className="relative z-10 rounded bg-[#1678b8] px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-[#0f5f94]">Upload artwork</button> : null}
                  </div>}
                </div> : hasPreviewImage && resolvedImageUrl ? <img src={resolvedImageUrl} alt={`${selectedPreview?.productName || 'Selected product'} ${selectedPreview?.colorName || ''}`} className="h-full w-full rounded-md object-contain" /> : <TshirtShape color={shirtColor} bodyPath={selectedProduct.mockups[shirtView]} view={shirtView} />}
                {productMode === 'apparel' && showPrintArtboard ? <div className="pointer-events-none absolute rounded-md border border-dashed border-[#1678b8]/60 bg-[#1678b8]/10 shadow-[0_0_0_9999px_rgba(255,255,255,0.04)]" style={{ top: `${artboardPercent.top}%`, left: `${artboardPercent.left}%`, width: `${artboardPercent.width}%`, height: `${artboardPercent.height}%` }}><span className="absolute -top-7 left-0 rounded bg-[#1678b8] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">{PRINT_AREA_CONFIG[printLocation].label}</span></div> : null}
                <div className={`designer-fabric-layer absolute ${productMode === 'signage' ? selectedSignProduct.id === 'yard-sign' ? 'pointer-events-none left-1/2 top-1/2 w-[23%] min-w-56 max-w-[360px] -translate-x-1/2 -translate-y-1/2 opacity-0' : `left-1/2 top-1/2 ${isBannerBuilder && activeCoroOptionPanel === 'images' ? 'ml-[180px]' : ''} ${isBannerBuilder ? activeCoroOptionPanel === 'images' ? 'w-[min(44vw,760px)] max-h-[48vh]' : 'w-[min(50vw,900px)] max-h-[50vh]' : 'w-[82%]'} -translate-x-1/2 -translate-y-1/2` : 'inset-0'}`} style={productMode === 'signage' ? { aspectRatio: signPreviewAspect } : undefined}><canvas ref={canvasElRef} className="h-full w-full touch-none" /></div>
              </div>
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
              </div> : null}
              {isBannerBuilder && activeCoroOptionPanel === 'images' ? <aside className="absolute bottom-20 left-4 top-20 z-20 w-[min(330px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-[#0ea5e9]/25 bg-[#f8fbff] p-3 text-slate-950 shadow-[0_24px_70px_rgba(0,0,0,0.45),0_0_34px_rgba(14,165,233,0.16)]">
                <div className="mb-3 rounded-lg border border-[#0ea5e9]/20 bg-[#06111d] px-3 py-2 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#62d4ff]">Hue Artwork Queue</p>
                  <p className="mt-1 text-xs text-slate-300">Banner sets for this order</p>
                </div>
                {bannerOrderItems.length > 0 ? <div className="mb-3 space-y-3">
                  {bannerOrderItems.map((item, index) => {
                    const itemMismatch = item.dataUrl ? aspectRatioMismatch(item.artworkSize?.width, item.artworkSize?.height, item.width, item.height) && item.fitState === 'unresolved' : true;
                    return <button key={item.id} type="button" onClick={async () => { await loadBannerOrderItem(item); }} className={`w-full rounded p-3 text-left ${itemMismatch ? 'bg-red-100' : 'bg-green-100'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className={`text-base font-black uppercase leading-tight ${itemMismatch ? 'text-red-600' : 'text-green-700'}`}>Artwork Set #{index + 1} / {itemMismatch ? 'Needs Fit Check' : 'Print Ready'}</h3>
                          <p className="mt-1 text-xs text-slate-700">width: <span className="font-bold">{item.width}</span>&quot; &nbsp; height: <span className="font-bold">{item.height}</span>&quot; &nbsp; qty: <span className="font-bold">{item.quantity}</span></p>
                        </div>
                        <span onClick={(event) => { event.stopPropagation(); removeBannerOrderItem(item.id); }} className="rounded border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 hover:bg-slate-50">delete</span>
                      </div>
                      <div className="mt-3 flex min-h-24 items-center justify-center border border-slate-300 bg-white p-2 text-center text-[10px] uppercase text-slate-400">
                        {item.dataUrl ? <span className="w-full">
                          <img src={item.dataUrl} alt="" className={`mx-auto max-h-20 max-w-full ${item.fitState === 'stretch' ? 'object-fill' : 'object-contain'}`} />
                          <span className="mt-2 block font-bold text-slate-600">{item.name}</span>
                        </span> : <span>No image selected</span>}
                      </div>
                    </button>;
                  })}
                </div> : null}
                <div className={`rounded p-3 ${signArtworkStatusOk && !bannerAspectMismatch ? 'bg-green-100' : 'bg-red-100'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className={`text-base font-black uppercase leading-tight ${signArtworkStatusOk && !bannerAspectMismatch ? 'text-green-700' : 'text-red-600'}`}>Artwork Set #{bannerOrderItems.length + 1} / {signArtworkPreviewUrl ? bannerAspectMismatch ? 'Needs Fit Check' : 'Print Ready' : 'Needs Artwork'}</h3>
                      <div className="mt-2 grid grid-cols-[1fr_1fr_64px] gap-2 text-xs text-slate-700">
                        <label>width<input type="number" min={1} step="0.25" value={String(signValues.width ?? signWidth)} onChange={(event) => updateSignOption('width', event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                        <label>height<input type="number" min={1} step="0.25" value={String(signValues.height ?? signHeight)} onChange={(event) => updateSignOption('height', event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                        <label>qty<input type="number" min={1} step={1} value={String(signValues.quantity ?? designerQuantity)} onChange={(event) => updateSignOption('quantity', event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                      </div>
                    </div>
                    <button type="button" onClick={clearCurrentBannerArtwork} disabled={!signArtworkPreviewUrl && layers.length === 0} className="rounded border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45">delete</button>
                  </div>
                  <button type="button" onClick={() => setShowImageZone(true)} className="mt-3 flex min-h-28 w-full items-center justify-center border border-slate-300 bg-white p-2 text-center text-[10px] uppercase text-slate-400 hover:border-[#1678b8] hover:text-[#1678b8]">
                    {signArtworkPreviewUrl ? <span className="w-full">
                      <img src={signArtworkPreviewUrl} alt="" className="mx-auto max-h-24 max-w-full object-contain" />
                      <span className="mt-2 block font-bold text-slate-600">Front image</span>
                      <span className="mt-1 block text-slate-500">{bannerArtworkActualSize ? `Actual: ${bannerArtworkActualSize.width.toFixed(2)}" x ${bannerArtworkActualSize.height.toFixed(2)}"` : 'Artwork uploaded'}</span>
                    </span> : <span>Click here to upload or select image</span>}
                  </button>
                  {bannerAspectMismatch ? <p className="mt-2 rounded bg-red-600 px-2 py-2 text-center text-[10px] font-bold leading-4 text-white">Custom size differs from the artwork ratio. Use Fit to preserve proportion or Stretch to force {signWidth}&quot; x {signHeight}&quot;.</p> : null}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <button type="button" onClick={() => fitSelectedArtwork('contain')} disabled={!activeObject && !signArtworkPreviewUrl} className="rounded bg-[#1678b8] px-2 py-2 font-bold text-white hover:bg-[#0f5f94] disabled:cursor-not-allowed disabled:opacity-40">Fit</button>
                    <button type="button" onClick={centerSelectedArtwork} disabled={!activeObject} className="rounded border border-[#1678b8] bg-white px-2 py-2 font-bold text-[#1678b8] hover:bg-[#eaf5fb] disabled:cursor-not-allowed disabled:opacity-40">Center</button>
                    <button type="button" onClick={() => fitSelectedArtwork('stretch')} disabled={!activeObject && !signArtworkPreviewUrl} className="rounded border border-slate-300 bg-white px-2 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40">Stretch</button>
                    <button type="button" onClick={() => setShowImageZone(true)} className="rounded border border-slate-300 bg-white px-2 py-2 font-medium hover:bg-slate-50">Image Zone</button>
                  </div>
                </div>
                <button type="button" onClick={startAddBannerItem} className="mt-3 flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-[#0ea5e9]/35 bg-white text-sm font-black text-[#0f5f94] hover:border-[#1678b8] hover:bg-[#eef8ff]">+ Add Banner Set</button>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label htmlFor="artwork-upload-input" onClick={() => setImageLibraryStatus('Choose finished banner artwork.')} className="cursor-pointer rounded bg-[#1678b8] px-3 py-2 text-center text-xs font-black uppercase text-white hover:bg-[#0f5f94]">Upload File</label>
                  <button type="button" onClick={() => setShowImageZone(true)} className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase text-slate-700 hover:bg-slate-50">Library</button>
                </div>
                {imageLibraryStatus ? <p className="mt-3 rounded border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">{imageLibraryStatus}</p> : null}
                <button type="button" onClick={() => setActiveCoroOptionPanel(null)} className="mt-4 w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase text-slate-600 hover:bg-slate-50">Close Panel</button>
              </aside> : null}
              {isCoroBuilder && activeCoroOptionPanel === 'images' ? <aside className="absolute bottom-20 left-4 top-20 z-20 w-[min(330px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-[#0ea5e9]/25 bg-[#f8fbff] p-3 text-slate-950 shadow-[0_24px_70px_rgba(0,0,0,0.45),0_0_34px_rgba(14,165,233,0.16)]">
                <div className="mb-3 rounded-lg border border-[#0ea5e9]/20 bg-[#06111d] px-3 py-2 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#62d4ff]">Hue Artwork Queue</p>
                  <p className="mt-1 text-xs text-slate-300">Sheet artwork sets for this order</p>
                </div>
                {coroSheetArtworkItems.length > 0 ? <div className="space-y-3">
                  {coroSheetArtworkItems.map((item, index) => {
                    const itemQuantity = Math.max(1, Number(coroArtworkQuantities[item.id] || 1));
                    const itemSignWidth = isCustomCoro ? Number(item.signWidth || signWidth || 0) : signWidth;
                    const itemSignHeight = isCustomCoro ? Number(item.signHeight || signHeight || 0) : signHeight;
                    const frontActualSize = getFittedArtworkSize(item.width, item.height, itemSignWidth, itemSignHeight);
                    const backActualSize = getFittedArtworkSize(item.backWidth, item.backHeight, itemSignWidth, itemSignHeight);
                    const rawFrontMismatch = aspectRatioMismatch(item.width, item.height, itemSignWidth, itemSignHeight);
                    const rawBackMismatch = hasCoroDoubleSided && item.backDataUrl ? aspectRatioMismatch(item.backWidth, item.backHeight, itemSignWidth, itemSignHeight) : false;
                    const frontMismatch = rawFrontMismatch && item.frontFitState !== 'fit' && item.frontFitState !== 'stretch';
                    const backMismatch = rawBackMismatch && item.backFitState !== 'fit' && item.backFitState !== 'stretch';
                    const itemNeedsCheck = frontMismatch || backMismatch || (hasCoroDoubleSided && !item.backDataUrl);
                    const itemFirstCellIndex = coroSheetCells.findIndex((cell) => cell.id === item.id);
                    const customItemSheetIndex = customCoroSheetPreviews.findIndex((sheet) => sheet.cells.some((cell) => cell.item.id === item.id));
                    const itemSheetIndex = isCustomCoro && customItemSheetIndex >= 0 ? customItemSheetIndex : itemFirstCellIndex >= 0 ? Math.floor(itemFirstCellIndex / coroSheetLayout.signsPerSheet) : 0;
                    return <div key={item.id} onClick={() => setActiveCoroSheetIndex(itemSheetIndex)} className={`cursor-pointer rounded p-3 ${itemNeedsCheck ? 'bg-red-100' : 'bg-green-100'} ${itemSheetIndex === activeCoroSheetIndex ? 'ring-2 ring-[#1678b8]' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className={`text-base font-black uppercase leading-tight ${itemNeedsCheck ? 'text-red-600' : 'text-green-700'}`}>Artwork Set #{index + 1} / {itemNeedsCheck ? hasCoroDoubleSided && !item.backDataUrl ? 'Needs Back Art' : 'Needs Fit Check' : 'Print Ready'}</h3>
                          {isCustomCoro ? <div className="mt-2 space-y-2 text-xs text-slate-700">
                            <div className="grid grid-cols-[1fr_1fr_54px] gap-2">
                              <label>width<input type="number" min={0} step="0.25" value={String(itemSignWidth)} onChange={(event) => updateCoroArtworkSize(item.id, 'signWidth', event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                              <label>height<input type="number" min={0} step="0.25" value={String(itemSignHeight)} onChange={(event) => updateCoroArtworkSize(item.id, 'signHeight', event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                              <label>qty<input type="number" min={1} step={1} value={String(itemQuantity)} onChange={(event) => updateCoroArtworkQuantity(item.id, event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                            </div>
                            <div>
                              <span className="font-bold">Flute Direction:</span>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {[{ label: 'Auto', value: 'auto' }, { label: 'Horizontal', value: 'horizontal' }, { label: 'Vertical', value: 'vertical' }].map((option) => <label key={option.value} className="flex items-center gap-1"><input type="radio" name={`coro-flute-direction-${item.id}`} checked={String(item.fluteDirection || 'auto') === option.value} onChange={() => updateCoroArtworkFlute(item.id, option.value)} />{option.label}</label>)}
                              </div>
                            </div>
                          </div> : <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-700">
                            <span>width: <span className="font-bold">{itemSignWidth || 0}</span>&quot;</span>
                            <span>height: <span className="font-bold">{itemSignHeight || 0}</span>&quot;</span>
                            <label className="flex items-center gap-1">qty:
                              <input type="number" min={1} step={1} value={String(itemQuantity)} onChange={(event) => updateCoroArtworkQuantity(item.id, event.target.value)} className="h-6 w-14 rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" />
                            </label>
                          </p>}
                        </div>
                        <button type="button" onClick={() => removeCoroArtworkItem(item.id)} className="rounded border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 hover:bg-slate-50">delete</button>
                      </div>
                      <div className={`mt-3 grid gap-2 ${hasCoroDoubleSided ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <button type="button" onClick={() => chooseCoroSideImage(item.id, 'front')} className={`flex min-h-28 w-full items-center justify-center border bg-white p-2 text-center text-[10px] uppercase hover:border-[#1678b8] hover:text-[#1678b8] ${frontMismatch ? 'border-red-500 text-red-500' : 'border-slate-300 text-slate-400'}`}>
                          <span className="w-full">
                            <img src={item.dataUrl} alt="" className={`mx-auto max-h-20 max-w-full ${item.frontFitState === 'stretch' ? 'object-fill' : 'object-contain'}`} />
                            <span className="mt-2 block font-bold text-slate-600">Front image</span>
                            <span className="mt-1 block text-slate-500">Actual: {frontActualSize.width.toFixed(0)}&quot; x {frontActualSize.height.toFixed(0)}&quot;</span>
                          </span>
                        </button>
                        {hasCoroDoubleSided ? <button type="button" onClick={() => chooseCoroSideImage(item.id, 'back')} className={`flex min-h-28 w-full items-center justify-center border bg-white p-2 text-center text-[10px] uppercase hover:border-[#1678b8] hover:text-[#1678b8] ${!item.backDataUrl || backMismatch ? 'border-red-500 text-red-500' : 'border-slate-300 text-slate-400'}`}>
                          <span className="w-full">
                            {item.backDataUrl ? <img src={item.backDataUrl} alt="" className={`mx-auto max-h-20 max-w-full ${item.backFitState === 'stretch' ? 'object-fill' : 'object-contain'}`} /> : <span className="mx-auto flex h-20 max-w-full items-center justify-center bg-[repeating-linear-gradient(90deg,#f8fafc_0,#f8fafc_6px,#e2e8f0_6px,#e2e8f0_7px)] px-2 text-slate-400">Click here to select back image</span>}
                            <span className="mt-2 block font-bold text-slate-600">Back image</span>
                            <span className="mt-1 block text-slate-500">{item.backDataUrl ? `Actual: ${backActualSize.width.toFixed(0)}" x ${backActualSize.height.toFixed(0)}"` : 'No image selected'}</span>
                          </span>
                        </button> : null}
                      </div>
                      {hasCoroDoubleSided ? <button type="button" onClick={() => copyCoroFrontToBack(item.id)} className="mt-2 w-full rounded border border-[#1678b8]/30 bg-white px-2 py-2 text-xs font-bold text-[#1678b8] hover:bg-[#eaf5fb]">Copy Front Image To Back</button> : null}
                      <p className="mt-2 text-center text-[10px] font-bold text-slate-600">Starts on sheet #{itemSheetIndex + 1}</p>
                      {frontMismatch || backMismatch ? <p className="mt-2 rounded bg-red-600 px-2 py-2 text-center text-[10px] font-bold leading-4 text-white">Aspect ratio mismatch. Use Fit to preserve proportion or Stretch to force {itemSignWidth}&quot; x {itemSignHeight}&quot;.</p> : null}
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <button type="button" className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-400">Contour Cut</button>
                        <button type="button" className="rounded border border-slate-300 bg-white px-2 py-2">Color Matching</button>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <button type="button" onClick={() => resolveCoroArtworkFit(item.id, 'fit')} className="rounded bg-[#1678b8] px-2 py-2 font-bold text-white hover:bg-[#0f5f94]">Fit</button>
                        <button type="button" onClick={centerSelectedArtwork} disabled={!activeObject} className="rounded border border-[#1678b8] bg-white px-2 py-2 font-bold text-[#1678b8] hover:bg-[#eaf5fb] disabled:cursor-not-allowed disabled:opacity-40">Center</button>
                        <button type="button" onClick={() => resolveCoroArtworkFit(item.id, 'stretch')} className="rounded border border-slate-300 bg-white px-2 py-2 font-medium hover:bg-slate-50">Stretch</button>
                        <button type="button" onClick={() => setShowImageZone(true)} className="rounded border border-slate-300 bg-white px-2 py-2 font-medium hover:bg-slate-50">Image Zone</button>
                      </div>
                    </div>;
                  })}
                </div> : <div className="rounded bg-red-100 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-black uppercase leading-tight text-red-600">Artwork Set #1 / Needs Artwork</h3>
                      {isCustomCoro ? <div className="mt-2 space-y-2 text-xs text-slate-700">
                        <div className="grid grid-cols-[1fr_1fr_54px] gap-2">
                          <label>width<input type="number" min={0} step="0.25" value={String(signValues.width ?? 0)} onChange={(event) => updateSignOption('width', event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                          <label>height<input type="number" min={0} step="0.25" value={String(signValues.height ?? 0)} onChange={(event) => updateSignOption('height', event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                          <label>qty<input type="number" min={1} step={1} value={String(signValues.quantity ?? designerQuantity)} onChange={(event) => updateSignOption('quantity', event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                        </div>
                        <div>
                          <span className="font-bold">Flute Direction:</span>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {[{ label: 'Auto', value: 'auto' }, { label: 'Horizontal', value: 'horizontal' }, { label: 'Vertical', value: 'vertical' }].map((option) => <label key={option.value} className="flex items-center gap-1"><input type="radio" name="coro-flute-direction-new" checked={String(signValues.fluteDirection || 'auto') === option.value} onChange={() => updateSignOption('fluteDirection', option.value)} />{option.label}</label>)}
                          </div>
                        </div>
                      </div> : <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-700">
                        <span>width: <span className="font-bold">{signWidth || 0}</span>&quot;</span>
                        <span>height: <span className="font-bold">{signHeight || 0}</span>&quot;</span>
                        <label className="flex items-center gap-1">qty:
                          <input type="number" min={1} step={1} value={String(signValues.quantity ?? designerQuantity)} onChange={(event) => updateSignOption('quantity', event.target.value)} className="h-6 w-14 rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" />
                        </label>
                      </p>}
                    </div>
                    <button type="button" onClick={clearSignArtwork} disabled={!signArtworkPreviewUrl && layers.length === 0} className="rounded border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45">delete</button>
                  </div>
                  <div className={`mt-3 grid gap-2 ${hasCoroDoubleSided ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <label htmlFor="artwork-upload-input" onClick={() => { setCoroPlacementTarget({ itemId: null, side: 'front' }); setImageLibraryStatus('Choose an image or PDF artwork file for the front side.'); }} className="flex min-h-28 w-full cursor-pointer items-center justify-center border border-slate-300 bg-white p-2 text-center text-[10px] uppercase text-slate-400 hover:border-[#1678b8] hover:text-[#1678b8]">Click here to upload or select front image</label>
                    {hasCoroDoubleSided ? <button type="button" onClick={() => setImageLibraryStatus('Add the front image first, then choose or copy the back image.')} className="flex min-h-28 w-full items-center justify-center border border-red-300 bg-white p-2 text-center text-[10px] uppercase text-red-400 hover:border-[#1678b8] hover:text-[#1678b8]">Click here to select back image</button> : null}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <button type="button" className="rounded border border-slate-300 bg-white px-2 py-2 text-slate-400">Contour Cut</button>
                    <button type="button" className="rounded border border-slate-300 bg-white px-2 py-2">Color Matching</button>
                  </div>
                </div>}
                <button type="button" onClick={startAddCoroSign} className="mt-3 flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-[#0ea5e9]/35 bg-white text-sm font-black text-[#0f5f94] hover:border-[#1678b8] hover:bg-[#eef8ff]">+ Add Artwork Set</button>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label htmlFor="artwork-upload-input" onClick={() => setImageLibraryStatus('Choose an image or PDF artwork file.')} className="cursor-pointer rounded bg-[#1678b8] px-3 py-2 text-center text-xs font-black uppercase text-white hover:bg-[#0f5f94]">Upload File</label>
                  <button type="button" onClick={() => setShowImageZone(true)} className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase text-slate-700 hover:bg-slate-50">Library</button>
                </div>
                {imageLibraryStatus ? <p className="mt-3 rounded border border-slate-200 bg-white p-2 text-xs leading-5 text-slate-600">{isImageLibraryLoading ? 'Loading library... ' : ''}{imageLibraryStatus}</p> : null}
                <div className="mt-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Library Queue</p>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">{imageZoneItems.length}</span>
                  </div>
                  <div className="mt-2 max-h-60 space-y-2 overflow-y-auto pr-1">
                    {imageZoneItems.length === 0 ? <p className="rounded border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">Artwork saved for this session will show here.</p> : imageZoneItems.map((item) => {
                      const selected = selectedImageZoneId === item.id;
                      return <button key={item.id} type="button" onClick={async () => { await useImageZoneItem(item); }} className={`flex w-full items-center gap-3 rounded border bg-white p-2 text-left text-xs transition ${selected ? 'border-[#1678b8] ring-2 ring-[#1678b8]/20' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                        {item.mimeType?.startsWith('image/') || item.dataUrl.startsWith('data:image/') ? <img src={item.dataUrl} alt="" className="h-12 w-16 shrink-0 rounded border border-slate-200 object-contain" /> : <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[10px] font-black text-slate-500">PDF</span>}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold text-slate-800">{item.name}</span>
                          <span className="mt-1 block text-slate-500">{item.width} x {item.height}px</span>
                          <span className="mt-1 block text-slate-400">{item.source === 'supabase' ? 'Stored in Supabase' : 'Browser preview'}</span>
                        </span>
                        <span className="rounded bg-[#1678b8] px-2 py-1 font-black uppercase text-white">Use</span>
                      </button>;
                    })}
                  </div>
                </div>
                <button type="button" onClick={() => setActiveCoroOptionPanel(null)} className="mt-4 w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase text-slate-600 hover:bg-slate-50">Close Panel</button>
              </aside> : null}
              {isProductionBuilder && activeCoroOptionPanel && activeCoroOptionPanel !== 'images' ? <div className="absolute bottom-20 left-1/2 z-20 w-[min(760px,92vw)] -translate-x-1/2 rounded-lg border border-slate-600 bg-[#f8fafc] p-4 text-slate-950 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#1678b8]">{activeCoroOptionPanel === 'sides' ? 'Print Sides' : activeCoroOptionPanel === 'roundedCorners' ? 'Rounded Corners' : activeCoroOptionPanel}</p>
                    <h3 className="mt-1 text-lg font-black">{activeCoroOptionPanel === 'size' ? selectedSignProduct.id === 'vehicle-magnet' ? isCustomMagnet ? 'Custom Magnet Size' : 'Vehicle Magnet Size' : isCoroBuilder ? isCustomCoro ? 'Custom CORO Size' : 'Select CORO Size' : isBannerBuilder ? 'Banner Size' : 'Select Size' : activeCoroOptionPanel === 'material' ? 'Select Material' : activeCoroOptionPanel === 'sides' ? 'Select Print Sides' : activeCoroOptionPanel === 'stakes' ? 'Step Stakes' : activeCoroOptionPanel === 'webbing' ? 'Mesh Webbing' : activeCoroOptionPanel === 'roundedCorners' ? 'Rounded Corners' : 'Options'}</h3>
                  </div>
                  <button type="button" onClick={() => setActiveCoroOptionPanel(null)} className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-bold uppercase text-slate-600 hover:bg-slate-50">Close</button>
                </div>
                {activeCoroOptionPanel === 'size' && selectedSignProduct.id === 'vehicle-magnet' && isCustomMagnet ? <div className="mt-4 mx-auto max-w-sm overflow-hidden rounded border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-medium text-slate-600">Sign size</div>
                  <div className="grid gap-3 p-4 sm:grid-cols-2">
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Width inches<input type="number" min={0} step="0.25" value={String(signValues.width ?? 0)} onChange={(event) => updateSignOption('width', event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950" /></label>
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Height inches<input type="number" min={0} step="0.25" value={String(signValues.height ?? 0)} onChange={(event) => updateSignOption('height', event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950" /></label>
                  </div>
                </div> : null}
                {activeCoroOptionPanel === 'size' && selectedSignProduct.id === 'vehicle-magnet' && !isCustomMagnet ? <div className="mt-4 mx-auto grid max-w-sm overflow-hidden rounded border border-slate-200 bg-white">
                  {MAGNET_SIZE_OPTIONS.map((option) => {
                    const selected = String(signValues.size || '') === option.value;
                    return <button key={option.value} type="button" onClick={() => { updateSignOption('size', option.value); setActiveCoroOptionPanel(null); }} className={`border-b border-slate-100 px-4 py-3 text-center text-sm last:border-b-0 ${selected ? 'bg-[#1678b8] font-black text-white' : 'text-slate-700 hover:bg-slate-50'}`}>{option.label}</button>;
                  })}
                </div> : null}
                {activeCoroOptionPanel === 'size' && isBannerBuilder && selectedSignProduct.id !== 'vehicle-magnet' ? <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Width inches<input type="number" min={1} step="0.25" value={String(signValues.width ?? signWidth)} onChange={(event) => updateSignOption('width', event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950" /></label>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Height inches<input type="number" min={1} step="0.25" value={String(signValues.height ?? signHeight)} onChange={(event) => updateSignOption('height', event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950" /></label>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Quantity<input type="number" min={1} step={1} value={String(signValues.quantity ?? designerQuantity)} onChange={(event) => updateSignOption('quantity', event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950" /></label>
                  <p className="rounded bg-[#eaf5fb] px-3 py-2 text-xs leading-5 text-[#0f5f94] sm:col-span-3">Uploading artwork will auto-fill a starting banner size from the file pixels. You can override it here, then use Fit or Stretch in the Images panel.</p>
                </div> : null}
                {activeCoroOptionPanel === 'size' && isCoroBuilder ? <div className="mt-4 grid gap-4 lg:grid-cols-[240px_1fr]">
                  <div className="rounded border border-slate-200 bg-white p-3 text-center">
                    <p className="text-sm text-slate-700">Need custom sizes?</p>
                    <button type="button" onClick={() => { updateSignOption('size', 'custom'); setActiveCoroOptionPanel('images'); }} className="mt-2 rounded bg-[#1678b8] px-4 py-2 text-sm font-black text-white hover:bg-[#0f5f94]">{isCustomCoro ? 'Custom Cut On' : 'Switch to Custom Cut'}</button>
                    {isCustomCoro ? <p className="mt-4 border-t border-slate-200 pt-4 text-left text-xs leading-5 text-slate-600">Enter width, height, quantity, and flute direction in the Images panel. Each added sign can have its own custom size.</p> : null}
                  </div>
                  <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                    {CORO_SIZE_OPTIONS.map((option) => {
                      const parsed = parseCoroSize(option.value);
                      const layout = getCoroSheetLayout(parsed.width, parsed.height, designerQuantity);
                      const selected = String(signValues.size || '') === option.value;
                      return <button key={option.value} type="button" onClick={() => { updateSignOption('size', option.value); setActiveCoroOptionPanel(null); }} className={`rounded border px-3 py-3 text-left text-xs ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}><span className="block font-black">{option.label}</span><span className="mt-1 block text-slate-500">{layout.signsPerSheet} per sheet / {layout.sheetCount} sheet{layout.sheetCount === 1 ? '' : 's'}</span></button>;
                    })}
                  </div>
                </div> : null}
                {activeCoroOptionPanel === 'material' ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(isBannerBuilder ? bannerMaterialOptions.map((option) => ({ value: option.value, label: option.label, price: String('note' in option ? option.note : 'Priced by Hue API') })) : [{ value: '4mm', label: '4mm CORO', price: '$44.00 single / $55.00 double' }, { value: '10mm', label: '10mm CORO', price: '$70.00 single / $90.00 double' }]).map((option) => {
                    const selected = String(signValues.material || '4mm') === option.value;
                    return <button key={option.value} type="button" onClick={() => { updateSignOption('material', option.value); setActiveCoroOptionPanel(null); }} className={`rounded border px-4 py-4 text-left ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}><span className="block text-base font-black">{option.label}</span><span className="mt-1 block text-xs text-slate-500">{option.price}</span></button>;
                  })}
                </div> : null}
                {activeCoroOptionPanel === 'sides' ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[{ value: 'single', label: 'Single-Sided', note: 'Front side only' }, { value: 'double', label: 'Double-Sided', note: 'Front and back print' }].map((option) => {
                    const selected = String(signValues.sides || 'single') === option.value;
                    return <button key={option.value} type="button" onClick={() => updatePrintSides(option.value)} className={`rounded border px-4 py-4 text-left ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}><span className="block text-base font-black">{option.label}</span><span className="mt-1 block text-xs text-slate-500">{option.value === 'double' && isBannerBuilder ? '18oz material with front and back setup' : option.note}</span></button>;
                  })}
                </div> : null}
                {activeCoroOptionPanel === 'stakes' ? <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  {['0', '10', '25', '50'].map((count) => {
                    const selected = String(signValues.stepStakes || '0') === count;
                    return <button key={count} type="button" onClick={() => { updateSignOption('stepStakes', count); setActiveCoroOptionPanel(null); }} className={`rounded border px-4 py-4 text-center ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}><span className="block text-lg font-black">{count}</span><span className="mt-1 block text-xs text-slate-500">stakes</span></button>;
                  })}
                </div> : null}
                {activeCoroOptionPanel === 'webbing' ? <div className="mt-4 grid gap-4 sm:grid-cols-[1.15fr_1fr]">
                  <div className="rounded border border-[#b7d8ea] bg-[#eef8ff] px-4 py-4 text-sm leading-6 text-[#0f4262]">
                    <p className="font-black text-[#0f5f94]">Webbing adds extra reinforcement to the top and bottom welds.</p>
                    <p className="mt-2">We recommend webbing on mesh banners over 8ft. Pricing is sent through your Hue API rules with the rest of the mesh options.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[{ value: true, label: 'Yes' }, { value: false, label: 'No' }].map((option) => {
                      const selected = Boolean(signValues.webbing) === option.value;
                      return <button key={option.label} type="button" onClick={() => { updateSignOption('webbing', option.value); setActiveCoroOptionPanel(null); }} className={`rounded border px-4 py-4 text-center text-sm font-black uppercase ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}>{option.label}</button>;
                    })}
                  </div>
                </div> : null}
                {activeCoroOptionPanel === 'roundedCorners' ? <div className="mt-4 mx-auto grid max-w-xs overflow-hidden rounded border border-slate-200 bg-white">
                  {ROUNDED_CORNER_OPTIONS.map((option) => {
                    const selected = String(signValues.roundedCorners || 'none') === option.value;
                    return <button key={option.value} type="button" onClick={() => { updateSignOption('roundedCorners', option.value); setActiveCoroOptionPanel(null); }} className={`border-b border-slate-100 px-4 py-3 text-center text-sm last:border-b-0 ${selected ? 'bg-[#1678b8] font-black text-white' : 'text-slate-700 hover:bg-slate-50'}`}>{option.label}</button>;
                  })}
                </div> : null}
              </div> : null}
              {isProductionBuilder ? <div className="absolute bottom-6 left-8 z-20 flex items-center gap-3 text-xs text-slate-200">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/45 font-black shadow-[0_0_22px_rgba(14,165,233,0.18)]">N</div>
                <div className="flex h-8 items-center overflow-hidden rounded border border-white/15 bg-black/38 backdrop-blur">
                  <button type="button" onClick={() => { const next = Math.max(0.5, zoom - 0.1); setZoom(next); fabricCanvasRef.current?.setZoom(next); }} className="h-full px-3 text-slate-300 hover:bg-white/10">-</button>
                  <span className="border-x border-white/10 px-4 text-[#bce7ff]">{Math.round(zoom * 100)}%</span>
                  <button type="button" onClick={() => { const next = Math.min(2, zoom + 0.1); setZoom(next); fabricCanvasRef.current?.setZoom(next); }} className="h-full px-3 text-slate-300 hover:bg-white/10">+</button>
                </div>
              </div> : null}
              {productMode === 'signage' ? <div className={`absolute z-10 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase ${isProductionBuilder ? 'bottom-6 left-60 right-8 max-h-11 justify-end overflow-hidden' : 'inset-x-3 bottom-4 justify-center'}`}>
                {(selectedSignProduct.id === 'vehicle-magnet'
                  ? [
                      ['Images', String(bannerOrderItems.length + 1), signArtworkStatusOk],
                      ['Size', `${signWidth || 0}" x ${signHeight || 0}"`, signWidth > 0 && signHeight > 0],
                      ['Rounded Corners', selectedRoundedCornerOption.label, String(signValues.roundedCorners || 'none') !== 'none']
                    ] as [string, string, boolean][]
                  : [
                      ['Images', String(isBannerBuilder ? bannerOrderItems.length + 1 : coroSheetArtworkItems.length || layers.length || 1), signArtworkStatusOk],
                      ['Size', `${signWidth || 0}" x ${signHeight || 0}"`, signWidth > 0 && signHeight > 0],
                      ['Material', isBannerBuilder ? selectedBannerMaterial?.label || String(signValues.material || 'standard') : String(signValues.material || '4mm'), true],
                      ['Print Sides', String(signValues.sides || 'single'), true],
                      ...(selectedSignProduct.id === 'yard-sign'
                        ? [
                            ['Grommets', signValues.grommets ? 'Yes' : 'No', Boolean(signValues.grommets)],
                            ...(isCustomCoro ? [['Flutes', String(signValues.fluteDirection || 'auto'), String(signValues.fluteDirection || 'auto') !== 'auto']] as [string, string, boolean][] : []),
                            ['Step Stakes', String(signValues.stepStakes || '0'), Number(signValues.stepStakes || 0) > 0],
                            ['Gloss', signValues.gloss ? 'Yes' : 'No', Boolean(signValues.gloss)]
                          ] as [string, string, boolean][]
                        : [
                            ...(isMeshBanner
                              ? [
                                  ['Welding', signValues.welding ? 'Yes' : 'No', Boolean(signValues.welding)],
                                  ['Webbing', signValues.webbing ? 'Yes' : 'No', Boolean(signValues.webbing)],
                                  ['Rope', signValues.rope ? 'Yes' : 'None', Boolean(signValues.rope)],
                                  ['Grommets', signValues.grommets ? 'Yes' : 'No', Boolean(signValues.grommets)],
                                  ['Pole Pockets', signValues.polePocket ? 'Yes' : 'None', Boolean(signValues.polePocket)]
                                ]
                              : selectedSignProduct.id === 'banner' ? [
                                  ['Rope', signValues.rope ? 'Yes' : 'None', Boolean(signValues.rope)],
                                  ['Wind Slits', signValues.windSlits ? 'Yes' : 'No', Boolean(signValues.windSlits)]
                                ] : [
                                  ['Rush', signValues.rush ? 'Yes' : 'No', Boolean(signValues.rush)]
                                ]) as [string, string, boolean][]
                          ] as [string, string, boolean][])
                    ] as [string, string, boolean][]).map(([label, value, active]) => {
                  const isImagesTile = String(label) === 'Images';
                  const needsArtworkFit = isImagesTile && (layers.length > 0 || coroSheetArtworkItems.length > 0) && !signArtworkStatusOk;
                  const hueTileLabel = String(label) === 'Images' ? 'Artwork' : String(label) === 'Print Sides' ? 'Sides' : String(label) === 'Step Stakes' ? 'Stakes' : String(label) === 'Wind Slits' ? 'Slits' : String(label) === 'Rounded Corners' ? 'Corners' : String(label);
                  return <button type="button" onClick={() => handleCoroTileClick(String(label))} key={String(label)} className={`flex min-h-9 min-w-24 items-center justify-between gap-2 rounded-full border px-3 text-left shadow-sm backdrop-blur transition hover:-translate-y-0.5 ${isProductionBuilder ? needsArtworkFit ? 'border-red-500/80 bg-red-950/35 text-red-200 shadow-[0_0_20px_rgba(239,68,68,0.18)]' : active ? 'border-[#0ea5e9]/80 bg-[#06111d]/85 text-[#a9e9ff] shadow-[0_0_22px_rgba(14,165,233,0.22)]' : 'border-white/15 bg-[#06111d]/58 text-slate-400 hover:border-[#0ea5e9]/35 hover:text-slate-200' : needsArtworkFit ? 'border-red-500 text-red-600' : active ? 'border-[#1678b8] text-[#1678b8]' : 'border-slate-300 text-slate-400'}`}><span>{hueTileLabel}</span><span className={`rounded-full ${needsArtworkFit ? 'bg-red-500' : active ? 'bg-[#0ea5e9]' : 'bg-slate-600'} px-2.5 py-1 text-white`}>{value}</span></button>;
                })}
              </div> : null}
            </div>

            {productMode === 'apparel' ? <aside className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Layers</p><span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{layers.length}</span></div>
              <div className="mt-3 space-y-1">{layers.length === 0 ? <p className="rounded-md border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">No objects yet</p> : layers.map((layer) => <button key={layer.id} onClick={() => { const canvas = fabricCanvasRef.current; if (!canvas) return; const target = canvas.getObjects().find((obj) => (obj as FabricObject & { data?: { layerId?: string } }).data?.layerId === layer.id); if (!target) return; canvas.setActiveObject(target); canvas.requestRenderAll(); setActiveObject(target); refreshLayers(canvas); }} className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs ${layer.isActive ? 'bg-[#1678b8] text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}><span className="truncate">{layer.name}</span><span className="ml-2 shrink-0 opacity-70">{layer.type}</span></button>)}</div>
            </aside> : null}
          </div>
        </section>

        <aside id="design" className={`${isProductionBuilder ? 'hidden' : 'space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto'}`}>
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
                  <h2 className={`text-sm font-bold uppercase tracking-wide ${signArtworkStatusOk ? 'text-green-700' : 'text-red-600'}`}>Artwork Set #1 / {signArtworkStatusLabel}</h2>
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

      <section id="quote" className={`mx-auto max-w-[1800px] px-4 pb-6 md:px-6 ${isProductionBuilder ? 'hidden' : ''}`}>
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

      {showCoroSheetWarning ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#02070d]/75 p-4 backdrop-blur-md">
        <section className="w-[min(680px,92vw)] overflow-hidden rounded-xl border border-[#0ea5e9]/35 bg-[#07111f] text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.68),0_0_54px_rgba(14,165,233,0.20)]">
          <div className="border-b border-[#0ea5e9]/25 bg-[linear-gradient(90deg,#07111f,#0b263d,#07111f)] px-6 py-4 text-center">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#62d4ff]">Hue Production Check</p>
            <h3 className="mt-1 text-2xl font-black uppercase text-white">Sheet Space Warning</h3>
          </div>
          <div className="px-7 py-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-yellow-300/70 bg-yellow-300/15 text-xl font-black text-yellow-200 shadow-[0_0_28px_rgba(250,204,21,0.25)]">!</span>
            <p className="mt-5 text-sm text-slate-300">Please review the production checks for this sheet layout.</p>
            <div className="mx-auto mt-5 max-w-xl space-y-3 rounded-lg border border-white/10 bg-white/[0.04] px-5 py-4 text-left text-sm leading-6 text-slate-100">
              {hasCoroUnusedSheetSpace ? <p>There {coroUnusedSheetSpaces === 1 ? 'is' : 'are'} <span className="font-black text-yellow-200">{coroUnusedSheetSpaces}</span> unused sign space{coroUnusedSheetSpaces === 1 ? '' : 's'} available on the existing sheet{coroSheetLayout.sheetCount === 1 ? '' : 's'}. You may be able to add more signs without adding another sheet.</p> : null}
              {hasCoroAspectMismatch ? <p><span className="font-black text-yellow-200">Aspect ratio mismatch:</span> one or more images will be stretched to fit the selected {signWidth}&quot; x {signHeight}&quot; sign size. Review the preview before ordering.</p> : null}
            </div>
            <button type="button" onClick={() => setShowCoroSheetWarning(false)} className="mt-7 rounded border border-[#0ea5e9]/50 bg-[#0b263d] px-6 py-3 text-xs font-black uppercase tracking-wide text-white shadow-[0_0_22px_rgba(14,165,233,0.18)] hover:bg-[#103656]">Close</button>
          </div>
        </section>
      </div> : null}

      {showBannerDoubleSidedWarning ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#02070d]/75 p-4 backdrop-blur-md">
        <section className="w-[min(680px,92vw)] overflow-hidden rounded-xl border border-[#0ea5e9]/35 bg-[#07111f] text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.68),0_0_54px_rgba(14,165,233,0.20)]">
          <div className="border-b border-[#0ea5e9]/25 bg-[linear-gradient(90deg,#07111f,#0b263d,#07111f)] px-6 py-4 text-center">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#62d4ff]">Hue Production Check</p>
            <h3 className="mt-1 text-2xl font-black uppercase text-white">Double-Sided Banner</h3>
          </div>
          <div className="px-7 py-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-yellow-300/70 bg-yellow-300/15 text-xl font-black text-yellow-200 shadow-[0_0_28px_rgba(250,204,21,0.25)]">!</span>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-slate-200">Double-sided banners use 18oz material and need a 1.5 inch white border for welding. The builder will adjust the setup for that production requirement.</p>
            <button type="button" onClick={() => setShowBannerDoubleSidedWarning(false)} className="mt-7 rounded border border-[#0ea5e9]/50 bg-[#0b263d] px-6 py-3 text-xs font-black uppercase tracking-wide text-white shadow-[0_0_22px_rgba(14,165,233,0.18)] hover:bg-[#103656]">Close</button>
          </div>
        </section>
      </div> : null}

      {showCustomerLogin ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#02070d]/75 p-4 backdrop-blur-md">
        <section className="w-[min(520px,94vw)] overflow-hidden rounded-xl border border-[#0ea5e9]/35 bg-[#07111f] text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.68),0_0_54px_rgba(14,165,233,0.20)]">
          <div className="border-b border-[#0ea5e9]/25 bg-[linear-gradient(90deg,#07111f,#0b263d,#07111f)] px-6 py-5">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#62d4ff]">Hue Customer Account</p>
            <h3 className="mt-1 text-2xl font-black text-white">{customerSession ? 'Artwork Library' : customerAuthMode === 'signin' ? 'Sign In' : 'Create Account'}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">Create an account to keep artwork ready for reorders, or continue without an account for a quick checkout.</p>
          </div>
          <div className="space-y-4 px-6 py-6">
            {customerSession ? <div className="rounded-lg border border-[#0ea5e9]/25 bg-[#0b263d]/60 p-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#62d4ff]">Signed In</p>
              <p className="mt-2 break-all text-lg font-black text-white">{customerSession.user?.email || 'Customer account'}</p>
              <p className="mt-2 text-sm text-slate-300">Uploads save to this customer library when Supabase storage policies allow it.</p>
            </div> : <form onSubmit={(event) => { event.preventDefault(); void handleCustomerAuth(); }} className="space-y-3">
              <label className="block text-sm font-bold text-slate-200">Email
                <input type="email" value={customerAuthEmail} onChange={(event) => setCustomerAuthEmail(event.target.value)} className="mt-1 w-full rounded border border-white/15 bg-[#02070d] px-3 py-3 text-white outline-none ring-[#0ea5e9]/40 focus:ring-2" autoComplete="email" />
              </label>
              <label className="block text-sm font-bold text-slate-200">Password
                <input type="password" value={customerAuthPassword} onChange={(event) => setCustomerAuthPassword(event.target.value)} className="mt-1 w-full rounded border border-white/15 bg-[#02070d] px-3 py-3 text-white outline-none ring-[#0ea5e9]/40 focus:ring-2" autoComplete={customerAuthMode === 'signin' ? 'current-password' : 'new-password'} />
              </label>
              <button type="submit" disabled={isCustomerAuthLoading} className="w-full rounded border border-[#0ea5e9]/60 bg-[#1678b8] px-5 py-3 text-sm font-black uppercase text-white shadow-[0_0_22px_rgba(14,165,233,0.18)] hover:bg-[#0f5f94] disabled:cursor-wait disabled:opacity-60">{isCustomerAuthLoading ? 'Working...' : customerAuthMode === 'signin' ? 'Sign In' : 'Create Account'}</button>
            </form>}
            {customerAuthStatus ? <p className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300">{customerAuthStatus}</p> : null}
            <div className="flex flex-wrap gap-2">
              {!customerSession ? <button type="button" onClick={() => setCustomerAuthMode((current) => current === 'signin' ? 'signup' : 'signin')} className="flex-1 rounded border border-white/15 bg-[#0b1018] px-4 py-3 text-sm font-bold text-slate-100 hover:border-[#0ea5e9]/70">{customerAuthMode === 'signin' ? 'Create Account' : 'Sign In Instead'}</button> : null}
              <button type="button" onClick={handleGuestMode} className="flex-1 rounded border border-white/15 bg-[#0b1018] px-4 py-3 text-sm font-bold text-slate-100 hover:border-[#0ea5e9]/70">Continue Without Account</button>
              {customerSession ? <button type="button" onClick={() => { void handleCustomerSignOut(); }} className="flex-1 rounded border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100 hover:bg-red-500/20">Sign Out</button> : null}
              <button type="button" onClick={() => setShowCustomerLogin(false)} className="flex-1 rounded border border-[#0ea5e9]/50 bg-[#0b263d] px-4 py-3 text-sm font-black text-white hover:bg-[#103656]">Close</button>
            </div>
          </div>
        </section>
      </div> : null}

      {showCart ? <div className="fixed inset-0 z-50 flex justify-end bg-[#02070d]/70 backdrop-blur-sm">
        <section className="flex h-full w-[min(560px,96vw)] flex-col border-l border-[#0ea5e9]/30 bg-[#07111f] text-slate-100 shadow-[0_0_80px_rgba(0,0,0,0.55)]">
          <div className="border-b border-white/10 bg-[linear-gradient(90deg,#07111f,#0b263d)] px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#62d4ff]">Hue Cart</p>
                <h2 className="mt-1 text-2xl font-black text-white">Print-ready order</h2>
                <p className="mt-1 text-sm text-slate-300">{cartItems.length} item{cartItems.length === 1 ? '' : 's'} / {formatSignPrice(cartSubtotal, 'USD')} subtotal</p>
              </div>
              <button type="button" onClick={() => setShowCart(false)} className="rounded border border-white/15 bg-[#0b1018] px-3 py-2 text-xs font-black uppercase text-slate-100 hover:border-[#0ea5e9]/70">Close</button>
            </div>
            {cartStatus ? <p className="mt-3 rounded border border-[#0ea5e9]/20 bg-white/[0.04] px-3 py-2 text-xs leading-5 text-slate-300">{cartStatus}</p> : null}
            {testOrders[0] ? <p className="mt-2 text-xs text-slate-400">Latest test order: <span className="font-bold text-[#9be6ff]">{testOrders[0].orderNumber}</span></p> : null}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {cartItems.length === 0 ? <div className="rounded-xl border border-dashed border-white/20 bg-white/[0.04] p-6 text-center">
              <p className="text-lg font-black text-white">No cart items yet</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">Run pricing, make sure artwork is ready, then add the product to cart.</p>
            </div> : cartItems.map((item, index) => <article key={item.id} className="rounded-xl border border-white/12 bg-[#0b1018]/92 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#62d4ff]">Item {cartItems.length - index}</p>
                  <h3 className="mt-1 text-lg font-black text-white">{item.productName}</h3>
                  <p className="mt-1 text-sm text-slate-300">{item.sizeLabel} / Qty {item.quantity}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-green-400">{item.price.total !== null ? formatSignPrice(item.price.total, item.price.currency) : 'Needs price'}</p>
                  {item.price.each !== null ? <p className="text-xs text-slate-400">{formatSignPrice(item.price.each, item.price.currency)} each</p> : null}
                  {item.price.pricePerSheet !== undefined && item.price.pricePerSheet !== null ? <p className="text-xs text-slate-400">{formatSignPrice(item.price.pricePerSheet, item.price.currency)} / sheet</p> : null}
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
                <div className="rounded border border-white/10 bg-white/[0.04] p-3">
                  <p className="font-black uppercase tracking-[0.14em] text-slate-400">Options</p>
                  <div className="mt-2 space-y-1">
                    {item.optionSummary.map((line) => <p key={line}>{line}</p>)}
                  </div>
                </div>
                <div className="rounded border border-white/10 bg-white/[0.04] p-3">
                  <p className="font-black uppercase tracking-[0.14em] text-slate-400">Production</p>
                  <div className="mt-2 space-y-1">
                    {item.productionSummary.map((line) => <p key={line}>{line}</p>)}
                    <p>{item.customer.email || 'Quick checkout customer'}</p>
                  </div>
                </div>
              </div>
              <div className="mt-3 rounded border border-white/10 bg-white/[0.04] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Attached artwork</p>
                  <span className="rounded-full bg-[#0ea5e9]/20 px-2 py-0.5 text-xs font-bold text-[#9be6ff]">{item.artworkFiles.length}</span>
                </div>
                <div className="mt-2 space-y-2">
                  {item.artworkFiles.length === 0 ? <p className="text-xs text-amber-200">No artwork file is attached to this cart item yet.</p> : item.artworkFiles.map((file) => <div key={`${item.id}-${file.role}-${file.name}`} className="flex gap-3 rounded bg-[#02070d]/65 p-2 text-xs">
                    {file.previewUrl ? <img src={file.previewUrl} alt="" className="h-12 w-16 shrink-0 rounded border border-white/10 bg-white object-contain" /> : null}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-white">{file.role}</p>
                      <p className="truncate text-slate-300">{file.name}</p>
                      <p className="truncate text-slate-500">{file.storagePath || 'Browser preview only'}</p>
                    </div>
                  </div>)}
                </div>
              </div>
              <button type="button" onClick={() => setCartItems((prev) => prev.filter((entry) => entry.id !== item.id))} className="mt-3 rounded border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-bold uppercase text-red-100 hover:bg-red-500/20">Remove Item</button>
            </article>)}
          </div>
          <div className="border-t border-white/10 bg-[#050b12] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Subtotal</p>
                <p className="text-2xl font-black text-green-400">{formatSignPrice(cartSubtotal, 'USD')}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setCartItems([]); setCartStatus('Cart cleared.'); }} disabled={cartItems.length === 0} className="rounded border border-white/15 bg-[#0b1018] px-4 py-3 text-xs font-black uppercase text-slate-100 hover:border-red-400/60 disabled:cursor-not-allowed disabled:opacity-40">Clear</button>
                <button type="button" onClick={openTestCheckout} disabled={cartItems.length === 0} className="rounded bg-[#1678b8] px-4 py-3 text-xs font-black uppercase text-white shadow-[0_0_24px_rgba(14,165,233,0.20)] hover:bg-[#0f5f94] disabled:cursor-not-allowed disabled:opacity-40">Test Checkout</button>
              </div>
            </div>
          </div>
        </section>
      </div> : null}

      {showTestCheckout ? <div className="fixed inset-0 z-[55] flex items-center justify-center bg-[#02070d]/78 p-4 backdrop-blur-md">
        <section className="flex max-h-[92vh] w-[min(780px,96vw)] flex-col overflow-hidden rounded-2xl border border-[#0ea5e9]/35 bg-[#07111f] text-slate-100 shadow-[0_0_90px_rgba(14,165,233,0.22)]">
          <div className="border-b border-white/10 bg-[linear-gradient(135deg,#07111f,#0b263d_58%,#102b45)] px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#62d4ff]">Test Checkout</p>
                <h2 className="mt-1 text-2xl font-black text-white">{checkoutStep === 'complete' ? 'Order submitted' : 'Print-ready checkout'}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">No payment will be collected. This creates a realistic test order for your team to review.</p>
              </div>
              <button type="button" onClick={() => setShowTestCheckout(false)} className="rounded border border-white/15 bg-[#0b1018] px-3 py-2 text-xs font-black uppercase text-slate-100 hover:border-[#0ea5e9]/70">Close</button>
            </div>
            <div className="mt-5 grid grid-cols-4 gap-2 text-center text-[10px] font-black uppercase tracking-[0.14em]">
              {(['contact', 'fulfillment', 'review', 'complete'] as const).map((step) => <span key={step} className={`rounded-full border px-2 py-2 ${checkoutStep === step ? 'border-[#62d4ff] bg-[#0ea5e9]/25 text-white' : 'border-white/10 bg-white/[0.04] text-slate-400'}`}>{step === 'fulfillment' ? 'Delivery' : step}</span>)}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {checkoutStatus ? <p className="mb-4 rounded border border-[#0ea5e9]/25 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate-200">{checkoutStatus}</p> : null}

            {checkoutStep === 'contact' ? <div className="space-y-4">
              <div>
                <h3 className="text-lg font-black text-white">Customer contact</h3>
                <p className="mt-1 text-sm text-slate-400">This is the info your team will use to identify the test order.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-bold text-slate-200">Name
                  <input value={checkoutContact.name} onChange={(event) => setCheckoutContact((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded border border-white/15 bg-[#02070d] px-3 py-3 text-white outline-none ring-[#0ea5e9]/40 focus:ring-2" />
                </label>
                <label className="text-sm font-bold text-slate-200">Email
                  <input type="email" value={checkoutContact.email} onChange={(event) => setCheckoutContact((current) => ({ ...current, email: event.target.value }))} className="mt-1 w-full rounded border border-white/15 bg-[#02070d] px-3 py-3 text-white outline-none ring-[#0ea5e9]/40 focus:ring-2" />
                </label>
                <label className="text-sm font-bold text-slate-200">Phone
                  <input value={checkoutContact.phone} onChange={(event) => setCheckoutContact((current) => ({ ...current, phone: event.target.value }))} className="mt-1 w-full rounded border border-white/15 bg-[#02070d] px-3 py-3 text-white outline-none ring-[#0ea5e9]/40 focus:ring-2" />
                </label>
                <label className="text-sm font-bold text-slate-200">Organization
                  <input value={checkoutContact.organization} onChange={(event) => setCheckoutContact((current) => ({ ...current, organization: event.target.value }))} className="mt-1 w-full rounded border border-white/15 bg-[#02070d] px-3 py-3 text-white outline-none ring-[#0ea5e9]/40 focus:ring-2" />
                </label>
              </div>
              <label className="block text-sm font-bold text-slate-200">Order notes
                <textarea value={checkoutContact.notes} onChange={(event) => setCheckoutContact((current) => ({ ...current, notes: event.target.value }))} rows={3} className="mt-1 w-full rounded border border-white/15 bg-[#02070d] px-3 py-3 text-white outline-none ring-[#0ea5e9]/40 focus:ring-2" />
              </label>
              <label className={`flex gap-3 rounded-xl border p-4 ${checkoutTaxExempt ? 'border-[#62d4ff] bg-[#0ea5e9]/15' : 'border-white/10 bg-white/[0.04]'}`}>
                <input type="checkbox" checked={checkoutTaxExempt} onChange={(event) => setCheckoutTaxExempt(event.target.checked)} className="mt-1 h-4 w-4 accent-[#1678b8]" />
                <span>
                  <span className="block text-sm font-black text-white">Tax exempt customer</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-300">Only use this when Hue has a valid tax exemption form on file. If this is a new tax-exempt customer, they need to email the proper form before the order is processed.</span>
                </span>
              </label>
            </div> : null}

            {checkoutStep === 'fulfillment' ? <div className="space-y-4">
              <div>
                <h3 className="text-lg font-black text-white">Fulfillment</h3>
                <p className="mt-1 text-sm text-slate-400">Choose how this order should be handled in the test run.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setCheckoutFulfillment('pickup')} className={`rounded-xl border px-4 py-4 text-left ${checkoutFulfillment === 'pickup' ? 'border-[#62d4ff] bg-[#0ea5e9]/20' : 'border-white/12 bg-white/[0.04] hover:border-[#0ea5e9]/45'}`}>
                  <span className="block text-sm font-black uppercase text-white">Local pickup</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-300">Customer picks up from Hue after production.</span>
                </button>
                <button type="button" onClick={() => setCheckoutFulfillment('direct_ship')} className={`rounded-xl border px-4 py-4 text-left ${checkoutFulfillment === 'direct_ship' ? 'border-[#62d4ff] bg-[#0ea5e9]/20' : 'border-white/12 bg-white/[0.04] hover:border-[#0ea5e9]/45'}`}>
                  <span className="block text-sm font-black uppercase text-white">Direct ship</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-300">Ship the finished order directly to the customer.</span>
                </button>
              </div>
              {checkoutFulfillment === 'direct_ship' ? <div className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-2">
                <label className="text-sm font-bold text-slate-200 sm:col-span-2">Street address
                  <input value={checkoutAddress.line1} onChange={(event) => setCheckoutAddress((current) => ({ ...current, line1: event.target.value }))} className="mt-1 w-full rounded border border-white/15 bg-[#02070d] px-3 py-3 text-white outline-none ring-[#0ea5e9]/40 focus:ring-2" />
                </label>
                <label className="text-sm font-bold text-slate-200 sm:col-span-2">Apt, suite, or unit
                  <input value={checkoutAddress.line2} onChange={(event) => setCheckoutAddress((current) => ({ ...current, line2: event.target.value }))} className="mt-1 w-full rounded border border-white/15 bg-[#02070d] px-3 py-3 text-white outline-none ring-[#0ea5e9]/40 focus:ring-2" />
                </label>
                <label className="text-sm font-bold text-slate-200">City
                  <input value={checkoutAddress.city} onChange={(event) => setCheckoutAddress((current) => ({ ...current, city: event.target.value }))} className="mt-1 w-full rounded border border-white/15 bg-[#02070d] px-3 py-3 text-white outline-none ring-[#0ea5e9]/40 focus:ring-2" />
                </label>
                <label className="text-sm font-bold text-slate-200">State
                  <input value={checkoutAddress.state} onChange={(event) => setCheckoutAddress((current) => ({ ...current, state: event.target.value }))} className="mt-1 w-full rounded border border-white/15 bg-[#02070d] px-3 py-3 text-white outline-none ring-[#0ea5e9]/40 focus:ring-2" />
                </label>
                <label className="text-sm font-bold text-slate-200">ZIP code
                  <input value={checkoutAddress.postalCode} onChange={(event) => setCheckoutAddress((current) => ({ ...current, postalCode: event.target.value }))} className="mt-1 w-full rounded border border-white/15 bg-[#02070d] px-3 py-3 text-white outline-none ring-[#0ea5e9]/40 focus:ring-2" />
                </label>
              </div> : null}
            </div> : null}

            {checkoutStep === 'review' ? <div className="space-y-4">
              <div>
                <h3 className="text-lg font-black text-white">Review test order</h3>
                <p className="mt-1 text-sm text-slate-400">This snapshot includes products, pricing, options, and artwork references.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#62d4ff]">Customer</p>
                  <p className="mt-2 font-bold text-white">{checkoutContact.name || 'Name missing'}</p>
                  <p className="text-sm text-slate-300">{checkoutContact.email || 'Email missing'}</p>
                  <p className="text-sm text-slate-400">{checkoutContact.phone || 'No phone entered'}</p>
                  {checkoutTaxExempt ? <p className="mt-2 rounded bg-[#0ea5e9]/15 px-2 py-1 text-xs font-bold text-[#9be6ff]">Tax exempt pending valid form</p> : null}
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#62d4ff]">Fulfillment</p>
                  <p className="mt-2 font-bold text-white">{checkoutFulfillment === 'pickup' ? 'Local pickup' : 'Direct ship'}</p>
                  <p className="text-sm text-slate-300">{checkoutFulfillment === 'pickup' ? 'No shipping address needed.' : `${checkoutAddress.line1}, ${checkoutAddress.city}, ${checkoutAddress.state} ${checkoutAddress.postalCode}`}</p>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#62d4ff]">Items</p>
                  <p className="text-xl font-black text-green-400">{formatSignPrice(checkoutOrderTotal, 'USD')}</p>
                </div>
                <div className="mt-3 space-y-3">
                  {cartItems.map((item) => <div key={`review-${item.id}`} className="rounded border border-white/10 bg-[#02070d]/65 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-white">{item.productName}</p>
                        <p className="text-sm text-slate-300">{item.sizeLabel} / Qty {item.quantity}</p>
                      </div>
                      <p className="font-black text-green-400">{item.price.total !== null ? formatSignPrice(item.price.total, item.price.currency) : 'Needs price'}</p>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">{item.artworkFiles.length} attached artwork file{item.artworkFiles.length === 1 ? '' : 's'}</p>
                  </div>)}
                </div>
                <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Subtotal</span>
                    <span>{formatSignPrice(cartSubtotal, 'USD')}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4 text-slate-300">
                    <span>{checkoutTaxLabel}</span>
                    <span>{formatSignPrice(checkoutTaxAmount, 'USD')}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 text-lg font-black text-white">
                    <span>Test total</span>
                    <span className="text-green-400">{formatSignPrice(checkoutOrderTotal, 'USD')}</span>
                  </div>
                </div>
              </div>
              <p className="rounded border border-[#62d4ff]/25 bg-[#0ea5e9]/10 px-4 py-3 text-sm text-[#c8f2ff]">Test checkout only. No card is charged and no production order is sent yet.</p>
            </div> : null}

            {checkoutStep === 'complete' ? <div className="space-y-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#62d4ff]/40 bg-[#0ea5e9]/20 text-2xl font-black text-[#9be6ff]">HX</div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#62d4ff]">Test order number</p>
                <h3 className="mt-2 text-4xl font-black text-white">{lastTestOrder?.orderNumber || 'TEST SAVED'}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">No payment was collected. The cart was cleared and the test order was saved in this browser for workflow testing.</p>
              </div>
              {lastTestOrder ? <div className="mx-auto grid max-w-xl gap-3 text-left sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs text-slate-400">Items</p>
                  <p className="mt-1 text-2xl font-black text-white">{lastTestOrder.items.length}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs text-slate-400">Artwork files</p>
                  <p className="mt-1 text-2xl font-black text-white">{lastTestOrder.items.reduce((total, item) => total + item.artworkFiles.length, 0)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs text-slate-400">Total</p>
                  <p className="mt-1 text-2xl font-black text-green-400">{formatSignPrice(lastTestOrder.total, lastTestOrder.currency)}</p>
                  <p className="mt-1 text-xs text-slate-400">{lastTestOrder.tax.label}: {formatSignPrice(lastTestOrder.tax.amount, lastTestOrder.currency)}</p>
                </div>
              </div> : null}
            </div> : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#050b12] p-4">
            <p className="text-xs leading-5 text-slate-400">Team testing mode. Real payment and final order automation can plug into this same order shape later.</p>
            <div className="flex gap-2">
              {checkoutStep !== 'contact' && checkoutStep !== 'complete' ? <button type="button" onClick={() => setCheckoutStep(checkoutStep === 'review' ? 'fulfillment' : 'contact')} className="rounded border border-white/15 bg-[#0b1018] px-4 py-3 text-xs font-black uppercase text-slate-100 hover:border-[#0ea5e9]/70">Back</button> : null}
              {checkoutStep === 'contact' ? <button type="button" onClick={() => { setCheckoutStatus(''); setCheckoutStep('fulfillment'); }} className="rounded bg-[#1678b8] px-4 py-3 text-xs font-black uppercase text-white hover:bg-[#0f5f94]">Continue</button> : null}
              {checkoutStep === 'fulfillment' ? <button type="button" onClick={() => { setCheckoutStatus(''); setCheckoutStep('review'); }} className="rounded bg-[#1678b8] px-4 py-3 text-xs font-black uppercase text-white hover:bg-[#0f5f94]">Review Order</button> : null}
              {checkoutStep === 'review' ? <button type="button" onClick={submitTestOrder} className="rounded bg-[#22c55e] px-4 py-3 text-xs font-black uppercase text-white shadow-[0_0_24px_rgba(34,197,94,0.20)] hover:bg-[#16a34a]">Submit Test Order</button> : null}
              {checkoutStep === 'complete' ? <button type="button" onClick={() => setShowTestCheckout(false)} className="rounded bg-[#1678b8] px-4 py-3 text-xs font-black uppercase text-white hover:bg-[#0f5f94]">Done</button> : null}
            </div>
          </div>
        </section>
      </div> : null}

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
            <label htmlFor="artwork-upload-input" onClick={() => setImageLibraryStatus('Choose an image or PDF artwork file.')} className="flex h-9 cursor-pointer items-center rounded bg-[#1678b8] px-4 text-xs font-black uppercase text-white hover:bg-[#0f5f94]">Upload Image</label>
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
                <label htmlFor="artwork-upload-input" onClick={() => setImageLibraryStatus('Choose an image or PDF artwork file.')} className="mt-5 inline-flex cursor-pointer rounded bg-[#1678b8] px-5 py-3 text-sm font-black uppercase text-white hover:bg-[#0f5f94]">Upload Image</label>
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
                    <span onClick={async (event) => { event.stopPropagation(); await useImageZoneItem(item); }} className="ml-2 mt-3 inline-flex rounded bg-[#1678b8] px-3 py-1 text-xs font-bold uppercase text-white">Use Image</span>
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

      <div className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/80 bg-white/90 shadow-[0_-14px_34px_rgba(7,17,31,0.08)] backdrop-blur ${isProductionBuilder ? 'hidden' : ''}`}>
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-3 px-4 py-3 text-xs md:px-6 md:text-sm">
          <button type="button" onClick={() => setStoreView('store')} className="rounded-md border border-[#1678b8] bg-white px-4 py-3 font-bold text-[#1678b8] hover:bg-[#eaf5fb]">{isCoroBuilder ? 'Products' : '+ Add Products'}</button>
          {productMode === 'apparel' ? <img src={getProductCardImage(selectedPreview)} alt={selectedProductName} className="h-12 w-12 rounded-md border border-slate-200 bg-slate-100 object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-md border border-[#1678b8]/25 bg-[#eaf5fb] text-[10px] font-bold uppercase text-[#1678b8]">Sign</div>}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{designerProductName}</p>
            <p className="truncate text-slate-600">{productMode === 'apparel' ? `${selectedColorName} / Qty: ${totalQuantity} / Est: $${displayedPerShirt.toFixed(2)}/ea` : isCoroBuilder ? `${signWidth}" x ${signHeight}" / Qty ${designerQuantity} / ${coroSheetLayout.sheetCount} sheet${coroSheetLayout.sheetCount === 1 ? '' : 's'}` : `Qty: ${designerQuantity} / Est: ${signEstimate ? formatSignPrice(signEstimate.price?.each, signEstimate.currency) + '/ea' : 'Run sign estimate'}`}</p>
          </div>
          <button onClick={saveDraftToLocal} className={`rounded-md border border-[#1678b8] bg-white px-4 py-3 font-bold text-[#1678b8] hover:bg-[#eaf5fb] ${isCoroBuilder ? 'hidden sm:block' : ''}`}>{isCoroBuilder ? 'Save' : 'Save | Share'}</button>
          <button onClick={productMode === 'apparel' ? requestApparelEstimate : canAddCurrentDesignToCart ? handleAddCurrentDesignToCart : requestSignEstimate} className="rounded-md bg-[#1f73be] px-5 py-3 font-bold text-white hover:bg-[#2a86d8]">{productMode === 'apparel' ? 'Get Price' : canAddCurrentDesignToCart ? 'Add to Cart' : 'Price It'}</button>
        </div>
      </div>
      </>
      )}
    </main>
  );
}
