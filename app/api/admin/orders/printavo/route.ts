import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { supabaseAdminFetch } from '@/lib/server/supabase-admin';

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });

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
