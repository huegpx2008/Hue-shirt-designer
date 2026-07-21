'use client';

import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ActiveSelection, Canvas, Circle, FabricImage, Gradient, Group, IText, Line, Object as FabricObject, Path, Point, Rect, Shadow, Triangle, filters } from 'fabric';
import QRCode from 'qrcode';
import PayPalCheckoutButton from '@/components/paypal-checkout-button';
import TshirtShape from '@/components/tshirt-shape';
import { PRINT_AREA_CONFIG, ProductCatalogItem, PrintLocation, SAMPLE_PRODUCT_CATALOG } from '@/components/product-catalog';
import { calculateDtfPricing } from '@/lib/pricing/dtf-pricing';
import { recommendPrintMethodByCost } from '@/lib/pricing/recommend-print-method';
import { calculateScreenPrintPricing } from '@/lib/pricing/screen-print-pricing';
import {
  SMART_TEMPLATE_CATEGORIES,
  SMART_TEMPLATE_CATEGORY_FILTERS,
  SMART_TEMPLATE_FAMILY_BY_ID,
  SMART_TEMPLATE_FAMILY_FILTERS,
  SMART_TEMPLATE_STYLE_FILTERS,
  SMART_TEMPLATE_STYLES,
  SMART_TEMPLATES,
  getSmartTemplateAssetLabel,
  getSmartTemplateFamily,
  getSmartTemplateThumbnailUrl,
  type SmartTemplate,
  type SmartTemplateCategory,
  type SmartTemplateFamilyId,
  type SmartTemplateStyle
} from '@/lib/templates/template-catalog';
import generatedSanMarCatalog from '@/public/data/catalog/t-shirts.generated.json';
import fallbackSanMarPreview from '@/public/data/catalog-preview-25.json';
import catalogAuditData from '@/public/data/catalog/catalog-audit.generated.json';

type ShirtView = 'front' | 'back';
type FontOption = { label: string; value: string };
type LayerItem = { id: string; name: string; type: string; isActive: boolean; isLocked?: boolean };
type NewArtworkPreset = { width: number; height: number; label?: string; popular?: boolean };
type NewArtworkPresetGroup = { id: string; label: string; description: string; sizes: NewArtworkPreset[] };
type SmartTemplateForm = { headline: string; subheadline: string; name: string; phone: string; website: string; detailLine: string; footerNote: string; qrValue: string; primary: string; accent: string; background: string; includeQr: boolean };
type SmartTemplateBrowseMode = 'industry' | 'style' | 'family';
type ArtworkFitState = 'unresolved' | 'fit' | 'stretch';
type ImageResolution = { dpiX: number; dpiY: number };
type ArtworkEditorProject = { version: 1; front: string | null; back: string | null; width: number; height: number; signWidth?: number; signHeight?: number; dpi: number; updatedAt: string };
type ArtworkEditorOrderReturn = { side: 'front' | 'back'; width: number; height: number; fitState: ArtworkFitState };
type ImageZoneItem = { id: string; name: string; dataUrl: string; width: number; height: number; dpi: number; uploadedAt: string; storagePath?: string; storageUrl?: string; source?: 'local' | 'supabase' | 'archive'; archiveId?: string; archived?: boolean; mimeType?: string; frontFitState?: ArtworkFitState; backDataUrl?: string; backName?: string; backStoragePath?: string; backWidth?: number; backHeight?: number; backCopiedFromFront?: boolean; backFitState?: ArtworkFitState; signWidth?: number; signHeight?: number; sourceSignWidth?: number; sourceSignHeight?: number; fluteDirection?: string; editorProject?: ArtworkEditorProject; projectStoragePath?: string };
type CanvaImportStatus = { configured: boolean; connected?: boolean; authUrl?: string; missing?: string[]; message?: string; expectedRedirectUri?: string };
type CanvaDesign = { id: string; title: string; thumbnailUrl?: string; updatedAt?: string };
type CanvaImportPayload = { name: string; dataUrl: string; mimeType: string };
type BannerOrderItem = { id: string; setNumber: number; name: string; dataUrl: string | null; width: number; height: number; quantity: number; artworkSize: { width: number; height: number } | null; fitState: ArtworkFitState; backArtwork?: ImageZoneItem | null; sides?: string; material?: string; materialLabel?: string; estimate?: SignEstimate | null; localOptionTotal?: number };
type CoroArtworkQuantityMap = Record<string, number>;
type CoroArtworkSide = 'front' | 'back';
type CoroPlacementTarget = { itemId: string | null; side: CoroArtworkSide };
type ImageType = 'flat' | 'model';
type ProductMode = 'apparel' | 'signage';
type SignProductId = 'banner' | 'mesh-banner' | 'yard-sign' | 'acm' | 'poster' | 'acrylic' | 'foamcore' | 'pvc' | 'polystyrene' | 'aluminum' | 'vinyl' | 'custom-cut-coroplast' | 'vehicle-magnet' | 'business-card' | 'handheld-paper' | 'carbonless' | 'door-hanger';
type StoreView = 'store' | 'builder' | 'dtg';
type StoreCategoryId = 'banners' | 'coro' | 'rigid' | 'decals' | 'magnets' | 'apparel' | 'misc';
type CoroOptionPanel = 'images' | 'size' | 'material' | 'sides' | 'grommets' | 'stakes' | 'gloss' | 'rope' | 'polePocket' | 'windSlits' | 'webbing' | 'standoffs' | 'roundedCorners' | 'orientation' | 'coating' | null;
type SignFieldType = 'number' | 'select' | 'checkbox';
type SignFieldOption = { label: string; value: string };
type SignField = { name: string; label: string; type: SignFieldType; defaultValue: string | boolean; step?: string; options?: SignFieldOption[] };
type SignProductConfig = { id: SignProductId; name: string; apiSlug: string; description: string; preview: 'banner' | 'yard-sign'; fields: SignField[] };
type StoreProductCard = { id: string; category: StoreCategoryId; title: string; subtitle: string; description: string; mode: ProductMode; signProductId?: SignProductId; badge?: string; image?: string; imageSprite?: { column: number; row: number }; disabled?: boolean; initialSignValues?: Partial<Record<string, string | boolean>> };
type SignEstimate = { ok?: boolean; product?: string; currency?: string; price?: { retail?: number | string; each?: number | string }; studioPricing?: { sheetPricing?: { filledSheetTotal?: number | string } }; summary?: Record<string, unknown>; warnings?: string[]; error?: { message?: string; fields?: Record<string, string> } };
type ApparelApiEstimate = { ok?: boolean; currency?: string; price?: { retail?: number | string; each?: number | string }; summary?: Record<string, unknown>; warnings?: string[]; error?: { message?: string; fields?: Record<string, string> } };
type CustomerSession = { access_token: string; refresh_token?: string; expires_at?: number; user?: { id?: string; email?: string } };
type CartArtworkFile = { role: string; name: string; storagePath?: string; storageUrl?: string; source?: 'local' | 'supabase' | 'archive'; previewUrl?: string };
type CartProductionArtwork = { id: string; label: string; quantity: number; sizeLabel: string; sheetLabel?: string; frontName: string; frontPreviewUrl?: string; frontStoragePath?: string; backName?: string; backPreviewUrl?: string; backStoragePath?: string };
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
  pricingRequest: { apiSlug: string; payload: Record<string, string | number | boolean> };
  artworkFiles: CartArtworkFile[];
  productionBreakdown: CartProductionArtwork[];
  productionSummary: string[];
  customer: { userId?: string; email?: string; checkoutMode: 'account' | 'quick' };
};
type CheckoutFulfillment = 'pickup' | 'direct_ship';
type AppliedPromo = { code: string; description: string; discountType: 'percent' | 'fixed'; discountValue: number; discountAmount: number };
type TestOrder = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: 'test_submitted';
  paymentMode: 'test_no_payment' | 'paypal';
  payment?: { provider: 'paypal'; status: 'completed'; paypalOrderId: string; captureId: string; paidAt?: string };
  customer: { name: string; organization?: string; email: string; phone: string; notes?: string; taxExempt: boolean; userId?: string; checkoutMode: 'account' | 'quick' };
  fulfillment: {
    method: CheckoutFulfillment;
    address?: { line1: string; line2: string; city: string; state: string; postalCode: string };
  };
  items: CartItem[];
  subtotal: number;
  promotion?: { code: string; description: string; discountAmount: number };
  shipping?: { amount: number; label: string };
  tax: { rate: number; amount: number; label: string };
  total: number;
  currency: string;
};
type SanMarPreviewItem = { styleNumber: string; productName: string; brand: string; category?: string; colorName: string; availableSizes: string[]; frontModelImageUrl?: string; backModelImageUrl?: string; frontFlatImageUrl?: string; backFlatImageUrl?: string; productImageUrl?: string; colorSwatchImageUrl?: string };
type CategoryChunkSlug = 't-shirts' | 'hoodies' | 'long-sleeve' | 'sweatshirts' | 'polos' | 'bags' | 'caps' | 'other' | 'other-part-3' | 'other-part-4';
type SizeKey = 'YS' | 'YM' | 'YL' | 'YXL' | 'AS' | 'AM' | 'AL' | 'AXL' | '2XL' | '3XL' | '4XL';
type DtgSize = 'S' | 'M' | 'L' | 'XL' | '2XL' | '3XL';
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
const GUEST_UPLOAD_SESSION_KEY = 'hue-guest-upload-session';
const CUSTOMER_SESSION_STORAGE_KEY = 'hue-customer-session';
const CART_STORAGE_KEY = 'hue-print-ready-cart';
const TEST_ORDER_STORAGE_KEY = 'hue-test-orders';
const ORDER_CONFIRMATION_STORAGE_KEY = 'hue-order-confirmation';
const CHECKOUT_SUBMISSION_STORAGE_KEY = 'hue-checkout-submission';
const GEORGIA_SALES_TAX_RATE = 0.08;
const HUE_STUDIO_US_SHIPPING_FEE = 10;

const getPersistableCartItems = (items: CartItem[]) => items.map((item) => ({
  ...item,
  artworkFiles: item.artworkFiles.map((file) => ({
    ...file,
    previewUrl: file.previewUrl?.startsWith('data:') ? undefined : file.previewUrl
  })),
  productionBreakdown: (item.productionBreakdown || []).map((artwork) => ({
    ...artwork,
    frontPreviewUrl: artwork.frontPreviewUrl?.startsWith('data:') ? undefined : artwork.frontPreviewUrl,
    backPreviewUrl: artwork.backPreviewUrl?.startsWith('data:') ? undefined : artwork.backPreviewUrl
  }))
}));

const getPersistableTestOrders = (orders: TestOrder[]) => orders.map((order) => ({
  ...order,
  items: getPersistableCartItems(order.items)
}));

const isLikelyImagePath = (value: string) => /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(value);
const isLikelyArtworkPath = (value: string) => /\.(png|jpe?g|webp|gif|bmp|svg|pdf)(\?.*)?$/i.test(value);
const GEORGIA_SALES_TAX_LABEL = 'GA sales tax';
const isSupabaseStorageConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && SUPABASE_STORAGE_BUCKET);

const getSupabaseStorageHeaders = (accessToken?: string) => ({
  apikey: SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${accessToken || SUPABASE_PUBLISHABLE_KEY}`
});

const encodeStoragePath = (path: string) => path.split('/').map((part) => encodeURIComponent(part)).join('/');

const getSupabasePublicUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${encodeStoragePath(path)}`;

const getAbsoluteSupabaseStorageUrl = (url: string) => {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/storage/v1/')) return `${SUPABASE_URL}${url}`;
  if (url.startsWith('/object/')) return `${SUPABASE_URL}/storage/v1${url}`;
  return `${SUPABASE_URL}/storage/v1/${url.replace(/^\/+/, '')}`;
};

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
  return getAbsoluteSupabaseStorageUrl(signedUrl);
};

const getSafeStorageFileName = (name: string) => {
  const cleanName = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleanName || 'artwork-file';
};

const getSafeStorageFolderName = (name: string, fallback: string) => getSafeStorageFileName(name.toLowerCase()).slice(0, 80) || fallback;

const getGuestUploadSessionId = () => {
  if (typeof window === 'undefined') return `guest-${Date.now()}`;
  const existing = window.localStorage.getItem(GUEST_UPLOAD_SESSION_KEY);
  if (existing && /^[a-zA-Z0-9-]{20,80}$/.test(existing)) return existing;
  const sessionId = typeof window.crypto?.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(GUEST_UPLOAD_SESSION_KEY, sessionId);
  return sessionId;
};

const getCustomerLibraryPrefix = (session: CustomerSession | null) => {
  if (!session?.user?.id) return `guest-orders/${getGuestUploadSessionId()}`;
  const customerLabel = getSafeStorageFolderName(session.user.email || 'customer', 'customer');
  return `customers/${customerLabel}/${session.user.id}`;
};

const getCustomerLegacyLibraryPrefixes = (session: CustomerSession | null) => {
  if (!session?.user?.id) return [];
  const customerLabel = getSafeStorageFolderName(session.user.email || 'customer', 'customer');
  return [
    `customers/${session.user.id}/${customerLabel}`,
    `customers/${session.user.id}`,
  ];
};

const CLIENT_ARTWORK_MAX_BYTES = 50 * 1024 * 1024;
const SUPPORTED_CLIENT_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const isPreviewableImageFile = (file: File) => SUPPORTED_CLIENT_IMAGE_TYPES.has(file.type.toLowerCase()) || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
const validateClientArtworkFile = (file: File, options: { allowPdf?: boolean } = {}) => {
  if (!file.size) throw new Error('The selected file is empty.');
  if (file.size > CLIENT_ARTWORK_MAX_BYTES) throw new Error('Artwork files cannot exceed 50 MB.');
  const isImage = isPreviewableImageFile(file);
  const isPdf = options.allowPdf && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
  if (!isImage && !isPdf) throw new Error('Upload a PNG, JPG, WebP, GIF, or PDF. SVG and other file types are not accepted.');
};

const getImageNaturalSize = (dataUrl: string): Promise<{ width: number; height: number }> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
  image.onerror = () => reject(new Error('Could not read image size.'));
  image.src = dataUrl;
});

const renderPdfFirstPage = async (source: string | ArrayBuffer) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString();
  }
  const buffer = typeof source === 'string'
    ? await fetch(source).then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error('Could not download the PDF preview.')))
    : source;
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await document.getPage(1);
  const pageAt72Dpi = page.getViewport({ scale: 1 });
  const renderScale = Math.max(2, Math.min(4, 1800 / Math.max(1, pageAt72Dpi.width)));
  const viewport = page.getViewport({ scale: renderScale });
  const canvas = window.document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('This browser could not prepare the PDF preview.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
    dpi: Math.round(72 * renderScale),
    signWidth: Number((pageAt72Dpi.width / 72).toFixed(2)),
    signHeight: Number((pageAt72Dpi.height / 72).toFixed(2))
  };
};

const dataUrlToFile = async (dataUrl: string, fileName: string, mimeType = 'image/png') => {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('The imported artwork file could not be prepared for storage.');
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || mimeType });
};

const getTransparentTrimmedArtwork = (dataUrl: string): Promise<{ dataUrl: string; width: number; height: number; trimmed: boolean }> => new Promise((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context || !width || !height) {
      resolve({ dataUrl, width, height, trimmed: false });
      return;
    }

    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = pixels[((y * width + x) * 4) + 3];
        if (alpha > 24) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      resolve({ dataUrl, width, height, trimmed: false });
      return;
    }

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;
    const shouldTrim = cropWidth < width * 0.98 || cropHeight < height * 0.98;

    if (!shouldTrim) {
      resolve({ dataUrl, width, height, trimmed: false });
      return;
    }

    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = cropWidth;
    trimmedCanvas.height = cropHeight;
    const trimmedContext = trimmedCanvas.getContext('2d');

    if (!trimmedContext) {
      resolve({ dataUrl, width, height, trimmed: false });
      return;
    }

    trimmedContext.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    resolve({ dataUrl: trimmedCanvas.toDataURL('image/png'), width: cropWidth, height: cropHeight, trimmed: true });
  };
  image.onerror = () => reject(new Error('Could not trim transparent artwork padding.'));
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

const isSupabaseSessionExpiredError = (message: string) => /exp.*claim|jwt.*expired|token.*expired|invalid.*jwt/i.test(message);

const refreshSupabaseSession = async (session: CustomerSession | null) => {
  if (!session?.refresh_token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refresh_token: session.refresh_token })
  });
  if (!response.ok) return null;
  const payload = await response.json() as Partial<CustomerSession>;
  if (!payload.access_token) return null;
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || session.refresh_token,
    expires_at: payload.expires_at,
    user: payload.user || session.user
  };
};

const uploadArtworkFileToSupabase = async (file: File, session: CustomerSession | null) => {
  if (!isSupabaseStorageConfigured) throw new Error('Supabase is not configured.');
  const isProject = /json/i.test(file.type) || /-project\.json$/i.test(file.name);
  if (!isProject) validateClientArtworkFile(file, { allowPdf: true });
  const guestSessionId = session?.user?.id ? '' : getGuestUploadSessionId();
  const requestHeaders = {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
  const ticketResponse = await fetch('/api/artwork/upload', {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify({
      action: 'ticket',
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      guestSessionId,
    }),
  });
  if (!ticketResponse.ok) {
    const message = await getErrorMessage(ticketResponse);
    if (/maximum allowed size|exceeded.*size|object.*too large/i.test(message)) {
      throw new Error(`The file is over the storage limit (${(file.size / 1024 / 1024).toFixed(1)} MB). Hue Studio generated files are capped at 300 DPI, but this artboard may still need to save smaller.`);
    }
    throw new Error(message);
  }
  const ticket = await ticketResponse.json() as { storagePath?: string; token?: string; mimeType?: string };
  if (!ticket.storagePath || !ticket.token) throw new Error('Secure storage did not return an upload ticket.');

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: uploadError } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .uploadToSignedUrl(ticket.storagePath, ticket.token, file, { contentType: ticket.mimeType || file.type });
  if (uploadError) throw new Error(uploadError.message || 'The artwork could not be uploaded to secure storage.');

  const verifyResponse = await fetch('/api/artwork/upload', {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify({
      action: 'verify',
      storagePath: ticket.storagePath,
      guestSessionId,
      isProject,
    }),
  });
  if (!verifyResponse.ok) throw new Error(await getErrorMessage(verifyResponse));
  const result = await verifyResponse.json() as { storagePath?: string; storageUrl?: string };
  if (!result.storagePath || !result.storageUrl) throw new Error('Secure storage did not return the saved artwork location.');
  return { storagePath: result.storagePath, storageUrl: result.storageUrl };
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

const NEW_ARTWORK_PRESET_GROUPS: NewArtworkPresetGroup[] = [
  { id: 'yard-signs', label: 'Yard Signs', description: 'Coroplast yard and campaign signs', sizes: [
    { width: 24, height: 18, popular: true }, { width: 18, height: 12, popular: true }, { width: 24, height: 24 }, { width: 36, height: 24, popular: true }
  ] },
  { id: 'aluminum-acm', label: 'Aluminum / ACM', description: 'Rigid outdoor and business signs', sizes: [
    { width: 18, height: 12, popular: true }, { width: 24, height: 18, popular: true }, { width: 24, height: 24 }, { width: 36, height: 24, popular: true }, { width: 36, height: 36 }, { width: 48, height: 36, popular: true }, { width: 48, height: 48 }
  ] },
  { id: 'wall-business', label: 'Wall / Business', description: 'Larger storefront and wall signage', sizes: [
    { width: 36, height: 24, popular: true }, { width: 48, height: 36, popular: true }, { width: 48, height: 48 }, { width: 72, height: 48 }, { width: 96, height: 48, popular: true }
  ] },
  { id: 'real-estate', label: 'Real Estate', description: 'Listing, directional, and open-house signs', sizes: [
    { width: 24, height: 18, popular: true }, { width: 24, height: 24 }, { width: 36, height: 24, popular: true }
  ] },
  { id: 'political', label: 'Political Signs', description: 'Campaign and election yard signs', sizes: [
    { width: 18, height: 12, popular: true }, { width: 24, height: 18, popular: true }
  ] },
  { id: 'parking', label: 'Parking / Regulatory', description: 'Parking, safety, and regulatory signs', sizes: [
    { width: 18, height: 12, popular: true }, { width: 24, height: 18, popular: true }
  ] },
  { id: 'banners', label: 'Banners', description: 'Small through large outdoor banners', sizes: [
    { width: 36, height: 24, label: `3' × 2'` }, { width: 48, height: 24, label: `4' × 2'`, popular: true }, { width: 72, height: 24, label: `6' × 2'`, popular: true }, { width: 96, height: 24, label: `8' × 2'`, popular: true },
    { width: 48, height: 36, label: `4' × 3'` }, { width: 72, height: 36, label: `6' × 3'`, popular: true }, { width: 96, height: 36, label: `8' × 3'`, popular: true }, { width: 120, height: 36, label: `10' × 3'`, popular: true }, { width: 144, height: 36, label: `12' × 3'` },
    { width: 72, height: 48, label: `6' × 4'` }, { width: 96, height: 48, label: `8' × 4'`, popular: true }, { width: 120, height: 48, label: `10' × 4'`, popular: true }, { width: 144, height: 48, label: `12' × 4'`, popular: true }, { width: 192, height: 48, label: `16' × 4'` },
    { width: 120, height: 60, label: `10' × 5'`, popular: true }, { width: 180, height: 60, label: `15' × 5'` }, { width: 240, height: 60, label: `20' × 5'` }, { width: 144, height: 72, label: `12' × 6'`, popular: true }, { width: 240, height: 72, label: `20' × 6'` }
  ] }
];

const getRecommendedBorderSize = (width?: number, height?: number) => {
  const longestSide = Math.max(Number(width) || 0, Number(height) || 0);
  if (longestSide > 192) return { inset: 2, thickness: 1.5 };
  if (longestSide > 120) return { inset: 1.5, thickness: 1.25 };
  if (longestSide > 72) return { inset: 1, thickness: 1 };
  if (longestSide > 36) return { inset: 0.75, thickness: 0.75 };
  return { inset: 0.5, thickness: 0.5 };
};

const FONT_OPTIONS: FontOption[] = [
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Arial Black', value: 'Arial Black, Arial, sans-serif' },
  { label: 'Impact', value: 'Impact, Haettenschweiler, Arial Narrow Bold, sans-serif' },
  { label: 'Franklin Gothic', value: 'Franklin Gothic Medium, Arial Narrow, Arial, sans-serif' },
  { label: 'Century Gothic', value: 'Century Gothic, Futura, Arial, sans-serif' },
  { label: 'Trebuchet', value: 'Trebuchet MS, Arial, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Inter', value: 'Inter, Arial, sans-serif' },
  { label: 'Poppins', value: 'Poppins, Arial, sans-serif' },
  { label: 'Montserrat', value: 'Montserrat, Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: 'Times New Roman, Times, serif' },
  { label: 'Garamond', value: 'Garamond, Baskerville, Georgia, serif' },
  { label: 'Palatino', value: 'Palatino Linotype, Book Antiqua, Palatino, serif' },
  { label: 'Rockwell', value: 'Rockwell, Rockwell Extra Bold, Georgia, serif' },
  { label: 'Copperplate', value: 'Copperplate, Copperplate Gothic Light, serif' },
  { label: 'Courier New', value: 'Courier New, Courier, monospace' },
  { label: 'Lucida Console', value: 'Lucida Console, Monaco, monospace' },
  { label: 'Brush Script', value: 'Brush Script MT, Segoe Script, cursive' },
  { label: 'Comic Sans', value: 'Comic Sans MS, Comic Sans, cursive' }
];

const ARTWORK_EDITOR_TEMPLATES = [
  { id: 'yard-sale', label: 'Yard Sale', headline: 'YARD SALE', detail: 'SATURDAY 8 AM – 2 PM', color: '#dc2626', accent: '#facc15' },
  { id: 'open-house', label: 'Open House', headline: 'OPEN HOUSE', detail: 'TODAY • 12 PM – 4 PM', color: '#0b1f44', accent: '#0ea5e9' },
  { id: 'grand-opening', label: 'Grand Opening', headline: 'GRAND OPENING', detail: 'JOIN US THIS WEEKEND', color: '#7c2d12', accent: '#fb923c' },
  { id: 'now-hiring', label: 'Now Hiring', headline: 'NOW HIRING', detail: 'APPLY INSIDE', color: '#0f172a', accent: '#16a34a' },
  { id: 'for-sale', label: 'For Sale', headline: 'FOR SALE', detail: 'CALL FOR DETAILS', color: '#991b1b', accent: '#1d4ed8' },
  { id: 'no-parking', label: 'No Parking', headline: 'NO PARKING', detail: 'AUTHORIZED VEHICLES ONLY', color: '#b91c1c', accent: '#111827' },
  { id: 'directional', label: 'Directional', headline: 'THIS WAY →', detail: 'WELCOME', color: '#0b1f44', accent: '#0ea5e9' },
  { id: 'vote', label: 'Campaign', headline: 'VOTE', detail: 'ELECTION DAY', color: '#1e3a8a', accent: '#dc2626' }
] as const;

const ARTWORK_EDITOR_ICONS = [
  ['★', 'Star', 'favorite rating'], ['☆', 'Outline Star', 'favorite rating'], ['➜', 'Right Arrow', 'direction arrow'], ['←', 'Left Arrow', 'direction arrow'],
  ['↑', 'Up Arrow', 'direction arrow'], ['↓', 'Down Arrow', 'direction arrow'], ['✓', 'Check', 'approved yes'], ['✕', 'X Mark', 'no close'],
  ['●', 'Dot', 'circle bullet'], ['◆', 'Diamond', 'shape'], ['♥', 'Heart', 'love'], ['⌂', 'Home', 'house real estate'],
  ['☎', 'Phone', 'call contact'], ['✉', 'Mail', 'email contact'], ['⌖', 'Location', 'map pin'], ['ⓘ', 'Information', 'info'],
  ['⚠', 'Warning', 'caution'], ['♿', 'Accessible', 'accessibility handicap'], ['Ⓟ', 'Parking', 'parking'], ['⊘', 'Prohibited', 'no prohibited'],
  ['$', 'Dollar', 'sale price'], ['%', 'Percent', 'sale discount'], ['☀', 'Sun', 'weather'], ['☁', 'Cloud', 'weather'],
  ['✦', 'Sparkle', 'shine'], ['⚑', 'Flag', 'banner'], ['✂', 'Scissors', 'cut'], ['☕', 'Coffee', 'food drink'],
  ['⚙', 'Gear', 'service'], ['♻', 'Recycle', 'green'], ['◀', 'Left Chevron', 'direction'], ['▶', 'Right Chevron', 'direction']
] as const;

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
  { id: 'banner-vinyl', category: 'banners', title: 'Vinyl Banner', subtitle: 'Premium vinyl scrim', description: 'Stunningly vibrant indoor/outdoor banners available in 13 oz, 15 oz, and 18 oz vinyl weights.', mode: 'signage', signProductId: 'banner', badge: 'Online order', image: '/banners.png', initialSignValues: { material: '13-single', sides: 'single' } },
  { id: 'banner-mesh', category: 'banners', title: 'Mesh Banner', subtitle: '8 oz coated polyester mesh', description: 'Durable mesh banner material with 37% airflow perforation for fences and windy outdoor locations.', mode: 'signage', signProductId: 'mesh-banner', badge: 'Mesh', image: '/mesh.png', initialSignValues: { material: 'mesh-single', sides: 'single', webbing: false, rope: false, windSlits: false } },
  { id: 'coro-sheet', category: 'coro', title: 'CORO', subtitle: '48 x 96 sheet-based signs', description: 'Choose a cut size, upload finished art, and see sheet usage before ordering.', mode: 'signage', signProductId: 'yard-sign', badge: 'Sheet price', image: '/coro.png' },
  { id: 'rigid-acrylic', category: 'rigid', title: 'Acrylic Signs', subtitle: '3/16\" rigid plastic', description: 'Printed directly on the back with a white underbase for a polished, dimensional appearance.', mode: 'signage', signProductId: 'acrylic', badge: 'Online order', image: '/rigid-products.png', imageSprite: { column: 0, row: 0 } },
  { id: 'rigid-acm', category: 'rigid', title: 'ACM / Aluminum Composite', subtitle: '3mm or 6mm composite panels', description: 'Smooth aluminum faces bonded to a durable polyethylene core for professional indoor or outdoor signs.', mode: 'signage', signProductId: 'acm', badge: 'Online order', image: '/rigid-products.png', imageSprite: { column: 1, row: 0 } },
  { id: 'rigid-pvc', category: 'rigid', title: 'PVC Signs', subtitle: '3mm or 6mm smooth PVC', description: 'Smooth-finish PVC panels with sheet pricing. Add more pieces to fill the 48 x 96 production sheet and lower the price per piece.', mode: 'signage', signProductId: 'pvc', badge: 'Sheet price', image: '/rigid-products.png', imageSprite: { column: 2, row: 0 } },
  { id: 'rigid-foamcore', category: 'rigid', title: 'Foamcore', subtitle: '3/16\" smooth foam board', description: 'Sturdy, durable foam board with a smooth finish for indoor displays, presentations, and temporary signage.', mode: 'signage', signProductId: 'foamcore', badge: 'Sheet price', image: '/rigid-products.png', imageSprite: { column: 0, row: 1 } },
  { id: 'rigid-polystyrene', category: 'rigid', title: 'Polystyrene', subtitle: '0.03\" lightweight plastic', description: 'Lightweight, flexible plastic with a smooth finish and visual sheet usage for efficient per-piece pricing.', mode: 'signage', signProductId: 'polystyrene', badge: 'Sheet price', image: '/rigid-products.png', imageSprite: { column: 1, row: 1 } },
  { id: 'rigid-aluminum', category: 'rigid', title: 'Aluminum', subtitle: '.040 or .080 metal signage', description: 'Durable metal sign panels with a glossy finish for long-lasting professional signage.', mode: 'signage', signProductId: 'aluminum', badge: 'Online order', image: '/rigid-products.png', imageSprite: { column: 2, row: 1 } },
  { id: 'decals-vinyl', category: 'decals', title: 'Adhesive Vinyl', subtitle: 'Decals and window graphics', description: 'Upload-ready decal ordering with fit checks.', mode: 'signage', signProductId: 'vinyl', badge: 'Online order', image: '/vinyl-roll.webp' },
  { id: 'magnets-vehicle', category: 'magnets', title: 'Vehicle Magnet', subtitle: 'Mobile advertising, premium weight', description: 'Standard vehicle magnet ordering with size and artwork checks.', mode: 'signage', signProductId: 'vehicle-magnet', badge: 'Premium', image: '/magnet-vehicle.webp' },
  { id: 'magnets-custom', category: 'magnets', title: 'Custom Magnet', subtitle: 'Custom sizes and contour cuts', description: 'Upload custom magnet art, set size, and price through Hue API.', mode: 'signage', signProductId: 'vehicle-magnet', badge: 'Custom', image: '/magnet-custom.webp', initialSignValues: { customCut: true, contourCut: true, size: 'custom', width: '0', height: '0' } },
  { id: 'misc-poster', category: 'misc', title: 'Poster', subtitle: '8 mil bright white paper', description: 'Smooth satin-finish poster paper with a bright white surface for crisp, vivid full-color printing.', mode: 'signage', signProductId: 'poster', badge: 'Online order' },
  { id: 'misc-business-card', category: 'misc', title: 'Business Cards', subtitle: 'Print-ready cards', description: 'Upload finished card art and price through Hue API.', mode: 'signage', signProductId: 'business-card', badge: 'Online order', initialSignValues: { quantity: '250' } },
  { id: 'misc-handheld-paper', category: 'misc', title: 'Handheld Paper', subtitle: 'Great for promotions', description: 'Professional-grade paper for business cards, postcards, mailers, flyers, and handouts with vivid full-color printing and gloss or matte finishes.', mode: 'signage', signProductId: 'handheld-paper', badge: 'Online order' },
  { id: 'misc-carbonless', category: 'misc', title: 'Carbonless Forms', subtitle: 'NCR form printing', description: 'Carbonless form options and online ordering are still being prepared.', mode: 'signage', signProductId: 'carbonless', badge: 'Coming soon', disabled: true },
  { id: 'misc-door-hanger', category: 'misc', title: 'Door Hangers', subtitle: 'Custom printed door hangers', description: 'Door hanger sizes, finishing options, and online ordering are coming soon.', mode: 'signage', signProductId: 'door-hanger', badge: 'Coming soon', disabled: true },
  { id: 'apparel-screenprint', category: 'apparel', title: 'Full Screen Print Designer', subtitle: 'Complete screen print design studio', description: 'A full garment catalog, artwork designer, print locations, and production pricing are in development.', mode: 'apparel', badge: 'Coming soon', image: '/apparel-screenprint.svg', disabled: true },
  { id: 'apparel-dtg', category: 'apparel', title: 'DTG — Direct to Garment', subtitle: 'Full-color printing directly on the shirt', description: 'Choose a garment, color, sizes, print location, and upload front or back artwork.', mode: 'apparel', badge: 'Coming soon', image: '/apparel-dtg.svg', disabled: true },
  { id: 'apparel-dtf', category: 'apparel', title: 'DTF — Direct to Film', subtitle: 'Versatile full-color heat transfers', description: 'Online ordering for ready-to-press transfers and decorated apparel is coming soon.', mode: 'apparel', badge: 'Coming soon', image: '/apparel-dtf.svg', disabled: true }
];
const CORO_SHEET = { width: 48, height: 96 };
const BANNER_PREVIEW_DPI = 150;
const GENERATED_ARTWORK_MAX_DPI = 300;
const GENERATED_ARTWORK_MAX_BYTES = 40 * 1024 * 1024;
const GENERATED_ARTWORK_MAX_CANVAS_SIDE = 12000;
const GENERATED_ARTWORK_MAX_CANVAS_PIXELS = 60_000_000;

const roundPrintDimension = (dimension: number) => {
  const nearestQuarterInch = Math.round(dimension * 4) / 4;
  return Math.abs(dimension - nearestQuarterInch) <= 0.03 ? nearestQuarterInch : Number(dimension.toFixed(2));
};

const getArtworkPrintSize = (width: number, height: number, resolution?: ImageResolution | null) => ({
  width: Math.max(1, roundPrintDimension(width / (resolution?.dpiX || BANNER_PREVIEW_DPI))),
  height: Math.max(1, roundPrintDimension(height / (resolution?.dpiY || BANNER_PREVIEW_DPI)))
});

const isUsableImageDpi = (dpi: number) => Number.isFinite(dpi) && dpi >= 20 && dpi <= 2400;

const readEmbeddedImageResolution = async (blob: Blob): Promise<ImageResolution | null> => {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const isPng = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (isPng) {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset, false);
      const dataOffset = offset + 8;
      if (dataOffset + length + 4 > bytes.length) break;
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      if (type === 'pHYs' && length >= 9 && bytes[dataOffset + 8] === 1) {
        const dpiX = view.getUint32(dataOffset, false) * 0.0254;
        const dpiY = view.getUint32(dataOffset + 4, false) * 0.0254;
        return isUsableImageDpi(dpiX) && isUsableImageDpi(dpiY) ? { dpiX, dpiY } : null;
      }
      offset = dataOffset + length + 4;
    }
  }

  const isJpeg = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
  if (isJpeg) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      const segmentLength = view.getUint16(offset + 2, false);
      if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) break;
      const dataOffset = offset + 4;
      const isJfif = marker === 0xe0 && segmentLength >= 14
        && bytes[dataOffset] === 0x4a && bytes[dataOffset + 1] === 0x46 && bytes[dataOffset + 2] === 0x49 && bytes[dataOffset + 3] === 0x46 && bytes[dataOffset + 4] === 0;
      if (isJfif) {
        const units = bytes[dataOffset + 7];
        const densityX = view.getUint16(dataOffset + 8, false);
        const densityY = view.getUint16(dataOffset + 10, false);
        const dpiX = units === 1 ? densityX : units === 2 ? densityX * 2.54 : 0;
        const dpiY = units === 1 ? densityY : units === 2 ? densityY * 2.54 : 0;
        return isUsableImageDpi(dpiX) && isUsableImageDpi(dpiY) ? { dpiX, dpiY } : null;
      }
      offset += 2 + segmentLength;
    }
  }
  return null;
};

const formatArtworkInches = (width: number, height: number, signWidth?: number, signHeight?: number) => {
  if (signWidth && signHeight) return `${signWidth}\u2033 \u00d7 ${signHeight}\u2033`;
  if (!width || !height) return 'Size unavailable';
  const printSize = getArtworkPrintSize(width, height);
  return `${printSize.width}\u2033 \u00d7 ${printSize.height}\u2033`;
};

const getPrintSafePixelSize = (sourceWidth: number, sourceHeight: number, printSize: { width: number; height: number }) => {
  const maxPrintWidth = Math.max(1, Math.round(printSize.width * GENERATED_ARTWORK_MAX_DPI));
  const maxPrintHeight = Math.max(1, Math.round(printSize.height * GENERATED_ARTWORK_MAX_DPI));
  const scale = Math.min(
    1,
    maxPrintWidth / Math.max(1, sourceWidth),
    maxPrintHeight / Math.max(1, sourceHeight),
    GENERATED_ARTWORK_MAX_CANVAS_SIDE / Math.max(1, sourceWidth),
    GENERATED_ARTWORK_MAX_CANVAS_SIDE / Math.max(1, sourceHeight),
    Math.sqrt(GENERATED_ARTWORK_MAX_CANVAS_PIXELS / Math.max(1, sourceWidth * sourceHeight))
  );
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
    scale
  };
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The generated artwork could not be prepared for storage.'));
  reader.onerror = () => reject(new Error('The generated artwork could not be prepared for storage.'));
  reader.readAsDataURL(blob);
});

const loadImageElement = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('The generated artwork preview could not be loaded.'));
  image.src = src;
});

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The generated artwork could not be compressed.')), type, quality);
});

const pngCrc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const writePngResolution = async (blob: Blob, dpi: number) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length < 33 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) return blob;
  const pixelsPerMeter = Math.max(1, Math.round(dpi / 0.0254));
  const chunk = new Uint8Array(21);
  const chunkView = new DataView(chunk.buffer);
  chunkView.setUint32(0, 9, false);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  chunkView.setUint32(8, pixelsPerMeter, false);
  chunkView.setUint32(12, pixelsPerMeter, false);
  chunk[16] = 1;
  chunkView.setUint32(17, pngCrc32(chunk.slice(4, 17)), false);
  const parts: Uint8Array[] = [bytes.slice(0, 8)];
  let offset = 8;
  let inserted = false;
  while (offset + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
    const end = offset + 12 + length;
    if (end > bytes.length) return blob;
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (type !== 'pHYs') parts.push(bytes.slice(offset, end));
    if (type === 'IHDR' && !inserted) { parts.push(chunk); inserted = true; }
    offset = end;
  }
  const totalLength = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(totalLength);
  let outputOffset = 0;
  for (const part of parts) { output.set(part, outputOffset); outputOffset += part.length; }
  return new Blob([output], { type: 'image/png' });
};

const renderProductionArtwork = async (options: { dataUrl: string; name: string; width: number; height: number; fitState: ArtworkFitState; sourceWidth?: number; sourceHeight?: number; transparentBackground?: boolean }) => {
  const sourceUrl = options.dataUrl.startsWith('data:')
    ? options.dataUrl
    : await fetch(options.dataUrl).then((response) => {
      if (!response.ok) throw new Error(`Could not download ${options.name} for production rendering.`);
      return response.blob();
    }).then(blobToDataUrl);
  const image = await loadImageElement(sourceUrl);
  const requestedWidth = Math.max(1, Math.round(options.width * BANNER_PREVIEW_DPI));
  const requestedHeight = Math.max(1, Math.round(options.height * BANNER_PREVIEW_DPI));
  const outputScale = Math.min(
    1,
    GENERATED_ARTWORK_MAX_CANVAS_SIDE / requestedWidth,
    GENERATED_ARTWORK_MAX_CANVAS_SIDE / requestedHeight,
    Math.sqrt(GENERATED_ARTWORK_MAX_CANVAS_PIXELS / Math.max(1, requestedWidth * requestedHeight))
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(requestedWidth * outputScale));
  canvas.height = Math.max(1, Math.round(requestedHeight * outputScale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The final production artwork could not be rendered.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  if (!options.transparentBackground) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const sourceRatio = image.naturalWidth / Math.max(1, image.naturalHeight);
  const outputRatio = canvas.width / Math.max(1, canvas.height);
  const ratioDifference = Math.abs(sourceRatio - outputRatio) / outputRatio;
  const isFullBleedMatch = ratioDifference <= 0.005;
  if (options.fitState === 'stretch') {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } else if (options.fitState === 'fit' && options.sourceWidth && options.sourceHeight) {
    const drawWidth = Math.max(1, (options.sourceWidth / Math.max(1, options.width)) * canvas.width);
    const drawHeight = Math.max(1, (options.sourceHeight / Math.max(1, options.height)) * canvas.height);
    context.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
  } else if (isFullBleedMatch) {
    const scale = Math.max(canvas.width / Math.max(1, image.naturalWidth), canvas.height / Math.max(1, image.naturalHeight));
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
  } else {
    const scale = Math.min(canvas.width / Math.max(1, image.naturalWidth), canvas.height / Math.max(1, image.naturalHeight));
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
  }
  const createScaledCanvas = (scale: number) => {
    if (scale === 1) return canvas;
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = Math.max(1, Math.round(canvas.width * scale));
    scaledCanvas.height = Math.max(1, Math.round(canvas.height * scale));
    const scaledContext = scaledCanvas.getContext('2d');
    if (!scaledContext) throw new Error('The final production artwork could not be resized for storage.');
    scaledContext.imageSmoothingEnabled = true;
    scaledContext.imageSmoothingQuality = 'high';
    if (!options.transparentBackground) {
      scaledContext.fillStyle = '#ffffff';
      scaledContext.fillRect(0, 0, scaledCanvas.width, scaledCanvas.height);
    }
    scaledContext.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
    return scaledCanvas;
  };

  let storageScale = 1;
  let outputCanvas = canvas;
  let mimeType = 'image/png';
  let extension = 'png';
  let blob: Blob;
  const shouldPreferJpeg = !options.transparentBackground && canvas.width * canvas.height >= 24_000_000;

  if (shouldPreferJpeg) {
    mimeType = 'image/jpeg';
    extension = 'jpg';
    blob = await canvasToBlob(outputCanvas, mimeType, 0.95);
  } else {
    blob = await writePngResolution(await canvasToBlob(outputCanvas, mimeType), BANNER_PREVIEW_DPI * outputScale);
  }

  if (blob.size > GENERATED_ARTWORK_MAX_BYTES && !options.transparentBackground) {
    mimeType = 'image/jpeg';
    extension = 'jpg';
    for (const quality of [0.95, 0.92, 0.88, 0.84]) {
      blob = await canvasToBlob(outputCanvas, mimeType, quality);
      if (blob.size <= GENERATED_ARTWORK_MAX_BYTES) break;
    }
  }

  for (const scale of [0.9, 0.8, 0.7, 0.6, 0.5]) {
    if (blob.size <= GENERATED_ARTWORK_MAX_BYTES) break;
    storageScale = scale;
    outputCanvas = createScaledCanvas(scale);
    blob = options.transparentBackground
      ? await writePngResolution(await canvasToBlob(outputCanvas, 'image/png'), BANNER_PREVIEW_DPI * outputScale * storageScale)
      : await canvasToBlob(outputCanvas, 'image/jpeg', 0.9);
  }

  if (blob.size > GENERATED_ARTWORK_MAX_BYTES) {
    throw new Error('The finished artwork is still too large to save safely. Try a smaller source file or contact Hue Graphics for help.');
  }
  const baseName = options.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'artwork';
  const mode = options.fitState === 'stretch' ? 'FIT-STRETCHED' : options.fitState === 'fit' ? 'CENTERED' : isFullBleedMatch ? 'FULL-BLEED' : 'FIT';
  const fileName = `FINAL-PRODUCTION-${baseName}-${options.width}x${options.height}-${mode}.${extension}`;
  return { file: new File([blob], fileName, { type: mimeType }), width: outputCanvas.width, height: outputCanvas.height, name: fileName };
};

const normalizeGeneratedArtworkForStorage = async (dataUrl: string, fileName: string, printSize: { width: number; height: number }) => {
  const source = await loadImageElement(dataUrl);
  const safeSize = getPrintSafePixelSize(source.naturalWidth || source.width, source.naturalHeight || source.height, printSize);
  const canvas = document.createElement('canvas');
  const drawAtScale = (scale: number) => {
    canvas.width = Math.max(1, Math.round(safeSize.width * scale));
    canvas.height = Math.max(1, Math.round(safeSize.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The generated artwork could not be rendered.');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
  };
  drawAtScale(1);
  let blob = await canvasToBlob(canvas, 'image/png');
  let mimeType = 'image/png';
  let outputName = fileName.replace(/\.[^.]+$/, '.png');
  for (const scale of [0.9, 0.8, 0.7, 0.6, 0.5]) {
    if (blob.size <= GENERATED_ARTWORK_MAX_BYTES) break;
    drawAtScale(scale);
    blob = await canvasToBlob(canvas, 'image/png');
  }
  if (blob.size > GENERATED_ARTWORK_MAX_BYTES) {
    for (const quality of [0.92, 0.86, 0.8, 0.72]) {
      const webpBlob = await canvasToBlob(canvas, 'image/webp', quality);
      if (webpBlob.size < blob.size) {
        blob = webpBlob;
        mimeType = 'image/webp';
        outputName = fileName.replace(/\.[^.]+$/, '.webp');
      }
      if (blob.size <= GENERATED_ARTWORK_MAX_BYTES) break;
    }
  }
  if (blob.size > GENERATED_ARTWORK_MAX_BYTES) throw new Error('The generated artwork is still too large to save. Try a smaller artboard or simplify the design.');
  const normalizedDataUrl = await blobToDataUrl(blob);
  return {
    dataUrl: normalizedDataUrl,
    file: new File([blob], outputName, { type: mimeType }),
    width: canvas.width,
    height: canvas.height,
    mimeType,
    fileName: outputName
  };
};
const RIGID_SIGN_PRODUCT_IDS: SignProductId[] = ['acrylic', 'acm', 'pvc', 'foamcore', 'polystyrene', 'aluminum'];
const SHEET_PRICED_PRODUCT_IDS: SignProductId[] = ['yard-sign', 'pvc', 'foamcore', 'polystyrene'];
const SEPARATE_BACK_ARTWORK_PRODUCT_IDS: SignProductId[] = ['banner', 'business-card', 'handheld-paper', 'acm', 'pvc', 'foamcore', 'polystyrene', 'aluminum'];
const DOUBLE_SIDED_PRODUCT_IDS: SignProductId[] = ['banner', 'yard-sign', ...SEPARATE_BACK_ARTWORK_PRODUCT_IDS.filter((id) => id !== 'banner')];
const BANNER_MATERIAL_OPTIONS = [
  { value: '13-single', label: '13oz Vinyl', note: 'Vibrant premium vinyl scrim for everyday indoor/outdoor banners' },
  { value: '15-single', label: '15oz Vinyl', note: 'Heavier vibrant premium vinyl scrim' },
  { value: '18-single', label: '18oz Vinyl', note: 'Heavy premium vinyl scrim required for double-sided banners' }
];
const getBannerMaterialLabel = (value?: string) => BANNER_MATERIAL_OPTIONS.find((option) => option.value === value)?.label || value || 'Standard';
const MESH_BANNER_MATERIAL = { value: 'mesh-single', label: '8oz Mesh Banner', note: 'Durable coated polyester with 37% airflow perforation' };
const BASIC_SIGN_MATERIAL_OPTIONS = [
  { value: 'standard', label: 'Standard', note: 'Default material from Hue pricing API' }
];
const POSTER_PAPER_MATERIAL_OPTIONS = [
  { value: 'standard', label: 'Poster Paper', note: '8 mil bright white paper with a smooth satin finish' }
];
const RIGID_PANEL_MATERIAL_OPTIONS = [
  { value: 'standard', label: 'Standard', note: 'Default rigid panel option' }
];
const ACRYLIC_MATERIAL_OPTIONS = [
  { value: 'standard', label: '3/16\" Acrylic', note: 'Rigid plastic printed directly on the back with a white underbase' }
];
const FOAMCORE_MATERIAL_OPTIONS = [
  { value: 'standard', label: '3/16\" Foamcore', note: 'Sturdy foam board with a smooth finish' }
];
const POLYSTYRENE_MATERIAL_OPTIONS = [
  { value: 'standard', label: '0.03\" Polystyrene', note: 'Lightweight, flexible plastic with a smooth finish' }
];
const PVC_MATERIAL_OPTIONS = [
  { value: '3mm', label: '3mm PVC', note: 'Smooth-finish PVC material' },
  { value: '6mm', label: '6mm PVC', note: 'Thicker smooth-finish PVC material' }
];
const ACM_MATERIAL_OPTIONS = [
  { value: '3mm', label: '3mm ACM', note: 'Smooth aluminum faces with a polyethylene core' },
  { value: '6mm', label: '6mm ACM', note: 'Thicker panel with smooth aluminum faces and a polyethylene core' }
];
const ALUMINUM_MATERIAL_OPTIONS = [
  { value: '040', label: '.040 Aluminum', note: 'Durable metal signage with a glossy finish' },
  { value: '080', label: '.080 Aluminum', note: 'Heavy-duty metal signage with a glossy finish' }
];
const CORO_SIZE_OPTIONS = [
  { label: 'Custom Size / Mixed Sizes', value: 'custom' },
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
  { label: 'None', value: 'none', note: 'Square finished corners' },
  { label: '1/2" Radius', value: '0.5', note: 'Subtle rounded corners · +$5' },
  { label: '1" Radius', value: '1', note: 'Larger rounded corners · +$5' }
];
const SIGN_PRODUCT_CONFIGS: SignProductConfig[] = [
  {
    id: 'banner',
    name: 'Vinyl Banner',
    apiSlug: 'banner',
    description: 'Stunningly vibrant premium vinyl scrim available in 13 oz, 15 oz, and 18 oz weights.',
    preview: 'banner',
    fields: [
      { name: 'width', label: 'Width (inches)', type: 'number', defaultValue: '0', step: '0.25' },
      { name: 'height', label: 'Height (inches)', type: 'number', defaultValue: '0', step: '0.25' },
      { name: 'quantity', label: 'Quantity', type: 'number', defaultValue: '1', step: '1' },
      {
        name: 'material',
        label: 'Material',
        type: 'select',
        defaultValue: '13-single',
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
      { name: 'windSlits', label: 'Wind Slits', type: 'checkbox', defaultValue: false }
    ]
  },
  {
    id: 'mesh-banner',
    name: 'Mesh Banner',
    apiSlug: 'mesh-banner',
    description: 'Durable 8 oz coated polyester mesh with 37% airflow perforation.',
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
      { name: 'polePocket', label: 'Pole Pocket', type: 'checkbox', defaultValue: false }
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
  },
  ...([
    ['acrylic', 'Acrylic Signs', '3/16\" rigid plastic printed directly on the back with a white underbase.', ACRYLIC_MATERIAL_OPTIONS],
    ['acm', 'ACM / Aluminum Composite', '3mm and 6mm panels with smooth aluminum faces bonded to a polyethylene core.', ACM_MATERIAL_OPTIONS],
    ['pvc', 'PVC Signs', '3mm and 6mm smooth-finish PVC material.', PVC_MATERIAL_OPTIONS],
    ['foamcore', 'Foamcore', '3/16\" sturdy, durable foam board with a smooth finish.', FOAMCORE_MATERIAL_OPTIONS],
    ['polystyrene', 'Polystyrene', '0.03\" lightweight, flexible plastic with a smooth finish.', POLYSTYRENE_MATERIAL_OPTIONS],
    ['aluminum', 'Aluminum', '.040 and .080 durable metal signage with a glossy finish.', ALUMINUM_MATERIAL_OPTIONS],
    ['vinyl', 'Adhesive Vinyl', 'Adhesive vinyl decals and window graphics.', BASIC_SIGN_MATERIAL_OPTIONS],
    ['custom-cut-coroplast', 'Custom Cut Coroplast', 'Custom-cut coroplast sign shapes.', BASIC_SIGN_MATERIAL_OPTIONS],
    ['vehicle-magnet', 'Vehicle Magnet', 'Vehicle and display magnets.', BASIC_SIGN_MATERIAL_OPTIONS],
    ['poster', 'Poster', '8 mil bright white poster paper with a smooth satin finish for crisp, vivid full-color printing.', POSTER_PAPER_MATERIAL_OPTIONS],
    ['business-card', 'Business Cards', 'Print-ready business cards.', BASIC_SIGN_MATERIAL_OPTIONS],
    ['handheld-paper', 'Handheld Paper', 'Professional-grade promotional paper for business cards, postcards, mailers, flyers, and handouts with vivid full-color printing and gloss or matte finishes.', BASIC_SIGN_MATERIAL_OPTIONS],
    ['carbonless', 'Carbonless Forms', 'Carbonless NCR form printing.', BASIC_SIGN_MATERIAL_OPTIONS],
    ['door-hanger', 'Door Hanger', 'Print-ready door hanger products.', BASIC_SIGN_MATERIAL_OPTIONS]
  ] as [SignProductId, string, string, SignFieldOption[]][]).map(([id, name, description, materialOptions]) => ({
    id,
    name,
    apiSlug: id,
    description,
    preview: 'banner' as const,
    fields: id === 'business-card'
      ? [
          { name: 'width', label: 'Width (inches)', type: 'number' as const, defaultValue: '3.5', step: '0.25' },
          { name: 'height', label: 'Height (inches)', type: 'number' as const, defaultValue: '2', step: '0.25' },
          { name: 'quantity', label: 'Quantity', type: 'number' as const, defaultValue: '250', step: '1' },
          {
            name: 'orientation',
            label: 'Orientation',
            type: 'select' as const,
            defaultValue: 'Landscape',
            options: [
              { label: 'Landscape (3.5" × 2")', value: 'Landscape' },
              { label: 'Portrait (2" × 3.5")', value: 'Portrait' }
            ]
          },
          {
            name: 'coating',
            label: 'Coating',
            type: 'select' as const,
            defaultValue: 'No Coating',
            options: [
              { label: 'No Coating', value: 'No Coating' },
              { label: 'Gloss Laminate', value: 'Gloss Laminate' }
            ]
          },
          { name: 'material', label: 'Stock', type: 'select' as const, defaultValue: materialOptions[0]?.value || 'standard', options: materialOptions },
          {
            name: 'sides',
            label: 'Print Sides',
            type: 'select' as const,
            defaultValue: 'single',
            options: [
              { label: 'Single-Sided', value: 'single' },
              { label: 'Double-Sided', value: 'double' }
            ]
          }
        ]
      : id === 'vehicle-magnet'
      ? [
          { name: 'size', label: 'Size', type: 'select' as const, defaultValue: '', options: MAGNET_SIZE_OPTIONS },
          { name: 'quantity', label: 'Quantity', type: 'number' as const, defaultValue: '1', step: '1' },
          { name: 'roundedCorners', label: 'Rounded Corners', type: 'select' as const, defaultValue: 'none', options: ROUNDED_CORNER_OPTIONS },
          { name: 'material', label: 'Material', type: 'select' as const, defaultValue: materialOptions[0]?.value || 'standard', options: materialOptions },
          { name: 'sides', label: 'Print Sides', type: 'select' as const, defaultValue: 'single', options: [{ label: 'Single-Sided', value: 'single' }] },
          { name: 'customCut', label: 'Custom Cut', type: 'checkbox' as const, defaultValue: false },
          { name: 'contourCut', label: 'Contour Cut', type: 'checkbox' as const, defaultValue: false }
        ]
      : SHEET_PRICED_PRODUCT_IDS.includes(id)
        ? [
            { name: 'size', label: 'Size', type: 'select' as const, defaultValue: '24x18', options: CORO_SIZE_OPTIONS },
            { name: 'width', label: 'Width (inches)', type: 'number' as const, defaultValue: '24', step: '0.25' },
            { name: 'height', label: 'Height (inches)', type: 'number' as const, defaultValue: '18', step: '0.25' },
            { name: 'quantity', label: 'Quantity', type: 'number' as const, defaultValue: '10', step: '1' },
            { name: 'material', label: 'Material', type: 'select' as const, defaultValue: materialOptions[0]?.value || 'standard', options: materialOptions },
            {
              name: 'sides',
              label: 'Print Sides',
              type: 'select' as const,
              defaultValue: 'single',
              options: DOUBLE_SIDED_PRODUCT_IDS.includes(id)
                ? [
                    { label: 'Single-Sided', value: 'single' },
                    { label: 'Double-Sided', value: 'double' }
                  ]
                : [{ label: 'Single-Sided', value: 'single' }]
            },
            { name: 'grommets', label: 'Grommets', type: 'checkbox' as const, defaultValue: false }
          ]
      : id === 'acrylic'
        ? [
            { name: 'width', label: 'Width (inches)', type: 'number' as const, defaultValue: '0', step: '0.25' },
            { name: 'height', label: 'Height (inches)', type: 'number' as const, defaultValue: '0', step: '0.25' },
            { name: 'quantity', label: 'Quantity', type: 'number' as const, defaultValue: '1', step: '1' },
            { name: 'material', label: 'Material', type: 'select' as const, defaultValue: materialOptions[0]?.value || 'standard', options: materialOptions },
            { name: 'sides', label: 'Print Sides', type: 'select' as const, defaultValue: 'single', options: [{ label: 'Single-Sided', value: 'single' }] },
            { name: 'standOffs', label: 'Standoffs', type: 'checkbox' as const, defaultValue: false },
            { name: 'standOffQty', label: 'Standoff Quantity', type: 'number' as const, defaultValue: '4', step: '1' },
            { name: 'standOffColor', label: 'Standoff Color', type: 'select' as const, defaultValue: 'silver', options: [{ label: 'Silver', value: 'silver' }] },
            { name: 'roundedCorners', label: 'Rounded Corners', type: 'checkbox' as const, defaultValue: false }
          ]
      : [
          { name: 'width', label: 'Width (inches)', type: 'number' as const, defaultValue: '0', step: '0.25' },
          { name: 'height', label: 'Height (inches)', type: 'number' as const, defaultValue: '0', step: '0.25' },
          { name: 'quantity', label: 'Quantity', type: 'number' as const, defaultValue: '1', step: '1' },
          { name: 'material', label: 'Material', type: 'select' as const, defaultValue: materialOptions[0]?.value || 'standard', options: materialOptions },
          {
            name: 'sides',
            label: 'Print Sides',
            type: 'select' as const,
            defaultValue: 'single',
            options: DOUBLE_SIDED_PRODUCT_IDS.includes(id)
              ? [
                  { label: 'Single-Sided', value: 'single' },
                  { label: 'Double-Sided', value: 'double' }
                ]
              : [{ label: 'Single-Sided', value: 'single' }]
          },
          ...(['acm', 'aluminum'].includes(id) ? [{ name: 'roundedCorners', label: 'Rounded Corners', type: 'select' as const, defaultValue: 'none', options: ROUNDED_CORNER_OPTIONS }] : []),
          ...(id === 'poster' ? [] : [{ name: 'grommets', label: 'Grommets', type: 'checkbox' as const, defaultValue: false }])
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
    const material = String(values.material || '13-single');
    const isCustomMagnet = product.id === 'vehicle-magnet' && Boolean(values.customCut);
    const presetSize = product.id === 'vehicle-magnet' && !isCustomMagnet ? parsePresetSize(values.size) : null;
    const sheetPresetSize = SHEET_PRICED_PRODUCT_IDS.includes(product.id) && String(values.size || '') !== 'custom' ? parseCoroSize(values.size) : null;
    return {
      width: sheetPresetSize && sheetPresetSize.width > 0 ? sheetPresetSize.width : presetSize?.width ?? Number(values.width || 0),
      height: sheetPresetSize && sheetPresetSize.height > 0 ? sheetPresetSize.height : presetSize?.height ?? Number(values.height || 0),
      quantity: Number(values.quantity),
      material: product.id === 'banner' && isDoubleSided ? '18-single' : material,
      ...(['pvc', 'acm'].includes(product.id) ? { thickness: material, type: `${material.replace(/mm$/i, '')}-${isDoubleSided ? 'double' : 'single'}` } : {}),
      ...(product.id === 'aluminum' ? { thickness: material, type: `${material.replace(/^\./, '')}-${isDoubleSided ? 'double' : 'single'}` } : {}),
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
      ...(product.id === 'business-card' ? {
        coating: String(values.coating || 'No Coating'),
        orientation: String(values.orientation || 'Landscape')
      } : {}),
      roundedCorners: product.id === 'acrylic' || ['acm', 'aluminum'].includes(product.id) ? String(values.roundedCorners || 'none') !== 'none' : values.roundedCorners || 'none',
      ...(['acm', 'aluminum', 'vehicle-magnet'].includes(product.id) ? { roundedCornerRadius: String(values.roundedCorners || 'none') } : {}),
      standOffs: product.id === 'acrylic' && Boolean(values.standOffs),
      standOffQty: product.id === 'acrylic' && Boolean(values.standOffs) ? Math.max(1, Number(values.standOffQty || 4)) : 0,
      standOffColor: product.id === 'acrylic' && Boolean(values.standOffs) ? String(values.standOffColor || 'silver') : '',
      customCut: Boolean(values.customCut),
      contourCut: Boolean(values.contourCut)
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

const getCoroSheetLayout = (width: number, height: number, quantity: number, fluteDirection: string = 'auto') => {
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
  const direction = String(fluteDirection || 'auto').toLowerCase();
  const best = direction === 'horizontal'
    ? rotated
    : direction === 'vertical'
      ? normal
      : rotatedCount > normalCount ? rotated : normal;
  const signsPerSheet = Math.max(1, best.columns * best.rows);
  return {
    ...best,
    signsPerSheet,
    sheetCount: Math.max(1, Math.ceil(quantity / signsPerSheet))
  };
};

const packCustomCoroSheets = (items: ImageZoneItem[], quantities: CoroArtworkQuantityMap, fallbackWidth: number, fallbackHeight: number, respectFluteDirection = false) => {
  const sheets: { sheetNumber: number; quantity: number; cells: { item: ImageZoneItem; x: number; y: number; width: number; height: number; rotated?: boolean }[] }[] = [{ sheetNumber: 1, quantity: 0, cells: [] }];
  let x = 0;
  let y = 0;
  let rowHeight = 0;

  items.forEach((item) => {
    const rawWidth = Math.max(1, Number(item.signWidth || fallbackWidth || 1));
    const rawHeight = Math.max(1, Number(item.signHeight || fallbackHeight || 1));
    const direction = respectFluteDirection ? String(item.fluteDirection || 'auto').toLowerCase() : 'auto';
    const shouldRotate = direction === 'horizontal';
    const width = Math.min(CORO_SHEET.width, shouldRotate ? rawHeight : rawWidth);
    const height = Math.min(CORO_SHEET.height, shouldRotate ? rawWidth : rawHeight);
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
      currentSheet.cells.push({ item, x, y, width, height, rotated: shouldRotate });
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

const createTestOrderNumber = (timestamp: number) => {
  const orderDate = new Date(timestamp);
  const dateToken = `${orderDate.getFullYear()}${String(orderDate.getMonth() + 1).padStart(2, '0')}${String(orderDate.getDate()).padStart(2, '0')}`;
  const timeToken = `${String(orderDate.getHours()).padStart(2, '0')}${String(orderDate.getMinutes()).padStart(2, '0')}${String(orderDate.getSeconds()).padStart(2, '0')}`;
  const uniqueToken = Math.random().toString(36).slice(2, 5).toUpperCase().padEnd(3, 'X');
  return `TEST-${dateToken}-${timeToken}-${uniqueToken}`;
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
  return Math.abs(imageRatio - targetRatio) / targetRatio > 0.005;
};

const getFittedArtworkSize = (imageWidth: number | undefined, imageHeight: number | undefined, targetWidth: number, targetHeight: number) => {
  if (!imageWidth || !imageHeight || !targetWidth || !targetHeight) return { width: targetWidth, height: targetHeight };
  const scale = Math.min(targetWidth / imageWidth, targetHeight / imageHeight);
  return {
    width: Number((imageWidth * scale).toFixed(2)),
    height: Number((imageHeight * scale).toFixed(2))
  };
};

const dimensionMatches = (actual: number | undefined, expected: number | undefined, tolerance = 0.06) => (
  Boolean(actual && expected) && Math.abs(Number(actual) - Number(expected)) <= tolerance
);

const artworkPrintSizeMatchesTarget = (
  imageWidth: number | undefined,
  imageHeight: number | undefined,
  targetWidth: number,
  targetHeight: number,
  dpi?: number,
  detectedWidth?: number,
  detectedHeight?: number
) => {
  if (!targetWidth || !targetHeight) return false;
  const printSize = detectedWidth && detectedHeight
    ? { width: Number(detectedWidth), height: Number(detectedHeight) }
    : imageWidth && imageHeight
      ? getArtworkPrintSize(imageWidth, imageHeight, isUsableImageDpi(Number(dpi || 0)) ? { dpiX: Number(dpi), dpiY: Number(dpi) } : null)
      : null;
  if (!printSize) return false;
  return dimensionMatches(printSize.width, targetWidth) && dimensionMatches(printSize.height, targetHeight);
};

const getArtworkSourcePrintSize = (
  imageWidth: number | undefined,
  imageHeight: number | undefined,
  dpi?: number,
  detectedWidth?: number,
  detectedHeight?: number
) => detectedWidth && detectedHeight
  ? { width: Number(detectedWidth), height: Number(detectedHeight) }
  : imageWidth && imageHeight
    ? getArtworkPrintSize(imageWidth, imageHeight, isUsableImageDpi(Number(dpi || 0)) ? { dpiX: Number(dpi), dpiY: Number(dpi) } : null)
    : null;

const getCenteredArtworkStyle = (
  imageWidth: number | undefined,
  imageHeight: number | undefined,
  targetWidth: number,
  targetHeight: number,
  dpi?: number,
  detectedWidth?: number,
  detectedHeight?: number
) => {
  const sourceSize = getArtworkSourcePrintSize(imageWidth, imageHeight, dpi, detectedWidth, detectedHeight);
  if (!sourceSize || !targetWidth || !targetHeight) return {};
  return {
    width: `${Math.max(1, (sourceSize.width / targetWidth) * 100)}%`,
    height: `${Math.max(1, (sourceSize.height / targetHeight) * 100)}%`
  };
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
  const [dtgGarment] = useState('Bella+Canvas BC3001 Unisex Jersey Tee');
  const [dtgColor, setDtgColor] = useState('#ffffff');
  const [dtgSide, setDtgSide] = useState<ShirtView>('front');
  const [dtgArtwork, setDtgArtwork] = useState<Record<ShirtView, { name: string; dataUrl: string } | null>>({ front: null, back: null });
  const [dtgPrintWidth, setDtgPrintWidth] = useState(7.5);
  const [dtgSmartScale, setDtgSmartScale] = useState(true);
  const [dtgQuantities, setDtgQuantities] = useState<Record<DtgSize, number>>({ S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0 });
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
  const [lockSignProportions, setLockSignProportions] = useState(true);
  const [signArtworkPreviewUrl, setSignArtworkPreviewUrl] = useState<string | null>(null);
  const [signArtworkDisplayUrl, setSignArtworkDisplayUrl] = useState<string | null>(null);
  const [bannerArtworkName, setBannerArtworkName] = useState('');
  const [bannerArtworkFitState, setBannerArtworkFitState] = useState<ArtworkFitState>('unresolved');
  const [bannerOrderItems, setBannerOrderItems] = useState<BannerOrderItem[]>([]);
  const [activeBannerSetNumber, setActiveBannerSetNumber] = useState(1);
  const [pendingBannerPlacement, setPendingBannerPlacement] = useState<{ dataUrl: string; name: string; width: number; height: number; printWidth: number; printHeight: number } | null>(null);
  const [rigidBackArtwork, setRigidBackArtwork] = useState<ImageZoneItem | null>(null);
  const [rigidArtworkTarget, setRigidArtworkTarget] = useState<CoroArtworkSide>('front');
  const [rigidPreviewSide, setRigidPreviewSide] = useState<CoroArtworkSide>('front');
  const [coroSheetArtworkItems, setCoroSheetArtworkItems] = useState<ImageZoneItem[]>([]);
  const [coroArtworkQuantities, setCoroArtworkQuantities] = useState<CoroArtworkQuantityMap>({});
  const [showImageZone, setShowImageZone] = useState(false);
  const [showAcrylicTransparencyNotice, setShowAcrylicTransparencyNotice] = useState(false);
  const [acrylicTransparencyAcknowledged, setAcrylicTransparencyAcknowledged] = useState(false);
  const [acrylicNoticeAction, setAcrylicNoticeAction] = useState<'library' | 'upload'>('library');
  const [imageZoneItems, setImageZoneItems] = useState<ImageZoneItem[]>([]);
  const [selectedImageZoneId, setSelectedImageZoneId] = useState<string | null>(null);
  const [imageLibraryStatus, setImageLibraryStatus] = useState('');
  const [isImageLibraryLoading, setIsImageLibraryLoading] = useState(false);
  const [deletingImageZoneId, setDeletingImageZoneId] = useState<string | null>(null);
  const [imageZoneProductChoice, setImageZoneProductChoice] = useState<ImageZoneItem | null>(null);
  const [showMainMenu, setShowMainMenu] = useState(false);
  const [queuedImageZonePlacement, setQueuedImageZonePlacement] = useState<{ item: ImageZoneItem; product: StoreProductCard } | null>(null);
  const [queuedImageZonePlacementAttempt, setQueuedImageZonePlacementAttempt] = useState(0);
  const [showCanvaImport, setShowCanvaImport] = useState(false);
  const [canvaImportStatus, setCanvaImportStatus] = useState<CanvaImportStatus | null>(null);
  const [isCanvaImportLoading, setIsCanvaImportLoading] = useState(false);
  const [canvaDesigns, setCanvaDesigns] = useState<CanvaDesign[]>([]);
  const [isCanvaDesignsLoading, setIsCanvaDesignsLoading] = useState(false);
  const [canvaDesignSearch, setCanvaDesignSearch] = useState('');
  const [canvaDesignStatus, setCanvaDesignStatus] = useState('');
  const [importingCanvaDesignId, setImportingCanvaDesignId] = useState<string | null>(null);
  const [showAiImageEditor, setShowAiImageEditor] = useState(false);
  const [aiEditPrompt, setAiEditPrompt] = useState('');
  const [aiEditAction, setAiEditAction] = useState<'restore' | 'remove-background' | 'remove' | 'background' | 'recolor' | 'replace' | 'quality-check'>('restore');
  const [aiEditTargetColor, setAiEditTargetColor] = useState('#0ea5e9');
  const [aiEditQuality, setAiEditQuality] = useState<'low' | 'medium' | 'high'>('low');
  const [aiEditStatus, setAiEditStatus] = useState('');
  const [isAiEditing, setIsAiEditing] = useState(false);
  const [aiEditSource, setAiEditSource] = useState<ImageZoneItem | null>(null);
  const [aiEditPreview, setAiEditPreview] = useState<{ dataUrl: string; width: number; height: number; source: ImageZoneItem } | null>(null);
  const [showArtworkEditor, setShowArtworkEditor] = useState(false);
  const [artworkEditorOrderReturn, setArtworkEditorOrderReturn] = useState<ArtworkEditorOrderReturn | null>(null);
  const [artworkEditorLaunchContext, setArtworkEditorLaunchContext] = useState<'home-create' | 'image-zone-create' | 'image-zone-edit' | 'order'>('home-create');
  const [showNewArtworkDialog, setShowNewArtworkDialog] = useState(false);
  const [newArtworkPresetGroupId, setNewArtworkPresetGroupId] = useState('yard-signs');
  const [newArtworkPresetKey, setNewArtworkPresetKey] = useState('24x18');
  const [newArtworkUseCustomSize, setNewArtworkUseCustomSize] = useState(false);
  const [newArtworkCustomWidth, setNewArtworkCustomWidth] = useState(24);
  const [newArtworkCustomHeight, setNewArtworkCustomHeight] = useState(18);
  const [newArtworkError, setNewArtworkError] = useState('');
  const [artworkEditorSource, setArtworkEditorSource] = useState<ImageZoneItem | null>(null);
  const [artworkEditorSide, setArtworkEditorSide] = useState<CoroArtworkSide>('front');
  const [artworkEditorHasBackSide, setArtworkEditorHasBackSide] = useState(false);
  const [artworkEditorStatus, setArtworkEditorStatus] = useState('');
  const [isArtworkEditorSaving, setIsArtworkEditorSaving] = useState(false);
  const [artworkEditorAiAction, setArtworkEditorAiAction] = useState<'remove-background' | 'restore' | null>(null);
  const [artworkEditorLayers, setArtworkEditorLayers] = useState<LayerItem[]>([]);
  const [artworkEditorActiveObject, setArtworkEditorActiveObject] = useState<FabricObject | null>(null);
  const [artworkEditorText, setArtworkEditorText] = useState('Your text');
  const [artworkEditorFont, setArtworkEditorFont] = useState(FONT_OPTIONS[0].value);
  const [artworkEditorFontSize, setArtworkEditorFontSize] = useState(54);
  const [artworkEditorCharSpacing, setArtworkEditorCharSpacing] = useState(0);
  const [artworkEditorLineHeight, setArtworkEditorLineHeight] = useState(1.16);
  const [artworkEditorFill, setArtworkEditorFill] = useState('#0b1f44');
  const [artworkEditorStroke, setArtworkEditorStroke] = useState('#ffffff');
  const [artworkEditorStrokeWidth, setArtworkEditorStrokeWidth] = useState(0);
  const [artworkEditorOpacity, setArtworkEditorOpacity] = useState(100);
  const [artworkEditorBackground, setArtworkEditorBackground] = useState('#ffffff');
  const [artworkEditorBorderInset, setArtworkEditorBorderInset] = useState(0.5);
  const [artworkEditorBorderThickness, setArtworkEditorBorderThickness] = useState(0.5);
  const [artworkEditorBorderColor, setArtworkEditorBorderColor] = useState('#0b1f44');
  const [artworkEditorZoom, setArtworkEditorZoom] = useState(1);
  const [artworkEditorLeftPanelOpen, setArtworkEditorLeftPanelOpen] = useState(true);
  const [artworkEditorMobileView, setArtworkEditorMobileView] = useState<'canvas' | 'tools' | 'properties'>('canvas');
  const [artworkEditorSnapToCenter, setArtworkEditorSnapToCenter] = useState(true);
  const [artworkEditorShowGuides, setArtworkEditorShowGuides] = useState(true);
  const [artworkEditorPrintView, setArtworkEditorPrintView] = useState(false);
  const [showSmartTemplateLibrary, setShowSmartTemplateLibrary] = useState(false);
  const [smartTemplateCategory, setSmartTemplateCategory] = useState<'All' | SmartTemplateCategory>('All');
  const [smartTemplateStyle, setSmartTemplateStyle] = useState<'All' | SmartTemplateStyle>('All');
  const [smartTemplateFamily, setSmartTemplateFamily] = useState<'All' | SmartTemplateFamilyId>('All');
  const [smartTemplateBrowseMode, setSmartTemplateBrowseMode] = useState<SmartTemplateBrowseMode>('industry');
  const [smartTemplateSearch, setSmartTemplateSearch] = useState('');
  const [selectedSmartTemplateId, setSelectedSmartTemplateId] = useState<string | null>(null);
  const [smartTemplateForm, setSmartTemplateForm] = useState<SmartTemplateForm>({ headline: '', subheadline: '', name: '', phone: '', website: '', detailLine: '', footerNote: '', qrValue: '', primary: '#0b1f44', accent: '#0ea5e9', background: '#ffffff', includeQr: false });
  const [smartTemplateLogo, setSmartTemplateLogo] = useState<{ name: string; dataUrl: string } | null>(null);
  const [smartTemplatePhoto, setSmartTemplatePhoto] = useState<{ name: string; dataUrl: string } | null>(null);
  const [isGeneratingSmartTemplate, setIsGeneratingSmartTemplate] = useState(false);
  const [artworkEditorVerticalGuides, setArtworkEditorVerticalGuides] = useState<number[]>([]);
  const [artworkEditorHorizontalGuides, setArtworkEditorHorizontalGuides] = useState<number[]>([]);
  const [artworkEditorTextCurve, setArtworkEditorTextCurve] = useState(0);
  const [artworkEditorTextBoxColor, setArtworkEditorTextBoxColor] = useState('#ffffff');
  const [artworkEditorTextBoxPadding, setArtworkEditorTextBoxPadding] = useState(18);
  const [artworkEditorOuterOutlineColor, setArtworkEditorOuterOutlineColor] = useState('#0ea5e9');
  const [artworkEditorOuterOutlineWidth, setArtworkEditorOuterOutlineWidth] = useState(8);
  const [artworkEditorShadowColor, setArtworkEditorShadowColor] = useState('#000000');
  const [artworkEditorShadowOpacity, setArtworkEditorShadowOpacity] = useState(45);
  const [artworkEditorShadowBlur, setArtworkEditorShadowBlur] = useState(12);
  const [artworkEditorShadowOffsetX, setArtworkEditorShadowOffsetX] = useState(8);
  const [artworkEditorShadowOffsetY, setArtworkEditorShadowOffsetY] = useState(8);
  const [artworkEditorRecentColors, setArtworkEditorRecentColors] = useState<string[]>([]);
  const [artworkEditorBrandColors, setArtworkEditorBrandColors] = useState<string[]>(['#0b1f44', '#0ea5e9', '#ffffff']);
  const [artworkEditorIconSearch, setArtworkEditorIconSearch] = useState('');
  const [artworkEditorCrop, setArtworkEditorCrop] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
  const [artworkEditorGradientStart, setArtworkEditorGradientStart] = useState('#0ea5e9');
  const [artworkEditorGradientEnd, setArtworkEditorGradientEnd] = useState('#0b1f44');
  const [artworkEditorQrValue, setArtworkEditorQrValue] = useState('https://huegraphics.cc');
  const [artworkEditorBrightness, setArtworkEditorBrightness] = useState(0);
  const [artworkEditorContrast, setArtworkEditorContrast] = useState(0);
  const [artworkEditorSaturation, setArtworkEditorSaturation] = useState(0);
  const [artworkEditorExactX, setArtworkEditorExactX] = useState(0);
  const [artworkEditorExactY, setArtworkEditorExactY] = useState(0);
  const [artworkEditorExactWidth, setArtworkEditorExactWidth] = useState(0);
  const [artworkEditorExactHeight, setArtworkEditorExactHeight] = useState(0);
  const [artworkEditorExactRotation, setArtworkEditorExactRotation] = useState(0);
  const [artworkEditorVersions, setArtworkEditorVersions] = useState<Array<{ id: string; label: string; front: string | null; back: string | null }>>([]);
  const [artworkEditorReloadKey, setArtworkEditorReloadKey] = useState(0);
  const [artworkEditorCanUndo, setArtworkEditorCanUndo] = useState(false);
  const [artworkEditorCanRedo, setArtworkEditorCanRedo] = useState(false);
  const [customerSession, setCustomerSession] = useState<CustomerSession | null>(null);
  const [showCustomerLogin, setShowCustomerLogin] = useState(false);
  const [showGuestArtworkWarning, setShowGuestArtworkWarning] = useState(false);
  const [pendingGuestUploadStatus, setPendingGuestUploadStatus] = useState('Choose an image or PDF artwork file.');
  const [customerAuthMode, setCustomerAuthMode] = useState<'signin' | 'signup'>('signin');
  const [customerAuthEmail, setCustomerAuthEmail] = useState('');
  const [customerAuthPassword, setCustomerAuthPassword] = useState('');
  const [customerAuthStatus, setCustomerAuthStatus] = useState('');
  const [isGuestCheckout, setIsGuestCheckout] = useState(false);
  const [isCustomerAuthLoading, setIsCustomerAuthLoading] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isPreparingCartArtwork, setIsPreparingCartArtwork] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [cartStatus, setCartStatus] = useState('');
  const [showTestCheckout, setShowTestCheckout] = useState(false);
  const [testOrders, setTestOrders] = useState<TestOrder[]>([]);
  const [accountOrders, setAccountOrders] = useState<TestOrder[]>([]);
  const [accountOrdersLoading, setAccountOrdersLoading] = useState(false);
  const [accountOrdersError, setAccountOrdersError] = useState('');
  const [checkoutStep, setCheckoutStep] = useState<'contact' | 'fulfillment' | 'review' | 'complete'>('contact');
  const [checkoutStatus, setCheckoutStatus] = useState('');
  const [checkoutContact, setCheckoutContact] = useState({ name: '', organization: '', email: '', phone: '', notes: '' });
  const [checkoutTaxExempt, setCheckoutTaxExempt] = useState(false);
  const [checkoutPromoInput, setCheckoutPromoInput] = useState('');
  const [checkoutPromo, setCheckoutPromo] = useState<AppliedPromo | null>(null);
  const [isCheckoutPromoLoading, setIsCheckoutPromoLoading] = useState(false);
  const [isSubmittingTestOrder, setIsSubmittingTestOrder] = useState(false);
  const [paypalCheckoutAvailable, setPaypalCheckoutAvailable] = useState<boolean | null>(null);
  const [pendingPayPalFinalization, setPendingPayPalFinalization] = useState(false);
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
  const artworkEditorCanvasElRef = useRef<HTMLCanvasElement | null>(null);
  const artworkEditorViewportRef = useRef<HTMLDivElement | null>(null);
  const artworkEditorImageInputRef = useRef<HTMLInputElement | null>(null);
  const artworkEditorCanvasRef = useRef<Canvas | null>(null);
  const artworkEditorHistoryRef = useRef<string[]>([]);
  const artworkEditorHistoryIndexRef = useRef(-1);
  const artworkEditorRestoringRef = useRef(false);
  const artworkEditorObjectUrlsRef = useRef<string[]>([]);
  const artworkEditorSnapToCenterRef = useRef(true);
  const artworkEditorSideRef = useRef<CoroArtworkSide>('front');
  const artworkEditorSideSnapshotsRef = useRef<Record<CoroArtworkSide, string | null>>({ front: null, back: null });
  const artworkEditorClipboardRef = useRef<FabricObject | null>(null);
  const pendingCheckoutSubmissionRef = useRef<{ id: string; fingerprint: string } | null>(null);
  const pendingPayPalCheckoutRef = useRef<{ order: TestOrder; checkoutToken: string; paypalOrderId: string; paymentToken?: string; captureId?: string; paidAt?: string } | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  useEffect(() => {
    try {
      const recent = JSON.parse(window.localStorage.getItem('hue-artwork-recent-colors') || '[]') as string[];
      const brand = JSON.parse(window.localStorage.getItem('hue-artwork-brand-colors') || '[]') as string[];
      if (Array.isArray(recent)) setArtworkEditorRecentColors(recent.slice(0, 10));
      if (Array.isArray(brand) && brand.length) setArtworkEditorBrandColors(brand.slice(0, 16));
    } catch {
      // Keep the built-in Hue palette if saved color data is malformed.
    }
  }, []);

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
    const params = new URLSearchParams(window.location.search);
    if (params.get('open') !== 'account') return;
    setShowCustomerLogin(true);
    params.delete('open');
    const cleanUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', cleanUrl);
  }, []);

  useEffect(() => {
    try {
      const storedCart = window.localStorage.getItem(CART_STORAGE_KEY);
      if (!storedCart) return;
      const parsedCart = JSON.parse(storedCart) as CartItem[];
      if (Array.isArray(parsedCart)) setCartItems(getPersistableCartItems(parsedCart));
    } catch {
      window.localStorage.removeItem(CART_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(getPersistableCartItems(cartItems)));
    } catch {
      setCartStatus('Cart is open, but browser storage is full. Original artwork files remain attached by Supabase path.');
    }
  }, [cartItems]);

  useEffect(() => {
    try {
      const storedOrders = window.localStorage.getItem(TEST_ORDER_STORAGE_KEY);
      if (!storedOrders) return;
      const parsedOrders = JSON.parse(storedOrders) as TestOrder[];
      if (Array.isArray(parsedOrders)) setTestOrders(getPersistableTestOrders(parsedOrders));
    } catch {
      window.localStorage.removeItem(TEST_ORDER_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(TEST_ORDER_STORAGE_KEY, JSON.stringify(getPersistableTestOrders(testOrders)));
    } catch {
      setCheckoutStatus('Test order history is too large for browser storage. The current submitted order is still shown.');
    }
  }, [testOrders]);

  useEffect(() => {
    const accessToken = customerSession?.access_token;
    if (!accessToken) {
      setAccountOrders([]);
      setAccountOrdersLoading(false);
      setAccountOrdersError('');
      return;
    }

    const controller = new AbortController();
    const loadAccountOrders = async () => {
      setAccountOrdersLoading(true);
      setAccountOrdersError('');
      try {
        const response = await fetch('/api/account/orders', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal
        });
        const payload = await response.json() as { orders?: TestOrder[]; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Unable to load order history.');
        if (!controller.signal.aborted) setAccountOrders(Array.isArray(payload.orders) ? payload.orders : []);
      } catch (error) {
        if (!controller.signal.aborted) {
          setAccountOrdersError(error instanceof Error ? error.message : 'Unable to load order history.');
        }
      } finally {
        if (!controller.signal.aborted) setAccountOrdersLoading(false);
      }
    };

    void loadAccountOrders();
    return () => controller.abort();
  }, [customerSession?.access_token]);

  useEffect(() => {
    if (!customerSession?.access_token || !customerSession.user?.id) {
      setImageZoneItems((prev) => prev.filter((item) => item.source === 'local'));
      setSelectedImageZoneId(null);
      setIsImageLibraryLoading(false);
      setImageLibraryStatus('Guest session: artwork stays in this browser until you sign in. Create an account or sign in to save a private cloud library.');
      return;
    }
    if (!isSupabaseStorageConfigured) {
      setImageLibraryStatus('Supabase storage is not configured. Uploads will stay in this browser session.');
      return;
    }
    let mounted = true;
    const loadImageLibrary = async () => {
      setIsImageLibraryLoading(true);
      try {
        const libraryResponse = await fetch('/api/artwork/library', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${customerSession.access_token}` },
        });
        const libraryPayload = await libraryResponse.json() as { items?: Array<{ id?: string; name: string; storagePath: string; storageUrl?: string | null; mimeType?: string; updatedAt?: string | null; createdAt?: string | null }>; error?: string };
        if (!libraryResponse.ok) throw new Error(libraryPayload.error || 'Could not load Image Zone files.');
        if (!mounted) return;
        const ungroupedRemoteItems: ImageZoneItem[] = await Promise.all((libraryPayload.items || [])
          .filter((file) => file.name && file.storagePath && isLikelyArtworkPath(file.name))
          .map(async (file) => {
            const storagePath = file.storagePath;
            const previewUrl = file.storageUrl || await getSupabaseSignedUrl(storagePath, customerSession).catch(() => getSupabasePublicUrl(storagePath));
            const isImageFile = Boolean(file.mimeType?.startsWith('image/') || isLikelyImagePath(file.name));
            const isPdfFile = file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.name);
            const pdfPreview = isPdfFile ? await renderPdfFirstPage(previewUrl).catch(() => null) : null;
            const renderedPreviewUrl = pdfPreview?.dataUrl || previewUrl;
            const imageSize = pdfPreview
              ? { width: pdfPreview.width, height: pdfPreview.height }
              : isImageFile
                ? await getImageNaturalSize(previewUrl).catch(() => ({ width: 0, height: 0 }))
                : { width: 0, height: 0 };
            const embeddedResolution = isImageFile
              ? await fetch(previewUrl).then((imageResponse) => imageResponse.ok ? imageResponse.blob() : Promise.reject(new Error('Image metadata unavailable'))).then(readEmbeddedImageResolution).catch(() => null)
              : null;
            const inferredPrintSize = pdfPreview
              ? { width: pdfPreview.signWidth, height: pdfPreview.signHeight }
              : imageSize.width > 0 && imageSize.height > 0
                ? getArtworkPrintSize(imageSize.width, imageSize.height, embeddedResolution)
                : null;
            const isEditorProject = /-huedesign-\d+-project\.json$/i.test(file.name);
            const editorProject = isEditorProject
              ? await fetch(previewUrl).then((projectResponse) => projectResponse.ok ? projectResponse.json() as Promise<ArtworkEditorProject> : null).catch(() => null)
              : undefined;
            return {
              id: file.id || storagePath,
              name: file.name,
              dataUrl: renderedPreviewUrl,
              width: imageSize.width,
              height: imageSize.height,
              dpi: pdfPreview?.dpi || (embeddedResolution ? Math.round(Math.min(embeddedResolution.dpiX, embeddedResolution.dpiY)) : BANNER_PREVIEW_DPI),
              uploadedAt: file.updatedAt || file.createdAt || 'Supabase',
              storagePath,
              storageUrl: previewUrl,
              source: 'supabase' as const,
              mimeType: file.mimeType,
              signWidth: inferredPrintSize?.width,
              signHeight: inferredPrintSize?.height,
              editorProject: editorProject || undefined
            };
          }));
        const pairedSides = new Map<string, { front?: ImageZoneItem; back?: ImageZoneItem }>();
        ungroupedRemoteItems.forEach((item) => {
          const pairMatch = item.name.match(/-huepair-(\d+)-(front|back)\.png$/i);
          if (!pairMatch) return;
          const pair = pairedSides.get(pairMatch[1]) || {};
          pair[pairMatch[2].toLowerCase() as CoroArtworkSide] = item;
          pairedSides.set(pairMatch[1], pair);
        });
        const remoteItems = ungroupedRemoteItems.flatMap((item) => {
          const designMatch = item.name.match(/-huedesign-(\d+)-(front|back|project)\.(png|json)$/i);
          if (designMatch) {
            if (designMatch[2].toLowerCase() !== 'front') return [];
            const designId = designMatch[1];
            const back = ungroupedRemoteItems.find((entry) => new RegExp(`-huedesign-${designId}-back\\.png$`, 'i').test(entry.name));
            const project = ungroupedRemoteItems.find((entry) => new RegExp(`-huedesign-${designId}-project\\.json$`, 'i').test(entry.name));
            return [{ ...item, backDataUrl: back?.dataUrl, backName: back?.name, backStoragePath: back?.storagePath, backWidth: back?.width, backHeight: back?.height, backCopiedFromFront: false, editorProject: project?.editorProject, projectStoragePath: project?.storagePath, signWidth: project?.editorProject?.signWidth, signHeight: project?.editorProject?.signHeight, dpi: project?.editorProject?.dpi || item.dpi }];
          }
          const pairMatch = item.name.match(/-huepair-(\d+)-(front|back)\.png$/i);
          if (!pairMatch) return [item];
          if (pairMatch[2].toLowerCase() === 'back') return [];
          const back = pairedSides.get(pairMatch[1])?.back;
          return [{ ...item, backDataUrl: back?.dataUrl, backName: back?.name, backStoragePath: back?.storagePath, backWidth: back?.width, backHeight: back?.height, backCopiedFromFront: false }];
        });
        let archivedItems: ImageZoneItem[] = [];
        try {
          const archiveResponse = await fetch('/api/artwork/archive', {
            headers: { Authorization: `Bearer ${customerSession.access_token}` },
          });
          if (archiveResponse.ok) {
            const archivePayload = await archiveResponse.json() as { items?: Array<{ id: string; originalName: string; mimeType?: string; storagePath?: string; previewUrl?: string | null; archivedAt?: string }> };
            archivedItems = (archivePayload.items || []).map((entry) => ({
              id: `archive-${entry.id}`,
              archiveId: entry.id,
              archived: true,
              name: entry.originalName,
              dataUrl: entry.previewUrl || '',
              storageUrl: entry.previewUrl || undefined,
              storagePath: entry.storagePath,
              width: 0,
              height: 0,
              dpi: BANNER_PREVIEW_DPI,
              uploadedAt: entry.archivedAt || 'Drive archive',
              source: 'archive' as const,
              mimeType: entry.mimeType,
            }));
          }
        } catch {
          // Current cloud files remain usable even if the archive list is temporarily unavailable.
        }
        if (!mounted) return;
        const liveStoragePaths = new Set(remoteItems.map((item) => item.storagePath).filter(Boolean));
        const visibleArchivedItems = archivedItems.filter((item) => !item.storagePath || !liveStoragePaths.has(item.storagePath));
        setImageZoneItems((prev) => {
          const localItems = prev.filter((item) => item.source === 'local');
          return [...remoteItems, ...visibleArchivedItems, ...localItems];
        });
        const archivedMessage = visibleArchivedItems.length ? ` ${visibleArchivedItems.length} archived preview${visibleArchivedItems.length === 1 ? '' : 's'} available.` : '';
        setImageLibraryStatus(`Signed in as ${customerSession.user?.email || 'customer'}. ${remoteItems.length} saved file${remoteItems.length === 1 ? '' : 's'} found.${archivedMessage}`);
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
  const isSheetPricedProduct = SHEET_PRICED_PRODUCT_IDS.includes(selectedSignProduct.id);
  const isCustomCoro = isSheetPricedProduct && String(signValues.size || '') === 'custom';
  const firstSizedCustomCoroArtwork = isCustomCoro
    ? coroSheetArtworkItems.find((item) => Number(item.signWidth || 0) > 0 && Number(item.signHeight || 0) > 0)
    : null;
  const selectedMagnetSize = parsePresetSize(signValues.size);
  const isCustomMagnet = selectedSignProduct.id === 'vehicle-magnet' && Boolean(signValues.customCut);
  const magnetDisplayName = isCustomMagnet ? 'Custom Magnets' : selectedSignProduct.name;
  const signWidth = isSheetPricedProduct ? isCustomCoro ? Number(signValues.width || firstSizedCustomCoroArtwork?.signWidth || 0) : selectedCoroSize.width : selectedSignProduct.id === 'vehicle-magnet' ? isCustomMagnet ? Number(signValues.width || 0) : selectedMagnetSize.width : Number(signValues.width || 0);
  const signHeight = isSheetPricedProduct ? isCustomCoro ? Number(signValues.height || firstSizedCustomCoroArtwork?.signHeight || 0) : selectedCoroSize.height : selectedSignProduct.id === 'vehicle-magnet' ? isCustomMagnet ? Number(signValues.height || 0) : selectedMagnetSize.height : Number(signValues.height || 0);
  const signSizeControlLabel = isSheetPricedProduct && isCustomCoro ? 'Custom' : `${signWidth || 0}" x ${signHeight || 0}"`;
  const designerQuantity = productMode === 'signage' ? getSignQuantity(signValues) : totalQuantity;
  const coroSheetArtworkQuantity = coroSheetArtworkItems.reduce((total, item) => total + Math.max(1, Number(coroArtworkQuantities[item.id] || 1)), 0);
  const effectiveCoroQuantity = isSheetPricedProduct && coroSheetArtworkItems.length > 0 ? coroSheetArtworkQuantity : designerQuantity;
  const coroLayoutFluteDirection = selectedSignProduct.id === 'yard-sign' ? String(signValues.fluteDirection || 'auto') : 'auto';
  const standardCoroSheetLayout = getCoroSheetLayout(signWidth, signHeight, effectiveCoroQuantity, coroLayoutFluteDirection);
  const customCoroSheetPreviews = isCustomCoro && coroSheetArtworkItems.length > 0 ? packCustomCoroSheets(coroSheetArtworkItems, coroArtworkQuantities, signWidth, signHeight, selectedSignProduct.id === 'yard-sign') : [];
  const coroSheetLayout = isCustomCoro && customCoroSheetPreviews.length > 0
    ? { ...standardCoroSheetLayout, sheetCount: customCoroSheetPreviews.length }
    : standardCoroSheetLayout;
  const coroSheetCells = coroSheetArtworkItems.flatMap((item) => Array.from({ length: Math.max(1, Number(coroArtworkQuantities[item.id] || 1)) }, () => item));
  const coroUnusedSheetSpaces = isCustomCoro ? 0 : Math.max(0, (coroSheetLayout.sheetCount * coroSheetLayout.signsPerSheet) - effectiveCoroQuantity);
  const hasCoroUnusedSheetSpace = isSheetPricedProduct && coroSheetLayout.sheetCount > 1 && coroUnusedSheetSpaces > 0;
  const hasCoroDoubleSided = isSheetPricedProduct && String(signValues.sides || 'single') === 'double';
  const hasCoroAspectMismatch = isSheetPricedProduct && coroSheetArtworkItems.some((item) => {
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
  const isCoroBuilder = productMode === 'signage' && isSheetPricedProduct;
  const isBannerBuilder = productMode === 'signage' && selectedSignProduct.preview === 'banner';
  const isBusinessCardBuilder = productMode === 'signage' && selectedSignProduct.id === 'business-card';
  const isPosterBuilder = productMode === 'signage' && selectedSignProduct.id === 'poster';
  const isTrueBannerBuilder = isBannerBuilder && (selectedSignProduct.id === 'banner' || selectedSignProduct.id === 'mesh-banner');
  const supportsDoubleSidedProduct = productMode === 'signage' && DOUBLE_SIDED_PRODUCT_IDS.includes(selectedSignProduct.id);
  const isRigidSignBuilder = productMode === 'signage' && RIGID_SIGN_PRODUCT_IDS.includes(selectedSignProduct.id);
  const isAutoSidedRigidBuilder = productMode === 'signage' && SEPARATE_BACK_ARTWORK_PRODUCT_IDS.includes(selectedSignProduct.id);
  const showSeparateBackArtworkControl = isAutoSidedRigidBuilder && (!['banner', 'business-card'].includes(selectedSignProduct.id) || String(signValues.sides || 'single') === 'double');
  const isProductionBuilder = productMode === 'signage';
  const signSurfacePreviewUrl = isAutoSidedRigidBuilder && rigidPreviewSide === 'back' ? rigidBackArtwork?.dataUrl || null : signArtworkDisplayUrl || signArtworkPreviewUrl;
  const hasPlacedSignArtwork = Boolean(signArtworkPreviewUrl) || Boolean(signSurfacePreviewUrl) || layers.length > 0;
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
  const rawSummaryMaterialLabel = selectedBannerMaterial?.label || String(signValues.material || selectedSignProduct.name);
  const summaryMaterialLabel = /^(standard|default)$/i.test(rawSummaryMaterialLabel.trim())
    ? isPosterBuilder
      ? 'Poster Paper'
      : selectedSignProduct.name
    : rawSummaryMaterialLabel;
  const summarySidesLabel = String(signValues.sides || 'single') === 'double' || String(signValues.material || '').includes('double') ? 'Double-Sided' : 'Single-Sided';
  const selectedRoundedCornerOption = ROUNDED_CORNER_OPTIONS.find((option) => option.value === String(signValues.roundedCorners || 'none')) || ROUNDED_CORNER_OPTIONS[0];
  const supportsSizedRoundedCorners = selectedSignProduct.id === 'acm' || selectedSignProduct.id === 'aluminum' || selectedSignProduct.id === 'vehicle-magnet';
  const selectedRoundedCornerRadius = supportsSizedRoundedCorners && selectedRoundedCornerOption.value !== 'none' ? Number(selectedRoundedCornerOption.value) : 0;
  // CSS percentage radii use the element width for the horizontal curve and its
  // height for the vertical curve. Supplying one percentage makes landscape
  // signs look stretched, so calculate each axis from the real sign dimensions.
  const roundedCornerPreviewRadius = selectedRoundedCornerRadius > 0 && signWidth > 0 && signHeight > 0
    ? `${Math.min(50, (selectedRoundedCornerRadius / signWidth) * 100)}% / ${Math.min(50, (selectedRoundedCornerRadius / signHeight) * 100)}%`
    : null;
  const safeCornerRadius = Math.max(0, selectedRoundedCornerRadius - 0.25);
  const roundedSafeZonePreviewRadius = safeCornerRadius > 0 && signWidth > 0.5 && signHeight > 0.5
    ? `${Math.min(50, (safeCornerRadius / (signWidth - 0.5)) * 100)}% / ${Math.min(50, (safeCornerRadius / (signHeight - 0.5)) * 100)}%`
    : undefined;
  const bannerDisplayName = isMeshBanner ? 'Mesh Banner' : selectedSignProduct.name;
  const bannerLocalOptionTotal = isBannerBuilder && Boolean(signValues.windSlits) ? 10 : 0;
  const bannerSquareFeet = signWidth * signHeight > 0 ? (signWidth * signHeight) / 144 : 0;
  const signPreviewAspect = isSheetPricedProduct ? CORO_SHEET.width / CORO_SHEET.height : signWidth > 0 && signHeight > 0 ? Math.max(0.15, Math.min(6.5, signWidth / Math.max(1, signHeight))) : 1.5;
  const signPreviewWidth = isProductionBuilder
    ? activeCoroOptionPanel === 'images'
      ? `min(44vw, 760px, calc(48vh * ${signPreviewAspect}))`
      : `min(50vw, 900px, calc(50vh * ${signPreviewAspect}))`
    : '82%';
  const signPreviewBoxStyle = { aspectRatio: signPreviewAspect, width: signPreviewWidth };
  const rigidSafeZoneInsetX = signWidth > 0 ? Math.min(24, (0.25 / signWidth) * 100) : 0;
  const rigidSafeZoneInsetY = signHeight > 0 ? Math.min(24, (0.25 / signHeight) * 100) : 0;
  const hasCoroSheetArtwork = isCoroBuilder && coroSheetArtworkItems.length > 0;
  const hasBannerArtwork = isBannerBuilder && Boolean(signArtworkPreviewUrl);
  const signArtworkMatchesSize = Boolean(signArtworkSize && Math.abs(signArtworkSize.width - signWidth) < 0.05 && Math.abs(signArtworkSize.height - signHeight) < 0.05);
  const coroBackArtworkComplete = !hasCoroDoubleSided || (coroSheetArtworkItems.length > 0 && coroSheetArtworkItems.every((item) => Boolean(item.backDataUrl)));
  const missingSeparateBackArtwork = !isCoroBuilder && isAutoSidedRigidBuilder && String(signValues.sides || 'single') === 'double' && !rigidBackArtwork;
  const separateBackArtworkComplete = !missingSeparateBackArtwork;
  const signArtworkStatusOk = (hasCoroSheetArtwork || (hasBannerArtwork ? (!rawBannerAspectMismatch || bannerFitResolved) : (layers.length > 0 && signArtworkMatchesSize))) && coroBackArtworkComplete && separateBackArtworkComplete;
  const signArtworkStatusLabel = !layers.length && !hasCoroSheetArtwork && !hasBannerArtwork ? 'Needs Artwork' : signArtworkStatusOk ? 'Print Ready' : 'Needs Fit Check';
  const hueQualityStatus = signArtworkStatusOk ? 'Hue check ready' : 'Needs artwork check';
  const hueOrderPathLabel = customerSession?.user?.email ? 'Saved customer library' : 'Guest checkout path';
  const customerAccountButtonLabel = customerSession?.user?.email || (isGuestCheckout ? 'Quick checkout' : 'Account');
  useEffect(() => {
    if (productMode !== 'signage') return;
    const material = String(signValues.material || '');
    const defaultMaterial = ['pvc', 'acm'].includes(selectedSignProduct.id) && !['3mm', '6mm'].includes(material)
      ? '3mm'
      : selectedSignProduct.id === 'aluminum' && !['040', '080'].includes(material)
        ? '040'
        : null;
    if (!defaultMaterial) return;
    setSignValues((prev) => ({ ...prev, material: defaultMaterial }));
    setSignEstimate(null);
  }, [productMode, selectedSignProduct.id, signValues.material]);
  const sizeBreakdown = useMemo(() => SIZE_FIELDS.filter((size) => sizeQuantities[size] > 0).map((size) => `${size}: ${sizeQuantities[size]}`).join(', ') || 'No sizes added', [sizeQuantities]);
  const designerQuantityBreakdown = productMode === 'signage' ? `Each: ${designerQuantity}` : sizeBreakdown;
  const signRetailBase = numericPrice(signEstimate?.price?.retail);
  const signEachBase = numericPrice(signEstimate?.price?.each);
  const roundedCornerLocalOptionTotal = ['acm', 'aluminum'].includes(selectedSignProduct.id) && selectedRoundedCornerRadius > 0 ? 5 : 0;
  const signLocalOptionTotal = bannerLocalOptionTotal + roundedCornerLocalOptionTotal;
  const signRetailTotal = signRetailBase !== null ? signRetailBase + signLocalOptionTotal : null;
  const signEachTotal = signEachBase !== null ? signEachBase + (signLocalOptionTotal / Math.max(1, designerQuantity)) : null;
  const savedArtworkSetPricing = bannerOrderItems.map((item) => {
    const retail = numericPrice(item.estimate?.price?.retail);
    const localOptions = Number(item.localOptionTotal || 0);
    return {
      ...item,
      retailTotal: retail !== null ? retail + localOptions : null,
      eachTotal: retail !== null ? (retail + localOptions) / Math.max(1, item.quantity) : null
    };
  });
  const hasMultipleArtworkSets = isBannerBuilder && !isCoroBuilder && bannerOrderItems.length > 0;
  const savedArtworkSetsPriced = savedArtworkSetPricing.every((item) => item.retailTotal !== null);
  const signOrderRetailTotal = hasMultipleArtworkSets
    ? signRetailTotal !== null && savedArtworkSetsPriced
      ? signRetailTotal + savedArtworkSetPricing.reduce((total, item) => total + Number(item.retailTotal || 0), 0)
      : null
    : signRetailTotal;
  const signOrderQuantity = hasMultipleArtworkSets
    ? designerQuantity + bannerOrderItems.reduce((total, item) => total + Math.max(1, item.quantity), 0)
    : designerQuantity;
  const orderedBannerOrderItems = [...bannerOrderItems].sort((a, b) => a.setNumber - b.setNumber);
  const savedBannerItemsBeforeActive = orderedBannerOrderItems.filter((item) => item.setNumber < activeBannerSetNumber);
  const savedBannerItemsAfterActive = orderedBannerOrderItems.filter((item) => item.setNumber > activeBannerSetNumber);
  const currentBannerMaterial = String(signValues.material || '');
  const currentArtworkSetPricing = {
    setNumber: activeBannerSetNumber,
    width: signWidth,
    height: signHeight,
    quantity: designerQuantity,
    material: currentBannerMaterial,
    materialLabel: getBannerMaterialLabel(currentBannerMaterial),
    sides: String(signValues.sides || 'single'),
    retailTotal: signRetailTotal,
    eachTotal: signEachTotal,
    currency: signEstimate?.currency
  };
  const orderedArtworkSetPricing = hasMultipleArtworkSets
    ? [
        ...savedArtworkSetPricing.map((item, index) => ({
          ...item,
          setNumber: item.setNumber || index + 1,
          materialLabel: item.materialLabel || getBannerMaterialLabel(item.material),
          currency: item.estimate?.currency
        })),
        currentArtworkSetPricing
      ].sort((a, b) => a.setNumber - b.setNumber)
    : [currentArtworkSetPricing];
  const artworkSetCount = orderedArtworkSetPricing.length;
  const orderAverageEach = signOrderRetailTotal !== null ? signOrderRetailTotal / Math.max(1, signOrderQuantity) : null;
  const formatSetSides = (sides?: string) => String(sides || 'single').toLowerCase() === 'double' ? 'Double-Sided' : 'Single-Sided';
  const formatArtworkSetNumber = (setNumber: number) => String(setNumber).padStart(2, '0');
  const signPricePerSheet = signRetailTotal !== null ? signRetailTotal / coroSheetLayout.sheetCount : null;
  const coroPricePerSign = signEachTotal ?? (signRetailTotal !== null ? signRetailTotal / Math.max(1, effectiveCoroQuantity) : null);
  const coroPricePerFullSheet = signPricePerSheet;
  const coroPricingCurrency = signEstimate?.currency || 'USD';
  const coroPricingIsLoaded = isCoroBuilder && signEstimate && signRetailTotal !== null;
  const coroSheetCapacity = coroSheetLayout.sheetCount * coroSheetLayout.signsPerSheet;
  const coroPieceLabel = selectedSignProduct.id === 'yard-sign' ? 'signs' : 'pieces';
  const coroReadyTotalLabel = `${coroSheetLayout.sheetCount} sheet${coroSheetLayout.sheetCount === 1 ? '' : 's'} / ${effectiveCoroQuantity} total ${coroPieceLabel}`;
  const cartSubtotal = cartItems.reduce((total, item) => total + (item.price.total || 0), 0);
  const checkoutShippingAmount = checkoutFulfillment === 'direct_ship' ? HUE_STUDIO_US_SHIPPING_FEE : 0;
  const checkoutShippingLabel = checkoutFulfillment === 'direct_ship' ? 'US shipping' : 'Local pickup';
  const checkoutShipState = checkoutAddress.state.trim().toUpperCase();
  const checkoutIsGeorgiaOrder = checkoutFulfillment === 'pickup' || checkoutShipState === 'GA' || checkoutShipState === 'GEORGIA';
  const checkoutTaxRate = checkoutTaxExempt || !checkoutIsGeorgiaOrder ? 0 : GEORGIA_SALES_TAX_RATE;
  const checkoutDiscountAmount = Math.min(cartSubtotal, checkoutPromo?.discountAmount || 0);
  const checkoutDiscountedSubtotal = Math.max(0, cartSubtotal - checkoutDiscountAmount);
  const checkoutTaxableAmount = checkoutDiscountedSubtotal + checkoutShippingAmount;
  const checkoutTaxAmount = Number((checkoutTaxableAmount * checkoutTaxRate).toFixed(2));
  const checkoutOrderTotal = Number((checkoutDiscountedSubtotal + checkoutShippingAmount + checkoutTaxAmount).toFixed(2));
  const checkoutTaxLabel = checkoutTaxExempt ? 'Tax exempt' : checkoutIsGeorgiaOrder ? `${GEORGIA_SALES_TAX_LABEL} (${(GEORGIA_SALES_TAX_RATE * 100).toFixed(2)}%)` : 'No GA tax for out-of-state shipping';
  const customerOrderHistory = useMemo(() => {
    const sessionUserId = customerSession?.user?.id;
    const sessionEmail = customerSession?.user?.email?.trim().toLowerCase();
    const localOrders = testOrders.filter((order) => {
      const orderEmail = order.customer.email.trim().toLowerCase();
      return Boolean((sessionUserId && order.customer.userId === sessionUserId) || (sessionEmail && orderEmail === sessionEmail));
    });
    const mergedOrders = new Map<string, TestOrder>();
    [...accountOrders, ...localOrders].forEach((order) => {
      const key = order.id || order.orderNumber;
      if (key && !mergedOrders.has(key)) mergedOrders.set(key, order);
    });
    return Array.from(mergedOrders.values()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [accountOrders, customerSession?.user?.email, customerSession?.user?.id, testOrders]);
  const canAddCurrentDesignToCart = productMode === 'signage' && Boolean(signEstimate) && signOrderRetailTotal !== null && signArtworkStatusOk;
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
    setCheckoutPromoInput('');
    setCheckoutPromo(null);
    setPaypalCheckoutAvailable(null);
    setPendingPayPalFinalization(false);
    pendingPayPalCheckoutRef.current = null;
    setShowTestCheckout(true);
  };
  const applyCheckoutPromo = async () => {
    const code = checkoutPromoInput.trim().toUpperCase();
    if (!code) {
      setCheckoutStatus('Enter a promo code first.');
      return;
    }
    setIsCheckoutPromoLoading(true);
    setCheckoutStatus(`Checking promo code ${code}...`);
    try {
      const response = await fetch('/api/promo/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, subtotal: cartSubtotal }) });
      const payload = await response.json() as AppliedPromo & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'The promo code could not be applied.');
      setCheckoutPromo(payload);
      setCheckoutPromoInput(payload.code);
      setCheckoutStatus(`${payload.code} applied: ${formatSignPrice(payload.discountAmount, 'USD')} off this order.`);
    } catch (error) {
      setCheckoutPromo(null);
      setCheckoutStatus(error instanceof Error ? error.message : 'The promo code could not be applied.');
    } finally {
      setIsCheckoutPromoLoading(false);
    }
  };
  const buildCheckoutOrder = (paymentMode: TestOrder['paymentMode'], payment?: TestOrder['payment']) => {
    const contactName = checkoutContact.name.trim();
    const contactEmail = checkoutContact.email.trim();
    if (!contactName || !contactEmail) {
      setCheckoutStatus('Enter a customer name and email before submitting the order.');
      setCheckoutStep('contact');
      return null;
    }
    if (checkoutFulfillment === 'direct_ship') {
      const hasAddress = checkoutAddress.line1.trim() && checkoutAddress.city.trim() && checkoutAddress.state.trim() && checkoutAddress.postalCode.trim();
      if (!hasAddress) {
        setCheckoutStatus('Direct shipping needs a street address, city, state, and ZIP code.');
        setCheckoutStep('fulfillment');
        return null;
      }
    }

    const timestamp = Date.now();
    const submissionFingerprint = JSON.stringify({
      email: contactEmail.toLowerCase(),
      items: cartItems.map((item) => ({ id: item.id, quantity: item.quantity })),
    });
    let checkoutSubmissionId = `checkout-${timestamp}-${Math.random().toString(36).slice(2, 12)}`;
    if (pendingCheckoutSubmissionRef.current?.fingerprint === submissionFingerprint) {
      checkoutSubmissionId = pendingCheckoutSubmissionRef.current.id;
    }
    try {
      const storedSubmission = JSON.parse(window.sessionStorage.getItem(CHECKOUT_SUBMISSION_STORAGE_KEY) || 'null') as { id?: string; fingerprint?: string } | null;
      if (storedSubmission?.id && storedSubmission.fingerprint === submissionFingerprint) checkoutSubmissionId = storedSubmission.id;
      else window.sessionStorage.setItem(CHECKOUT_SUBMISSION_STORAGE_KEY, JSON.stringify({ id: checkoutSubmissionId, fingerprint: submissionFingerprint }));
    } catch {
      // The in-memory submission key still prevents duplicate clicks for this page lifetime.
    }
    pendingCheckoutSubmissionRef.current = { id: checkoutSubmissionId, fingerprint: submissionFingerprint };

    return {
      id: checkoutSubmissionId,
      orderNumber: createTestOrderNumber(timestamp),
      createdAt: new Date(timestamp).toISOString(),
      status: 'test_submitted',
      paymentMode,
      payment,
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
      promotion: checkoutPromo ? { code: checkoutPromo.code, description: checkoutPromo.description, discountAmount: checkoutDiscountAmount } : undefined,
      shipping: { amount: checkoutShippingAmount, label: checkoutShippingLabel },
      tax: { rate: checkoutTaxRate, amount: checkoutTaxAmount, label: checkoutTaxLabel },
      total: checkoutOrderTotal,
      currency: 'USD'
    } satisfies TestOrder;
  };

  const completeSubmittedOrder = (organizedOrder: TestOrder) => {
    setTestOrders((current) => [organizedOrder, ...current.filter((entry) => entry.orderNumber !== organizedOrder.orderNumber)]);
    setLastTestOrder(organizedOrder);
    setCartItems([]);
    setShowCart(false);
    setPendingPayPalFinalization(false);
    pendingPayPalCheckoutRef.current = null;
    try {
      const updatedHistory = [organizedOrder, ...testOrders.filter((entry) => entry.orderNumber !== organizedOrder.orderNumber)];
      window.localStorage.setItem(TEST_ORDER_STORAGE_KEY, JSON.stringify(getPersistableTestOrders(updatedHistory)));
      window.sessionStorage.setItem(ORDER_CONFIRMATION_STORAGE_KEY, JSON.stringify(getPersistableTestOrders([organizedOrder])[0]));
      window.sessionStorage.removeItem(CHECKOUT_SUBMISSION_STORAGE_KEY);
      pendingCheckoutSubmissionRef.current = null;
    } catch {
      // The confirmation route can still use the order number if browser storage is unavailable.
    }
    setShowTestCheckout(false);
    window.location.assign(`/order-confirmation?order=${encodeURIComponent(organizedOrder.orderNumber)}`);
  };

  const sendTestOrderEmail = async (order: TestOrder, paymentToken?: string) => {
    let submittedOrder = order;
    try {
      setCheckoutStatus('Securely submitting your order and sending confirmations...');
      const orderForEmail = getPersistableTestOrders([order])[0];
      const response = await fetch('/api/orders/test-submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(customerSession?.access_token ? { Authorization: `Bearer ${customerSession.access_token}` } : {}),
        },
        body: JSON.stringify({ order: orderForEmail, paymentToken, guestSessionId: customerSession?.user?.id ? undefined : getGuestUploadSessionId() })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; order?: TestOrder };
      if (payload.order) {
        submittedOrder = payload.order;
        setTestOrders((current) => current.map((entry) => entry.id === submittedOrder.id ? submittedOrder : entry));
        setLastTestOrder(submittedOrder);
      }
      if (!response.ok) throw new Error(payload.error || 'The order email could not be sent.');
      setCheckoutStatus(`Order ${submittedOrder.orderNumber} was securely submitted and confirmation emails were sent.`);
      return submittedOrder;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The order email could not be sent.';
      setCheckoutStatus(`Checkout stopped: ${message}`);
      throw error instanceof Error ? error : new Error(message);
    }
  };

  const createPayPalCheckoutOrder = async () => {
    const order = buildCheckoutOrder('paypal');
    if (!order) throw new Error('Finish the checkout contact and delivery details before paying.');
    setCheckoutStatus('Verifying pricing and opening secure PayPal Checkout...');
    const orderForPayment = getPersistableTestOrders([order])[0];
    const response = await fetch('/api/paypal/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(customerSession?.access_token ? { Authorization: `Bearer ${customerSession.access_token}` } : {}),
      },
      body: JSON.stringify({ order: orderForPayment, guestSessionId: customerSession?.user?.id ? undefined : getGuestUploadSessionId() })
    });
    const payload = await response.json().catch(() => ({})) as { id?: string; checkoutToken?: string; order?: TestOrder; error?: string };
    if (!response.ok || !payload.id || !payload.checkoutToken) throw new Error(payload.error || 'PayPal could not create a secure checkout.');
    const pricedOrder = payload.order ? { ...payload.order, paymentMode: 'paypal' as const } : order;
    pendingPayPalCheckoutRef.current = { order: pricedOrder, checkoutToken: payload.checkoutToken, paypalOrderId: payload.id };
    setCheckoutStatus('PayPal checkout is ready. Approve payment to submit the order.');
    return payload.id;
  };

  const approvePayPalCheckoutOrder = async (paypalOrderId: string) => {
    if (isSubmittingTestOrder) return;
    const pending = pendingPayPalCheckoutRef.current;
    if (!pending?.checkoutToken || pending.paypalOrderId !== paypalOrderId) throw new Error('This PayPal approval does not match the current checkout.');
    setIsSubmittingTestOrder(true);
    setCheckoutStatus('Capturing PayPal payment...');
    try {
      const captureResponse = await fetch('/api/paypal/capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paypalOrderId, checkoutToken: pending.checkoutToken }),
      });
      const capturePayload = await captureResponse.json().catch(() => ({})) as { paymentToken?: string; captureId?: string; paidAt?: string; error?: string };
      if (!captureResponse.ok || !capturePayload.paymentToken || !capturePayload.captureId) throw new Error(capturePayload.error || 'PayPal payment could not be captured.');
      pendingPayPalCheckoutRef.current = { ...pending, paymentToken: capturePayload.paymentToken, captureId: capturePayload.captureId, paidAt: capturePayload.paidAt };
      setPendingPayPalFinalization(true);
      setCheckoutStatus('Payment captured. Finalizing the Hue order...');
      const paidOrder: TestOrder = {
        ...pending.order,
        paymentMode: 'paypal',
        payment: { provider: 'paypal', status: 'completed', paypalOrderId, captureId: capturePayload.captureId, paidAt: capturePayload.paidAt },
      };
      const organizedOrder = await sendTestOrderEmail(paidOrder, capturePayload.paymentToken);
      completeSubmittedOrder(organizedOrder);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The paid order could not be finalized.';
      setCheckoutStatus(`Payment needs attention: ${message} If PayPal completed, do not pay again. Use Finalize Paid Order or contact Hue Graphics.`);
      throw error instanceof Error ? error : new Error(message);
    } finally {
      setIsSubmittingTestOrder(false);
    }
  };

  const finalizeCapturedPayPalOrder = async () => {
    if (isSubmittingTestOrder) return;
    const pending = pendingPayPalCheckoutRef.current;
    if (!pending?.paymentToken || !pending.captureId) {
      setCheckoutStatus('No captured PayPal payment is waiting to be finalized.');
      return;
    }
    setIsSubmittingTestOrder(true);
    setCheckoutStatus('Finalizing the paid PayPal order with Hue...');
    try {
      const paidOrder: TestOrder = {
        ...pending.order,
        paymentMode: 'paypal',
        payment: { provider: 'paypal', status: 'completed', paypalOrderId: pending.paypalOrderId, captureId: pending.captureId, paidAt: pending.paidAt },
      };
      const organizedOrder = await sendTestOrderEmail(paidOrder, pending.paymentToken);
      completeSubmittedOrder(organizedOrder);
    } finally {
      setIsSubmittingTestOrder(false);
    }
  };

  const submitTestOrder = async () => {
    if (isSubmittingTestOrder) return;
    const order = buildCheckoutOrder('test_no_payment');
    if (!order) return;
    setIsSubmittingTestOrder(true);
    setCheckoutStatus('Finalizing pricing and organizing production artwork...');
    let organizedOrder: TestOrder;
    try {
      organizedOrder = await sendTestOrderEmail(order);
    } catch {
      setIsSubmittingTestOrder(false);
      return;
    }
    setIsSubmittingTestOrder(false);
    completeSubmittedOrder(organizedOrder);
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
  const deleteSelected = () => { const canvas = fabricCanvasRef.current; if (!canvas) return; const selected = canvas.getActiveObject(); if (!selected) return; if (selected.type === 'activeSelection') (selected as ActiveSelection).getObjects().forEach((obj) => canvas.remove(obj)); else canvas.remove(selected); if (productMode === 'signage' && canvas.getObjects().length === 0) { setSignArtworkSize(null); setSignArtworkPreviewUrl(null); setSignArtworkDisplayUrl(null); setBannerArtworkName(''); setBannerArtworkFitState('unresolved'); } canvas.discardActiveObject(); canvas.requestRenderAll(); refreshLayers(canvas); };
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
    setSignArtworkDisplayUrl(null);
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
    setActiveBannerSetNumber(1);
    setPendingBannerPlacement(null);
    setRigidBackArtwork(null);
    setRigidArtworkTarget('front');
    setRigidPreviewSide('front');
    setBannerArtworkName('');
    setBannerArtworkFitState('unresolved');
    setCoroPlacementTarget({ itemId: null, side: 'front' });
    setCoroSheetViewSide('front');
    setIsAddingCoroSign(false);
    setSelectedImageZoneId(null);
    setActiveObject(null);
    setShowImageZone(false);
    setShowAcrylicTransparencyNotice(false);
    setAcrylicTransparencyAcknowledged(false);
    setAcrylicNoticeAction('library');
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
    const inferredPrintSize = getArtworkPrintSize(safeSourceWidth, safeSourceHeight);
    const targetWidth = signWidth > 0 ? signWidth : inferredPrintSize.width;
    const targetHeight = signHeight > 0 ? signHeight : inferredPrintSize.height;
    const scale = Math.min(targetWidth / safeSourceWidth, targetHeight / safeSourceHeight);
    return {
      width: Number((safeSourceWidth * scale).toFixed(2)),
      height: Number((safeSourceHeight * scale).toFixed(2))
    };
  };

  const fitObjectToArtworkArea = (obj: FabricObject, mode: 'contain' | 'cover' | 'stretch' | 'ratio') => {
    const area = getActiveArtworkArea();
    const objectWidth = Math.max(1, obj.width || 1);
    const objectHeight = Math.max(1, obj.height || 1);
    const paddedWidth = productMode === 'signage' ? area.width : area.width * 0.78;
    const paddedHeight = productMode === 'signage' ? area.height : area.height * 0.78;
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
      if (productMode === 'signage' && signArtworkPreviewUrl && (mode === 'contain' || mode === 'stretch')) {
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
      if (mode === 'contain' || mode === 'stretch') {
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
    const placementArtwork = productMode === 'signage'
      ? await getTransparentTrimmedArtwork(dataUrl).catch(() => ({ dataUrl, width: 0, height: 0, trimmed: false }))
      : { dataUrl, width: 0, height: 0, trimmed: false };
    const placementDataUrl = placementArtwork.trimmed ? placementArtwork.dataUrl : dataUrl;
    if (productMode === 'signage') {
      setSignArtworkPreviewUrl(dataUrl);
      setSignArtworkDisplayUrl(placementDataUrl);
    }
    if (productMode === 'signage') {
      canvas.getObjects().forEach((obj) => canvas.remove(obj));
      canvas.discardActiveObject();
    }
    const img = await FabricImage.fromURL(placementDataUrl);
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

  const requestAcrylicArtworkNotice = (action: 'library' | 'upload') => {
    if (selectedSignProduct.id !== 'acrylic' || acrylicTransparencyAcknowledged) return false;
    setAcrylicNoticeAction(action);
    setShowAcrylicTransparencyNotice(true);
    return true;
  };

  const openArtworkLibrary = () => {
    if (requestAcrylicArtworkNotice('library')) return;
    setShowNewArtworkDialog(false);
    setShowArtworkEditor(false);
    setArtworkEditorOrderReturn(null);
    setShowCustomerLogin(false);
    setShowImageZone(true);
  };

  const openStandaloneImageZone = () => {
    setShowNewArtworkDialog(false);
    setShowArtworkEditor(false);
    setArtworkEditorOrderReturn(null);
    setShowCustomerLogin(false);
    setShowImageZone(true);
  };

  const openNewArtworkCreator = (context: 'home-create' | 'image-zone-create') => {
    setArtworkEditorLaunchContext(context);
    setNewArtworkError('');
    setShowCustomerLogin(false);
    setShowArtworkEditor(false);
    setArtworkEditorOrderReturn(null);
    setShowImageZone(false);
    setShowNewArtworkDialog(true);
  };

  const closeNewArtworkCreator = () => {
    setShowNewArtworkDialog(false);
    if (artworkEditorLaunchContext === 'image-zone-create') setShowImageZone(true);
  };

  const openCustomerAccount = () => {
    setShowImageZone(false);
    setShowNewArtworkDialog(false);
    setShowArtworkEditor(false);
    setArtworkEditorOrderReturn(null);
    setShowCustomerLogin(true);
  };

  const acknowledgeAcrylicTransparencyNotice = () => {
    const nextAction = acrylicNoticeAction;
    setAcrylicTransparencyAcknowledged(true);
    setShowAcrylicTransparencyNotice(false);
    if (nextAction === 'upload') {
      requestArtworkUpload('Choose a transparent PNG artwork file for Acrylic spot white.');
      return;
    }
    setShowImageZone(true);
  };

  const requestArtworkUpload = (status = 'Choose an image or PDF artwork file.') => {
    if (!customerSession?.access_token) {
      setPendingGuestUploadStatus(status);
      setShowGuestArtworkWarning(true);
      return;
    }
    setImageLibraryStatus(status);
    artworkUploadInputRef.current?.click();
  };

  const continueGuestArtworkUpload = () => {
    setShowGuestArtworkWarning(false);
    setImageLibraryStatus(pendingGuestUploadStatus);
    window.setTimeout(() => artworkUploadInputRef.current?.click(), 0);
  };

  const openAccountFromGuestArtworkWarning = () => {
    setShowGuestArtworkWarning(false);
    setCustomerAuthMode('signup');
    setCustomerAuthStatus('Create an account or sign in to keep artwork securely in your private Image Zone library.');
    setShowCustomerLogin(true);
  };

  const triggerArtworkUpload = () => {
    setImageLibraryStatus('Choose saved artwork or upload a new file from Image Zone.');
    openArtworkLibrary();
  };

  const canPlaceImageZoneItem = (item: ImageZoneItem) => Boolean(item.mimeType?.startsWith('image/') || item.dataUrl.startsWith('data:image/') || isLikelyImagePath(item.name) || isLikelyImagePath(item.dataUrl));

  const refreshCurrentCustomerSession = async () => {
    const refreshedSession = await refreshSupabaseSession(customerSession);
    if (!refreshedSession) return null;
    setCustomerSession(refreshedSession);
    window.localStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, JSON.stringify(refreshedSession));
    setCustomerAuthStatus(`Signed in as ${refreshedSession.user?.email || 'customer'}.`);
    return refreshedSession;
  };

  const getSignedImageZoneUrl = async (storagePath: string) => {
    try {
      return await getSupabaseSignedUrl(storagePath, customerSession);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!isSupabaseSessionExpiredError(message)) throw error;
      const refreshedSession = await refreshCurrentCustomerSession();
      if (!refreshedSession) throw new Error('Your saved artwork session expired. Please sign in again to use library files.');
      return getSupabaseSignedUrl(storagePath, refreshedSession);
    }
  };

  const hasImageZoneThumbnail = (item: ImageZoneItem) => Boolean(item.dataUrl && canPlaceImageZoneItem(item));

  const deleteImageZoneItem = async (item: ImageZoneItem) => {
    if (item.source === 'archive') {
      setImageLibraryStatus(`${item.name} is safely archived in Hue Drive storage. Restore it to use it again.`);
      return;
    }
    const relatedFileCount = 1 + (item.backDataUrl ? 1 : 0) + (item.editorProject ? 1 : 0);
    const confirmed = window.confirm(relatedFileCount > 1
      ? `Permanently delete ${item.name} and its related back/editable files from Image Zone? This cannot be undone.`
      : `Permanently delete ${item.name} from Image Zone? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingImageZoneId(item.id);
    setImageLibraryStatus(`Deleting ${item.name}...`);
    try {
      if (item.source === 'supabase' && item.storagePath) {
        if (!customerSession?.access_token) throw new Error('Sign in to delete cloud-saved artwork from your Image Zone.');
        let activeSession: CustomerSession | null = customerSession;
        if (activeSession.expires_at && (activeSession.expires_at * 1000) <= Date.now() + 60_000) {
          activeSession = await refreshCurrentCustomerSession();
          if (!activeSession) throw new Error('Your Hue Studio session expired. Sign in again, then retry deletion.');
        }
        const storageFolder = item.storagePath.includes('/') ? item.storagePath.slice(0, item.storagePath.lastIndexOf('/')) : '';
        const derivedBackPath = item.backName && storageFolder ? `${storageFolder}/${item.backName}` : undefined;
        const storagePaths = Array.from(new Set([item.storagePath, item.backStoragePath || derivedBackPath, item.projectStoragePath].filter(Boolean) as string[]));
        for (const storagePath of storagePaths) {
          let response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${encodeStoragePath(storagePath)}`, {
            method: 'DELETE',
            headers: getSupabaseStorageHeaders(activeSession.access_token)
          });
          if (!response.ok) {
            const firstMessage = await getErrorMessage(response);
            if (!isSupabaseSessionExpiredError(firstMessage)) throw new Error(firstMessage);
            activeSession = await refreshCurrentCustomerSession();
            if (!activeSession) throw new Error('Your Hue Studio session expired. Sign in again, then retry deletion.');
            response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${encodeStoragePath(storagePath)}`, {
              method: 'DELETE',
              headers: getSupabaseStorageHeaders(activeSession.access_token)
            });
            if (!response.ok) throw new Error(await getErrorMessage(response));
          }
        }
      }
      setImageZoneItems((previous) => previous.filter((entry) => entry.id !== item.id));
      setSelectedImageZoneId((current) => current === item.id ? null : current);
      setImageLibraryStatus(`${item.name} was permanently deleted from Image Zone.`);
    } catch (error) {
      setImageLibraryStatus(`Could not delete ${item.name}: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setDeletingImageZoneId(null);
    }
  };

  const hydrateImageZoneItemSize = async (item: ImageZoneItem) => {
    if (item.source === 'archive') throw new Error('Restore this archived artwork before using it.');
    const refreshedUrl = item.source === 'supabase' && item.storagePath
      ? await getSignedImageZoneUrl(item.storagePath)
      : item.dataUrl;
    const isPdfItem = item.mimeType === 'application/pdf' || /\.pdf$/i.test(item.name);
    if (isPdfItem) {
      const preview = await renderPdfFirstPage(refreshedUrl);
      const sizedItem = {
        ...item,
        dataUrl: preview.dataUrl,
        storageUrl: item.storagePath ? refreshedUrl : item.storageUrl,
        width: preview.width,
        height: preview.height,
        dpi: preview.dpi,
        signWidth: preview.signWidth,
        signHeight: preview.signHeight
      };
      setImageZoneItems((prev) => prev.map((entry) => entry.id === item.id ? sizedItem : entry));
      return sizedItem;
    }
    const size = item.width > 0 && item.height > 0 && refreshedUrl === item.dataUrl
      ? { width: item.width, height: item.height }
      : await getImageNaturalSize(refreshedUrl);
    const sizedItem = { ...item, dataUrl: refreshedUrl, storageUrl: item.storagePath ? refreshedUrl : item.storageUrl, width: size.width, height: size.height };
    setImageZoneItems((prev) => prev.map((entry) => entry.id === item.id ? sizedItem : entry));
    return sizedItem;
  };

  const applySignSizeFromPixels = (width: number, height: number, resolution?: ImageResolution | null) => {
    if (!width || !height) return null;
    const { width: nextWidth, height: nextHeight } = getArtworkPrintSize(width, height, resolution);
    setSignValues((prev) => ({ ...prev, width: String(nextWidth), height: String(nextHeight) }));
    setSignArtworkSize({ width: nextWidth, height: nextHeight });
    setBannerArtworkFitState('unresolved');
    setSignEstimate(null);
    return { width: nextWidth, height: nextHeight };
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
    setSignArtworkDisplayUrl(null);
    setRigidBackArtwork(null);
    setRigidArtworkTarget('front');
    setRigidPreviewSide('front');
    setBannerArtworkName('');
    setBannerArtworkFitState('unresolved');
    if (isRigidSignBuilder) setSignValues((prev) => ({ ...prev, sides: 'single' }));
  };

  const removeRigidBackArtwork = () => {
    setRigidBackArtwork(null);
    setRigidArtworkTarget('front');
    setRigidPreviewSide('front');
    setSignValues((prev) => ({ ...prev, sides: 'single' }));
    setSignEstimate(null);
    setImageLibraryStatus('Back artwork removed. Single-sided pricing is now active.');
  };

  const copyRigidFrontToBack = async () => {
    if (!signArtworkPreviewUrl) {
      setImageLibraryStatus('Add front artwork before using it for the back side.');
      return;
    }
    try {
      const librarySource = imageZoneItems.find((item) => item.dataUrl === signArtworkPreviewUrl || item.storageUrl === signArtworkPreviewUrl);
      const naturalSize = librarySource?.width && librarySource?.height
        ? { width: librarySource.width, height: librarySource.height }
        : await getImageNaturalSize(signArtworkPreviewUrl);
      const copiedBack: ImageZoneItem = {
        ...(librarySource || {}),
        id: `front-copy-${Date.now()}`,
        name: `${bannerArtworkName || librarySource?.name || 'Front artwork'} - back`,
        dataUrl: signArtworkPreviewUrl,
        width: naturalSize.width,
        height: naturalSize.height,
        dpi: librarySource?.dpi || BANNER_PREVIEW_DPI,
        uploadedAt: new Date().toLocaleString(),
        source: librarySource?.source || 'local',
        mimeType: librarySource?.mimeType || 'image/png',
        signWidth,
        signHeight,
        backDataUrl: undefined,
        backName: undefined,
        backStoragePath: undefined,
        backWidth: undefined,
        backHeight: undefined,
        backCopiedFromFront: true,
        backFitState: bannerArtworkFitState
      };
      setRigidBackArtwork(copiedBack);
      setRigidArtworkTarget('front');
      setRigidPreviewSide('back');
      setSignValues((prev) => ({ ...prev, sides: 'double' }));
      setSignEstimate(null);
      setImageLibraryStatus('Front artwork is now being used for the back side.');
    } catch (error) {
      setImageLibraryStatus(`Could not use the front artwork for the back: ${error instanceof Error ? error.message : 'image failed to load'}.`);
    }
  };

  const makeCurrentBannerOrderItem = (setNumber = activeBannerSetNumber): BannerOrderItem => ({
    id: `banner-${Date.now()}-${Math.round(Math.random() * 10000)}`,
    setNumber,
    name: bannerArtworkName || 'Banner artwork',
    dataUrl: signArtworkPreviewUrl,
    width: signWidth,
    height: signHeight,
    quantity: designerQuantity,
    artworkSize: signArtworkSize,
    fitState: bannerArtworkFitState,
    backArtwork: rigidBackArtwork,
    sides: String(signValues.sides || 'single'),
    material: String(signValues.material || ''),
    materialLabel: getBannerMaterialLabel(String(signValues.material || '')),
    estimate: signEstimate,
    localOptionTotal: signLocalOptionTotal
  });

  const startAddBannerItem = () => {
    const hasCurrentItem = Boolean(signArtworkPreviewUrl || signArtworkSize);
    if (!hasCurrentItem) {
      setImageLibraryStatus(`Choose artwork for artwork set ${activeBannerSetNumber}.`);
      setActiveCoroOptionPanel('images');
      return;
    }
    const nextSetNumber = Math.max(activeBannerSetNumber, ...bannerOrderItems.map((item) => item.setNumber)) + 1;
    setBannerOrderItems((prev) => {
      return [...prev, makeCurrentBannerOrderItem(activeBannerSetNumber)].sort((a, b) => a.setNumber - b.setNumber);
    });
    setActiveBannerSetNumber(nextSetNumber);
    clearCurrentBannerArtwork();
    setActiveCoroOptionPanel('images');
    setImageLibraryStatus(`Choose artwork for artwork set ${nextSetNumber}.`);
  };

  const loadBannerOrderItem = async (item: BannerOrderItem, preserveCurrent = true) => {
    const selectedSetNumber = item.setNumber || bannerOrderItems.findIndex((entry) => entry.id === item.id) + 1;
    const hasCurrentItem = Boolean(signArtworkPreviewUrl || signArtworkSize);
    const currentItem = preserveCurrent && hasCurrentItem ? makeCurrentBannerOrderItem(activeBannerSetNumber) : null;
    setBannerOrderItems((prev) => {
      const selectedIndex = prev.findIndex((entry) => entry.id === item.id);
      if (selectedIndex < 0) return prev;
      const next = [...prev];
      if (currentItem) next.splice(selectedIndex, 1, currentItem);
      else next.splice(selectedIndex, 1);
      return next.sort((a, b) => a.setNumber - b.setNumber);
    });
    setActiveBannerSetNumber(selectedSetNumber);
    setSignValues((prev) => ({
      ...prev,
      width: String(item.width),
      height: String(item.height),
      quantity: String(item.quantity),
      sides: item.sides || 'single',
      material: item.material || prev.material
    }));
    setSignArtworkSize(item.artworkSize);
    setSignArtworkPreviewUrl(item.dataUrl);
    setSignArtworkDisplayUrl(item.dataUrl);
    setRigidBackArtwork(item.backArtwork || null);
    setRigidArtworkTarget('front');
    setRigidPreviewSide('front');
    setBannerArtworkName(item.name);
    setBannerArtworkFitState(item.fitState);
    setSignEstimate(item.estimate || null);
    setActiveCoroOptionPanel('images');
    if (item.dataUrl) {
      await placeImageOnDesign(item.dataUrl, item.name);
    } else {
      clearCurrentBannerArtwork();
    }
    setImageLibraryStatus(`Artwork set ${selectedSetNumber} loaded for editing.`);
  };

  const deleteCurrentBannerArtworkSet = async () => {
    const sortedItems = [...bannerOrderItems].sort((a, b) => a.setNumber - b.setNumber);
    const previousItem = sortedItems[sortedItems.length - 1];
    if (previousItem) {
      await loadBannerOrderItem(previousItem, false);
      setImageLibraryStatus('Removed the extra artwork set.');
      return;
    }
    clearCurrentBannerArtwork();
    setActiveBannerSetNumber(1);
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
        sourceSignWidth: item.sourceSignWidth || item.signWidth,
        sourceSignHeight: item.sourceSignHeight || item.signHeight,
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
        // Keep the physical dimensions detected from the uploaded file even while
        // a standard CORO preset is selected. If the customer later switches to
        // Custom Cut, these become the editable starting dimensions instead of 0 x 0.
        signWidth: isCustomCoro ? Number(signValues.width || item.signWidth || 0) : item.signWidth,
        signHeight: isCustomCoro ? Number(signValues.height || item.signHeight || 0) : item.signHeight,
        sourceSignWidth: item.sourceSignWidth || item.signWidth,
        sourceSignHeight: item.sourceSignHeight || item.signHeight,
        fluteDirection: isCustomCoro ? String(signValues.fluteDirection || 'auto') : undefined
      };
      return shouldAppend ? [...withoutDuplicate, newItem] : [newItem];
    });
    setCoroArtworkQuantities((prev) => shouldAppend ? { ...prev, [item.id]: prev[item.id] || 1 } : { [item.id]: designerQuantity });
    if (isCustomCoro && (!Number(signValues.width || 0) || !Number(signValues.height || 0)) && item.signWidth && item.signHeight) {
      setSignValues((previous) => ({ ...previous, width: String(item.signWidth), height: String(item.signHeight) }));
    }
    if (isAddingCoroSign) {
      setIsAddingCoroSign(false);
    }
    setSignArtworkPreviewUrl(item.dataUrl);
    setSignArtworkSize({ width: signWidth, height: signHeight });
    setActiveCoroOptionPanel('images');
    setImageLibraryStatus(`${item.name} placed on the ${selectedSignProduct.name} production sheet.`);
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

  const switchCoroToCustomSize = () => {
    const normalizedItems = coroSheetArtworkItems.map((item) => {
      const detectedSize = Number(item.signWidth || 0) > 0 && Number(item.signHeight || 0) > 0
        ? { width: Number(item.signWidth), height: Number(item.signHeight) }
        : getArtworkPrintSize(
          item.width,
          item.height,
          isUsableImageDpi(item.dpi) ? { dpiX: item.dpi, dpiY: item.dpi } : null
        );
      return {
        ...item,
        signWidth: detectedSize.width,
        signHeight: detectedSize.height,
        sourceSignWidth: item.sourceSignWidth || item.signWidth || detectedSize.width,
        sourceSignHeight: item.sourceSignHeight || item.signHeight || detectedSize.height,
        frontFitState: 'unresolved' as ArtworkFitState,
        backFitState: item.backDataUrl ? 'unresolved' as ArtworkFitState : item.backFitState
      };
    });
    const firstSize = normalizedItems[0];
    setCoroSheetArtworkItems(normalizedItems);
    setSignValues((previous) => ({
      ...previous,
      size: 'custom',
      width: firstSize ? String(firstSize.signWidth) : String(previous.width || 0),
      height: firstSize ? String(firstSize.signHeight) : String(previous.height || 0)
    }));
    setSignEstimate(null);
    setActiveCoroOptionPanel('images');
    setImageLibraryStatus(firstSize
      ? `Custom size started at the uploaded artwork's detected size: ${firstSize.signWidth}\" × ${firstSize.signHeight}\".`
      : 'Custom size selected. Enter the finished width and height for each artwork set.');
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
    setImageLibraryStatus(fitState === 'stretch' ? 'Artwork will fill the selected sign size.' : 'Artwork will stay proportional and centered with blank space if needed.');
  };

  const refreshArtworkEditorLayers = (canvas: Canvas) => {
    const active = canvas.getActiveObject();
    const items = canvas.getObjects().filter((object) => (object as FabricObject & { data?: { editorRole?: string } }).data?.editorRole !== 'base').map((object, index) => {
      const editableObject = object as FabricObject & { data?: { layerId?: string; layerName?: string; locked?: boolean } };
      if (!editableObject.data) editableObject.data = {};
      if (!editableObject.data.layerId) editableObject.data.layerId = `artwork-editor-${Date.now()}-${index}`;
      const fallbackName = object.type === 'i-text' ? `Text ${index + 1}` : object.type === 'line' ? `Line ${index + 1}` : `Shape ${index + 1}`;
      return { id: editableObject.data.layerId, name: editableObject.data.layerName || fallbackName, type: object.type, isActive: active === object, isLocked: Boolean(editableObject.data.locked) };
    }).reverse();
    setArtworkEditorLayers(items);
  };

  const updateArtworkEditorHistoryButtons = () => {
    setArtworkEditorCanUndo(artworkEditorHistoryIndexRef.current > 0);
    setArtworkEditorCanRedo(artworkEditorHistoryIndexRef.current >= 0 && artworkEditorHistoryIndexRef.current < artworkEditorHistoryRef.current.length - 1);
  };

  const captureArtworkEditorHistory = (canvas: Canvas) => {
    if (artworkEditorRestoringRef.current) return;
    const json = JSON.stringify(canvas.toObject(['data']));
    artworkEditorSideSnapshotsRef.current[artworkEditorSideRef.current] = json;
    if (artworkEditorHistoryRef.current[artworkEditorHistoryIndexRef.current] === json) return;
    artworkEditorHistoryRef.current = artworkEditorHistoryRef.current.slice(0, artworkEditorHistoryIndexRef.current + 1);
    artworkEditorHistoryRef.current.push(json);
    if (artworkEditorHistoryRef.current.length > 30) artworkEditorHistoryRef.current.shift();
    artworkEditorHistoryIndexRef.current = artworkEditorHistoryRef.current.length - 1;
    updateArtworkEditorHistoryButtons();
  };

  const restoreArtworkEditorHistory = async (offset: number) => {
    const canvas = artworkEditorCanvasRef.current;
    if (!canvas) return;
    const nextIndex = artworkEditorHistoryIndexRef.current + offset;
    if (nextIndex < 0 || nextIndex >= artworkEditorHistoryRef.current.length) return;
    artworkEditorRestoringRef.current = true;
    artworkEditorHistoryIndexRef.current = nextIndex;
    await canvas.loadFromJSON(artworkEditorHistoryRef.current[nextIndex]);
    canvas.getObjects().forEach((object) => {
      object.set(FABRIC_CONTROL_STYLE);
      const objectData = (object as FabricObject & { data?: { editorRole?: string; locked?: boolean } }).data;
      if (objectData?.editorRole === 'base') object.set({ selectable: false, evented: false, hasControls: false });
      else if (objectData?.locked) object.set({ selectable: false, evented: false, lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
    });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setArtworkEditorActiveObject(null);
    refreshArtworkEditorLayers(canvas);
    artworkEditorRestoringRef.current = false;
    updateArtworkEditorHistoryButtons();
  };

  const syncArtworkEditorControls = (object: FabricObject | null) => {
    setArtworkEditorActiveObject(object);
    if (!object) return;
    if (object.type === 'i-text') {
      const textObject = object as IText;
      setArtworkEditorText(textObject.text || '');
      setArtworkEditorFont(textObject.fontFamily || FONT_OPTIONS[0].value);
      setArtworkEditorFontSize(Math.round(textObject.fontSize || 54));
      setArtworkEditorCharSpacing(Math.round(textObject.charSpacing || 0));
      setArtworkEditorLineHeight(Number((textObject.lineHeight || 1.16).toFixed(2)));
    }
    if (typeof object.fill === 'string') setArtworkEditorFill(object.fill);
    const objectData = (object as FabricObject & { data?: { layerName?: string; qrValue?: string; qrColor?: string } }).data;
    if (objectData?.layerName === 'QR Code') {
      if (objectData.qrValue) setArtworkEditorQrValue(objectData.qrValue);
      if (objectData.qrColor) setArtworkEditorFill(objectData.qrColor);
    }
    if (typeof object.stroke === 'string') setArtworkEditorStroke(object.stroke);
    setArtworkEditorStrokeWidth(Number(object.strokeWidth || 0));
    setArtworkEditorOpacity(Math.round((object.opacity ?? 1) * 100));
    const canvas = artworkEditorCanvasRef.current;
    const source = artworkEditorSource;
    if (canvas && source) {
      const printSize = source.signWidth && source.signHeight ? { width: source.signWidth, height: source.signHeight } : getArtworkPrintSize(source.width, source.height);
      const center = object.getCenterPoint();
      setArtworkEditorExactX(Number(((center.x / canvas.getWidth()) * printSize.width).toFixed(2)));
      setArtworkEditorExactY(Number(((center.y / canvas.getHeight()) * printSize.height).toFixed(2)));
      setArtworkEditorExactWidth(Number(((object.getScaledWidth() / canvas.getWidth()) * printSize.width).toFixed(2)));
      setArtworkEditorExactHeight(Number(((object.getScaledHeight() / canvas.getHeight()) * printSize.height).toFixed(2)));
      setArtworkEditorExactRotation(Number((object.angle || 0).toFixed(1)));
    }
  };

  const startArtworkEditor = (source: ImageZoneItem, status: string) => {
    const borderPrintSize = source.signWidth && source.signHeight ? { width: source.signWidth, height: source.signHeight } : getArtworkPrintSize(source.width, source.height);
    const recommendedBorder = getRecommendedBorderSize(borderPrintSize.width, borderPrintSize.height);
    setArtworkEditorSource(source);
    setArtworkEditorSide('front');
    artworkEditorSideRef.current = 'front';
    setArtworkEditorHasBackSide(Boolean(source.backDataUrl || source.editorProject?.back));
    artworkEditorSideSnapshotsRef.current = source.editorProject ? { front: source.editorProject.front, back: source.editorProject.back } : { front: null, back: null };
    setArtworkEditorText('Your text');
    setArtworkEditorFont(FONT_OPTIONS[0].value);
    setArtworkEditorFontSize(54);
    setArtworkEditorCharSpacing(0);
    setArtworkEditorLineHeight(1.16);
    setArtworkEditorFill('#0b1f44');
    setArtworkEditorStroke('#ffffff');
    setArtworkEditorStrokeWidth(0);
    setArtworkEditorOpacity(100);
    setArtworkEditorBackground('#ffffff');
    setArtworkEditorBorderInset(recommendedBorder.inset);
    setArtworkEditorBorderThickness(recommendedBorder.thickness);
    setArtworkEditorBorderColor('#0b1f44');
    setArtworkEditorZoom(1);
    setArtworkEditorLeftPanelOpen(true);
    setArtworkEditorMobileView('canvas');
    setArtworkEditorSnapToCenter(true);
    artworkEditorSnapToCenterRef.current = true;
    setArtworkEditorShowGuides(true);
    setArtworkEditorPrintView(false);
    setArtworkEditorBrightness(0);
    setArtworkEditorContrast(0);
    setArtworkEditorSaturation(0);
    setArtworkEditorVersions([]);
    setArtworkEditorReloadKey(0);
    setArtworkEditorStatus(status);
    setShowImageZone(false);
    setShowNewArtworkDialog(false);
    setShowArtworkEditor(true);
  };

  const closeArtworkEditor = () => {
    const returnToImageZone = artworkEditorLaunchContext === 'image-zone-edit' || artworkEditorLaunchContext === 'image-zone-create';
    setShowArtworkEditor(false);
    setArtworkEditorOrderReturn(null);
    setShowNewArtworkDialog(false);
    setArtworkEditorPrintView(false);
    if (returnToImageZone) setShowImageZone(true);
  };

  const clearArtworkEditorSelection = () => {
    const canvas = artworkEditorCanvasRef.current;
    if (!canvas) return;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setArtworkEditorActiveObject(null);
    refreshArtworkEditorLayers(canvas);
  };

  const toggleArtworkEditorPrintView = () => {
    const canvas = artworkEditorCanvasRef.current;
    const nextPrintView = !artworkEditorPrintView;
    if (canvas) {
      canvas.discardActiveObject();
      canvas.selection = !nextPrintView;
      (canvas as Canvas & { skipTargetFind: boolean }).skipTargetFind = nextPrintView;
      canvas.requestRenderAll();
      setArtworkEditorActiveObject(null);
      refreshArtworkEditorLayers(canvas);
    }
    setArtworkEditorPrintView(nextPrintView);
    setArtworkEditorMobileView('canvas');
    setArtworkEditorStatus(nextPrintView ? 'Print View is showing the clean design. Editing controls and production guides are temporarily hidden.' : 'Print View closed. Select an element to continue editing.');
  };

  const openArtworkEditor = async () => {
    setArtworkEditorOrderReturn(null);
    setArtworkEditorLaunchContext('image-zone-edit');
    const source = imageZoneItems.find((item) => item.id === selectedImageZoneId);
    if (!source || !canPlaceImageZoneItem(source)) {
      setImageLibraryStatus('Select a PNG, JPG, or other previewable image before opening Hue Designer.');
      return;
    }
    try {
      const hydratedSource = await hydrateImageZoneItemSize(source);
      startArtworkEditor(hydratedSource, 'Original artwork loaded. Add text or shapes, then save a new copy when you are ready.');
    } catch (error) {
      setImageLibraryStatus(error instanceof Error ? error.message : 'The selected artwork could not be opened in the editor.');
    }
  };

  const buildNewArtwork = () => {
    const group = NEW_ARTWORK_PRESET_GROUPS.find((entry) => entry.id === newArtworkPresetGroupId) || NEW_ARTWORK_PRESET_GROUPS[0];
    const selectedPreset = group.sizes.find((size) => `${size.width}x${size.height}` === newArtworkPresetKey) || group.sizes[0];
    const width = newArtworkUseCustomSize ? Number(newArtworkCustomWidth) : selectedPreset.width;
    const height = newArtworkUseCustomSize ? Number(newArtworkCustomHeight) : selectedPreset.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 240 || height > 240) {
      setNewArtworkError('Enter a width and height between 1 and 240 inches.');
      return;
    }
    const exportDpi = Math.max(25, Math.min(150, 6000 / Math.max(width, height)));
    const blankCanvas = document.createElement('canvas');
    blankCanvas.width = 16;
    blankCanvas.height = 16;
    const context = blankCanvas.getContext('2d');
    if (!context) {
      setNewArtworkError('The blank artwork canvas could not be created in this browser.');
      return;
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, blankCanvas.width, blankCanvas.height);
    const categoryName = newArtworkUseCustomSize ? 'custom-sign' : group.id;
    const source: ImageZoneItem = {
      id: `new-artwork-${Date.now()}`,
      name: `${categoryName}-${width}x${height}.png`,
      dataUrl: blankCanvas.toDataURL('image/png'),
      width: Math.max(1, Math.round(width * exportDpi)),
      height: Math.max(1, Math.round(height * exportDpi)),
      dpi: Math.round(exportDpi),
      uploadedAt: new Date().toLocaleString(),
      source: 'local',
      mimeType: 'image/png',
      signWidth: width,
      signHeight: height
    };
    setNewArtworkError('');
    setShowNewArtworkDialog(false);
    setShowImageZone(false);
    startArtworkEditor(source, `Blank ${width}\" × ${height}\" artboard ready. Add text and shapes, then save it into Image Zone.`);
  };

  const commitArtworkEditorChange = (object?: FabricObject | null) => {
    const canvas = artworkEditorCanvasRef.current;
    if (!canvas) return;
    object?.setCoords();
    canvas.requestRenderAll();
    refreshArtworkEditorLayers(canvas);
    captureArtworkEditorHistory(canvas);
  };

  const toggleArtworkEditorLayerLock = (layerId: string) => {
    const canvas = artworkEditorCanvasRef.current;
    const object = canvas?.getObjects().find((entry) => (entry as FabricObject & { data?: { layerId?: string } }).data?.layerId === layerId);
    if (!canvas || !object) return;
    const editableObject = object as FabricObject & { data?: { layerId?: string; layerName?: string; locked?: boolean } };
    if (!editableObject.data) editableObject.data = { layerId };
    const locked = !editableObject.data.locked;
    editableObject.data.locked = locked;
    object.set({ selectable: !locked, evented: !locked, lockMovementX: locked, lockMovementY: locked, lockScalingX: locked, lockScalingY: locked, lockRotation: locked, hasControls: !locked });
    if (locked && canvas.getActiveObject() === object) {
      canvas.discardActiveObject();
      setArtworkEditorActiveObject(null);
    }
    object.setCoords();
    canvas.requestRenderAll();
    refreshArtworkEditorLayers(canvas);
    captureArtworkEditorHistory(canvas);
    setArtworkEditorStatus(`${editableObject.data.layerName || 'Layer'} ${locked ? 'locked. Clicks now pass through it.' : 'unlocked and ready to edit.'}`);
  };

  const addArtworkEditorText = () => {
    const canvas = artworkEditorCanvasRef.current;
    if (!canvas) return;
    const text = new IText(artworkEditorText.trim() || 'Your text', {
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
      originX: 'center',
      originY: 'center',
      fontFamily: artworkEditorFont,
      fontSize: artworkEditorFontSize,
      charSpacing: artworkEditorCharSpacing,
      lineHeight: artworkEditorLineHeight,
      fill: artworkEditorFill,
      stroke: artworkEditorStrokeWidth > 0 ? artworkEditorStroke : undefined,
      strokeWidth: artworkEditorStrokeWidth,
      paintFirst: 'stroke',
      opacity: artworkEditorOpacity / 100,
      shadow: new Shadow({ color: 'rgba(0,0,0,0.18)', blur: 4, offsetX: 2, offsetY: 2 }),
      ...FABRIC_CONTROL_STYLE
    });
    (text as FabricObject & { data?: { layerId?: string; layerName?: string } }).data = { layerId: `artwork-editor-${Date.now()}`, layerName: artworkEditorText.trim() || 'Text' };
    canvas.add(text);
    canvas.setActiveObject(text);
    syncArtworkEditorControls(text);
    commitArtworkEditorChange(text);
  };

  const addArtworkEditorImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const canvas = artworkEditorCanvasRef.current;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!canvas || !file) return;
    try {
      validateClientArtworkFile(file);
    } catch (error) {
      setArtworkEditorStatus(error instanceof Error ? error.message : 'Choose a supported artwork image.');
      return;
    }
    setArtworkEditorStatus(`Adding ${file.name} to the artboard...`);
    const objectUrl = URL.createObjectURL(file);
    artworkEditorObjectUrlsRef.current.push(objectUrl);
    try {
      await addArtworkEditorImageLayer(objectUrl, file.name, 'uploaded-image');
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      artworkEditorObjectUrlsRef.current = artworkEditorObjectUrlsRef.current.filter((url) => url !== objectUrl);
      setArtworkEditorStatus(`The image could not be added: ${error instanceof Error ? error.message : 'unsupported image file'}.`);
    }
  };

  const addArtworkEditorImageLayer = async (dataUrl: string, name: string, editorTool = 'image-zone') => {
    const canvas = artworkEditorCanvasRef.current;
    if (!canvas) throw new Error('Hue Designer is still loading.');
    const image = await FabricImage.fromURL(dataUrl, dataUrl.startsWith('http') ? { crossOrigin: 'anonymous' } : undefined);
    const scale = Math.min((canvas.getWidth() * 0.7) / Math.max(1, image.width || 1), (canvas.getHeight() * 0.7) / Math.max(1, image.height || 1), 1);
    image.set({ left: canvas.getWidth() / 2, top: canvas.getHeight() / 2, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale, ...FABRIC_CONTROL_STYLE });
    (image as FabricObject & { data?: { layerId?: string; layerName?: string; editorTool?: string } }).data = { layerId: `artwork-editor-image-${Date.now()}`, layerName: name, editorTool };
    canvas.add(image);
    canvas.setActiveObject(image);
    syncArtworkEditorControls(image);
    commitArtworkEditorChange(image);
    setArtworkEditorStatus(`${name} added as an editable image layer.`);
  };

  const runArtworkEditorQuickAi = async (action: 'remove-background' | 'restore') => {
    const canvas = artworkEditorCanvasRef.current;
    const selected = canvas?.getActiveObject() as (FabricImage & { data?: { layerId?: string; layerName?: string; editorRole?: string; locked?: boolean; editorTool?: string } }) | undefined;
    if (!canvas || !selected || selected.type !== 'image') {
      setArtworkEditorStatus('Select an image layer before using Hue AI quick tools.');
      return;
    }
    if (selected.data?.editorRole === 'base' || selected.data?.locked) {
      setArtworkEditorStatus('Choose an unlocked image layer before using Hue AI quick tools.');
      return;
    }
    setArtworkEditorAiAction(action);
    setArtworkEditorStatus(action === 'remove-background' ? 'Hue AI is removing the background from the selected image...' : 'Hue AI is enhancing the selected image...');
    try {
      const sourceUrl = typeof selected.getSrc === 'function' ? selected.getSrc() : '';
      if (!sourceUrl) throw new Error('The selected image source could not be read.');
      const sourceResponse = await fetch(sourceUrl);
      if (!sourceResponse.ok) throw new Error('The selected image could not be prepared for Hue AI.');
      const sourceBlob = await sourceResponse.blob();
      const layerName = selected.data?.layerName || 'artwork-layer';
      const file = new File([sourceBlob], `${layerName.replace(/\.[^.]+$/, '')}-${action}.png`, { type: sourceBlob.type || 'image/png' });
      const formData = new FormData();
      formData.append('image', file);
      formData.append('action', action);
      formData.append('prompt', '');
      formData.append('targetColor', aiEditTargetColor);
      formData.append('quality', aiEditQuality);
      const response = await fetch('/api/image-zone/ai-edit', { method: 'POST', headers: customerSession?.access_token ? { Authorization: `Bearer ${customerSession.access_token}` } : undefined, body: formData });
      const result = await response.json() as { imageDataUrl?: string; error?: string };
      if (!response.ok || !result.imageDataUrl) throw new Error(result.error || 'Hue AI could not update this image.');
      const replacement = await FabricImage.fromURL(result.imageDataUrl);
      replacement.set({
        left: selected.left,
        top: selected.top,
        originX: selected.originX,
        originY: selected.originY,
        scaleX: selected.getScaledWidth() / Math.max(1, replacement.width || 1),
        scaleY: selected.getScaledHeight() / Math.max(1, replacement.height || 1),
        angle: selected.angle,
        flipX: selected.flipX,
        flipY: selected.flipY,
        opacity: selected.opacity,
        shadow: selected.shadow,
        ...FABRIC_CONTROL_STYLE
      });
      (replacement as FabricImage & { data?: { layerId?: string; layerName?: string; editorTool?: string } }).data = { ...selected.data, layerName: action === 'remove-background' ? `${layerName.replace(/\s*\(background removed\)$/i, '')} (background removed)` : `${layerName.replace(/\s*\(enhanced\)$/i, '')} (enhanced)`, editorTool: 'hue-ai-quick' };
      const index = canvas.getObjects().indexOf(selected);
      canvas.remove(selected);
      canvas.add(replacement);
      canvas.moveObjectTo(replacement, Math.max(0, index));
      canvas.setActiveObject(replacement);
      syncArtworkEditorControls(replacement);
      commitArtworkEditorChange(replacement);
      setArtworkEditorStatus(action === 'remove-background' ? 'Background removed on the selected image. Save the design when you are ready.' : 'Selected image enhanced. Save the design when you are ready.');
    } catch (error) {
      setArtworkEditorStatus(`Hue AI quick edit failed: ${error instanceof Error ? error.message : 'unknown error'}.`);
    } finally {
      setArtworkEditorAiAction(null);
    }
  };

  const fitArtworkEditorSelectedImage = (mode: 'fit' | 'fill' | 'stretch') => {
    const canvas = artworkEditorCanvasRef.current;
    const object = canvas?.getActiveObject();
    if (!canvas || !object || object.type !== 'image' || (object as FabricObject & { data?: { editorRole?: string } }).data?.editorRole === 'base') return;
    const image = object as FabricImage;
    const imageWidth = Math.max(1, image.width || 1);
    const imageHeight = Math.max(1, image.height || 1);
    if (mode === 'stretch') image.set({ scaleX: canvas.getWidth() / imageWidth, scaleY: canvas.getHeight() / imageHeight });
    else {
      const scale = mode === 'fit' ? Math.min(canvas.getWidth() / imageWidth, canvas.getHeight() / imageHeight) : Math.max(canvas.getWidth() / imageWidth, canvas.getHeight() / imageHeight);
      image.set({ scaleX: scale, scaleY: scale });
    }
    image.set({ left: canvas.getWidth() / 2, top: canvas.getHeight() / 2, originX: 'center', originY: 'center', angle: 0 });
    if (mode === 'fill') {
      canvas.sendObjectToBack(image);
      const originalArtwork = canvas.getObjects().find((entry) => (entry as FabricObject & { data?: { editorRole?: string } }).data?.editorRole === 'base');
      if (originalArtwork) canvas.sendObjectToBack(originalArtwork);
    }
    image.setCoords();
    commitArtworkEditorChange(image);
    setArtworkEditorStatus(mode === 'fill' ? 'Image filled the artboard as a background; excess artwork is cropped at the edges.' : mode === 'stretch' ? 'Image stretched to every edge of the artboard.' : 'Image fit completely inside the artboard.');
  };

  const addArtworkEditorShape = (shape: 'rectangle' | 'circle' | 'triangle' | 'line') => {
    const canvas = artworkEditorCanvasRef.current;
    if (!canvas) return;
    const common = { left: canvas.getWidth() / 2, top: canvas.getHeight() / 2, originX: 'center' as const, originY: 'center' as const, fill: artworkEditorFill, stroke: artworkEditorStroke, strokeWidth: Math.max(0, artworkEditorStrokeWidth), opacity: artworkEditorOpacity / 100, ...FABRIC_CONTROL_STYLE };
    const object = shape === 'rectangle'
      ? new Rect({ ...common, width: 220, height: 130, rx: 10, ry: 10 })
      : shape === 'circle'
        ? new Circle({ ...common, radius: 85 })
        : shape === 'triangle'
          ? new Triangle({ ...common, width: 190, height: 165 })
          : new Line([-110, 0, 110, 0], { ...common, fill: undefined, stroke: artworkEditorFill, strokeWidth: Math.max(4, artworkEditorStrokeWidth || 8) });
    (object as FabricObject & { data?: { layerId?: string; layerName?: string } }).data = { layerId: `artwork-editor-${Date.now()}`, layerName: shape[0].toUpperCase() + shape.slice(1) };
    canvas.add(object);
    canvas.setActiveObject(object);
    syncArtworkEditorControls(object);
    commitArtworkEditorChange(object);
  };

  const addOrUpdateArtworkEditorBorder = () => {
    const canvas = artworkEditorCanvasRef.current;
    const source = artworkEditorSource;
    if (!canvas || !source) return;
    const printSize = source.signWidth && source.signHeight
      ? { width: source.signWidth, height: source.signHeight }
      : getArtworkPrintSize(source.width, source.height);
    const shortestSide = Math.max(1, Math.min(printSize.width, printSize.height));
    const thickness = Math.max(0.0625, Math.min(Number(artworkEditorBorderThickness) || 0.5, shortestSide / 3));
    const inset = Math.max(0, Math.min(Number(artworkEditorBorderInset) || 0, (shortestSide - thickness) / 2));
    const pixelsPerInchX = canvas.getWidth() / Math.max(1, printSize.width);
    const pixelsPerInchY = canvas.getHeight() / Math.max(1, printSize.height);
    const strokeWidth = thickness * Math.min(pixelsPerInchX, pixelsPerInchY);
    const width = Math.max(1, canvas.getWidth() - (inset * pixelsPerInchX * 2) - strokeWidth);
    const height = Math.max(1, canvas.getHeight() - (inset * pixelsPerInchY * 2) - strokeWidth);
    const existing = canvas.getObjects().find((entry) => (entry as FabricObject & { data?: { editorTool?: string } }).data?.editorTool === 'automatic-border') as Rect | undefined;
    const border = existing || new Rect({ ...FABRIC_CONTROL_STYLE });
    border.set({ left: canvas.getWidth() / 2, top: canvas.getHeight() / 2, width, height, scaleX: 1, scaleY: 1, angle: 0, originX: 'center', originY: 'center', fill: 'transparent', stroke: artworkEditorBorderColor, strokeWidth, strokeUniform: true, rx: 0, ry: 0, opacity: 1, selectable: false, evented: false, lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true, hasControls: false, ...FABRIC_CONTROL_STYLE });
    (border as FabricObject & { data?: { layerId?: string; layerName?: string; editorTool?: string; locked?: boolean } }).data = {
      ...((border as FabricObject & { data?: { layerId?: string; layerName?: string; editorTool?: string; locked?: boolean } }).data || {}),
      layerId: (border as FabricObject & { data?: { layerId?: string } }).data?.layerId || `artwork-editor-border-${Date.now()}`,
      layerName: 'Automatic Border',
      editorTool: 'automatic-border',
      locked: true
    };
    if (!existing) canvas.add(border);
    canvas.bringObjectToFront(border);
    canvas.discardActiveObject();
    setArtworkEditorActiveObject(null);
    commitArtworkEditorChange(border);
    setArtworkEditorBorderInset(inset);
    setArtworkEditorBorderThickness(thickness);
    setArtworkEditorStatus(`Border centered at ${inset}\" inside the edge and ${thickness}\" thick. The border layer is locked so you can select artwork beneath it.`);
  };

  const updateArtworkEditorSelected = (updates: Partial<FabricObject>) => {
    const canvas = artworkEditorCanvasRef.current;
    const object = canvas?.getActiveObject();
    if (!canvas || !object || (object as FabricObject & { data?: { editorRole?: string } }).data?.editorRole === 'base') return;
    object.set(updates);
    commitArtworkEditorChange(object);
  };

  const applyArtworkEditorText = () => {
    const object = artworkEditorCanvasRef.current?.getActiveObject();
    if (!object || object.type !== 'i-text') return;
    const textObject = object as IText & { data?: { layerName?: string; layerId?: string } };
    textObject.set({ text: artworkEditorText || 'Your text', fontFamily: artworkEditorFont, fontSize: artworkEditorFontSize, charSpacing: artworkEditorCharSpacing, lineHeight: artworkEditorLineHeight, fill: artworkEditorFill, stroke: artworkEditorStrokeWidth > 0 ? artworkEditorStroke : undefined, strokeWidth: artworkEditorStrokeWidth, opacity: artworkEditorOpacity / 100 });
    if (!textObject.data) textObject.data = {};
    textObject.data.layerName = artworkEditorText || 'Text';
    commitArtworkEditorChange(textObject);
  };

  const deleteArtworkEditorSelected = () => {
    const canvas = artworkEditorCanvasRef.current;
    const object = canvas?.getActiveObject();
    if (!canvas || !object || (object as FabricObject & { data?: { editorRole?: string } }).data?.editorRole === 'base') return;
    canvas.remove(object);
    canvas.discardActiveObject();
    setArtworkEditorActiveObject(null);
    commitArtworkEditorChange(null);
  };

  const duplicateArtworkEditorSelected = async () => {
    const canvas = artworkEditorCanvasRef.current;
    const object = canvas?.getActiveObject();
    if (!canvas || !object || (object as FabricObject & { data?: { editorRole?: string } }).data?.editorRole === 'base') return;
    const clone = await object.clone() as FabricObject & { data?: { layerId?: string; layerName?: string } };
    clone.set({ left: (object.left || 0) + 24, top: (object.top || 0) + 24 });
    clone.data = { ...(clone.data || {}), layerId: `artwork-editor-${Date.now()}`, layerName: `${clone.data?.layerName || 'Object'} copy` };
    canvas.add(clone);
    canvas.setActiveObject(clone);
    syncArtworkEditorControls(clone);
    commitArtworkEditorChange(clone);
  };

  const moveArtworkEditorLayer = (direction: 'front' | 'back' | 'forward' | 'backward') => {
    const canvas = artworkEditorCanvasRef.current;
    const object = canvas?.getActiveObject();
    if (!canvas || !object) return;
    if (direction === 'front') canvas.bringObjectToFront(object);
    if (direction === 'forward') canvas.bringObjectForward(object);
    if (direction === 'backward') canvas.sendObjectBackwards(object);
    if (direction === 'back') canvas.sendObjectToBack(object);
    const background = canvas.getObjects().find((entry) => (entry as FabricObject & { data?: { editorRole?: string } }).data?.editorRole === 'base');
    if (background) canvas.sendObjectToBack(background);
    commitArtworkEditorChange(object);
  };

  const moveArtworkEditorLayerById = (layerId: string, direction: 'up' | 'down') => {
    const canvas = artworkEditorCanvasRef.current;
    const object = canvas?.getObjects().find((entry) => (entry as FabricObject & { data?: { layerId?: string } }).data?.layerId === layerId);
    if (!canvas || !object) return;
    if (direction === 'up') canvas.bringObjectForward(object);
    else canvas.sendObjectBackwards(object);
    const originalArtwork = canvas.getObjects().find((entry) => (entry as FabricObject & { data?: { editorRole?: string } }).data?.editorRole === 'base');
    if (originalArtwork) canvas.sendObjectToBack(originalArtwork);
    canvas.requestRenderAll();
    refreshArtworkEditorLayers(canvas);
    captureArtworkEditorHistory(canvas);
    const layerName = (object as FabricObject & { data?: { layerName?: string } }).data?.layerName || 'Layer';
    setArtworkEditorStatus(`${layerName} moved ${direction === 'up' ? 'up' : 'down'} one layer.`);
  };

  const centerArtworkEditorSelected = (axis: 'horizontal' | 'vertical' | 'both') => {
    const canvas = artworkEditorCanvasRef.current;
    const object = canvas?.getActiveObject();
    if (!canvas || !object) return;
    if (axis === 'horizontal' || axis === 'both') object.set({ left: canvas.getWidth() / 2, originX: 'center' });
    if (axis === 'vertical' || axis === 'both') object.set({ top: canvas.getHeight() / 2, originY: 'center' });
    commitArtworkEditorChange(object);
  };

  const transformArtworkEditorSelected = (action: 'rotate' | 'flip-horizontal' | 'flip-vertical' | 'shadow' | 'uppercase') => {
    const canvas = artworkEditorCanvasRef.current;
    const object = canvas?.getActiveObject();
    if (!canvas || !object) return;
    if (action === 'rotate') object.rotate(((object.angle || 0) + 90) % 360);
    if (action === 'flip-horizontal') object.set({ flipX: !object.flipX });
    if (action === 'flip-vertical') object.set({ flipY: !object.flipY });
    if (action === 'shadow') object.set({ shadow: object.shadow ? null : new Shadow({ color: 'rgba(0,0,0,0.38)', blur: 10, offsetX: 5, offsetY: 5 }) });
    if (action === 'uppercase' && object.type === 'i-text') {
      const textObject = object as IText;
      const uppercaseText = (textObject.text || '').toUpperCase();
      textObject.set({ text: uppercaseText });
      setArtworkEditorText(uppercaseText);
      const editableText = textObject as IText & { data?: { layerName?: string } };
      if (editableText.data) editableText.data.layerName = uppercaseText || 'Text';
    }
    object.setCoords();
    commitArtworkEditorChange(object);
  };

  const updateArtworkEditorExactTransform = (field: 'x' | 'y' | 'width' | 'height' | 'rotation', value: number) => {
    const canvas = artworkEditorCanvasRef.current;
    const source = artworkEditorSource;
    const object = canvas?.getActiveObject();
    if (!canvas || !source || !object || !Number.isFinite(value)) return;
    const printSize = source.signWidth && source.signHeight ? { width: source.signWidth, height: source.signHeight } : getArtworkPrintSize(source.width, source.height);
    if (field === 'x' || field === 'y') {
      const center = object.getCenterPoint();
      const target = field === 'x' ? (value / printSize.width) * canvas.getWidth() : (value / printSize.height) * canvas.getHeight();
      object.set(field === 'x' ? { left: (object.left || 0) + target - center.x } : { top: (object.top || 0) + target - center.y });
    }
    if (field === 'width') object.scaleX = object.scaleX * (((value / printSize.width) * canvas.getWidth()) / Math.max(1, object.getScaledWidth()));
    if (field === 'height') object.scaleY = object.scaleY * (((value / printSize.height) * canvas.getHeight()) / Math.max(1, object.getScaledHeight()));
    if (field === 'rotation') object.rotate(value);
    object.setCoords();
    syncArtworkEditorControls(object);
    commitArtworkEditorChange(object);
  };

  const groupArtworkEditorSelection = () => {
    const canvas = artworkEditorCanvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    if (active.type === 'activeSelection') {
      const selection = active as ActiveSelection;
      const objects = selection.removeAll();
      canvas.discardActiveObject();
      objects.forEach((object) => canvas.remove(object));
      const group = new Group(objects, { ...FABRIC_CONTROL_STYLE });
      (group as FabricObject & { data?: { layerId?: string; layerName?: string } }).data = { layerId: `artwork-editor-group-${Date.now()}`, layerName: 'Grouped elements' };
      canvas.add(group);
      canvas.setActiveObject(group);
      syncArtworkEditorControls(group);
      commitArtworkEditorChange(group);
      return;
    }
    if (active.type === 'group') {
      const group = active as Group;
      const objects = group.removeAll();
      canvas.remove(group);
      objects.forEach((object) => canvas.add(object));
      const selection = new ActiveSelection(objects, { canvas });
      canvas.setActiveObject(selection);
      syncArtworkEditorControls(selection);
      commitArtworkEditorChange(selection);
    }
  };

  const alignArtworkEditorSelection = (mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distribute-x' | 'distribute-y') => {
    const canvas = artworkEditorCanvasRef.current;
    const objects = canvas?.getActiveObjects() || [];
    if (!canvas || objects.length < 2) return;
    const bounds = objects.map((object) => ({ object, rect: object.getBoundingRect(), center: object.getCenterPoint() }));
    const left = Math.min(...bounds.map((entry) => entry.rect.left));
    const right = Math.max(...bounds.map((entry) => entry.rect.left + entry.rect.width));
    const top = Math.min(...bounds.map((entry) => entry.rect.top));
    const bottom = Math.max(...bounds.map((entry) => entry.rect.top + entry.rect.height));
    if (mode === 'distribute-x' || mode === 'distribute-y') {
      const sorted = [...bounds].sort((a, b) => mode === 'distribute-x' ? a.center.x - b.center.x : a.center.y - b.center.y);
      const first = mode === 'distribute-x' ? sorted[0].center.x : sorted[0].center.y;
      const last = mode === 'distribute-x' ? sorted[sorted.length - 1].center.x : sorted[sorted.length - 1].center.y;
      sorted.forEach((entry, index) => {
        const target = first + ((last - first) * index) / Math.max(1, sorted.length - 1);
        entry.object.set(mode === 'distribute-x' ? { left: (entry.object.left || 0) + target - entry.center.x } : { top: (entry.object.top || 0) + target - entry.center.y });
        entry.object.setCoords();
      });
    } else bounds.forEach((entry) => {
      const targetX = mode === 'left' ? left + entry.rect.width / 2 : mode === 'right' ? right - entry.rect.width / 2 : (left + right) / 2;
      const targetY = mode === 'top' ? top + entry.rect.height / 2 : mode === 'bottom' ? bottom - entry.rect.height / 2 : (top + bottom) / 2;
      if (mode === 'left' || mode === 'center' || mode === 'right') entry.object.set({ left: (entry.object.left || 0) + targetX - entry.center.x });
      else entry.object.set({ top: (entry.object.top || 0) + targetY - entry.center.y });
      entry.object.setCoords();
    });
    canvas.requestRenderAll();
    captureArtworkEditorHistory(canvas);
  };

  const applyArtworkEditorGradient = () => {
    const object = artworkEditorCanvasRef.current?.getActiveObject();
    if (!object || object.type === 'image') return;
    object.set({ fill: new Gradient({ type: 'linear', gradientUnits: 'percentage', coords: { x1: 0, y1: 0, x2: 1, y2: 1 }, colorStops: [{ offset: 0, color: artworkEditorGradientStart }, { offset: 1, color: artworkEditorGradientEnd }] }) });
    commitArtworkEditorChange(object);
  };

  const applyArtworkEditorImageFilters = () => {
    const object = artworkEditorCanvasRef.current?.getActiveObject();
    if (!object || object.type !== 'image') return;
    const image = object as FabricImage;
    image.filters = [new filters.Brightness({ brightness: artworkEditorBrightness }), new filters.Contrast({ contrast: artworkEditorContrast }), new filters.Saturation({ saturation: artworkEditorSaturation })];
    image.applyFilters();
    commitArtworkEditorChange(image);
  };

  const applyArtworkEditorImageMask = (mask: 'none' | 'circle' | 'rounded') => {
    const object = artworkEditorCanvasRef.current?.getActiveObject();
    if (!object || object.type !== 'image') return;
    const image = object as FabricImage;
    image.clipPath = mask === 'circle' ? new Circle({ radius: Math.min(image.width || 1, image.height || 1) / 2, originX: 'center', originY: 'center' }) : mask === 'rounded' ? new Rect({ width: image.width || 1, height: image.height || 1, rx: Math.min(image.width || 1, image.height || 1) * 0.12, ry: Math.min(image.width || 1, image.height || 1) * 0.12, originX: 'center', originY: 'center' }) : undefined;
    commitArtworkEditorChange(image);
  };

  const applyArtworkEditorFreeCrop = () => {
    const object = artworkEditorCanvasRef.current?.getActiveObject();
    if (!object || object.type !== 'image') return;
    const image = object as FabricImage;
    const left = Math.max(0, Math.min(90, artworkEditorCrop.left));
    const right = Math.max(0, Math.min(90 - left, artworkEditorCrop.right));
    const top = Math.max(0, Math.min(90, artworkEditorCrop.top));
    const bottom = Math.max(0, Math.min(90 - top, artworkEditorCrop.bottom));
    const width = Math.max(1, (image.width || 1) * (1 - (left + right) / 100));
    const height = Math.max(1, (image.height || 1) * (1 - (top + bottom) / 100));
    image.clipPath = new Rect({ width, height, left: ((left - right) / 200) * (image.width || 1), top: ((top - bottom) / 200) * (image.height || 1), originX: 'center', originY: 'center' });
    commitArtworkEditorChange(image);
    setArtworkEditorStatus('Custom crop applied. The original image pixels are still preserved in this editable design.');
  };

  const rememberArtworkEditorColor = (color: string) => {
    setArtworkEditorRecentColors((current) => {
      const next = [color, ...current.filter((entry) => entry.toLowerCase() !== color.toLowerCase())].slice(0, 10);
      window.localStorage.setItem('hue-artwork-recent-colors', JSON.stringify(next));
      return next;
    });
  };

  const addArtworkEditorBrandColor = () => {
    setArtworkEditorBrandColors((current) => {
      const next = [artworkEditorFill, ...current.filter((entry) => entry.toLowerCase() !== artworkEditorFill.toLowerCase())].slice(0, 16);
      window.localStorage.setItem('hue-artwork-brand-colors', JSON.stringify(next));
      return next;
    });
    rememberArtworkEditorColor(artworkEditorFill);
  };

  const applyArtworkEditorTextCurve = (amount = artworkEditorTextCurve) => {
    const object = artworkEditorCanvasRef.current?.getActiveObject();
    if (!object || object.type !== 'i-text') return;
    const text = object as IText;
    if (amount === 0) text.set({ path: undefined } as Partial<IText>);
    else {
      const width = Math.max(180, text.getScaledWidth() * 1.15);
      const bend = (amount / 100) * Math.max(50, width * 0.35);
      text.set({ path: new Path(`M 0 100 Q ${width / 2} ${100 - bend} ${width} 100`, { visible: false }), pathAlign: 'center', pathSide: 'left' } as Partial<IText>);
    }
    commitArtworkEditorChange(text);
  };

  const addArtworkEditorTextBackground = () => {
    const canvas = artworkEditorCanvasRef.current;
    const object = canvas?.getActiveObject();
    if (!canvas || !object || object.type !== 'i-text') return;
    const bounds = object.getBoundingRect();
    const box = new Rect({ left: bounds.left + bounds.width / 2, top: bounds.top + bounds.height / 2, originX: 'center', originY: 'center', width: bounds.width + artworkEditorTextBoxPadding * 2, height: bounds.height + artworkEditorTextBoxPadding * 2, rx: 10, ry: 10, fill: artworkEditorTextBoxColor, selectable: false, evented: false });
    (box as FabricObject & { data?: { layerId?: string; layerName?: string; locked?: boolean } }).data = { layerId: `text-box-${Date.now()}`, layerName: 'Text Background', locked: true };
    const textIndex = canvas.getObjects().indexOf(object);
    canvas.add(box);
    canvas.moveObjectTo(box, Math.max(0, textIndex));
    canvas.setActiveObject(object);
    commitArtworkEditorChange(object);
  };

  const addArtworkEditorOuterOutline = async () => {
    const canvas = artworkEditorCanvasRef.current;
    const object = canvas?.getActiveObject();
    if (!canvas || !object || object.type !== 'i-text') return;
    const outline = await (object as IText).clone();
    outline.set({ fill: 'transparent', stroke: artworkEditorOuterOutlineColor, strokeWidth: artworkEditorOuterOutlineWidth, paintFirst: 'stroke', selectable: false, evented: false });
    (outline as FabricObject & { data?: { layerId?: string; layerName?: string; locked?: boolean } }).data = { layerId: `text-outline-${Date.now()}`, layerName: 'Outer Text Outline', locked: true };
    const textIndex = canvas.getObjects().indexOf(object);
    canvas.add(outline);
    canvas.moveObjectTo(outline, Math.max(0, textIndex));
    canvas.setActiveObject(object);
    commitArtworkEditorChange(object);
  };

  const applyArtworkEditorShadow = (remove = false) => {
    const object = artworkEditorCanvasRef.current?.getActiveObject();
    if (!object) return;
    const alpha = Math.max(0, Math.min(1, artworkEditorShadowOpacity / 100));
    const rgb = artworkEditorShadowColor.match(/[a-f\d]{2}/gi)?.map((part) => parseInt(part, 16)) || [0, 0, 0];
    object.set({ shadow: remove ? undefined : new Shadow({ color: `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`, blur: artworkEditorShadowBlur, offsetX: artworkEditorShadowOffsetX, offsetY: artworkEditorShadowOffsetY }) });
    commitArtworkEditorChange(object);
  };

  const beginArtworkEditorGuideDrag = (axis: 'vertical' | 'horizontal', index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const viewport = artworkEditorViewportRef.current;
    if (!viewport) return;
    const move = (pointerEvent: PointerEvent) => {
      const rect = viewport.getBoundingClientRect();
      const percent = axis === 'vertical' ? ((pointerEvent.clientX - rect.left) / rect.width) * 100 : ((pointerEvent.clientY - rect.top) / rect.height) * 100;
      const next = Math.max(0, Math.min(100, percent));
      const setter = axis === 'vertical' ? setArtworkEditorVerticalGuides : setArtworkEditorHorizontalGuides;
      setter((current) => current.map((value, guideIndex) => guideIndex === index ? next : value));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const setArtworkEditorCanvasZoom = (value: number) => {
    const next = Math.max(0.5, Math.min(2.5, Number(value.toFixed(1))));
    const canvas = artworkEditorCanvasRef.current;
    setArtworkEditorZoom(next);
    if (!canvas) return;
    const center = new Point(canvas.getWidth() / 2, canvas.getHeight() / 2);
    canvas.zoomToPoint(center, next);
    canvas.requestRenderAll();
  };

  const resetArtworkEditorCanvasZoom = () => {
    const canvas = artworkEditorCanvasRef.current;
    setArtworkEditorZoom(1);
    if (!canvas) return;
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.requestRenderAll();
  };

  const addArtworkEditorIcon = (symbol: string, name: string) => {
    const canvas = artworkEditorCanvasRef.current;
    if (!canvas) return;
    const icon = new IText(symbol, { left: canvas.getWidth() / 2, top: canvas.getHeight() / 2, originX: 'center', originY: 'center', fontFamily: 'Arial, sans-serif', fontSize: 96, fill: artworkEditorFill, ...FABRIC_CONTROL_STYLE });
    (icon as FabricObject & { data?: { layerId?: string; layerName?: string } }).data = { layerId: `artwork-editor-icon-${Date.now()}`, layerName: name };
    canvas.add(icon);
    canvas.setActiveObject(icon);
    syncArtworkEditorControls(icon);
    commitArtworkEditorChange(icon);
  };

  const addArtworkEditorQrCode = async () => {
    const canvas = artworkEditorCanvasRef.current;
    if (!canvas || artworkEditorQrValue.trim().length < 3) return;
    try {
      const dataUrl = await QRCode.toDataURL(artworkEditorQrValue.trim(), { width: 1200, margin: 2, color: { dark: artworkEditorFill, light: '#ffffff00' } });
      const image = await FabricImage.fromURL(dataUrl);
      const scale = Math.min(220 / Math.max(1, image.width || 1), 220 / Math.max(1, image.height || 1));
      image.set({ left: canvas.getWidth() / 2, top: canvas.getHeight() / 2, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale, ...FABRIC_CONTROL_STYLE });
      (image as FabricObject & { data?: { layerId?: string; layerName?: string; qrValue?: string; qrColor?: string } }).data = { layerId: `artwork-editor-qr-${Date.now()}`, layerName: 'QR Code', qrValue: artworkEditorQrValue.trim(), qrColor: artworkEditorFill };
      canvas.add(image);
      canvas.setActiveObject(image);
      syncArtworkEditorControls(image);
      commitArtworkEditorChange(image);
    } catch (error) {
      setArtworkEditorStatus(`QR code could not be created: ${error instanceof Error ? error.message : 'invalid value'}.`);
    }
  };

  const updateArtworkEditorQrCode = async () => {
    const canvas = artworkEditorCanvasRef.current;
    const selected = canvas?.getActiveObject() as (FabricImage & { data?: { layerId?: string; layerName?: string; qrValue?: string; qrColor?: string } }) | undefined;
    if (!canvas || !selected || selected.type !== 'image' || selected.data?.layerName !== 'QR Code') {
      setArtworkEditorStatus('Select a QR Code layer before changing its color.');
      return;
    }
    const value = (selected.data.qrValue || artworkEditorQrValue).trim();
    if (value.length < 3) return;
    try {
      const dataUrl = await QRCode.toDataURL(value, { width: 1200, margin: 2, color: { dark: artworkEditorFill, light: '#ffffff00' } });
      const replacement = await FabricImage.fromURL(dataUrl);
      replacement.set({ left: selected.left, top: selected.top, originX: selected.originX, originY: selected.originY, scaleX: selected.getScaledWidth() / Math.max(1, replacement.width || 1), scaleY: selected.getScaledHeight() / Math.max(1, replacement.height || 1), angle: selected.angle, flipX: selected.flipX, flipY: selected.flipY, opacity: selected.opacity, ...FABRIC_CONTROL_STYLE });
      (replacement as FabricImage & { data?: { layerId?: string; layerName?: string; qrValue?: string; qrColor?: string } }).data = { ...selected.data, qrValue: value, qrColor: artworkEditorFill };
      const index = canvas.getObjects().indexOf(selected);
      canvas.remove(selected);
      canvas.add(replacement);
      canvas.moveObjectTo(replacement, Math.max(0, index));
      canvas.setActiveObject(replacement);
      rememberArtworkEditorColor(artworkEditorFill);
      syncArtworkEditorControls(replacement);
      commitArtworkEditorChange(replacement);
      setArtworkEditorStatus(`QR Code color updated to ${artworkEditorFill}.`);
    } catch (error) {
      setArtworkEditorStatus(`QR Code could not be updated: ${error instanceof Error ? error.message : 'invalid value'}.`);
    }
  };

  const chooseSmartTemplate = (template: SmartTemplate) => {
    const categoryDetails: Record<SmartTemplateCategory, { detailLine: string; footerNote: string }> = {
      'Real Estate': { detailLine: '123 Main Street', footerNote: 'Licensed Real Estate Professional' },
      'Business': { detailLine: '123 Main Street · Your City', footerNote: 'Locally owned and operated' },
      'Business Cards': { detailLine: 'YOUR TITLE · YOUR COMPANY', footerNote: 'Replace every detail with your own' },
      'Contractors': { detailLine: 'Residential · Commercial', footerNote: 'Licensed · Insured · Free Estimates' },
      'Events': { detailLine: '123 Main Street · Your City', footerNote: 'Everyone is welcome' },
      'Parking & Directional': { detailLine: 'CUSTOMER PARKING', footerNote: 'Please follow posted instructions' },
      'Political & Campaign': { detailLine: 'YOUR CITY / YOUR COUNTY', footerNote: 'Paid for by the candidate committee' },
      'School & Graduation': { detailLine: 'SCHOOL NAME / CLASS OF 2026', footerNote: 'Celebrating students and community' },
      'Church & Nonprofit': { detailLine: '123 Main Street / Your City', footerNote: 'Serving our community together' },
      'Restaurant & Food': { detailLine: '123 Main Street / Your City', footerNote: 'Fresh food / Friendly service' },
      'Construction & Safety': { detailLine: 'ACTIVE WORK AREA', footerNote: 'Follow all posted safety instructions' },
      'Property & Regulatory': { detailLine: 'PROPERTY MANAGEMENT', footerNote: 'Please observe posted rules' },
      'Retail & Promotion': { detailLine: '123 Main Street / Your City', footerNote: 'Shop local / Thank you for visiting' }
    };
    setSelectedSmartTemplateId(template.id);
    setSmartTemplateForm({
      headline: template.headline,
      subheadline: template.subheadline,
      name: template.callout,
      phone: '(555) 555-0123',
      website: 'yourwebsite.com',
      detailLine: categoryDetails[template.category].detailLine,
      footerNote: categoryDetails[template.category].footerNote,
      qrValue: 'https://yourwebsite.com',
      primary: template.primary,
      accent: template.accent,
      background: template.background,
      includeQr:
        template.category === 'Real Estate' ||
        template.category === 'Business' ||
        (template.category === 'Business Cards' && template.tags.includes('qr'))
    });
    setSmartTemplateLogo(null);
    setSmartTemplatePhoto(null);
  };

  const readSmartTemplateAsset = (file: File | undefined, kind: 'logo' | 'photo') => {
    if (!file) return;
    const supportedType = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type.toLowerCase());
    const supportedExtension = /\.(png|jpe?g|webp|gif)$/i.test(file.name);
    if (!supportedType || !supportedExtension) {
      setArtworkEditorStatus('Smart Template logo and photo files must be PNG, JPG, WebP, or GIF images. SVG files are not accepted.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setArtworkEditorStatus('Smart Template images must be 20 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const asset = { name: file.name, dataUrl: String(reader.result || '') };
      if (kind === 'logo') setSmartTemplateLogo(asset);
      else setSmartTemplatePhoto(asset);
    };
    reader.readAsDataURL(file);
  };

  const openSmartTemplateLibrary = () => {
    setShowSmartTemplateLibrary(true);
    if (!selectedSmartTemplateId) chooseSmartTemplate(SMART_TEMPLATES[0]);
  };

  const generateSmartTemplate = async () => {
    const canvas = artworkEditorCanvasRef.current;
    const template = SMART_TEMPLATES.find((entry) => entry.id === selectedSmartTemplateId);
    if (!canvas || !template) return;
    const family = getSmartTemplateFamily(template);
    const layout = family.layout;
    const existingEditableObjects = canvas.getObjects().filter((object) => (object as FabricObject & { data?: { editorRole?: string } }).data?.editorRole !== 'base');
    if (existingEditableObjects.length && !window.confirm('Replace the current editable design with this Hue Smart Template? Your original uploaded artwork will remain preserved.')) return;
    setIsGeneratingSmartTemplate(true);
    try {
      existingEditableObjects.forEach((object) => canvas.remove(object));
      canvas.backgroundColor = smartTemplateForm.background;
      setArtworkEditorBackground(smartTemplateForm.background);
      const width = canvas.getWidth();
      const height = canvas.getHeight();
      const stamp = Date.now();
      const addLayerData = (object: FabricObject, name: string, locked = false) => {
        (object as FabricObject & { data?: { layerId?: string; layerName?: string; locked?: boolean; smartTemplateId?: string } }).data = { layerId: `smart-${template.id}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}`, layerName: name, locked, smartTemplateId: template.id };
      };
      const addText = (text: string, options: Record<string, unknown>, name: string, maxWidth = width * 0.82) => {
        const object = new IText(text || ' ', { originX: 'center', originY: 'center', textAlign: 'center', fontFamily: family.bodyFont, ...FABRIC_CONTROL_STYLE, ...options });
        if (object.width && object.width > maxWidth) object.scaleX = maxWidth / object.width;
        addLayerData(object, name);
        canvas.add(object);
        return object;
      };
      const addShape = (options: ConstructorParameters<typeof Rect>[0], name: string, locked = true) => {
        const object = new Rect({ selectable: !locked, evented: !locked, ...options });
        addLayerData(object, name, locked);
        canvas.add(object);
        return object;
      };
      const loadAsset = async (asset: { name: string; dataUrl: string } | null, layerName: string) => {
        if (!asset) return null;
        const image = await FabricImage.fromURL(asset.dataUrl);
        (image as FabricImage & { data?: { layerId?: string; layerName?: string; smartTemplateId?: string; sourceName?: string } }).data = { layerId: `smart-${template.id}-${layerName.toLowerCase()}-${stamp}`, layerName, smartTemplateId: template.id, sourceName: asset.name };
        image.set({ ...FABRIC_CONTROL_STYLE });
        return image;
      };
      const placeAsset = (image: FabricImage, x: number, y: number, maxWidth: number, maxHeight: number) => {
        const scale = Math.min(maxWidth / Math.max(1, image.width || 1), maxHeight / Math.max(1, image.height || 1));
        image.set({ left: x, top: y, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale });
        canvas.add(image);
      };
      const photoAsset = await loadAsset(smartTemplatePhoto, 'Photo');
      const logoAsset = await loadAsset(smartTemplateLogo, 'Logo');
      const hasPhoto = Boolean(photoAsset);

      if (family.id === 'industrial-grid') {
        addShape({ left: width * 0.025, top: height * 0.04, originX: 'left', originY: 'top', width: width * 0.012, height: height * 0.92, fill: smartTemplateForm.accent }, 'Industrial Edge');
      } else if (family.id === 'playful-pop') {
        addShape({ left: width * 0.82, top: height * 0.08, originX: 'left', originY: 'top', width: width * 0.11, height: height * 0.055, rx: 999, ry: 999, fill: smartTemplateForm.accent }, 'Playful Accent');
      } else if (family.id === 'luxury-signature') {
        addShape({ left: width * 0.24, top: height * 0.205, originX: 'left', originY: 'top', width: width * 0.52, height: Math.max(2, height * 0.008), fill: smartTemplateForm.accent }, 'Signature Rule');
      }

      if (layout === 'band') {
        addShape({ left: 0, top: 0, originX: 'left', originY: 'top', width, height: height * 0.25, fill: smartTemplateForm.primary }, 'Primary Header');
        addShape({ left: 0, top: height * 0.25, originX: 'left', originY: 'top', width, height: height * 0.045, fill: smartTemplateForm.accent }, 'Accent Band');
        addShape({ left: 0, top: height * 0.81, originX: 'left', originY: 'top', width, height: height * 0.19, fill: smartTemplateForm.primary }, 'Contact Footer');
        if (photoAsset) { addShape({ left: width * 0.69, top: height * 0.34, originX: 'left', originY: 'top', width: width * 0.25, height: height * 0.39, fill: '#ffffff', stroke: smartTemplateForm.accent, strokeWidth: 5 }, 'Photo Frame'); placeAsset(photoAsset, width * 0.815, height * 0.535, width * 0.22, height * 0.34); }
        addText(smartTemplateForm.headline, { left: width / 2, top: height * 0.125, fontFamily: family.headlineFont, fontSize: Math.max(44, width * 0.09), fontWeight: 'bold', fill: '#ffffff' }, 'Headline');
        addText(smartTemplateForm.subheadline, { left: hasPhoto ? width * 0.36 : width / 2, top: height * 0.43, fontFamily: family.headlineFont, fontSize: Math.max(30, width * 0.055), fontWeight: 'bold', fill: smartTemplateForm.primary }, 'Subheadline', hasPhoto ? width * 0.58 : width * 0.82);
        addText(smartTemplateForm.name, { left: hasPhoto ? width * 0.36 : width / 2, top: height * 0.59, fontSize: Math.max(24, width * 0.038), fontWeight: 'bold', fill: smartTemplateForm.accent }, 'Name or Company', hasPhoto ? width * 0.56 : width * 0.82);
        if (smartTemplateForm.detailLine.trim()) addText(smartTemplateForm.detailLine, { left: hasPhoto ? width * 0.36 : width / 2, top: height * 0.71, fontSize: Math.max(17, width * 0.024), fontWeight: 'bold', fill: smartTemplateForm.primary }, 'Industry Details', hasPhoto ? width * 0.55 : width * 0.72);
      } else if (layout === 'split') {
        addShape({ left: 0, top: 0, originX: 'left', originY: 'top', width: width * 0.38, height, fill: smartTemplateForm.primary }, 'Primary Panel');
        addShape({ left: width * 0.38, top: 0, originX: 'left', originY: 'top', width: width * 0.035, height, fill: smartTemplateForm.accent }, 'Accent Divider');
        if (photoAsset) placeAsset(photoAsset, width * 0.19, height * 0.7, width * 0.29, height * 0.3);
        addText(smartTemplateForm.headline, { left: width * 0.19, top: hasPhoto ? height * 0.25 : height * 0.38, fontFamily: family.headlineFont, fontSize: Math.max(38, width * 0.072), fontWeight: 'bold', fill: '#ffffff' }, 'Headline', width * 0.31);
        addText(smartTemplateForm.subheadline, { left: width * 0.7, top: height * 0.35, fontFamily: family.headlineFont, fontSize: Math.max(30, width * 0.05), fontWeight: 'bold', fill: smartTemplateForm.primary }, 'Subheadline', width * 0.5);
        addText(smartTemplateForm.name, { left: width * 0.7, top: height * 0.57, fontSize: Math.max(24, width * 0.034), fontWeight: 'bold', fill: smartTemplateForm.accent }, 'Name or Company', width * 0.48);
        if (smartTemplateForm.detailLine.trim()) addText(smartTemplateForm.detailLine, { left: width * 0.7, top: height * 0.68, fontSize: Math.max(17, width * 0.023), fontWeight: 'bold', fill: smartTemplateForm.primary }, 'Industry Details', width * 0.46);
      } else {
        addShape({ left: 20, top: 20, originX: 'left', originY: 'top', width: width - 40, height: height - 40, fill: 'transparent', stroke: smartTemplateForm.primary, strokeWidth: Math.max(8, width * 0.012) }, 'Outer Frame');
        addShape({ left: width * 0.1, top: height * 0.12, originX: 'left', originY: 'top', width: width * 0.8, height: height * 0.06, fill: smartTemplateForm.accent }, 'Accent Rule');
        if (photoAsset) { addShape({ left: width * 0.64, top: height * 0.25, originX: 'left', originY: 'top', width: width * 0.25, height: height * 0.42, fill: '#ffffff', stroke: smartTemplateForm.accent, strokeWidth: 4 }, 'Photo Frame'); placeAsset(photoAsset, width * 0.765, height * 0.46, width * 0.22, height * 0.37); }
        addText(smartTemplateForm.headline, { left: hasPhoto ? width * 0.36 : width / 2, top: height * 0.34, fontFamily: family.headlineFont, fontSize: Math.max(42, width * 0.078), fontWeight: 'bold', fill: smartTemplateForm.primary }, 'Headline', hasPhoto ? width * 0.48 : width * 0.82);
        addText(smartTemplateForm.subheadline, { left: hasPhoto ? width * 0.36 : width / 2, top: height * 0.51, fontFamily: family.bodyFont, fontSize: Math.max(26, width * 0.04), fontWeight: 'bold', fill: smartTemplateForm.accent }, 'Subheadline', hasPhoto ? width * 0.48 : width * 0.82);
        addText(smartTemplateForm.name, { left: hasPhoto ? width * 0.36 : width / 2, top: height * 0.64, fontFamily: family.headlineFont, fontSize: Math.max(22, width * 0.032), fontWeight: 'bold', fill: smartTemplateForm.primary }, 'Name or Company', hasPhoto ? width * 0.48 : width * 0.82);
        if (smartTemplateForm.detailLine.trim()) addText(smartTemplateForm.detailLine, { left: width / 2, top: height * 0.75, fontSize: Math.max(16, width * 0.022), fontWeight: 'bold', fill: smartTemplateForm.primary }, 'Industry Details', width * 0.7);
      }

      if (logoAsset) {
        const logoX = layout === 'split' ? width * 0.19 : width * 0.13;
        const logoY = layout === 'band' ? height * 0.125 : height * 0.16;
        placeAsset(logoAsset, logoX, logoY, width * 0.16, height * 0.14);
      }

      const contactY = layout === 'band' ? height * 0.9 : height * 0.81;
      const contactColor = layout === 'band' ? '#ffffff' : smartTemplateForm.primary;
      const contactText = [smartTemplateForm.phone.trim(), smartTemplateForm.website.trim()].filter(Boolean).join('  •  ');
      if (contactText) addText(contactText, { left: width / 2, top: contactY, fontSize: Math.max(18, width * 0.027), fontWeight: 'bold', fill: contactColor }, 'Contact Details', width * 0.78);
      if (smartTemplateForm.footerNote.trim() && layout !== 'band') addText(smartTemplateForm.footerNote, { left: width / 2, top: height * 0.91, fontSize: Math.max(13, width * 0.017), fontWeight: 'bold', fill: smartTemplateForm.accent }, 'Footer Note', width * 0.72);

      if (smartTemplateForm.includeQr && smartTemplateForm.qrValue.trim().length > 3) {
        const qrDataUrl = await QRCode.toDataURL(smartTemplateForm.qrValue.trim(), { width: 1000, margin: 2, color: { dark: smartTemplateForm.primary, light: '#ffffff' } });
        const qr = await FabricImage.fromURL(qrDataUrl);
        const qrSize = Math.min(width, height) * 0.18;
        const qrScale = qrSize / Math.max(1, qr.width || 1);
        qr.set({ left: width * 0.88, top: height * 0.68, originX: 'center', originY: 'center', scaleX: qrScale, scaleY: qrScale, ...FABRIC_CONTROL_STYLE });
        (qr as FabricImage & { data?: { layerId?: string; layerName?: string; qrValue?: string; qrColor?: string; smartTemplateId?: string } }).data = { layerId: `smart-${template.id}-qr-${stamp}`, layerName: 'QR Code', qrValue: smartTemplateForm.qrValue.trim(), qrColor: smartTemplateForm.primary, smartTemplateId: template.id };
        canvas.add(qr);
      }

      const firstEditable = canvas.getObjects().find((object) => !(object as FabricObject & { data?: { locked?: boolean; editorRole?: string } }).data?.locked && (object as FabricObject & { data?: { editorRole?: string } }).data?.editorRole !== 'base');
      if (firstEditable) canvas.setActiveObject(firstEditable);
      canvas.requestRenderAll();
      commitArtworkEditorChange(firstEditable || null);
      if (firstEditable) syncArtworkEditorControls(firstEditable);
      setArtworkEditorBrandColors((colors) => [smartTemplateForm.primary, smartTemplateForm.accent, smartTemplateForm.background, ...colors].filter((color, index, all) => all.indexOf(color) === index).slice(0, 12));
      setArtworkEditorStatus(`${template.name} generated as editable layers. Select any text, color, or object to fine-tune it.`);
      setShowSmartTemplateLibrary(false);
      setArtworkEditorMobileView('canvas');
    } catch (error) {
      setArtworkEditorStatus(`The smart template could not be generated: ${error instanceof Error ? error.message : 'unknown error'}.`);
    } finally {
      setIsGeneratingSmartTemplate(false);
    }
  };

  const applyArtworkEditorTemplate = (template: string) => {
    const canvas = artworkEditorCanvasRef.current;
    if (!canvas) return;
    canvas.getObjects().filter((object) => (object as FabricObject & { data?: { editorRole?: string } }).data?.editorRole !== 'base').forEach((object) => canvas.remove(object));
    const templateCopy = ARTWORK_EDITOR_TEMPLATES.find((entry) => entry.id === template) || ARTWORK_EDITOR_TEMPLATES[0];
    canvas.backgroundColor = '#ffffff';
    setArtworkEditorBackground('#ffffff');
    const border = new Rect({ left: canvas.getWidth() / 2, top: canvas.getHeight() / 2, originX: 'center', originY: 'center', width: canvas.getWidth() - 34, height: canvas.getHeight() - 34, fill: 'transparent', stroke: templateCopy.color, strokeWidth: 14, selectable: false, evented: false });
    (border as FabricObject & { data?: { layerId?: string; layerName?: string; locked?: boolean } }).data = { layerId: `template-border-${Date.now()}`, layerName: 'Template Border', locked: true };
    const headline = new IText(templateCopy.headline, { left: canvas.getWidth() / 2, top: canvas.getHeight() * 0.4, originX: 'center', originY: 'center', fontFamily: 'Arial Black, Impact, sans-serif', fontSize: Math.max(38, canvas.getWidth() * 0.09), fontWeight: 'bold', fill: templateCopy.color, textAlign: 'center', ...FABRIC_CONTROL_STYLE });
    const detail = new IText(templateCopy.detail, { left: canvas.getWidth() / 2, top: canvas.getHeight() * 0.65, originX: 'center', originY: 'center', fontFamily: 'Arial, sans-serif', fontSize: Math.max(20, canvas.getWidth() * 0.04), fontWeight: 'bold', fill: templateCopy.accent, textAlign: 'center', ...FABRIC_CONTROL_STYLE });
    (headline as FabricObject & { data?: { layerId?: string; layerName?: string } }).data = { layerId: `template-headline-${Date.now()}`, layerName: 'Headline' };
    (detail as FabricObject & { data?: { layerId?: string; layerName?: string } }).data = { layerId: `template-detail-${Date.now()}`, layerName: 'Details' };
    canvas.add(border, headline, detail);
    canvas.setActiveObject(headline);
    syncArtworkEditorControls(headline);
    commitArtworkEditorChange(headline);
    setArtworkEditorStatus(`${templateCopy.headline} starter template added. Replace the sample wording with your own.`);
  };

  const setArtworkEditorCanvasBackground = (color: string) => {
    const canvas = artworkEditorCanvasRef.current;
    setArtworkEditorBackground(color);
    if (!canvas) return;
    canvas.backgroundColor = color;
    commitArtworkEditorChange(null);
  };

  const adjustArtworkEditorBase = (mode: 'fit' | 'fill' | 'stretch' | 'center') => {
    const canvas = artworkEditorCanvasRef.current;
    const image = canvas?.getObjects().find((entry) => (entry as FabricObject & { data?: { editorRole?: string } }).data?.editorRole === 'base') as FabricImage | undefined;
    if (!canvas || !image) return;
    const imageWidth = Math.max(1, image.width || canvas.getWidth());
    const imageHeight = Math.max(1, image.height || canvas.getHeight());
    if (mode === 'fit' || mode === 'fill') {
      const scale = mode === 'fit'
        ? Math.min(canvas.getWidth() / imageWidth, canvas.getHeight() / imageHeight)
        : Math.max(canvas.getWidth() / imageWidth, canvas.getHeight() / imageHeight);
      image.set({ scaleX: scale, scaleY: scale });
    }
    if (mode === 'stretch') image.set({ scaleX: canvas.getWidth() / imageWidth, scaleY: canvas.getHeight() / imageHeight });
    image.set({ left: canvas.getWidth() / 2, top: canvas.getHeight() / 2, originX: 'center', originY: 'center' });
    image.setCoords();
    canvas.sendObjectToBack(image);
    canvas.requestRenderAll();
    captureArtworkEditorHistory(canvas);
    setArtworkEditorStatus(mode === 'fill' ? 'Artwork filled the canvas; artwork outside the edge is cropped.' : mode === 'center' ? 'Artwork centered on the canvas.' : `Artwork ${mode === 'fit' ? 'fit inside' : 'stretched to'} the canvas.`);
  };

  const switchArtworkEditorSide = (side: CoroArtworkSide) => {
    if (side === artworkEditorSideRef.current) return;
    const canvas = artworkEditorCanvasRef.current;
    if (canvas) captureArtworkEditorHistory(canvas);
    if (side === 'back') setArtworkEditorHasBackSide(true);
    artworkEditorSideRef.current = side;
    setArtworkEditorSide(side);
    setArtworkEditorActiveObject(null);
    setArtworkEditorStatus(side === 'back' ? 'Back side ready. Upload separate artwork or build the layout with text and shapes.' : 'Front side restored.');
  };

  const copyArtworkEditorFrontToBack = () => {
    const canvas = artworkEditorCanvasRef.current;
    if (canvas && artworkEditorSideRef.current === 'front') captureArtworkEditorHistory(canvas);
    const frontSnapshot = artworkEditorSideSnapshotsRef.current.front;
    if (!frontSnapshot) {
      setArtworkEditorStatus('The front side is still loading. Try copying it again in a moment.');
      return;
    }
    artworkEditorSideSnapshotsRef.current.back = frontSnapshot;
    setArtworkEditorHasBackSide(true);
    artworkEditorSideRef.current = 'back';
    setArtworkEditorSide('back');
    setArtworkEditorActiveObject(null);
    setArtworkEditorStatus('Front design copied to the back. You can now make the back side different if needed.');
  };

  const removeArtworkEditorBackSide = () => {
    artworkEditorSideSnapshotsRef.current.back = null;
    setArtworkEditorHasBackSide(false);
    artworkEditorSideRef.current = 'front';
    setArtworkEditorSide('front');
    setArtworkEditorActiveObject(null);
    setArtworkEditorStatus('Back side removed. This artwork will save as single-sided.');
  };

  const saveArtworkEditorVersion = () => {
    const canvas = artworkEditorCanvasRef.current;
    if (canvas) captureArtworkEditorHistory(canvas);
    const version = { id: `version-${Date.now()}`, label: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), front: artworkEditorSideSnapshotsRef.current.front, back: artworkEditorSideSnapshotsRef.current.back };
    setArtworkEditorVersions((previous) => [version, ...previous].slice(0, 10));
    setArtworkEditorStatus(`Version saved at ${version.label}.`);
  };

  const restoreArtworkEditorVersion = (versionId: string) => {
    const version = artworkEditorVersions.find((entry) => entry.id === versionId);
    if (!version) return;
    artworkEditorSideSnapshotsRef.current = { front: version.front, back: version.back };
    setArtworkEditorHasBackSide(Boolean(version.back));
    artworkEditorSideRef.current = 'front';
    setArtworkEditorSide('front');
    setArtworkEditorReloadKey((value) => value + 1);
    setArtworkEditorStatus(`Version from ${version.label} restored.`);
  };

  const saveArtworkEditorCopy = async () => {
    const canvas = artworkEditorCanvasRef.current;
    const source = artworkEditorSource;
    if (!canvas || !source) return;
    setIsArtworkEditorSaving(true);
    const isNewArtwork = source.id.startsWith('new-artwork-');
    setArtworkEditorStatus(`Rendering a high-resolution ${isNewArtwork ? 'design' : 'copy'} and saving it to Image Zone...`);
    try {
      captureArtworkEditorHistory(canvas);
      const makeSnapshotPortable = async (snapshot: string | null) => {
        if (!snapshot) return null;
        const projectData = JSON.parse(snapshot) as Record<string, unknown>;
        const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('A design asset could not be saved.'));
          reader.onerror = () => reject(new Error('A design asset could not be saved.'));
          reader.readAsDataURL(blob);
        });
        const makeImagesPortable = async (value: unknown): Promise<void> => {
          if (!value || typeof value !== 'object') return;
          if (Array.isArray(value)) {
            for (const entry of value) await makeImagesPortable(entry);
            return;
          }
          const object = value as Record<string, unknown>;
          if (typeof object.src === 'string' && !object.src.startsWith('data:')) {
            const response = await fetch(object.src);
            if (!response.ok) throw new Error('One of the design images could not be embedded into the editable project.');
            object.src = await blobToDataUrl(await response.blob());
          }
          for (const entry of Object.values(object)) await makeImagesPortable(entry);
        };
        await makeImagesPortable(projectData);
        return JSON.stringify(projectData);
      };
      const printSize = source.signWidth && source.signHeight ? { width: source.signWidth, height: source.signHeight } : getArtworkPrintSize(source.width, source.height);
      const safePixelSize = getPrintSafePixelSize(source.width, source.height, printSize);
      const multiplier = Math.max(0.1, Math.min(safePixelSize.width / canvas.getWidth(), safePixelSize.height / canvas.getHeight()));
      const renderSideSnapshot = async (snapshot: string) => {
        const exportElement = document.createElement('canvas');
        const exportCanvas = new Canvas(exportElement, { width: canvas.getWidth(), height: canvas.getHeight(), backgroundColor: '#ffffff' });
        await exportCanvas.loadFromJSON(snapshot);
        exportCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        exportCanvas.discardActiveObject();
        exportCanvas.requestRenderAll();
        const rendered = exportCanvas.toDataURL({ format: 'png', quality: 1, multiplier });
        exportCanvas.dispose();
        return rendered;
      };
      const frontSnapshot = artworkEditorSideSnapshotsRef.current.front;
      const backSnapshot = artworkEditorSideSnapshotsRef.current.back;
      const portableFrontSnapshot = await makeSnapshotPortable(frontSnapshot);
      const portableBackSnapshot = artworkEditorHasBackSide ? await makeSnapshotPortable(backSnapshot) : null;
      const dataUrl = frontSnapshot ? await renderSideSnapshot(frontSnapshot) : source.dataUrl;
      const backDataUrl = artworkEditorHasBackSide
        ? backSnapshot ? await renderSideSnapshot(backSnapshot) : source.backDataUrl || null
        : null;
      const originalBaseName = source.name.replace(/\.[^.]+$/, '') || 'artwork';
      const saveId = Date.now();
      const fileName = `${originalBaseName}-huedesign-${saveId}-front.png`;
      const normalizedFront = await normalizeGeneratedArtworkForStorage(dataUrl, fileName, printSize);
      const normalizedBack = backDataUrl ? await normalizeGeneratedArtworkForStorage(backDataUrl, `${originalBaseName}-huedesign-${saveId}-back.png`, printSize) : null;
      const isDoubleSided = Boolean(normalizedBack);
      const backFileName = normalizedBack?.fileName;
      const projectFileName = `${originalBaseName}-huedesign-${saveId}-project.json`;
      const file = normalizedFront.file;
      const backFile = normalizedBack?.file || null;
      const editorProject: ArtworkEditorProject = { version: 1, front: portableFrontSnapshot, back: portableBackSnapshot, width: normalizedFront.width, height: normalizedFront.height, signWidth: printSize.width, signHeight: printSize.height, dpi: Math.min(source.dpi || 300, GENERATED_ARTWORK_MAX_DPI), updatedAt: new Date().toISOString() };
      const projectFile = new File([JSON.stringify(editorProject)], projectFileName, { type: 'application/json' });
      const localId = `${Date.now()}-${normalizedFront.fileName}`;
      const item: ImageZoneItem = { id: localId, name: normalizedFront.fileName, dataUrl: normalizedFront.dataUrl, width: normalizedFront.width, height: normalizedFront.height, dpi: Math.min(source.dpi || 300, GENERATED_ARTWORK_MAX_DPI), uploadedAt: new Date().toLocaleString(), source: 'local', mimeType: normalizedFront.mimeType, signWidth: printSize.width, signHeight: printSize.height, backDataUrl: normalizedBack?.dataUrl, backName: backFileName, backWidth: normalizedBack?.width, backHeight: normalizedBack?.height, backCopiedFromFront: false, editorProject };
      let savedItem = item;
      if (isSupabaseStorageConfigured && customerSession?.access_token) {
        const [storageInfo, backStorageInfo, projectStorageInfo] = await Promise.all([uploadArtworkFileToSupabase(file, customerSession), backFile ? uploadArtworkFileToSupabase(backFile, customerSession) : Promise.resolve(null), uploadArtworkFileToSupabase(projectFile, customerSession)]);
        savedItem = { ...item, id: storageInfo.storagePath, dataUrl: storageInfo.storageUrl, storagePath: storageInfo.storagePath, storageUrl: storageInfo.storageUrl, source: 'supabase', backDataUrl: backStorageInfo?.storageUrl || item.backDataUrl, backName: backFileName || item.backName, backStoragePath: backStorageInfo?.storagePath, projectStoragePath: projectStorageInfo.storagePath };
        setImageZoneItems((previous) => [savedItem, ...previous]);
        setSelectedImageZoneId(storageInfo.storagePath);
        setImageLibraryStatus(`${isNewArtwork ? 'New artwork' : 'Edited copy'}${isDoubleSided ? ' with front and back sides' : ''} saved${customerSession?.user?.email ? ` to ${customerSession.user.email}'s Image Zone` : ' to the artwork library'}.${isNewArtwork ? '' : ' Original preserved.'}`);
      } else {
        setImageZoneItems((previous) => [savedItem, ...previous]);
        setSelectedImageZoneId(localId);
        setImageLibraryStatus(`${isNewArtwork ? 'New artwork' : 'Edited copy'}${isDoubleSided ? ' with front and back sides' : ''} saved in this browser session.${isNewArtwork ? '' : ' Original preserved.'}`);
      }
      if (artworkEditorOrderReturn) {
        const returnContext = artworkEditorOrderReturn;
        if (returnContext.side === 'back' && isAutoSidedRigidBuilder) {
          setRigidBackArtwork(savedItem);
          setRigidPreviewSide('back');
          setSignValues((previous) => ({ ...previous, width: String(returnContext.width), height: String(returnContext.height), sides: 'double' }));
        } else {
          await placeImageOnDesign(savedItem.dataUrl, savedItem.name);
          setSignArtworkPreviewUrl(savedItem.dataUrl);
          setBannerArtworkName(savedItem.name);
          setSignValues((previous) => ({ ...previous, width: String(returnContext.width), height: String(returnContext.height) }));
          setBannerArtworkFitState(returnContext.fitState);
        }
        setImageLibraryStatus(`${savedItem.name} saved to Image Zone and returned to this ${selectedSignProduct.name} order.`);
        setActiveCoroOptionPanel('images');
        setArtworkEditorOrderReturn(null);
      }
      if (!artworkEditorOrderReturn) setShowImageZone(true);
      setShowArtworkEditor(false);
    } catch (error) {
      setArtworkEditorStatus(`The edited copy could not be saved: ${error instanceof Error ? error.message : 'unknown error'}.`);
    } finally {
      setIsArtworkEditorSaving(false);
    }
  };

  useEffect(() => {
    if (!showArtworkEditor || !artworkEditorSource || !artworkEditorCanvasElRef.current) return;
    const source = artworkEditorSource;
    const sourceWidth = Math.max(1, source.width);
    const sourceHeight = Math.max(1, source.height);
    const isCompactEditor = window.matchMedia('(max-width: 767px)').matches;
    const workspaceMaxWidth = isCompactEditor ? Math.max(240, window.innerWidth - 64) : 940;
    const workspaceMaxHeight = isCompactEditor ? Math.max(280, window.innerHeight - 250) : 620;
    const workspaceScale = Math.min(workspaceMaxWidth / sourceWidth, workspaceMaxHeight / sourceHeight);
    const workspaceWidth = Math.max(1, Math.round(sourceWidth * workspaceScale));
    const workspaceHeight = Math.max(1, Math.round(sourceHeight * workspaceScale));
    const canvas = new Canvas(artworkEditorCanvasElRef.current, {
      width: workspaceWidth,
      height: workspaceHeight,
      backgroundColor: artworkEditorBackground,
      preserveObjectStacking: true,
      selectionColor: 'rgba(14,165,233,0.10)',
      selectionBorderColor: '#38bdf8'
    });
    artworkEditorCanvasRef.current = canvas;
    setArtworkEditorZoom(1);
    artworkEditorHistoryRef.current = [];
    artworkEditorHistoryIndexRef.current = -1;
    artworkEditorRestoringRef.current = true;
    let disposed = false;
    let isPanning = false;
    let lastPointer = { x: 0, y: 0 };

    const updateSelection = () => {
      const object = canvas.getActiveObject() || null;
      syncArtworkEditorControls(object);
      refreshArtworkEditorLayers(canvas);
    };
    const captureChange = () => {
      if (artworkEditorRestoringRef.current) return;
      captureArtworkEditorHistory(canvas);
      refreshArtworkEditorLayers(canvas);
    };
    canvas.on('selection:created', updateSelection);
    canvas.on('selection:updated', updateSelection);
    canvas.on('selection:cleared', () => { setArtworkEditorActiveObject(null); refreshArtworkEditorLayers(canvas); });
    canvas.on('object:added', captureChange);
    canvas.on('object:modified', captureChange);
    canvas.on('object:removed', captureChange);
    canvas.on('object:moving', (event) => {
      const object = event.target;
      if (!artworkEditorSnapToCenterRef.current || !object) return;
      const objectCenter = object.getCenterPoint();
      const canvasCenterX = canvas.getWidth() / 2;
      const canvasCenterY = canvas.getHeight() / 2;
      if (Math.abs(objectCenter.x - canvasCenterX) <= 8) object.set({ left: (object.left || 0) + canvasCenterX - objectCenter.x });
      if (Math.abs(objectCenter.y - canvasCenterY) <= 8) object.set({ top: (object.top || 0) + canvasCenterY - objectCenter.y });
    });
    const onPanPointerMove = (pointerEvent: PointerEvent) => {
      if (!isPanning || !canvas.viewportTransform) return;
      canvas.viewportTransform[4] += pointerEvent.clientX - lastPointer.x;
      canvas.viewportTransform[5] += pointerEvent.clientY - lastPointer.y;
      lastPointer = { x: pointerEvent.clientX, y: pointerEvent.clientY };
      canvas.requestRenderAll();
    };
    const onPanPointerUp = () => {
      isPanning = false;
      canvas.selection = true;
      canvas.setCursor('default');
      window.removeEventListener('pointermove', onPanPointerMove);
      window.removeEventListener('pointerup', onPanPointerUp);
    };
    const onPanPointerDown = (pointerEvent: PointerEvent) => {
      if (!pointerEvent.altKey) return;
      pointerEvent.preventDefault();
      isPanning = true;
      lastPointer = { x: pointerEvent.clientX, y: pointerEvent.clientY };
      canvas.discardActiveObject();
      canvas.selection = false;
      canvas.setCursor('grabbing');
      window.addEventListener('pointermove', onPanPointerMove);
      window.addEventListener('pointerup', onPanPointerUp);
    };
    canvas.upperCanvasEl.addEventListener('pointerdown', onPanPointerDown);

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT') return;
      const command = navigator.platform.toUpperCase().includes('MAC') ? event.metaKey : event.ctrlKey;
      if (command && event.key.toLowerCase() === 'c') {
        const active = canvas.getActiveObject();
        if (active) void active.clone().then((clone) => { artworkEditorClipboardRef.current = clone; });
      }
      if (command && event.key.toLowerCase() === 'v' && artworkEditorClipboardRef.current) {
        event.preventDefault();
        void artworkEditorClipboardRef.current.clone().then((clone) => {
          const pasted = clone as FabricObject & { data?: { layerId?: string; layerName?: string } };
          pasted.set({ left: (pasted.left || 0) + 18, top: (pasted.top || 0) + 18, selectable: true, evented: true });
          pasted.data = { ...(pasted.data || {}), layerId: `artwork-editor-paste-${Date.now()}`, layerName: `${pasted.data?.layerName || 'Object'} copy` };
          canvas.add(pasted);
          canvas.setActiveObject(pasted);
          syncArtworkEditorControls(pasted);
          commitArtworkEditorChange(pasted);
        });
      }
      if (command && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        const editable = canvas.getObjects().filter((object) => { const data = (object as FabricObject & { data?: { editorRole?: string; locked?: boolean } }).data; return data?.editorRole !== 'base' && !data?.locked; });
        if (editable.length) canvas.setActiveObject(new ActiveSelection(editable, { canvas }));
        canvas.requestRenderAll();
        updateSelection();
      }
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        void restoreArtworkEditorHistory(event.shiftKey ? 1 : -1);
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteArtworkEditorSelected();
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        const active = canvas.getActiveObject();
        if (!active) return;
        event.preventDefault();
        const distance = event.shiftKey ? 10 : 1;
        if (event.key === 'ArrowLeft') active.set({ left: (active.left || 0) - distance });
        if (event.key === 'ArrowRight') active.set({ left: (active.left || 0) + distance });
        if (event.key === 'ArrowUp') active.set({ top: (active.top || 0) - distance });
        if (event.key === 'ArrowDown') active.set({ top: (active.top || 0) + distance });
        active.setCoords();
        commitArtworkEditorChange(active);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    const finishSideLoad = () => {
      if (disposed) return;
      canvas.getObjects().forEach((object) => {
        object.set(FABRIC_CONTROL_STYLE);
        const objectData = (object as FabricObject & { data?: { editorRole?: string; locked?: boolean } }).data;
        if (objectData?.editorRole === 'base') object.set({ selectable: false, evented: false, hasControls: false });
        else if (objectData?.locked) object.set({ selectable: false, evented: false, hasControls: false, lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
      });
      if (typeof canvas.backgroundColor === 'string') setArtworkEditorBackground(canvas.backgroundColor);
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      artworkEditorRestoringRef.current = false;
      captureArtworkEditorHistory(canvas);
      refreshArtworkEditorLayers(canvas);
    };
    const savedSideSnapshot = artworkEditorSideSnapshotsRef.current[artworkEditorSide];
    const sideImageUrl = artworkEditorSide === 'front'
      ? (source.id.startsWith('new-artwork-') ? null : source.dataUrl)
      : source.backDataUrl || null;
    if (savedSideSnapshot) void (async () => {
      try {
        await canvas.loadFromJSON(savedSideSnapshot);
        finishSideLoad();
      } catch (error) {
        artworkEditorRestoringRef.current = false;
        setArtworkEditorStatus(`The ${artworkEditorSide} side could not be restored: ${error instanceof Error ? error.message : 'unknown error'}.`);
      }
    })();
    else if (!sideImageUrl) finishSideLoad();
    else void (async () => {
      try {
        const image = await FabricImage.fromURL(sideImageUrl, { crossOrigin: 'anonymous' });
        if (disposed) return;
        image.set({
          left: 0,
          top: 0,
          originX: 'left',
          originY: 'top',
          scaleX: workspaceWidth / Math.max(1, image.width || sourceWidth),
          scaleY: workspaceHeight / Math.max(1, image.height || sourceHeight),
          selectable: false,
          evented: false,
          hasControls: false
        });
        (image as FabricObject & { data?: { editorRole?: string; layerId?: string; layerName?: string } }).data = { editorRole: 'base', layerId: `artwork-editor-base-${artworkEditorSide}`, layerName: `Original ${artworkEditorSide} artwork` };
        canvas.add(image);
        canvas.sendObjectToBack(image);
        finishSideLoad();
      } catch (error) {
        artworkEditorRestoringRef.current = false;
        setArtworkEditorStatus(`The editor could not load the ${artworkEditorSide} artwork: ${error instanceof Error ? error.message : 'image failed to load'}.`);
      }
    })();

    return () => {
      disposed = true;
      window.removeEventListener('keydown', onKeyDown);
      canvas.upperCanvasEl.removeEventListener('pointerdown', onPanPointerDown);
      window.removeEventListener('pointermove', onPanPointerMove);
      window.removeEventListener('pointerup', onPanPointerUp);
      canvas.dispose();
      artworkEditorCanvasRef.current = null;
      artworkEditorHistoryRef.current = [];
      artworkEditorHistoryIndexRef.current = -1;
    };
  }, [showArtworkEditor, artworkEditorSource, artworkEditorSide, artworkEditorReloadKey]);

  useEffect(() => {
    if (showArtworkEditor) return;
    artworkEditorObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    artworkEditorObjectUrlsRef.current = [];
  }, [showArtworkEditor]);

  const loadCanvaDesigns = async () => {
    setIsCanvaDesignsLoading(true);
    setCanvaDesignStatus('Loading Canva designs...');
    try {
      const response = await fetch('/api/canva/designs', { cache: 'no-store' });
      const payload = await response.json() as { designs?: CanvaDesign[]; error?: string; details?: string };
      if (!response.ok) throw new Error(payload.error || payload.details || 'Could not load Canva designs.');
      const designs = payload.designs || [];
      setCanvaDesigns(designs);
      setCanvaDesignStatus(designs.length ? `${designs.length} Canva design${designs.length === 1 ? '' : 's'} ready to import.` : 'Canva is connected, but no designs were returned.');
    } catch (error) {
      setCanvaDesigns([]);
      setCanvaDesignStatus(error instanceof Error ? error.message : 'Could not load Canva designs.');
    } finally {
      setIsCanvaDesignsLoading(false);
    }
  };

  const importCanvaDesign = async (design: CanvaDesign) => {
    if (isSupabaseStorageConfigured && !customerSession?.access_token) {
      const message = 'Sign in to your Hue Studio account before importing so this Canva design is saved to the correct Image Zone library.';
      setCanvaDesignStatus(message);
      setImageLibraryStatus(message);
      return;
    }
    setImportingCanvaDesignId(design.id);
    setCanvaDesignStatus(`Exporting ${design.title} from Canva...`);
    try {
      let response = await fetch('/api/canva/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designId: design.id, title: design.title })
      });
      let payload = await response.json() as Partial<CanvaImportPayload> & { error?: string; details?: string; jobId?: string; status?: string };
      let pollDelay = 1000;
      let pollCount = 0;
      while (response.status === 202 && payload.jobId && pollCount < 24) {
        pollCount += 1;
        setCanvaDesignStatus(`Canva is preparing ${design.title}... ${pollCount < 4 ? 'This usually takes a few seconds.' : 'Large designs can take a little longer.'}`);
        await new Promise((resolve) => window.setTimeout(resolve, pollDelay));
        response = await fetch(`/api/canva/import?jobId=${encodeURIComponent(payload.jobId)}&title=${encodeURIComponent(design.title)}`, { cache: 'no-store' });
        payload = await response.json() as Partial<CanvaImportPayload> & { error?: string; details?: string; jobId?: string; status?: string };
        pollDelay = Math.min(Math.round(pollDelay * 1.45), 5000);
      }
      if (response.status === 202) throw new Error('Canva is taking longer than expected to prepare this design. Please try again in a few minutes.');
      if (!response.ok || !payload.dataUrl || !payload.name) throw new Error(payload.error || payload.details || 'Canva did not return an exported image.');
      const imagePixels = await getImageNaturalSize(payload.dataUrl);
      const fileName = payload.name;
      const localId = `canva-${Date.now()}-${fileName}`;
      const item: ImageZoneItem = {
        id: localId,
        name: fileName,
        dataUrl: payload.dataUrl,
        width: imagePixels.width,
        height: imagePixels.height,
        dpi: 300,
        uploadedAt: new Date().toLocaleString(),
        source: 'local',
        mimeType: payload.mimeType || 'image/png'
      };
      let savedItem = item;
      if (isSupabaseStorageConfigured) {
        const file = await dataUrlToFile(payload.dataUrl, fileName, payload.mimeType || 'image/png');
        let activeSession = customerSession;
        if (activeSession?.expires_at && (activeSession.expires_at * 1000) <= Date.now() + 60_000) {
          activeSession = await refreshCurrentCustomerSession();
          if (!activeSession) throw new Error('Your Hue Studio session expired. Sign in again, then retry this Canva import.');
        }
        let storageInfo: Awaited<ReturnType<typeof uploadArtworkFileToSupabase>>;
        try {
          storageInfo = await uploadArtworkFileToSupabase(file, activeSession);
        } catch (storageError) {
          const storageMessage = storageError instanceof Error ? storageError.message : '';
          if (!isSupabaseSessionExpiredError(storageMessage)) throw storageError;
          activeSession = await refreshCurrentCustomerSession();
          if (!activeSession) throw new Error('Your Hue Studio session expired. Sign in again, then retry this Canva import.');
          storageInfo = await uploadArtworkFileToSupabase(file, activeSession);
        }
        savedItem = {
          ...item,
          id: storageInfo.storagePath,
          storagePath: storageInfo.storagePath,
          storageUrl: storageInfo.storageUrl,
          source: 'supabase'
        };
      }
      setImageZoneItems((previous) => [savedItem, ...previous.filter((entry) => entry.id !== localId && entry.id !== savedItem.id)]);
      setSelectedImageZoneId(savedItem.id);
      setImageLibraryStatus(`${fileName} imported from Canva${savedItem.source === 'supabase' ? ' and saved to your Hue artwork library' : ''}.`);
      setCanvaDesignStatus(`${fileName} imported into Image Zone.`);
      setShowCanvaImport(false);
      setShowImageZone(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not import the Canva design.';
      setCanvaDesignStatus(message);
      setImageLibraryStatus(message);
    } finally {
      setImportingCanvaDesignId(null);
    }
  };

  const openCanvaImport = async () => {
    setShowCanvaImport(true);
    setIsCanvaImportLoading(true);
    setCanvaImportStatus(null);
    setCanvaDesignStatus('');
    setImageLibraryStatus('Checking Canva import connection...');
    try {
      const response = await fetch('/api/canva/status', { cache: 'no-store' });
      const payload = await response.json() as CanvaImportStatus;
      setCanvaImportStatus(payload);
      setImageLibraryStatus(payload.connected
        ? 'Canva is connected. Choose a Canva design to import.'
        : payload.configured
        ? 'Canva import is ready to connect.'
        : `Canva import is waiting on setup${payload.missing?.length ? `: ${payload.missing.join(', ')}` : '.'}`);
      if (payload.connected) void loadCanvaDesigns();
    } catch (error) {
      setCanvaImportStatus({ configured: false, message: error instanceof Error ? error.message : 'Could not check Canva import status.' });
      setImageLibraryStatus('Could not check Canva import status.');
    } finally {
      setIsCanvaImportLoading(false);
    }
  };

  const openCurrentOrderArtworkEditor = async () => {
    const editingBack = isAutoSidedRigidBuilder && rigidPreviewSide === 'back' && Boolean(rigidBackArtwork?.dataUrl);
    const artworkUrl = editingBack ? rigidBackArtwork?.dataUrl : signArtworkPreviewUrl;
    if (!artworkUrl) {
      setImageLibraryStatus('Add artwork to this order before opening the editor.');
      return;
    }
    try {
      setArtworkEditorLaunchContext('order');
      const librarySource = imageZoneItems.find((item) => item.dataUrl === artworkUrl || item.storageUrl === artworkUrl || (editingBack && item.backDataUrl === artworkUrl));
      const naturalSize = librarySource?.width && librarySource?.height
        ? { width: editingBack ? librarySource.backWidth || librarySource.width : librarySource.width, height: editingBack ? librarySource.backHeight || librarySource.height : librarySource.height }
        : await getImageNaturalSize(artworkUrl);
      const source: ImageZoneItem = librarySource
        ? { ...librarySource, id: `${librarySource.id}-${editingBack ? 'back' : 'front'}-order-edit`, name: editingBack ? librarySource.backName || `${librarySource.name} back` : librarySource.name, dataUrl: artworkUrl, width: naturalSize.width, height: naturalSize.height, backDataUrl: undefined, editorProject: editingBack ? undefined : librarySource.editorProject }
        : { id: `order-edit-${Date.now()}`, name: editingBack ? `${bannerArtworkName || 'artwork'}-back.png` : bannerArtworkName || 'order-artwork.png', dataUrl: artworkUrl, width: naturalSize.width, height: naturalSize.height, dpi: BANNER_PREVIEW_DPI, uploadedAt: new Date().toLocaleString(), source: 'local', mimeType: 'image/png', signWidth: signArtworkSize?.width || signWidth, signHeight: signArtworkSize?.height || signHeight };
      setArtworkEditorOrderReturn({ side: editingBack ? 'back' : 'front', width: signWidth, height: signHeight, fitState: bannerArtworkFitState });
      startArtworkEditor(source, `Quick editing ${editingBack ? 'back' : 'front'} artwork for this ${selectedSignProduct.name}. Save and return when you are ready.`);
    } catch (error) {
      setImageLibraryStatus(`Could not open this order artwork: ${error instanceof Error ? error.message : 'image failed to load'}.`);
    }
  };

  const connectCanvaAccount = () => {
    const authUrl = canvaImportStatus?.authUrl;
    if (!authUrl) {
      setCanvaDesignStatus(canvaImportStatus?.message || 'The Canva callback address needs to be configured before connecting.');
      return;
    }
    const popup = window.open(authUrl, 'hue-canva-connect', 'popup=yes,width=720,height=760,resizable=yes,scrollbars=yes');
    if (!popup) {
      setCanvaDesignStatus('Your browser blocked the Canva connection window. Allow pop-ups for Hue Studio and try again.');
      return;
    }
    setCanvaDesignStatus('Finish connecting Canva in the new window. Hue Studio will stay open here.');
    popup.focus();
    const popupCheck = window.setInterval(() => {
      if (!popup.closed) return;
      window.clearInterval(popupCheck);
      setCanvaDesignStatus('Checking the Canva connection...');
      void openCanvaImport();
    }, 750);
  };

  useEffect(() => {
    const handleCanvaConnection = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'hue-canva-connected') return;
      setCanvaDesignStatus('Canva connected. Loading your designs...');
      void openCanvaImport();
    };
    window.addEventListener('message', handleCanvaConnection);
    return () => window.removeEventListener('message', handleCanvaConnection);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('canva') !== 'connected') return;
    void openCanvaImport();
    params.delete('canva');
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }, []);

  const openAiEditorForSource = (source: ImageZoneItem | null) => {
    if (!source || !canPlaceImageZoneItem(source)) {
      setImageLibraryStatus('Select a PNG, JPG, or other previewable image before opening AI Edit.');
      return;
    }
    setAiEditSource(source);
    setAiEditPrompt('');
    setAiEditAction('restore');
    setAiEditQuality('low');
    setAiEditStatus('Describe the change you want. Your original artwork will remain untouched.');
    setAiEditPreview(null);
    setShowAiImageEditor(true);
  };

  const openAiEditor = () => {
    openAiEditorForSource(imageZoneItems.find((item) => item.id === selectedImageZoneId) || null);
  };

  const openArtworkEditorAiTools = async () => {
    const canvas = artworkEditorCanvasRef.current;
    const source = artworkEditorSource;
    if (!canvas || !source) {
      setArtworkEditorStatus('The current artboard is not ready for AI tools yet.');
      return;
    }
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1 });
    const dimensions = await getImageNaturalSize(dataUrl);
    openAiEditorForSource({
      ...source,
      id: `hue-designer-ai-${Date.now()}`,
      name: `${source.name.replace(/\.[^.]+$/, '') || 'artwork'}-current-design.png`,
      dataUrl,
      width: dimensions.width,
      height: dimensions.height,
      mimeType: 'image/png',
      source: 'local'
    });
  };

  const generateAiImageEdit = async () => {
    const source = aiEditSource;
    const prompt = aiEditPrompt.trim();
    if (!source || !canPlaceImageZoneItem(source)) {
      setAiEditStatus('The selected artwork cannot be edited. Choose an image file and try again.');
      return;
    }
    if (aiEditAction === 'quality-check') {
      const printWidth = source.signWidth || getArtworkPrintSize(source.width, source.height).width;
      const printHeight = source.signHeight || getArtworkPrintSize(source.width, source.height).height;
      const effectiveDpi = Math.min(source.width / Math.max(1, printWidth), source.height / Math.max(1, printHeight));
      const ratioDifference = Math.abs((source.width / Math.max(1, source.height)) - (printWidth / Math.max(1, printHeight)));
      const notes = [
        `${source.name} is ${source.width} x ${source.height}px.`,
        `Estimated print size is ${formatArtworkInches(source.width, source.height, printWidth, printHeight)}.`,
        `Effective resolution is about ${Math.round(effectiveDpi)} DPI.`
      ];
      if (effectiveDpi >= 150) notes.push('Resolution looks usable for production.');
      else notes.push('Resolution may be low for print. A higher quality file is recommended.');
      if (ratioDifference > 0.03) notes.push('Artwork ratio does not match the selected print size, so Fit or Stretch may be needed.');
      else notes.push('Artwork ratio matches the selected print size.');
      setAiEditPreview(null);
      setAiEditStatus(notes.join(' '));
      return;
    }
    if (!['restore', 'remove-background'].includes(aiEditAction) && prompt.length < 2) {
      setAiEditStatus('Add a short description of the change you want.');
      return;
    }
    setIsAiEditing(true);
    setAiEditPreview(null);
    setAiEditStatus('Hue AI is preparing a new proof. This may take a moment...');
    try {
      const sourceResponse = await fetch(source.dataUrl);
      if (!sourceResponse.ok) throw new Error('The original artwork could not be downloaded. Please reopen the library and try again.');
      const sourceBlob = await sourceResponse.blob();
      const formData = new FormData();
      formData.append('image', new File([sourceBlob], source.name, { type: sourceBlob.type || source.mimeType || 'image/png' }));
      formData.append('prompt', prompt);
      formData.append('action', aiEditAction);
      formData.append('targetColor', aiEditTargetColor);
      formData.append('quality', aiEditQuality);
      const response = await fetch('/api/image-zone/ai-edit', { method: 'POST', headers: customerSession?.access_token ? { Authorization: `Bearer ${customerSession.access_token}` } : undefined, body: formData });
      const result = await response.json() as { imageDataUrl?: string; error?: string };
      if (!response.ok || !result.imageDataUrl) throw new Error(result.error || 'The AI edit could not be generated.');
      const dimensions = await getImageNaturalSize(result.imageDataUrl);
      setAiEditPreview({ dataUrl: result.imageDataUrl, width: dimensions.width, height: dimensions.height, source });
      setAiEditStatus('Proof ready. Review it carefully, then save it as a new image if you want to keep it.');
    } catch (error) {
      setAiEditStatus(error instanceof Error ? error.message : 'The AI edit could not be generated.');
    } finally {
      setIsAiEditing(false);
    }
  };

  const saveAiImageEdit = async () => {
    if (!aiEditPreview) return;
    setIsAiEditing(true);
    setAiEditStatus('Saving the edited proof as a new library image...');
    try {
      const originalBaseName = aiEditPreview.source.name.replace(/\.[^.]+$/, '') || 'artwork';
      const fileName = `${originalBaseName}-ai-edit-${Date.now()}.png`;
      const inheritedPrintSize = aiEditPreview.source.signWidth && aiEditPreview.source.signHeight
        ? { width: aiEditPreview.source.signWidth, height: aiEditPreview.source.signHeight }
        : getArtworkPrintSize(aiEditPreview.source.width, aiEditPreview.source.height);
      const normalized = await normalizeGeneratedArtworkForStorage(aiEditPreview.dataUrl, fileName, inheritedPrintSize);
      const localId = `${Date.now()}-${normalized.fileName}`;
      const item: ImageZoneItem = {
        id: localId,
        name: normalized.fileName,
        dataUrl: normalized.dataUrl,
        width: normalized.width,
        height: normalized.height,
        dpi: Math.min(aiEditPreview.source.dpi || 300, GENERATED_ARTWORK_MAX_DPI),
        uploadedAt: new Date().toLocaleString(),
        source: 'local',
        mimeType: normalized.mimeType,
        signWidth: inheritedPrintSize.width,
        signHeight: inheritedPrintSize.height
      };
      setImageZoneItems((prev) => [item, ...prev]);
      setSelectedImageZoneId(localId);

      if (isSupabaseStorageConfigured && customerSession?.access_token) {
        const storageInfo = await uploadArtworkFileToSupabase(normalized.file, customerSession);
        setImageZoneItems((prev) => prev.map((entry) => entry.id === localId ? {
          ...entry,
          id: storageInfo.storagePath,
          storagePath: storageInfo.storagePath,
          storageUrl: storageInfo.storageUrl,
          source: 'supabase'
        } : entry));
        setSelectedImageZoneId(storageInfo.storagePath);
        setImageLibraryStatus(`AI edit saved as a new image${customerSession?.user?.email ? ` in ${customerSession.user.email}'s library` : ''}.`);
      } else {
        setImageLibraryStatus('AI edit saved in this browser session. Sign in to keep it in a private cloud library.');
      }
      if (showArtworkEditor && artworkEditorCanvasRef.current) {
        await addArtworkEditorImageLayer(normalized.dataUrl, normalized.fileName, 'ai-edit');
        setArtworkEditorStatus(`${normalized.fileName} was saved to Image Zone and added to the design as an editable layer.`);
      }
      setShowAiImageEditor(false);
      setAiEditPreview(null);
      setAiEditPrompt('');
    } catch (error) {
      setAiEditStatus(`The proof was generated but could not be saved: ${error instanceof Error ? error.message : 'unknown error'}.`);
    } finally {
      setIsAiEditing(false);
    }
  };

  const useImageZoneItem = async (item: ImageZoneItem) => {
    setSelectedImageZoneId(item.id);
    let imageItem: ImageZoneItem;
    try {
      let requestedItem = item;
      if (item.source === 'archive') {
        if (!customerSession?.access_token || !item.archiveId) throw new Error('Sign in again to restore this archived artwork.');
        setImageLibraryStatus(`Restoring ${item.name} from the Hue archive...`);
        const response = await fetch('/api/artwork/archive', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${customerSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ archiveId: item.archiveId }),
        });
        const payload = await response.json() as { item?: { originalName?: string; mimeType?: string; storagePath?: string; storageUrl?: string }; error?: string };
        if (!response.ok || !payload.item?.storageUrl || !payload.item.storagePath) throw new Error(payload.error || 'Could not restore archived artwork.');
        requestedItem = {
          ...item,
          id: `restored-${item.archiveId}`,
          name: payload.item.originalName || item.name,
          dataUrl: payload.item.storageUrl,
          storageUrl: payload.item.storageUrl,
          storagePath: payload.item.storagePath,
          // Restores are short-lived working copies. Treat them like local artwork so
          // Image Zone uses the signed restore URL instead of customer-library RLS.
          source: 'local',
          archived: false,
          mimeType: payload.item.mimeType || item.mimeType,
          uploadedAt: new Date().toISOString(),
        };
        setImageZoneItems((prev) => prev.map((entry) => entry.id === item.id ? requestedItem : entry));
        setSelectedImageZoneId(requestedItem.id);
      }
      if (!canPlaceImageZoneItem(requestedItem)) {
        setImageLibraryStatus(`${requestedItem.name} is selected for production. PDF placement preview is coming next.`);
        return;
      }
      imageItem = await hydrateImageZoneItemSize(requestedItem);
    } catch (error) {
      setImageLibraryStatus(error instanceof Error ? error.message : `Could not load ${item.name}. Please sign in again and retry.`);
      return;
    }
    if (showArtworkEditor && artworkEditorCanvasRef.current) {
      try {
        await addArtworkEditorImageLayer(imageItem.dataUrl, imageItem.name, 'image-zone');
        setImageLibraryStatus(`${imageItem.name} added to Hue Designer.`);
        setShowImageZone(false);
      } catch (error) {
        setImageLibraryStatus(`Could not add ${imageItem.name} to the editor: ${error instanceof Error ? error.message : 'image failed to load'}.`);
      }
      return;
    }
    if (storeView !== 'builder') {
      setImageZoneProductChoice(imageItem);
      setImageLibraryStatus(`Choose a product for ${imageItem.name}.`);
      return;
    }
    if (isAutoSidedRigidBuilder && rigidArtworkTarget === 'back') {
      setRigidBackArtwork(imageItem);
      setRigidArtworkTarget('front');
      setRigidPreviewSide('back');
      setSignValues((prev) => ({ ...prev, sides: 'double' }));
      setSignEstimate(null);
      setImageLibraryStatus(`${imageItem.name} placed on the back. Double-sided pricing is now active.`);
      setShowImageZone(false);
      setActiveCoroOptionPanel(useCompactBuilderLayout() ? null : 'images');
      return;
    }
    if (isCoroBuilder) {
      placeCoroArtworkOnSheet(imageItem);
      setShowImageZone(false);
      return;
    }
    if (isBannerBuilder) {
      if (isAutoSidedRigidBuilder) {
        setRigidArtworkTarget('front');
        setRigidPreviewSide('front');
        const pairedBack = imageItem.backDataUrl ? { ...imageItem, id: `${imageItem.id}-back`, name: imageItem.backName || `${imageItem.name} back`, dataUrl: imageItem.backDataUrl, width: imageItem.backWidth || imageItem.width, height: imageItem.backHeight || imageItem.height, backDataUrl: undefined } : null;
        if (pairedBack) setRigidBackArtwork(pairedBack);
        setSignValues((prev) => ({
          ...prev,
          sides: pairedBack || rigidBackArtwork
            ? 'double'
            : selectedSignProduct.id === 'business-card'
              ? String(prev.sides || 'single')
              : 'single'
        }));
      }
      setSignArtworkPreviewUrl(imageItem.dataUrl);
      setBannerArtworkName(imageItem.name);
      const savedPrintSize = imageItem.signWidth && imageItem.signHeight ? { width: imageItem.signWidth, height: imageItem.signHeight } : null;
      const printSize = savedPrintSize || applySignSizeFromPixels(imageItem.width, imageItem.height) || getArtworkPrintSize(imageItem.width, imageItem.height);
      if (savedPrintSize) {
        setSignValues((prev) => ({ ...prev, width: String(savedPrintSize.width), height: String(savedPrintSize.height) }));
        setSignArtworkSize(savedPrintSize);
      }
      setPendingBannerPlacement({ dataUrl: imageItem.dataUrl, name: imageItem.name, width: imageItem.width, height: imageItem.height, printWidth: printSize.width, printHeight: printSize.height });
      setImageLibraryStatus(`${imageItem.name} selected for the ${isAutoSidedRigidBuilder ? 'front' : 'banner'}.`);
      setShowImageZone(false);
      setActiveCoroOptionPanel(useCompactBuilderLayout() ? null : 'images');
      return;
    }
    if (!fabricCanvasRef.current) {
      const targetProductId = selectedSignProduct.id;
      setProductMode('signage');
      setSignProductId(targetProductId);
      setStoreCategory(targetProductId === 'banner' ? 'banners' : 'coro');
      setStoreView('builder');
      setShowImageZone(false);
      setActiveCoroOptionPanel(useCompactBuilderLayout() ? null : 'images');
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
    try {
      validateClientArtworkFile(file, { allowPdf: true });
    } catch (error) {
      setImageLibraryStatus(error instanceof Error ? error.message : 'Choose a supported artwork file.');
      event.target.value = '';
      return;
    }
    const canvas = fabricCanvasRef.current;
    const isImageFile = isPreviewableImageFile(file);
    const isPdfFile = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    let canPlaceOnCanvas = Boolean(isImageFile && canvas);
    if (isImageFile && !canPlaceOnCanvas) setImageLibraryStatus(`Adding file to the library. Open the ${selectedSignProduct.name} builder to place it on the design.`);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      let placementDataUrl = dataUrl;
      let imagePixels = { width: 0, height: 0 };
      let embeddedResolution: ImageResolution | null = null;
      let pdfPrintSize: { width: number; height: number } | null = null;
      let pdfPreviewDpi: number | null = null;
      if (isImageFile) {
        try {
          imagePixels = await getImageNaturalSize(dataUrl);
          embeddedResolution = await readEmbeddedImageResolution(file).catch(() => null);
          const analysis = await analyzeArtworkImage(file, dataUrl);
          setArtworkAnalysis(analysis);
          setArtworkAnalysisStatus(`Analyzed ${analysis.fileName}`);
          setImageComplexity(analysis.complexity);
        } catch (error) {
          setArtworkAnalysis(null);
          setArtworkAnalysisStatus(error instanceof Error ? error.message : 'Artwork analysis failed.');
        }
      } else if (isPdfFile) {
        try {
          const preview = await renderPdfFirstPage(await file.arrayBuffer());
          placementDataUrl = preview.dataUrl;
          imagePixels = { width: preview.width, height: preview.height };
          pdfPrintSize = { width: preview.signWidth, height: preview.signHeight };
          pdfPreviewDpi = preview.dpi;
          canPlaceOnCanvas = Boolean(canvas);
          setArtworkAnalysis(null);
          setArtworkAnalysisStatus(`${file.name} previewed from page 1 at ${preview.signWidth}" × ${preview.signHeight}". The original PDF remains attached for production.`);
        } catch (error) {
          setArtworkAnalysis(null);
          setArtworkAnalysisStatus(`The original PDF was saved, but its preview could not be rendered: ${error instanceof Error ? error.message : 'unknown PDF error'}.`);
        }
      } else {
        setArtworkAnalysis(null);
        setArtworkAnalysisStatus(`${file.name} saved as a production file.`);
      }

      const localItemId = `${Date.now()}-${file.name}`;
      const detectedPrintSize = pdfPrintSize || (imagePixels.width > 0 && imagePixels.height > 0
        ? getArtworkPrintSize(imagePixels.width, imagePixels.height, embeddedResolution)
        : null);
      const item: ImageZoneItem = {
        id: localItemId,
        name: file.name,
        dataUrl: placementDataUrl,
        width: imagePixels.width,
        height: imagePixels.height,
        dpi: pdfPreviewDpi || (embeddedResolution ? Math.round(Math.min(embeddedResolution.dpiX, embeddedResolution.dpiY)) : BANNER_PREVIEW_DPI),
        uploadedAt: new Date().toLocaleString(),
        source: 'local',
        mimeType: file.type,
        signWidth: detectedPrintSize?.width,
        signHeight: detectedPrintSize?.height
      };
      setImageZoneItems((prev) => [item, ...prev]);
      setSelectedImageZoneId(item.id);
      if ((isImageFile || Boolean(pdfPrintSize)) && isCoroBuilder) placeCoroArtworkOnSheet(item);
      if ((isImageFile || Boolean(pdfPrintSize)) && !isCoroBuilder && isAutoSidedRigidBuilder && rigidArtworkTarget === 'back') {
        setRigidBackArtwork(item);
        setRigidArtworkTarget('front');
        setRigidPreviewSide('back');
        setSignValues((prev) => ({ ...prev, sides: 'double' }));
        setSignEstimate(null);
        setImageLibraryStatus(`${file.name} placed on the back. Double-sided pricing is now active.`);
      } else if ((isImageFile || Boolean(pdfPrintSize)) && !isCoroBuilder && isBannerBuilder) {
        if (isAutoSidedRigidBuilder) {
          setRigidArtworkTarget('front');
          setRigidPreviewSide('front');
          setSignValues((prev) => ({
            ...prev,
            sides: rigidBackArtwork
              ? 'double'
              : selectedSignProduct.id === 'business-card'
                ? String(prev.sides || 'single')
                : 'single'
          }));
        }
        setSignArtworkPreviewUrl(placementDataUrl);
        setBannerArtworkName(file.name);
        const printSize = pdfPrintSize || applySignSizeFromPixels(imagePixels.width, imagePixels.height, embeddedResolution) || getArtworkPrintSize(imagePixels.width, imagePixels.height, embeddedResolution);
        if (pdfPrintSize) {
          setSignValues((prev) => ({ ...prev, width: String(pdfPrintSize.width), height: String(pdfPrintSize.height) }));
          setSignArtworkSize(pdfPrintSize);
        }
        setPendingBannerPlacement({ dataUrl: placementDataUrl, name: file.name, width: imagePixels.width, height: imagePixels.height, printWidth: printSize.width, printHeight: printSize.height });
        setImageLibraryStatus(`${file.name} selected for the ${isAutoSidedRigidBuilder ? 'front' : 'banner'}.`);
      } else if (canPlaceOnCanvas) {
        await placeImageOnDesign(placementDataUrl, file.name);
      }
      event.target.value = '';

      if (isSupabaseStorageConfigured && customerSession?.access_token) {
        setImageLibraryStatus(`${canPlaceOnCanvas ? 'Preview ready' : 'Library file ready'}. Saving original file to ${SUPABASE_STORAGE_BUCKET}...`);
        try {
          const storageInfo = await uploadArtworkFileToSupabase(file, customerSession);
          setImageZoneItems((prev) => prev.map((entry) => entry.id === localItemId ? {
            ...entry,
            id: storageInfo.storagePath,
            dataUrl: storageInfo.storageUrl || entry.dataUrl,
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
          setRigidBackArtwork((prev) => prev?.id === localItemId ? {
            ...prev,
            id: storageInfo.storagePath,
            storagePath: storageInfo.storagePath,
            storageUrl: storageInfo.storageUrl,
            source: 'supabase'
          } : prev);
          setSelectedImageZoneId(storageInfo.storagePath);
          setImageLibraryStatus(customerSession?.user?.email
            ? `Saved original file to ${customerSession.user.email}'s library.`
            : `Saved original file to guest library: ${storageInfo.storagePath}`);
        } catch (error) {
          setImageLibraryStatus(`Preview ready. Supabase upload failed: ${error instanceof Error ? error.message : 'unknown error'}. Check bucket policies.`);
        }
      } else {
        setImageLibraryStatus(customerSession?.access_token
          ? 'Local preview only. Cloud storage is not configured.'
          : 'Guest session: artwork is available in this browser only. Sign in to save it to a private Image Zone library.');
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
          setSignValues((prev) => ({ ...prev, width: String(placement.printWidth), height: String(placement.printHeight) }));
          setSignArtworkSize({ width: placement.printWidth, height: placement.printHeight });
          setBannerArtworkFitState('unresolved');
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
  }, [isBannerBuilder, pendingBannerPlacement]);

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
    if (isCoroBuilder) {
      payload.quantity = effectiveCoroQuantity;
      payload.width = primaryCustomCoroItem ? Number(primaryCustomCoroItem.signWidth || signWidth) : signWidth;
      payload.height = primaryCustomCoroItem ? Number(primaryCustomCoroItem.signHeight || signHeight) : signHeight;
      payload.material = signValues.material || (selectedSignProduct.id === 'yard-sign' ? '4mm' : 'standard');
      payload.thickness = signValues.material || (selectedSignProduct.id === 'yard-sign' ? '4mm' : 'standard');
      payload.sheetCount = coroSheetLayout.sheetCount;
    }
    const missingNumber = isCoroBuilder
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

  const handleAddCurrentDesignToCart = async () => {
    if (productMode !== 'signage') {
      setCartStatus('Apparel cart support is coming next. Use sign products for this cart test.');
      setShowCart(true);
      return;
    }
    if (!signEstimate || signOrderRetailTotal === null || (hasMultipleArtworkSets && !savedArtworkSetsPriced)) {
      setCartStatus('Run pricing before adding this item to the cart.');
      setShowCart(true);
      return;
    }
    if (hasMultipleArtworkSets && bannerOrderItems.some((item) => !item.dataUrl || (String(item.sides || 'single') === 'double' && !item.backArtwork))) {
      setCartStatus('Every artwork set needs its required front and back artwork before the order can be added to the cart.');
      setShowCart(true);
      return;
    }
    if (!signArtworkStatusOk) {
      setCartStatus('Resolve artwork fit or upload missing artwork before adding to cart.');
      setShowCart(true);
      return;
    }

    if (!isSupabaseStorageConfigured) {
      setCartStatus('Final production artwork cannot be prepared because Supabase storage is not configured.');
      setShowCart(true);
      return;
    }

    const findArtworkSource = (name: string | undefined, dataUrl: string | null | undefined) => imageZoneItems.find((item) => (name && item.name === name) || (dataUrl && item.dataUrl === dataUrl));
    const artworkFiles: CartArtworkFile[] = [];
    setIsPreparingCartArtwork(true);
    setCartStatus('Rendering the approved artwork exactly as shown and saving final production files...');
    try {
      const attachFinalProductionFile = async (options: { role: string; name: string; dataUrl: string; width: number; height: number; fitState: ArtworkFitState; sourceWidth?: number; sourceHeight?: number }) => {
        const rendered = await renderProductionArtwork({ ...options, transparentBackground: selectedSignProduct.id === 'acrylic' });
        const storageInfo = await uploadArtworkFileToSupabase(rendered.file, customerSession);
        artworkFiles.push({ role: `FINAL PRODUCTION — ${options.role}`, name: rendered.name, storagePath: storageInfo.storagePath, storageUrl: storageInfo.storageUrl, source: 'supabase', previewUrl: storageInfo.storageUrl });
      };

      if (isCoroBuilder) {
        for (let index = 0; index < coroSheetArtworkItems.length; index += 1) {
          const item = coroSheetArtworkItems[index];
          const itemWidth = Number(item.signWidth || signWidth);
          const itemHeight = Number(item.signHeight || signHeight);
          await attachFinalProductionFile({ role: `Artwork set ${index + 1} front`, name: item.name, dataUrl: item.dataUrl, width: itemWidth, height: itemHeight, fitState: item.frontFitState || 'unresolved', sourceWidth: item.sourceSignWidth, sourceHeight: item.sourceSignHeight });
          if (item.backDataUrl) {
            const backSourceSize = getArtworkSourcePrintSize(item.backWidth, item.backHeight, item.dpi);
            await attachFinalProductionFile({ role: `Artwork set ${index + 1} back`, name: item.backName || `${item.name}-back`, dataUrl: item.backDataUrl, width: itemWidth, height: itemHeight, fitState: item.backFitState || item.frontFitState || 'unresolved', sourceWidth: backSourceSize?.width, sourceHeight: backSourceSize?.height });
          }
        }
      } else if (isBannerBuilder) {
        for (let index = 0; index < bannerOrderItems.length; index += 1) {
          const item = bannerOrderItems[index];
          const setNumber = item.setNumber || index + 1;
          if (item.dataUrl) await attachFinalProductionFile({ role: `Artwork set ${setNumber} front`, name: item.name, dataUrl: item.dataUrl, width: item.width, height: item.height, fitState: item.fitState });
          if (item.backArtwork) await attachFinalProductionFile({ role: `Artwork set ${setNumber} back`, name: item.backArtwork.name, dataUrl: item.backArtwork.dataUrl, width: item.width, height: item.height, fitState: item.backArtwork.backFitState || item.fitState });
        }
        if (signArtworkPreviewUrl) await attachFinalProductionFile({ role: `Artwork set ${activeBannerSetNumber} front`, name: bannerArtworkName || 'artwork', dataUrl: signArtworkDisplayUrl || signArtworkPreviewUrl, width: signWidth, height: signHeight, fitState: bannerArtworkFitState });
        if (isAutoSidedRigidBuilder && rigidBackArtwork) await attachFinalProductionFile({ role: `Artwork set ${activeBannerSetNumber} back`, name: rigidBackArtwork.name, dataUrl: rigidBackArtwork.dataUrl, width: signWidth, height: signHeight, fitState: rigidBackArtwork.backFitState || bannerArtworkFitState });
      } else if (signArtworkPreviewUrl) {
        await attachFinalProductionFile({ role: 'Artwork', name: bannerArtworkName || `${selectedSignProduct.name}-artwork`, dataUrl: signArtworkDisplayUrl || signArtworkPreviewUrl, width: signWidth, height: signHeight, fitState: bannerArtworkFitState });
      }
    } catch (error) {
      const message = `The item was not added because its final production artwork could not be saved: ${error instanceof Error ? error.message : 'unknown rendering error'}.`;
      setCartStatus(message);
      setSignEstimateStatus(message);
      setShowCart(false);
      setIsPreparingCartArtwork(false);
      return;
    }
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
        const setNumber = item.setNumber || index + 1;
        const source = findArtworkSource(item.name, item.dataUrl);
        artworkFiles.push({
          role: `Artwork set ${setNumber} original front`,
          name: item.name,
          storagePath: source?.storagePath,
          storageUrl: source?.storageUrl,
          source: source?.source,
          previewUrl: item.dataUrl || undefined
        });
        if (item.backArtwork) artworkFiles.push({
          role: `Artwork set ${setNumber} original back`,
          name: item.backArtwork.name,
          storagePath: item.backArtwork.storagePath,
          storageUrl: item.backArtwork.storageUrl,
          source: item.backArtwork.source,
          previewUrl: item.backArtwork.dataUrl
        });
      });
      if (signArtworkPreviewUrl) {
        const source = findArtworkSource(bannerArtworkName, signArtworkPreviewUrl);
        const alreadyIncluded = artworkFiles.some((file) => file.previewUrl === signArtworkPreviewUrl && file.name === (bannerArtworkName || source?.name));
        if (!alreadyIncluded) artworkFiles.push({
          role: `Artwork set ${activeBannerSetNumber} original front`,
          name: bannerArtworkName || source?.name || 'Banner artwork',
          storagePath: source?.storagePath,
          storageUrl: source?.storageUrl,
          source: source?.source,
          previewUrl: signArtworkPreviewUrl
        });
      }
      if (isAutoSidedRigidBuilder && rigidBackArtwork) artworkFiles.push({
        role: `Artwork set ${activeBannerSetNumber} original back`,
        name: rigidBackArtwork.name,
        storagePath: rigidBackArtwork.storagePath,
        storageUrl: rigidBackArtwork.storageUrl,
        source: rigidBackArtwork.source,
        previewUrl: rigidBackArtwork.dataUrl
      });
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

    let productionBreakdown: CartProductionArtwork[] = isCoroBuilder
      ? (() => {
          let runningQuantity = 0;
          return coroSheetArtworkItems.map((item, index) => {
            const quantity = Math.max(1, Number(coroArtworkQuantities[item.id] || 1));
            const firstSheet = Math.floor(runningQuantity / Math.max(1, coroSheetLayout.signsPerSheet)) + 1;
            const lastSheet = Math.floor((runningQuantity + quantity - 1) / Math.max(1, coroSheetLayout.signsPerSheet)) + 1;
            runningQuantity += quantity;
            const finalFront = artworkFiles.find((file) => file.role === `FINAL PRODUCTION — Artwork set ${index + 1} front`);
            const finalBack = artworkFiles.find((file) => file.role === `FINAL PRODUCTION — Artwork set ${index + 1} back`);
            return {
              id: `${item.id}-${index}`,
              label: `Artwork set ${index + 1}`,
              quantity,
              sizeLabel: `${Number(item.signWidth || signWidth)}" x ${Number(item.signHeight || signHeight)}"`,
              sheetLabel: firstSheet === lastSheet ? `Sheet ${firstSheet}` : `Sheets ${firstSheet}-${lastSheet}`,
              frontName: finalFront?.name || item.name,
              frontPreviewUrl: finalFront?.storageUrl || item.storageUrl || item.dataUrl,
              frontStoragePath: finalFront?.storagePath || item.storagePath,
              backName: item.backDataUrl ? finalBack?.name || item.backName || `${item.name} back` : undefined,
              backPreviewUrl: item.backDataUrl ? finalBack?.storageUrl || item.backDataUrl : undefined,
              backStoragePath: item.backDataUrl ? finalBack?.storagePath || item.backStoragePath : undefined
            };
          });
        })()
      : signArtworkPreviewUrl
        ? [{
            id: `${selectedSignProduct.id}-artwork-1`,
            label: 'Artwork set 1',
            quantity: designerQuantity,
            sizeLabel: `${signWidth}" x ${signHeight}"`,
            frontName: artworkFiles.find((file) => file.role.includes('FINAL PRODUCTION') && file.role.toLowerCase().includes('front'))?.name || bannerArtworkName || `${selectedSignProduct.name} artwork`,
            frontPreviewUrl: artworkFiles.find((file) => file.role.includes('FINAL PRODUCTION') && (file.role.toLowerCase().includes('front') || !rigidBackArtwork))?.storageUrl || signArtworkPreviewUrl,
            frontStoragePath: artworkFiles.find((file) => file.role.includes('FINAL PRODUCTION') && (file.role.toLowerCase().includes('front') || !rigidBackArtwork))?.storagePath,
            backName: rigidBackArtwork?.name,
            backPreviewUrl: artworkFiles.find((file) => file.role === 'FINAL PRODUCTION — Back artwork')?.storageUrl || rigidBackArtwork?.dataUrl,
            backStoragePath: artworkFiles.find((file) => file.role === 'FINAL PRODUCTION — Back artwork')?.storagePath || rigidBackArtwork?.storagePath
          }]
        : [];
    if (isBannerBuilder && !isCoroBuilder) {
      productionBreakdown = [...bannerOrderItems.map((item, index) => {
        const setNumber = item.setNumber || index + 1;
        const finalFront = artworkFiles.find((file) => file.role.includes(`Artwork set ${setNumber} front`) && file.role.includes('FINAL PRODUCTION'));
        const finalBack = artworkFiles.find((file) => file.role.includes(`Artwork set ${setNumber} back`) && file.role.includes('FINAL PRODUCTION'));
        return {
          id: `${item.id}-${index}`,
          label: `Artwork set ${setNumber}`,
          quantity: Math.max(1, item.quantity),
          sizeLabel: `${item.width}" x ${item.height}"`,
          frontName: finalFront?.name || item.name,
          frontPreviewUrl: finalFront?.storageUrl || item.dataUrl || undefined,
          frontStoragePath: finalFront?.storagePath,
          backName: item.backArtwork ? finalBack?.name || item.backArtwork.name : undefined,
          backPreviewUrl: item.backArtwork ? finalBack?.storageUrl || item.backArtwork.dataUrl : undefined,
          backStoragePath: item.backArtwork ? finalBack?.storagePath || item.backArtwork.storagePath : undefined
        };
      })];
      if (signArtworkPreviewUrl) {
        const setNumber = activeBannerSetNumber;
        const finalFront = artworkFiles.find((file) => file.role.includes(`Artwork set ${setNumber} front`) && file.role.includes('FINAL PRODUCTION'));
        const finalBack = artworkFiles.find((file) => file.role.includes(`Artwork set ${setNumber} back`) && file.role.includes('FINAL PRODUCTION'));
        productionBreakdown.push({
          id: `${selectedSignProduct.id}-artwork-${setNumber}`,
          label: `Artwork set ${setNumber}`,
          quantity: designerQuantity,
          sizeLabel: `${signWidth}" x ${signHeight}"`,
          frontName: finalFront?.name || bannerArtworkName || `${selectedSignProduct.name} artwork`,
          frontPreviewUrl: finalFront?.storageUrl || signArtworkPreviewUrl,
          frontStoragePath: finalFront?.storagePath,
          backName: rigidBackArtwork ? finalBack?.name || rigidBackArtwork.name : undefined,
          backPreviewUrl: rigidBackArtwork ? finalBack?.storageUrl || rigidBackArtwork.dataUrl : undefined,
          backStoragePath: rigidBackArtwork ? finalBack?.storagePath || rigidBackArtwork.storagePath : undefined
        });
      }
      productionBreakdown.sort((a, b) => Number(a.label.match(/\d+/)?.[0] || 0) - Number(b.label.match(/\d+/)?.[0] || 0));
    }
    const pricePerSheet = isCoroBuilder ? signPricePerSheet : null;
    const cartPricingApiSlug = selectedSignProduct.id === 'yard-sign' ? 'custom-cut-coroplast' : selectedSignProduct.apiSlug;
    const cartPricingPayload = toSignPricingPayload(selectedSignProduct, signValues);
    cartPricingPayload.quantity = isCoroBuilder ? effectiveCoroQuantity : designerQuantity;
    if (isCoroBuilder) {
      cartPricingPayload.width = primaryCustomCoroItem ? Number(primaryCustomCoroItem.signWidth || signWidth) : signWidth;
      cartPricingPayload.height = primaryCustomCoroItem ? Number(primaryCustomCoroItem.signHeight || signHeight) : signHeight;
      cartPricingPayload.material = signValues.material || (selectedSignProduct.id === 'yard-sign' ? '4mm' : 'standard');
      cartPricingPayload.thickness = signValues.material || (selectedSignProduct.id === 'yard-sign' ? '4mm' : 'standard');
      cartPricingPayload.sheetCount = coroSheetLayout.sheetCount;
    }
    const cartItem: CartItem = {
      id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      addedAt: new Date().toISOString(),
      mode: productMode,
      productId: selectedSignProduct.id,
      productName: isBannerBuilder ? bannerDisplayName : selectedSignProduct.id === 'vehicle-magnet' ? magnetDisplayName : selectedSignProduct.name,
      quantity: isCoroBuilder ? effectiveCoroQuantity : designerQuantity,
      sizeLabel: `${signWidth || 0}" x ${signHeight || 0}"`,
      optionSummary: [
        getSignConfigurationText(selectedSignProduct, isCoroBuilder ? { ...signValues, quantity: String(effectiveCoroQuantity) } : signValues),
        isCoroBuilder ? `${coroSheetLayout.sheetCount} sheet${coroSheetLayout.sheetCount === 1 ? '' : 's'} / ${coroSheetLayout.signsPerSheet} per sheet` : '',
        isBannerBuilder && !isCoroBuilder ? `${bannerSquareFeet.toFixed(1)} sqft` : ''
      ].filter(Boolean),
      price: {
        total: signRetailTotal,
        each: isCoroBuilder ? coroPricePerSign : signEachTotal,
        currency: signEstimate.currency || 'USD',
        sheetCount: isCoroBuilder ? coroSheetLayout.sheetCount : undefined,
        pricePerSheet
      },
      pricingRequest: { apiSlug: cartPricingApiSlug, payload: cartPricingPayload },
      artworkFiles,
      productionBreakdown,
      productionSummary: [
        signArtworkStatusOk ? 'Artwork fit approved' : 'Artwork needs review',
        'Approved Fit/Stretch placement flattened into FINAL PRODUCTION artwork and securely saved to your Hue order',
        isCoroBuilder ? `Sheet layout: ${coroSheetLayout.columns} across x ${coroSheetLayout.rows} down` : '',
        hasCoroDoubleSided ? `Double-sided ${selectedSignProduct.name}` : '',
        String(signValues.sides || 'single') === 'double' && isBannerBuilder && !isCoroBuilder ? 'Double-sided banner' : ''
      ].filter(Boolean),
      customer: {
        userId: customerSession?.user?.id,
        email: customerSession?.user?.email,
        checkoutMode: customerSession?.user?.id ? 'account' : 'quick'
      }
    };
    const cartItemsToAdd = hasMultipleArtworkSets
      ? [...savedArtworkSetPricing.map((item, index) => ({
          setNumber: item.setNumber || index + 1,
          width: item.width,
          height: item.height,
          quantity: Math.max(1, item.quantity),
          material: item.material,
          sides: item.sides || 'single',
          estimate: item.estimate,
          total: item.retailTotal,
          each: item.eachTotal
        })), {
          setNumber: activeBannerSetNumber,
          width: signWidth,
          height: signHeight,
          quantity: designerQuantity,
          material: String(signValues.material || ''),
          sides: String(signValues.sides || 'single'),
          estimate: signEstimate,
          total: signRetailTotal,
          each: signEachTotal
        }].sort((a, b) => a.setNumber - b.setNumber).map((set) => {
          const setNumber = set.setNumber;
          const setValues = {
            ...signValues,
            width: String(set.width),
            height: String(set.height),
            quantity: String(set.quantity),
            material: set.material || signValues.material,
            sides: set.sides
          };
          const setPayload = toSignPricingPayload(selectedSignProduct, setValues);
          setPayload.quantity = set.quantity;
          return {
            ...cartItem,
            id: `cart-${Date.now()}-${setNumber}-${Math.random().toString(36).slice(2, 8)}`,
            quantity: set.quantity,
            sizeLabel: `${set.width}" x ${set.height}"`,
            optionSummary: [
              getSignConfigurationText(selectedSignProduct, setValues),
              `Artwork set ${setNumber} of ${productionBreakdown.length}`
            ],
            price: {
              total: set.total,
              each: set.each,
              currency: set.estimate?.currency || signEstimate.currency || 'USD'
            },
            pricingRequest: { apiSlug: cartPricingApiSlug, payload: setPayload },
            artworkFiles: artworkFiles.filter((file) => file.role.includes(`Artwork set ${setNumber} `)),
            productionBreakdown: productionBreakdown.filter((item) => item.label === `Artwork set ${setNumber}`),
            productionSummary: [...cartItem.productionSummary, `Artwork set ${setNumber} of ${productionBreakdown.length}`]
          } satisfies CartItem;
        })
      : [cartItem];
    setCartItems((prev) => [...cartItemsToAdd, ...prev]);
    setCartStatus(`${cartItemsToAdd.length} artwork set${cartItemsToAdd.length === 1 ? '' : 's'} added to cart with ${artworkFiles.length} artwork file${artworkFiles.length === 1 ? '' : 's'} attached.`);
    setIsPreparingCartArtwork(false);
    setShowCart(true);
  };

  useEffect(() => {
    if (!isProductionBuilder) return;
    const pricingQuantity = isCoroBuilder ? effectiveCoroQuantity : designerQuantity;
    if (pricingQuantity <= 0) return;
    if (isCoroBuilder && !customCoroHasValidSizes) {
      setSignEstimate(null);
      setSignEstimateStatus(`Enter a ${selectedSignProduct.name} width and height to load pricing.`);
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
    if (isCoroBuilder) {
      payload.width = primaryCustomCoroItem ? Number(primaryCustomCoroItem.signWidth || signWidth) : signWidth;
      payload.height = primaryCustomCoroItem ? Number(primaryCustomCoroItem.signHeight || signHeight) : signHeight;
      payload.material = signValues.material || (selectedSignProduct.id === 'yard-sign' ? '4mm' : 'standard');
      payload.thickness = signValues.material || (selectedSignProduct.id === 'yard-sign' ? '4mm' : 'standard');
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
      if (!response.ok) throw new Error(data.error_description || data.message || data.msg || 'Sign-in failed. Please check your email and password, then try again.');
      if (!data.access_token) {
        setCustomerAuthStatus('Account created! Check your email for a confirmation link. After confirming your address, return here and sign in.');
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
    setImageZoneItems([]);
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
  const dtgTotalQuantity = Object.values(dtgQuantities).reduce((total, quantity) => total + quantity, 0);
  const dtgArtworkCount = Number(Boolean(dtgArtwork.front)) + Number(Boolean(dtgArtwork.back));
  const dtgPrintHeight = Number((dtgPrintWidth * 1.18).toFixed(1));
  const filteredCanvaDesigns = canvaDesigns.filter((design) => design.title.toLowerCase().includes(canvaDesignSearch.trim().toLowerCase()));
  const filteredCoroSizeOptions = CORO_SIZE_OPTIONS.filter((option) => {
    const query = coroSizeSearch.trim().toLowerCase();
    if (!query) return true;
    return option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query.replace(/\s/g, ''));
  });

  const useCompactBuilderLayout = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

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
      setActiveCoroOptionPanel(useCompactBuilderLayout() ? null : 'images');
      return;
    }
    if (categoryId === 'apparel') {
      setProductMode('signage');
      setStoreView('store');
      return;
    }
    setStoreView('store');
  };

  const chooseStoreCategory = (categoryId: StoreCategoryId) => {
    setStoreCategory(categoryId);
    window.setTimeout(() => document.getElementById('store-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  };

  const switchBuilderCategoryFromHeader = (categoryId: StoreCategoryId) => {
    setStoreCategory(categoryId);
    setStoreView('store');
    window.setTimeout(() => document.getElementById('store-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  };

  const openStoreProduct = (product: StoreProductCard) => {
    if (product.disabled) return;
    if (product.id === 'apparel-dtg') {
      setStoreCategory('apparel');
      setProductMode('signage');
      setStoreView('dtg');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    resetPlacedArtworkForProduct();
    setProductMode(product.mode);
    if (product.signProductId) {
      const nextProduct = SIGN_PRODUCT_CONFIGS.find((config) => config.id === product.signProductId);
      setSignProductId(product.signProductId);
      if (nextProduct) setSignValues({ ...getDefaultSignValues(nextProduct), ...(product.initialSignValues || {}) } as Record<string, string | boolean>);
      setSignEstimate(null);
    }
    setStoreView('builder');
    if (product.signProductId) setActiveCoroOptionPanel(useCompactBuilderLayout() ? null : 'images');
  };

  const uploadDtgArtwork = (side: ShirtView, file: File | null) => {
    if (!file) return;
    try {
      validateClientArtworkFile(file);
    } catch (error) {
      setCartStatus(error instanceof Error ? error.message : 'Choose a supported DTG artwork file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setDtgArtwork((current) => ({ ...current, [side]: { name: file.name, dataUrl: reader.result as string } }));
      setDtgSide(side);
    };
    reader.readAsDataURL(file);
  };

  const chooseProductForImageZoneItem = (product: StoreProductCard) => {
    const item = imageZoneProductChoice;
    if (!item || product.disabled) return;
    setImageZoneProductChoice(null);
    setShowImageZone(false);
    if (useCompactBuilderLayout()) setActiveCoroOptionPanel(null);
    setStoreCategory(product.category);
    setQueuedImageZonePlacementAttempt(0);
    setQueuedImageZonePlacement({ item, product });
    setImageLibraryStatus(`Opening ${product.title} and placing ${item.name}...`);
    openStoreProduct(product);
  };

  useEffect(() => {
    if (!queuedImageZonePlacement) return;
    const { item, product } = queuedImageZonePlacement;
    const productReady = storeView === 'builder'
      && productMode === product.mode
      && (!product.signProductId || signProductId === product.signProductId);
    if (!productReady) return;
    if (product.mode === 'apparel' && !fabricCanvasRef.current) {
      if (queuedImageZonePlacementAttempt >= 40) {
        setQueuedImageZonePlacement(null);
        setImageLibraryStatus(`The apparel designer opened, but ${item.name} could not be placed automatically. Open Image Zone from the designer and choose Use again.`);
        return;
      }
      const timer = window.setTimeout(() => setQueuedImageZonePlacementAttempt((attempt) => attempt + 1), 100);
      return () => window.clearTimeout(timer);
    }
    setQueuedImageZonePlacement(null);
    void useImageZoneItem(item);
  }, [queuedImageZonePlacement, queuedImageZonePlacementAttempt, storeView, productMode, signProductId]);

  const selectSignProductForBuilder = (nextProductId: SignProductId) => {
    if (nextProductId !== signProductId) resetPlacedArtworkForProduct();
    const nextProduct = SIGN_PRODUCT_CONFIGS.find((config) => config.id === nextProductId);
    setSignProductId(nextProductId);
    if (nextProduct) setSignValues(getDefaultSignValues(nextProduct));
    setSignEstimate(null);
    setActiveCoroOptionPanel(nextProductId === 'yard-sign' || nextProduct?.preview === 'banner' ? (useCompactBuilderLayout() ? null : 'images') : null);
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
    setSignValues((prev) => {
      const next = { ...prev, [name]: value };
      if (selectedSignProduct.id === 'business-card' && name === 'orientation' && typeof value === 'string') {
        next.width = value === 'Portrait' ? '2' : '3.5';
        next.height = value === 'Portrait' ? '3.5' : '2';
      }
      if (isSheetPricedProduct && name === 'size' && typeof value === 'string' && value !== 'custom') {
        const parsedSize = parseCoroSize(value);
        if (parsedSize.width > 0 && parsedSize.height > 0) {
          next.width = String(parsedSize.width);
          next.height = String(parsedSize.height);
        }
      }
      if (isBannerBuilder && lockSignProportions && signArtworkSize && typeof value === 'string' && (name === 'width' || name === 'height')) {
        const changedDimension = Number(value);
        const artworkAspect = signArtworkSize.width / Math.max(0.01, signArtworkSize.height);
        if (changedDimension > 0 && Number.isFinite(artworkAspect) && artworkAspect > 0) {
          const linkedDimension = name === 'width' ? changedDimension / artworkAspect : changedDimension * artworkAspect;
          next[name === 'width' ? 'height' : 'width'] = String(Number(linkedDimension.toFixed(2)));
        }
      }
      return next;
    });
    setSignEstimate(null);
  };

  const updatePrintSides = (value: string) => {
    if (!supportsDoubleSidedProduct) return;
    if (selectedSignProduct.id === 'banner') {
      setBannerArtworkFitState('unresolved');
      if (value === 'single') {
        setRigidBackArtwork(null);
        setRigidArtworkTarget('front');
        setRigidPreviewSide('front');
      }
      setSignValues((prev) => ({
        ...prev,
        sides: value,
        material: value === 'double' ? '18-single' : '13-single'
      }));
      setSignEstimate(null);
      setActiveCoroOptionPanel('images');
      if (value === 'double') setShowBannerDoubleSidedWarning(true);
      return;
    }
    if (value === 'single' && isAutoSidedRigidBuilder) {
      setRigidBackArtwork(null);
      setRigidArtworkTarget('front');
      setRigidPreviewSide('front');
    }
    setSignValues((prev) => ({ ...prev, sides: value }));
    setSignEstimate(null);
    setActiveCoroOptionPanel('images');
    if (value === 'double' && isAutoSidedRigidBuilder) {
      setImageLibraryStatus(`Double-sided selected. Add back artwork for this ${selectedSignProduct.name} before adding it to the cart.`);
    } else if (value === 'single' && isAutoSidedRigidBuilder) {
      setImageLibraryStatus('Single-sided selected. Any back artwork was removed.');
    }
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
    if (label === 'Orientation') {
      openCoroOptionPanel('orientation');
      return;
    }
    if (label === 'Coating') {
      openCoroOptionPanel('coating');
      return;
    }
    if (label === 'Standoffs') {
      openCoroOptionPanel('standoffs');
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

  const renderSavedBannerArtworkCard = (item: BannerOrderItem, fallbackIndex: number) => {
    const itemMismatch = item.dataUrl ? aspectRatioMismatch(item.artworkSize?.width, item.artworkSize?.height, item.width, item.height) && item.fitState === 'unresolved' : true;
    const setNumber = item.setNumber || fallbackIndex + 1;
    return <button key={item.id} type="button" onClick={async () => { await loadBannerOrderItem(item); }} className={`hue-artwork-card w-full rounded-2xl border p-4 text-left ${itemMismatch ? 'hue-artwork-card--warning border-amber-300/45 bg-[#fffaf0]' : 'hue-artwork-card--ready border-emerald-300/45 bg-[#f1fff8]'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Artwork set {formatArtworkSetNumber(setNumber)}</p><h3 className={`mt-1 text-lg font-black leading-tight ${itemMismatch ? 'text-amber-700' : 'text-emerald-700'}`}>{itemMismatch ? 'Needs a fit check' : 'Print ready'}</h3>
          <p className="mt-1 text-xs text-slate-700">width: <span className="font-bold">{item.width}</span>&quot; &nbsp; height: <span className="font-bold">{item.height}</span>&quot; &nbsp; qty: <span className="font-bold">{item.quantity}</span></p>
          <p className="mt-1 text-xs text-slate-600">{item.materialLabel || getBannerMaterialLabel(item.material)} · {formatSetSides(item.sides)}</p>
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
  };

  return (
    <main className={`${isProductionBuilder ? `flex min-h-screen flex-col bg-[#050b12] text-slate-100 ${storeView === 'builder' ? 'overflow-y-auto pb-0 md:h-screen md:overflow-hidden' : 'overflow-y-auto pb-12'}` : 'min-h-screen bg-[#f4f8fc] pb-24 text-slate-950'}`}>
      <input id="artwork-upload-input" ref={artworkUploadInputRef} onChange={onUploadImage} className="fixed -left-96 top-0 h-px w-px opacity-0" type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.pdf" />
      <header className={`hue-site-header ${isProductionBuilder ? 'border-b border-white/10 bg-[#080d14]/96 px-5 py-3 shadow-[0_10px_32px_rgba(0,0,0,0.42)] backdrop-blur md:px-7' : 'border-b border-white/70 bg-white/90 px-4 py-3 shadow-[0_8px_30px_rgba(7,17,31,0.06)] backdrop-blur md:px-6'}`}>
        <div className={`hue-site-header-inner mx-auto flex max-w-[1800px] flex-wrap items-center gap-3 ${isProductionBuilder ? 'justify-between' : ''}`}>
          <div className="hue-mobile-brand flex min-w-0 flex-1 items-center gap-3">
            <div className={`hue-mobile-logo ${isProductionBuilder ? 'h-14 w-[300px] rounded-md border border-white/20 shadow-[0_0_28px_rgba(22,120,184,0.20)] md:w-[360px]' : 'h-16 w-[340px] rounded-lg border-[3px]'} flex shrink-0 items-center justify-center overflow-hidden border-[#1678b8] bg-[#030706] shadow-sm`}>
              <img src="/brand/hue-studio-wide.jpg" alt="Hue Studio - Design, Upload, Order" className="h-full w-full object-contain" />
            </div>
            <div className="sr-only">
              <p className={`text-xs font-black uppercase tracking-[0.24em] ${isProductionBuilder ? 'text-[#57c8ff]' : 'text-[#1f73be]'}`}>Hue Graphics / Est. 2008</p>
              <h1 className={`truncate font-black tracking-tight ${isProductionBuilder ? 'text-[2rem] leading-none text-white drop-shadow-[0_0_18px_rgba(56,189,248,0.26)]' : 'text-2xl text-[#05090b] md:text-3xl'}`}>
                <span className={isProductionBuilder ? 'bg-gradient-to-r from-white via-[#dff7ff] to-[#57c8ff] bg-clip-text text-transparent' : ''}>Hue Studio</span>
              </h1>
              <p className={`mt-1 text-[10px] font-bold uppercase tracking-[0.18em] ${isProductionBuilder ? 'text-slate-400' : 'text-slate-500'}`}>Design · Upload · Order</p>
            </div>
          </div>
          {isProductionBuilder ? <nav className="hue-mobile-category-strip order-3 flex w-full items-center justify-center gap-3 overflow-x-auto px-1 pt-2 text-[10px] font-semibold text-slate-400 md:order-none md:w-auto md:flex-1 md:pt-0">
            {STORE_CATEGORIES.map((category) => {
              const active = storeCategory === category.id;
              const icon = category.id === 'banners' ? 'BN' : category.id === 'rigid' ? 'RG' : category.id === 'decals' ? 'AD' : category.id === 'magnets' ? 'MG' : category.id === 'apparel' ? 'AP' : category.id === 'misc' ? 'MS' : 'CO';
              return <button key={category.id} type="button" onClick={() => switchBuilderCategoryFromHeader(category.id)} className={`group flex min-w-14 flex-col items-center gap-1 border-b-2 px-1 pb-2 pt-0 transition ${active ? 'border-[#0ea5e9] text-[#50c7ff]' : 'border-transparent text-slate-400 hover:border-slate-600 hover:text-slate-200'}`}>
                <span className={`flex h-8 w-8 items-center justify-center rounded border text-[10px] font-black shadow-sm ${active ? 'border-[#0ea5e9] bg-[#071827] text-[#65d5ff] shadow-[0_0_16px_rgba(14,165,233,0.40)]' : 'border-white/20 bg-[#0c1118] text-slate-300 group-hover:border-slate-500'}`}>{icon}</span>
                <span>{category.label}</span>
              </button>;
            })}
          </nav> : null}
          <div className="hue-mobile-header-actions order-2 flex w-full items-center gap-2 overflow-x-auto pb-1 text-sm md:order-none md:w-auto md:overflow-visible md:pb-0">
            <button onClick={() => setStoreView('store')} className={`${isProductionBuilder ? `rounded border px-4 py-2 font-semibold transition ${storeView === 'store' ? 'border-[#0ea5e9] bg-[#071827] text-white shadow-[0_0_18px_rgba(14,165,233,0.22)] hover:bg-[#0b263d]' : 'border-white/15 bg-[#0b1018] text-slate-400 hover:border-slate-500 hover:text-slate-100'}` : 'rounded-md border border-slate-300 bg-white px-3 py-2 font-medium hover:bg-slate-50'}`}>Products</button>
            {storeView === 'builder' && !isProductionBuilder ? <button onClick={saveDraftToLocal} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium hover:bg-slate-50">Save</button> : null}
            {storeView === 'builder' && !isProductionBuilder ? <button onClick={exportDesign} className="rounded-md bg-[#1678b8] px-3 py-2 font-bold text-white hover:bg-[#0f5f94]">Download PNG</button> : null}
            {isProductionBuilder ? <button type="button" onClick={() => { if (storeView === 'store') openStandaloneImageZone(); else openArtworkLibrary(); }} className="rounded border border-[#0ea5e9] bg-[#071827] px-4 py-2 font-black text-white shadow-[0_0_18px_rgba(14,165,233,0.22)] hover:bg-[#0b263d]">Image Zone</button> : null}
            {isProductionBuilder ? <button type="button" onClick={openCanvaImport} className="rounded border border-[#8be3ff]/60 bg-[linear-gradient(135deg,#1686c9,#7c3aed)] px-4 py-2 font-black text-white shadow-[0_0_24px_rgba(14,165,233,0.34),0_0_34px_rgba(124,58,237,0.22)] hover:border-white hover:brightness-110">Import Canva</button> : null}
            <button type="button" onClick={openCustomerAccount} className={`${isProductionBuilder ? 'max-w-36 truncate rounded border border-white/20 bg-[#0b1018] px-4 py-2 font-bold text-white hover:border-[#0ea5e9]/70' : 'max-w-36 truncate rounded-md border border-[#1f73be]/25 bg-white px-3 py-2 font-bold text-[#125b99] hover:bg-[#eef6ff]'}`}>{customerAccountButtonLabel}</button>
            <button type="button" onClick={() => setShowCart(true)} className={`${isProductionBuilder ? 'rounded border border-white/20 bg-[#0b1018] px-4 py-2 font-bold text-white hover:border-slate-500' : 'rounded-md border border-[#1f73be]/25 bg-[#eef6ff] px-3 py-2 font-bold text-[#125b99] hover:bg-[#dff0ff]'}`}>Cart &amp; Checkout{cartItems.length ? ` (${cartItems.length})` : ''}</button>
            {isProductionBuilder ? <button type="button" onClick={() => setShowMainMenu((current) => !current)} aria-expanded={showMainMenu} className="rounded border border-white/20 bg-[#0b1018] px-4 py-2 font-bold text-white hover:border-slate-500">Menu</button> : null}
          </div>
        </div>
      </header>
      {isProductionBuilder && showMainMenu ? <div className="fixed inset-0 z-[9999]" onClick={() => setShowMainMenu(false)}>
        <div className="absolute right-4 top-20 w-72 overflow-hidden rounded-2xl border border-[#38bdf8]/25 bg-[#071522] text-left text-white shadow-[0_28px_80px_rgba(0,0,0,0.65),0_0_34px_rgba(14,165,233,0.18)]" onClick={(event) => event.stopPropagation()}>
          <div className="border-b border-white/10 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">Hue Studio Menu</p>
            <p className="mt-1 text-xs text-slate-400">Quick places to jump if you get turned around.</p>
          </div>
          <div className="p-2">
            <a href="/products" onClick={() => setShowMainMenu(false)} className="block rounded-xl px-3 py-3 text-sm font-bold text-slate-100 hover:bg-white/[0.07]">Product Catalog<span className="mt-0.5 block text-xs font-normal text-slate-500">Browse banners, signs, apparel, and more</span></a>
            <button type="button" onClick={() => { if (storeView === 'store') openStandaloneImageZone(); else openArtworkLibrary(); setShowMainMenu(false); }} className="block w-full rounded-xl px-3 py-3 text-left text-sm font-bold text-slate-100 hover:bg-white/[0.07]">Image Zone<span className="mt-0.5 block text-xs font-normal text-slate-500">Open saved artwork and uploads</span></button>
            <button type="button" onClick={() => { openCanvaImport(); setShowMainMenu(false); }} className="block w-full rounded-xl px-3 py-3 text-left text-sm font-bold text-slate-100 hover:bg-white/[0.07]">Import Canva<span className="mt-0.5 block text-xs font-normal text-slate-500">Bring a Canva design into Image Zone</span></button>
            <button type="button" onClick={() => { openCustomerAccount(); setShowMainMenu(false); }} className="block w-full rounded-xl px-3 py-3 text-left text-sm font-bold text-slate-100 hover:bg-white/[0.07]">My Account<span className="mt-0.5 block text-xs font-normal text-slate-500">Sign in, create an account, or view saved artwork</span></button>
            <button type="button" onClick={() => { setShowCart(true); setShowMainMenu(false); }} className="block w-full rounded-xl px-3 py-3 text-left text-sm font-bold text-slate-100 hover:bg-white/[0.07]">Cart &amp; Checkout<span className="mt-0.5 block text-xs font-normal text-slate-500">Review items and submit your order</span></button>
            <a href="/help" onClick={() => setShowMainMenu(false)} className="block rounded-xl px-3 py-3 text-sm font-bold text-slate-100 hover:bg-white/[0.07]">Help / Contact Hue<span className="mt-0.5 block text-xs font-normal text-slate-500">Learn how Hue Studio works</span></a>
          </div>
        </div>
      </div> : null}

      {storeView === 'dtg' && !showImageZone && !showCustomerLogin && !showCart ? (
        <section className="min-h-[calc(100vh-88px)] bg-[#050b12] px-3 py-4 text-slate-100 md:px-6 md:py-6">
          <div className="mx-auto max-w-[1800px]">
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[#38bdf8]/25 bg-[radial-gradient(circle_at_82%_0%,rgba(14,165,233,0.18),transparent_34%),linear-gradient(135deg,#071827,#050c14)] px-5 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.38)] md:px-7">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#67d8ff]">Hue Apparel / DTG Order Builder</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-white md:text-4xl">Direct to Garment Printing</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Choose the shirt, add full-color artwork, select sizes and quantities, then review the production setup. This is the first working layout; garment availability and live DTG pricing will be connected next.</p>
              </div>
              <button type="button" onClick={() => { setProductMode('signage'); setStoreView('store'); setStoreCategory('apparel'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="rounded-xl border border-white/15 bg-white/[0.05] px-4 py-3 text-xs font-black uppercase text-slate-200 hover:border-[#38bdf8]/60 hover:bg-[#0c2a40]">Back to Apparel</button>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[330px_minmax(440px,1fr)_350px]">
              <aside className="space-y-4 rounded-2xl border border-white/10 bg-[#08131f] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.32)]">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">1. Choose garment</p>
                  <div className="mt-3 rounded-xl border border-[#38bdf8]/25 bg-[#0c1c2b] px-3 py-3">
                    <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-black text-white">Bella+Canvas BC3001</p><p className="mt-1 text-[10px] text-slate-400">Unisex Jersey Short Sleeve Tee</p></div><span className="rounded-full bg-[#0ea5e9]/10 px-2 py-1 text-[9px] font-black uppercase text-[#67d8ff]">Only DTG style</span></div>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">2. Shirt color</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[['White', '#ffffff'], ['Black', '#101318']].map(([label, color]) => <button key={color} type="button" onClick={() => setDtgColor(color)} className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-xs font-bold transition ${dtgColor === color ? 'border-[#67d8ff] bg-[#0c304b] text-white shadow-[0_0_18px_rgba(56,189,248,0.22)]' : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/30'}`}><span className="h-6 w-6 rounded-full border border-white/25 shadow-inner" style={{ backgroundColor: color }} /><span>{label}</span></button>)}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">3. Add artwork</p><span className="rounded-full bg-[#0ea5e9]/10 px-2 py-1 text-[10px] font-bold text-[#67d8ff]">{dtgArtworkCount} side{dtgArtworkCount === 1 ? '' : 's'}</span></div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(['front', 'back'] as ShirtView[]).map((side) => <label key={side} className={`cursor-pointer rounded-xl border p-3 text-center transition ${dtgArtwork[side] ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-dashed border-[#38bdf8]/40 bg-[#08243a]/50 hover:border-[#67d8ff]'}`}><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => uploadDtgArtwork(side, event.target.files?.[0] || null)} /><span className="block text-[10px] font-black uppercase text-white">{dtgArtwork[side] ? `${side} loaded` : `Upload ${side}`}</span><span className="mt-1 block truncate text-[9px] text-slate-400">{dtgArtwork[side]?.name || 'PNG or JPG'}</span></label>)}
                  </div>
                  {dtgArtwork[dtgSide] ? <button type="button" onClick={() => setDtgArtwork((current) => ({ ...current, [dtgSide]: null }))} className="mt-2 w-full rounded-lg border border-rose-400/25 py-2 text-[10px] font-bold uppercase text-rose-300 hover:bg-rose-400/10">Remove {dtgSide} artwork</button> : null}
                </div>
                <div className="rounded-xl border border-[#38bdf8]/20 bg-[#0c2a40]/45 p-3">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black text-white">Smart size scaling</p><p className="mt-1 text-[10px] text-slate-400">Adjusts the print proportionally by garment size.</p></div><button type="button" onClick={() => setDtgSmartScale((value) => !value)} className={`relative h-7 w-12 rounded-full transition ${dtgSmartScale ? 'bg-[#1fc77a]' : 'bg-slate-700'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${dtgSmartScale ? 'left-6' : 'left-1'}`} /></button></div>
                  <label className="mt-4 block text-[10px] font-bold uppercase text-slate-400">Large print width: {dtgPrintWidth.toFixed(1)}&quot;</label>
                  <input type="range" min="3" max="12.5" step="0.25" value={dtgPrintWidth} onChange={(event) => setDtgPrintWidth(Number(event.target.value))} className="mt-2 w-full accent-[#22b6f0]" />
                </div>
              </aside>

              <section className="relative min-h-[620px] overflow-hidden rounded-2xl border border-[#38bdf8]/20 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px),radial-gradient(circle_at_50%_42%,rgba(14,165,233,0.18),transparent_38%),#06101a] bg-[size:28px_28px,28px_28px,auto,auto] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.36)]">
                <div className="mx-auto flex w-fit rounded-xl border border-white/10 bg-[#07131e] p-1 shadow-xl">
                  {(['front', 'back'] as ShirtView[]).map((side) => <button key={side} type="button" onClick={() => setDtgSide(side)} className={`min-w-24 rounded-lg px-5 py-2 text-xs font-black uppercase transition ${dtgSide === side ? 'bg-[#168dce] text-white shadow-[0_0_20px_rgba(56,189,248,0.28)]' : 'text-slate-400 hover:text-white'}`}>{side}</button>)}
                </div>
                <div className="relative mx-auto mt-7 h-[490px] max-w-[560px] overflow-hidden rounded-[28px] border border-[#38bdf8]/20 bg-[#e8edf1] shadow-[0_28px_45px_rgba(0,0,0,0.48)]">
                  <div className="absolute inset-y-0 left-1/2 w-[80%] -translate-x-1/2 overflow-hidden">
                    <img src={dtgColor === '#ffffff' ? '/dtg-bc3001-white.png' : '/dtg-bc3001-black.png'} alt={`Bella+Canvas BC3001 ${dtgColor === '#ffffff' ? 'white' : 'black'} ${dtgSide} shirt`} className={`pointer-events-none absolute top-0 h-full w-auto max-w-none select-none ${dtgColor === '#ffffff' ? 'mix-blend-multiply contrast-110' : ''}`} style={{ left: '50%', transform: `translateX(${dtgSide === 'front' ? '-25%' : '-75%'})` }} />
                  </div>
                  <div className="absolute top-[31%] z-10 aspect-[12.5/15.7] w-[27%] -translate-x-1/2 border border-dashed border-[#168dce]/65 bg-white/[0.025]" style={{ left: dtgColor === '#ffffff' ? '47.5%' : '55.5%' }}>
                    <span className="absolute -top-6 left-1/2 whitespace-nowrap rounded bg-[#07131e]/90 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-[#67d8ff] shadow-sm">Max print area 12.5&quot; × 15.7&quot;</span>
                    <span className="absolute left-1/2 top-0 h-full border-l border-dashed border-[#168dce]/25" />
                    <span className="absolute left-0 top-1/2 w-full border-t border-dashed border-[#168dce]/25" />
                    <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center" style={{ width: `${Math.min(100, (dtgPrintWidth / 12.5) * 100)}%`, height: `${Math.min(100, (dtgPrintHeight / 15.7) * 100)}%` }}>
                      {dtgArtwork[dtgSide] ? <img src={dtgArtwork[dtgSide]!.dataUrl} alt={`${dtgSide} artwork`} className="max-h-full max-w-full object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.2)]" /> : <label className="flex h-full min-h-20 w-full min-w-20 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#38bdf8]/70 bg-[#071827]/75 px-2 text-center shadow-[0_8px_20px_rgba(0,0,0,0.22)] backdrop-blur-sm"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => uploadDtgArtwork(dtgSide, event.target.files?.[0] || null)} /><span className="text-2xl font-light leading-none text-[#67d8ff]">+</span><span className="mt-1 text-[9px] font-black uppercase text-white">Add {dtgSide} artwork</span><span className="mt-1 text-[8px] text-slate-400">Click to upload</span></label>}
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-[#38bdf8]/25 bg-[#07131e]/90 px-4 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-[#9be8ff] backdrop-blur">Print area approx. {dtgPrintWidth.toFixed(1)}&quot; × {dtgPrintHeight.toFixed(1)}&quot; / {dtgSide} side</div>
              </section>

              <aside className="space-y-4 rounded-2xl border border-white/10 bg-[#08131f] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.32)]">
                <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">4. Sizes & quantities</p><p className="mt-2 text-xs leading-5 text-slate-400">Enter quantities for the Bella+Canvas BC3001 in the selected color.</p></div>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(dtgQuantities) as DtgSize[]).map((size) => <label key={size} className="rounded-xl border border-white/10 bg-white/[0.035] p-2 text-center"><span className="block text-xs font-black text-white">{size}</span><input type="number" min="0" value={dtgQuantities[size]} onChange={(event) => setDtgQuantities((current) => ({ ...current, [size]: Math.max(0, Number(event.target.value) || 0) }))} className="mt-2 w-full rounded-lg border border-white/10 bg-[#050c14] px-2 py-2 text-center text-sm font-bold text-white outline-none focus:border-[#38bdf8]" /></label>)}
                </div>
                <div className="rounded-xl border border-[#38bdf8]/25 bg-[linear-gradient(135deg,rgba(14,165,233,0.14),rgba(7,24,39,0.8))] p-4">
                  <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-300">Total garments</span><span className="text-2xl font-black text-white">{dtgTotalQuantity}</span></div>
                  <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-[11px]"><div className="flex justify-between gap-3"><span className="text-slate-400">Garment</span><span className="text-right font-bold text-white">{dtgGarment}</span></div><div className="flex justify-between gap-3"><span className="text-slate-400">Printed sides</span><span className="font-bold text-white">{dtgArtworkCount || 0}</span></div><div className="flex justify-between gap-3"><span className="text-slate-400">Scaling</span><span className="font-bold text-white">{dtgSmartScale ? 'Smart scale on' : 'Same size'}</span></div></div>
                </div>
                <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-4"><p className="text-xs font-black text-amber-200">Live DTG pricing is the next connection.</p><p className="mt-2 text-[11px] leading-5 text-amber-100/70">The product setup and artwork workflow are ready for refinement. Add to cart will activate after garment inventory and pricing are mapped.</p></div>
                <button type="button" disabled className="w-full cursor-not-allowed rounded-xl bg-[#168dce] px-4 py-4 text-sm font-black uppercase text-white opacity-45">Add to cart — next step</button>
              </aside>
            </div>
          </div>
        </section>
      ) : storeView === 'store' && !showImageZone && !showCanvaImport && !showCustomerLogin && !showCart && !showNewArtworkDialog && !showArtworkEditor ? (
        <section className="hue-store-shell mx-auto w-full min-w-0 max-w-[1800px] px-4 py-3 md:px-6">
          <div className="hue-store-layout grid min-w-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className={`hue-mobile-product-nav rounded-lg p-4 shadow-[0_18px_48px_rgba(7,17,31,0.08)] lg:sticky lg:top-24 ${isProductionBuilder ? 'border border-white/25 bg-[#07111f]/82 text-slate-100 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur' : 'border border-white/80 bg-white/92'}`}>
              <p className={`text-xs font-black uppercase tracking-[0.22em] ${isProductionBuilder ? 'text-[#57c8ff]' : 'text-[#1f73be]'}`}>Products</p>
              <h2 className={`mt-2 text-2xl font-black tracking-tight ${isProductionBuilder ? 'text-white' : 'text-slate-950'}`}>Choose a print product</h2>
              <p className={`mt-2 text-sm leading-6 ${isProductionBuilder ? 'text-slate-300' : 'text-slate-600'}`}>Upload finished artwork, make quick changes, create a simple design, or import from Canva—then price and order online.</p>
              <div className="hue-mobile-category-strip mt-5 flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
                {STORE_CATEGORIES.map((category) => <button key={category.id} type="button" onClick={() => chooseStoreCategory(category.id)} className={`w-44 shrink-0 rounded-md border p-3 text-left transition lg:w-full ${isProductionBuilder ? storeCategory === category.id ? 'border-[#0ea5e9] bg-[#0b263d] text-white shadow-[0_0_18px_rgba(14,165,233,0.16)]' : 'border-white/15 bg-white/[0.06] text-slate-200 hover:border-[#0ea5e9]/60 hover:bg-white/[0.10]' : storeCategory === category.id ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94] shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><span className="block text-sm font-bold">{category.label}</span><span className={`mt-1 block truncate text-xs ${isProductionBuilder ? 'text-slate-400' : 'text-slate-500'}`}>{category.description}</span></button>)}
              </div>
            </aside>

            <section className={`hue-store-content min-w-0 overflow-hidden rounded-lg shadow-[0_18px_48px_rgba(7,17,31,0.08)] ${isProductionBuilder ? 'border border-white/15 bg-[#050b12] shadow-[0_24px_60px_rgba(0,0,0,0.45)]' : 'border border-white/80 bg-white/88'}`}>
              <div className="hue-store-hero relative overflow-hidden">
                <div aria-hidden="true" className="hue-store-hero-pattern absolute inset-0" />
                <div aria-hidden="true" className="hue-store-hero-glow absolute inset-0" />
                <div className="relative grid items-center gap-6 px-4 py-5 sm:px-6 sm:py-6 md:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#67d8ff]">Hue Graphics design + ordering</p>
                    <h2 className="hue-store-hero-title mt-3 max-w-3xl uppercase leading-[0.84] drop-shadow-[0_10px_32px_rgba(0,0,0,0.55)]">
                      <span className="block text-[clamp(2.3rem,4.9vw,5rem)] text-white">Create. Upload.</span>
                      <span className="mt-2 block text-[clamp(2rem,4.2vw,4.2rem)] text-[#16a9f5]">Order Online.</span>
                    </h2>
                    <p className="mt-4 text-[10px] font-black uppercase tracking-[0.34em] text-slate-300">Upload. Edit. Import. Order. We print.</p>
                    <div className="mt-5 grid max-w-3xl grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      {[['↑', 'Upload', 'Ready artwork'], ['✎', 'Hue Designer', 'Create or edit'], ['C', 'Canva', 'Import designs'], ['$', 'Order Online', 'Size and price']].map(([icon, title, note]) => <div key={title} className="flex items-center gap-2 border-l border-[#16a9f5]/45 pl-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#16a9f5]/45 bg-[#071827]/80 font-black text-[#67d8ff] shadow-[0_0_18px_rgba(14,165,233,0.16)]">{icon}</span><span><strong className="block text-white">{title}</strong><span className="block text-slate-400">{note}</span></span></div>)}
                    </div>
                    <p className="mt-4 max-w-3xl text-xs leading-5 text-slate-300">Start wherever your artwork is. Upload a finished file, make quick changes or create a simple layout in Hue Designer, or import a saved Canva project. Then choose your product, confirm the size, get pricing, and order.</p>
                    <div className="mt-5 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-center">
                      <button type="button" onClick={openStandaloneImageZone} className="inline-flex items-center gap-2 rounded-xl bg-[#1686c9] px-5 py-3 text-xs font-black uppercase text-white shadow-[0_14px_34px_rgba(14,165,233,0.28)] hover:bg-[#0f75b5]">I Have Artwork <span aria-hidden="true">→</span></button>
                      <button type="button" onClick={() => openNewArtworkCreator('home-create')} className="inline-flex items-center gap-2 rounded-xl border border-[#38bdf8]/45 bg-[#0c2a40] px-5 py-3 text-xs font-black uppercase text-[#a9ecff] hover:border-[#67d8ff] hover:bg-[#10364f]">Use Hue Designer <span aria-hidden="true">→</span></button>
                      <button type="button" onClick={openCanvaImport} className="inline-flex items-center gap-2 rounded-xl border border-[#8be3ff]/60 bg-[linear-gradient(135deg,#1686c9,#7c3aed)] px-5 py-3 text-xs font-black uppercase text-white shadow-[0_14px_34px_rgba(124,58,237,0.22)] hover:border-white hover:brightness-110">Import Canva <span aria-hidden="true">→</span></button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/15 bg-[#0a1119]/90 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur">
                    <p className="text-sm font-black text-white">Choose your starting point</p>
                    <div className="mt-3 grid gap-2 text-xs text-slate-300">
                      {['Upload finished, print-ready artwork', 'Make quick changes in Hue Designer', 'Create a simple design from a blank canvas', 'Import saved projects from Canva', 'Choose a product, size, and options', 'Get pricing and complete checkout online', 'Most orders are ready in 3–4 business days'].map((item) => <span key={item} className="flex items-center gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-[9px] font-black text-emerald-400 ring-1 ring-emerald-400/25">✓</span>{item}</span>)}
                    </div>
                    <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/[0.08] p-3 text-[11px] leading-5 text-amber-100/80">
                      <strong className="block text-sm text-amber-200">What you submit is what we print.</strong>
                      <p className="mt-2">Hue Studio is a self-service ordering tool. We perform a basic production check and may contact you if we notice a major issue, but we make minimal—if any—changes to submitted artwork.</p>
                      <p className="mt-2">Please confirm the size, spelling, resolution, bleed, colors, and layout before checkout. The customer is responsible for the accuracy and print readiness of the approved artwork.</p>
                    </div>
                    <div className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-5 text-amber-400">
                      <strong className="block">Need full custom design help?</strong>
                      <span className="text-amber-300/75">For advanced design work, submit a quote request on the main website.</span>
                    </div>
                    </div>
                  </div>
                </div>

              <div id="store-products" className="scroll-mt-24 p-4 md:p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className={`text-xl font-black ${isProductionBuilder ? 'text-white' : 'text-slate-950'}`}>{STORE_CATEGORIES.find((category) => category.id === storeCategory)?.label || 'Products'}</h3>
                    <p className={`mt-1 text-sm ${isProductionBuilder ? 'text-slate-300' : 'text-slate-500'}`}>Choose a product to open its Order Builder.</p>
                  </div>
                  {storeCategory !== 'apparel' ? <button type="button" onClick={() => setStoreCategory('apparel')} className={`rounded-md border px-3 py-2 text-sm font-medium ${isProductionBuilder ? 'border-white/20 bg-white/[0.06] text-slate-200 hover:border-[#0ea5e9]/60 hover:bg-white/[0.10]' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>View Apparel</button> : <span className="rounded-full border border-[#38bdf8]/25 bg-[#0c2a40]/45 px-3 py-2 text-xs font-bold text-[#9be8ff]">DTG ordering preview available</span>}
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {visibleStoreProducts.map((product) => <button key={product.id} type="button" onClick={() => openStoreProduct(product)} className={`hue-store-product-card group relative min-h-48 overflow-hidden rounded-lg border p-4 text-left transition sm:min-h-52 sm:p-5 ${product.disabled ? 'cursor-not-allowed border-white/10 bg-[#0a1017] opacity-60' : 'border-white/10 bg-[#08111b] hover:-translate-y-0.5 hover:border-[#16a9f5]/70 hover:shadow-[0_18px_48px_rgba(0,0,0,0.42),0_0_30px_rgba(14,165,233,0.10)]'}`}>
                    <span aria-hidden="true" className={`hue-store-product-visual hue-store-product-visual--${product.category} ${product.image ? 'hue-store-product-visual--image' : ''} ${product.imageSprite ? 'hue-store-product-visual--sprite' : ''}`}>{product.image ? <img src={product.image} alt="" style={product.imageSprite ? { left: `${product.imageSprite.column * -100}%`, top: `${product.imageSprite.row * -100}%` } : undefined} /> : <span>{product.category === 'apparel' ? 'T' : product.title.slice(0, 2)}</span>}</span>
                    <div className="relative z-10 max-w-[68%]">
                      <div className="flex items-start gap-3">
                        <div className={`relative flex h-9 w-9 items-center justify-center overflow-hidden rounded border border-[#16a9f5]/35 bg-[#071827] text-[10px] font-black uppercase text-[#8be3ff] shadow-[0_0_18px_rgba(14,165,233,0.14)] ${product.imageSprite ? 'hue-product-sprite-thumb' : ''}`}>{product.image ? <img src={product.image} alt="" className={product.imageSprite ? '' : 'h-full w-full object-cover'} style={product.imageSprite ? { left: `${product.imageSprite.column * -100}%`, top: `${product.imageSprite.row * -100}%` } : undefined} /> : product.category === 'apparel' ? 'T' : product.title.slice(0, 2)}</div>
                        {product.badge ? <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${product.disabled ? 'bg-white/5 text-slate-500' : 'bg-[#0ea5e9]/10 text-[#67d8ff]'}`}>{product.badge}</span> : null}
                      </div>
                      <p className="mt-5 text-xl font-black tracking-tight text-white">{product.title}</p>
                      <p className="mt-1 text-xs font-semibold text-[#38bdf8]">{product.subtitle}</p>
                      <p className="mt-3 text-xs leading-5 text-slate-400">{product.description}</p>
                      <span className={`mt-4 inline-flex items-center gap-2 text-xs font-black ${product.disabled ? 'text-slate-500' : 'text-[#67d8ff] group-hover:text-white'}`}>{product.disabled ? 'Coming soon' : 'Open Order Builder'}{product.disabled ? null : <span aria-hidden="true">→</span>}</span>
                    </div>
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
                    return <button key={option.value} type="button" onClick={() => { if (option.value === 'custom') switchCoroToCustomSize(); else updateSignOption('size', option.value); setSignEstimate(null); }} className={`w-full rounded border px-3 py-2 text-left text-xs ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><span className="block font-bold">{option.label}</span><span className="mt-1 block text-slate-500">{option.value === 'custom' ? 'Mix different sizes on the sheet' : `${layout.columns} across x ${layout.rows} down / ${layout.sheetCount} sheet${layout.sheetCount === 1 ? '' : 's'}`}</span></button>;
                  })}
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Order</p>
                <div className="mt-3 grid gap-3">
                  <label className="text-xs font-medium text-slate-600">Quantity<input type="number" min={1} value={String(signValues.quantity ?? '')} onChange={(event) => { setSignValues((prev) => ({ ...prev, quantity: event.target.value })); setSignEstimate(null); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950" /></label>
                  <label className="text-xs font-medium text-slate-600">Material<select value={String(signValues.material ?? productMaterialOptions[0]?.value ?? 'standard')} onChange={(event) => { setSignValues((prev) => ({ ...prev, material: event.target.value })); setSignEstimate(null); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950">{productMaterialOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <label className="text-xs font-medium text-slate-600">Print Sides<select value={String(signValues.sides ?? 'single')} onChange={(event) => updatePrintSides(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950"><option value="single">Single-Sided</option><option value="double">Double-Sided</option></select></label>
                </div>
              </div>
              <button type="button" onClick={() => { setImageLibraryStatus(`Choose artwork for ${selectedSignProduct.name}, or upload a new file from Image Zone.`); openArtworkLibrary(); }} className="w-full rounded-md bg-[#1678b8] px-3 py-3 text-sm font-black uppercase tracking-wide text-white hover:bg-[#0f5f94]">{signArtworkPreviewUrl ? 'Replace Artwork' : 'Upload Artwork'}</button>
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
                {selectedSignProduct.fields.filter((field) => selectedSignProduct.id !== 'yard-sign' || field.name !== 'size').map((field) => field.type === 'checkbox' ? <label key={field.name} className="flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"><input type="checkbox" checked={Boolean(signValues[field.name])} onChange={(event) => updateSignOption(field.name, event.target.checked)} /><span>{field.label}</span></label> : <label key={field.name} className="text-xs font-medium text-slate-600">{field.label}{field.type === 'select' ? <select value={String(signValues[field.name] ?? '')} onChange={(event) => updateSignOption(field.name, event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950">{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input type="number" min={field.name === 'quantity' ? 1 : 0.25} step={field.step} value={String(signValues[field.name] ?? '')} onChange={(event) => updateSignOption(field.name, event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950" />}</label>)}
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
            <div className={`hue-mobile-builder-stage relative flex items-center justify-center ${isProductionBuilder ? 'coro-hex-bg h-full rounded-none p-0' : 'rounded-lg p-4'} ${productMode === 'signage' ? `${isProductionBuilder ? '' : 'min-h-[660px] bg-[linear-gradient(#e5e7eb_1px,transparent_1px),linear-gradient(90deg,#e5e7eb_1px,transparent_1px)] bg-[size:24px_24px]'} overflow-hidden bg-[#202224]` : 'min-h-[520px] overflow-hidden bg-[#e2e7ed]'}`}>
              <div aria-hidden="true" className={`hue-production-atmosphere pointer-events-none absolute ${isProductionBuilder && activeCoroOptionPanel === 'images' ? 'hue-production-atmosphere--panel-open' : ''} ${isProductionBuilder ? '' : 'hue-production-atmosphere--light'}`}>
                <span className="hue-production-atmosphere__word block text-[clamp(4rem,12vw,11rem)] font-black leading-none tracking-[-0.08em]">HUE</span>
                <span className="hue-production-atmosphere__label mt-2 block text-[9px] font-black uppercase tracking-[0.56em]">Production canvas</span>
              </div>
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
              {productMode === 'signage' ? <div className={`hue-builder-summary absolute z-10 grid items-start gap-3 text-slate-700 ${isProductionBuilder ? isCoroBuilder ? `${activeCoroOptionPanel === 'images' ? 'left-[380px]' : 'left-[6vw]'} right-4 top-4 lg:grid-cols-[minmax(260px,380px)_minmax(0,1fr)_minmax(260px,330px)]` : `${activeCoroOptionPanel === 'images' ? 'left-[380px]' : 'left-[8vw]'} right-[5vw] top-4 lg:grid-cols-[minmax(220px,1fr)_minmax(320px,480px)_minmax(180px,240px)]` : 'inset-x-6 top-4 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1.1fr)_minmax(160px,0.6fr)_160px]'}`}>
                <div className={`hue-builder-product-card flex items-start gap-3 ${isProductionBuilder ? `${isCoroBuilder ? 'lg:col-start-1 lg:row-span-2' : ''} max-w-sm rounded-xl border border-white/10 bg-[#06111d]/54 px-4 py-2.5 shadow-[0_0_38px_rgba(14,165,233,0.12)] backdrop-blur` : ''}`}>
                  <div className={`${isProductionBuilder ? 'hidden' : 'hidden h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 border-[#1678b8] bg-[#05090b] sm:block'}`}><img src="/brand/hue-graphics-mark.png" alt="Hue Graphics" className="h-full w-full object-cover" /></div>
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${isProductionBuilder ? 'text-[#62d4ff]' : 'text-[#1678b8]'}`}>Order Builder</p>
                    <p className={`${isProductionBuilder ? 'text-3xl font-normal tracking-tight text-white' : 'text-2xl font-black tracking-tight text-slate-950'}`}>{selectedSignProduct.id === 'vehicle-magnet' ? magnetDisplayName : isBannerBuilder ? bannerDisplayName : selectedSignProduct.name}</p>
                    <p className={`mt-1 text-xs ${isProductionBuilder ? 'text-slate-300' : 'text-slate-500'}`}>{selectedSignProduct.id === 'vehicle-magnet' ? magnetDisplayName : isBannerBuilder ? bannerDisplayName : selectedSignProduct.name} {selectedSignProduct.id === 'vehicle-magnet' ? '' : isBannerBuilder ? selectedBannerMaterial?.label : String(signValues.material || '4mm')} {String(signValues.sides || 'single') === 'double' || String(signValues.material || '').includes('double') ? 'Double Sided' : 'Single Sided'} , {signWidth || 0}&quot; x {signHeight || 0}&quot;</p>
                    {isCoroBuilder ? <p className="mt-3 max-w-sm rounded border border-amber-300/20 bg-amber-300/[0.08] px-3 py-2 text-[10px] font-bold leading-4 text-amber-100">One 48&quot; × 96&quot; sheet is the minimum. Add more pieces to fill the available sheet space and lower the price per piece.</p> : null}
                  </div>
                </div>
                <div className={`hue-builder-production-card text-xs ${isProductionBuilder ? `${isCoroBuilder ? 'w-full max-w-none lg:col-start-3 lg:row-start-2' : 'max-w-[480px] lg:col-start-2 lg:row-start-1'} rounded-xl border border-[#0ea5e9]/35 bg-[#06111d]/90 px-4 py-3 text-slate-300 shadow-[0_0_42px_rgba(22,120,184,0.24)] backdrop-blur` : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={`font-black uppercase tracking-[0.18em] ${isProductionBuilder ? 'text-[#62d4ff]' : 'text-slate-500'}`}>Hue Production Summary</p>
                    {isProductionBuilder ? <span className="rounded-full border border-[#0ea5e9]/35 bg-[#0b263d] px-2.5 py-1 text-[10px] font-black uppercase text-[#9be6ff]">{hueQualityStatus}</span> : null}
                  </div>
                  <div className={`mt-2 grid gap-x-4 gap-y-0.5 ${isProductionBuilder ? isCoroBuilder ? 'grid-cols-[54px_1fr_1fr] text-center text-[10px]' : 'grid-cols-[80px_1fr_1fr] text-center text-[11px]' : 'grid-cols-2'}`}>
                    {isCoroBuilder ? <>
                      <span />
                      <span className="font-bold text-slate-100">Sheet Price</span>
                      <span className="font-bold text-slate-100">Per {selectedSignProduct.id === 'yard-sign' ? 'Sign' : 'Piece'}</span>
                      <span>{String(signValues.material || '4mm')}</span>
                      <span>{coroPricingIsLoaded && signPricePerSheet !== null ? `${formatSignPrice(signPricePerSheet, coroPricingCurrency)} / sheet` : isSignEstimateLoading ? 'Loading...' : 'Run pricing'}</span>
                      <span>{coroPricingIsLoaded && coroPricePerSign !== null ? `${formatSignPrice(coroPricePerSign, coroPricingCurrency)} / each` : isSignEstimateLoading ? 'Loading...' : 'Run pricing'}</span>
                      <span>{coroSheetLayout.sheetCount} sheet{coroSheetLayout.sheetCount === 1 ? '' : 's'} ordered</span>
                      <span>{signRetailTotal !== null ? `${formatSignPrice(signRetailTotal, coroPricingCurrency)} order total` : isSignEstimateLoading ? 'Loading...' : 'Run pricing'}</span>
                      <span>{effectiveCoroQuantity} total {coroPieceLabel}</span>
                      <span>1 sheet minimum</span>
                      <span>{coroPricePerFullSheet !== null ? `${formatSignPrice(coroPricePerFullSheet, coroPricingCurrency)} / full sheet` : '-'}</span>
                      <span>{coroSheetLayout.signsPerSheet} per sheet / {coroSheetCapacity} max</span>
                    </> : isRigidSignBuilder ? <>
                      <span />
                      <span className="font-bold text-slate-100">Order Price</span>
                      <span className="font-bold text-slate-100">Price Per Each</span>
                      <span>{summaryMaterialLabel} · {summarySidesLabel}</span>
                      <span>{signOrderRetailTotal !== null ? `${formatSignPrice(signOrderRetailTotal, signEstimate?.currency)} total` : isSignEstimateLoading ? 'Loading...' : 'Run pricing'}</span>
                      <span>{signEachTotal !== null ? `${formatSignPrice(signEachTotal, signEstimate?.currency)} each` : isSignEstimateLoading ? 'Loading...' : 'Run pricing'}</span>
                      <span>{signWidth || 0}&quot; × {signHeight || 0}&quot;</span>
                      <span>{summaryMaterialLabel}</span>
                      <span>{summarySidesLabel} print</span>
                    </> : isBusinessCardBuilder ? <>
                      <span />
                      <span className="font-bold text-slate-100">Order Price</span>
                      <span className="font-bold text-slate-100">Per Card</span>
                      <span>{String(signValues.orientation || 'Landscape')}</span>
                      <span>{signOrderRetailTotal !== null ? `${formatSignPrice(signOrderRetailTotal, signEstimate?.currency)} total` : isSignEstimateLoading ? 'Loading...' : 'Run pricing'}</span>
                      <span>{signEachTotal !== null ? `${formatSignPrice(signEachTotal, signEstimate?.currency)} each` : isSignEstimateLoading ? 'Loading...' : 'Run pricing'}</span>
                      <span>{String(signValues.coating || 'No Coating')}</span>
                      <span>{designerQuantity} cards</span>
                      <span>{String(signValues.sides || 'single') === 'double' ? 'Front and back' : 'Front only'}</span>
                    </> : isPosterBuilder ? <>
                      <span />
                      <span className="font-bold text-slate-100">Order Price</span>
                      <span className="font-bold text-slate-100">Per Poster</span>
                      <span>{selectedBannerMaterial?.label || 'Poster Paper'}</span>
                      <span>{signOrderRetailTotal !== null ? `${formatSignPrice(signOrderRetailTotal, signEstimate?.currency)} total` : isSignEstimateLoading ? 'Loading...' : 'Run pricing'}</span>
                      <span>{signEachTotal !== null ? `${formatSignPrice(signEachTotal, signEstimate?.currency)} each` : isSignEstimateLoading ? 'Loading...' : 'Run pricing'}</span>
                      <span>{signWidth || 0}&quot; &times; {signHeight || 0}&quot;</span>
                      <span>Poster paper</span>
                      <span>Single-sided print</span>
                    </> : isBannerBuilder ? hasMultipleArtworkSets ? <>
                      <span>{artworkSetCount} artwork sets</span>
                      <span className="font-bold text-slate-100">Order Total</span>
                      <span className="font-bold text-slate-100">Average Per Piece</span>
                      <span>Mixed configurations</span>
                      <span>{signOrderRetailTotal !== null ? `${formatSignPrice(signOrderRetailTotal, signEstimate?.currency)} total` : isSignEstimateLoading ? 'Loading...' : 'Run pricing'}</span>
                      <span>{orderAverageEach !== null ? `${formatSignPrice(orderAverageEach, signEstimate?.currency)} average` : isSignEstimateLoading ? 'Loading...' : 'Run pricing'}</span>
                      <span>{signOrderQuantity} total pieces</span>
                      <span>{selectedSignProduct.name}</span>
                      <span>{artworkSetCount} designs</span>
                    </> : <>
                      <span />
                      <span className="font-bold text-slate-100">Order Price</span>
                      <span className="font-bold text-slate-100">Price Per Each</span>
                      <span>{summaryMaterialLabel} · {summarySidesLabel}</span>
                      <span>{signOrderRetailTotal !== null ? `${formatSignPrice(signOrderRetailTotal, signEstimate?.currency)} total` : isSignEstimateLoading ? 'Loading...' : 'Run pricing'}</span>
                      <span>{signEachTotal !== null ? `${formatSignPrice(signEachTotal, signEstimate?.currency)} each` : isSignEstimateLoading ? 'Loading...' : 'Run pricing'}</span>
                      <span>{bannerSquareFeet.toFixed(1)} sqft</span>
                      <span>{summaryMaterialLabel}</span>
                      <span>{summarySidesLabel} print</span>
                    </> : <>
                      <span>Single-Sided</span><span>Double-Sided</span>
                      <span>{isBannerBuilder ? selectedBannerMaterial?.label || String(signValues.material || 'standard') : `${String(signValues.material || '4mm')} CORO`}</span><span>{selectedSignProduct.id === 'yard-sign' ? 'Priced per sheet' : String(signValues.sides || 'single') === 'double' ? 'Enabled' : 'Optional'}</span>
                    </>}
                  </div>
                  {hasMultipleArtworkSets ? <div className="mt-3 space-y-1 border-t border-white/10 pt-2 text-left text-[10px]">
                    {orderedArtworkSetPricing.map((item) => <div key={`summary-set-${item.setNumber}`} className="grid grid-cols-[1fr_auto] items-start gap-3 rounded bg-white/[0.04] px-2 py-1.5">
                      <span className="min-w-0">
                        <span className="block font-bold text-slate-200">Set {item.setNumber} · {item.materialLabel} · {formatSetSides(item.sides)}</span>
                        <span className="block text-slate-400">{item.width}&quot; × {item.height}&quot; · Qty {item.quantity}</span>
                      </span>
                      <span className="font-bold text-slate-100">{item.retailTotal !== null ? formatSignPrice(item.retailTotal, item.currency) : 'Pricing...'}</span>
                    </div>)}
                    <div className="flex items-center justify-between border-t border-white/10 px-2 pt-1 font-black text-[#9be6ff]"><span>{signOrderQuantity} total pieces · {artworkSetCount} artwork sets</span><span>{signOrderRetailTotal !== null ? formatSignPrice(signOrderRetailTotal, signEstimate?.currency) : 'Pricing...'}</span></div>
                  </div> : null}
                  {isProductionBuilder ? <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-300">
                    <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1">Hue API pricing</span>
                    <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1">{hueOrderPathLabel}</span>
                  </div> : null}
                </div>
                <div className={`hue-builder-total-card text-right ${isProductionBuilder ? `${isCoroBuilder ? 'w-full lg:col-start-3 lg:row-start-1' : 'lg:col-start-3 lg:row-start-1'} rounded-xl border border-[#22c55e]/25 bg-[#06111d]/78 px-5 py-3 shadow-[0_0_34px_rgba(34,197,94,0.12)] backdrop-blur` : ''}`}>
                  {isProductionBuilder ? <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7dd3fc]">Ready total</p> : null}
                  <p className={`${isProductionBuilder ? 'text-4xl' : 'text-2xl'} font-semibold text-green-500`}>{isSignEstimateLoading ? '...' : signOrderRetailTotal !== null ? formatSignPrice(signOrderRetailTotal, isCoroBuilder ? coroPricingCurrency : signEstimate?.currency) : '$0.00'}</p>
                  <p className={`text-sm ${isProductionBuilder ? 'text-slate-100' : 'text-slate-500'}`}>{isCoroBuilder ? coroReadyTotalLabel : isBusinessCardBuilder ? `${designerQuantity} business cards` : hasMultipleArtworkSets ? `${signOrderQuantity} total pieces / ${artworkSetCount} artwork sets` : `${bannerSquareFeet > 0 ? `${bannerSquareFeet.toFixed(1)} sqft` : '0 sqft'} / ${summaryMaterialLabel}`}</p>
                  {isCoroBuilder && coroPricePerSign !== null ? <p className="mt-1 text-xs text-slate-300">{formatSignPrice(coroPricePerSign, coroPricingCurrency)} each / {formatSignPrice(signRetailTotal ?? undefined, coroPricingCurrency)} total</p> : null}
                  {isBannerBuilder && !isCoroBuilder && signEachTotal !== null ? <p className="mt-1 text-xs text-slate-300">{hasMultipleArtworkSets ? `${orderAverageEach !== null ? `${formatSignPrice(orderAverageEach, signEstimate?.currency)} average each` : `${signOrderQuantity} pieces`} across ${artworkSetCount} artwork sets` : `${formatSignPrice(signEachTotal, signEstimate?.currency)} each`} / {formatSignPrice(signOrderRetailTotal ?? undefined, signEstimate?.currency)} total</p> : null}
                  {isProductionBuilder && signEstimateStatus ? <p className={`mt-2 max-w-[240px] text-xs leading-4 ${signEstimate ? 'text-emerald-300' : isSignEstimateLoading ? 'text-[#8be3ff]' : 'text-amber-300'}`}>{signEstimateStatus}</p> : null}
                  {hasCoroSheetWarning ? <button type="button" onClick={() => setShowCoroSheetWarning(true)} className="mt-3 rounded bg-red-600 px-3 py-1.5 text-xs font-black text-white shadow-[0_10px_24px_rgba(220,38,38,0.24)] hover:bg-red-500">{(hasCoroUnusedSheetSpace ? 1 : 0) + (hasCoroAspectMismatch ? 1 : 0)} warning{(hasCoroUnusedSheetSpace ? 1 : 0) + (hasCoroAspectMismatch ? 1 : 0) === 1 ? '' : 's'}</button> : null}
                  {isProductionBuilder ? <button type="button" onClick={canAddCurrentDesignToCart ? handleAddCurrentDesignToCart : requestSignEstimate} disabled={isSignEstimateLoading || isPreparingCartArtwork} className={`mt-3 w-full rounded border border-[#22c55e]/40 bg-[#22c55e] px-4 py-2.5 text-xs font-black uppercase text-white shadow-[0_0_24px_rgba(34,197,94,0.20)] hover:bg-[#16a34a] disabled:cursor-wait ${isPreparingCartArtwork ? 'hue-preparing-artwork-button' : 'disabled:opacity-60'}`}>{isPreparingCartArtwork ? <span className="hue-preparing-artwork-button__content"><span className="hue-preparing-artwork-button__spinner" aria-hidden="true" />Preparing Final Artwork<span className="hue-preparing-artwork-button__dots" aria-hidden="true" /></span> : isSignEstimateLoading ? 'Pricing...' : canAddCurrentDesignToCart ? 'Add To Cart' : signEstimate ? 'Check Artwork' : 'Run Pricing'}</button> : null}
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
              <div id="design-canvas" className={`hue-builder-canvas ${isProductionBuilder ? `absolute inset-x-0 mx-auto w-full ${isCoroBuilder ? 'bottom-20 top-32' : 'bottom-20 top-60'}` : 'relative w-full'} ${productMode === 'signage' ? `${isProductionBuilder ? 'max-w-none' : 'mt-24 aspect-[4/3] max-w-[1040px]'}` : productMode === 'apparel' ? 'aspect-[420/520] max-w-[860px]' : 'aspect-[420/520] max-w-[760px]'}`}>
                  {productMode === 'signage' ? <div className="absolute inset-0 flex items-center justify-center">
                  {isCoroBuilder ? <div className={`coro-sheet-stage relative flex h-full w-full items-center justify-center ${activeCoroOptionPanel === 'images' ? 'pl-[340px] pr-[340px]' : 'pr-[340px]'}`}>
                    {coroSheetPreviews.length > 1 ? <button type="button" onClick={() => setActiveCoroSheetIndex((current) => Math.max(0, current - 1))} disabled={activeCoroSheetIndex === 0} className={`${activeCoroOptionPanel === 'images' ? 'left-[390px]' : 'left-8'} absolute z-30 flex h-14 w-14 items-center justify-center rounded-full border border-[#38bdf8]/45 bg-[#071827]/88 text-3xl font-black text-white shadow-[0_0_30px_rgba(14,165,233,0.34),0_18px_42px_rgba(0,0,0,0.42)] backdrop-blur hover:border-[#67d8ff] hover:bg-[#0b263d] disabled:cursor-not-allowed disabled:opacity-30`}>‹</button> : null}
                    <div className={`coro-sheet-carousel relative z-[1] h-full overflow-hidden px-16 pb-28 pt-20 ${activeCoroOptionPanel === 'images' ? 'w-[calc(100vw-460px)] max-w-[calc(100vw-460px)]' : 'w-[86vw] max-w-[86vw]'}`}>
                    {coroSheetPreviews.map((sheetPreview, sheetIndex) => {
                      const selectedSheet = sheetIndex === activeCoroSheetIndex;
                      const sheetOffset = sheetIndex - activeCoroSheetIndex;
                      const nearActiveSheet = Math.abs(sheetOffset) <= 1;
                      return <div key={sheetPreview.sheetNumber} onClick={() => setActiveCoroSheetIndex(sheetIndex)} className={`coro-sheet-shell absolute left-1/2 top-[53%] flex shrink-0 cursor-pointer items-center justify-center transition duration-300 ease-out ${selectedSheet ? 'z-20 opacity-100' : nearActiveSheet ? 'z-10 opacity-45 hover:opacity-75' : 'pointer-events-none z-0 opacity-0'} ${activeCoroOptionPanel === 'images' ? 'w-[min(19vw,32vh)] min-w-52 max-w-[320px]' : 'w-[min(22vw,37vh)] min-w-60 max-w-[380px]'}`} style={{ aspectRatio: CORO_SHEET.width / CORO_SHEET.height, transform: `translate(-50%, -50%) translateX(${sheetOffset * 88}%) scale(${selectedSheet ? 1 : 0.78})` }}>
                      <div className={`coro-sheet-heading absolute left-1/2 flex w-max -translate-x-1/2 flex-col items-center text-center ${coroSheetPreviews.length > 1 ? '-top-6' : '-top-14 gap-1.5'}`}>
                        {coroSheetPreviews.length === 1 ? <span className="rounded-full border border-[#38bdf8]/25 bg-[#071827]/90 px-3 py-1 text-[9px] font-black uppercase tracking-[0.22em] text-[#8be3ff] shadow-[0_0_24px_rgba(14,165,233,0.18)] backdrop-blur">Hue production sheet</span> : null}
                        <span className="text-xs font-bold text-slate-300"><strong className="text-white">{sheetPreview.quantity}</strong> {selectedSignProduct.id === 'yard-sign' ? `sign${sheetPreview.quantity === 1 ? '' : 's'}` : `piece${sheetPreview.quantity === 1 ? '' : 's'}`} mapped &middot; sheet {String(sheetPreview.sheetNumber).padStart(2, '0')}</span>
                      </div>
                      <div className="coro-sheet-meta absolute -bottom-10 left-1/2 w-max -translate-x-1/2 rounded-full border border-white/10 bg-[#050d16]/80 px-3 py-1.5 text-center text-[10px] font-bold text-slate-300 backdrop-blur"><span className="text-[#8be3ff]">48 &times; 96</span> production sheet <span className="mx-1 text-white/25">/</span> {coroSheetViewSide === 'back' ? 'Back' : 'Front'}</div>
                      {hasCoroDoubleSided ? <div className="absolute -bottom-16 left-1/2 flex -translate-x-1/2 overflow-hidden rounded border border-white/20 bg-black/45 text-[10px] font-black uppercase text-slate-200 backdrop-blur">
                        <button type="button" onClick={() => setCoroSheetViewSide('front')} className={`px-3 py-1 ${coroSheetViewSide === 'front' ? 'bg-[#0ea5e9] text-white' : 'hover:bg-white/10'}`}>Front</button>
                        <button type="button" onClick={() => setCoroSheetViewSide('back')} className={`border-l border-white/15 px-3 py-1 ${coroSheetViewSide === 'back' ? 'bg-[#0ea5e9] text-white' : 'hover:bg-white/10'}`}>Back</button>
                      </div> : null}
                      <div className="coro-sheet-edge coro-sheet-edge--left absolute -left-12 bottom-0 top-0 text-[9px] font-black uppercase tracking-[0.2em] text-[#8be3ff]/70"><span className="absolute left-[-18px] top-1/2 -translate-y-1/2 -rotate-90 bg-[#050b12]/80 px-2">Left edge</span></div>
                      <div className="coro-sheet-edge coro-sheet-edge--right absolute -right-12 bottom-0 top-0 text-[9px] font-black uppercase tracking-[0.2em] text-[#8be3ff]/70"><span className="absolute right-[-20px] top-1/2 -translate-y-1/2 rotate-90 bg-[#050b12]/80 px-2">Right edge</span></div>
                      <button type="button" onClick={() => { setActiveCoroSheetIndex(sheetIndex); if (!hasCoroSheetArtwork) setShowImageZone(true); }} className={`coro-sheet-frame absolute inset-0 overflow-hidden rounded-[3px] border bg-white text-left ${selectedSheet ? 'border-[#38bdf8] ring-2 ring-[#38bdf8]/60 ring-offset-4 ring-offset-[#071522]' : 'border-white/80'}`}>
                        {isCustomCoro && customCoroSheetPreviews.length > 0 ? <div className="relative h-full w-full overflow-hidden bg-[repeating-linear-gradient(90deg,#f8fafc_0,#f8fafc_6px,#e2e8f0_6px,#e2e8f0_7px)] p-1">
                          {(sheetPreview.cells as { item: ImageZoneItem; x: number; y: number; width: number; height: number; rotated?: boolean }[]).map((cell, index) => {
                            const cellImage = coroSheetViewSide === 'back' ? cell.item.backDataUrl || null : cell.item.dataUrl || signArtworkPreviewUrl;
                            const cellFitState = coroSheetViewSide === 'back' ? cell.item.backFitState : cell.item.frontFitState;
                            const cellRotated = Boolean(cell.rotated);
                            const logicalCellWidth = cellRotated ? cell.height : cell.width;
                            const logicalCellHeight = cellRotated ? cell.width : cell.height;
                            const cellArtworkMatchesTarget = coroSheetViewSide === 'back'
                              ? artworkPrintSizeMatchesTarget(cell.item.backWidth, cell.item.backHeight, logicalCellWidth, logicalCellHeight, cell.item.dpi)
                              : artworkPrintSizeMatchesTarget(cell.item.width, cell.item.height, logicalCellWidth, logicalCellHeight, cell.item.dpi, cell.item.sourceSignWidth, cell.item.sourceSignHeight);
                            const centeredStyle = cellFitState === 'fit'
                              ? coroSheetViewSide === 'back'
                                ? getCenteredArtworkStyle(cell.item.backWidth, cell.item.backHeight, logicalCellWidth, logicalCellHeight, cell.item.dpi)
                                : getCenteredArtworkStyle(cell.item.width, cell.item.height, logicalCellWidth, logicalCellHeight, cell.item.dpi, cell.item.sourceSignWidth, cell.item.sourceSignHeight)
                              : {};
                            const hasCenteredSize = Object.keys(centeredStyle).length > 0;
                            const cellObjectFitClass = cellFitState === 'stretch' ? 'object-fill' : cellArtworkMatchesTarget ? 'object-contain' : 'object-fill';
                            const rotatedSignStyle = cellRotated ? { width: `${(cell.height / Math.max(1, cell.width)) * 100}%`, height: `${(cell.width / Math.max(1, cell.height)) * 100}%`, transform: 'rotate(90deg)' } : undefined;
                            return <div key={`${cell.item.id}-${index}`} className="absolute flex items-center justify-center overflow-hidden border border-dashed border-[#94a3b8] bg-white" style={{ left: `${(cell.x / CORO_SHEET.width) * 100}%`, top: `${(cell.y / CORO_SHEET.height) * 100}%`, width: `${(cell.width / CORO_SHEET.width) * 100}%`, height: `${(cell.height / CORO_SHEET.height) * 100}%` }}><div className={`${cellRotated ? 'flex items-center justify-center' : 'h-full w-full'} overflow-hidden`} style={rotatedSignStyle}>{cellImage ? <img src={cellImage} alt="" className={hasCenteredSize ? 'object-fill' : `h-full w-full ${cellObjectFitClass}`} style={hasCenteredSize ? centeredStyle : undefined} /> : <span className="px-1 text-center text-[9px] font-black uppercase italic leading-tight text-slate-400">add art</span>}</div></div>;
                          })}
                        </div> : <div className="grid h-full w-full gap-[2px] p-1" style={{ gridTemplateColumns: `repeat(${coroSheetLayout.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${coroSheetLayout.rows}, minmax(0, 1fr))` }}>
                          {Array.from({ length: coroSheetLayout.signsPerSheet }).map((_, index) => {
                            const shouldFillCell = index < sheetPreview.quantity;
                            const sheetItem = shouldFillCell ? sheetPreview.cells[index] as ImageZoneItem | undefined : null;
                            const cellImage = coroSheetViewSide === 'back' ? sheetItem?.backDataUrl || null : sheetItem?.dataUrl || signArtworkPreviewUrl;
                            const cellFitState = coroSheetViewSide === 'back' ? sheetItem?.backFitState : sheetItem?.frontFitState;
                            const cellRotated = Boolean(coroSheetLayout.rotated);
                            const cellArtworkMatchesTarget = sheetItem
                              ? coroSheetViewSide === 'back'
                                ? artworkPrintSizeMatchesTarget(sheetItem.backWidth, sheetItem.backHeight, signWidth, signHeight, sheetItem.dpi)
                                : artworkPrintSizeMatchesTarget(sheetItem.width, sheetItem.height, signWidth, signHeight, sheetItem.dpi, sheetItem.sourceSignWidth, sheetItem.sourceSignHeight)
                              : false;
                            const centeredStyle = sheetItem && cellFitState === 'fit'
                              ? coroSheetViewSide === 'back'
                                ? getCenteredArtworkStyle(sheetItem.backWidth, sheetItem.backHeight, signWidth, signHeight, sheetItem.dpi)
                                : getCenteredArtworkStyle(sheetItem.width, sheetItem.height, signWidth, signHeight, sheetItem.dpi, sheetItem.sourceSignWidth, sheetItem.sourceSignHeight)
                              : {};
                            const hasCenteredSize = Object.keys(centeredStyle).length > 0;
                            const cellObjectFitClass = cellFitState === 'stretch' ? 'object-fill' : cellArtworkMatchesTarget ? 'object-contain' : 'object-fill';
                            const rotatedSignStyle = cellRotated ? { width: `${(signWidth / Math.max(1, signHeight)) * 100}%`, height: `${(signHeight / Math.max(1, signWidth)) * 100}%`, transform: 'rotate(90deg)' } : undefined;
                            return <div key={index} className="coro-sheet-cell relative flex items-center justify-center overflow-hidden border border-dashed border-[#9eb6c6] bg-[repeating-linear-gradient(90deg,#fbfdff_0,#fbfdff_7px,#eaf1f5_7px,#eaf1f5_8px)]">{shouldFillCell && cellImage ? <div className={`${cellRotated ? 'flex items-center justify-center' : 'h-full w-full'} overflow-hidden`} style={rotatedSignStyle}><img src={cellImage} alt="" className={hasCenteredSize ? 'object-fill' : `h-full w-full ${cellObjectFitClass}`} style={hasCenteredSize ? centeredStyle : undefined} /></div> : shouldFillCell ? <span className="coro-sheet-empty flex flex-col items-center px-2 text-center"><span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#0ea5e9]/20 bg-[#e8f7ff] text-sm font-black text-[#1686c9] shadow-sm">H</span><span className="mt-2 text-[8px] font-black uppercase tracking-[0.18em] text-slate-500">Artwork zone</span></span> : null}</div>;
                          })}
                        </div>}
                      </button>
                    </div>;
                    })}
                    </div>
                    {coroSheetPreviews.length > 1 ? <div className="absolute bottom-7 left-1/2 z-30 -translate-x-1/2 rounded-full border border-[#38bdf8]/25 bg-[#06111d]/90 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#9be8ff] shadow-[0_0_24px_rgba(14,165,233,0.18)] backdrop-blur">Sheet {activeCoroSheetIndex + 1} of {coroSheetPreviews.length}</div> : null}
                    {coroSheetPreviews.length > 1 ? <button type="button" onClick={() => setActiveCoroSheetIndex((current) => Math.min(coroSheetPreviews.length - 1, current + 1))} disabled={activeCoroSheetIndex >= coroSheetPreviews.length - 1} className="absolute right-[365px] z-30 flex h-14 w-14 items-center justify-center rounded-full border border-[#38bdf8]/45 bg-[#071827]/88 text-3xl font-black text-white shadow-[0_0_30px_rgba(14,165,233,0.34),0_18px_42px_rgba(0,0,0,0.42)] backdrop-blur hover:border-[#67d8ff] hover:bg-[#0b263d] disabled:cursor-not-allowed disabled:opacity-30">›</button> : null}
                    {!hasCoroSheetArtwork && layers.length === 0 ? <button type="button" onClick={() => setShowImageZone(true)} className="hue-sheet-upload group absolute z-10 flex w-44 flex-col items-center rounded-2xl border border-white/25 bg-[#1686c9] px-4 py-4 text-center text-white shadow-[0_18px_44px_rgba(3,105,161,0.42),0_0_32px_rgba(56,189,248,0.28)] hover:-translate-y-0.5 hover:bg-[#0e74b4]"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-xl transition group-hover:scale-105">+</span><span className="mt-2 text-xs font-black uppercase tracking-[0.08em]">Add your artwork</span><span className="mt-1 text-[9px] font-medium text-[#c8f2ff]">Upload or choose from library</span></button> : null}
                  </div> : <div className={`relative flex items-center justify-center ${isProductionBuilder && activeCoroOptionPanel === 'images' ? 'ml-[360px]' : ''}`} style={signPreviewBoxStyle}>
                    <div className="hue-dimension hue-dimension--width" aria-hidden="true"><span className="hue-dimension__label"><span>Width</span><strong>{signWidth || 0}&quot;</strong></span></div>
                    <div className={`absolute -bottom-9 left-0 right-0 text-center text-xs ${isBannerBuilder ? 'text-slate-300' : 'text-slate-500'}`}>{isAutoSidedRigidBuilder && rigidPreviewSide === 'back' ? 'Back Side' : 'Front Side'}</div>
                    <div className="hue-dimension hue-dimension--height hue-dimension--left" aria-hidden="true"><span className="hue-dimension__label"><span>Height</span><strong>{signHeight || 0}&quot;</strong></span></div>
                    <div className="hue-dimension hue-dimension--height hue-dimension--right" aria-hidden="true"><span className="hue-dimension__label"><span>Height</span><strong>{signHeight || 0}&quot;</strong></span></div>
                    <div className={`absolute inset-0 ${isRigidSignBuilder ? 'rigid-sign-preview overflow-hidden border border-slate-300 transition-[border-radius] duration-300' : `overflow-hidden rounded-sm border bg-white ${signSurfacePreviewUrl ? 'border-[#38bdf8]/60' : 'border-slate-300'} shadow-[0_24px_58px_rgba(0,0,0,0.45),0_0_44px_rgba(96,165,250,0.18)]`}`} style={supportsSizedRoundedCorners ? { borderRadius: roundedCornerPreviewRadius || '3px' } : undefined}>
                      {!isRigidSignBuilder ? <div className="absolute inset-3 border border-dashed border-slate-300 transition-[border-radius] duration-300" style={supportsSizedRoundedCorners ? { borderRadius: roundedSafeZonePreviewRadius } : undefined} /> : null}
                      {isRigidSignBuilder && !hasPlacedSignArtwork ? <div className="absolute inset-0 flex items-end justify-center pb-5"><span className="rounded-full border border-slate-300/80 bg-white/75 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 shadow-sm backdrop-blur">Rigid panel</span></div> : null}
                      {signSurfacePreviewUrl ? <img src={signSurfacePreviewUrl} alt="" className={`absolute inset-0 h-full w-full ${bannerArtworkFitState === 'stretch' ? 'object-fill' : !rawBannerAspectMismatch || signArtworkMatchesSize ? 'object-cover' : 'object-contain'}`} /> : null}
                      {isRigidSignBuilder && signWidth > 0 && signHeight > 0 ? <div className="pointer-events-none absolute z-20 border border-dashed border-[#93c5fd] shadow-[0_0_0_1px_rgba(15,23,42,0.18),0_0_18px_rgba(56,189,248,0.22)]" style={{ left: `${rigidSafeZoneInsetX}%`, right: `${rigidSafeZoneInsetX}%`, top: `${rigidSafeZoneInsetY}%`, bottom: `${rigidSafeZoneInsetY}%`, borderRadius: roundedSafeZonePreviewRadius }} /> : null}
                      {supportsSizedRoundedCorners && selectedRoundedCornerRadius > 0 ? <span className="pointer-events-none absolute bottom-2 left-2 z-30 rounded-full border border-white/45 bg-[#071827]/80 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#b7ecff] shadow backdrop-blur">{selectedRoundedCornerOption.label} corners</span> : null}
                      {isTrueBannerBuilder ? <div className="absolute inset-1">{[0, 1, 2, 3, 4, 5].map((dot) => <span key={dot} className={`absolute h-2 w-2 rounded-full border border-slate-500 bg-white ${dot === 0 ? 'left-0 top-0' : dot === 1 ? 'right-0 top-0' : dot === 2 ? 'bottom-0 left-0' : dot === 3 ? 'bottom-0 right-0' : dot === 4 ? 'left-1/2 top-0 -translate-x-1/2' : 'bottom-0 left-1/2 -translate-x-1/2'}`} />)}</div> : null}
                    </div>
                    {isAutoSidedRigidBuilder && rigidBackArtwork ? <div className="absolute -bottom-16 left-0 z-20 inline-flex overflow-hidden rounded-full border border-[#38bdf8]/30 bg-[#06111d]/90 p-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#b7ecff] shadow-[0_0_24px_rgba(14,165,233,0.18)] backdrop-blur">
                      <button type="button" onClick={() => setRigidPreviewSide('front')} className={`rounded-full px-4 py-1.5 transition ${rigidPreviewSide === 'front' ? 'bg-[#1686c9] text-white' : 'hover:bg-[#0a2438] hover:text-white'}`}>Front</button>
                      <button type="button" onClick={() => setRigidPreviewSide('back')} className={`rounded-full px-4 py-1.5 transition ${rigidPreviewSide === 'back' ? 'bg-[#1686c9] text-white' : 'hover:bg-[#0a2438] hover:text-white'}`}>Back</button>
                    </div> : null}
                    {!hasPlacedSignArtwork ? <button type="button" onClick={openArtworkLibrary} className="relative z-10 rounded bg-[#1678b8] px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-[#0f5f94]">Upload artwork</button> : null}
                  </div>}
                </div> : hasPreviewImage && resolvedImageUrl ? <img src={resolvedImageUrl} alt={`${selectedPreview?.productName || 'Selected product'} ${selectedPreview?.colorName || ''}`} className="h-full w-full rounded-md object-contain" /> : <TshirtShape color={shirtColor} bodyPath={selectedProduct.mockups[shirtView]} view={shirtView} />}
                {productMode === 'apparel' && showPrintArtboard ? <div className="pointer-events-none absolute rounded-md border border-dashed border-[#1678b8]/60 bg-[#1678b8]/10 shadow-[0_0_0_9999px_rgba(255,255,255,0.04)]" style={{ top: `${artboardPercent.top}%`, left: `${artboardPercent.left}%`, width: `${artboardPercent.width}%`, height: `${artboardPercent.height}%` }}><span className="absolute -top-7 left-0 rounded bg-[#1678b8] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">{PRINT_AREA_CONFIG[printLocation].label}</span></div> : null}
                <div className={`designer-fabric-layer absolute ${isAutoSidedRigidBuilder && !isCoroBuilder && rigidPreviewSide === 'back' ? 'pointer-events-none opacity-0' : ''} ${productMode === 'signage' ? isCoroBuilder ? 'pointer-events-none left-1/2 top-1/2 w-[23%] min-w-56 max-w-[360px] -translate-x-1/2 -translate-y-1/2 opacity-0' : `left-1/2 top-1/2 ${isProductionBuilder && activeCoroOptionPanel === 'images' ? 'ml-[180px]' : ''} -translate-x-1/2 -translate-y-1/2` : 'inset-0'}`} style={productMode === 'signage' && !isCoroBuilder ? signPreviewBoxStyle : productMode === 'signage' ? { aspectRatio: signPreviewAspect } : undefined}><canvas ref={canvasElRef} className="h-full w-full touch-none" /></div>
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
              {isProductionBuilder && activeCoroOptionPanel === null ? <button type="button" onClick={() => setActiveCoroOptionPanel('images')} className="hue-mobile-show-artwork absolute bottom-[76px] left-3 z-30 rounded-xl border border-[#38bdf8]/45 bg-[#0c2a40]/95 px-4 py-3 text-xs font-black uppercase tracking-wide text-[#a9ecff] shadow-[0_12px_30px_rgba(0,0,0,0.35)]">+ Show artwork options</button> : null}
              {isProductionBuilder && !isCoroBuilder && !isBannerBuilder && activeCoroOptionPanel === 'images' ? <aside className="hue-artwork-panel hue-mobile-artwork-panel absolute bottom-20 left-4 top-20 z-20 w-[min(360px,calc(100vw-2rem))] overflow-y-auto rounded-[22px] border border-white/10 bg-[#07111f] p-3 text-slate-950 shadow-[0_28px_90px_rgba(0,0,0,0.58),0_0_50px_rgba(14,165,233,0.18)]">
                <div className="hue-artwork-header mb-3 overflow-hidden rounded-2xl border border-[#38bdf8]/20 bg-[#081827] px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <div className="flex items-center gap-3">
                    <span className="hue-artwork-mark flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-black/30"><img src="/brand/hue-graphics-mark.png" alt="" className="h-full w-full object-cover" /></span>
                    <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#67d8ff]">Order Builder</p><p className="mt-0.5 text-[17px] font-black tracking-tight text-white">Artwork Setup</p></div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-300">Build and review every print-ready artwork set.</p>
                </div>
                <div className={`hue-artwork-card rounded-2xl border p-4 ${signArtworkPreviewUrl || layers.length > 0 ? 'hue-artwork-card--ready border-emerald-300/45 bg-[#f1fff8]' : 'hue-artwork-card--warning border-amber-300/45 bg-[#fffaf0]'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Artwork set 01</p>
                      <h3 className={`mt-1 text-lg font-black leading-tight ${signArtworkPreviewUrl || layers.length > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{signArtworkPreviewUrl || layers.length > 0 ? 'Artwork loaded' : "Let's add your artwork"}</h3>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-700">
                        {selectedSignProduct.fields.filter((field) => ['width', 'height', 'quantity'].includes(field.name)).map((field) => <label key={field.name}>{field.name === 'quantity' ? 'qty' : field.name}<input type="number" min={field.name === 'quantity' ? 1 : 0} step={field.step} value={String(signValues[field.name] ?? field.defaultValue ?? '')} onChange={(event) => updateSignOption(field.name, event.target.value)} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>)}
                      </div>
                    </div>
                    <button type="button" onClick={clearSignArtwork} disabled={!signArtworkPreviewUrl && layers.length === 0} className="hue-artwork-delete rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-45">Remove</button>
                  </div>
                  <button type="button" onClick={() => { setImageLibraryStatus(`Choose finished artwork for ${selectedSignProduct.name}, or upload a new file from Image Zone.`); openArtworkLibrary(); }} className="hue-artwork-dropzone group mt-3 flex min-h-36 w-full cursor-pointer items-center justify-center rounded-xl border border-dashed border-[#38bdf8]/55 bg-white p-4 text-center text-slate-500 hover:border-[#0ea5e9] hover:text-[#0f5f94]">
                    {signArtworkPreviewUrl ? <span className="w-full"><img src={signArtworkPreviewUrl} alt="" className="mx-auto max-h-24 max-w-full object-contain" /><span className="mt-2 block text-xs font-black text-slate-800">Current artwork</span><span className="mt-1 block text-[10px] text-slate-400">Click to replace</span></span> : <span><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#e8f7ff] text-[#1678b8] transition group-hover:-translate-y-0.5 group-hover:bg-[#d7f2ff]"><svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-2"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg></span><span className="mt-3 block text-xs font-black text-slate-800">Upload front artwork</span><span className="mt-1 block text-[10px] leading-4 text-slate-400">Choose a file or select from your library</span></span>}
                  </button>
                  <div className="mt-3 text-xs"><button type="button" className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-slate-400">Contour Cut</button></div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => requestArtworkUpload(`Choose finished artwork for ${selectedSignProduct.name}.`)} className="hue-artwork-primary cursor-pointer rounded-xl bg-[#1686c9] px-3 py-3 text-center text-xs font-black text-white shadow-[0_10px_24px_rgba(14,165,233,0.18)] hover:bg-[#0f6da8]">Upload file</button><button type="button" onClick={() => setShowImageZone(true)} className="hue-artwork-secondary rounded-xl border border-white/15 bg-white/[0.06] px-3 py-3 text-xs font-black text-slate-100 hover:border-[#38bdf8]/50 hover:bg-white/[0.1]">Open Image Zone</button></div>
                {imageLibraryStatus ? <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.05] p-3 text-xs leading-5 text-slate-300">{isImageLibraryLoading ? 'Loading library... ' : ''}{imageLibraryStatus}</p> : null}
                <div className="hue-library-queue mt-5 border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Session library</p><span className="rounded-full bg-[#0ea5e9]/15 px-2 py-0.5 text-xs font-bold text-[#8be3ff]">{imageZoneItems.length}</span></div>
                  <div className="mt-2 max-h-60 space-y-2 overflow-y-auto pr-1">{imageZoneItems.length === 0 ? <p className="rounded-xl border border-dashed border-white/15 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">Artwork saved during this session will appear here.</p> : imageZoneItems.map((item) => <button key={item.id} type="button" onClick={async () => { await useImageZoneItem(item); }} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 text-left text-xs transition hover:border-[#38bdf8]">{hasImageZoneThumbnail(item) ? <img src={item.dataUrl} alt="" className="h-12 w-16 shrink-0 rounded border border-slate-200 object-contain" /> : <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[10px] font-black text-slate-500">{item.source === 'archive' ? 'RESTORE' : 'PDF'}</span>}<span className="min-w-0 flex-1"><span className="block truncate font-bold text-slate-800">{item.name}</span><span className="mt-1 block text-slate-500">{formatArtworkInches(item.width, item.height, item.signWidth, item.signHeight)}</span></span><span className="rounded bg-[#1678b8] px-2 py-1 font-black uppercase text-white">Use</span></button>)}</div>
                </div>
                <button type="button" onClick={() => setActiveCoroOptionPanel(null)} className="mt-4 w-full rounded-xl border border-white/10 bg-transparent px-3 py-2.5 text-xs font-bold text-slate-400 hover:border-white/20 hover:bg-white/[0.04] hover:text-white">View Production Canvas</button>
              </aside> : null}
              {isBannerBuilder && !isCoroBuilder && activeCoroOptionPanel === 'images' ? <aside className="hue-artwork-panel hue-mobile-artwork-panel absolute bottom-20 left-4 top-20 z-20 w-[min(360px,calc(100vw-2rem))] overflow-y-auto rounded-[22px] border border-white/10 bg-[#07111f] p-3 text-slate-950 shadow-[0_28px_90px_rgba(0,0,0,0.58),0_0_50px_rgba(14,165,233,0.18)]">
                <div className="hue-artwork-header mb-3 overflow-hidden rounded-2xl border border-[#38bdf8]/20 bg-[#081827] px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <div className="flex items-center gap-3"><span className="hue-artwork-mark flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-black/30"><img src="/brand/hue-graphics-mark.png" alt="" className="h-full w-full object-cover" /></span><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#67d8ff]">Order Builder</p><p className="mt-0.5 text-[17px] font-black tracking-tight text-white">Artwork Setup</p></div></div>
                  <p className="mt-3 text-xs leading-5 text-slate-300">Build and review every print-ready artwork set.</p>
                </div>
                {savedBannerItemsBeforeActive.length > 0 ? <div className="mb-3 space-y-3">
                  {savedBannerItemsBeforeActive.map((item, index) => renderSavedBannerArtworkCard(item, index))}
                </div> : null}
                <div className={`hue-artwork-card rounded-2xl border p-4 ring-2 ring-[#38bdf8] ring-offset-2 ring-offset-[#07111f] ${signArtworkStatusOk && !bannerAspectMismatch ? 'hue-artwork-card--ready border-emerald-300/45 bg-[#f1fff8]' : 'hue-artwork-card--warning border-amber-300/45 bg-[#fffaf0]'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Artwork set {formatArtworkSetNumber(activeBannerSetNumber)} selected</p><h3 className={`mt-1 text-lg font-black leading-tight ${signArtworkStatusOk && !bannerAspectMismatch ? 'text-emerald-700' : 'text-amber-700'}`}>{signArtworkPreviewUrl ? missingSeparateBackArtwork ? 'Needs back artwork' : bannerAspectMismatch ? 'Needs a fit check' : 'Print ready' : "Let's add your artwork"}</h3>
                      <div className="mt-2 grid grid-cols-[1fr_1fr_64px] gap-2 text-xs text-slate-700">
                        <label>width<input type="number" min={1} step="0.25" value={String(signValues.width ?? signWidth)} onChange={(event) => updateSignOption('width', event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                        <label>height<input type="number" min={1} step="0.25" value={String(signValues.height ?? signHeight)} onChange={(event) => updateSignOption('height', event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                        <label>qty<input type="number" min={1} step={1} value={String(signValues.quantity ?? designerQuantity)} onChange={(event) => updateSignOption('quantity', event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                      </div>
                      <button type="button" role="switch" aria-checked={lockSignProportions} onClick={() => setLockSignProportions((locked) => !locked)} className={`mt-2 flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-[10px] font-bold transition ${lockSignProportions ? 'border-[#38bdf8]/45 bg-[#eaf7ff] text-[#0f5f94]' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                        <span className="flex items-center gap-2"><span className={`flex h-5 w-5 items-center justify-center rounded-full ${lockSignProportions ? 'bg-[#1678b8] text-white' : 'bg-slate-100 text-slate-500'}`}><svg viewBox="0 0 24 24" aria-hidden="true" className="h-3 w-3 fill-none stroke-current stroke-2.2"><path d="M9.5 14.5 14.5 9.5" /><path d="m7 17-1.5 1.5a3.54 3.54 0 0 1-5-5L4 10a3.54 3.54 0 0 1 5 0" /><path d="m17 7 1.5-1.5a3.54 3.54 0 0 1 5 5L20 14a3.54 3.54 0 0 1-5 0" /></svg></span>Lock proportions</span>
                        <span className="uppercase tracking-wide">{lockSignProportions ? 'On' : 'Off'}</span>
                      </button>
                    </div>
                    <button type="button" onClick={deleteCurrentBannerArtworkSet} disabled={!signArtworkPreviewUrl && layers.length === 0 && bannerOrderItems.length === 0} className="rounded border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45">delete</button>
                  </div>
                  <div className={`mt-3 ${showSeparateBackArtworkControl && String(signValues.sides || 'single') === 'double' ? 'grid grid-cols-2 items-stretch gap-2' : ''}`}>
                  <button type="button" onClick={() => { if (isAutoSidedRigidBuilder) setRigidArtworkTarget('front'); openArtworkLibrary(); }} className="hue-artwork-dropzone flex min-h-36 w-full items-center justify-center rounded-xl border border-dashed border-[#38bdf8]/55 bg-white p-3 text-center text-[10px] uppercase text-slate-400 hover:border-[#1678b8] hover:text-[#1678b8]">
                    {signArtworkPreviewUrl ? <span className="w-full">
                      <img src={signArtworkPreviewUrl} alt="" className="mx-auto max-h-24 max-w-full object-contain" />
                      <span className="mt-2 block font-bold text-slate-600">Front image</span>
                      <span className="mt-1 block text-slate-500">{bannerArtworkActualSize ? `Actual: ${bannerArtworkActualSize.width.toFixed(2)}" x ${bannerArtworkActualSize.height.toFixed(2)}"` : 'Artwork uploaded'}</span>
                    </span> : <span>Click here to upload or select image</span>}
                  </button>
                  {showSeparateBackArtworkControl ? <div className={`${String(signValues.sides || 'single') === 'double' ? '' : 'mt-2'} rounded-xl border border-slate-200 bg-white p-2`}>
                    {missingSeparateBackArtwork ? <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-black uppercase leading-4 text-amber-700">Double-sided selected — upload back artwork to continue.</p> : null}
                    <button type="button" onClick={() => { setRigidArtworkTarget('back'); setShowImageZone(true); setImageLibraryStatus(`Choose back artwork for this ${selectedSignProduct.name}.`); }} className={`hue-artwork-dropzone flex min-h-28 w-full items-center justify-center rounded-lg border border-dashed p-3 text-center text-[10px] uppercase ${rigidBackArtwork ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-[#38bdf8]/45 bg-slate-50 text-slate-400 hover:border-[#1678b8] hover:text-[#1678b8]'}`}>
                      {rigidBackArtwork ? <span className="w-full"><img src={rigidBackArtwork.dataUrl} alt="" className="mx-auto max-h-20 max-w-full object-contain" /><span className="mt-2 block font-bold">Back image</span><span className="mt-1 block normal-case text-slate-500">Double-sided pricing active</span></span> : <span><span className="block text-sm font-black text-[#1678b8]">+ Add back artwork</span><span className="mt-1 block normal-case text-slate-500">Adding a back automatically switches pricing to double-sided.</span></span>}
                    </button>
                    {signArtworkPreviewUrl && String(signValues.sides || 'single') === 'double' ? <button type="button" onClick={() => { void copyRigidFrontToBack(); }} className="mt-2 w-full rounded-lg border border-[#1678b8]/30 bg-[#eaf7ff] px-3 py-2 text-[10px] font-black uppercase tracking-[0.04em] text-[#0f5f94] hover:border-[#1678b8] hover:bg-[#dff2ff]">Use front artwork for back</button> : null}
                    {rigidBackArtwork ? <button type="button" onClick={removeRigidBackArtwork} className="mt-2 w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-black uppercase text-red-600 hover:bg-red-100">Remove back artwork</button> : null}
                  </div> : null}
                  </div>
                  {signArtworkPreviewUrl ? <button type="button" onClick={() => { void openCurrentOrderArtworkEditor(); }} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-[#38bdf8]/35 bg-[#08243a] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#9be8ff] shadow-[0_8px_20px_rgba(14,165,233,0.12)] transition hover:border-[#67d8ff]/70 hover:bg-[#0c304c] hover:text-white"><svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current stroke-2"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>Edit {isAutoSidedRigidBuilder && rigidPreviewSide === 'back' && rigidBackArtwork ? 'back' : 'front'} in Hue Designer</button> : null}
                  {bannerAspectMismatch ? <p className="mt-2 rounded bg-red-600 px-2 py-2 text-center text-[10px] font-bold leading-4 text-white">Custom size differs from the artwork ratio. Use Center to preserve the artwork proportionally, or Fit to fill {signWidth}&quot; x {signHeight}&quot;.</p> : null}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <button type="button" aria-pressed={bannerArtworkFitState === 'fit'} onClick={() => fitSelectedArtwork('contain')} disabled={!activeObject && !signArtworkPreviewUrl} className={`rounded border px-2 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-40 ${bannerArtworkFitState === 'fit' ? 'border-[#1678b8] bg-[#1678b8] text-white hover:bg-[#0f5f94]' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>Fit</button>
                    <button type="button" onClick={centerSelectedArtwork} disabled={!activeObject} className="rounded border border-[#1678b8] bg-white px-2 py-2 font-bold text-[#1678b8] hover:bg-[#eaf5fb] disabled:cursor-not-allowed disabled:opacity-40">Center</button>
                    <button type="button" aria-pressed={bannerArtworkFitState === 'stretch'} onClick={() => fitSelectedArtwork('stretch')} disabled={!activeObject && !signArtworkPreviewUrl} className={`rounded border px-2 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-40 ${bannerArtworkFitState === 'stretch' ? 'border-[#1678b8] bg-[#1678b8] text-white hover:bg-[#0f5f94]' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>Stretch</button>
                    <button type="button" onClick={openArtworkLibrary} className="rounded border border-slate-300 bg-white px-2 py-2 font-medium hover:bg-slate-50">Image Zone</button>
                  </div>
                </div>
                {savedBannerItemsAfterActive.length > 0 ? <div className="mt-3 space-y-3">
                  {savedBannerItemsAfterActive.map((item, index) => renderSavedBannerArtworkCard(item, savedBannerItemsBeforeActive.length + index + 1))}
                </div> : null}
                <button type="button" onClick={startAddBannerItem} className="hue-add-artwork mt-3 flex h-20 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#38bdf8]/40 bg-white/[0.04] text-sm font-black text-[#8be3ff] hover:border-[#38bdf8]/80 hover:bg-[#0ea5e9]/10"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0ea5e9]/15 text-lg leading-none">+</span>Add another set</button>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { if (requestAcrylicArtworkNotice('upload')) return; requestArtworkUpload('Choose finished banner artwork.'); }} className="hue-artwork-primary cursor-pointer rounded-xl bg-[#1686c9] px-3 py-3 text-center text-xs font-black text-white shadow-[0_10px_24px_rgba(14,165,233,0.18)] hover:bg-[#0f6da8]">Upload file</button>
                  <button type="button" onClick={openArtworkLibrary} className="hue-artwork-secondary rounded-xl border border-white/15 bg-white/[0.06] px-3 py-3 text-xs font-black text-slate-100 hover:border-[#38bdf8]/50 hover:bg-white/[0.1]">Open Image Zone</button>
                </div>
                {imageLibraryStatus ? <p className="mt-3 rounded border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">{imageLibraryStatus}</p> : null}
                <div className="hue-library-queue mt-5 border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Session library</p><span className="rounded-full bg-[#0ea5e9]/15 px-2 py-0.5 text-xs font-bold text-[#8be3ff]">{imageZoneItems.length}</span></div>
                  <div className="mt-2 max-h-60 space-y-2 overflow-y-auto pr-1">{imageZoneItems.length === 0 ? <p className="rounded-xl border border-dashed border-white/15 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">Artwork saved during this session will appear here.</p> : imageZoneItems.map((item) => <button key={item.id} type="button" onClick={async () => { await useImageZoneItem(item); }} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 text-left text-xs transition hover:border-[#38bdf8]">{hasImageZoneThumbnail(item) ? <img src={item.dataUrl} alt="" className="h-12 w-16 shrink-0 rounded border border-slate-200 object-contain" /> : <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[10px] font-black text-slate-500">{item.source === 'archive' ? 'RESTORE' : 'PDF'}</span>}<span className="min-w-0 flex-1"><span className="block truncate font-bold text-slate-800">{item.name}</span><span className="mt-1 block text-slate-500">{formatArtworkInches(item.width, item.height, item.signWidth, item.signHeight)}</span></span><span className="rounded bg-[#1678b8] px-2 py-1 font-black uppercase text-white">Use</span></button>)}</div>
                </div>
                <button type="button" onClick={() => setActiveCoroOptionPanel(null)} className="mt-4 w-full rounded-xl border border-white/10 bg-transparent px-3 py-2.5 text-xs font-bold text-slate-400 hover:border-white/20 hover:bg-white/[0.04] hover:text-white">View Production Canvas</button>
              </aside> : null}
              {isCoroBuilder && activeCoroOptionPanel === 'images' ? <aside className="hue-artwork-panel hue-mobile-artwork-panel absolute bottom-20 left-4 top-20 z-20 w-[min(360px,calc(100vw-2rem))] overflow-y-auto rounded-[22px] border border-white/10 bg-[#07111f] p-3 text-slate-950 shadow-[0_28px_90px_rgba(0,0,0,0.58),0_0_50px_rgba(14,165,233,0.18)]">
                <div className="hue-artwork-header mb-3 overflow-hidden rounded-2xl border border-[#38bdf8]/20 bg-[#081827] px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <div className="flex items-center gap-3">
                    <span className="hue-artwork-mark flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-black/30"><img src="/brand/hue-graphics-mark.png" alt="" className="h-full w-full object-cover" /></span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#67d8ff]">Hue Graphics</p>
                      <p className="mt-0.5 text-[17px] font-black tracking-tight text-white">Artwork Setup</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-300">Build and review every print-ready artwork set.</p>
                </div>
                {coroSheetArtworkItems.length > 0 ? <div className="space-y-3">
                  {coroSheetArtworkItems.map((item, index) => {
                    const itemQuantity = Math.max(1, Number(coroArtworkQuantities[item.id] || 1));
                    const itemSignWidth = isCustomCoro ? Number(item.signWidth || signWidth || 0) : signWidth;
                    const itemSignHeight = isCustomCoro ? Number(item.signHeight || signHeight || 0) : signHeight;
                    const frontActualSize = getArtworkSourcePrintSize(item.width, item.height, item.dpi, item.sourceSignWidth, item.sourceSignHeight) || getFittedArtworkSize(item.width, item.height, itemSignWidth, itemSignHeight);
                    const backActualSize = getArtworkSourcePrintSize(item.backWidth, item.backHeight, item.dpi) || getFittedArtworkSize(item.backWidth, item.backHeight, itemSignWidth, itemSignHeight);
                    const frontSizeMatchesTarget = artworkPrintSizeMatchesTarget(item.width, item.height, itemSignWidth, itemSignHeight, item.dpi, item.sourceSignWidth, item.sourceSignHeight);
                    const backSizeMatchesTarget = item.backDataUrl ? artworkPrintSizeMatchesTarget(item.backWidth, item.backHeight, itemSignWidth, itemSignHeight, item.dpi) : false;
                    const rawFrontMismatch = aspectRatioMismatch(item.width, item.height, itemSignWidth, itemSignHeight);
                    const rawBackMismatch = hasCoroDoubleSided && item.backDataUrl ? aspectRatioMismatch(item.backWidth, item.backHeight, itemSignWidth, itemSignHeight) : false;
                    const frontMismatch = rawFrontMismatch && item.frontFitState !== 'fit' && item.frontFitState !== 'stretch';
                    const backMismatch = rawBackMismatch && item.backFitState !== 'fit' && item.backFitState !== 'stretch';
                    const showCoroFitControls = !frontSizeMatchesTarget || (Boolean(item.backDataUrl) && !backSizeMatchesTarget);
                    const itemNeedsCheck = frontMismatch || backMismatch || (hasCoroDoubleSided && !item.backDataUrl);
                    const itemFirstCellIndex = coroSheetCells.findIndex((cell) => cell.id === item.id);
                    const customItemSheetIndex = customCoroSheetPreviews.findIndex((sheet) => sheet.cells.some((cell) => cell.item.id === item.id));
                    const itemSheetIndex = isCustomCoro && customItemSheetIndex >= 0 ? customItemSheetIndex : itemFirstCellIndex >= 0 ? Math.floor(itemFirstCellIndex / coroSheetLayout.signsPerSheet) : 0;
                    return <div key={item.id} onClick={(event) => { const target = event.target as HTMLElement; if (target.closest('button,input,select,textarea,label,a')) return; setActiveCoroSheetIndex(itemSheetIndex); }} className={`hue-artwork-card cursor-pointer rounded-2xl border p-4 ${itemNeedsCheck ? 'hue-artwork-card--warning border-amber-300/45 bg-[#fffaf0]' : 'hue-artwork-card--ready border-emerald-300/45 bg-[#f1fff8]'} ${itemSheetIndex === activeCoroSheetIndex ? 'ring-2 ring-[#38bdf8] ring-offset-2 ring-offset-[#07111f]' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Artwork set {String(index + 1).padStart(2, '0')}</p>
                          <h3 className={`mt-1 text-lg font-black leading-tight ${itemNeedsCheck ? 'text-amber-700' : 'text-emerald-700'}`}>{itemNeedsCheck ? hasCoroDoubleSided && !item.backDataUrl ? 'Needs back artwork' : 'Needs a fit check' : 'Print ready'}</h3>
                          {isCustomCoro ? <div className="mt-2 space-y-2 text-xs text-slate-700">
                            <div className="grid grid-cols-[1fr_1fr_54px] gap-2">
                              <label>width<input type="number" min={0} step="0.25" value={String(itemSignWidth)} onChange={(event) => updateCoroArtworkSize(item.id, 'signWidth', event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                              <label>height<input type="number" min={0} step="0.25" value={String(itemSignHeight)} onChange={(event) => updateCoroArtworkSize(item.id, 'signHeight', event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                              <label>qty<input type="number" min={1} step={1} value={String(itemQuantity)} onChange={(event) => updateCoroArtworkQuantity(item.id, event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                            </div>
                            {selectedSignProduct.id === 'yard-sign' ? <div>
                              <span className="font-bold">Flute Direction:</span>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {[{ label: 'Auto', value: 'auto' }, { label: 'Horizontal', value: 'horizontal' }, { label: 'Vertical', value: 'vertical' }].map((option) => <label key={option.value} className="flex items-center gap-1"><input type="radio" name={`coro-flute-direction-${item.id}`} checked={String(item.fluteDirection || 'auto') === option.value} onChange={() => updateCoroArtworkFlute(item.id, option.value)} />{option.label}</label>)}
                              </div>
                            </div> : null}
                          </div> : <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-700">
                            <span>width: <span className="font-bold">{itemSignWidth || 0}</span>&quot;</span>
                            <span>height: <span className="font-bold">{itemSignHeight || 0}</span>&quot;</span>
                            <label className="flex items-center gap-1">qty:
                              <input type="number" min={1} step={1} value={String(itemQuantity)} onChange={(event) => updateCoroArtworkQuantity(item.id, event.target.value)} className="h-6 w-14 rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" />
                            </label>
                          </p>}
                        </div>
                        <button type="button" onClick={() => removeCoroArtworkItem(item.id)} className="hue-artwork-delete rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600">Remove</button>
                      </div>
                      <div className={`mt-3 grid gap-2 ${hasCoroDoubleSided ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <button type="button" onClick={() => chooseCoroSideImage(item.id, 'front')} className={`hue-artwork-dropzone flex min-h-32 w-full items-center justify-center rounded-xl border bg-white p-3 text-center text-[10px] uppercase hover:border-[#0ea5e9] hover:text-[#1678b8] ${frontMismatch ? 'border-amber-500 text-amber-600' : 'border-slate-200 text-slate-400'}`}>
                          <span className="w-full">
                            <img src={item.dataUrl} alt="" className={`mx-auto max-h-20 max-w-full ${item.frontFitState === 'stretch' ? 'object-fill' : 'object-contain'}`} />
                            <span className="mt-2 block font-bold text-slate-600">Front image</span>
                            <span className="mt-1 block text-slate-500">Actual: {frontActualSize.width.toFixed(2)}&quot; x {frontActualSize.height.toFixed(2)}&quot;</span>
                          </span>
                        </button>
                        {hasCoroDoubleSided ? <button type="button" onClick={() => chooseCoroSideImage(item.id, 'back')} className={`hue-artwork-dropzone flex min-h-32 w-full items-center justify-center rounded-xl border bg-white p-3 text-center text-[10px] uppercase hover:border-[#0ea5e9] hover:text-[#1678b8] ${!item.backDataUrl || backMismatch ? 'border-amber-500 text-amber-600' : 'border-slate-200 text-slate-400'}`}>
                          <span className="w-full">
                            {item.backDataUrl ? <img src={item.backDataUrl} alt="" className={`mx-auto max-h-20 max-w-full ${item.backFitState === 'stretch' ? 'object-fill' : 'object-contain'}`} /> : <span className="mx-auto flex h-20 max-w-full items-center justify-center bg-[repeating-linear-gradient(90deg,#f8fafc_0,#f8fafc_6px,#e2e8f0_6px,#e2e8f0_7px)] px-2 text-slate-400">Click here to select back image</span>}
                            <span className="mt-2 block font-bold text-slate-600">Back image</span>
                            <span className="mt-1 block text-slate-500">{item.backDataUrl ? `Actual: ${backActualSize.width.toFixed(2)}" x ${backActualSize.height.toFixed(2)}"` : 'No image selected'}</span>
                          </span>
                        </button> : null}
                      </div>
                      {hasCoroDoubleSided ? <button type="button" onClick={() => copyCoroFrontToBack(item.id)} className="mt-2 w-full rounded border border-[#1678b8]/30 bg-white px-2 py-2 text-xs font-bold text-[#1678b8] hover:bg-[#eaf5fb]">Use Front Artwork for Back</button> : null}
                      <p className="mt-2 text-center text-[10px] font-bold text-slate-600">Starts on sheet #{itemSheetIndex + 1}</p>
                      {frontMismatch || backMismatch ? <p className="mt-2 rounded bg-red-600 px-2 py-2 text-center text-[10px] font-bold leading-4 text-white">Aspect ratio mismatch. Fit will fill {itemSignWidth}&quot; x {itemSignHeight}&quot;. Center will keep the artwork proportional and leave blank space if needed.</p> : null}
                      <div className="mt-3 text-xs">
                        <button type="button" className="w-full rounded border border-slate-300 bg-white px-2 py-2 text-slate-400">Contour Cut</button>
                      </div>
                      <div className={`mt-3 grid gap-2 text-xs ${showCoroFitControls ? 'grid-cols-3' : 'grid-cols-1'}`}>
                        {showCoroFitControls ? <button type="button" aria-pressed={item.frontFitState === 'stretch'} onClick={() => resolveCoroArtworkFit(item.id, 'stretch')} className={`rounded border px-2 py-2 font-bold ${item.frontFitState === 'stretch' ? 'border-[#1678b8] bg-[#1678b8] text-white hover:bg-[#0f5f94]' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>Fit</button> : null}
                        {showCoroFitControls ? <button type="button" aria-pressed={item.frontFitState === 'fit'} onClick={() => resolveCoroArtworkFit(item.id, 'fit')} className={`rounded border px-2 py-2 font-bold ${item.frontFitState === 'fit' ? 'border-[#1678b8] bg-[#1678b8] text-white hover:bg-[#0f5f94]' : 'border-[#1678b8] bg-white text-[#1678b8] hover:bg-[#eaf5fb]'}`}>Center</button> : null}
                        <button type="button" onClick={() => setShowImageZone(true)} className="rounded border border-slate-300 bg-white px-2 py-2 font-medium hover:bg-slate-50">Image Zone</button>
                      </div>
                    </div>;
                  })}
                </div> : <div className="hue-artwork-card hue-artwork-card--warning rounded-2xl border border-amber-300/45 bg-[#fffaf0] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Artwork set 01</p>
                      <h3 className="mt-1 text-lg font-black leading-tight text-amber-700">Let's add your artwork</h3>
                      {isCustomCoro ? <div className="mt-2 space-y-2 text-xs text-slate-700">
                        <div className="grid grid-cols-[1fr_1fr_54px] gap-2">
                          <label>width<input type="number" min={0} step="0.25" value={String(signValues.width ?? 0)} onChange={(event) => updateSignOption('width', event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                          <label>height<input type="number" min={0} step="0.25" value={String(signValues.height ?? 0)} onChange={(event) => updateSignOption('height', event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                          <label>qty<input type="number" min={1} step={1} value={String(signValues.quantity ?? designerQuantity)} onChange={(event) => updateSignOption('quantity', event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" /></label>
                        </div>
                        {selectedSignProduct.id === 'yard-sign' ? <div>
                          <span className="font-bold">Flute Direction:</span>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {[{ label: 'Auto', value: 'auto' }, { label: 'Horizontal', value: 'horizontal' }, { label: 'Vertical', value: 'vertical' }].map((option) => <label key={option.value} className="flex items-center gap-1"><input type="radio" name="coro-flute-direction-new" checked={String(signValues.fluteDirection || 'auto') === option.value} onChange={() => updateSignOption('fluteDirection', option.value)} />{option.label}</label>)}
                          </div>
                        </div> : null}
                      </div> : <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-700">
                        <span>width: <span className="font-bold">{signWidth || 0}</span>&quot;</span>
                        <span>height: <span className="font-bold">{signHeight || 0}</span>&quot;</span>
                        <label className="flex items-center gap-1">qty:
                          <input type="number" min={1} step={1} value={String(signValues.quantity ?? designerQuantity)} onChange={(event) => updateSignOption('quantity', event.target.value)} className="h-6 w-14 rounded border border-slate-300 bg-white px-1 text-right text-xs font-bold text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" />
                        </label>
                      </p>}
                    </div>
                    <button type="button" onClick={clearSignArtwork} disabled={!signArtworkPreviewUrl && layers.length === 0} className="hue-artwork-delete rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-45">Remove</button>
                  </div>
                  <div className={`mt-3 grid gap-2 ${hasCoroDoubleSided ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <button type="button" onClick={() => { setCoroPlacementTarget({ itemId: null, side: 'front' }); setImageLibraryStatus('Choose front artwork, or upload a new file from Image Zone.'); openArtworkLibrary(); }} className="hue-artwork-dropzone group flex min-h-36 w-full cursor-pointer items-center justify-center rounded-xl border border-dashed border-[#38bdf8]/55 bg-white p-4 text-center text-slate-500 hover:border-[#0ea5e9] hover:text-[#0f5f94]">
                      <span><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#e8f7ff] text-[#1678b8] transition group-hover:-translate-y-0.5 group-hover:bg-[#d7f2ff]"><svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-2"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg></span><span className="mt-3 block text-xs font-black text-slate-800">Upload front artwork</span><span className="mt-1 block text-[10px] leading-4 text-slate-400">Choose a file or select from your library</span></span>
                    </button>
                    {hasCoroDoubleSided ? <button type="button" onClick={() => setImageLibraryStatus('Add the front image first, then choose or copy the back image.')} className="hue-artwork-dropzone flex min-h-36 w-full items-center justify-center rounded-xl border border-dashed border-amber-300 bg-white p-3 text-center text-[10px] font-bold uppercase text-amber-600 hover:border-[#1678b8] hover:text-[#1678b8]">Select back artwork</button> : null}
                  </div>
                  <div className="mt-3 text-xs">
                    <button type="button" className="w-full rounded border border-slate-300 bg-white px-2 py-2 text-slate-400">Contour Cut</button>
                  </div>
                </div>}
                <button type="button" onClick={startAddCoroSign} className="hue-add-artwork mt-3 flex h-20 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#38bdf8]/40 bg-white/[0.04] text-sm font-black text-[#8be3ff] hover:border-[#38bdf8]/80 hover:bg-[#0ea5e9]/10"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0ea5e9]/15 text-lg leading-none">+</span>Add another set</button>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => requestArtworkUpload()} className="hue-artwork-primary cursor-pointer rounded-xl bg-[#1686c9] px-3 py-3 text-center text-xs font-black text-white shadow-[0_10px_24px_rgba(14,165,233,0.18)] hover:bg-[#0f6da8]">Upload file</button>
                  <button type="button" onClick={() => setShowImageZone(true)} className="hue-artwork-secondary rounded-xl border border-white/15 bg-white/[0.06] px-3 py-3 text-xs font-black text-slate-100 hover:border-[#38bdf8]/50 hover:bg-white/[0.1]">Open Image Zone</button>
                </div>
                {imageLibraryStatus ? <p className="mt-3 rounded border border-slate-200 bg-white p-2 text-xs leading-5 text-slate-600">{isImageLibraryLoading ? 'Loading library... ' : ''}{imageLibraryStatus}</p> : null}
                <div className="hue-library-queue mt-5 border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Session library</p>
                    <span className="rounded-full bg-[#0ea5e9]/15 px-2 py-0.5 text-xs font-bold text-[#8be3ff]">{imageZoneItems.length}</span>
                  </div>
                  <div className="mt-2 max-h-60 space-y-2 overflow-y-auto pr-1">
                    {imageZoneItems.length === 0 ? <p className="rounded-xl border border-dashed border-white/15 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">Artwork saved during this session will appear here.</p> : imageZoneItems.map((item) => {
                      const selected = selectedImageZoneId === item.id;
                      return <button key={item.id} type="button" onClick={async () => { await useImageZoneItem(item); }} className={`flex w-full items-center gap-3 rounded border bg-white p-2 text-left text-xs transition ${selected ? 'border-[#1678b8] ring-2 ring-[#1678b8]/20' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                        {hasImageZoneThumbnail(item) ? <img src={item.dataUrl} alt="" className="h-12 w-16 shrink-0 rounded border border-slate-200 object-contain" /> : <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[10px] font-black text-slate-500">{item.source === 'archive' ? 'RESTORE' : 'PDF'}</span>}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold text-slate-800">{item.name}</span>
<span className="mt-1 block text-slate-500">{formatArtworkInches(item.width, item.height, item.signWidth, item.signHeight)}</span>
                          <span className="mt-1 block text-slate-400">{item.source === 'archive' ? 'Hue Vault saved - restores when used' : item.source === 'supabase' ? 'Hue Library ready' : 'Session preview'}</span>
                        </span>
                        <span className="rounded bg-[#1678b8] px-2 py-1 font-black uppercase text-white">{item.source === 'archive' ? 'Restore' : 'Use'}</span>
                      </button>;
                    })}
                  </div>
                </div>
                <button type="button" onClick={() => setActiveCoroOptionPanel(null)} className="mt-4 w-full rounded-xl border border-white/10 bg-transparent px-3 py-2.5 text-xs font-bold text-slate-400 hover:border-white/20 hover:bg-white/[0.04] hover:text-white">View Production Canvas</button>
              </aside> : null}
              {isProductionBuilder && activeCoroOptionPanel && activeCoroOptionPanel !== 'images' ? <div className="absolute bottom-20 left-1/2 z-50 w-[min(760px,92vw)] -translate-x-1/2 rounded-lg border border-slate-600 bg-[#f8fafc] p-4 text-slate-950 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#1678b8]">{activeCoroOptionPanel === 'sides' ? 'Print Sides' : activeCoroOptionPanel === 'roundedCorners' ? 'Rounded Corners' : activeCoroOptionPanel}</p>
                    <h3 className="mt-1 text-lg font-black">{activeCoroOptionPanel === 'size' ? selectedSignProduct.id === 'vehicle-magnet' ? isCustomMagnet ? 'Custom Magnet Size' : 'Vehicle Magnet Size' : isCoroBuilder ? isCustomCoro ? `Custom ${selectedSignProduct.name} Sizes` : `Select ${selectedSignProduct.name} Size` : isBusinessCardBuilder ? 'Business Card Size' : isBannerBuilder ? `${selectedSignProduct.name} Size` : 'Select Size' : activeCoroOptionPanel === 'material' ? 'Select Material' : activeCoroOptionPanel === 'sides' ? 'Select Print Sides' : activeCoroOptionPanel === 'orientation' ? 'Select Card Orientation' : activeCoroOptionPanel === 'coating' ? 'Select Card Coating' : activeCoroOptionPanel === 'stakes' ? 'Step Stakes' : activeCoroOptionPanel === 'webbing' ? 'Mesh Webbing' : activeCoroOptionPanel === 'standoffs' ? 'Acrylic Standoffs' : activeCoroOptionPanel === 'roundedCorners' ? 'Rounded Corners' : 'Options'}</h3>
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
                {activeCoroOptionPanel === 'size' && isBannerBuilder && !isCoroBuilder && selectedSignProduct.id !== 'vehicle-magnet' ? <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Width inches<input type="number" min={1} step="0.25" value={String(signValues.width ?? signWidth)} onChange={(event) => updateSignOption('width', event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950" /></label>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Height inches<input type="number" min={1} step="0.25" value={String(signValues.height ?? signHeight)} onChange={(event) => updateSignOption('height', event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950" /></label>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Quantity<input type="number" min={1} step={1} value={String(signValues.quantity ?? designerQuantity)} onChange={(event) => updateSignOption('quantity', event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950" /></label>
                  <button type="button" role="switch" aria-checked={lockSignProportions} onClick={() => setLockSignProportions((locked) => !locked)} className={`flex items-center justify-between rounded border px-3 py-2 text-xs font-bold sm:col-span-3 ${lockSignProportions ? 'border-[#38bdf8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-300 bg-white text-slate-600'}`}><span>Lock artwork proportions</span><span className="uppercase">{lockSignProportions ? 'On' : 'Off'}</span></button>
                  <p className="rounded bg-[#eaf5fb] px-3 py-2 text-xs leading-5 text-[#0f5f94] sm:col-span-3">Uploading artwork can auto-fill a starting size for this {selectedSignProduct.name} from the file&apos;s print dimensions. You can override it here, then use Fit or Stretch in the Artwork panel.</p>
                </div> : null}
                {activeCoroOptionPanel === 'size' && isCoroBuilder ? <div className="mt-4 grid gap-4 lg:grid-cols-[240px_1fr]">
                  <div className="rounded border border-slate-200 bg-white p-3 text-center">
                    <p className="text-sm text-slate-700">Need mixed or custom sizes?</p>
                    <button type="button" onClick={switchCoroToCustomSize} className="mt-2 rounded bg-[#1678b8] px-4 py-2 text-sm font-black text-white hover:bg-[#0f5f94]">{isCustomCoro ? 'Custom On' : 'Use Custom Sizes'}</button>
                    {isCustomCoro ? <p className="mt-4 border-t border-slate-200 pt-4 text-left text-xs leading-5 text-slate-600">Enter width, height, and quantity in the Images panel. Each added artwork set can have its own size and the sheet will repack automatically.</p> : null}
                  </div>
                  <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                    {CORO_SIZE_OPTIONS.map((option) => {
                      const parsed = parseCoroSize(option.value);
                      const layout = getCoroSheetLayout(parsed.width, parsed.height, designerQuantity);
                      const selected = String(signValues.size || '') === option.value;
                      return <button key={option.value} type="button" onClick={() => { if (option.value === 'custom') switchCoroToCustomSize(); else updateSignOption('size', option.value); setActiveCoroOptionPanel(null); }} className={`rounded border px-3 py-3 text-left text-xs ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}><span className="block font-black">{option.label}</span><span className="mt-1 block text-slate-500">{option.value === 'custom' ? 'Mix sizes on each sheet' : `${layout.signsPerSheet} per sheet / ${layout.sheetCount} sheet${layout.sheetCount === 1 ? '' : 's'}`}</span></button>;
                    })}
                  </div>
                </div> : null}
                {false && activeCoroOptionPanel === 'size' && isCoroBuilder && selectedSignProduct.id !== 'yard-sign' ? <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Width inches<input type="number" min={1} step="0.25" value={String(signValues.width ?? signWidth)} onChange={(event) => updateSignOption('width', event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950" /></label>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Height inches<input type="number" min={1} step="0.25" value={String(signValues.height ?? signHeight)} onChange={(event) => updateSignOption('height', event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950" /></label>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Quantity<input type="number" min={1} step={1} value={String(signValues.quantity ?? designerQuantity)} onChange={(event) => updateSignOption('quantity', event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950" /></label>
                  <div className="rounded border border-[#9ec9df] bg-[#f3faff] px-4 py-3 text-xs leading-5 text-[#0f4262] sm:col-span-3"><span className="font-black">One 48&quot; × 96&quot; sheet minimum.</span> At this size, approximately <span className="font-black">{coroSheetLayout.signsPerSheet} pieces</span> fit per sheet. The Hue pricing API continues to calculate the exact total and per-piece price.</div>
                </div> : null}
                {activeCoroOptionPanel === 'material' ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(isBannerBuilder ? bannerMaterialOptions.map((option) => ({ value: option.value, label: option.label, note: String('note' in option ? option.note : 'Priced by Hue API'), disabled: false })) : productMaterialOptions.map((option) => ({ value: option.value, label: option.label, note: 'note' in option ? String((option as { note?: string }).note || '') : '', disabled: false }))).map((option) => {
                    const selected = String(signValues.material || '4mm') === option.value;
                    return <button key={option.value} type="button" disabled={option.disabled} onClick={() => { updateSignOption('material', option.value); setActiveCoroOptionPanel(null); }} className={`rounded border px-4 py-4 text-left ${option.disabled ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400' : selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}><span className="block text-base font-black">{option.label}</span>{option.note ? <span className={`mt-1 block text-xs ${option.disabled ? 'font-bold uppercase tracking-wide text-slate-500' : 'text-slate-500'}`}>{option.note}</span> : null}</button>;
                  })}
                </div> : null}
                {activeCoroOptionPanel === 'sides' ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[{ value: 'single', label: 'Single-Sided', note: 'Front side only' }, { value: 'double', label: 'Double-Sided', note: 'Front and back print' }].map((option) => {
                    const selected = String(signValues.sides || 'single') === option.value;
                    const note = option.value === 'double'
                      ? isTrueBannerBuilder
                        ? '18oz material with front and back setup'
                        : isAutoSidedRigidBuilder
                          ? 'Back artwork is required before checkout'
                          : option.note
                      : option.note;
                    return <button key={option.value} type="button" onClick={() => updatePrintSides(option.value)} className={`rounded border px-4 py-4 text-left ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}><span className="block text-base font-black">{option.label}</span><span className="mt-1 block text-xs text-slate-500">{note}</span></button>;
                  })}
                </div> : null}
                {activeCoroOptionPanel === 'stakes' ? <div className="mt-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    {['0', '10', '25', '50'].map((count) => {
                      const selected = String(signValues.stepStakes || '0') === count;
                      return <button key={count} type="button" onClick={() => { updateSignOption('stepStakes', count); setActiveCoroOptionPanel(null); }} className={`rounded border px-4 py-4 text-center ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}><span className="block text-lg font-black">{count}</span><span className="mt-1 block text-xs text-slate-500">stakes</span></button>;
                    })}
                  </div>
                  <div className="mt-3 flex flex-col gap-3 rounded border border-dashed border-[#9ec9df] bg-[#f3faff] p-3 sm:flex-row sm:items-end">
                    <label className="min-w-0 flex-1 text-xs font-bold uppercase tracking-wide text-[#0f5f94]">Custom quantity
                      <input type="number" min={0} step={1} inputMode="numeric" value={String(signValues.stepStakes ?? '0')} onChange={(event) => updateSignOption('stepStakes', event.target.value === '' ? '' : String(Math.max(0, Math.floor(Number(event.target.value) || 0))))} className="mt-1.5 h-10 w-full rounded border border-slate-300 bg-white px-3 text-base font-black text-slate-950 outline-none focus:border-[#1678b8] focus:ring-1 focus:ring-[#1678b8]" placeholder="Enter number of stakes" />
                    </label>
                    <button type="button" onClick={() => { if (String(signValues.stepStakes ?? '') === '') updateSignOption('stepStakes', '0'); setActiveCoroOptionPanel(null); }} className="h-10 rounded bg-[#1678b8] px-5 text-xs font-black uppercase tracking-wide text-white hover:bg-[#0f5f94]">Use quantity</button>
                  </div>
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
                {activeCoroOptionPanel === 'standoffs' ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[{ value: false, label: 'None', note: 'No mounting hardware' }, { value: true, label: '4 Silver Standoffs', note: 'One silver mount at each corner' }].map((option) => {
                    const selected = Boolean(signValues.standOffs) === option.value;
                    return <button key={option.label} type="button" onClick={() => { updateSignOption('standOffs', option.value); if (option.value) { updateSignOption('standOffQty', '4'); updateSignOption('standOffColor', 'silver'); } setActiveCoroOptionPanel(null); }} className={`rounded border px-4 py-4 text-left ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}><span className="block text-base font-black">{option.label}</span><span className="mt-1 block text-xs text-slate-500">{option.note}</span></button>;
                  })}
                </div> : null}
                {activeCoroOptionPanel === 'roundedCorners' ? <div className="mt-4 mx-auto grid max-w-md overflow-hidden rounded border border-slate-200 bg-white">
                  {(selectedSignProduct.id === 'acrylic' ? [{ label: 'None', value: false, note: 'Square finished corners' }, { label: 'Rounded Corners', value: true, note: '+$5 finishing option' }] : ROUNDED_CORNER_OPTIONS).map((option) => {
                    const selected = selectedSignProduct.id === 'acrylic' ? Boolean(signValues.roundedCorners) === option.value : String(signValues.roundedCorners || 'none') === option.value;
                    return <button key={String(option.value)} type="button" onClick={() => { updateSignOption('roundedCorners', option.value); setActiveCoroOptionPanel(null); }} className={`border-b border-slate-100 px-4 py-3 text-left text-sm last:border-b-0 ${selected ? 'bg-[#1678b8] font-black text-white' : 'text-slate-700 hover:bg-slate-50'}`}><span className="block font-black">{option.label}</span><span className={`mt-1 block text-xs ${selected ? 'text-blue-100' : 'text-slate-500'}`}>{option.note}</span></button>;
                  })}
                </div> : null}
                {activeCoroOptionPanel === 'orientation' ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[{ value: 'Landscape', label: 'Landscape', note: '3.5 inches wide × 2 inches high' }, { value: 'Portrait', label: 'Portrait', note: '2 inches wide × 3.5 inches high' }].map((option) => {
                    const selected = String(signValues.orientation || 'Landscape') === option.value;
                    return <button key={option.value} type="button" onClick={() => { updateSignOption('orientation', option.value); setActiveCoroOptionPanel(null); }} className={`rounded border px-4 py-4 text-left ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}><span className="block text-base font-black">{option.label}</span><span className="mt-1 block text-xs text-slate-500">{option.note}</span></button>;
                  })}
                </div> : null}
                {activeCoroOptionPanel === 'coating' ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[{ value: 'No Coating', label: 'No Coating', note: 'Standard business card finish' }, { value: 'Gloss Laminate', label: 'Gloss Laminate', note: 'Gloss laminated finish' }].map((option) => {
                    const selected = String(signValues.coating || 'No Coating') === option.value;
                    return <button key={option.value} type="button" onClick={() => { updateSignOption('coating', option.value); setActiveCoroOptionPanel(null); }} className={`rounded border px-4 py-4 text-left ${selected ? 'border-[#1678b8] bg-[#eaf5fb] text-[#0f5f94]' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}><span className="block text-base font-black">{option.label}</span><span className="mt-1 block text-xs text-slate-500">{option.note}</span></button>;
                  })}
                </div> : null}
              </div> : null}
              {isProductionBuilder ? <div className="hue-builder-zoom absolute bottom-6 left-8 z-20 flex items-center gap-3 text-xs text-slate-200">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/45 font-black shadow-[0_0_22px_rgba(14,165,233,0.18)]">N</div>
                <div className="flex h-8 items-center overflow-hidden rounded border border-white/15 bg-black/38 backdrop-blur">
                  <button type="button" onClick={() => { const next = Math.max(0.5, zoom - 0.1); setZoom(next); fabricCanvasRef.current?.setZoom(next); }} className="h-full px-3 text-slate-300 hover:bg-white/10">-</button>
                  <span className="border-x border-white/10 px-4 text-[#bce7ff]">{Math.round(zoom * 100)}%</span>
                  <button type="button" onClick={() => { const next = Math.min(2, zoom + 0.1); setZoom(next); fabricCanvasRef.current?.setZoom(next); }} className="h-full px-3 text-slate-300 hover:bg-white/10">+</button>
                </div>
              </div> : null}
              {productMode === 'signage' ? <div className={`hue-builder-option-bar absolute z-10 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase ${isProductionBuilder ? 'bottom-6 left-60 right-8 max-h-11 justify-end overflow-hidden' : 'inset-x-3 bottom-4 justify-center'}`}>
                {(selectedSignProduct.id === 'business-card'
                  ? [
                      ['Images', String(activeBannerSetNumber), signArtworkStatusOk],
                      ['Size', signSizeControlLabel, signWidth > 0 && signHeight > 0],
                      ['Orientation', String(signValues.orientation || 'Landscape'), true],
                      ['Coating', String(signValues.coating || 'No Coating'), true],
                      ['Print Sides', String(signValues.sides || 'single'), true]
                    ] as [string, string, boolean][]
                  : selectedSignProduct.id === 'acrylic'
                  ? [
                      ['Images', String(activeBannerSetNumber), signArtworkStatusOk],
                      ['Size', signSizeControlLabel, signWidth > 0 && signHeight > 0],
                      ['Standoffs', signValues.standOffs ? `${String(signValues.standOffQty || '4')} Silver` : 'None', Boolean(signValues.standOffs)],
                      ['Rounded Corners', signValues.roundedCorners ? 'Yes' : 'None', Boolean(signValues.roundedCorners)]
                    ] as [string, string, boolean][]
                  : selectedSignProduct.id === 'vehicle-magnet'
                  ? [
                      ['Images', String(activeBannerSetNumber), signArtworkStatusOk],
                      ['Size', signSizeControlLabel, signWidth > 0 && signHeight > 0],
                      ['Rounded Corners', selectedRoundedCornerOption.label, String(signValues.roundedCorners || 'none') !== 'none']
                    ] as [string, string, boolean][]
                  : [
                      ['Images', String(isCoroBuilder ? coroSheetArtworkItems.length || layers.length || 1 : isBannerBuilder ? activeBannerSetNumber : layers.length || 1), signArtworkStatusOk],
                      ['Size', signSizeControlLabel, signWidth > 0 && signHeight > 0],
                      ['Material', isBannerBuilder ? selectedBannerMaterial?.label || String(signValues.material || 'standard') : String(signValues.material || '4mm'), true],
                      ...(supportsDoubleSidedProduct ? [['Print Sides', String(signValues.sides || 'single'), true]] as [string, string, boolean][] : []),
                      ...(selectedSignProduct.id === 'yard-sign'
                        ? [
                            ['Grommets', signValues.grommets ? 'Yes' : 'No', Boolean(signValues.grommets)],
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
                                  ...(['acm', 'aluminum'].includes(selectedSignProduct.id) ? [['Rounded Corners', selectedRoundedCornerOption.label, selectedRoundedCornerRadius > 0]] : [])
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
              <div className="mt-3 text-xs">
                <button className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-400">Contour Cut</button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <button type="button" aria-pressed={bannerArtworkFitState === 'fit'} onClick={() => fitSelectedArtwork('contain')} className={`rounded border px-2 py-2 font-bold disabled:opacity-40 ${bannerArtworkFitState === 'fit' ? 'border-[#1678b8] bg-[#1678b8] text-white' : 'border-slate-300 bg-white text-slate-700'}`} disabled={!activeObject}>Fit Art</button>
                <button type="button" onClick={centerSelectedArtwork} className="rounded border border-[#1678b8] bg-white px-2 py-2 font-bold text-[#1678b8] disabled:opacity-40" disabled={!activeObject}>Center</button>
                <button type="button" onClick={() => fitSelectedArtwork('cover')} className="rounded border border-slate-300 bg-white px-2 py-2 font-medium disabled:opacity-40" disabled={!activeObject}>Fill Sign</button>
                <button type="button" aria-pressed={bannerArtworkFitState === 'stretch'} onClick={() => fitSelectedArtwork('stretch')} className={`rounded border px-2 py-2 font-bold disabled:opacity-40 ${bannerArtworkFitState === 'stretch' ? 'border-[#1678b8] bg-[#1678b8] text-white' : 'border-slate-300 bg-white text-slate-700'}`} disabled={!activeObject}>Stretch</button>
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
              {hasCoroAspectMismatch ? <p><span className="font-black text-yellow-200">Aspect ratio mismatch:</span> choose Fit to fill the selected sign size, or Center to preserve the artwork at its original print size with blank space if needed.</p> : null}
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

      {showCustomerLogin ? <div className="fixed inset-0 z-[130] flex items-center justify-center overflow-y-auto bg-[#02070d]/75 p-3 backdrop-blur-md sm:p-4">
        <section className="flex max-h-[calc(100dvh-1.5rem)] w-[min(520px,94vw)] flex-col overflow-hidden rounded-xl border border-[#0ea5e9]/35 bg-[#07111f] text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.68),0_0_54px_rgba(14,165,233,0.20)] sm:max-h-[calc(100dvh-2rem)]">
          <div className="shrink-0 border-b border-[#0ea5e9]/25 bg-[linear-gradient(90deg,#07111f,#0b263d,#07111f)] px-6 py-5">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#62d4ff]">Hue Customer Account</p>
            <h3 className="mt-1 text-2xl font-black text-white">{customerSession ? 'My Account' : customerAuthMode === 'signin' ? 'Sign In' : 'Create Account'}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{customerSession ? 'Manage your saved artwork and Hue customer session.' : 'Create an account to save your artwork library, or continue as a guest for a one-time order.'}</p>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-6">
            {!customerSession ? <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[#38bdf8]/25 bg-[#0b263d]/55 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#62d4ff]">Create an account</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">Keep approved print-ready files in your personal Hue Studio artwork library, reuse them for future orders, and make repeat jobs faster.</p>
              </div>
              <div className="rounded-lg border border-white/12 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">Continue as guest</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">Place a one-time order without saving files to an account. You can still upload artwork and complete checkout.</p>
              </div>
            </div> : null}
            {customerSession ? <div className="space-y-3">
              <div className="rounded-lg border border-[#0ea5e9]/25 bg-[#0b263d]/60 p-4">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#62d4ff]">Signed In</p>
                <p className="mt-2 break-all text-lg font-black text-white">{customerSession.user?.email || 'Customer account'}</p>
                <p className="mt-2 text-sm text-slate-300">Uploads and AI-edited copies save to this customer library when cloud storage is available.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => { setShowCustomerLogin(false); setShowImageZone(true); }} className="rounded-lg border border-[#38bdf8]/30 bg-[#0c2a40] p-4 text-left hover:border-[#67d8ff] hover:bg-[#10364f]"><span className="block text-xs font-black uppercase tracking-[0.18em] text-[#67d8ff]">Saved Artwork</span><span className="mt-2 block text-2xl font-black text-white">{imageZoneItems.length}</span><span className="mt-1 block text-xs text-slate-300">Open Image Zone</span></button>
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4"><span className="block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Account Status</span><span className="mt-2 block text-lg font-black text-emerald-300">Active</span><span className="mt-1 block text-xs text-slate-400">Cloud library connected</span></div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Past Orders</span>
                  <span className="rounded-full bg-[#0ea5e9]/20 px-2 py-0.5 text-xs font-bold text-[#9be6ff]">{accountOrdersLoading && !customerOrderHistory.length ? '...' : customerOrderHistory.length}</span>
                </div>
                {accountOrdersError ? <p className="mt-2 rounded border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">{accountOrdersError} Showing any orders saved in this browser.</p> : null}
                {customerOrderHistory.length ? <div className="mt-3 space-y-2">
                  {customerOrderHistory.map((order) => <button type="button" key={`account-order-${order.id}`} onClick={() => {
                    try {
                      window.sessionStorage.setItem(ORDER_CONFIRMATION_STORAGE_KEY, JSON.stringify(getPersistableTestOrders([order])[0]));
                    } catch {
                      // The confirmation page can still find the order in local history.
                    }
                    setShowCustomerLogin(false);
                    window.location.assign(`/order-confirmation?order=${encodeURIComponent(order.orderNumber)}`);
                  }} className="block w-full rounded border border-white/10 bg-[#02070d]/55 px-3 py-2 text-left text-xs transition hover:border-[#38bdf8]/55 hover:bg-[#0c2a40]/70 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/40">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-black text-white">{order.orderNumber}</span>
                      <span className="font-black text-green-300">{formatSignPrice(order.total, order.currency)}</span>
                    </div>
                    <p className="mt-1 text-slate-400">{new Date(order.createdAt).toLocaleDateString()} / {order.items.length} item{order.items.length === 1 ? '' : 's'} / {order.items.reduce((total, item) => total + item.artworkFiles.length, 0)} artwork file{order.items.reduce((total, item) => total + item.artworkFiles.length, 0) === 1 ? '' : 's'}</p>
                    <span className="mt-1 block font-bold text-[#8be3ff]">View order details →</span>
                  </button>)}
                </div> : <p className="mt-2 text-xs leading-5 text-slate-400">{accountOrdersLoading ? 'Loading your complete order history...' : 'Orders placed with this signed-in email will appear here.'}</p>}
              </div>
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
            <div className="sticky bottom-0 z-10 -mx-6 -mb-6 flex flex-wrap gap-2 border-t border-white/10 bg-[#07111f]/95 px-6 py-4 shadow-[0_-14px_28px_rgba(2,7,13,0.72)] backdrop-blur-md">
              {!customerSession ? <button type="button" onClick={() => setCustomerAuthMode((current) => current === 'signin' ? 'signup' : 'signin')} className="flex-1 rounded border border-white/15 bg-[#0b1018] px-4 py-3 text-sm font-bold text-slate-100 hover:border-[#0ea5e9]/70">{customerAuthMode === 'signin' ? 'Create Account' : 'Sign In Instead'}</button> : null}
              {!customerSession ? <button type="button" onClick={handleGuestMode} className="flex-1 rounded border border-white/15 bg-[#0b1018] px-4 py-3 text-sm font-bold text-slate-100 hover:border-[#0ea5e9]/70">Continue as Guest</button> : null}
              {customerSession ? <button type="button" onClick={() => { void handleCustomerSignOut(); }} className="flex-1 rounded border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100 hover:bg-red-500/20">Sign Out</button> : null}
              <button type="button" onClick={() => setShowCustomerLogin(false)} className="flex-1 rounded border border-[#0ea5e9]/50 bg-[#0b263d] px-4 py-3 text-sm font-black text-white hover:bg-[#103656]">Close</button>
            </div>
          </div>
        </section>
      </div> : null}

      {showGuestArtworkWarning ? <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#02070d]/85 p-4 backdrop-blur-md">
        <section className="w-[min(600px,94vw)] overflow-hidden rounded-2xl border border-amber-300/30 bg-[#07111f] text-slate-100 shadow-[0_36px_110px_rgba(0,0,0,0.76),0_0_58px_rgba(245,158,11,0.12)]">
          <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.20),transparent_42%),#071522] px-6 py-5">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[#67d8ff]">Hue Image Zone</p>
            <h3 className="mt-2 text-2xl font-black text-white">Keep your artwork safe</h3>
          </div>
          <div className="px-6 py-6">
            <div className="flex gap-4 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/10 text-xl font-black text-amber-200">!</span>
              <div><p className="font-black text-amber-100">You are uploading as a guest.</p><p className="mt-2 text-sm leading-6 text-slate-300">Guest artwork is temporary and can be lost when this browser is refreshed or closed. We recommend creating an account or signing in so your files are saved securely and available for future orders.</p></div>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-400">You may still continue as a guest and complete your order. Keep this browser open until checkout is finished.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={openAccountFromGuestArtworkWarning} className="rounded-xl bg-[#1686c9] px-5 py-3.5 text-sm font-black uppercase text-white shadow-[0_12px_30px_rgba(14,165,233,0.24)] hover:bg-[#0f6da8]">Create Account / Sign In</button>
              <button type="button" onClick={continueGuestArtworkUpload} className="rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3.5 text-sm font-bold text-slate-200 hover:border-white/30 hover:bg-white/[0.1]">Continue as Guest</button>
            </div>
            <button type="button" onClick={() => setShowGuestArtworkWarning(false)} className="mt-3 w-full rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-300">Cancel upload</button>
          </div>
        </section>
      </div> : null}

      {showCart ? <div className="fixed inset-0 z-50 flex justify-end bg-[#02070d]/70 backdrop-blur-sm">
        <section className="flex h-full w-[min(560px,96vw)] flex-col border-l border-[#0ea5e9]/30 bg-[#07111f] text-slate-100 shadow-[0_0_80px_rgba(0,0,0,0.55)]">
          <div className="border-b border-white/10 bg-[linear-gradient(90deg,#07111f,#0b263d)] px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#62d4ff]">Cart &amp; Checkout</p>
                <h2 className="mt-1 text-2xl font-black text-white">Print-ready order</h2>
                <p className="mt-1 text-sm text-slate-300">{cartItems.length} item{cartItems.length === 1 ? '' : 's'} / {formatSignPrice(cartSubtotal, 'USD')} subtotal</p>
              </div>
              <button type="button" onClick={() => { setShowCart(false); setStoreView('store'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="rounded border border-white/15 bg-[#0b1018] px-3 py-2 text-xs font-black uppercase text-slate-100 hover:border-[#0ea5e9]/70">Close</button>
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
              {(item.productionBreakdown || []).length > 0 ? <div className="mt-3 rounded-xl border border-[#38bdf8]/35 bg-[#071827] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#62d4ff]">Quantity by artwork</p>
                    <p className="mt-1 text-[11px] text-slate-400">Exact production count for each design</p>
                  </div>
                  <span className="rounded-full bg-[#0ea5e9]/20 px-2.5 py-1 text-xs font-black text-[#9be6ff]">{item.productionBreakdown.reduce((total, artwork) => total + Number(artwork.quantity || 0), 0)} total</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {item.productionBreakdown.map((artwork, artworkIndex) => <div key={`${item.id}-breakdown-${artwork.id || artworkIndex}`} className="flex gap-3 rounded-lg border border-white/10 bg-[#02070d]/65 p-2.5">
                    {artwork.frontPreviewUrl ? <img src={artwork.frontPreviewUrl} alt={`${artwork.label} front`} className="h-20 w-24 shrink-0 rounded border border-white/10 bg-white object-contain" /> : <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded border border-dashed border-white/20 text-[10px] text-slate-500">No preview</div>}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-black text-white">{artwork.label || `Artwork set ${artworkIndex + 1}`}</p>
                      <p className="mt-1 text-xl font-black leading-none text-green-300">Qty {artwork.quantity}</p>
                      <p className="mt-2 text-[11px] text-slate-300">{artwork.sizeLabel}</p>
                      {artwork.sheetLabel ? <p className="text-[11px] text-[#9be6ff]">{artwork.sheetLabel}</p> : null}
                    </div>
                  </div>)}
                </div>
              </div> : null}
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
                      <p className="truncate text-slate-500">{file.storagePath || 'Session preview only'}</p>
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
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => { setCartItems([]); setCartStatus('Cart cleared.'); }} disabled={cartItems.length === 0} className="rounded border border-white/15 bg-[#0b1018] px-4 py-3 text-xs font-black uppercase text-slate-100 hover:border-red-400/60 disabled:cursor-not-allowed disabled:opacity-40">Clear</button>
                <button type="button" onClick={() => { setShowCart(false); setStoreView('store'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="rounded border border-[#38bdf8]/45 bg-[#0c2a40] px-4 py-3 text-xs font-black uppercase text-[#a9ecff] hover:border-[#67d8ff] hover:bg-[#10364f]">Keep Shopping</button>
                <button type="button" onClick={openTestCheckout} disabled={cartItems.length === 0} className="rounded bg-[#1678b8] px-4 py-3 text-xs font-black uppercase text-white shadow-[0_0_24px_rgba(14,165,233,0.20)] hover:bg-[#0f5f94] disabled:cursor-not-allowed disabled:opacity-40">Continue to Checkout</button>
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
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#62d4ff]">Cart &amp; Checkout</p>
                <h2 className="mt-1 text-2xl font-black text-white">{checkoutStep === 'complete' ? 'Order submitted' : 'Review and submit your order'}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{paypalCheckoutAvailable === true ? 'Secure PayPal Checkout will collect payment after you approve the exact verified total.' : paypalCheckoutAvailable === false ? 'PayPal is not enabled here yet, so this creates a realistic test order without collecting payment.' : 'Review the order details. Secure payment availability is checked on the review step.'}</p>
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
                <h3 className="text-lg font-black text-white">Review order</h3>
                <p className="mt-1 text-sm text-slate-400">Confirm products, pricing, options, and artwork references before payment.</p>
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
              <div className="rounded-xl border border-[#38bdf8]/20 bg-[#0c2a40]/35 p-4">
                <div className="flex flex-wrap items-end gap-3"><label className="min-w-52 flex-1 text-xs font-black uppercase tracking-wide text-[#8be3ff]">Promo code<input value={checkoutPromoInput} onChange={(event) => { setCheckoutPromoInput(event.target.value.toUpperCase()); if (checkoutPromo && event.target.value.toUpperCase() !== checkoutPromo.code) setCheckoutPromo(null); }} placeholder="Enter code" className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-[#02070d] px-4 text-sm font-bold uppercase text-white outline-none focus:border-[#38bdf8]" /></label><button type="button" disabled={isCheckoutPromoLoading} onClick={() => void applyCheckoutPromo()} className="h-11 rounded-xl bg-[#1686c9] px-5 text-xs font-black uppercase text-white hover:bg-[#0f75b5] disabled:opacity-50">{isCheckoutPromoLoading ? 'Checking...' : checkoutPromo ? 'Reapply' : 'Apply code'}</button>{checkoutPromo ? <button type="button" onClick={() => { setCheckoutPromo(null); setCheckoutPromoInput(''); setCheckoutStatus('Promo code removed.'); }} className="h-11 rounded-xl border border-white/15 px-4 text-xs font-bold text-slate-300">Remove</button> : null}</div>
                {checkoutPromo ? <p className="mt-3 text-sm font-bold text-emerald-300">✓ {checkoutPromo.code}: {checkoutPromo.description} — {formatSignPrice(checkoutDiscountAmount, 'USD')} savings</p> : <p className="mt-3 text-xs text-slate-400">Have a special Hue discount? Apply it before submitting.</p>}
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
                  {checkoutPromo ? <div className="flex items-center justify-between font-bold text-emerald-300"><span>Promo: {checkoutPromo.code}</span><span>-{formatSignPrice(checkoutDiscountAmount, 'USD')}</span></div> : null}
                  <div className="flex items-start justify-between gap-4 text-slate-300">
                    <span>{checkoutShippingLabel}</span>
                    <span>{checkoutShippingAmount > 0 ? formatSignPrice(checkoutShippingAmount, 'USD') : 'No charge'}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4 text-slate-300">
                    <span>{checkoutTaxLabel}</span>
                    <span>{formatSignPrice(checkoutTaxAmount, 'USD')}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 text-lg font-black text-white">
                    <span>Order total</span>
                    <span className="text-green-400">{formatSignPrice(checkoutOrderTotal, 'USD')}</span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-[#62d4ff]/25 bg-[#0ea5e9]/10 p-4">
                {paypalCheckoutAvailable === false ? <p className="text-sm text-[#c8f2ff]">PayPal Checkout is currently disabled or not configured. You can still submit this as a no-payment test order.</p> : <div className="space-y-3">
                  <p className="text-sm font-bold text-[#c8f2ff]">Pay securely with PayPal to submit this order.</p>
                  <PayPalCheckoutButton
                    disabled={isSubmittingTestOrder}
                    createOrder={createPayPalCheckoutOrder}
                    onApprove={approvePayPalCheckoutOrder}
                    onCancel={() => setCheckoutStatus('PayPal checkout was cancelled. Your cart is still here.')}
                    onError={(message) => setCheckoutStatus(message)}
                    onAvailabilityChange={(enabled) => setPaypalCheckoutAvailable(enabled)}
                  />
                  {pendingPayPalFinalization ? <p className="rounded border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-100">PayPal captured this payment, but Hue still needs to finish saving the order. Use Finalize Paid Order below if it does not continue automatically.</p> : null}
                </div>}
              </div>
            </div> : null}

            {checkoutStep === 'complete' ? <div className="space-y-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#62d4ff]/40 bg-[#0ea5e9]/20 text-2xl font-black text-[#9be6ff]">HX</div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#62d4ff]">Test order number</p>
                <h3 className="mt-2 text-4xl font-black text-white">{lastTestOrder?.orderNumber || 'TEST SAVED'}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{lastTestOrder?.paymentMode === 'paypal' ? 'Payment was captured through PayPal and the cart was cleared.' : 'No payment was collected. The cart was cleared and the test order was saved in this browser for workflow testing.'}</p>
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
              {lastTestOrder ? <div className="mx-auto max-w-xl rounded-xl border border-[#0ea5e9]/25 bg-[#02070d]/60 p-4 text-left">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#62d4ff]">Order Details</p>
                    <p className="mt-2 text-sm font-bold text-white">{lastTestOrder.customer.name} / {lastTestOrder.customer.email}</p>
                    <p className="mt-1 text-xs text-slate-400">{lastTestOrder.fulfillment.method === 'direct_ship' ? `Direct ship: ${lastTestOrder.fulfillment.address?.line1}, ${lastTestOrder.fulfillment.address?.city}, ${lastTestOrder.fulfillment.address?.state} ${lastTestOrder.fulfillment.address?.postalCode}` : 'Local pickup'}</p>
                  </div>
                  <div className="text-right text-xs text-slate-300">
                    <p>Subtotal: {formatSignPrice(lastTestOrder.subtotal, lastTestOrder.currency)}</p>
                    {lastTestOrder.promotion ? <p className="text-emerald-300">Promo {lastTestOrder.promotion.code}: -{formatSignPrice(lastTestOrder.promotion.discountAmount, lastTestOrder.currency)}</p> : null}
                    <p>{lastTestOrder.shipping?.label || 'Shipping'}: {formatSignPrice(lastTestOrder.shipping?.amount || 0, lastTestOrder.currency)}</p>
                    <p>Tax: {formatSignPrice(lastTestOrder.tax.amount, lastTestOrder.currency)}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {lastTestOrder.items.map((item, itemIndex) => <div key={`complete-item-${item.id}`} className="rounded border border-white/10 bg-white/[0.035] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-white">Item {itemIndex + 1}: {item.productName}</p>
                        <p className="mt-1 text-xs text-slate-400">{item.sizeLabel} / Qty {item.quantity}</p>
                      </div>
                      <p className="text-sm font-black text-green-300">{item.price.total !== null ? formatSignPrice(item.price.total, item.price.currency) : 'Needs price'}</p>
                    </div>
                    {(item.productionBreakdown || []).length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {item.productionBreakdown.map((artwork, artworkIndex) => <div key={`complete-breakdown-${item.id}-${artwork.id || artworkIndex}`} className="flex gap-2 rounded border border-[#38bdf8]/25 bg-[#071827] p-2">
                        {artwork.frontPreviewUrl ? <img src={artwork.frontPreviewUrl} alt="" className="h-16 w-20 shrink-0 rounded bg-white object-contain" /> : null}
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-white">{artwork.label || `Artwork set ${artworkIndex + 1}`}</p>
                          <p className="text-base font-black text-green-300">Qty {artwork.quantity}</p>
                          <p className="text-[11px] text-slate-400">{artwork.sizeLabel}{artwork.sheetLabel ? ` / ${artwork.sheetLabel}` : ''}</p>
                        </div>
                      </div>)}
                    </div> : null}
                    <div className="mt-2 space-y-1">
                      {item.artworkFiles.length ? item.artworkFiles.map((file) => <p key={`complete-file-${item.id}-${file.role}-${file.name}`} className="truncate text-xs text-slate-400">{file.role}: <span className="text-slate-200">{file.name}</span>{file.storagePath ? <span> / {file.storagePath}</span> : null}</p>) : <p className="text-xs text-amber-200">No artwork file reference attached.</p>}
                    </div>
                  </div>)}
                </div>
              </div> : null}
            </div> : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#050b12] p-4">
            <p className="text-xs leading-5 text-slate-400">{paypalCheckoutAvailable === true ? 'PayPal payments are captured before Hue stores and emails the final order.' : 'Team testing mode is still available while PayPal is disabled.'}</p>
            <div className="flex gap-2">
              {checkoutStep !== 'contact' && checkoutStep !== 'complete' ? <button type="button" onClick={() => setCheckoutStep(checkoutStep === 'review' ? 'fulfillment' : 'contact')} className="rounded border border-white/15 bg-[#0b1018] px-4 py-3 text-xs font-black uppercase text-slate-100 hover:border-[#0ea5e9]/70">Back</button> : null}
              {checkoutStep === 'contact' ? <button type="button" onClick={() => { setCheckoutStatus(''); setCheckoutStep('fulfillment'); }} className="rounded bg-[#1678b8] px-4 py-3 text-xs font-black uppercase text-white hover:bg-[#0f5f94]">Continue</button> : null}
              {checkoutStep === 'fulfillment' ? <button type="button" onClick={() => { setCheckoutStatus(''); setCheckoutStep('review'); }} className="rounded bg-[#1678b8] px-4 py-3 text-xs font-black uppercase text-white hover:bg-[#0f5f94]">Review Order</button> : null}
              {checkoutStep === 'review' && pendingPayPalFinalization ? <button type="button" disabled={isSubmittingTestOrder} onClick={() => void finalizeCapturedPayPalOrder()} className="rounded bg-amber-500 px-4 py-3 text-xs font-black uppercase text-slate-950 hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60">{isSubmittingTestOrder ? 'Finalizing...' : 'Finalize Paid Order'}</button> : null}
              {checkoutStep === 'review' && paypalCheckoutAvailable === false ? <button type="button" disabled={isSubmittingTestOrder} onClick={() => void submitTestOrder()} className="rounded bg-[#22c55e] px-4 py-3 text-xs font-black uppercase text-white shadow-[0_0_24px_rgba(34,197,94,0.20)] hover:bg-[#16a34a] disabled:cursor-wait disabled:opacity-60">{isSubmittingTestOrder ? 'Finalizing Order...' : 'Submit Test Order'}</button> : null}
              {checkoutStep === 'complete' ? <button type="button" onClick={() => setShowTestCheckout(false)} className="rounded bg-[#1678b8] px-4 py-3 text-xs font-black uppercase text-white hover:bg-[#0f5f94]">Done</button> : null}
            </div>
          </div>
        </section>
      </div> : null}

      {showAcrylicTransparencyNotice ? <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#02070d]/82 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="acrylic-artwork-notice-title">
        <section className="w-[min(600px,94vw)] overflow-hidden rounded-[22px] border border-[#38bdf8]/30 bg-[#07111f] text-white shadow-[0_36px_120px_rgba(0,0,0,0.76),0_0_70px_rgba(14,165,233,0.20)]">
          <div className="relative border-b border-white/10 bg-[#081827] px-6 py-5">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-black/30 shadow-[0_0_28px_rgba(14,165,233,0.24)]"><img src="/brand/hue-graphics-mark.png" alt="" className="h-full w-full object-cover" /></span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.26em] text-[#67d8ff]">Hue Graphics / Artwork check</p>
                <h2 id="acrylic-artwork-notice-title" className="mt-1 text-xl font-black tracking-tight">Transparent PNG required</h2>
              </div>
            </div>
            <span className="absolute bottom-0 left-6 h-[3px] w-28 rounded-t-full bg-[#38bdf8] shadow-[0_0_18px_rgba(56,189,248,0.85)]" />
          </div>
          <div className="px-6 py-7 text-center sm:px-10">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#38bdf8]/25 bg-[linear-gradient(45deg,rgba(255,255,255,0.08)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.08)_75%),linear-gradient(45deg,rgba(255,255,255,0.08)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.08)_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] text-2xl font-black text-[#67d8ff] shadow-[inset_0_0_24px_rgba(14,165,233,0.10)]">PNG</span>
            <p className="mx-auto mt-5 max-w-lg text-lg font-bold leading-7 text-white">Please use PNG files with a transparent background for spot white.</p>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">Transparent areas tell our production team where the spot-white layer should be prepared on your Acrylic sign.</p>
          </div>
          <div className="flex justify-end border-t border-white/10 bg-[#050d16] px-6 py-4">
            <button type="button" onClick={acknowledgeAcrylicTransparencyNotice} autoFocus className="rounded-xl bg-[#1686c9] px-6 py-3 text-xs font-black uppercase tracking-[0.08em] text-white shadow-[0_12px_28px_rgba(14,165,233,0.24)] hover:bg-[#0f75b5] focus:outline-none focus:ring-2 focus:ring-[#67d8ff] focus:ring-offset-2 focus:ring-offset-[#050d16]">Got it &mdash; continue</button>
          </div>
        </section>
      </div> : null}

      {showNewArtworkDialog ? (() => {
        const activeGroup = NEW_ARTWORK_PRESET_GROUPS.find((group) => group.id === newArtworkPresetGroupId) || NEW_ARTWORK_PRESET_GROUPS[0];
        return <div className="fixed inset-0 z-[75] flex items-center justify-center bg-[#02070d]/90 p-4 backdrop-blur-lg">
          <section className="flex max-h-[min(820px,94vh)] w-[min(1080px,96vw)] flex-col overflow-hidden rounded-[24px] border border-[#38bdf8]/30 bg-[#07111f] text-white shadow-[0_36px_130px_rgba(0,0,0,0.78),0_0_70px_rgba(14,165,233,0.18)]">
            <header className="flex items-center gap-4 border-b border-white/10 bg-[linear-gradient(135deg,#071522,#08243a_55%,#071522)] px-6 py-5">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#67d8ff]/30 bg-[#0c2a40] text-2xl font-black text-[#67d8ff]">+</span>
              <div className="mr-auto"><p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#67d8ff]">Hue Designer</p><h2 className="mt-1 text-2xl font-black">Create New Artwork</h2><p className="mt-1 text-sm text-slate-400">Choose a common production size or enter your own dimensions.</p></div>
              <button type="button" onClick={closeNewArtworkCreator} className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-xs font-bold uppercase text-slate-300 hover:bg-white/[0.1]">Close</button>
            </header>
            <div className="grid min-h-0 flex-1 md:grid-cols-[240px_minmax(0,1fr)]">
              <aside className="min-h-0 overflow-y-auto border-r border-white/10 bg-[#06101b] p-4">
                <p className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Artwork type</p>
                <div className="mt-2 space-y-1.5">{NEW_ARTWORK_PRESET_GROUPS.map((group) => <button key={group.id} type="button" onClick={() => { setNewArtworkPresetGroupId(group.id); setNewArtworkPresetKey(`${group.sizes[0].width}x${group.sizes[0].height}`); setNewArtworkUseCustomSize(false); setNewArtworkError(''); }} className={`w-full rounded-xl border px-3 py-3 text-left transition ${!newArtworkUseCustomSize && activeGroup.id === group.id ? 'border-[#38bdf8]/65 bg-[#0c2a40] shadow-[0_0_22px_rgba(14,165,233,0.10)]' : 'border-white/8 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.05]'}`}><span className={`block text-sm font-black ${!newArtworkUseCustomSize && activeGroup.id === group.id ? 'text-[#9be8ff]' : 'text-slate-200'}`}>{group.label}</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">{group.description}</span></button>)}</div>
                <button type="button" onClick={() => { setNewArtworkUseCustomSize(true); setNewArtworkError(''); }} className={`mt-3 w-full rounded-xl border px-3 py-3 text-left ${newArtworkUseCustomSize ? 'border-amber-300/55 bg-amber-400/10' : 'border-dashed border-white/15 bg-white/[0.025] hover:border-amber-300/30'}`}><span className={`block text-sm font-black ${newArtworkUseCustomSize ? 'text-amber-200' : 'text-slate-200'}`}>Custom Size</span><span className="mt-1 block text-[10px] text-slate-500">Enter width × height in inches</span></button>
              </aside>
              <main className="min-h-0 overflow-y-auto p-5 sm:p-6">
                {!newArtworkUseCustomSize ? <>
                  <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#67d8ff]">Select a size</p><h3 className="mt-1 text-xl font-black">{activeGroup.label}</h3></div><span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold text-slate-400">Dimensions shown in inches</span></div>
                  <div className={`mt-5 grid gap-3 ${activeGroup.id === 'banners' ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>{activeGroup.sizes.map((size) => {
                    const key = `${size.width}x${size.height}`;
                    const selected = newArtworkPresetKey === key;
                    return <button key={key} type="button" onClick={() => { setNewArtworkPresetKey(key); setNewArtworkError(''); }} className={`relative min-h-24 rounded-2xl border p-4 text-left transition ${selected ? 'border-[#67d8ff] bg-[linear-gradient(135deg,rgba(14,165,233,0.20),rgba(59,130,246,0.08))] shadow-[0_0_30px_rgba(14,165,233,0.14)]' : 'border-white/10 bg-white/[0.035] hover:border-[#38bdf8]/40 hover:bg-white/[0.055]'}`}>
                      {size.popular ? <span className="absolute right-3 top-3 rounded-full bg-amber-300/15 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-amber-200">★ Popular</span> : null}
                      <span className={`block text-xl font-black ${selected ? 'text-white' : 'text-slate-200'}`}>{size.width}&quot; × {size.height}&quot;</span>
                      {size.label ? <span className="mt-1 block text-xs font-bold text-[#67d8ff]">{size.label}</span> : <span className="mt-1 block text-xs text-slate-500">{size.width < size.height ? 'Portrait' : size.width > size.height ? 'Landscape' : 'Square'} artboard</span>}
                      {selected ? <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase text-emerald-300">✓ Selected</span> : null}
                    </button>;
                  })}<button type="button" onClick={() => { setNewArtworkUseCustomSize(true); setNewArtworkError(''); }} className="relative min-h-24 rounded-2xl border border-dashed border-amber-300/35 bg-[linear-gradient(135deg,rgba(251,191,36,0.09),rgba(255,255,255,0.025))] p-4 text-left transition hover:border-amber-200/65 hover:bg-amber-300/10"><span className="absolute right-3 top-3 rounded-full bg-amber-300/15 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-amber-200">Any size</span><span className="block text-xl font-black text-white">Custom Size</span><span className="mt-1 block text-xs text-amber-100/70">Enter your own width × height</span><span className="mt-3 inline-flex text-[10px] font-black uppercase text-amber-200">Create custom artboard →</span></button></div>
                </> : <div className="mx-auto max-w-xl">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200">Custom artboard</p><h3 className="mt-1 text-2xl font-black">Enter your finished size</h3><p className="mt-2 text-sm leading-6 text-slate-400">Use the exact finished dimensions you plan to order. You can build artboards up to 240 inches per side.</p>
                  <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-end gap-3"><label className="text-[10px] font-black uppercase tracking-wide text-slate-400">Width (inches)<input type="number" min="1" max="240" step="0.25" value={newArtworkCustomWidth} onChange={(event) => setNewArtworkCustomWidth(Number(event.target.value))} className="mt-2 h-14 w-full rounded-xl border border-white/15 bg-black/25 px-4 text-xl font-black text-white outline-none focus:border-[#38bdf8]" /></label><span className="pb-4 text-xl font-black text-slate-500">×</span><label className="text-[10px] font-black uppercase tracking-wide text-slate-400">Height (inches)<input type="number" min="1" max="240" step="0.25" value={newArtworkCustomHeight} onChange={(event) => setNewArtworkCustomHeight(Number(event.target.value))} className="mt-2 h-14 w-full rounded-xl border border-white/15 bg-black/25 px-4 text-xl font-black text-white outline-none focus:border-[#38bdf8]" /></label></div>
                  <div className="mt-6 rounded-2xl border border-[#38bdf8]/20 bg-[#0c2a40]/45 p-4 text-sm text-slate-300"><strong className="text-[#9be8ff]">Artboard preview:</strong> {Number(newArtworkCustomWidth) || 0}&quot; × {Number(newArtworkCustomHeight) || 0}&quot; · {newArtworkCustomWidth > newArtworkCustomHeight ? 'Landscape' : newArtworkCustomWidth < newArtworkCustomHeight ? 'Portrait' : 'Square'}</div>
                </div>}
              </main>
            </div>
            <footer className="flex flex-wrap items-center gap-3 border-t border-white/10 bg-[#050d16] px-6 py-4"><p className={`min-w-0 flex-1 text-xs ${newArtworkError ? 'font-bold text-amber-300' : 'text-slate-500'}`}>{newArtworkError || 'A blank print-ready artboard will open in Hue Designer. Nothing is saved until you choose Save to Image Zone.'}</p><button type="button" onClick={closeNewArtworkCreator} className="rounded-xl border border-white/15 bg-white/[0.05] px-5 py-3 text-sm font-bold text-slate-300 hover:bg-white/[0.1]">Cancel</button><button type="button" onClick={buildNewArtwork} className="rounded-xl bg-[#1686c9] px-6 py-3 text-sm font-black uppercase text-white shadow-[0_12px_30px_rgba(14,165,233,0.25)] hover:bg-[#0f6da8]">Open Hue Designer</button></footer>
          </section>
        </div>;
      })() : null}

      {showArtworkEditor ? <div className="fixed inset-0 z-[80] flex bg-[#02070d]/95 p-0 backdrop-blur-lg sm:p-3">
        <section className="flex min-h-0 w-full flex-col overflow-hidden border border-[#38bdf8]/25 bg-[#07111f] text-white shadow-[0_36px_140px_rgba(0,0,0,0.82),0_0_70px_rgba(14,165,233,0.18)] sm:rounded-[22px]">
          <header className="hue-mobile-editor-header flex max-h-[34vh] flex-wrap items-center gap-2 overflow-y-auto border-b border-white/10 bg-[#071522] px-3 py-3 sm:max-h-none sm:gap-3 sm:px-5 sm:overflow-visible">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#67d8ff]/25 bg-[#0c2a40] text-xl text-[#67d8ff]">✎</span>
            <div className="mr-auto min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#67d8ff]">Hue Designer</p><h2 className="truncate text-xl font-black">{artworkEditorSource?.id.startsWith('new-artwork-') ? 'Create New Artwork' : `Editing ${artworkEditorSource?.name || 'artwork'}`}</h2><p className="text-xs text-slate-400">{artworkEditorSource?.id.startsWith('new-artwork-') ? 'New blank design' : 'Original preserved'} · {artworkEditorSource ? formatArtworkInches(artworkEditorSource.width, artworkEditorSource.height, artworkEditorSource.signWidth, artworkEditorSource.signHeight) : ''}</p></div>
            <div className="flex items-center gap-1 rounded-xl border border-[#38bdf8]/25 bg-black/25 p-1"><button type="button" onClick={() => switchArtworkEditorSide('front')} className={`rounded-lg px-4 py-2 text-xs font-black uppercase ${artworkEditorSide === 'front' ? 'bg-[#1686c9] text-white shadow-[0_0_18px_rgba(14,165,233,0.22)]' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}>Front</button><button type="button" onClick={() => switchArtworkEditorSide('back')} className={`rounded-lg px-4 py-2 text-xs font-black uppercase ${artworkEditorSide === 'back' ? 'bg-[#1686c9] text-white shadow-[0_0_18px_rgba(14,165,233,0.22)]' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}>{artworkEditorHasBackSide ? 'Back' : '+ Add Back'}</button></div>
            <button type="button" disabled={isArtworkEditorSaving || isAiEditing} onClick={() => { void openArtworkEditorAiTools(); }} className="rounded-xl border border-violet-300/35 bg-violet-500/10 px-4 py-2.5 text-xs font-black uppercase text-violet-100 shadow-[0_0_24px_rgba(139,92,246,0.12)] hover:border-violet-300/65 hover:bg-violet-500/20 disabled:opacity-40">✦ AI Tools</button>
            <div className="flex items-center gap-1"><button type="button" onClick={saveArtworkEditorVersion} className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-[10px] font-bold uppercase text-slate-300 hover:border-[#38bdf8]/45">Save Version</button>{artworkEditorVersions.length ? <select value="" onChange={(event) => restoreArtworkEditorVersion(event.target.value)} className="h-9 rounded-lg border border-white/15 bg-[#0a1928] px-2 text-[10px] text-slate-200"><option value="" disabled>Restore…</option>{artworkEditorVersions.map((version) => <option key={version.id} value={version.id}>{version.label}</option>)}</select> : null}</div>
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
              <button type="button" disabled={!artworkEditorCanUndo || isArtworkEditorSaving} onClick={() => { void restoreArtworkEditorHistory(-1); }} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:opacity-30">↶ Undo</button>
              <button type="button" disabled={!artworkEditorCanRedo || isArtworkEditorSaving} onClick={() => { void restoreArtworkEditorHistory(1); }} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:opacity-30">Redo ↷</button>
            </div>
            <button type="button" disabled={isArtworkEditorSaving} onClick={closeArtworkEditor} className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-xs font-bold uppercase text-slate-300 hover:bg-white/[0.1] disabled:opacity-40">Close</button>
          </header>
          <nav className={`hue-mobile-editor-tabs ${artworkEditorPrintView ? 'hidden' : ''}`} aria-label="Hue Designer mobile workspace">
            <button type="button" onClick={() => setArtworkEditorMobileView('canvas')} className={artworkEditorMobileView === 'canvas' ? 'is-active' : ''}>Canvas</button>
            <button type="button" onClick={() => setArtworkEditorMobileView('tools')} className={artworkEditorMobileView === 'tools' ? 'is-active' : ''}>Add &amp; Edit</button>
            <button type="button" onClick={() => setArtworkEditorMobileView('properties')} className={artworkEditorMobileView === 'properties' ? 'is-active' : ''}>Properties &amp; Layers</button>
          </nav>
          <div data-mobile-view={artworkEditorMobileView} className={`hue-mobile-editor-body grid min-h-0 flex-1 overflow-y-auto transition-[grid-template-columns] duration-300 lg:overflow-hidden ${artworkEditorPrintView ? 'lg:grid-cols-[minmax(0,1fr)]' : artworkEditorLeftPanelOpen ? 'lg:grid-cols-[310px_minmax(0,1fr)_310px]' : 'lg:grid-cols-[68px_minmax(0,1fr)_310px]'}`}>
            <aside className={`hue-mobile-editor-tools relative max-h-[42vh] min-h-0 overflow-x-hidden overflow-y-auto border-r border-white/10 bg-[#07131f] transition-all duration-300 lg:max-h-none ${artworkEditorPrintView ? 'hidden' : ''} ${artworkEditorLeftPanelOpen ? 'p-4' : 'p-2'}`}>
              <input ref={artworkEditorImageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { void addArtworkEditorImage(event); }} className="hidden" />
              <button type="button" onClick={() => setArtworkEditorLeftPanelOpen((open) => !open)} className={`sticky top-0 z-20 mb-3 flex h-9 items-center justify-center rounded-xl border border-[#38bdf8]/25 bg-[#081827]/95 text-xs font-black uppercase tracking-wide text-[#9be8ff] shadow-[0_12px_24px_rgba(0,0,0,0.22)] hover:border-[#67d8ff] hover:bg-[#0c2a40] ${artworkEditorLeftPanelOpen ? 'ml-auto w-28' : 'w-full'}`} aria-label={artworkEditorLeftPanelOpen ? 'Collapse artwork tools' : 'Expand artwork tools'}>{artworkEditorLeftPanelOpen ? 'Hide tools' : 'Tools'}</button>
              {!artworkEditorLeftPanelOpen ? <div className="flex flex-col items-center gap-3 pt-1">
                <button type="button" onClick={() => artworkEditorImageInputRef.current?.click()} className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#38bdf8]/35 bg-[#1686c9] text-lg font-black text-white hover:bg-[#0f75b5]" title="Upload image or logo">+</button>
                <button type="button" onClick={() => { setImageLibraryStatus('Choose saved artwork to add as an editable layer.'); setShowImageZone(true); }} className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#38bdf8]/35 bg-white/[0.045] text-xs font-black text-[#8be3ff] hover:bg-[#10364f]" title="Add artwork from Image Zone">IZ</button>
                <button type="button" onClick={() => setArtworkEditorLeftPanelOpen(true)} className="mt-2 [writing-mode:vertical-rl] rounded-full border border-white/10 bg-white/[0.04] px-2 py-3 text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 hover:text-white">Open</button>
              </div> : <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">Add elements</p>
              <button type="button" onClick={() => artworkEditorImageInputRef.current?.click()} className="mt-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-[#38bdf8]/45 bg-[#0c2a40]/55 p-3 text-left hover:border-[#67d8ff] hover:bg-[#10364f]"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1686c9] text-lg font-black text-white">+</span><span><strong className="block text-xs font-black text-white">Upload image or logo</strong><span className="mt-0.5 block text-[10px] text-slate-400">Add a movable, resizable image layer</span></span></button>
              <button type="button" onClick={() => { setImageLibraryStatus('Choose saved artwork to add as an editable layer.'); setShowImageZone(true); }} className="mt-2 flex w-full items-center gap-3 rounded-xl border border-[#38bdf8]/30 bg-white/[0.045] p-3 text-left hover:border-[#67d8ff] hover:bg-[#10364f]"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#38bdf8]/35 bg-[#071827] text-xs font-black uppercase text-[#8be3ff]">IZ</span><span><strong className="block text-xs font-black text-white">Add from Image Zone</strong><span className="mt-0.5 block text-[10px] text-slate-400">Choose saved artwork and add it as an editable layer</span></span></button>
              {artworkEditorSide === 'front' ? <button type="button" onClick={copyArtworkEditorFrontToBack} className="mt-2 w-full rounded-xl border border-[#38bdf8]/25 bg-white/[0.04] px-3 py-2.5 text-xs font-bold text-[#9be8ff] hover:border-[#67d8ff]/60 hover:bg-[#0c2a40]">Copy Front → Back</button> : <button type="button" onClick={removeArtworkEditorBackSide} className="mt-2 w-full rounded-xl border border-red-400/20 bg-red-500/[0.06] px-3 py-2.5 text-xs font-bold text-red-200 hover:bg-red-500/10">Remove Back Side</button>}
              <div className="mt-3 space-y-2">
                <textarea value={artworkEditorText} onChange={(event) => setArtworkEditorText(event.target.value)} rows={3} className="w-full resize-none rounded-xl border border-white/15 bg-black/25 p-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#38bdf8]" placeholder="Enter replacement text" />
                <button type="button" onClick={artworkEditorActiveObject?.type === 'i-text' ? applyArtworkEditorText : addArtworkEditorText} className="w-full rounded-xl bg-[#1686c9] px-3 py-3 text-xs font-black uppercase text-white hover:bg-[#0f6da8]">{artworkEditorActiveObject?.type === 'i-text' ? 'Apply text changes' : '+ Add text'}</button>
              </div>
              <div className="mt-6 overflow-hidden rounded-2xl border border-[#67d8ff]/35 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.24),transparent_45%),linear-gradient(145deg,#0c2a40,#071827)] shadow-[0_0_28px_rgba(14,165,233,0.12)]">
                <div className="p-4"><div className="flex items-center justify-between gap-3"><span className="rounded-full border border-[#67d8ff]/30 bg-[#38bdf8]/10 px-2 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-[#9be8ff]">Smart Templates</span><span className="text-lg text-violet-300">✦</span></div><h3 className="mt-3 text-base font-black text-white">Hue Template Library</h3><p className="mt-1 text-[10px] leading-4 text-slate-300">Professional, guided layouts for real estate, business, contractors, events, and directional signs.</p><button type="button" onClick={openSmartTemplateLibrary} className="mt-3 w-full rounded-xl bg-gradient-to-r from-[#1686c9] to-violet-600 px-3 py-3 text-[10px] font-black uppercase tracking-wide text-white shadow-[0_10px_24px_rgba(14,165,233,0.2)] hover:brightness-110">Browse Template Library →</button></div>
              </div>
              <p className="mt-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Starter templates</p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">{ARTWORK_EDITOR_TEMPLATES.map((template) => <button key={template.id} type="button" onClick={() => applyArtworkEditorTemplate(template.id)} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-left text-[9px] font-bold text-slate-300 hover:border-[#38bdf8]/45 hover:text-white">{template.label}</button>)}</div>
              <p className="mt-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Shapes</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => addArtworkEditorShape('rectangle')} className="rounded-xl border border-white/10 bg-white/[0.05] p-3 text-xs font-bold text-slate-200 hover:border-[#38bdf8]/50">▭<span className="mt-1 block">Rectangle</span></button>
                <button type="button" onClick={() => addArtworkEditorShape('circle')} className="rounded-xl border border-white/10 bg-white/[0.05] p-3 text-xs font-bold text-slate-200 hover:border-[#38bdf8]/50">●<span className="mt-1 block">Circle</span></button>
                <button type="button" onClick={() => addArtworkEditorShape('triangle')} className="rounded-xl border border-white/10 bg-white/[0.05] p-3 text-xs font-bold text-slate-200 hover:border-[#38bdf8]/50">▲<span className="mt-1 block">Triangle</span></button>
                <button type="button" onClick={() => addArtworkEditorShape('line')} className="rounded-xl border border-white/10 bg-white/[0.05] p-3 text-xs font-bold text-slate-200 hover:border-[#38bdf8]/50">━<span className="mt-1 block">Line</span></button>
              </div>
              <input value={artworkEditorIconSearch} onChange={(event) => setArtworkEditorIconSearch(event.target.value)} placeholder="Search icons (arrow, parking, phone…)" className="mt-2 h-9 w-full rounded-lg border border-white/15 bg-black/25 px-2 text-[10px] text-white outline-none focus:border-[#38bdf8]" />
              <div className="mt-2 grid max-h-36 grid-cols-4 gap-1 overflow-y-auto pr-1">{ARTWORK_EDITOR_ICONS.filter(([, label, tags]) => `${label} ${tags}`.toLowerCase().includes(artworkEditorIconSearch.toLowerCase())).map(([symbol, label]) => <button key={label} type="button" title={`Add ${label}`} onClick={() => addArtworkEditorIcon(symbol, label)} className="rounded-lg border border-white/10 bg-white/[0.04] py-2 text-lg text-slate-200 hover:border-[#38bdf8]/45">{symbol}</button>)}</div>
              <p className="mt-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">QR Code</p>
              <input value={artworkEditorQrValue} onChange={(event) => setArtworkEditorQrValue(event.target.value)} placeholder="Website, phone, or text" className="mt-2 h-10 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-xs text-white outline-none focus:border-[#38bdf8]" />
              <label className="mt-2 flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[9px] font-bold uppercase text-slate-400">QR color<input type="color" value={artworkEditorFill} onChange={(event) => { setArtworkEditorFill(event.target.value); rememberArtworkEditorColor(event.target.value); }} className="h-8 w-12 cursor-pointer bg-transparent" /></label>
              <button type="button" onClick={() => { void addArtworkEditorQrCode(); }} className="mt-2 w-full rounded-lg border border-[#38bdf8]/30 bg-[#0c2a40] px-3 py-2.5 text-[10px] font-black uppercase text-[#9be8ff] hover:border-[#67d8ff]">Generate QR Code</button>
              <button type="button" onClick={() => { void updateArtworkEditorQrCode(); }} className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[9px] font-bold uppercase text-slate-300 hover:border-[#38bdf8]/45">Update selected QR color</button>
              <p className="mt-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Colors & Gradient</p>
              <p className="mt-2 text-[8px] font-black uppercase tracking-wide text-slate-500">Hue + brand palette</p><div className="mt-1 flex flex-wrap gap-2">{['#111827', '#dc2626', '#facc15', '#16a34a', '#7c3aed', ...artworkEditorBrandColors].filter((color, index, colors) => colors.indexOf(color) === index).map((color) => <button key={color} type="button" title={color} onClick={() => { setArtworkEditorFill(color); rememberArtworkEditorColor(color); if (artworkEditorCanvasRef.current?.getActiveObject()) updateArtworkEditorSelected({ fill: color }); else setArtworkEditorCanvasBackground(color); }} className="h-7 w-7 rounded-full border-2 border-white/20 shadow" style={{ backgroundColor: color }} />)}</div>
              <button type="button" onClick={addArtworkEditorBrandColor} className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 text-[9px] font-bold text-slate-300">+ Save current color to brand palette</button>
              {artworkEditorRecentColors.length ? <><p className="mt-3 text-[8px] font-black uppercase tracking-wide text-slate-500">Recent colors</p><div className="mt-1 flex flex-wrap gap-2">{artworkEditorRecentColors.map((color) => <button key={color} type="button" title={color} onClick={() => { setArtworkEditorFill(color); if (artworkEditorCanvasRef.current?.getActiveObject()) updateArtworkEditorSelected({ fill: color }); }} className="h-6 w-6 rounded-full border border-white/25" style={{ backgroundColor: color }} />)}</div></> : null}
              <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-center gap-1"><input type="color" value={artworkEditorGradientStart} onChange={(event) => setArtworkEditorGradientStart(event.target.value)} className="h-9 w-full rounded bg-transparent" /><input type="color" value={artworkEditorGradientEnd} onChange={(event) => setArtworkEditorGradientEnd(event.target.value)} className="h-9 w-full rounded bg-transparent" /><button type="button" onClick={applyArtworkEditorGradient} className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-2 text-[9px] font-bold text-slate-200">Apply</button></div>
              <div className="mt-6 min-w-0 rounded-2xl border border-[#38bdf8]/25 bg-[#0c2a40]/45 p-3 shadow-[0_0_24px_rgba(14,165,233,0.07)]">
                <div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.17em] text-[#67d8ff]">Automatic Border</p><p className="mt-1 text-[10px] leading-4 text-slate-400">Measured from the finished sign edge.</p></div><span className="shrink-0 rounded-full bg-[#38bdf8]/10 px-2 py-1 text-[8px] font-black uppercase text-[#8be3ff]">Easy</span></div>
                <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-[9px] font-black uppercase tracking-wide text-slate-500">Inset<input type="number" min="0" max="12" step="0.125" value={artworkEditorBorderInset} onChange={(event) => setArtworkEditorBorderInset(Math.max(0, Number(event.target.value) || 0))} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black/25 px-2 text-sm font-bold text-white outline-none focus:border-[#38bdf8]" /><span className="mt-1 block normal-case text-slate-500">inches</span></label><label className="text-[9px] font-black uppercase tracking-wide text-slate-500">Thickness<input type="number" min="0.0625" max="12" step="0.125" value={artworkEditorBorderThickness} onChange={(event) => setArtworkEditorBorderThickness(Math.max(0.0625, Number(event.target.value) || 0.5))} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black/25 px-2 text-sm font-bold text-white outline-none focus:border-[#38bdf8]" /><span className="mt-1 block normal-case text-slate-500">inches</span></label></div>
                <label className="mt-2 flex items-center justify-between rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-[10px] font-bold uppercase text-slate-400">Border color<input type="color" value={artworkEditorBorderColor} onChange={(event) => setArtworkEditorBorderColor(event.target.value)} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent" /></label>
                <div className="mt-3 grid gap-2"><button type="button" onClick={addOrUpdateArtworkEditorBorder} className="w-full rounded-lg bg-[#1686c9] px-3 py-2.5 text-[10px] font-black uppercase text-white hover:bg-[#0f75b5]">Add / Update Border</button><button type="button" onClick={() => { const recommended = getRecommendedBorderSize(artworkEditorSource?.signWidth, artworkEditorSource?.signHeight); setArtworkEditorBorderInset(recommended.inset); setArtworkEditorBorderThickness(recommended.thickness); }} className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-bold text-slate-300 hover:border-white/25">Use Recommended Size</button></div>
              </div>
              <p className="mt-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Canvas</p>
              <label className="mt-2 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-slate-300">Background<input type="color" value={artworkEditorBackground} onChange={(event) => setArtworkEditorCanvasBackground(event.target.value)} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent" /></label>
              <button type="button" onClick={() => { const next = !artworkEditorSnapToCenter; setArtworkEditorSnapToCenter(next); artworkEditorSnapToCenterRef.current = next; }} className={`mt-2 flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-xs font-bold ${artworkEditorSnapToCenter ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/[0.04] text-slate-400'}`}><span>Snap to center</span><span>{artworkEditorSnapToCenter ? 'ON' : 'OFF'}</span></button>
              <button type="button" onClick={() => setArtworkEditorShowGuides((value) => !value)} className={`mt-2 flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-xs font-bold ${artworkEditorShowGuides ? 'border-[#38bdf8]/25 bg-[#38bdf8]/10 text-[#9be8ff]' : 'border-white/10 bg-white/[0.04] text-slate-400'}`}><span>Bleed & safe guides</span><span>{artworkEditorShowGuides ? 'ON' : 'OFF'}</span></button>
              <div className="mt-2 grid grid-cols-2 gap-1"><button type="button" onClick={() => setArtworkEditorVerticalGuides((current) => [...current, 50])} className="rounded-lg border border-white/10 bg-white/[0.04] py-2 text-[9px] font-bold text-slate-300">+ Vertical guide</button><button type="button" onClick={() => setArtworkEditorHorizontalGuides((current) => [...current, 50])} className="rounded-lg border border-white/10 bg-white/[0.04] py-2 text-[9px] font-bold text-slate-300">+ Horizontal guide</button><button type="button" onClick={() => { setArtworkEditorVerticalGuides([]); setArtworkEditorHorizontalGuides([]); }} className="col-span-2 rounded-lg border border-white/10 bg-white/[0.04] py-2 text-[9px] text-slate-400">Clear draggable guides</button></div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => adjustArtworkEditorBase('fit')} className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-2 text-xs font-bold text-slate-200 hover:border-[#38bdf8]/50">Fit artwork</button>
                <button type="button" onClick={() => adjustArtworkEditorBase('fill')} className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-2 text-xs font-bold text-slate-200 hover:border-[#38bdf8]/50">Fill / crop</button>
                <button type="button" onClick={() => adjustArtworkEditorBase('stretch')} className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-2 text-xs font-bold text-slate-200 hover:border-[#38bdf8]/50">Stretch</button>
                <button type="button" onClick={() => adjustArtworkEditorBase('center')} className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-2 text-xs font-bold text-slate-200 hover:border-[#38bdf8]/50">Center</button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
                <button type="button" onClick={() => setArtworkEditorCanvasZoom(artworkEditorZoom - 0.1)} className="rounded-lg py-2 text-sm font-black hover:bg-white/10">−</button>
                <button type="button" onClick={resetArtworkEditorCanvasZoom} className="rounded-lg py-2 text-xs font-bold hover:bg-white/10">{Math.round(artworkEditorZoom * 100)}%</button>
                <button type="button" onClick={() => setArtworkEditorCanvasZoom(artworkEditorZoom + 0.1)} className="rounded-lg py-2 text-sm font-black hover:bg-white/10">+</button>
              </div>
              <p className="mt-2 text-[10px] leading-4 text-slate-500">Hold Alt and drag the canvas to pan while zoomed.</p>
              <div className="mt-6 rounded-xl border border-[#38bdf8]/15 bg-[#0c2a40]/55 p-3 text-xs leading-5 text-slate-300"><strong className="text-[#8be3ff]">Next phase:</strong> smart removal, background replacement, recoloring, and restoration through Cloudinary.</div>
              </div>}
            </aside>
            <main onPointerDown={(event: ReactPointerEvent<HTMLElement>) => { const target = event.target as HTMLElement; if (!target.closest('[data-artwork-artboard]') && !target.closest('[data-print-view-toggle]')) clearArtworkEditorSelection(); }} className="hue-mobile-editor-canvas relative flex min-h-[420px] min-w-0 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.10),transparent_58%),linear-gradient(45deg,rgba(255,255,255,0.025)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.025)_75%),linear-gradient(45deg,rgba(255,255,255,0.025)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.025)_75%)] bg-[length:auto,24px_24px,24px_24px] bg-[position:center,0_0,12px_12px] p-3 sm:p-5">
              <button data-print-view-toggle type="button" onClick={toggleArtworkEditorPrintView} className={`absolute right-3 top-3 z-40 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wide shadow-[0_10px_28px_rgba(0,0,0,0.3)] backdrop-blur sm:right-5 sm:top-5 ${artworkEditorPrintView ? 'border-emerald-300/45 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25' : 'border-[#38bdf8]/40 bg-[#071827]/90 text-[#9be8ff] hover:border-[#67d8ff] hover:bg-[#0c2a40]'}`}>{artworkEditorPrintView ? 'Exit Print View' : 'Print View'}</button>
              <div className="relative max-h-full max-w-full overflow-visible pl-5 pt-5">
                {artworkEditorShowGuides && !artworkEditorPrintView && artworkEditorSource ? <>
                  <div className="pointer-events-none absolute left-5 right-0 top-0 z-20 h-4 rounded-t border border-b-0 border-sky-400/35 bg-[repeating-linear-gradient(90deg,rgba(14,165,233,.65)_0_1px,transparent_1px_10px)] bg-slate-950/75" />
                  <div className="pointer-events-none absolute bottom-0 left-0 top-5 z-20 w-4 rounded-l border border-r-0 border-sky-400/35 bg-[repeating-linear-gradient(0deg,rgba(14,165,233,.65)_0_1px,transparent_1px_10px)] bg-slate-950/75" />
                  <span className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#38bdf8]/40 bg-[#061524]/95 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#9be8ff] shadow-[0_0_24px_rgba(14,165,233,0.22)]">Artboard {formatArtworkInches(artworkEditorSource.width, artworkEditorSource.height, artworkEditorSource.signWidth, artworkEditorSource.signHeight)}</span>
                </> : null}
                <div data-artwork-artboard ref={artworkEditorViewportRef} className={`relative max-h-full max-w-full overflow-auto rounded-lg bg-white shadow-[0_22px_70px_rgba(0,0,0,0.55),0_0_35px_rgba(14,165,233,0.14)] ${artworkEditorPrintView ? 'border border-white/20' : 'border border-[#67d8ff]/35'}`}><canvas ref={artworkEditorCanvasElRef} />{artworkEditorShowGuides && !artworkEditorPrintView && artworkEditorSource ? <div className="pointer-events-none absolute inset-0"><div className="absolute border border-dashed border-red-500/70" style={{ inset: `${Math.min(8, (0.125 / Math.max(1, Math.min(artworkEditorSource.signWidth || 24, artworkEditorSource.signHeight || 18))) * 100)}%` }} /><div className="absolute border border-dashed border-emerald-500/70" style={{ inset: `${Math.min(12, (0.5 / Math.max(1, Math.min(artworkEditorSource.signWidth || 24, artworkEditorSource.signHeight || 18))) * 100)}%` }} /><div className="absolute left-1/2 top-0 h-full border-l border-dashed border-[#38bdf8]/35" /><div className="absolute left-0 top-1/2 w-full border-t border-dashed border-[#38bdf8]/35" />{artworkEditorVerticalGuides.map((position, index) => <button key={`v-${index}`} type="button" title="Drag guide; double-click to remove" onPointerDown={(event) => beginArtworkEditorGuideDrag('vertical', index, event)} onDoubleClick={() => setArtworkEditorVerticalGuides((current) => current.filter((_, guideIndex) => guideIndex !== index))} className="pointer-events-auto absolute top-0 z-30 h-full w-3 -translate-x-1/2 cursor-ew-resize border-0 bg-transparent p-0" style={{ left: `${position}%` }}><span className="absolute left-1/2 top-0 h-full border-l border-dashed border-fuchsia-400/90" /></button>)}{artworkEditorHorizontalGuides.map((position, index) => <button key={`h-${index}`} type="button" title="Drag guide; double-click to remove" onPointerDown={(event) => beginArtworkEditorGuideDrag('horizontal', index, event)} onDoubleClick={() => setArtworkEditorHorizontalGuides((current) => current.filter((_, guideIndex) => guideIndex !== index))} className="pointer-events-auto absolute left-0 z-30 h-3 w-full -translate-y-1/2 cursor-ns-resize border-0 bg-transparent p-0" style={{ top: `${position}%` }}><span className="absolute left-0 top-1/2 w-full border-t border-dashed border-fuchsia-400/90" /></button>)}<span className="absolute left-5 top-5 rounded bg-red-600/80 px-1.5 py-0.5 text-[8px] font-black uppercase text-white">Bleed</span><span className="absolute bottom-2 right-2 rounded bg-emerald-600/80 px-1.5 py-0.5 text-[8px] font-black uppercase text-white">Safe Area</span></div> : null}</div>
              </div>
              {!artworkEditorPrintView ? <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-[#02070d]/75 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{artworkEditorSide} side · Drag handles to resize · Double-click text to edit</span> : null}
            </main>
            <aside className={`hue-mobile-editor-properties max-h-[55vh] min-h-0 overflow-y-auto border-l border-white/10 bg-[#07131f] p-4 lg:max-h-none ${artworkEditorPrintView ? 'hidden' : ''}`}>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">Properties</p>
              {artworkEditorActiveObject ? <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3"><p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">Exact position & size (inches)</p><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[8px] font-bold uppercase text-slate-500">Center X<input type="number" step="0.01" value={artworkEditorExactX} onChange={(event) => setArtworkEditorExactX(Number(event.target.value))} onBlur={() => updateArtworkEditorExactTransform('x', artworkEditorExactX)} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/25 px-2 text-xs text-white" /></label><label className="text-[8px] font-bold uppercase text-slate-500">Center Y<input type="number" step="0.01" value={artworkEditorExactY} onChange={(event) => setArtworkEditorExactY(Number(event.target.value))} onBlur={() => updateArtworkEditorExactTransform('y', artworkEditorExactY)} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/25 px-2 text-xs text-white" /></label><label className="text-[8px] font-bold uppercase text-slate-500">Width<input type="number" min="0.01" step="0.01" value={artworkEditorExactWidth} onChange={(event) => setArtworkEditorExactWidth(Number(event.target.value))} onBlur={() => updateArtworkEditorExactTransform('width', artworkEditorExactWidth)} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/25 px-2 text-xs text-white" /></label><label className="text-[8px] font-bold uppercase text-slate-500">Height<input type="number" min="0.01" step="0.01" value={artworkEditorExactHeight} onChange={(event) => setArtworkEditorExactHeight(Number(event.target.value))} onBlur={() => updateArtworkEditorExactTransform('height', artworkEditorExactHeight)} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/25 px-2 text-xs text-white" /></label><label className="col-span-2 text-[8px] font-bold uppercase text-slate-500">Rotation<input type="number" step="1" value={artworkEditorExactRotation} onChange={(event) => setArtworkEditorExactRotation(Number(event.target.value))} onBlur={() => updateArtworkEditorExactTransform('rotation', artworkEditorExactRotation)} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/25 px-2 text-xs text-white" /></label></div></div>
                {artworkEditorActiveObject.type === 'activeSelection' ? <div className="rounded-xl border border-[#38bdf8]/20 bg-[#0c2a40]/35 p-3"><div className="grid grid-cols-3 gap-1">{(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map((mode) => <button key={mode} type="button" onClick={() => alignArtworkEditorSelection(mode)} className="rounded-lg border border-white/10 bg-white/[0.05] px-1 py-2 text-[9px] font-bold capitalize text-slate-200">{mode}</button>)}</div><div className="mt-1 grid grid-cols-2 gap-1"><button type="button" onClick={() => alignArtworkEditorSelection('distribute-x')} className="rounded-lg border border-white/10 bg-white/[0.05] py-2 text-[9px] text-slate-200">Space X</button><button type="button" onClick={() => alignArtworkEditorSelection('distribute-y')} className="rounded-lg border border-white/10 bg-white/[0.05] py-2 text-[9px] text-slate-200">Space Y</button></div><button type="button" onClick={groupArtworkEditorSelection} className="mt-2 w-full rounded-lg bg-[#1686c9] py-2 text-[10px] font-black uppercase text-white">Group selection</button></div> : artworkEditorActiveObject.type === 'group' ? <button type="button" onClick={groupArtworkEditorSelection} className="w-full rounded-lg border border-[#38bdf8]/30 bg-[#0c2a40] py-2 text-[10px] font-black uppercase text-[#9be8ff]">Ungroup elements</button> : null}
                {artworkEditorActiveObject.type === 'i-text' ? <>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Font<select value={artworkEditorFont} onChange={(event) => { setArtworkEditorFont(event.target.value); updateArtworkEditorSelected({ fontFamily: event.target.value } as Partial<FabricObject>); }} className="mt-1 h-10 w-full rounded-xl border border-white/15 bg-[#0a1928] px-3 text-sm normal-case text-white outline-none">{FONT_OPTIONS.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}</select></label>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Font size<input type="number" min="8" max="400" value={artworkEditorFontSize} onChange={(event) => { const value = Math.max(8, Number(event.target.value) || 8); setArtworkEditorFontSize(value); updateArtworkEditorSelected({ fontSize: value } as Partial<FabricObject>); }} className="mt-1 h-10 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-sm text-white outline-none" /></label>
                  <div className="grid grid-cols-2 gap-2"><label className="block text-[9px] font-bold uppercase tracking-wide text-slate-500">Letter spacing<input type="number" min="-100" max="500" step="10" value={artworkEditorCharSpacing} onChange={(event) => { const value = Math.max(-100, Math.min(500, Number(event.target.value) || 0)); setArtworkEditorCharSpacing(value); updateArtworkEditorSelected({ charSpacing: value } as Partial<FabricObject>); }} className="mt-1 h-10 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-sm text-white outline-none" /></label><label className="block text-[9px] font-bold uppercase tracking-wide text-slate-500">Line height<input type="number" min="0.6" max="3" step="0.05" value={artworkEditorLineHeight} onChange={(event) => { const value = Math.max(0.6, Math.min(3, Number(event.target.value) || 1)); setArtworkEditorLineHeight(value); updateArtworkEditorSelected({ lineHeight: value } as Partial<FabricObject>); }} className="mt-1 h-10 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-sm text-white outline-none" /></label></div>
                  <div className="grid grid-cols-5 gap-1"><button type="button" onClick={() => { const object = artworkEditorCanvasRef.current?.getActiveObject() as IText | undefined; if (!object) return; object.set({ fontWeight: object.fontWeight === 'bold' ? 'normal' : 'bold' }); commitArtworkEditorChange(object); }} className="rounded-lg border border-white/10 bg-white/[0.05] py-2 font-black">B</button><button type="button" onClick={() => { const object = artworkEditorCanvasRef.current?.getActiveObject() as IText | undefined; if (!object) return; object.set({ fontStyle: object.fontStyle === 'italic' ? 'normal' : 'italic' }); commitArtworkEditorChange(object); }} className="rounded-lg border border-white/10 bg-white/[0.05] py-2 font-serif italic">I</button>{(['left', 'center', 'right'] as const).map((alignment) => <button key={alignment} type="button" title={`Align ${alignment}`} onClick={() => { const object = artworkEditorCanvasRef.current?.getActiveObject() as IText | undefined; if (!object) return; object.set({ textAlign: alignment }); commitArtworkEditorChange(object); }} className="rounded-lg border border-white/10 bg-white/[0.05] py-2 text-xs">{alignment === 'left' ? '≡' : alignment === 'center' ? '☰' : '≣'}</button>)}</div>
                  <button type="button" onClick={() => transformArtworkEditorSelected('uppercase')} className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-200 hover:border-[#38bdf8]/40">Convert to uppercase</button>
                  <div className="rounded-xl border border-[#38bdf8]/20 bg-[#0c2a40]/35 p-3"><p className="text-[9px] font-black uppercase tracking-wide text-[#8be3ff]">Curved / arched text</p><label className="mt-2 block text-[8px] text-slate-400">Curve <span className="float-right">{artworkEditorTextCurve}</span><input type="range" min="-100" max="100" value={artworkEditorTextCurve} onChange={(event) => setArtworkEditorTextCurve(Number(event.target.value))} className="w-full accent-[#38bdf8]" /></label><div className="mt-2 grid grid-cols-2 gap-1"><button type="button" onClick={() => applyArtworkEditorTextCurve()} className="rounded-lg bg-[#1686c9] py-2 text-[9px] font-black uppercase">Apply curve</button><button type="button" onClick={() => { setArtworkEditorTextCurve(0); applyArtworkEditorTextCurve(0); }} className="rounded-lg border border-white/10 bg-white/[0.05] py-2 text-[9px]">Straight</button></div></div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3"><p className="text-[9px] font-black uppercase tracking-wide text-slate-500">Text box + second outline</p><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[8px] uppercase text-slate-500">Box color<input type="color" value={artworkEditorTextBoxColor} onChange={(event) => setArtworkEditorTextBoxColor(event.target.value)} className="mt-1 h-8 w-full bg-transparent" /></label><label className="text-[8px] uppercase text-slate-500">Padding<input type="number" min="0" max="100" value={artworkEditorTextBoxPadding} onChange={(event) => setArtworkEditorTextBoxPadding(Number(event.target.value))} className="mt-1 h-8 w-full rounded border border-white/10 bg-black/25 px-2 text-white" /></label></div><button type="button" onClick={addArtworkEditorTextBackground} className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.05] py-2 text-[9px] font-bold">Add background box</button><div className="mt-2 grid grid-cols-2 gap-2"><input type="color" value={artworkEditorOuterOutlineColor} onChange={(event) => setArtworkEditorOuterOutlineColor(event.target.value)} className="h-8 w-full bg-transparent" /><input type="number" min="1" max="50" value={artworkEditorOuterOutlineWidth} onChange={(event) => setArtworkEditorOuterOutlineWidth(Number(event.target.value))} className="h-8 w-full rounded border border-white/10 bg-black/25 px-2 text-white" /></div><button type="button" onClick={() => { void addArtworkEditorOuterOutline(); }} className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.05] py-2 text-[9px] font-bold">Add second outline layer</button></div>
                </> : null}
                {artworkEditorActiveObject.type === 'image' ? <div className="rounded-xl border border-[#38bdf8]/20 bg-[#0c2a40]/45 p-3"><p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#8be3ff]">Hue AI quick tools</p><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" disabled={Boolean(artworkEditorAiAction)} onClick={() => { void runArtworkEditorQuickAi('remove-background'); }} className="rounded-lg border border-[#38bdf8]/35 bg-[#1686c9] px-2 py-2 text-[9px] font-black uppercase text-white hover:bg-[#0f6da8] disabled:cursor-wait disabled:opacity-50">{artworkEditorAiAction === 'remove-background' ? 'Working...' : 'Remove BG'}</button><button type="button" disabled={Boolean(artworkEditorAiAction)} onClick={() => { void runArtworkEditorQuickAi('restore'); }} className="rounded-lg border border-white/10 bg-white/[0.06] px-2 py-2 text-[9px] font-black uppercase text-slate-100 hover:border-[#38bdf8]/45 disabled:cursor-wait disabled:opacity-50">{artworkEditorAiAction === 'restore' ? 'Working...' : 'Enhance'}</button></div><p className="mt-2 text-[8px] leading-4 text-slate-400">Applies to the selected image layer and keeps it on this artboard.</p><p className="mt-4 text-[10px] font-black uppercase tracking-[0.15em] text-[#8be3ff]">Image placement</p><div className="mt-2 grid grid-cols-3 gap-1"><button type="button" onClick={() => fitArtworkEditorSelectedImage('fit')} className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-2 text-[10px] font-bold text-slate-200 hover:border-[#38bdf8]/50">Fit</button><button type="button" onClick={() => fitArtworkEditorSelectedImage('fill')} className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-2 text-[10px] font-bold text-slate-200 hover:border-[#38bdf8]/50">Background</button><button type="button" onClick={() => fitArtworkEditorSelectedImage('stretch')} className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-2 text-[10px] font-bold text-slate-200 hover:border-[#38bdf8]/50">Stretch</button></div><p className="mt-3 text-[9px] font-black uppercase tracking-wide text-slate-500">Crop frame</p><div className="mt-1 grid grid-cols-3 gap-1"><button type="button" onClick={() => applyArtworkEditorImageMask('none')} className="rounded-lg border border-white/10 bg-white/[0.05] py-2 text-[9px] text-slate-200">None</button><button type="button" onClick={() => applyArtworkEditorImageMask('circle')} className="rounded-lg border border-white/10 bg-white/[0.05] py-2 text-[9px] text-slate-200">Circle</button><button type="button" onClick={() => applyArtworkEditorImageMask('rounded')} className="rounded-lg border border-white/10 bg-white/[0.05] py-2 text-[9px] text-slate-200">Rounded</button></div><p className="mt-3 text-[9px] font-black uppercase tracking-wide text-slate-500">Image adjustments</p><label className="mt-1 block text-[8px] text-slate-400">Brightness<input type="range" min="-1" max="1" step="0.05" value={artworkEditorBrightness} onChange={(event) => setArtworkEditorBrightness(Number(event.target.value))} className="w-full accent-[#38bdf8]" /></label><label className="block text-[8px] text-slate-400">Contrast<input type="range" min="-1" max="1" step="0.05" value={artworkEditorContrast} onChange={(event) => setArtworkEditorContrast(Number(event.target.value))} className="w-full accent-[#38bdf8]" /></label><label className="block text-[8px] text-slate-400">Saturation<input type="range" min="-1" max="1" step="0.05" value={artworkEditorSaturation} onChange={(event) => setArtworkEditorSaturation(Number(event.target.value))} className="w-full accent-[#38bdf8]" /></label><button type="button" onClick={applyArtworkEditorImageFilters} className="mt-2 w-full rounded-lg bg-[#1686c9] py-2 text-[9px] font-black uppercase text-white">Apply adjustments</button></div> : <>
                  <div className="grid grid-cols-2 gap-2"><label className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-[10px] font-bold uppercase text-slate-500">Fill<input type="color" value={artworkEditorFill} onChange={(event) => { setArtworkEditorFill(event.target.value); updateArtworkEditorSelected({ fill: event.target.value }); }} className="mt-1 h-8 w-full cursor-pointer rounded bg-transparent" /></label><label className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-[10px] font-bold uppercase text-slate-500">Outline<input type="color" value={artworkEditorStroke} onChange={(event) => { setArtworkEditorStroke(event.target.value); updateArtworkEditorSelected({ stroke: event.target.value }); }} className="mt-1 h-8 w-full cursor-pointer rounded bg-transparent" /></label></div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Outline width <span className="float-right text-slate-300">{artworkEditorStrokeWidth}px</span><input type="range" min="0" max="20" value={artworkEditorStrokeWidth} onChange={(event) => { const value = Number(event.target.value); setArtworkEditorStrokeWidth(value); updateArtworkEditorSelected({ strokeWidth: value, stroke: value > 0 ? artworkEditorStroke : undefined }); }} className="mt-2 w-full accent-[#38bdf8]" /></label>
                </>}
                {artworkEditorActiveObject.type === 'image' ? <div className="rounded-xl border border-[#38bdf8]/20 bg-[#0c2a40]/35 p-3"><p className="text-[9px] font-black uppercase tracking-wide text-[#8be3ff]">Advanced freeform crop (%)</p><p className="mt-1 text-[8px] leading-4 text-slate-500">Trim each edge independently without deleting the original pixels.</p><div className="mt-2 grid grid-cols-2 gap-1">{(['left', 'right', 'top', 'bottom'] as const).map((edge) => <label key={edge} className="text-[8px] capitalize text-slate-400">{edge}<input type="number" min="0" max="90" value={artworkEditorCrop[edge]} onChange={(event) => setArtworkEditorCrop((current) => ({ ...current, [edge]: Number(event.target.value) }))} className="mt-1 h-8 w-full rounded border border-white/10 bg-black/25 px-2 text-white" /></label>)}</div><button type="button" onClick={applyArtworkEditorFreeCrop} className="mt-2 w-full rounded-lg bg-[#1686c9] py-2 text-[9px] font-black uppercase text-white">Apply custom crop</button></div> : null}
                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3"><p className="text-[9px] font-black uppercase tracking-wide text-slate-500">Adjustable shadow</p><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[8px] uppercase text-slate-500">Color<input type="color" value={artworkEditorShadowColor} onChange={(event) => setArtworkEditorShadowColor(event.target.value)} className="mt-1 h-8 w-full bg-transparent" /></label><label className="text-[8px] uppercase text-slate-500">Opacity<input type="number" min="0" max="100" value={artworkEditorShadowOpacity} onChange={(event) => setArtworkEditorShadowOpacity(Number(event.target.value))} className="mt-1 h-8 w-full rounded border border-white/10 bg-black/25 px-2 text-white" /></label><label className="text-[8px] uppercase text-slate-500">Blur<input type="number" min="0" max="100" value={artworkEditorShadowBlur} onChange={(event) => setArtworkEditorShadowBlur(Number(event.target.value))} className="mt-1 h-8 w-full rounded border border-white/10 bg-black/25 px-2 text-white" /></label><label className="text-[8px] uppercase text-slate-500">Offset X<input type="number" min="-100" max="100" value={artworkEditorShadowOffsetX} onChange={(event) => setArtworkEditorShadowOffsetX(Number(event.target.value))} className="mt-1 h-8 w-full rounded border border-white/10 bg-black/25 px-2 text-white" /></label><label className="text-[8px] uppercase text-slate-500">Offset Y<input type="number" min="-100" max="100" value={artworkEditorShadowOffsetY} onChange={(event) => setArtworkEditorShadowOffsetY(Number(event.target.value))} className="mt-1 h-8 w-full rounded border border-white/10 bg-black/25 px-2 text-white" /></label></div><div className="mt-2 grid grid-cols-2 gap-1"><button type="button" onClick={() => applyArtworkEditorShadow()} className="rounded-lg bg-[#1686c9] py-2 text-[9px] font-black uppercase">Apply</button><button type="button" onClick={() => applyArtworkEditorShadow(true)} className="rounded-lg border border-white/10 py-2 text-[9px]">Remove</button></div></div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Opacity <span className="float-right text-slate-300">{artworkEditorOpacity}%</span><input type="range" min="10" max="100" value={artworkEditorOpacity} onChange={(event) => { const value = Number(event.target.value); setArtworkEditorOpacity(value); updateArtworkEditorSelected({ opacity: value / 100 }); }} className="mt-2 w-full accent-[#38bdf8]" /></label>
                <div><p className="mb-2 text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">Quick effects</p><div className="grid grid-cols-4 gap-1"><button type="button" title="Rotate 90 degrees" onClick={() => transformArtworkEditorSelected('rotate')} className="rounded-lg border border-white/10 bg-white/[0.05] py-2 text-xs text-slate-200 hover:border-[#38bdf8]/40">↻ 90°</button><button type="button" title="Flip horizontally" onClick={() => transformArtworkEditorSelected('flip-horizontal')} className="rounded-lg border border-white/10 bg-white/[0.05] py-2 text-xs text-slate-200 hover:border-[#38bdf8]/40">⇆</button><button type="button" title="Flip vertically" onClick={() => transformArtworkEditorSelected('flip-vertical')} className="rounded-lg border border-white/10 bg-white/[0.05] py-2 text-xs text-slate-200 hover:border-[#38bdf8]/40">⇅</button><button type="button" title="Toggle drop shadow" onClick={() => transformArtworkEditorSelected('shadow')} className="rounded-lg border border-white/10 bg-white/[0.05] py-2 text-xs text-slate-200 hover:border-[#38bdf8]/40">Shadow</button></div></div>
                <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => centerArtworkEditorSelected('horizontal')} className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-2 text-xs">Center X</button><button type="button" onClick={() => centerArtworkEditorSelected('vertical')} className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-2 text-xs">Center Y</button><button type="button" onClick={() => { void duplicateArtworkEditorSelected(); }} className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-2 text-xs">Duplicate</button><button type="button" onClick={deleteArtworkEditorSelected} className="rounded-lg border border-red-400/20 bg-red-500/10 px-2 py-2 text-xs text-red-200">Delete</button><button type="button" onClick={() => { const layerId = (artworkEditorCanvasRef.current?.getActiveObject() as FabricObject & { data?: { layerId?: string } } | undefined)?.data?.layerId; if (layerId) toggleArtworkEditorLayerLock(layerId); }} className="col-span-2 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] px-2 py-2 text-xs font-bold text-amber-100">🔒 Lock selected layer</button></div>
                <div className="grid grid-cols-4 gap-1"><button type="button" title="Send to back" onClick={() => moveArtworkEditorLayer('back')} className="rounded-lg border border-white/10 bg-white/[0.05] py-2 text-xs">⇊</button><button type="button" title="Move backward" onClick={() => moveArtworkEditorLayer('backward')} className="rounded-lg border border-white/10 bg-white/[0.05] py-2 text-xs">↓</button><button type="button" title="Move forward" onClick={() => moveArtworkEditorLayer('forward')} className="rounded-lg border border-white/10 bg-white/[0.05] py-2 text-xs">↑</button><button type="button" title="Bring to front" onClick={() => moveArtworkEditorLayer('front')} className="rounded-lg border border-white/10 bg-white/[0.05] py-2 text-xs">⇈</button></div>
              </div> : <div className="mt-3 rounded-xl border border-dashed border-white/15 bg-white/[0.035] p-4 text-sm leading-6 text-slate-400">Select text or a shape on the artwork to edit its properties.</div>}
              <div className="mt-6 flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">Layers</p><span className="rounded-full bg-[#0c2a40] px-2 py-1 text-[10px] font-bold text-[#8be3ff]">{artworkEditorLayers.length}</span></div>
              <div className="mt-2 space-y-1">{artworkEditorLayers.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-3 text-xs text-slate-500">Add an image, text, shape, or border to create layers.</p> : artworkEditorLayers.map((layer) => <div key={layer.id} className={`flex min-w-0 items-center rounded-lg border ${layer.isActive ? 'border-[#38bdf8]/60 bg-[#0c2a40]' : layer.isLocked ? 'border-amber-300/20 bg-amber-300/[0.04]' : 'border-white/10 bg-white/[0.035] hover:border-white/20'}`}><button type="button" onClick={() => { if (layer.isLocked) { setArtworkEditorStatus(`${layer.name} is locked. Use the lock button to make it editable.`); return; } const canvas = artworkEditorCanvasRef.current; const object = canvas?.getObjects().find((entry) => (entry as FabricObject & { data?: { layerId?: string } }).data?.layerId === layer.id); if (!canvas || !object) return; canvas.setActiveObject(object); canvas.requestRenderAll(); syncArtworkEditorControls(object); refreshArtworkEditorLayers(canvas); }} className={`flex min-w-0 flex-1 items-center justify-between px-3 py-2 text-left text-xs ${layer.isActive ? 'text-white' : 'text-slate-300'}`}><span className="truncate font-bold">{layer.name}</span><span className="ml-2 shrink-0 text-[9px] uppercase text-slate-500">{layer.type}</span></button><button type="button" onClick={() => moveArtworkEditorLayerById(layer.id, 'up')} title="Move layer up" aria-label={`Move ${layer.name} up`} className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-xs text-slate-400 hover:bg-white/10 hover:text-white">↑</button><button type="button" onClick={() => moveArtworkEditorLayerById(layer.id, 'down')} title="Move layer down" aria-label={`Move ${layer.name} down`} className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-xs text-slate-400 hover:bg-white/10 hover:text-white">↓</button><button type="button" onClick={() => toggleArtworkEditorLayerLock(layer.id)} title={layer.isLocked ? 'Unlock layer' : 'Lock layer'} aria-label={layer.isLocked ? `Unlock ${layer.name}` : `Lock ${layer.name}`} className={`mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs ${layer.isLocked ? 'bg-amber-300/15 text-amber-200 hover:bg-amber-300/25' : 'text-slate-500 hover:bg-white/10 hover:text-white'}`}>{layer.isLocked ? '🔒' : '🔓'}</button></div>)}</div>
            </aside>
          </div>
          <footer className="hue-mobile-editor-footer flex flex-wrap items-center gap-3 border-t border-white/10 bg-[#050d16] px-5 py-3">
            <p className={`min-w-0 flex-1 text-xs leading-5 ${artworkEditorStatus.toLowerCase().includes('could not') ? 'font-bold text-amber-300' : 'text-slate-400'}`}>{artworkEditorStatus}</p>
            <button type="button" disabled={isArtworkEditorSaving} onClick={closeArtworkEditor} className="rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-bold text-slate-300 hover:bg-white/[0.1] disabled:opacity-40">Cancel</button>
            <button type="button" disabled={isArtworkEditorSaving} onClick={() => { void saveArtworkEditorCopy(); }} className="rounded-xl bg-[#1686c9] px-6 py-3 text-sm font-black uppercase text-white shadow-[0_12px_30px_rgba(14,165,233,0.25)] hover:bg-[#0f6da8] disabled:cursor-wait disabled:opacity-50">{isArtworkEditorSaving ? 'Saving design...' : artworkEditorOrderReturn ? 'Save & Return to Order Builder' : 'Save to Image Zone'}</button>
          </footer>
        </section>
      </div> : null}

      {showSmartTemplateLibrary ? (() => {
        const query = smartTemplateSearch.trim().toLowerCase();
        const filteredTemplates = SMART_TEMPLATES.filter((template) => {
          const family = getSmartTemplateFamily(template);
          return (smartTemplateCategory === 'All' || template.category === smartTemplateCategory)
            && (smartTemplateStyle === 'All' || template.style === smartTemplateStyle)
            && (smartTemplateFamily === 'All' || family.id === smartTemplateFamily)
            && (!query || `${template.name} ${template.category} ${template.style} ${family.name} ${template.headline} ${template.description} ${template.tags.join(' ')}`.toLowerCase().includes(query));
        });
        const selectedTemplate = SMART_TEMPLATES.find((template) => template.id === selectedSmartTemplateId) || null;
        const selectedFamily = selectedTemplate ? getSmartTemplateFamily(selectedTemplate) : null;
        const browseModes: Array<{ id: SmartTemplateBrowseMode; label: string; description: string }> = [
          { id: 'industry', label: 'Industry', description: 'Find templates made for your type of business or event.' },
          { id: 'style', label: 'Design Style', description: 'Start with the overall look and personality you want.' },
          { id: 'family', label: 'Design Family', description: 'Browse reusable Hue layout systems and typography.' }
        ];
        const browseOptions = smartTemplateBrowseMode === 'industry'
          ? SMART_TEMPLATE_CATEGORY_FILTERS.map((value) => ({ value, label: value === 'All' ? 'All Industries' : value, count: value === 'All' ? SMART_TEMPLATES.length : SMART_TEMPLATES.filter((template) => template.category === value).length }))
          : smartTemplateBrowseMode === 'style'
            ? SMART_TEMPLATE_STYLE_FILTERS.map((value) => ({ value, label: value === 'All' ? 'All Styles' : value, count: value === 'All' ? SMART_TEMPLATES.length : SMART_TEMPLATES.filter((template) => template.style === value).length }))
            : SMART_TEMPLATE_FAMILY_FILTERS.map((value) => ({ value, label: value === 'All' ? 'All Families' : SMART_TEMPLATE_FAMILY_BY_ID[value].name, count: value === 'All' ? SMART_TEMPLATES.length : SMART_TEMPLATES.filter((template) => template.family === value).length }));
        const activeBrowseValue = smartTemplateBrowseMode === 'industry' ? smartTemplateCategory : smartTemplateBrowseMode === 'style' ? smartTemplateStyle : smartTemplateFamily;
        const selectBrowseOption = (value: string) => {
          setSmartTemplateCategory(smartTemplateBrowseMode === 'industry' ? value as 'All' | SmartTemplateCategory : 'All');
          setSmartTemplateStyle(smartTemplateBrowseMode === 'style' ? value as 'All' | SmartTemplateStyle : 'All');
          setSmartTemplateFamily(smartTemplateBrowseMode === 'family' ? value as 'All' | SmartTemplateFamilyId : 'All');
        };
        const selectBrowseMode = (mode: SmartTemplateBrowseMode) => {
          setSmartTemplateBrowseMode(mode);
          setSmartTemplateCategory('All');
          setSmartTemplateStyle('All');
          setSmartTemplateFamily('All');
        };
        const clearSmartTemplateFilters = () => {
          setSmartTemplateCategory('All');
          setSmartTemplateStyle('All');
          setSmartTemplateFamily('All');
          setSmartTemplateSearch('');
        };
        const hasSmartTemplateFilters = Boolean(query || smartTemplateCategory !== 'All' || smartTemplateStyle !== 'All' || smartTemplateFamily !== 'All');
        const groupedTemplates = filteredTemplates.reduce<Array<{ key: string; label: string; description: string; templates: SmartTemplate[] }>>((groups, template) => {
          const family = getSmartTemplateFamily(template);
          const key = smartTemplateBrowseMode === 'industry' ? template.category : smartTemplateBrowseMode === 'style' ? template.style : family.id;
          const label = smartTemplateBrowseMode === 'family' ? family.name : key;
          const description = smartTemplateBrowseMode === 'family' ? family.description : smartTemplateBrowseMode === 'industry' ? `Professional ${template.category.toLowerCase()} starting points.` : `${template.style} layouts across multiple industries.`;
          const existingGroup = groups.find((group) => group.key === key);
          if (existingGroup) existingGroup.templates.push(template);
          else groups.push({ key, label, description, templates: [template] });
          return groups;
        }, []);
        return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#01050a]/92 p-0 backdrop-blur-xl sm:p-4">
          <section className="flex h-full w-full flex-col overflow-hidden border border-[#38bdf8]/30 bg-[#07111f] text-white shadow-[0_40px_140px_rgba(0,0,0,0.85),0_0_80px_rgba(14,165,233,0.2)] sm:h-[min(900px,94vh)] sm:w-[min(1500px,97vw)] sm:rounded-[26px]">
            <header className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.2),transparent_38%),#071522] px-4 py-4 sm:px-6">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#67d8ff]/35 bg-gradient-to-br from-[#0c2a40] to-violet-700/40 text-xl text-[#9be8ff] shadow-[0_0_28px_rgba(14,165,233,0.18)]">✦</span>
              <div className="mr-auto min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#67d8ff]">Hue Designer</p><h2 className="text-xl font-black sm:text-2xl">Smart Template Library</h2><p className="mt-1 text-xs text-slate-400">Choose a professional layout, add your details, then fine-tune every layer.</p></div>
              <div className="hidden items-center gap-2 xl:flex"><span className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-center"><strong className="block text-sm text-white">{SMART_TEMPLATES.length}</strong><span className="text-[8px] font-black uppercase tracking-wide text-slate-500">Templates</span></span><span className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-center"><strong className="block text-sm text-white">{SMART_TEMPLATE_CATEGORIES.length}</strong><span className="text-[8px] font-black uppercase tracking-wide text-slate-500">Industries</span></span><span className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-center"><strong className="block text-sm text-white">{SMART_TEMPLATE_STYLES.length}</strong><span className="text-[8px] font-black uppercase tracking-wide text-slate-500">Styles</span></span></div>
              <button type="button" onClick={() => setShowSmartTemplateLibrary(false)} className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-xs font-bold uppercase text-slate-300 hover:bg-white/[0.1]">Close</button>
            </header>
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_370px] lg:overflow-hidden">
              <div className="min-h-0 p-4 lg:flex lg:flex-col lg:overflow-hidden lg:p-5">
                <div className="rounded-2xl border border-white/10 bg-[#061524]/70 p-3 shadow-[0_12px_34px_rgba(0,0,0,0.18)]">
                  <div className="grid gap-2 sm:grid-cols-3">{browseModes.map((mode) => <button key={mode.id} type="button" onClick={() => selectBrowseMode(mode.id)} className={`rounded-xl border px-3 py-3 text-left transition ${smartTemplateBrowseMode === mode.id ? 'border-[#67d8ff] bg-[#0c2a40] shadow-[0_0_22px_rgba(14,165,233,0.13)]' : 'border-white/10 bg-white/[0.035] hover:border-[#38bdf8]/40 hover:bg-white/[0.06]'}`}><span className={`block text-[10px] font-black uppercase tracking-[0.14em] ${smartTemplateBrowseMode === mode.id ? 'text-[#9be8ff]' : 'text-slate-300'}`}>Browse by {mode.label}</span><span className="mt-1 hidden text-[9px] leading-4 text-slate-500 xl:block">{mode.description}</span></button>)}</div>
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{browseOptions.map((option) => <button key={option.value} type="button" onClick={() => selectBrowseOption(option.value)} className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-black transition ${activeBrowseValue === option.value ? 'border-[#67d8ff] bg-[#1686c9] text-white shadow-[0_8px_22px_rgba(14,165,233,0.2)]' : 'border-white/10 bg-white/[0.045] text-slate-300 hover:border-[#38bdf8]/45 hover:text-white'}`}><span>{option.label}</span><span className={`rounded-full px-1.5 py-0.5 text-[8px] ${activeBrowseValue === option.value ? 'bg-white/15 text-white' : 'bg-black/25 text-slate-500'}`}>{option.count}</span></button>)}</div>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"><input value={smartTemplateSearch} onChange={(event) => setSmartTemplateSearch(event.target.value)} placeholder="Search by template, industry, style, or keyword..." className="h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/25 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#38bdf8]" />{hasSmartTemplateFilters ? <button type="button" onClick={clearSmartTemplateFilters} className="h-11 shrink-0 rounded-xl border border-white/15 bg-white/[0.05] px-4 text-[10px] font-black uppercase tracking-wide text-slate-300 hover:border-[#38bdf8]/45 hover:text-white">Clear filters</button> : null}</div>
                <div className="mt-3 flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Showing {filteredTemplates.length} of {SMART_TEMPLATES.length} templates</p><p className="text-[10px] text-slate-500">All text and colors remain editable</p></div>
                <div className="mt-3 space-y-5 pb-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
                  {groupedTemplates.map((group) => <section key={group.key} className="rounded-2xl border border-white/[0.07] bg-black/10 p-3"><div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">{smartTemplateBrowseMode === 'industry' ? 'Industry' : smartTemplateBrowseMode === 'style' ? 'Design Style' : 'Design Family'}</p><h3 className="mt-0.5 text-base font-black text-white">{group.label}</h3><p className="mt-1 text-[9px] text-slate-500">{group.description}</p></div><span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[9px] font-black text-slate-400">{group.templates.length}</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{group.templates.map((template) => {
                    const selected = template.id === selectedSmartTemplateId;
                    const family = getSmartTemplateFamily(template);
                    return <button key={template.id} type="button" onClick={() => chooseSmartTemplate(template)} className={`group overflow-hidden rounded-2xl border text-left transition ${selected ? 'border-[#67d8ff] bg-[#0c2a40] shadow-[0_0_28px_rgba(14,165,233,0.2)]' : 'border-white/10 bg-white/[0.035] hover:-translate-y-0.5 hover:border-[#38bdf8]/45 hover:bg-white/[0.06]'}`}><div className="relative aspect-[4/2.45] overflow-hidden bg-[#071522]"><img src={getSmartTemplateThumbnailUrl(template)} alt={`${template.name} template preview`} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.015]" /><span className="absolute left-2 top-2 rounded-full border border-[#38bdf8]/25 bg-[#061827]/90 px-2 py-1 text-[7px] font-black uppercase tracking-wide text-[#67d8ff]">{getSmartTemplateAssetLabel(template)}</span><span className="absolute right-2 top-2 rounded-full border border-black/10 bg-white/90 px-2 py-1 text-[7px] font-black uppercase tracking-wide text-slate-700">{family.name}</span></div><div className="p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-black text-white">{template.name}</p><p className="mt-1 text-[9px] font-black uppercase tracking-wide text-[#67d8ff]">{template.category} / {family.name}</p></div>{selected ? <span className="rounded-full bg-[#22c55e]/15 px-2 py-1 text-[8px] font-black uppercase text-emerald-300">Selected</span> : null}</div><p className="mt-2 text-[10px] leading-4 text-slate-400">{template.description}</p><p className="mt-2 text-[9px] font-bold text-slate-500">Suggested: {template.suggestedSizes.join(' / ')}</p></div></button>;
                  })}</div></section>)}
                  {!filteredTemplates.length ? <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center"><p className="font-black text-white">No matching templates</p><p className="mt-2 text-sm text-slate-400">Try another search or clear the active filters.</p><button type="button" onClick={clearSmartTemplateFilters} className="mt-4 rounded-xl bg-[#1686c9] px-4 py-3 text-xs font-black uppercase text-white">Show all templates</button></div> : null}
                </div>
              </div>
              <aside className="border-t border-white/10 bg-[#06111d] p-5 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
                {selectedTemplate && selectedFamily ? <><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">{selectedFamily.name} family</p><h3 className="mt-1 text-xl font-black">{selectedTemplate.name}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{selectedFamily.description} Enter what you know now, then move, resize, recolor, or replace every generated layer.</p>
                  <div className="mt-5 space-y-3">
                    <label className="block text-[9px] font-black uppercase tracking-wide text-slate-500">Main headline<input value={smartTemplateForm.headline} onChange={(event) => setSmartTemplateForm((form) => ({ ...form, headline: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-sm font-bold text-white outline-none focus:border-[#38bdf8]" /></label>
                    <label className="block text-[9px] font-black uppercase tracking-wide text-slate-500">Supporting message<input value={smartTemplateForm.subheadline} onChange={(event) => setSmartTemplateForm((form) => ({ ...form, subheadline: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#38bdf8]" /></label>
                    <label className="block text-[9px] font-black uppercase tracking-wide text-slate-500">Name, company, or callout<input value={smartTemplateForm.name} onChange={(event) => setSmartTemplateForm((form) => ({ ...form, name: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#38bdf8]" /></label>
                    <div className="grid grid-cols-2 gap-2"><label className="block text-[9px] font-black uppercase tracking-wide text-slate-500">Phone<input value={smartTemplateForm.phone} onChange={(event) => setSmartTemplateForm((form) => ({ ...form, phone: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-xs text-white outline-none focus:border-[#38bdf8]" /></label><label className="block text-[9px] font-black uppercase tracking-wide text-slate-500">Website<input value={smartTemplateForm.website} onChange={(event) => setSmartTemplateForm((form) => ({ ...form, website: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-xs text-white outline-none focus:border-[#38bdf8]" /></label></div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3"><p className="text-[9px] font-black uppercase tracking-wide text-slate-500">Brand colors</p><div className="mt-2 grid grid-cols-3 gap-2">{([['primary', 'Primary'], ['accent', 'Accent'], ['background', 'Canvas']] as const).map(([key, label]) => <label key={key} className="text-center text-[8px] font-bold text-slate-400"><input type="color" value={smartTemplateForm[key]} onChange={(event) => setSmartTemplateForm((form) => ({ ...form, [key]: event.target.value }))} className="h-9 w-full cursor-pointer rounded bg-transparent" /><span>{label}</span></label>)}</div></div>
                    <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3 text-xs font-bold text-slate-300">Include editable QR Code<input type="checkbox" checked={smartTemplateForm.includeQr} onChange={(event) => setSmartTemplateForm((form) => ({ ...form, includeQr: event.target.checked }))} className="h-5 w-5 accent-[#1686c9]" /></label>
                    {smartTemplateForm.includeQr ? <label className="block text-[9px] font-black uppercase tracking-wide text-slate-500">QR destination<input value={smartTemplateForm.qrValue} onChange={(event) => setSmartTemplateForm((form) => ({ ...form, qrValue: event.target.value }))} placeholder="https://yourwebsite.com" className="mt-1 h-10 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-xs text-white outline-none focus:border-[#38bdf8]" /></label> : null}
                  </div>
                  <div className="mt-5 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] p-3 text-[10px] leading-4 text-amber-100/80"><strong className="text-amber-200">Your current editable layers will be replaced.</strong> Hue Designer will ask for confirmation if the canvas already contains a design.</div>
                  <button type="button" disabled={isGeneratingSmartTemplate || !smartTemplateForm.headline.trim()} onClick={() => { void generateSmartTemplate(); }} className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#1686c9] to-violet-600 px-4 py-4 text-xs font-black uppercase tracking-wide text-white shadow-[0_14px_32px_rgba(14,165,233,0.25)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{isGeneratingSmartTemplate ? 'Generating Editable Design…' : 'Generate This Design →'}</button>
                </> : <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-400">Choose a template to customize it.</div>}
              </aside>
            </div>
          </section>
        </div>;
      })() : null}

      {showAiImageEditor ? (() => {
        const source = aiEditSource;
        const aiTools = [
          { id: 'quality-check', title: 'Check Print Quality', tag: 'No credits', description: 'Review size, ratio, and estimated print resolution before editing.' },
          { id: 'restore', title: 'Enhance Artwork', tag: 'Cloudinary AI', description: 'Sharpen edges and clean compression for a better production proof.' },
          { id: 'remove-background', title: 'Remove Background', tag: 'Cloudinary AI', description: 'Isolate the main art and create a transparent PNG proof.' },
          { id: 'remove', title: 'Clean Up / Remove', tag: 'Cloudinary AI', description: 'Remove unwanted marks, text, objects, or background clutter.' },
          { id: 'background', title: 'Replace Background', tag: 'Cloudinary AI', description: 'Generate a new background behind the artwork.' },
          { id: 'recolor', title: 'Recolor Artwork', tag: 'Cloudinary AI', description: 'Change the color of a described logo, object, or design area.' },
          { id: 'replace', title: 'Replace Object', tag: 'Cloudinary AI', description: 'Swap one described object for another while preserving layout.' }
        ] as const;
        const activeAiTool = aiTools.find((tool) => tool.id === aiEditAction) || aiTools[1];
        const promptRequired = !['restore', 'remove-background', 'quality-check'].includes(aiEditAction);
        const quickPrompts = aiEditAction === 'remove' ? ['phone number', 'old date', 'small mark in the corner', 'background clutter'] : aiEditAction === 'background' ? ['clean white studio background', 'subtle dark blue gradient', 'outdoor storefront wall'] : aiEditAction === 'recolor' ? ['logo', 'background', 'main graphic', 'red text'] : aiEditAction === 'replace' ? ['old phone number => new phone number', 'left arrow => right arrow', 'red shape => blue shape'] : [];
        return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#01050a]/90 p-4 backdrop-blur-lg">
          <section className="flex max-h-[92vh] w-[min(1180px,96vw)] flex-col overflow-hidden rounded-[24px] border border-[#38bdf8]/30 bg-[#07111f] text-white shadow-[0_40px_140px_rgba(0,0,0,0.82),0_0_70px_rgba(14,165,233,0.2)]">
            <header className="flex items-center gap-4 border-b border-white/10 bg-[#071522] px-6 py-5">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#67d8ff]/30 bg-[#0c2a40] text-sm font-black shadow-[0_0_28px_rgba(14,165,233,0.2)]">AI</span>
              <div className="mr-auto"><p className="text-[10px] font-black uppercase tracking-[0.26em] text-[#67d8ff]">Hue AI Studio · Cloudinary powered</p><h2 className="mt-1 text-2xl font-black">Artwork Assistant</h2><p className="mt-1 text-xs text-slate-400">Check, clean up, enhance, or create a new proof. Original artwork stays untouched.</p></div>
              <button type="button" disabled={isAiEditing} onClick={() => setShowAiImageEditor(false)} className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-xs font-bold uppercase text-slate-300 hover:bg-white/[0.1] disabled:opacity-40">Close</button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5 lg:p-6">
              <div className="grid gap-5 lg:grid-cols-[1fr_1fr_390px]">
                <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Original</p><div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white">{source ? <img src={source.dataUrl} alt="Original artwork" className="max-h-full max-w-full object-contain" /> : null}</div><p className="mt-2 truncate text-xs text-slate-400">{source?.name}</p></div>
                <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">AI proof</p><div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-[#38bdf8]/25 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.12),transparent_65%)]">{aiEditPreview ? <img src={aiEditPreview.dataUrl} alt="AI edited proof" className="max-h-full max-w-full object-contain" /> : <div className="max-w-52 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#38bdf8]/25 bg-[#0c2a40] text-2xl text-[#67d8ff]">✦</span><p className="mt-4 text-sm font-bold text-slate-300">Your generated proof will appear here</p></div>}{isAiEditing ? <div className="absolute inset-0 flex items-center justify-center bg-[#04101c]/80"><div className="text-center"><span className="mx-auto block h-9 w-9 animate-spin rounded-full border-2 border-[#67d8ff]/25 border-t-[#67d8ff]" /><p className="mt-3 text-xs font-bold text-[#a9ecff]">Working on your proof...</p></div></div> : null}</div></div>
                <div className="rounded-2xl border border-[#38bdf8]/20 bg-[#061524]/85 p-4 shadow-[0_0_34px_rgba(14,165,233,0.08)]">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">Choose a Hue AI tool</p><h3 className="mt-1 text-lg font-black">{activeAiTool.title}</h3></div><span className="rounded-full border border-[#38bdf8]/25 bg-[#0c2a40] px-2.5 py-1 text-[9px] font-black uppercase text-[#9be8ff]">{activeAiTool.tag}</span></div>
                  <div className="mt-4 grid grid-cols-1 gap-2">{aiTools.map((tool) => <button key={tool.id} type="button" onClick={() => { setAiEditAction(tool.id); setAiEditPrompt(''); setAiEditPreview(null); setAiEditStatus(tool.id === 'quality-check' ? 'Run a print-quality check before spending AI credits.' : `Ready for ${tool.title}. Your original artwork will remain untouched.`); }} className={`rounded-xl border p-3 text-left transition ${aiEditAction === tool.id ? 'border-[#67d8ff] bg-[#0c2a40] shadow-[0_0_22px_rgba(14,165,233,0.16)]' : 'border-white/10 bg-white/[0.035] hover:border-[#38bdf8]/45 hover:bg-white/[0.06]'}`}><span className="flex items-center justify-between gap-2"><strong className="text-xs font-black text-white">{tool.title}</strong><span className="text-[9px] font-black uppercase text-slate-500">{tool.tag}</span></span><span className="mt-1 block text-[10px] leading-4 text-slate-400">{tool.description}</span></button>)}</div>
                  <label className="mt-5 block text-xs font-black uppercase tracking-[0.14em] text-[#8be3ff]">{promptRequired ? 'What should Hue AI change?' : 'How this tool works'}</label>
                  {promptRequired ? <textarea value={aiEditPrompt} onChange={(event) => setAiEditPrompt(event.target.value)} maxLength={500} rows={4} placeholder={aiEditAction === 'replace' ? 'Use: what to replace => what should replace it' : aiEditAction === 'recolor' ? 'Describe the object to recolor, such as: logo' : aiEditAction === 'background' ? 'Describe the new background' : 'Describe exactly what should be removed'} className="mt-3 w-full resize-none rounded-xl border border-white/15 bg-black/25 p-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-[#38bdf8] focus:ring-2 focus:ring-[#38bdf8]/10" /> : <p className="mt-3 rounded-xl border border-[#38bdf8]/15 bg-[#0c2a40]/35 p-3 text-xs leading-5 text-slate-300">{aiEditAction === 'restore' ? 'Cloudinary will reduce compression artifacts, sharpen edges, and improve the image.' : aiEditAction === 'remove-background' ? 'Cloudinary will isolate the main foreground and create a transparent background.' : 'Hue Studio will check the saved image dimensions, selected print size, aspect ratio, and estimated DPI without changing the artwork.'}</p>}
                  {aiEditAction === 'recolor' ? <label className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[10px] font-black uppercase text-slate-400">New color<input type="color" value={aiEditTargetColor} onChange={(event) => setAiEditTargetColor(event.target.value)} className="h-9 w-14 bg-transparent" /></label> : null}
                  {quickPrompts.length ? <><p className="mt-4 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Quick instructions</p><div className="mt-2 flex flex-wrap gap-2">{quickPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => setAiEditPrompt(prompt)} className="rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-2 text-left text-[11px] leading-4 text-slate-300 hover:border-[#38bdf8]/50 hover:text-white">{prompt}</button>)}</div></> : null}
                  <label className="mt-5 block text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Proof quality</label>
                  <select value={aiEditQuality} onChange={(event) => setAiEditQuality(event.target.value as 'low' | 'medium' | 'high')} className="mt-2 h-10 w-full rounded-xl border border-white/15 bg-[#0a1928] px-3 text-sm text-white outline-none focus:border-[#38bdf8]"><option value="low">Draft — fastest test</option><option value="medium">Standard — better detail</option><option value="high">Final — highest detail</option></select>
                  <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100/80"><strong className="text-amber-200">Review before print.</strong> AI can alter text, logos, colors, or fine details. This is an editing proof, not production approval.</div>
                </div>
              </div>
              {aiEditStatus ? <p className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">{aiEditStatus}</p> : null}
            </div>
            <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 bg-[#050d16] px-6 py-4">
              <p className={`min-w-0 flex-1 text-xs leading-5 ${aiEditStatus.includes('CLOUDINARY_') || aiEditStatus.toLowerCase().includes('could not') || aiEditStatus.toLowerCase().includes('failed') ? 'font-bold text-amber-300' : 'text-slate-400'}`}>{aiEditStatus}</p>
              <button type="button" disabled={isAiEditing} onClick={() => setShowAiImageEditor(false)} className="rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-bold text-slate-300 hover:bg-white/[0.1] disabled:opacity-40">Cancel</button>
              <button type="button" disabled={isAiEditing || (promptRequired && aiEditPrompt.trim().length < 2)} onClick={generateAiImageEdit} className="rounded-xl border border-[#38bdf8]/45 bg-[#0c2a40] px-5 py-3 text-sm font-black uppercase text-[#a9ecff] hover:bg-[#10364f] disabled:cursor-not-allowed disabled:opacity-35">{aiEditAction === 'quality-check' ? 'Run check' : aiEditPreview ? 'Generate again' : 'Generate edit'}</button>
              <button type="button" disabled={isAiEditing || !aiEditPreview || aiEditAction === 'quality-check'} onClick={saveAiImageEdit} className="rounded-xl bg-[#1686c9] px-6 py-3 text-sm font-black uppercase text-white shadow-[0_12px_30px_rgba(14,165,233,0.25)] hover:bg-[#0f6da8] disabled:cursor-not-allowed disabled:opacity-35">{showArtworkEditor ? 'Save & Add to Design' : 'Save as New Image'}</button>
            </footer>
          </section>
        </div>;
      })() : null}

      {imageZoneProductChoice ? <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#01060c]/90 p-4 backdrop-blur-lg">
        <section className="flex max-h-[90vh] w-[min(1080px,96vw)] flex-col overflow-hidden rounded-[24px] border border-[#38bdf8]/30 bg-[#07111f] text-white shadow-[0_40px_140px_rgba(0,0,0,0.82),0_0_70px_rgba(14,165,233,0.18)]">
          <header className="flex items-center gap-4 border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.2),transparent_38%),#071522] px-5 py-5 md:px-7">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#38bdf8]/30 bg-white p-1 shadow-[0_0_24px_rgba(14,165,233,0.18)]">{canPlaceImageZoneItem(imageZoneProductChoice) ? <img src={imageZoneProductChoice.dataUrl} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs font-black text-slate-500">PDF</span>}</span>
            <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#67d8ff]">Use this artwork</p><h2 className="mt-1 text-2xl font-black">What product are you making?</h2><p className="mt-1 truncate text-xs text-slate-400">{imageZoneProductChoice.name}</p></div>
            <button type="button" onClick={() => setImageZoneProductChoice(null)} className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-white/[0.1]">Cancel</button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-7">
            <p className="mb-5 rounded-xl border border-[#38bdf8]/20 bg-[#0c2a40]/55 px-4 py-3 text-sm leading-6 text-slate-300">Choose a product and Hue Studio will open its builder, apply the correct defaults, and place this artwork automatically.</p>
            <div className="space-y-6">{STORE_CATEGORIES.map((category) => {
              const products = STORE_PRODUCTS.filter((product) => product.category === category.id && !product.disabled);
              if (!products.length) return null;
              return <section key={category.id}><div className="mb-3 flex items-end justify-between gap-3"><div><h3 className="text-sm font-black uppercase tracking-[0.16em] text-[#8be3ff]">{category.label}</h3><p className="mt-1 text-xs text-slate-500">{category.description}</p></div></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{products.map((product) => <button key={product.id} type="button" onClick={() => chooseProductForImageZoneItem(product)} className="group flex min-h-24 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#38bdf8]/55 hover:bg-[#0c2a40]/70 hover:shadow-[0_14px_34px_rgba(0,0,0,0.3)]"><span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#38bdf8]/25 bg-[#071827] text-[10px] font-black text-[#8be3ff]">{product.image ? <img src={product.image} alt="" className="h-full w-full object-cover" /> : product.title.slice(0, 2).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block font-black text-white">{product.title}</span><span className="mt-1 block text-xs text-slate-400">{product.subtitle}</span></span><span className="text-lg text-[#38bdf8] transition group-hover:translate-x-1">→</span></button>)}</div></section>;
            })}</div>
          </div>
        </section>
      </div> : null}

      {showImageZone ? <div className={`hue-image-library-overlay fixed inset-0 ${showArtworkEditor ? 'z-[95]' : 'z-50'} flex items-center justify-center bg-[#02070d]/80 p-0 backdrop-blur-md sm:p-4`}>
        <section className="hue-image-library flex h-full w-full flex-col overflow-hidden border border-[#38bdf8]/25 bg-[#07111f] text-slate-950 shadow-[0_36px_120px_rgba(0,0,0,0.72),0_0_60px_rgba(14,165,233,0.16)] sm:h-[min(800px,90vh)] sm:w-[min(1380px,96vw)] sm:rounded-[22px]">
          <div className="hue-image-library-header relative flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#071522]/95 px-5 py-4 text-white">
            <div className="hue-image-library-brand mr-auto flex min-w-[280px] items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-black/30 shadow-[0_0_28px_rgba(14,165,233,0.24)]"><img src="/brand/hue-graphics-mark.png" alt="" className="h-full w-full object-cover" /></span>
              <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.26em] text-[#67d8ff]">Hue Studio</p><h2 className="mt-0.5 text-xl font-black tracking-tight">Image Zone</h2><p className="mt-0.5 text-xs text-slate-400">Your saved artwork library</p></div>
              <button type="button" aria-label="Close Image Zone" onClick={() => { setShowImageZone(false); setRigidArtworkTarget('front'); }} className="hue-image-library-mobile-close hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-lg font-bold text-slate-300">×</button>
            </div>
            <div className="hue-image-library-actions contents">
            <button type="button" onClick={() => requestArtworkUpload()} className="flex h-10 cursor-pointer items-center rounded-xl bg-[#1686c9] px-4 text-xs font-black uppercase text-white shadow-[0_10px_24px_rgba(14,165,233,0.18)] hover:bg-[#0f6da8]">+ Upload artwork</button>
            <button type="button" onClick={openCanvaImport} className="h-10 rounded-xl border border-[#22d3ee]/35 bg-[#083044] px-4 text-xs font-black uppercase text-[#a9ecff] shadow-[0_0_24px_rgba(14,165,233,0.12)] hover:border-[#67d8ff] hover:bg-[#0c3b55]">Import Canva</button>
            <button type="button" onClick={() => openNewArtworkCreator('image-zone-create')} className="h-10 rounded-xl border border-[#67d8ff]/45 bg-[#0c2a40] px-4 text-xs font-black uppercase text-[#a9ecff] shadow-[0_0_24px_rgba(14,165,233,0.12)] hover:border-[#67d8ff] hover:bg-[#10364f]">+ Create in Hue Designer</button>
            <button type="button" disabled={!imageZoneItems.some((item) => item.id === selectedImageZoneId && canPlaceImageZoneItem(item))} onClick={() => { void openArtworkEditor(); }} className="h-10 rounded-xl border border-[#67d8ff]/40 bg-[linear-gradient(135deg,rgba(14,165,233,0.22),rgba(59,130,246,0.10))] px-4 text-xs font-black uppercase text-[#a9ecff] shadow-[0_0_24px_rgba(14,165,233,0.13)] hover:border-[#67d8ff] hover:bg-[#0c2a40] disabled:cursor-not-allowed disabled:opacity-35">Edit in Hue Designer</button>
            <button type="button" disabled={!imageZoneItems.some((item) => item.id === selectedImageZoneId && canPlaceImageZoneItem(item))} onClick={openAiEditor} className="h-10 rounded-xl border border-violet-300/30 bg-violet-500/10 px-4 text-xs font-black uppercase text-violet-100 hover:border-violet-300/60 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-35">AI Tools</button>
            </div>
            <div className="hue-image-library-search order-last flex w-full items-center gap-2 pt-2"><span className="text-lg text-[#67d8ff]">⌕</span><input className="h-10 min-w-56 flex-1 rounded-xl border border-white/15 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#38bdf8] focus:ring-2 focus:ring-[#38bdf8]/10" placeholder="Search artwork" />
            <select className="h-10 rounded-xl border border-white/15 bg-white/[0.06] px-3 text-sm text-slate-100 outline-none focus:border-[#38bdf8]">
              <option>Sort: Date</option>
              <option>Sort: Name</option>
              <option>Sort: Size</option>
            </select>
            <button type="button" onClick={() => { setShowImageZone(false); setRigidArtworkTarget('front'); }} className="hue-image-library-desktop-close h-10 rounded-xl border border-white/15 bg-white/[0.06] px-4 text-xs font-bold uppercase text-slate-300 hover:border-white/30 hover:bg-white/[0.1] hover:text-white">Close Image Zone</button></div>
          </div>
          <div className="hue-image-library-summary flex items-center gap-3 border-b border-white/10 bg-[#0a1928] px-5 py-3 text-xs">
            <button type="button" className="rounded-lg border border-[#38bdf8]/35 bg-[#0c2a40] px-4 py-2 font-black uppercase text-[#8be3ff] hover:bg-[#10364f]">Select all</button>
            <span className="font-semibold text-slate-300"><strong className="text-white">{imageZoneItems.length}</strong> item{imageZoneItems.length === 1 ? '' : 's'} in your artwork vault</span>
            {imageLibraryStatus ? <span className="hidden max-w-xl truncate text-slate-400 lg:inline"><span className="mx-2 text-white/20">/</span>{isImageLibraryLoading ? 'Loading library... ' : ''}{imageLibraryStatus}</span> : null}
            {selectedImageZoneId ? <span className="ml-auto rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 font-bold text-emerald-300">● Artwork selected</span> : null}
          </div>
          {!customerSession?.access_token ? <div className="hue-image-library-guest flex flex-col gap-3 border-b border-amber-300/20 bg-[linear-gradient(90deg,rgba(245,158,11,0.13),rgba(14,165,233,0.06))] px-5 py-3 text-white sm:flex-row sm:items-center">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-300/35 bg-amber-300/10 text-base font-black text-amber-200">!</span>
            <div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-[0.15em] text-amber-200">Guest artwork is temporary</p><p className="mt-1 text-xs leading-5 text-slate-300">Refreshing or closing this browser can remove uploaded artwork. Create an account or sign in to keep files securely in your private Image Zone library.</p></div>
            <button type="button" onClick={openAccountFromGuestArtworkWarning} className="shrink-0 rounded-lg border border-[#38bdf8]/40 bg-[#0c2a40] px-4 py-2.5 text-xs font-black uppercase text-[#a9ecff] hover:border-[#67d8ff] hover:bg-[#10364f]">Create Account / Sign In</button>
          </div> : null}
          <div className="hue-image-library-grid min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
            {isImageLibraryLoading ? <div className="hue-image-library-loading flex h-full min-h-80 items-center justify-center rounded-2xl border border-dashed border-[#38bdf8]/35 bg-white/[0.035] text-center">
              <div>
                <span className="hue-image-library-loading__orb mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#38bdf8]/25 bg-[#0d2a40] text-2xl text-[#67d8ff] shadow-[0_0_32px_rgba(14,165,233,0.18)]">
                  <span className="hue-image-library-loading__spinner" aria-hidden="true" />
                </span>
                <p className="mt-5 text-lg font-black text-white">Loading your saved artwork...</p>
                <p className="mt-2 text-sm text-slate-400">Hang tight while Hue Studio pulls your Image Zone files.</p>
                <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-3">
                  {[0, 1, 2].map((item) => <span key={item} className="hue-image-library-loading__tile" />)}
                </div>
              </div>
            </div> : imageZoneItems.length === 0 ? <div className="flex h-full min-h-80 items-center justify-center rounded-2xl border border-dashed border-[#38bdf8]/35 bg-white/[0.035] text-center">
              <div>
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#38bdf8]/20 bg-[#0d2a40] text-2xl text-[#67d8ff] shadow-[0_0_32px_rgba(14,165,233,0.15)]">+</span><p className="mt-5 text-lg font-black text-white">Your artwork vault is ready</p>
                <p className="mt-2 text-sm text-slate-400">Upload finished artwork to use across any Hue product.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => requestArtworkUpload()} className="inline-flex cursor-pointer rounded-xl bg-[#1686c9] px-5 py-3 text-sm font-black uppercase text-white hover:bg-[#0f6da8]">Upload artwork</button>
                  <button type="button" onClick={openCanvaImport} className="inline-flex rounded-xl border border-[#38bdf8]/40 bg-[#0c2a40] px-5 py-3 text-sm font-black uppercase text-[#a9ecff] hover:border-[#67d8ff] hover:bg-[#10364f]">Import Canva</button>
                </div>
              </div>
            </div> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {imageZoneItems.map((item) => {
                const selected = selectedImageZoneId === item.id;
                return <article key={item.id} className={`group grid min-h-36 grid-cols-[92px_minmax(0,1fr)] gap-3 rounded-2xl border p-3 text-left transition sm:min-h-40 sm:grid-cols-[118px_minmax(0,1fr)] ${selected ? 'border-[#38bdf8] bg-[#f2fbff] shadow-[0_18px_46px_rgba(14,165,233,0.22),0_0_0_3px_rgba(56,189,248,0.12)]' : 'border-white/10 bg-white/[0.055] shadow-[0_16px_38px_rgba(0,0,0,0.24)] hover:-translate-y-0.5 hover:border-[#38bdf8]/45 hover:bg-white/[0.08]'}`}>
                  <button type="button" onClick={() => setSelectedImageZoneId(item.id)} aria-label={`Select ${item.name}`} className={`relative flex h-28 items-center justify-center overflow-hidden rounded-xl border sm:h-32 ${selected ? 'border-[#b7e7fa] bg-white' : 'border-white/10 bg-[#eaf0f4]'}`}>
                    {hasImageZoneThumbnail(item) ? <img src={item.dataUrl} alt="" decoding="async" className="max-h-full max-w-full object-contain" /> : <span className="flex h-full w-full items-center justify-center px-2 text-center text-sm font-black text-slate-500">{item.source === 'archive' ? 'Restore from Hue Vault' : 'PDF'}</span>}
                    {selected ? <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#1686c9] text-xs font-black text-white shadow-md">✓</span> : null}
                    <span className="absolute bottom-2 left-2 flex flex-col items-start gap-1">{item.backDataUrl ? <span className="rounded-full bg-[#071827]/90 px-2 py-1 text-[9px] font-black uppercase text-[#8be3ff] shadow">Front + Back</span> : null}{item.editorProject ? <span className="rounded-full bg-emerald-600/90 px-2 py-1 text-[9px] font-black uppercase text-white shadow">Editable</span> : null}</span>
                  </button>
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-black ${selected ? 'text-slate-950' : 'text-white'}`}>{item.name}</p>
                    <p className={`mt-2 text-xs font-bold ${selected ? 'text-slate-600' : 'text-slate-300'}`}>{formatArtworkInches(item.width, item.height, item.signWidth, item.signHeight)}</p>
                    <p className={`text-xs ${selected ? 'text-slate-600' : 'text-slate-400'}`}>{item.dpi} DPI</p>
                    <p className={`mt-1 text-[10px] font-bold uppercase tracking-wide ${selected ? 'text-[#1678b8]' : 'text-[#67d8ff]'}`}>{item.source === 'archive' ? 'Hue Vault saved' : item.source === 'supabase' ? 'Hue Library ready' : 'Session preview'}</p>
                    <p className={`mt-2 truncate text-[10px] ${selected ? 'text-slate-400' : 'text-slate-500'}`}>{item.uploadedAt}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5"><button type="button" onClick={() => setSelectedImageZoneId(item.id)} className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase ${selected ? 'bg-[#0d2a40] text-[#8be3ff]' : 'border border-white/15 bg-white/[0.06] text-slate-300'}`}>{selected ? 'Selected' : 'Select'}</button><button type="button" onClick={async () => { await useImageZoneItem(item); }} className="rounded-lg bg-[#1686c9] px-3 py-1.5 text-[10px] font-black uppercase text-white shadow-sm hover:bg-[#0f6da8]">{item.source === 'archive' ? 'Restore & Use' : 'Use'}</button>{item.source !== 'archive' ? <button type="button" disabled={deletingImageZoneId === item.id} onClick={() => { void deleteImageZoneItem(item); }} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase ${selected ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100' : 'border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20'} disabled:cursor-wait disabled:opacity-50`}>{deletingImageZoneId === item.id ? 'Deleting...' : 'Delete'}</button> : null}</div>
                  </div>
                </article>;
              })}
            </div>}
          </div>
          <div className="hue-image-library-footer flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#050d16] px-5 py-4">
            <p className="text-xs text-slate-400"><span className="mr-2 text-emerald-400">●</span>{customerSession?.access_token
              ? (isSupabaseStorageConfigured ? 'Original artwork is securely saved to your private Hue cloud library.' : 'Cloud storage is not configured; artwork remains in this browser session.')
              : 'Guest artwork stays in this browser session. Sign in to use a private Hue cloud library.'}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowImageZone(false); setRigidArtworkTarget('front'); }} className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-slate-300 hover:border-white/30 hover:bg-white/[0.1] hover:text-white">Cancel</button>
              <button type="button" disabled={!selectedImageZoneId} onClick={async () => {
                const item = imageZoneItems.find((entry) => entry.id === selectedImageZoneId);
                if (!item) return;
                await useImageZoneItem(item);
              }} className="rounded-xl bg-[#1686c9] px-6 py-2.5 text-sm font-black uppercase text-white shadow-[0_12px_28px_rgba(14,165,233,0.22)] hover:bg-[#0f6da8] disabled:cursor-not-allowed disabled:opacity-35">{showArtworkEditor ? 'Add to Design' : 'Use Selected Artwork'}</button>
            </div>
          </div>
        </section>
      </div> : null}

      {showCanvaImport ? <div className="fixed inset-0 z-[90] overflow-hidden bg-[#030a12]">
        <section className="flex h-full w-full flex-col overflow-hidden bg-[#071522] text-white">
          <header className="shrink-0 border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.22),transparent_34%),#081827] px-5 py-4 md:px-8">
            <div className="mx-auto flex max-w-[1600px] items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#38bdf8]/35 bg-black/30 shadow-[0_0_28px_rgba(14,165,233,0.24)]"><img src="/brand/hue-graphics-mark.png" alt="" className="h-full w-full object-cover" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#67d8ff]">Hue Studio + Canva</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">Choose a Canva design</h2>
                <p className="mt-1 text-xs text-slate-400 md:text-sm">Pick a project and Hue Studio will save a print-ready copy directly into Image Zone.</p>
              </div>
              {canvaImportStatus?.connected ? <span className="hidden items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-200 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Canva connected</span> : null}
              <button type="button" onClick={() => setShowCanvaImport(false)} className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-xs font-bold text-slate-200 hover:border-[#38bdf8]/45 hover:bg-white/[0.1]">Back to Image Zone</button>
            </div>
          </header>
          <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 gap-5 overflow-y-auto px-5 py-5 md:px-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="h-fit rounded-2xl border border-white/10 bg-white/[0.045] p-5 lg:sticky lg:top-0">
              <h3 className="text-sm font-black uppercase tracking-[0.18em] text-[#8be3ff]">Three easy steps</h3>
              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                <p><strong className="text-white">1. Choose a design.</strong><br />Browse your Canva projects.</p>
                <p><strong className="text-white">2. Import it.</strong><br />Hue creates a print-ready copy.</p>
                <p><strong className="text-white">3. Start using it.</strong><br />The artwork opens in Image Zone.</p>
              </div>
              <p className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100"><strong>Good to know:</strong> Your original Canva project stays unchanged. Hue imports a finished copy, not editable Canva layers.</p>
              <button type="button" onClick={openCanvaImport} className="mt-4 w-full rounded-xl border border-white/15 bg-white/[0.05] px-4 py-3 text-xs font-bold text-slate-300 hover:border-[#38bdf8]/45 hover:bg-white/[0.09]">Refresh connection</button>
            </aside>
            <div className="flex min-h-[520px] min-w-0 flex-col rounded-2xl border border-[#38bdf8]/20 bg-[#06111d] p-5">
              {isCanvaImportLoading ? <p className="mt-4 text-sm text-slate-300">Checking Canva setup...</p> : canvaImportStatus?.configured ? <>
                {canvaImportStatus.connected ? <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#38bdf8]/25 bg-[#0c2a40]/70 p-3">
                    <label className="flex h-11 min-w-56 flex-1 items-center gap-3 rounded-xl border border-white/15 bg-black/25 px-4 focus-within:border-[#38bdf8]"><span className="text-[#67d8ff]">⌕</span><input value={canvaDesignSearch} onChange={(event) => setCanvaDesignSearch(event.target.value)} placeholder="Search Canva designs" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" /></label>
                    <span className="text-xs font-semibold text-slate-400">{filteredCanvaDesigns.length} design{filteredCanvaDesigns.length === 1 ? '' : 's'}</span>
                    <button type="button" onClick={loadCanvaDesigns} disabled={isCanvaDesignsLoading} className="h-11 shrink-0 rounded-lg border border-[#38bdf8]/35 bg-[#083044] px-4 text-[10px] font-black uppercase text-[#a9ecff] hover:border-[#67d8ff] disabled:cursor-wait disabled:opacity-60">{isCanvaDesignsLoading ? 'Refreshing...' : 'Refresh designs'}</button>
                  </div>
                  {canvaDesignStatus ? <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-slate-300">{canvaDesignStatus}</p> : null}
                  <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                    {isCanvaDesignsLoading ? <p className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">Loading Canva designs...</p> : filteredCanvaDesigns.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {filteredCanvaDesigns.map((design) => <article key={design.id} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.055] transition hover:-translate-y-0.5 hover:border-[#38bdf8]/45 hover:shadow-[0_18px_42px_rgba(0,0,0,0.28)]">
                        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-white/10 bg-slate-950 p-3">
                          {design.thumbnailUrl ? <img src={design.thumbnailUrl} alt={`Preview of ${design.title}`} className="h-full w-full rounded-lg object-contain" /> : <span className="text-[10px] font-black uppercase text-slate-500">Canva preview</span>}
                        </div>
                        <div className="min-w-0 p-4">
                          <p className="line-clamp-2 min-h-10 text-sm font-black leading-5 text-white" title={design.title}>{design.title}</p>
                          <p className="mt-1 truncate text-[11px] text-slate-400">{design.updatedAt || 'Canva design'}</p>
                          <button type="button" onClick={() => void importCanvaDesign(design)} disabled={Boolean(importingCanvaDesignId)} className="mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-[#1686c9] px-3 text-[10px] font-black uppercase text-white shadow-[0_10px_24px_rgba(14,165,233,0.2)] hover:bg-[#0f75b5] disabled:cursor-wait disabled:opacity-55">{importingCanvaDesignId === design.id ? 'Importing...' : 'Import to Image Zone'}</button>
                        </div>
                      </article>)}
                    </div> : <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-[#38bdf8]/25 bg-white/[0.035] p-6 text-center"><div><p className="font-black text-white">{canvaDesignSearch.trim() ? 'No matching Canva designs' : 'No Canva designs found'}</p><p className="mt-2 text-sm leading-6 text-slate-400">{canvaDesignSearch.trim() ? 'Try a different search.' : 'Refresh the gallery or create a design in Canva first.'}</p></div></div>}
                  </div>
                </div> : <button type="button" onClick={connectCanvaAccount} className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-[#1686c9] text-sm font-black uppercase text-white shadow-[0_14px_30px_rgba(14,165,233,0.25)] hover:bg-[#0f6da8]">Connect Canva Account</button>}
              </> : <>
                <p className="mt-4 rounded-xl border border-[#38bdf8]/20 bg-[#0c2a40]/70 p-3 text-sm leading-5 text-slate-300">{canvaImportStatus?.message || 'Canva import is ready in Hue Studio, but the Canva developer app keys still need to be added.'}</p>
                {canvaImportStatus?.missing?.length ? <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Needed env vars</p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-300">
                    {canvaImportStatus.missing.map((item) => <li key={item} className="font-mono">{item}</li>)}
                  </ul>
                </div> : null}
                <button type="button" disabled className="mt-4 flex h-12 w-full cursor-not-allowed items-center justify-center rounded-xl bg-slate-700/70 text-sm font-black uppercase text-slate-400">Waiting on Canva keys</button>
              </>}
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
          <button disabled={isPreparingCartArtwork} onClick={productMode === 'apparel' ? requestApparelEstimate : canAddCurrentDesignToCart ? handleAddCurrentDesignToCart : requestSignEstimate} className={`rounded-md bg-[#1f73be] px-5 py-3 font-bold text-white hover:bg-[#2a86d8] disabled:cursor-wait ${isPreparingCartArtwork ? 'hue-preparing-artwork-button' : 'disabled:opacity-60'}`}>{isPreparingCartArtwork ? <span className="hue-preparing-artwork-button__content"><span className="hue-preparing-artwork-button__spinner" aria-hidden="true" />Preparing Final Artwork<span className="hue-preparing-artwork-button__dots" aria-hidden="true" /></span> : productMode === 'apparel' ? 'Get Price' : canAddCurrentDesignToCart ? 'Add to Cart' : 'Price It'}</button>
        </div>
      </div>
      </>
      )}
    </main>
  );
}
