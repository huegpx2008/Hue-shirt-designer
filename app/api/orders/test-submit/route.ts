import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createArtworkAccessUrl } from "@/lib/server/artwork-access";
import { applyAuthoritativeOrderPricing } from "@/lib/server/order-pricing";
import { getPayPalConfig, verifyPayPalToken, type PayPalPaymentToken } from "@/lib/server/paypal";
import { getPromoCode, getStorageSignedUrl, hasSupabaseAdminConfig, moveStorageObject, supabaseAdminFetch, verifySupabaseAccessToken } from "@/lib/server/supabase-admin";
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';

type OrderArtworkFile = {
  role?: string;
  name?: string;
  storagePath?: string;
  storageUrl?: string;
  source?: string;
};

type OrderProductionArtwork = {
  id?: string;
  label?: string;
  quantity?: number;
  sizeLabel?: string;
  sheetLabel?: string;
  frontName?: string;
  frontPreviewUrl?: string;
  frontStoragePath?: string;
  backName?: string;
  backPreviewUrl?: string;
  backStoragePath?: string;
};

type OrderItem = {
  id?: string;
  productId?: string;
  productName?: string;
  quantity?: number;
  sizeLabel?: string;
  optionSummary?: string[];
  productionSummary?: string[];
  price?: { total?: number | null; each?: number | null; currency?: string };
  pricingRequest?: { apiSlug?: string; payload?: Record<string, string | number | boolean> };
  artworkFiles?: OrderArtworkFile[];
  productionBreakdown?: OrderProductionArtwork[];
};

type TestOrderEmailPayload = {
  guestSessionId?: string;
  paymentToken?: string;
  order?: {
    id?: string;
    orderNumber?: string;
    createdAt?: string;
    currency?: string;
    customer?: {
      name?: string;
      organization?: string;
      email?: string;
      phone?: string;
      notes?: string;
      taxExempt?: boolean;
      checkoutMode?: string;
      userId?: string;
    };
    fulfillment?: {
      method?: "pickup" | "direct_ship";
      address?: { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string };
    };
    items?: OrderItem[];
    subtotal?: number;
    promotion?: { code?: string; description?: string; discountAmount?: number };
    shipping?: { amount?: number; label?: string };
    tax?: { rate?: number; amount?: number; label?: string };
    total?: number;
    paymentMode?: 'test_no_payment' | 'paypal';
    payment?: {
      provider?: 'paypal';
      status?: 'completed';
      paypalOrderId?: string;
      captureId?: string;
      paidAt?: string;
    };
  };
};

const formatMoney = (value: unknown, currency = "USD") => {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(numberValue);
};

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const renderField = (label: string, value: unknown) => `
  <tr>
    <td style="padding:9px 0;color:#6b7280;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:9px 0;color:#111827;font-size:14px;vertical-align:top;">${escapeHtml(value || "Not provided")}</td>
  </tr>
`;

