import { NextResponse } from 'next/server';
import {
  hasSupabaseAdminConfig,
  supabaseAdminFetch,
  verifySupabaseAccessToken
} from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

const CART_RETENTION_DAYS = 30;
const MAX_CART_ITEMS = 50;
const MAX_CART_JSON_BYTES = 2_000_000;

type StoredCartRow = {
  owner_user_id: string;
  cart_data?: unknown;
  updated_at?: string;
  expires_at?: string;
};

const authorize = async (request: Request) => {
  const authorization = request.headers.get('authorization') || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  return verifySupabaseAccessToken(accessToken);
};

const unavailableResponse = (error: unknown) => {
  const details = error instanceof Error ? error.message : '';
  const tableMissing = /hue_customer_carts|relation.+does not exist|schema cache/i.test(details);
  if (tableMissing) {
    return NextResponse.json({ error: 'Cloud cart storage is not configured yet.' }, { status: 503 });
  }
  console.error('Customer cart storage failed:', details || error);
  return NextResponse.json({ error: 'The saved cart is temporarily unavailable.' }, { status: 500 });
};

export async function GET(request: Request) {
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ error: 'The saved cart is temporarily unavailable.' }, { status: 503 });
  }
  const user = await authorize(request);
  if (!user) return NextResponse.json({ error: 'Please sign in again to load your saved cart.' }, { status: 401 });

  try {
    const rows = await supabaseAdminFetch(
      `/rest/v1/hue_customer_carts?owner_user_id=eq.${encodeURIComponent(user.id)}&select=owner_user_id,cart_data,updated_at,expires_at&limit=1`
    ) as StoredCartRow[];
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ exists: false, items: [] }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
    }
    if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
      await supabaseAdminFetch(`/rest/v1/hue_customer_carts?owner_user_id=eq.${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      return NextResponse.json({ exists: false, items: [] }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
    }
    return NextResponse.json({
      exists: true,
      items: Array.isArray(row.cart_data) ? row.cart_data : [],
      updatedAt: row.updated_at,
      expiresAt: row.expires_at
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    return unavailableResponse(error);
  }
}

export async function PUT(request: Request) {
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ error: 'The saved cart is temporarily unavailable.' }, { status: 503 });
  }
  const user = await authorize(request);
  if (!user) return NextResponse.json({ error: 'Please sign in again to save your cart.' }, { status: 401 });

  try {
    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > MAX_CART_JSON_BYTES) {
      return NextResponse.json({ error: 'This cart is too large to sync.' }, { status: 413 });
    }
    const body = JSON.parse(bodyText) as { items?: unknown };
    if (!Array.isArray(body.items) || body.items.length > MAX_CART_ITEMS) {
      return NextResponse.json({ error: `A saved cart can contain up to ${MAX_CART_ITEMS} items.` }, { status: 400 });
    }
    const invalidItem = body.items.some((entry) => {
      if (!entry || typeof entry !== 'object') return true;
      const item = entry as { id?: unknown; customer?: { userId?: unknown; email?: unknown; checkoutMode?: unknown } };
      if (typeof item.id !== 'string' || !item.id.trim()) return true;
      const customer = item.customer;
      if (!customer || customer.checkoutMode !== 'account') return true;
      if (customer.userId && customer.userId !== user.id) return true;
      const itemEmail = typeof customer.email === 'string' ? customer.email.trim().toLowerCase() : '';
      const userEmail = user.email?.trim().toLowerCase() || '';
      return !customer.userId && (!itemEmail || !userEmail || itemEmail !== userEmail);
    });
    if (invalidItem) return NextResponse.json({ error: 'The cart contains an item from a different customer account.' }, { status: 403 });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + CART_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const rows = await supabaseAdminFetch('/rest/v1/hue_customer_carts?on_conflict=owner_user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        owner_user_id: user.id,
        cart_data: body.items,
        updated_at: now.toISOString(),
        expires_at: expiresAt.toISOString()
      })
    }) as StoredCartRow[];
    return NextResponse.json({ ok: true, updatedAt: rows[0]?.updated_at || now.toISOString(), expiresAt: rows[0]?.expires_at || expiresAt.toISOString() });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'The cart payload is not valid JSON.' }, { status: 400 });
    return unavailableResponse(error);
  }
}
