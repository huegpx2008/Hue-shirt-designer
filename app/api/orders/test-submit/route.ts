import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createArtworkAccessUrl } from "@/lib/server/artwork-access";
import { applyAuthoritativeOrderPricing } from "@/lib/server/order-pricing";
import { verifyPayPalToken, type PayPalPaymentToken } from "@/lib/server/paypal";
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
    paymentMode?: "test_no_payment" | "paypal";
    payment?: { provider?: "paypal"; status?: "completed"; paypalOrderId?: string; captureId?: string; paidAt?: string };
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
  payment_provider?: string | null;
  payment_status?: string | null;
  paypal_order_id?: string | null;
  paypal_capture_id?: string | null;
  paid_at?: string | null;
  payment_data?: Record<string, unknown> | null;
  order_data?: NonNullable<TestOrderEmailPayload['order']>;
  admin_email_sent_at?: string | null;
  customer_email_sent_at?: string | null;
  drive_archive_status?: string | null;
  drive_archive_attempts?: number | null;
  updated_at?: string;
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
  const timestampToken = Date.now().toString(36).toUpperCase().slice(-6).padStart(6, '0');
  const randomToken = randomUUID().replaceAll('-', '').slice(0, 3).toUpperCase();
  return `HS-${timestampToken}-${randomToken}`;
};

type HueContactInfo = {
  websiteUrl: string;
  contactUrl: string;
  email: string;
  phone?: string;
  address?: string;
};

const formatOrderDate = (value: string | undefined) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return 'Today';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/New_York',
  }).format(date);
};

const getCustomerPaymentLabel = (
  order: NonNullable<TestOrderEmailPayload['order']>,
  isTestOrder: boolean,
  isSandboxPayPal: boolean,
) => {
  if (isTestOrder) return 'Test order - no payment collected';
  if (isSandboxPayPal) return 'PayPal sandbox payment - no real money collected';
  if (order.payment?.status === 'completed') return 'Paid with PayPal';
  return 'Payment submitted';
};

const getItemQuantity = (item: OrderItem) => {
  const listed = Number(item.quantity || 0);
  if (Number.isFinite(listed) && listed > 0) return listed;
  return (item.productionBreakdown || []).reduce((total, entry) => total + Math.max(0, Number(entry.quantity || 0)), 0);
};

const renderCustomerReceiptItems = (items: OrderItem[], currency: string) => items.map((item, index) => {
  const artworkBreakdown = (item.productionBreakdown || []).map((entry, artworkIndex) => {
    const quantity = Math.max(0, Number(entry.quantity || 0));
    const size = entry.sizeLabel || getOrderItemSizeLabel(item);
    const label = entry.label || `Artwork set ${artworkIndex + 1}`;
    return `<li style="margin:4px 0;">${escapeHtml(label)}: Qty ${escapeHtml(quantity)}${size ? ` / ${escapeHtml(size)}` : ''}</li>`;
  }).join('');
  const optionList = item.optionSummary?.length
    ? `<ul style="margin:8px 0 0;padding-left:18px;color:#475569;font-size:13px;line-height:1.55;">${item.optionSummary.map((option) => `<li>${escapeHtml(option)}</li>`).join('')}</ul>`
    : '<p style="margin:8px 0 0;color:#64748b;font-size:13px;">No additional options listed.</p>';
  return `
    <div style="border:1px solid #dbeafe;border-radius:14px;margin-top:16px;overflow:hidden;background:#ffffff;">
      <div style="background:#eff6ff;padding:14px 16px;">
        <p style="margin:0;color:#075985;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;">Item ${index + 1}</p>
        <h2 style="margin:5px 0 0;color:#0f172a;font-size:20px;line-height:1.2;">${escapeHtml(item.productName || 'Print-ready item')}</h2>
        <p style="margin:6px 0 0;color:#334155;font-size:14px;">${escapeHtml(getOrderItemSizeLabel(item))} / Qty ${escapeHtml(getItemQuantity(item))} / ${formatMoney(item.price?.total, item.price?.currency || currency)}</p>
      </div>
      <div style="padding:16px;">
        <p style="margin:0;color:#111827;font-size:14px;font-weight:900;">Artwork / Quantity</p>
        ${artworkBreakdown ? `<ul style="margin:8px 0 0;padding-left:18px;color:#475569;font-size:13px;line-height:1.55;">${artworkBreakdown}</ul>` : '<p style="margin:8px 0 0;color:#64748b;font-size:13px;">Artwork received with this item.</p>'}
        <p style="margin:16px 0 0;color:#111827;font-size:14px;font-weight:900;">Options</p>
        ${optionList}
      </div>
    </div>
  `;
}).join('');

