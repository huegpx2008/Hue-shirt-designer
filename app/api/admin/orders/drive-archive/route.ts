import { NextRequest, NextResponse } from 'next/server';

import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { archiveOrderToDriveBestEffort, DriveArchiveOrder } from '@/lib/server/order-drive-archive';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';
import { supabaseAdminFetch } from '@/lib/server/supabase-admin';

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Cross-site admin changes are not allowed.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'admin-drive-archive', 20, 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many archive requests. Wait a moment.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 8192)) return NextResponse.json({ error: 'The archive request is too large.' }, { status: 413 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const orderId = String(body.orderId || '').trim();
  if (!orderId) return NextResponse.json({ error: 'Order id is required.' }, { status: 400 });

  try {
    const records = await supabaseAdminFetch(`/rest/v1/hue_orders?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`) as DriveArchiveOrder[];
    const order = records[0];
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    const archive = await archiveOrderToDriveBestEffort(order, { force: true });
    const refreshed = await supabaseAdminFetch(`/rest/v1/hue_orders?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`) as DriveArchiveOrder[];
    return NextResponse.json({ ok: archive.ok, archive, order: refreshed[0] || order }, { status: archive.ok ? 200 : 502 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not archive this order.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
