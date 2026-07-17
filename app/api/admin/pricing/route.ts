import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { STUDIO_PRICING_PRODUCTS } from '@/lib/server/studio-pricing';
import { supabaseAdminFetch } from '@/lib/server/supabase-admin';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Cross-site admin changes are not allowed.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'admin-pricing', 30, 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many pricing changes. Wait a moment.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 64 * 1024)) return NextResponse.json({ error: 'The pricing request is too large.' }, { status: 413 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const requestedAdjustments = Array.isArray(body.adjustments) ? body.adjustments : [body];
  if (!requestedAdjustments.length || requestedAdjustments.length > STUDIO_PRICING_PRODUCTS.length) {
    return NextResponse.json({ error: 'Choose at least one valid Hue Studio product.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  let payloads: Array<Record<string, unknown>>;
  try {
    payloads = requestedAdjustments.map((entry) => {
      const adjustment = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
      const productKey = String(adjustment.productKey || adjustment.product_key || '').trim().toLowerCase();
      const product = STUDIO_PRICING_PRODUCTS.find((candidate) => candidate.key === productKey);
      const percentage = Number(adjustment.percentage);
      if (!product) throw new Error('Choose a valid Hue Studio product.');
      if (!Number.isFinite(percentage) || percentage < 0 || percentage > 200) throw new Error(`${product.name} must be between 0% and 200%.`);
      return {
        product_key: product.key,
        display_name: product.name,
        category: product.category,
        percentage,
        active: adjustment.active !== false,
        notes: String(adjustment.notes || '').trim() || null,
        updated_at: now,
      };
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Choose valid pricing adjustments.' }, { status: 400 });
  }

  try {
    const result = await supabaseAdminFetch('/rest/v1/hue_pricing_adjustments?on_conflict=product_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(Array.isArray(body.adjustments) ? payloads : payloads[0]),
    });
    const adjustments = Array.isArray(result) ? result : [result];
    return NextResponse.json(Array.isArray(body.adjustments) ? { adjustments } : { adjustment: adjustments[0] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Pricing adjustment could not be saved.' }, { status: 500 });
  }
}
