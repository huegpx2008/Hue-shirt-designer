import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { STUDIO_PRICING_PRODUCTS } from '@/lib/server/studio-pricing';
import { supabaseAdminFetch } from '@/lib/server/supabase-admin';

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const productKey = String(body.productKey || body.product_key || '').trim().toLowerCase();
  const product = STUDIO_PRICING_PRODUCTS.find((entry) => entry.key === productKey);
  const percentage = Number(body.percentage);
  if (!product) return NextResponse.json({ error: 'Choose a valid Hue Studio product.' }, { status: 400 });
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 200) return NextResponse.json({ error: 'Percentage must be between 0% and 200%.' }, { status: 400 });

  try {
    const payload = {
      product_key: product.key,
      display_name: product.name,
      category: product.category,
      percentage,
      active: body.active !== false,
      notes: String(body.notes || '').trim() || null,
      updated_at: new Date().toISOString(),
    };
    const result = await supabaseAdminFetch('/rest/v1/hue_pricing_adjustments?on_conflict=product_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload),
    });
    return NextResponse.json({ adjustment: Array.isArray(result) ? result[0] : result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Pricing adjustment could not be saved.' }, { status: 500 });
  }
}
