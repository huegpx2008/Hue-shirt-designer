import { NextResponse } from 'next/server';
import { capturePayPalOrder, createPayPalToken, validateCompletedCapture, verifyPayPalToken, type PayPalCheckoutToken } from '@/lib/server/paypal';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';
import { supabaseAdminFetch } from '@/lib/server/supabase-admin';

export async function POST(request: Request) {
  try {
    if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Invalid checkout origin.' }, { status: 403 });
    if (contentLengthExceeds(request, 50_000)) return NextResponse.json({ error: 'Payment request is too large.' }, { status: 413 });
    const retryAfter = enforceRateLimit(request, 'paypal-capture', 12, 60 * 60 * 1000);
    if (retryAfter) return NextResponse.json({ error: 'Too many payment attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });

    const body = await request.json() as { paypalOrderId?: string; checkoutToken?: string };
    const checkout = verifyPayPalToken<PayPalCheckoutToken>(String(body.checkoutToken || ''), 'paypal_checkout');
    if (checkout.paypalOrderId !== body.paypalOrderId) throw new Error('The PayPal order does not match this checkout.');

    const existingRows = await supabaseAdminFetch(`/rest/v1/hue_payment_attempts?submission_key=eq.${encodeURIComponent(checkout.submissionKey)}&select=paypal_order_id,paypal_capture_id,status,paid_at&limit=1`) as Array<{ paypal_order_id?: string; paypal_capture_id?: string; status?: string; paid_at?: string }>;
    const existing = existingRows[0];
    if (existing?.status === 'completed' && existing.paypal_order_id === checkout.paypalOrderId && existing.paypal_capture_id) {
      const paymentToken = createPayPalToken({
        kind: 'paypal_payment',
        paypalOrderId: checkout.paypalOrderId,
        captureId: existing.paypal_capture_id,
        submissionKey: checkout.submissionKey,
        amount: checkout.amount,
        currency: checkout.currency,
        customerEmail: checkout.customerEmail,
        exp: Math.floor(Date.now() / 1000) + 30 * 60,
      });
      return NextResponse.json({ paymentToken, captureId: existing.paypal_capture_id, status: 'COMPLETED', paidAt: existing.paid_at, duplicate: true });
    }

    const paypalOrder = await capturePayPalOrder(checkout.paypalOrderId, checkout.submissionKey);
    const completed = validateCompletedCapture(paypalOrder, checkout);
    const paidAt = completed.paidAt;
    await supabaseAdminFetch(`/rest/v1/hue_payment_attempts?submission_key=eq.${encodeURIComponent(checkout.submissionKey)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        paypal_capture_id: completed.captureId,
        status: 'completed',
        paypal_data: paypalOrder,
        paid_at: paidAt,
        updated_at: new Date().toISOString(),
      }),
    });

    const paymentToken = createPayPalToken({
      kind: 'paypal_payment',
      paypalOrderId: checkout.paypalOrderId,
      captureId: completed.captureId,
      submissionKey: checkout.submissionKey,
      amount: checkout.amount,
      currency: checkout.currency,
      customerEmail: checkout.customerEmail,
      exp: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    return NextResponse.json({ paymentToken, captureId: completed.captureId, status: 'COMPLETED', paidAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'PayPal payment could not be captured.' }, { status: 400 });
  }
}
