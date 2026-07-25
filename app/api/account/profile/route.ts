import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/server/request-security';
import { getSupabaseAdminClient, hasSupabaseAdminConfig, verifySupabaseAccessToken } from '@/lib/server/supabase-admin';

const safePrintavoProfileUrl = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    return parsed.protocol === 'https:' && (hostname === 'printavo.com' || hostname.endsWith('.printavo.com'))
      ? parsed.toString()
      : '';
  } catch {
    return '';
  }
};

export async function GET(request: Request) {
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Customer profile is temporarily unavailable.' }, { status: 503 });
  const retryAfter = enforceRateLimit(request, 'account-profile', 60, 10 * 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many profile requests. Please wait a moment.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  const authorization = request.headers.get('authorization') || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const verifiedUser = await verifySupabaseAccessToken(accessToken);
  if (!verifiedUser) return NextResponse.json({ error: 'Please sign in again to view your account.' }, { status: 401 });

  try {
    const { data, error } = await getSupabaseAdminClient().auth.admin.getUserById(verifiedUser.id);
    if (error || !data.user) return NextResponse.json({ error: 'Customer account not found.' }, { status: 404 });
    return NextResponse.json(
      { printavoProfileUrl: safePrintavoProfileUrl(data.user.app_metadata?.printavo_profile_url) },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    );
  } catch {
    return NextResponse.json({ error: 'Customer profile is temporarily unavailable.' }, { status: 500 });
  }
}