const renderList = (items: string[] | undefined) => {
  if (!items?.length) return "<p style=\"margin:0;color:#6b7280;font-size:13px;\">None listed</p>";
  return `<ul style="margin:8px 0 0;padding-left:18px;color:#374151;font-size:13px;line-height:1.55;">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
};

const renderArtworkFiles = (files: OrderArtworkFile[] | undefined) => {
  if (!files?.length) return "<p style=\"margin:8px 0 0;color:#b45309;font-size:13px;\">No artwork files attached.</p>";
  return `<div style="margin-top:10px;">${files.map((file) => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px;margin-top:8px;background:#f9fafb;">
      <p style="margin:0;color:#111827;font-size:13px;font-weight:800;">${escapeHtml(file.role || "Artwork")}: ${escapeHtml(file.name || "Unnamed file")}</p>
      <p style="margin:5px 0 0;color:#4b5563;font-size:12px;word-break:break-all;">Path: ${escapeHtml(file.storagePath || "Browser/local preview only")}</p>
      ${file.storageUrl ? `<p style="margin:7px 0 0;font-size:12px;"><a href="${escapeHtml(file.storageUrl)}" style="color:#0369a1;font-weight:700;">Open production file</a></p>` : ""}
    </div>
  `).join("")}</div>`;
};

type StoredOrderRecord = {
  id: string;
  order_number: string;
  submission_key?: string | null;
  status?: string;
  customer_user_id?: string | null;
  customer_email?: string;
  order_data?: NonNullable<TestOrderEmailPayload['order']>;
  admin_email_sent_at?: string | null;
  customer_email_sent_at?: string | null;
  updated_at?: string;
  payment_provider?: string | null;
  payment_status?: string | null;
  paypal_order_id?: string | null;
  paypal_capture_id?: string | null;
  paid_at?: string | null;
};

type StoredPaymentAttempt = {
  submission_key: string;
  paypal_order_id: string;
  paypal_capture_id?: string | null;
  status: string;
  customer_user_id?: string | null;
  customer_email: string;
  amount: number | string;
  currency: string;
  paid_at?: string | null;
  priced_order?: NonNullable<TestOrderEmailPayload['order']> | null;
};

const renderArtworkPreview = (url: string | undefined, side: string) => url
  ? `<div style="display:inline-block;width:104px;margin:0 10px 8px 0;vertical-align:top;text-align:center;">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(side)} artwork" width="96" height="76" style="display:block;width:96px!important;max-width:96px!important;height:76px!important;max-height:76px!important;object-fit:contain;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;" />
      <p style="margin:5px 0 0;color:#64748b;font-size:10px;font-weight:900;letter-spacing:.12em;">${escapeHtml(side.toUpperCase())}</p>
    </div>`
  : `<div style="display:inline-block;width:96px;height:76px;margin:0 10px 8px 0;border:1px dashed #94a3b8;border-radius:8px;background:#f8fafc;color:#64748b;font-size:11px;line-height:76px;text-align:center;vertical-align:top;">No preview</div>`;

const getOrderItemSizeLabel = (item: OrderItem) => {
  const listed = String(item.sizeLabel || '').trim();
  if (listed && !/^0(?:\.0+)?"?\s*x\s*0(?:\.0+)?"?$/i.test(listed)) return listed;
  return item.productionBreakdown?.find((entry) => entry.sizeLabel && !/^0(?:\.0+)?"?\s*x\s*0(?:\.0+)?"?$/i.test(entry.sizeLabel))?.sizeLabel || listed || 'Size not listed';
};

const renderProductionBreakdown = (artwork: OrderProductionArtwork[] | undefined) => {
  if (!artwork?.length) return "<p style=\"margin:8px 0 0;color:#b45309;font-size:13px;\">No per-artwork quantity breakdown was recorded.</p>";
  return `<div style="margin-top:10px;">${artwork.map((entry, index) => `
    <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:0;margin-top:10px;border:2px solid #38bdf8;border-radius:12px;background:#f0f9ff;overflow:hidden;">
      <tr>
        <td width="230" style="width:230px;padding:14px;vertical-align:top;">
          ${renderArtworkPreview(entry.frontPreviewUrl, "Front")}
          ${entry.backName || entry.backPreviewUrl ? renderArtworkPreview(entry.backPreviewUrl, "Back") : ""}
        </td>
        <td style="padding:14px;vertical-align:top;">
          <p style="margin:0;color:#075985;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;">${escapeHtml(entry.label || `Artwork set ${index + 1}`)}</p>
          <p style="margin:6px 0;color:#111827;font-size:26px;font-weight:900;line-height:1;">Quantity: ${escapeHtml(Math.max(0, Number(entry.quantity || 0)))}</p>
          <p style="margin:9px 0 0;color:#334155;font-size:13px;"><strong>Finished size:</strong> ${escapeHtml(entry.sizeLabel || "Not listed")}</p>
          ${entry.sheetLabel ? `<p style="margin:5px 0 0;color:#334155;font-size:13px;"><strong>Production placement:</strong> ${escapeHtml(entry.sheetLabel)}</p>` : ""}
          <p style="margin:5px 0 0;color:#334155;font-size:12px;word-break:break-word;"><strong>Front:</strong> ${escapeHtml(entry.frontName || "Unnamed artwork")}</p>
          ${entry.backName ? `<p style="margin:5px 0 0;color:#334155;font-size:12px;word-break:break-word;"><strong>Back:</strong> ${escapeHtml(entry.backName)}</p>` : ""}
        </td>
      </tr>
    </table>
  `).join("")}</div>`;
};

const getSafeOrderToken = (value: unknown, fallback: string, maxLength = 36) => {
  const token = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return (token || fallback).slice(0, maxLength);
};

const getStorageExtension = (path: string | undefined) => {
  const match = String(path || '').match(/\.([a-zA-Z0-9]{2,5})$/);
  return match ? match[1].toLowerCase() : 'png';
};

const createServerOrderNumber = () => {
  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  return `HUE-${timestamp}-${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`;
};

const getSubmissionKey = (value: unknown) => {
  const key = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(key)) return null;
  return key;
};

const normalizePaymentAmount = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('The verified order total is invalid.');
  return amount.toFixed(2);
};

