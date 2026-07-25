import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';
import { hasSupabaseAdminConfig, supabaseAdminFetch } from '@/lib/server/supabase-admin';
import {
  getOrderWorkflowLabel,
  isOrderWorkflowStatus,
  normalizeOrderWorkflowStatus,
  type OrderStatusEvent,
  type OrderWorkflow,
  type OrderWorkflowStatus,
} from '@/lib/order-workflow';

type StoredOrder = {
  id: string;
  order_number?: string;
  status?: string;
  customer_email?: string;
  customer_name?: string;
  order_data?: Record<string, unknown>;
  [key: string]: unknown;
};

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const safeText = (value: unknown, maxLength: number) => String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, maxLength);

const safeTrackingUrl = (value: unknown) => {
  const raw = safeText(value, 2000);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.toString() : '';
  } catch {
    return '';
  }
};

const workflowFromOrder = (order: StoredOrder): OrderWorkflow => {
  const stored = order.order_data?.workflow;
  const workflow = stored && typeof stored === 'object' ? stored as Partial<OrderWorkflow> : {};
  const currentStatus = normalizeOrderWorkflowStatus(workflow.currentStatus || order.status);
  return {
    currentStatus,
    currentLabel: getOrderWorkflowLabel(currentStatus),
    updatedAt: String(workflow.updatedAt || order.order_data?.createdAt || new Date().toISOString()),
    carrier: safeText(workflow.carrier, 80) || undefined,
    trackingNumber: safeText(workflow.trackingNumber, 160) || undefined,
    trackingUrl: safeTrackingUrl(workflow.trackingUrl) || undefined,
    history: Array.isArray(workflow.history) ? workflow.history.slice(0, 100) : [],
  };
};

const statusMessage = (status: OrderWorkflowStatus) => ({
  received: 'We received your order and will keep you updated as it moves through production.',
  artwork_review: 'Your artwork and order details are currently being reviewed for production.',
  ordered_for_production: 'Your order has been submitted for production.',
  in_production: 'Your order is currently in production.',
  ready_for_pickup: 'Your order is ready for pickup at Hue Graphics.',
  shipped: 'Your order has shipped and is on the way.',
  completed: 'Your Hue Studio order is complete. Thank you for choosing Hue Graphics.',
  canceled: 'This order has been canceled. Please contact Hue Graphics if you have any questions.',
}[status]);

