import { NextResponse } from 'next/server';
import { calculatePromoDiscount, getPromoCode } from '@/lib/server/supabase-admin';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'This promo request came from an untrusted site.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'promo-validate', 30, 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many promo attempts. Please wait and try again.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 16 * 1024)) return NextResponse.json({ error: 'The promo request is too large.' }, { status: 413 });
  const body = await request.json().catch(() => ({})) as { code?: string; subtotal?: number };
  const code = String(body.code || '').trim().toUpperCase();
  const subtotal = Number(body.subtotal || 0);
  if (!code) return NextResponse.json({ error: 'Enter a promo code.' }, { status: 400 });
  if (!Number.isFinite(subtotal) || subtotal <= 0) return NextResponse.json({ error: 'Add products before applying a promo code.' }, { status: 400 });
  try {
    const promo = await getPromoCode(code);
    if (!promo) return NextResponse.json({ error: 'That promo code was not found.' }, { status: 404 });
    const discountAmount = calculatePromoDiscount(promo, subtotal);
    return NextResponse.json({
      code: promo.code,
      description: promo.description || (promo.discount_type === 'percent' ? `${promo.discount_value}% off` : `$${promo.discount_value.toFixed(2)} off`),
      discountType: promo.discount_type,
      discountValue: promo.discount_value,
      discountAmount
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The promo code could not be applied.' }, { status: 400 });
  }
}
