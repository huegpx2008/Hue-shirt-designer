import { calculatePromoDiscount, getPromoCode, supabaseAdminFetch } from '@/lib/server/supabase-admin';
import { applyStudioPricingAdjustment } from '@/lib/server/studio-pricing';

type PricingPayload = Record<string, string | number | boolean>;

export type ServerPricedOrderItem = {
  productId?: string;
  productName?: string;
  quantity?: number;
  price?: { total?: number | null; each?: number | null; currency?: string; sheetCount?: number; pricePerSheet?: number | null };
  pricingRequest?: { apiSlug?: string; payload?: PricingPayload };
  [key: string]: unknown;
};

type OrderForPricing = {
  customer?: { taxExempt?: boolean };
  fulfillment?: { method?: 'pickup' | 'direct_ship'; address?: { state?: string } };
  items?: ServerPricedOrderItem[];
  promotion?: { code?: string; description?: string; discountAmount?: number };
  shipping?: { amount?: number; label?: string };
  tax?: { rate?: number; amount?: number; label?: string };
  subtotal?: number;
  total?: number;
  currency?: string;
};

const ALLOWED_PRICING_SLUGS = new Set([
  'banner', 'mesh-banner', 'custom-cut-coroplast', 'acm', 'poster', 'acrylic',
  'foamcore', 'pvc', 'polystyrene', 'aluminum', 'vinyl', 'vehicle-magnet',
  'business-card', 'handheld-paper', 'carbonless', 'door-hanger',
]);

type ShopProductPricingRow = {
  id: string;
  title: string;
  base_price: number;
  active: boolean;
  product_type: 'featured' | 'group';
  store_id?: string | null;
};

type ShopStorePricingRow = { id: string; active: boolean; opens_at?: string | null; closes_at?: string | null };

const expectedPricingSlug = (productId: string) => productId === 'yard-sign' ? 'custom-cut-coroplast' : productId;

const finiteMoney = (value: unknown) => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.replace(/[^0-9.-]/g, ''))
      : NaN;
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
};

const localOptionTotal = (productId: string, payload: PricingPayload) => {
  let total = 0;
  if ((productId === 'banner' || productId === 'mesh-banner') && payload.windSlits === true) total += 10;
  const radius = String(payload.roundedCornerRadius || 'none');
  if ((productId === 'acm' || productId === 'aluminum') && radius !== 'none' && Number(radius) > 0) total += 5;
  return total;
};

const priceShopItem = async (item: ServerPricedOrderItem, quantity: number, payload: PricingPayload) => {
  const shopProductId = String(payload.shopProductId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(shopProductId)) throw new Error(`${item.productName || 'Shop item'} must be removed and re-added from the current Hue Shop.`);
  const rows = await supabaseAdminFetch(`/rest/v1/hue_shop_products?id=eq.${encodeURIComponent(shopProductId)}&active=eq.true&select=id,title,base_price,active,product_type,store_id&limit=1`) as ShopProductPricingRow[];
  const product = rows[0];
  if (!product || !product.active) throw new Error(`${item.productName || 'This Shop item'} is no longer available.`);
  if (product.product_type === 'group') {
    if (!product.store_id) throw new Error(`${product.title} is not connected to an active Group Store.`);
    const storeRows = await supabaseAdminFetch(`/rest/v1/hue_group_stores?id=eq.${encodeURIComponent(product.store_id)}&select=id,active,opens_at,closes_at&limit=1`) as ShopStorePricingRow[];
    const store = storeRows[0];
    const now = Date.now();
    const opensAt = store?.opens_at ? new Date(store.opens_at).getTime() : null;
    const closesAt = store?.closes_at ? new Date(store.closes_at).getTime() : null;
    if (!store?.active || (opensAt && now < opensAt) || (closesAt && now > closesAt)) throw new Error(`The Group Store for ${product.title} is currently closed.`);
  }
  const each = finiteMoney(product.base_price);
  if (each === null || each <= 0) throw new Error(`${product.title} does not have a valid Shop price.`);
  const total = Number((each * quantity).toFixed(2));
  return {
    ...item,
    productId: `shop-${product.id}`,
    productName: product.title,
    pricingRequest: { apiSlug: 'shop-catalog', payload: { ...payload, shopProductId: product.id, quantity } },
    price: { total, each, currency: 'USD' },
  };
};