const renderCustomerReceiptFooter = (contact: HueContactInfo) => {
  const contactRows = [
    `<a href="${escapeHtml(contact.websiteUrl)}" style="color:#38bdf8;text-decoration:none;font-weight:800;">${escapeHtml(contact.websiteUrl.replace(/^https?:\/\//, ''))}</a>`,
    `<a href="${escapeHtml(contact.contactUrl)}" style="color:#38bdf8;text-decoration:none;font-weight:800;">Contact / request help</a>`,
    contact.email ? `<a href="mailto:${escapeHtml(contact.email)}" style="color:#38bdf8;text-decoration:none;font-weight:800;">${escapeHtml(contact.email)}</a>` : '',
    contact.phone ? `<span>${escapeHtml(contact.phone)}</span>` : '',
    contact.address ? `<span>${escapeHtml(contact.address)}</span>` : '',
  ].filter(Boolean);
  return `
    <div style="background:#07111f;padding:22px 24px;color:#cbd5e1;">
      <p style="margin:0;color:#ffffff;font-size:17px;font-weight:900;">Hue Graphics / Hue Studio</p>
      <p style="margin:8px 0 0;color:#94a3b8;font-size:13px;line-height:1.6;">${contactRows.join(' &nbsp;•&nbsp; ')}</p>
    </div>
  `;
};

const buildCustomerReceiptText = (
  order: NonNullable<TestOrderEmailPayload['order']>,
  context: {
    currency: string;
    fulfillmentLabel: string;
    shippingAddress: string;
    isTestOrder: boolean;
    isSandboxPayPal: boolean;
    contact: HueContactInfo;
  },
) => [
  `${context.isTestOrder ? 'TEST ONLY - ' : context.isSandboxPayPal ? 'PAYPAL SANDBOX - ' : ''}Hue Studio Receipt ${order.orderNumber}`,
  `Status: ${getCustomerPaymentLabel(order, context.isTestOrder, context.isSandboxPayPal)}`,
  `Submitted: ${formatOrderDate(order.createdAt)}`,
  '',
  `Customer: ${order.customer?.name || 'Not provided'}`,
  `Email: ${order.customer?.email || 'Not provided'}`,
  `Phone: ${order.customer?.phone || 'Not provided'}`,
  `Fulfillment: ${context.fulfillmentLabel}`,
  context.shippingAddress ? `Ship To:\n${context.shippingAddress}` : '',
  '',
  'Items:',
  ...(order.items || []).flatMap((item, index) => [
    `${index + 1}. ${item.productName || 'Print-ready item'} / ${getOrderItemSizeLabel(item)} / Qty ${getItemQuantity(item)} / ${formatMoney(item.price?.total, item.price?.currency || context.currency)}`,
    ...(item.productionBreakdown || []).map((entry, artworkIndex) => `   - ${entry.label || `Artwork set ${artworkIndex + 1}`}: Qty ${entry.quantity || 0} / ${entry.sizeLabel || getOrderItemSizeLabel(item)}`),
    ...(item.optionSummary?.length ? [`   Options: ${item.optionSummary.join(', ')}`] : []),
  ]),
  '',
  `Subtotal: ${formatMoney(order.subtotal, context.currency)}`,
  order.promotion?.code ? `Promo ${order.promotion.code}: -${formatMoney(order.promotion.discountAmount || 0, context.currency)}` : '',
  `${order.shipping?.label || 'Shipping'}: ${formatMoney(order.shipping?.amount || 0, context.currency)}`,
  `${order.tax?.label || 'Tax'}: ${formatMoney(order.tax?.amount || 0, context.currency)}`,
  `Total: ${formatMoney(order.total, context.currency)}`,
  '',
  'Important details:',
  '- Please review this receipt and contact Hue right away if the size, quantity, spelling, artwork, pickup/shipping info, or options look wrong.',
  '- Hue Studio is a self-service print-ready ordering tool. Hue may contact you if a major production issue is found.',
  '- Most standard orders are ready in 3-4 business days unless otherwise noted.',
  '',
  `Website: ${context.contact.websiteUrl}`,
  `Contact: ${context.contact.contactUrl}`,
  `Email: ${context.contact.email}`,
  context.contact.phone ? `Phone: ${context.contact.phone}` : '',
  context.contact.address ? `Address: ${context.contact.address}` : '',
].filter(Boolean).join('\n');