const renderStatusEmail = (args: {
  order: StoredOrder;
  status: OrderWorkflowStatus;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  siteUrl: string;
  logoUrl: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
}) => {
  const label = getOrderWorkflowLabel(args.status);
  const customerName = safeText(args.order.customer_name || (args.order.order_data?.customer as { name?: string } | undefined)?.name, 160) || 'Hue customer';
  const trackingText = [args.carrier, args.trackingNumber].filter(Boolean).join(' - ');
  const trackingHtml = args.status === 'shipped' && trackingText
    ? `<div style="margin-top:18px;border:1px solid #bae6fd;border-radius:12px;background:#f0f9ff;padding:16px;"><p style="margin:0;color:#075985;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;">Tracking</p><p style="margin:8px 0 0;color:#0f172a;font-size:16px;font-weight:900;">${escapeHtml(trackingText)}</p>${args.trackingUrl ? `<a href="${escapeHtml(args.trackingUrl)}" style="display:inline-block;margin-top:12px;border-radius:8px;background:#1686c9;padding:10px 14px;color:#ffffff;text-decoration:none;font-size:12px;font-weight:900;">Track shipment</a>` : ''}</div>`
    : '';
  const text = [
    `Hue Studio Order Update - ${args.order.order_number || 'Order'}`,
    '',
    `Hi ${customerName},`,
    '',
    `Status: ${label}`,
    statusMessage(args.status),
    trackingText ? `Tracking: ${trackingText}` : '',
    args.trackingUrl ? `Track shipment: ${args.trackingUrl}` : '',
    '',
    `View your Hue Studio account: ${args.siteUrl}?open=account`,
    `Questions: ${args.contactEmail}${args.contactPhone ? ` / ${args.contactPhone}` : ''}`,
    args.address,
  ].filter(Boolean).join('\n');
  const html = `<div style="background:#f4f7fb;padding:24px;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:680px;margin:0 auto;overflow:hidden;border:1px solid #dbe3ec;border-radius:18px;background:#ffffff;"><div style="background:#07111f;padding:24px;"><img src="${escapeHtml(args.logoUrl)}" alt="Hue Studio" width="280" style="display:block;max-width:280px;width:100%;height:auto;border-radius:9px;border:1px solid rgba(255,255,255,.15);"/><p style="margin:20px 0 0;color:#62d4ff;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.18em;">Order status update</p><h1 style="margin:8px 0 0;color:#ffffff;font-size:30px;">${escapeHtml(args.order.order_number || 'Hue Studio Order')}</h1></div><div style="padding:24px;"><p style="margin:0;color:#334155;font-size:15px;line-height:1.6;">Hi ${escapeHtml(customerName)},</p><div style="margin-top:18px;border-left:5px solid #1686c9;border-radius:10px;background:#eff6ff;padding:18px;"><p style="margin:0;color:#075985;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;">Current status</p><h2 style="margin:7px 0 0;color:#0f172a;font-size:24px;">${escapeHtml(label)}</h2><p style="margin:10px 0 0;color:#334155;font-size:15px;line-height:1.6;">${escapeHtml(statusMessage(args.status))}</p></div>${trackingHtml}<a href="${escapeHtml(`${args.siteUrl}?open=account`)}" style="display:inline-block;margin-top:20px;border-radius:9px;background:#1686c9;padding:12px 18px;color:#ffffff;text-decoration:none;font-size:13px;font-weight:900;">View my Hue Studio account</a></div><div style="background:#07111f;padding:18px 24px;color:#94a3b8;font-size:12px;line-height:1.6;"><strong style="color:#ffffff;">Hue Graphics</strong><br/>${escapeHtml(args.contactEmail)}${args.contactPhone ? ` - ${escapeHtml(args.contactPhone)}` : ''}<br/>${escapeHtml(args.address)}</div></div></div>`;
  return { html, text, subject: `Hue Studio Order ${args.order.order_number || ''} - ${label}`.trim() };
};

