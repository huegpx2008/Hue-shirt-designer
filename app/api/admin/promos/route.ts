import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { supabaseAdminFetch } from '@/lib/server/supabase-admin';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Cross-site admin changes are not allowed.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'admin-promos', 30, 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many promo changes. Wait a moment.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 8192)) return NextResponse.json({ error: 'The promo request is too large.' }, { status: 413 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const code = String(body.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const discountType = body.discount_type === 'fixed' ? 'fixed' : 'percent';
  const discountValue = Number(body.discount_value || 0);
  if (!code || !Number.isFinite(discountValue) || discountValue <= 0) return NextResponse.json({ error: 'Code and a positive discount are required.' }, { status: 400 });
  if (discountType === 'percent' && discountValue > 100) return NextResponse.json({ error: 'Percent discounts cannot exceed 100%.' }, { status: 400 });
  try {
    const payload = {
      code,
      description: String(body.description || '').trim() || null,
      discount_type: discountType,
      discount_value: discountValue,
      minimum_order: body.minimum_order ? Number(body.minimum_order) : null,
      maximum_discount: body.maximum_discount ? Number(body.maximum_discount) : null,
      expires_at: body.expires_at || null,
      max_uses: body.max_uses ? Number(body.max_uses) : null,
      active: body.active !== false
    };
    const promo = await supabaseAdminFetch('/rest/v1/hue_promo_codes?on_conflict=code', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload)
    });
    return NextResponse.json({ promo: Array.isArray(promo) ? promo[0] : promo });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Promo code could not be saved.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Cross-site admin changes are not allowed.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'admin-promos', 30, 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many promo changes. Wait a moment.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 8192)) return NextResponse.json({ error: 'The promo request is too large.' }, { status: 413 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = String(body.id || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'A valid promo code ID is required.' }, { status: 400 });
  }

  try {
    const deleted = await supabaseAdminFetch(`/rest/v1/hue_promo_codes?id=eq.${encodeURIComponent(id)}&select=id,code`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    }) as Array<{ id?: string; code?: string }>;
    if (!deleted.length) return NextResponse.json({ error: 'That promo code no longer exists.' }, { status: 404 });
    return NextResponse.json({ deleted: deleted[0] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Promo code could not be deleted.' }, { status: 500 });
  }
}