const buildCustomerReceiptHtml = (
  order: NonNullable<TestOrderEmailPayload['order']>,
  context: {
    currency: string;
    fulfillmentLabel: string;
    shippingAddress: string;
    isTestOrder: boolean;
    isSandboxPayPal: boolean;
    contact: HueContactInfo;
  },
) => {
  const statusLabel = getCustomerPaymentLabel(order, context.isTestOrder, context.isSandboxPayPal);
  const warningBanner = context.isTestOrder
    ? `<div style="margin:0 0 16px;background:#b91c1c;border:4px solid #7f1d1d;border-radius:16px;padding:20px;text-align:center;color:#ffffff;box-shadow:0 8px 24px rgba(127,29,29,.25);">
        <p style="margin:0;font-size:25px;line-height:1.1;font-weight:900;text-transform:uppercase;letter-spacing:.05em;">Test Only - Not an Actual Order</p>
        <p style="margin:10px 0 0;font-size:14px;line-height:1.5;font-weight:700;">Hue Studio is currently being tested. This confirmation is for testing purposes only and is not a real production order.</p>
      </div>`
    : context.isSandboxPayPal
      ? `<div style="margin:0 0 16px;background:#92400e;border:4px solid #78350f;border-radius:16px;padding:20px;text-align:center;color:#ffffff;box-shadow:0 8px 24px rgba(120,53,15,.2);">
          <p style="margin:0;font-size:22px;line-height:1.1;font-weight:900;text-transform:uppercase;letter-spacing:.05em;">PayPal Sandbox Receipt</p>
          <p style="margin:10px 0 0;font-size:14px;line-height:1.5;font-weight:700;">This payment was processed in PayPal sandbox mode. No real money was collected.</p>
        </div>`
      : '';

  return `
    <div style="background:#f5f7fb;padding:24px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:820px;margin:0 auto;">
        ${warningBanner}
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;">
          <div style="background:#07111f;padding:26px 24px;">
            <p style="margin:0;color:#62d4ff;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.2em;">Hue Studio Receipt</p>
            <h1 style="margin:9px 0 0;color:#ffffff;font-size:34px;line-height:1.05;">${escapeHtml(order.orderNumber)}</h1>
            <p style="margin:10px 0 0;color:#cbd5e1;font-size:14px;">${escapeHtml(statusLabel)} on ${escapeHtml(formatOrderDate(order.createdAt))}</p>
          </div>
          <div style="padding:24px;">
            <div style="border:1px solid #dbeafe;border-radius:16px;background:#f8fbff;padding:16px;">
              <table style="width:100%;border-collapse:collapse;">
                ${renderField('Customer', order.customer?.name)}
                ${order.customer?.organization ? renderField('Organization', order.customer.organization) : ''}
                ${renderField('Email', order.customer?.email)}
                ${renderField('Phone', order.customer?.phone)}
                ${renderField('Fulfillment', context.fulfillmentLabel)}
                ${context.shippingAddress ? renderField('Ship To', context.shippingAddress) : ''}
                ${renderField('Tax exempt', order.customer?.taxExempt ? 'Yes' : 'No')}
              </table>
            </div>

            <div style="margin-top:18px;border:1px solid #e5e7eb;border-radius:14px;padding:16px;background:#ffffff;">
              <p style="margin:0 0 8px;color:#111827;font-size:17px;font-weight:900;">Order Totals</p>
              <table style="width:100%;border-collapse:collapse;">
                ${renderField('Subtotal', formatMoney(order.subtotal, context.currency))}
                ${order.promotion?.code ? renderField(`Promo ${order.promotion.code}`, `-${formatMoney(order.promotion.discountAmount || 0, context.currency)}`) : ''}
                ${renderField(order.shipping?.label || 'Shipping', formatMoney(order.shipping?.amount || 0, context.currency))}
                ${renderField(order.tax?.label || 'Tax', formatMoney(order.tax?.amount || 0, context.currency))}
                <tr>
                  <td style="padding:12px 0 0;color:#111827;font-size:16px;font-weight:900;">Total</td>
                  <td style="padding:12px 0 0;color:#16a34a;font-size:24px;font-weight:900;text-align:left;">${formatMoney(order.total, context.currency)}</td>
                </tr>
              </table>
            </div>

            ${renderCustomerReceiptItems(order.items || [], context.currency)}

            <div style="margin-top:18px;border:1px solid #facc15;border-radius:14px;padding:16px;background:#fefce8;">
              <p style="margin:0;color:#713f12;font-size:15px;font-weight:900;">Important order details</p>
              <ul style="margin:10px 0 0;padding-left:18px;color:#713f12;font-size:13px;line-height:1.65;">
                <li>Please review this receipt and contact Hue right away if the size, quantity, spelling, artwork, pickup/shipping info, or options look wrong.</li>
                <li>Hue Studio is a self-service print-ready ordering tool. Hue may contact you if a major production issue is found.</li>
                <li>Most standard orders are ready in 3-4 business days unless otherwise noted.</li>
              </ul>
            </div>
          </div>
          ${renderCustomerReceiptFooter(context.contact)}
        </div>
      </div>
    </div>
  `;
};