const updateStoredOrder = async (orderId: string, payload: Record<string, unknown>) => {
  const result = await supabaseAdminFetch(`/rest/v1/hue_orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
  });
  return (Array.isArray(result) ? result[0] : result) as StoredOrder | undefined;
};

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Cross-site admin changes are not allowed.' }, { status: 403 });
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Order updates are temporarily unavailable.' }, { status: 503 });
  const retryAfter = enforceRateLimit(request, 'admin-order-status', 120, 10 * 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many order updates. Please wait a moment.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 16 * 1024)) return NextResponse.json({ error: 'The order update is too large.' }, { status: 413 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const orderId = safeText(body.orderId, 120);
  const status = body.status;
  const notifyCustomer = body.notifyCustomer !== false;
  if (!orderId || !isOrderWorkflowStatus(status)) return NextResponse.json({ error: 'Choose an order and a valid production status.' }, { status: 400 });
  const carrier = safeText(body.carrier, 80);
  const trackingNumber = safeText(body.trackingNumber, 160);
  const trackingUrl = safeTrackingUrl(body.trackingUrl);
  if (status === 'shipped' && !trackingNumber) return NextResponse.json({ error: 'Enter a tracking number before marking an order shipped.' }, { status: 400 });
  if (body.trackingUrl && !trackingUrl) return NextResponse.json({ error: 'Tracking links must be complete HTTPS URLs.' }, { status: 400 });

  try {
    const rows = await supabaseAdminFetch(`/rest/v1/hue_orders?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`) as StoredOrder[];
    let order = rows[0];
    if (!order) return NextResponse.json({ error: 'Order was not found.' }, { status: 404 });
    const orderData = order.order_data && typeof order.order_data === 'object' ? order.order_data : {};
    const workflow = workflowFromOrder(order);
    const signature = [status, carrier, trackingNumber, trackingUrl].join('|');
    const latest = workflow.history[0];
    const latestSignature = latest ? [latest.status, latest.carrier || '', latest.trackingNumber || '', latest.trackingUrl || ''].join('|') : '';
    let event: OrderStatusEvent;
    if (latest && latestSignature === signature) {
      event = { ...latest };
      if (!notifyCustomer || event.emailStatus === 'sent') {
        return NextResponse.json({ order, emailSent: event.emailStatus === 'sent', message: event.emailStatus === 'sent' ? 'This update was already emailed to the customer.' : 'Order status is already current.' });
      }
      event.customerNotified = true;
      event.emailStatus = 'pending';
      event.emailError = undefined;
    } else {
      event = {
        id: randomUUID(),
        status,
        label: getOrderWorkflowLabel(status),
        createdAt: new Date().toISOString(),
        carrier: carrier || undefined,
        trackingNumber: trackingNumber || undefined,
        trackingUrl: trackingUrl || undefined,
        customerNotified: notifyCustomer,
        emailStatus: notifyCustomer ? 'pending' : 'not_requested',
      };
    }
    const history = latest && latest.id === event.id ? [event, ...workflow.history.slice(1)] : [event, ...workflow.history].slice(0, 100);
    const nextWorkflow: OrderWorkflow = {
      currentStatus: status,
      currentLabel: getOrderWorkflowLabel(status),
      updatedAt: event.createdAt,
      carrier: carrier || undefined,
      trackingNumber: trackingNumber || undefined,
      trackingUrl: trackingUrl || undefined,
      history,
    };
    order = await updateStoredOrder(orderId, { status, order_data: { ...orderData, status, workflow: nextWorkflow }, last_email_error: null }) || order;
    if (!notifyCustomer) return NextResponse.json({ order, emailSent: false, message: 'Order status saved without emailing the customer.' });

    const customerEmail = safeText(order.customer_email || (orderData.customer as { email?: string } | undefined)?.email, 320);
    const resendApiKey = process.env.RESEND_API_KEY || '';
    let emailError = '';
    if (!customerEmail) emailError = 'This order does not have a customer email address.';
    else if (!resendApiKey) emailError = 'RESEND_API_KEY is not configured.';
    else {
      const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, '');
      const message = renderStatusEmail({
        order,
        status,
        carrier: carrier || undefined,
        trackingNumber: trackingNumber || undefined,
        trackingUrl: trackingUrl || undefined,
        siteUrl,
        logoUrl: new URL('/brand/hue-studio-logo-email.png', siteUrl).toString(),
        contactEmail: process.env.HUE_CONTACT_EMAIL || 'jason@huegraphics.cc',
        contactPhone: process.env.HUE_CONTACT_PHONE || '(770) 867-3520 / Office Mobile: (678) 238-8913',
        address: process.env.HUE_ADDRESS || '741 Harry McCarty Road, Suite 101, Bethlehem, GA 30620',
      });
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `hue-order-status-${orderId}-${event.id}` },
        body: JSON.stringify({
          from: process.env.QUOTE_FROM_EMAIL || 'Hue Graphics Orders <orders@huegraphics.cc>',
          html: message.html,
          reply_to: process.env.QUOTE_TO_EMAIL || process.env.HUE_CONTACT_EMAIL || 'jason@huegraphics.cc',
          subject: message.subject,
          text: message.text,
          to: customerEmail,
        }),
      });
      if (!response.ok) emailError = (await response.text()).slice(0, 500) || 'Resend rejected the customer update.';
    }

    const finalizedEvent: OrderStatusEvent = emailError
      ? { ...event, emailStatus: 'failed', emailError }
      : { ...event, emailStatus: 'sent', emailSentAt: new Date().toISOString(), emailError: undefined };
    const finalizedWorkflow = { ...nextWorkflow, history: [finalizedEvent, ...nextWorkflow.history.filter((entry) => entry.id !== finalizedEvent.id)] };
    order = await updateStoredOrder(orderId, {
      order_data: { ...orderData, status, workflow: finalizedWorkflow },
      last_email_error: emailError || null,
    }) || order;
    return NextResponse.json({
      order,
      emailSent: !emailError,
      message: emailError ? `Order status saved, but the customer email failed: ${emailError}` : `Order status saved and emailed to ${customerEmail}.`,
      warning: emailError || undefined,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Order status could not be updated.' }, { status: 500 });
  }
}