const verifyCompletedPayPalPayment = async (input: {
  paymentToken?: string;
  submissionKey: string;
  order: NonNullable<TestOrderEmailPayload['order']>;
  userId?: string;
}) => {
  const config = getPayPalConfig();
  if (!config.enabled) return null;
  const email = String(input.order.customer?.email || '').trim().toLowerCase();
  const amount = normalizePaymentAmount(input.order.total);
  const currency = String(input.order.currency || 'USD').toUpperCase();
  const rows = await supabaseAdminFetch(`/rest/v1/hue_payment_attempts?submission_key=eq.${encodeURIComponent(input.submissionKey)}&select=*&limit=1`) as StoredPaymentAttempt[];
  const attempt = rows[0];
  if (!attempt || attempt.status !== 'completed' || !attempt.paypal_capture_id) {
    throw new Error('PayPal has not confirmed a completed payment for this order.');
  }
  if (String(attempt.customer_email || '').toLowerCase() !== email
    || (attempt.customer_user_id || null) !== (input.userId || null)
    || normalizePaymentAmount(attempt.amount) !== amount
    || String(attempt.currency || '').toUpperCase() !== currency) {
    throw new Error('The completed PayPal payment does not match this Hue order.');
  }
  if (input.paymentToken) {
    const token = verifyPayPalToken<PayPalPaymentToken>(input.paymentToken, 'paypal_payment');
    if (token.submissionKey !== input.submissionKey
      || token.paypalOrderId !== attempt.paypal_order_id
      || token.captureId !== attempt.paypal_capture_id
      || token.customerEmail.toLowerCase() !== email
      || normalizePaymentAmount(token.amount) !== amount
      || token.currency.toUpperCase() !== currency) {
      throw new Error('The PayPal confirmation token does not match this order.');
    }
  }
  const duplicateRows = await supabaseAdminFetch(`/rest/v1/hue_orders?paypal_capture_id=eq.${encodeURIComponent(attempt.paypal_capture_id)}&submission_key=neq.${encodeURIComponent(input.submissionKey)}&select=id&limit=1`) as Array<{ id: string }>;
  if (duplicateRows.length) throw new Error('This PayPal payment is already attached to another order.');
  return attempt;
};

const applyVerifiedPaymentSnapshot = (
  order: NonNullable<TestOrderEmailPayload['order']>,
  attempt: StoredPaymentAttempt,
) => {
  const pricedOrder = attempt.priced_order;
  if (!pricedOrder?.items?.length) {
    throw new Error('The verified PayPal pricing snapshot is missing. Checkout has been stopped for safety.');
  }
  return {
    ...order,
    items: pricedOrder.items,
    subtotal: pricedOrder.subtotal,
    promotion: pricedOrder.promotion,
    shipping: pricedOrder.shipping,
    tax: pricedOrder.tax,
    total: pricedOrder.total,
    currency: pricedOrder.currency || 'USD',
  };
};