const getSubmissionKey = (value: unknown) => {
  const key = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(key)) return null;
  return key;
};

type VerifiedPayPalPayment = {
  provider: 'paypal';
  status: 'completed';
  paypalOrderId: string;
  captureId: string;
  paidAt?: string;
  amount: string;
  currency: string;
};

const normalizePaymentAmount = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('The paid amount is invalid.');
  return amount.toFixed(2);
};

const verifyCompletedPayPalPayment = async (
  order: NonNullable<TestOrderEmailPayload['order']>,
  submissionKey: string,
  paymentToken: string | undefined,
) => {
  if (order.paymentMode !== 'paypal' && !paymentToken) return null;
  if (!paymentToken) throw new Error('PayPal payment verification is missing. Please complete PayPal Checkout again.');

  const payment = verifyPayPalToken<PayPalPaymentToken>(paymentToken, 'paypal_payment');
  const expectedAmount = normalizePaymentAmount(order.total);
  const expectedCurrency = order.currency || 'USD';
  const expectedEmail = String(order.customer?.email || '').trim().toLowerCase();
  if (payment.submissionKey !== submissionKey) throw new Error('PayPal payment does not match this checkout session.');
  if (normalizePaymentAmount(payment.amount) !== expectedAmount || payment.currency !== expectedCurrency) throw new Error('PayPal payment does not match this order total.');
  if (payment.customerEmail.toLowerCase() !== expectedEmail) throw new Error('PayPal payment does not match this customer email.');

  const rows = await supabaseAdminFetch(`/rest/v1/hue_payment_attempts?submission_key=eq.${encodeURIComponent(submissionKey)}&paypal_order_id=eq.${encodeURIComponent(payment.paypalOrderId)}&paypal_capture_id=eq.${encodeURIComponent(payment.captureId)}&status=eq.completed&select=paid_at,amount,currency&limit=1`) as Array<{ paid_at?: string; amount?: string | number; currency?: string }>;
  const attempt = rows[0];
  if (!attempt) throw new Error('Hue could not verify the completed PayPal payment record.');
  if (normalizePaymentAmount(attempt.amount) !== expectedAmount || attempt.currency !== expectedCurrency) throw new Error('The stored PayPal payment amount does not match this order.');

  return {
    provider: 'paypal',
    status: 'completed',
    paypalOrderId: payment.paypalOrderId,
    captureId: payment.captureId,
    paidAt: attempt.paid_at || order.payment?.paidAt,
    amount: expectedAmount,
    currency: expectedCurrency,
  } satisfies VerifiedPayPalPayment;
};