const priceOneItem = async (item: ServerPricedOrderItem) => {
  const productId = String(item.productId || '').trim();
  const apiSlug = String(item.pricingRequest?.apiSlug || '').trim();
  const originalPayload = item.pricingRequest?.payload;
  const quantity = Number(item.quantity);

  if (!productId || !apiSlug || !originalPayload || typeof originalPayload !== 'object') {
    throw new Error(`${item.productName || 'An item'} must be removed and re-added so Hue can securely verify its current price.`);
  }
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 100000) {
    throw new Error(`${item.productName || 'An item'} has an invalid quantity.`);
  }
  if (apiSlug === 'shop-catalog') {
    if (productId !== `shop-${String(originalPayload.shopProductId || '').trim()}`) throw new Error(`${item.productName || 'Shop item'} has an invalid product reference.`);
    return priceShopItem(item, quantity, originalPayload);
  }
  if (!ALLOWED_PRICING_SLUGS.has(apiSlug) || apiSlug !== expectedPricingSlug(productId)) {
    throw new Error(`${item.productName || 'An item'} has an invalid pricing product.`);
  }

  const payload: PricingPayload = { ...originalPayload, quantity };
  const response = await fetch(`https://quotes.huegraphics.cc/api/pricing/${apiSlug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  const contentType = response.headers.get('content-type') || '';
  const masterData = contentType.includes('application/json')
    ? await response.json()
    : { ok: false, error: { message: await response.text() } };
  if (!response.ok || !masterData || masterData.ok === false) {
    const message = masterData?.error?.message || `Pricing is temporarily unavailable for ${item.productName || productId}.`;
    throw new Error(message);
  }

  const pricedData = await applyStudioPricingAdjustment(masterData, productId, payload) as {
    currency?: string;
    price?: { retail?: unknown; each?: unknown };
  };
  const baseTotal = finiteMoney(pricedData.price?.retail);
  if (baseTotal === null || baseTotal <= 0) {
    throw new Error(`${item.productName || productId} returned an invalid price. Checkout has been stopped.`);
  }
  const optionTotal = localOptionTotal(productId, payload);
  const total = Number((baseTotal + optionTotal).toFixed(2));
  const apiEach = finiteMoney(pricedData.price?.each);
  const each = apiEach !== null && apiEach > 0
    ? Number((apiEach + optionTotal / quantity).toFixed(4))
    : Number((total / quantity).toFixed(4));
  if (total <= 0 || each <= 0) throw new Error(`${item.productName || productId} cannot be checked out with a zero or negative price.`);

  const sheetCount = Number(item.price?.sheetCount || 0);
  return {
    ...item,
    pricingRequest: { apiSlug, payload },
    price: {
      total,
      each,
      currency: pricedData.currency || 'USD',
      ...(Number.isSafeInteger(sheetCount) && sheetCount > 0 ? {
        sheetCount,
        pricePerSheet: Number((total / sheetCount).toFixed(2)),
      } : {}),
    },
  };
};

export const applyAuthoritativeOrderPricing = async <T extends OrderForPricing>(order: T) => {
  if (!order.items?.length) throw new Error('At least one item is required.');
  if (order.items.length > 50) throw new Error('This order has too many line items for online checkout.');
  if (order.customer?.taxExempt) {
    throw new Error('Tax-exempt online checkout requires Hue verification. Please uncheck tax exempt or contact Hue Graphics.');
  }

  const items = await Promise.all(order.items.map(priceOneItem));
  const subtotal = Number(items.reduce((sum, item) => sum + Number(item.price?.total || 0), 0).toFixed(2));
  if (!Number.isFinite(subtotal) || subtotal <= 0) throw new Error('The verified order subtotal is invalid. Checkout has been stopped.');

  let promotion: T['promotion'] = undefined;
  if (order.promotion?.code) {
    const promo = await getPromoCode(order.promotion.code);
    if (!promo) throw new Error('The promo code is no longer valid.');
    promotion = {
      code: promo.code,
      description: promo.description || '',
      discountAmount: calculatePromoDiscount(promo, subtotal),
    } as T['promotion'];
  }
  const discount = Number(promotion?.discountAmount || 0);

  const method = order.fulfillment?.method === 'direct_ship' ? 'direct_ship' : 'pickup';
  const state = String(order.fulfillment?.address?.state || '').trim().toUpperCase();
  const isGeorgia = method === 'pickup' || state === 'GA' || state === 'GEORGIA';
  const shippingAmount = method === 'direct_ship' ? 10 : 0;
  const shippingLabel = method === 'direct_ship' ? 'US shipping' : 'Local pickup';
  const taxRate = isGeorgia ? 0.08 : 0;
  const taxableAmount = Math.max(0, subtotal - discount) + shippingAmount;
  const taxAmount = Number((taxableAmount * taxRate).toFixed(2));
  const total = Number((taxableAmount + taxAmount).toFixed(2));
  if (!Number.isFinite(total) || total <= 0) throw new Error('The verified order total is invalid. Checkout has been stopped.');

  return {
    ...order,
    items,
    subtotal,
    promotion,
    shipping: { amount: shippingAmount, label: shippingLabel },
    tax: {
      rate: taxRate,
      amount: taxAmount,
      label: isGeorgia ? 'GA sales tax (8.00%)' : 'No GA tax for out-of-state shipping',
    },
    total,
    currency: 'USD',
  } as T;
};