const organizeOrderProductionFiles = async (order: NonNullable<TestOrderEmailPayload['order']>) => {
  const warnings: string[] = [];
  const orderToken = getSafeOrderToken(order.orderNumber, 'ORDER');
  for (const [itemIndex, item] of (order.items || []).entries()) {
    const itemToken = `I${String(itemIndex + 1).padStart(2, '0')}`;
    const productToken = getSafeOrderToken(item.productId || item.productName, 'PRINT', 18);
    for (const [artworkIndex, artwork] of (item.productionBreakdown || []).entries()) {
      const artworkToken = `A${String(artworkIndex + 1).padStart(2, '0')}`;
      const quantityToken = `QTY-${String(Math.max(0, Number(artwork.quantity || 0))).padStart(3, '0')}`;
      const sizeToken = getSafeOrderToken(String(artwork.sizeLabel || getOrderItemSizeLabel(item) || 'CUSTOM').replace(/["']/g, '').replace(/\s*x\s*/i, 'x'), 'CUSTOM', 18);

      const organizeSide = async (side: 'FRONT' | 'BACK') => {
        const sourcePath = side === 'FRONT' ? artwork.frontStoragePath : artwork.backStoragePath;
        if (!sourcePath || sourcePath.startsWith(`orders/${orderToken}/`)) return;
        const extension = getStorageExtension(sourcePath);
        const fileName = `${orderToken}_${itemToken}_${productToken}_${artworkToken}_${quantityToken}_${sizeToken}_${side}.${extension}`;
        const destinationPath = `orders/${orderToken}/ITEM-${String(itemIndex + 1).padStart(2, '0')}/${fileName}`;
        const matchingFiles = (item.artworkFiles || []).filter((file) => file.storagePath === sourcePath);
        try {
          await moveStorageObject(sourcePath, destinationPath);
          const storageUrl = await getStorageSignedUrl(destinationPath, 60 * 60 * 24 * 7).catch(() => undefined);
          if (side === 'FRONT') {
            artwork.frontName = fileName;
            artwork.frontStoragePath = destinationPath;
            artwork.frontPreviewUrl = storageUrl || artwork.frontPreviewUrl;
          } else {
            artwork.backName = fileName;
            artwork.backStoragePath = destinationPath;
            artwork.backPreviewUrl = storageUrl || artwork.backPreviewUrl;
          }
          for (const file of matchingFiles) {
            file.name = fileName;
            file.storagePath = destinationPath;
            file.storageUrl = storageUrl || file.storageUrl;
          }
        } catch (error) {
          const details = error instanceof Error ? error.message : 'Unknown storage error';
          warnings.push(`${artwork.label || artworkToken} ${side.toLowerCase()} could not be moved into the order folder: ${details}`);
        }
      };

      await organizeSide('FRONT');
      if (artwork.backStoragePath) await organizeSide('BACK');
    }
  }
  return warnings;
};

const attachDurableArtworkLinks = (order: NonNullable<TestOrderEmailPayload['order']>, origin: string) => {
  for (const item of order.items || []) {
    for (const file of item.artworkFiles || []) {
      if (file.storagePath) file.storageUrl = createArtworkAccessUrl(origin, file.storagePath);
    }
    for (const artwork of item.productionBreakdown || []) {
      if (artwork.frontStoragePath) artwork.frontPreviewUrl = createArtworkAccessUrl(origin, artwork.frontStoragePath);
      if (artwork.backStoragePath) artwork.backPreviewUrl = createArtworkAccessUrl(origin, artwork.backStoragePath);
    }
  }
};

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get('authorization') || '';
  return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
};

const validateOrderArtworkOwnership = (
  order: NonNullable<TestOrderEmailPayload['order']>,
  owner: { userId?: string; guestSessionId?: string; existingOrderNumber?: string },
) => {
  const paths = order.items?.flatMap((item) => [
    ...(item.artworkFiles || []).map((file) => file.storagePath),
    ...(item.productionBreakdown || []).flatMap((artwork) => [artwork.frontStoragePath, artwork.backStoragePath]),
  ]).filter((path): path is string => Boolean(path)) || [];

  for (const path of paths) {
    if (path.includes('..') || path.includes('\\')) throw new Error('An artwork storage path is invalid.');
    const ownedByUser = owner.userId && (
      path.startsWith(`customers/${owner.userId}/`)
      || (path.startsWith('customers/') && path.split('/')[2] === owner.userId)
    );
    const ownedByGuest = owner.guestSessionId && path.startsWith(`guest-orders/${owner.guestSessionId}/`);
    const ownedByExistingOrder = owner.existingOrderNumber && path.startsWith(`orders/${getSafeOrderToken(owner.existingOrderNumber, 'ORDER')}/`);
    if (!ownedByUser && !ownedByGuest && !ownedByExistingOrder) {
      throw new Error('An artwork file does not belong to this customer checkout session.');
    }
  }
};

export async function POST(request: Request) {
  if (String(process.env.CHECKOUT_ENABLED || 'true').toLowerCase() === 'false') {
    return NextResponse.json({ error: 'Online checkout is temporarily paused. Please contact Hue Graphics for help with your order.' }, { status: 503 });
  }
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'This checkout request came from an untrusted site.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'order-submit', 12, 60 * 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many order submissions. Please wait before trying again.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 2 * 1024 * 1024)) return NextResponse.json({ error: 'The order request is too large.' }, { status: 413 });
  const resendApiKey = process.env.RESEND_API_KEY;
  const orderToEmail = process.env.QUOTE_TO_EMAIL || "jason@huegraphics.cc";
  const orderFromEmail = process.env.QUOTE_FROM_EMAIL || "Hue Graphics Orders <orders@huegraphics.cc>";

  let payload: TestOrderEmailPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid order payload." }, { status: 400 });
  }

  let order = payload.order;
  if (!order?.customer?.email || !order.items?.length) {
    return NextResponse.json({ error: "Customer email and at least one item are required." }, { status: 400 });
  }
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ error: 'Checkout is temporarily unavailable because secure order storage is not configured.' }, { status: 503 });
  }

  const accessToken = getBearerToken(request);
  const verifiedUser = accessToken ? await verifySupabaseAccessToken(accessToken) : null;
  if (accessToken && !verifiedUser) return NextResponse.json({ error: 'Your sign-in expired. Sign in again before submitting this order.' }, { status: 401 });
  const guestSessionId = String(payload.guestSessionId || '');
  if (!verifiedUser && !/^[a-zA-Z0-9-]{20,80}$/.test(guestSessionId)) {
    return NextResponse.json({ error: 'The guest checkout session is invalid. Reopen checkout and try again.' }, { status: 400 });
  }
  order.customer.userId = verifiedUser?.id;

  const submissionKey = getSubmissionKey(order.id);
  if (!submissionKey) return NextResponse.json({ error: 'This checkout session is invalid. Please reopen checkout and try again.' }, { status: 400 });

  let storedRecord: StoredOrderRecord | null = null;
  let verifiedPayment: StoredPaymentAttempt | null = null;
  let validatedPromo: Awaited<ReturnType<typeof getPromoCode>> = null;
  let isNewOrder = false;
  try {
    const existingRows = await supabaseAdminFetch(`/rest/v1/hue_orders?submission_key=eq.${encodeURIComponent(submissionKey)}&select=*&limit=1`) as StoredOrderRecord[];
    const existing = existingRows[0];
    if (existing) {
      if ((existing.customer_user_id || null) !== (verifiedUser?.id || null)) {
        return NextResponse.json({ error: 'This saved order belongs to a different customer account.' }, { status: 403 });
      }
      if (String(existing.customer_email || '').toLowerCase() !== order.customer.email.toLowerCase()) {
        return NextResponse.json({ error: 'This checkout submission does not match the original customer.' }, { status: 409 });
      }
      if (!existing.order_data?.customer || !existing.order_data.items?.length) throw new Error('The stored order data is incomplete.');
      storedRecord = existing;
      order = existing.order_data;
      verifiedPayment = await verifyCompletedPayPalPayment({ paymentToken: payload.paymentToken, submissionKey, order, userId: verifiedUser?.id });
      if (verifiedPayment) {
        order = applyVerifiedPaymentSnapshot(order, verifiedPayment);
        order.paymentMode = 'paypal';
        order.payment = { provider: 'paypal', status: 'completed', paypalOrderId: verifiedPayment.paypal_order_id, captureId: verifiedPayment.paypal_capture_id || undefined, paidAt: verifiedPayment.paid_at || undefined };
      }
      if (existing.status === 'received' && existing.admin_email_sent_at && existing.customer_email_sent_at) {
        return NextResponse.json({ ok: true, duplicate: true, order });
      }
      const updatedAt = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
      if (existing.status === 'processing' && Date.now() - updatedAt < 120000) {
        return NextResponse.json({ error: 'This order is already being processed. Please wait a moment before trying again.' }, { status: 409 });
      }
      validateOrderArtworkOwnership(order, { existingOrderNumber: existing.order_number });
      await supabaseAdminFetch(`/rest/v1/hue_orders?id=eq.${encodeURIComponent(existing.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'processing',
          last_email_error: null,
          ...(verifiedPayment ? {
            payment_provider: 'paypal', payment_status: 'completed', paypal_order_id: verifiedPayment.paypal_order_id,
            paypal_capture_id: verifiedPayment.paypal_capture_id, paid_at: verifiedPayment.paid_at,
          } : {}),
          updated_at: new Date().toISOString(),
        }),
      });
    } else {
      validateOrderArtworkOwnership(order, { userId: verifiedUser?.id, guestSessionId: verifiedUser ? undefined : guestSessionId });
      order = await applyAuthoritativeOrderPricing(order);
      if (!order.customer || !order.items?.length) throw new Error('Customer details and at least one item are required.');
      verifiedPayment = await verifyCompletedPayPalPayment({ paymentToken: payload.paymentToken, submissionKey, order, userId: verifiedUser?.id });
      if (verifiedPayment) {
        order = applyVerifiedPaymentSnapshot(order, verifiedPayment);
        order.paymentMode = 'paypal';
        order.payment = { provider: 'paypal', status: 'completed', paypalOrderId: verifiedPayment.paypal_order_id, captureId: verifiedPayment.paypal_capture_id || undefined, paidAt: verifiedPayment.paid_at || undefined };
      }
      order.orderNumber = createServerOrderNumber();
      order.createdAt = new Date().toISOString();
      const organizationWarnings = await organizeOrderProductionFiles(order);
      if (organizationWarnings.length) throw new Error(organizationWarnings.join(' '));
      const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
      attachDurableArtworkLinks(order, configuredOrigin || new URL(request.url).origin);
      const customer = order.customer;
      if (!customer) throw new Error('Customer details are required.');
      const insertedRows = await supabaseAdminFetch('/rest/v1/hue_orders', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          order_number: order.orderNumber,
          submission_key: submissionKey,
          status: 'processing',
          customer_user_id: customer.userId || null,
          customer_email: customer.email,
          customer_name: customer.name || null,
          subtotal: Number(order.subtotal || 0),
          discount: Number(order.promotion?.discountAmount || 0),
          promo_code: order.promotion?.code || null,
          shipping: Number(order.shipping?.amount || 0),
          tax: Number(order.tax?.amount || 0),
          total: Number(order.total || 0),
          currency: order.currency || 'USD',
          payment_provider: verifiedPayment ? 'paypal' : null,
          payment_status: verifiedPayment ? 'completed' : null,
          paypal_order_id: verifiedPayment?.paypal_order_id || null,
          paypal_capture_id: verifiedPayment?.paypal_capture_id || null,
          paid_at: verifiedPayment?.paid_at || null,
          payment_data: verifiedPayment || null,
          order_data: order,
          created_at: order.createdAt || new Date().toISOString()
        })
      }) as StoredOrderRecord[];
      storedRecord = insertedRows[0] || null;
      if (!storedRecord?.id) throw new Error('Supabase did not confirm the new order record.');
      isNewOrder = true;
      validatedPromo = order.promotion?.code ? await getPromoCode(order.promotion.code) : null;
      if (validatedPromo?.id) {
        await supabaseAdminFetch(`/rest/v1/hue_promo_codes?id=eq.${encodeURIComponent(validatedPromo.id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ uses_count: Number(validatedPromo.uses_count || 0) + 1, updated_at: new Date().toISOString() })
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The order could not be securely saved.';
    return NextResponse.json({ error: `Checkout stopped before submission: ${message}` }, { status: 503 });
  }

  if (!storedRecord?.id || !order.customer || !order.items?.length) {
    return NextResponse.json({ error: 'Checkout stopped because the secure order record is incomplete.' }, { status: 503 });
  }

  const updateOrderState = async (fields: Record<string, unknown>) => {
    await supabaseAdminFetch(`/rest/v1/hue_orders?id=eq.${encodeURIComponent(storedRecord.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
    });
  };

  if (!resendApiKey) {
    await updateOrderState({ status: 'email_failed', last_email_error: 'RESEND_API_KEY is not configured.' });
    return NextResponse.json(
      { error: 'The order was securely saved, but confirmation email is unavailable. Hue Graphics can recover it from the admin portal.', order },
      { status: 500 },
    );
  }

  const currency = order.currency || "USD";
  const isTestOrder = !verifiedPayment || getPayPalConfig().environment === 'sandbox';
  const fulfillmentLabel = order.fulfillment?.method === "direct_ship" ? "Direct ship" : "Local pickup";
  const shippingAddress = order.fulfillment?.address
    ? [order.fulfillment.address.line1, order.fulfillment.address.line2, `${order.fulfillment.address.city || ""}, ${order.fulfillment.address.state || ""} ${order.fulfillment.address.postalCode || ""}`.trim()].filter(Boolean).join("\n")
    : "";

  const itemBlocks = order.items.map((item, index) => `
    <div style="border:1px solid #dbeafe;border-radius:14px;margin-top:16px;overflow:hidden;">
      <div style="background:#eff6ff;padding:14px 16px;">
        <p style="margin:0;color:#075985;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;">Item ${index + 1}</p>
        <h2 style="margin:5px 0 0;color:#111827;font-size:20px;">${escapeHtml(item.productName || "Print-ready item")}</h2>
        <p style="margin:6px 0 0;color:#374151;font-size:14px;">${escapeHtml(getOrderItemSizeLabel(item))} / Qty ${escapeHtml(item.quantity || 0)} / ${formatMoney(item.price?.total, item.price?.currency || currency)}</p>
      </div>
      <div style="padding:16px;">
        <p style="margin:0;color:#111827;font-size:15px;font-weight:900;">Production Artwork Breakdown</p>
        <p style="margin:4px 0 0;color:#64748b;font-size:12px;">The quantities below are the exact number to produce for each design.</p>
        ${renderProductionBreakdown(item.productionBreakdown)}
        <p style="margin:16px 0 0;color:#111827;font-size:13px;font-weight:800;">Options</p>
        ${renderList(item.optionSummary)}
        <p style="margin:16px 0 0;color:#111827;font-size:13px;font-weight:800;">Production Notes</p>
        ${renderList(item.productionSummary)}
        <p style="margin:16px 0 0;color:#111827;font-size:13px;font-weight:800;">Artwork References</p>
        ${renderArtworkFiles(item.artworkFiles)}
      </div>
    </div>
  `).join("");

  const html = `
    <div style="background:#f5f7fb;padding:24px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:820px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <div style="background:#07111f;padding:24px;">
          <p style="margin:0;color:#62d4ff;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.18em;">Hue Studio Order</p>
          <h1 style="margin:8px 0 0;color:#ffffff;font-size:30px;line-height:1.1;">${escapeHtml(order.orderNumber)}</h1>
          <p style="margin:10px 0 0;color:#cbd5e1;font-size:14px;">${isTestOrder ? 'Test checkout submitted' : 'Payment received'} ${escapeHtml(order.createdAt ? new Date(order.createdAt).toLocaleString() : "today")}.</p>
        </div>
        <div style="padding:24px;">
          <table style="width:100%;border-collapse:collapse;">
            ${renderField("Customer", order.customer.name)}
            ${renderField("Organization", order.customer.organization)}
            ${renderField("Email", order.customer.email)}
            ${renderField("Phone", order.customer.phone)}
            ${renderField("Fulfillment", fulfillmentLabel)}
            ${shippingAddress ? renderField("Ship To", shippingAddress) : ""}
            ${renderField("Tax exempt", order.customer.taxExempt ? "Yes - verify exemption form" : "No")}
            ${renderField("Notes", order.customer.notes)}
          </table>
          <div style="margin-top:18px;border:1px solid #e5e7eb;border-radius:14px;padding:16px;background:#f9fafb;">
            <p style="margin:0 0 8px;color:#111827;font-size:15px;font-weight:900;">Order Totals</p>
            <table style="width:100%;border-collapse:collapse;">
              ${renderField("Subtotal", formatMoney(order.subtotal, currency))}
              ${order.promotion?.code ? renderField(`Promo ${order.promotion.code}`, `-${formatMoney(order.promotion.discountAmount || 0, currency)}`) : ""}
              ${renderField(order.shipping?.label || "Shipping", formatMoney(order.shipping?.amount || 0, currency))}
              ${renderField(order.tax?.label || "Tax", formatMoney(order.tax?.amount || 0, currency))}
              ${renderField("Total", formatMoney(order.total, currency))}
            </table>
          </div>
          ${itemBlocks}
        </div>
      </div>
    </div>
  `;

  const customerBaseHtml = html
    .replace("Hue Studio Order</p>", "Hue Studio Order Confirmation</p>")
    .replaceAll("Supabase", "Hue secure storage");
  const customerHtml = isTestOrder
    ? customerBaseHtml
      .replace(
        '<div style="max-width:820px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">',
        `<div style="max-width:820px;margin:0 auto;">
          <div style="margin:0 0 16px;background:#b91c1c;border:4px solid #7f1d1d;border-radius:16px;padding:22px;text-align:center;color:#ffffff;box-shadow:0 8px 24px rgba(127,29,29,.25);">
            <p style="margin:0;font-size:28px;line-height:1.1;font-weight:900;text-transform:uppercase;letter-spacing:.05em;">Test Only — Not an Actual Order</p>
            <p style="margin:10px 0 0;font-size:15px;line-height:1.5;font-weight:700;">Hue Studio is currently being tested. This confirmation is for testing purposes only and is not a real production order.</p>
          </div>
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">`,
      )
      .replace(/\s*<\/div>\s*$/, '</div></div>')
    : customerBaseHtml;

  const text = [
    `Hue Studio Order ${order.orderNumber}`,
    `Customer: ${order.customer.name || "Not provided"}`,
    `Email: ${order.customer.email}`,
    `Fulfillment: ${fulfillmentLabel}`,
    shippingAddress ? `Ship To:\n${shippingAddress}` : "",
    `Subtotal: ${formatMoney(order.subtotal, currency)}`,
    order.promotion?.code ? `Promo ${order.promotion.code}: -${formatMoney(order.promotion.discountAmount || 0, currency)}` : "",
    `${order.shipping?.label || "Shipping"}: ${formatMoney(order.shipping?.amount || 0, currency)}`,
    `${order.tax?.label || "Tax"}: ${formatMoney(order.tax?.amount || 0, currency)}`,
    `Total: ${formatMoney(order.total, currency)}`,
    "",
    "Items:",
    ...order.items.flatMap((item, index) => [
      `${index + 1}. ${item.productName || "Print-ready item"} / ${getOrderItemSizeLabel(item)} / Qty ${item.quantity || 0}`,
      "   Production artwork breakdown:",
      ...(item.productionBreakdown || []).flatMap((entry, artworkIndex) => [
        `   - ${entry.label || `Artwork set ${artworkIndex + 1}`}: Qty ${entry.quantity || 0} / ${entry.sizeLabel || getOrderItemSizeLabel(item)}${entry.sheetLabel ? ` / ${entry.sheetLabel}` : ""}`,
        `     Front: ${entry.frontName || "Unnamed artwork"}${entry.frontStoragePath ? ` / ${entry.frontStoragePath}` : ""}`,
        entry.backName ? `     Back: ${entry.backName}${entry.backStoragePath ? ` / ${entry.backStoragePath}` : ""}` : "",
      ]),
      ...(item.artworkFiles || []).map((file) => `   ${file.role || "Artwork"}: ${file.name || "Unnamed file"} / ${file.storagePath || "Browser/local preview only"}`),
    ]),
  ].filter(Boolean).join("\n");

  if (!storedRecord.admin_email_sent_at) {
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `hue-order-${storedRecord.id}-admin`,
      },
      body: JSON.stringify({
        from: orderFromEmail,
        html,
        reply_to: order.customer.email,
        subject: `Hue Studio Order ${order.orderNumber}`,
        text,
        to: orderToEmail,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = (await resendResponse.text()).slice(0, 500) || "Resend rejected the admin notification.";
      await updateOrderState({ status: 'email_failed', last_email_error: errorText });
      return NextResponse.json(
        { error: "The order was securely saved, but Hue's notification email could not be sent. It can be recovered from the admin portal.", order },
        { status: 502 },
      );
    }
    const sentAt = new Date().toISOString();
    await updateOrderState({ admin_email_sent_at: sentAt, last_email_error: null });
    storedRecord.admin_email_sent_at = sentAt;
  }

  if (!storedRecord.customer_email_sent_at) {
    const customerResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `hue-order-${storedRecord.id}-customer`,
      },
      body: JSON.stringify({
        from: orderFromEmail,
        html: customerHtml,
        reply_to: orderToEmail,
        subject: isTestOrder
          ? `TEST ONLY — Hue Studio Confirmation ${order.orderNumber}`
          : `Hue Studio Order Confirmation ${order.orderNumber}`,
        text: isTestOrder
          ? `TEST ONLY — NOT AN ACTUAL ORDER\nHue Studio is currently being tested. This is not a real production order.\n\n${text.replaceAll("Supabase", "Hue secure storage")}`
          : text.replaceAll("Supabase", "Hue secure storage"),
        to: order.customer.email,
      }),
    });

    if (!customerResponse.ok) {
      const errorText = (await customerResponse.text()).slice(0, 500) || "Resend rejected the customer confirmation.";
      await updateOrderState({ status: 'email_failed', last_email_error: errorText });
      return NextResponse.json(
        { error: "The order was securely saved and Hue was notified, but the customer confirmation could not be sent. The order can be recovered from the admin portal.", order },
        { status: 502 },
      );
    }
    const sentAt = new Date().toISOString();
    await updateOrderState({ customer_email_sent_at: sentAt, last_email_error: null });
    storedRecord.customer_email_sent_at = sentAt;
  }

  await updateOrderState({ status: 'received', last_email_error: null, order_data: order });
  return NextResponse.json({ ok: true, duplicate: !isNewOrder, order });
}