const applyVerifiedPaymentSnapshot = (
  order: NonNullable<TestOrderEmailPayload['order']>,
  payment: VerifiedPayPalPayment | null,
) => {
  if (!payment) return order;
  return {
    ...order,
    paymentMode: 'paypal' as const,
    payment: {
      provider: 'paypal' as const,
      status: 'completed' as const,
      paypalOrderId: payment.paypalOrderId,
      captureId: payment.captureId,
      paidAt: payment.paidAt,
    },
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
  const hueContact: HueContactInfo = {
    websiteUrl: process.env.HUE_WEBSITE_URL || 'https://www.huegraphics.cc',
    contactUrl: process.env.HUE_CONTACT_URL || 'https://www.huegraphics.cc/contact',
    email: process.env.HUE_CONTACT_EMAIL || 'jason@huegraphics.cc',
    phone: process.env.HUE_CONTACT_PHONE || '(770) 867-3520 / Office Mobile: (678) 238-8913',
    address: process.env.HUE_ADDRESS || '741 Harry McCarty Road, Suite 101, Bethlehem, GA 30620',
  };

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
  let validatedPromo: Awaited<ReturnType<typeof getPromoCode>> = null;
  let verifiedPayment: VerifiedPayPalPayment | null = null;
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
      if (existing.status === 'received' && existing.admin_email_sent_at && existing.customer_email_sent_at && existing.order_data) {
        return NextResponse.json({ ok: true, duplicate: true, order: existing.order_data });
      }
      const updatedAt = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
      if (existing.status === 'processing' && Date.now() - updatedAt < 120000) {
        return NextResponse.json({ error: 'This order is already being processed. Please wait a moment before trying again.' }, { status: 409 });
      }
      if (!existing.order_data?.customer || !existing.order_data.items?.length) throw new Error('The stored order data is incomplete.');
      storedRecord = existing;
      order = existing.order_data;
      verifiedPayment = await verifyCompletedPayPalPayment(order, submissionKey, payload.paymentToken);
      order = applyVerifiedPaymentSnapshot(order, verifiedPayment);
      validateOrderArtworkOwnership(order, { existingOrderNumber: existing.order_number });
      await supabaseAdminFetch(`/rest/v1/hue_orders?id=eq.${encodeURIComponent(existing.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'processing',
          last_email_error: null,
          ...(verifiedPayment ? {
            payment_provider: 'paypal',
            payment_status: 'completed',
            paypal_order_id: verifiedPayment.paypalOrderId,
            paypal_capture_id: verifiedPayment.captureId,
            paid_at: verifiedPayment.paidAt || null,
            payment_data: verifiedPayment,
            order_data: order,
          } : {}),
          updated_at: new Date().toISOString(),
        }),
      });
    } else {
      validateOrderArtworkOwnership(order, { userId: verifiedUser?.id, guestSessionId: verifiedUser ? undefined : guestSessionId });
      order = await applyAuthoritativeOrderPricing(order);
      if (!order.customer || !order.items?.length) throw new Error('Customer details and at least one item are required.');
      verifiedPayment = await verifyCompletedPayPalPayment(order, submissionKey, payload.paymentToken);
      order = applyVerifiedPaymentSnapshot(order, verifiedPayment);
      order.orderNumber = createServerOrderNumber();
      order.createdAt = new Date().toISOString();
      const organizationWarnings = await organizeOrderProductionFiles(order);
      if (organizationWarnings.length) throw new Error(organizationWarnings.join(' '));
      const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
      attachDurableArtworkLinks(order, configuredOrigin || new URL(request.url).origin);
      const orderCustomer = order.customer;
      if (!orderCustomer) throw new Error('Customer details are missing after payment verification.');
      const insertedRows = await supabaseAdminFetch('/rest/v1/hue_orders', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          order_number: order.orderNumber,
          submission_key: submissionKey,
          status: 'processing',
          customer_user_id: orderCustomer.userId || null,
          customer_email: orderCustomer.email,
          customer_name: orderCustomer.name || null,
          subtotal: Number(order.subtotal || 0),
          discount: Number(order.promotion?.discountAmount || 0),
          promo_code: order.promotion?.code || null,
          shipping: Number(order.shipping?.amount || 0),
          tax: Number(order.tax?.amount || 0),
          total: Number(order.total || 0),
          currency: order.currency || 'USD',
          payment_provider: verifiedPayment?.provider || null,
          payment_status: verifiedPayment?.status || null,
          paypal_order_id: verifiedPayment?.paypalOrderId || null,
          paypal_capture_id: verifiedPayment?.captureId || null,
          paid_at: verifiedPayment?.paidAt || null,
          payment_data: verifiedPayment || null,
          drive_archive_status: 'pending',
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
  const isTestOrder = order.paymentMode !== 'paypal';
  const isSandboxPayPal = !isTestOrder && String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase() !== 'live';
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
          <p style="margin:10px 0 0;color:#cbd5e1;font-size:14px;">${isTestOrder ? 'Test checkout' : 'Paid checkout'} submitted ${escapeHtml(order.createdAt ? new Date(order.createdAt).toLocaleString() : "today")}.</p>
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

  // Temporary launch-testing notice for no-payment confirmations only.
  // Keep the internal Hue order notification unchanged.
  const legacyCustomerHtml = (isTestOrder ? html
    .replace(
      '<div style="max-width:820px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">',
      `<div style="max-width:820px;margin:0 auto;">
        <div style="margin:0 0 16px;background:#b91c1c;border:4px solid #7f1d1d;border-radius:16px;padding:22px;text-align:center;color:#ffffff;box-shadow:0 8px 24px rgba(127,29,29,.25);">
          <p style="margin:0;font-size:28px;line-height:1.1;font-weight:900;text-transform:uppercase;letter-spacing:.05em;">Test Only — Not an Actual Order</p>
          <p style="margin:10px 0 0;font-size:15px;line-height:1.5;font-weight:700;">Hue Studio is currently being tested. This confirmation is for testing purposes only and is not a real production order.</p>
        </div>
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">`,
    )
    .replace("Test checkout submitted", "Test order submitted")
    .replace(/\s*<\/div>\s*$/, '</div></div>') : html)
    .replace("Hue Studio Order</p>", "Hue Studio Order Confirmation</p>")
    .replaceAll("Supabase", "Hue secure storage");

  const customerHtml = buildCustomerReceiptHtml(order, {
    contact: hueContact,
    currency,
    fulfillmentLabel,
    isSandboxPayPal,
    isTestOrder,
    shippingAddress,
  });
  void legacyCustomerHtml;

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

  const customerText = buildCustomerReceiptText(order, {
    contact: hueContact,
    currency,
    fulfillmentLabel,
    isSandboxPayPal,
    isTestOrder,
    shippingAddress,
  });

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
        subject: `${isTestOrder ? 'TEST ONLY - ' : isSandboxPayPal ? 'SANDBOX - ' : ''}Hue Studio Receipt ${order.orderNumber}`,
        text: customerText,
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
