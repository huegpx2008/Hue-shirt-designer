import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { supabaseAdminFetch } from '@/lib/server/supabase-admin';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Cross-site admin changes are not allowed.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'admin-orders', 60, 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many order updates. Wait a moment.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 8192)) return NextResponse.json({ error: 'The order update is too large.' }, { status: 413 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const orderId = String(body.orderId || '').trim();
  const printavoStatus = body.printavoStatus === 'added' ? 'added' : 'not_added';
  const printavoOrderNumber = String(body.printavoOrderNumber || '').trim().slice(0, 120) || null;
  if (!orderId) return NextResponse.json({ error: 'Choose an order to update.' }, { status: 400 });

  try {
    const result = await supabaseAdminFetch(`/rest/v1/hue_orders?id=eq.${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        printavo_status: printavoStatus,
        printavo_order_number: printavoOrderNumber,
        printavo_added_at: printavoStatus === 'added' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }),
    });
    const order = Array.isArray(result) ? result[0] : result;
    if (!order) return NextResponse.json({ error: 'Order was not found.' }, { status: 404 });
    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Printavo tracking could not be updated.' }, { status: 500 });
  }
}
