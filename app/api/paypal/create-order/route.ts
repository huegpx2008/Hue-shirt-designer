import { NextResponse } from 'next/server';
import { applyAuthoritativeOrderPricing, type ServerPricedOrderItem } from '@/lib/server/order-pricing';
import { createPayPalOrder, createPayPalToken, getPayPalConfig } from '@/lib/server/paypal';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';
import { hasSupabaseAdminConfig, supabaseAdminFetch, verifySupabaseAccessToken } from '@/lib/server/supabase-admin';

type CheckoutOrder = {
  id?: string;
  customer?: { email?: string; userId?: string; taxExempt?: boolean };
  fulfillment?: { method?: 'pickup' | 'direct_ship'; address?: { state?: string } };
  items?: ServerPricedOrderItem[];
  promotion?: { code?: string; description?: string; discountAmount?: number };
  shipping?: { amount?: number; label?: string };
  tax?: { rate?: number; amount?: number; label?: string };
  subtotal?: number;
  total?: number;
  currency?: string;
};

const getBearerToken = (request: Request) => {
  const value = request.headers.get('authorization') || '';
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
};

const validSubmissionKey = (value: unknown) => {
  const key = String(value || '').trim();
  return /^[A-Za-z0-9_-]{20,120}$/.test(key) ? key : null;
};

export async function POST(request: Request) {
  try {
    if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Invalid checkout origin.' }, { status: 403 });
    if (contentLengthExceeds(request, 2_000_000)) return NextResponse.json({ error: 'Checkout request is too large.' }, { status: 413 });
    const retryAfter = enforceRateLimit(request, 'paypal-create', 10, 60 * 60 * 1000);
    if (retryAfter) return NextResponse.json({ error: 'Too many payment attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
    if (!getPayPalConfig().enabled) return NextResponse.json({ error: 'PayPal Checkout is not available yet.' }, { status: 503 });
    if (!hasSupabaseAdminConfig()) throw new Error('Secure order storage is not configured.');

    const body = await request.json() as { order?: CheckoutOrder; guestSessionId?: string };
    const order = body.order;
    const submissionKey = validSubmissionKey(order?.id);
    const customerEmail = String(order?.customer?.email || '').trim().toLowerCase();
    if (!order || !submissionKey || !customerEmail || !order.items?.length) throw new Error('The checkout information is incomplete.');

    const accessToken = getBearerToken(request);
    const verifiedUser = accessToken ? await verifySupabaseAccessToken(accessToken) : null;
    const guestSessionId = String(body.guestSessionId || '').trim();
    if (!verifiedUser && !/^guest-[A-Za-z0-9-]{20,100}$/.test(guestSessionId)) throw new Error('The guest checkout session is invalid.');
    if (verifiedUser?.email && verifiedUser.email.toLowerCase() !== customerEmail) throw new Error('The signed-in account does not match the checkout email.');
    order.customer = { ...order.customer, userId: verifiedUser?.id };

    const pricedOrder = await applyAuthoritativeOrderPricing(order);
    const paypalOrder = await createPayPalOrder({ submissionKey, amount: Number(pricedOrder.total), currency: 'USD', customerEmail });
    if (!paypalOrder.id) throw new Error('PayPal did not create an order.');
    const amount = Number(pricedOrder.total).toFixed(2);
    const checkoutToken = createPayPalToken({
      kind: 'paypal_checkout', paypalOrderId: paypalOrder.id, submissionKey, amount, currency: 'USD', customerEmail,
      exp: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    await supabaseAdminFetch('/rest/v1/hue_payment_attempts?on_conflict=submission_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        submission_key: submissionKey,
        paypal_order_id: paypalOrder.id,
        status: 'created',
        customer_user_id: verifiedUser?.id || null,
        customer_email: customerEmail,
        amount,
        currency: 'USD',
        priced_order: pricedOrder,
        paypal_data: paypalOrder,
        updated_at: new Date().toISOString(),
      }),
    });
    return NextResponse.json({ id: paypalOrder.id, checkoutToken, order: pricedOrder });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'PayPal order could not be created.' }, { status: 400 });
  }
}
