import { NextResponse } from 'next/server';
import { verifyPayPalWebhook } from '@/lib/server/paypal';
import { supabaseAdminFetch } from '@/lib/server/supabase-admin';

type WebhookEvent = {
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
};

export async function POST(request: Request) {
  try {
    const event = await request.json() as WebhookEvent;
    if (!await verifyPayPalWebhook(request, event)) return NextResponse.json({ error: 'Invalid PayPal webhook signature.' }, { status: 401 });

    const paypalOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
    const captureId = event.resource?.id;
    const statusByEvent: Record<string, string> = {
      'PAYMENT.CAPTURE.COMPLETED': 'completed',
      'PAYMENT.CAPTURE.DENIED': 'denied',
      'PAYMENT.CAPTURE.REFUNDED': 'refunded',
      'PAYMENT.CAPTURE.REVERSED': 'reversed',
    };
    const status = statusByEvent[event.event_type || ''];
    if (status && (paypalOrderId || captureId)) {
      const filter = paypalOrderId ? `paypal_order_id=eq.${encodeURIComponent(paypalOrderId)}` : `paypal_capture_id=eq.${encodeURIComponent(String(captureId))}`;
      const update = {
        status,
        webhook_data: event,
        updated_at: new Date().toISOString(),
        ...(captureId ? { paypal_capture_id: captureId } : {}),
      };
      await supabaseAdminFetch(`/rest/v1/hue_payment_attempts?${filter}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(update) });
      await supabaseAdminFetch(`/rest/v1/hue_orders?${filter}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ payment_status: status, payment_data: event, updated_at: new Date().toISOString() }),
      });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Webhook processing failed.' }, { status: 400 });
  }
}
