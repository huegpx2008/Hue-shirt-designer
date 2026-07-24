import { NextResponse } from 'next/server';
import {
  hasSupabaseAdminConfig,
  supabaseAdminFetch,
  verifySupabaseAccessToken
} from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

type StoredOrderRow = {
  id?: string;
  order_number?: string;
  status?: string;
  customer_user_id?: string | null;
  customer_email?: string | null;
  total?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
  order_data?: Record<string, unknown> | null;
};

const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() || '';

const hydrateOrder = (row: StoredOrderRow, user: { id: string; email?: string }) => {
  const orderData = row.order_data && typeof row.order_data === 'object' ? row.order_data : {};
  const storedCustomer = orderData.customer && typeof orderData.customer === 'object'
    ? orderData.customer as Record<string, unknown>
    : {};
  const items = Array.isArray(orderData.items)
    ? orderData.items.map((item) => {
      const storedItem = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        ...storedItem,
        artworkFiles: Array.isArray(storedItem.artworkFiles) ? storedItem.artworkFiles : [],
        productionBreakdown: Array.isArray(storedItem.productionBreakdown) ? storedItem.productionBreakdown : [],
        productionRecipes: Array.isArray(storedItem.productionRecipes) ? storedItem.productionRecipes : []
      };
    })
    : [];

  return {
    ...orderData,
    id: String(row.id || orderData.id || row.order_number || ''),
    orderNumber: String(row.order_number || orderData.orderNumber || ''),
    createdAt: String(row.created_at || orderData.createdAt || row.updated_at || ''),
    status: String(row.status || orderData.status || 'test_submitted'),
    total: Number(row.total ?? orderData.total ?? 0),
    currency: String(orderData.currency || 'USD'),
    items,
    customer: {
      ...storedCustomer,
      email: String(storedCustomer.email || row.customer_email || user.email || ''),
      userId: String(storedCustomer.userId || row.customer_user_id || user.id)
    }
  };
};

export async function GET(request: Request) {
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ error: 'Order history is temporarily unavailable.' }, { status: 503 });
  }

  const authorization = request.headers.get('authorization') || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const user = await verifySupabaseAccessToken(accessToken);
  if (!user) {
    return NextResponse.json({ error: 'Please sign in again to view your orders.' }, { status: 401 });
  }

  try {
    const select = 'id,order_number,status,customer_user_id,customer_email,total,created_at,updated_at,order_data';
    const requests: Promise<StoredOrderRow[]>[] = [
      supabaseAdminFetch(`/rest/v1/hue_orders?select=${select}&customer_user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=500`) as Promise<StoredOrderRow[]>
    ];
    const email = normalizeEmail(user.email);
    if (email) {
      requests.push(
        supabaseAdminFetch(`/rest/v1/hue_orders?select=${select}&customer_email=ilike.${encodeURIComponent(email)}&order=created_at.desc&limit=500`) as Promise<StoredOrderRow[]>
      );
    }

    const results = await Promise.allSettled(requests);
    const rows = results.flatMap((result) => result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : []);
    const failures = results.filter((result) => result.status === 'rejected');
    if (!rows.length && failures.length) {
      const firstFailure = failures[0] as PromiseRejectedResult;
      throw firstFailure.reason instanceof Error ? firstFailure.reason : new Error('Unable to load order history.');
    }
    const uniqueRows = new Map<string, StoredOrderRow>();
    rows.forEach((row) => {
      const key = String(row.order_number || row.id || '');
      if (key && !uniqueRows.has(key)) uniqueRows.set(key, row);
    });

    const orders = Array.from(uniqueRows.values())
      .map((row) => hydrateOrder(row, user))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    return NextResponse.json(
      { orders },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load order history.';
    console.error('Unable to load customer order history:', message);
    return NextResponse.json({ error: 'Unable to load order history right now.' }, { status: 500 });
  }
}
