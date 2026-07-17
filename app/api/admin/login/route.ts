import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, createAdminSessionToken, isAdminConfigured, verifyAdminPassword } from '@/lib/server/admin-auth';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Cross-site admin sign-in is not allowed.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'admin-login', 5, 15 * 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many sign-in attempts. Wait before trying again.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 4096)) return NextResponse.json({ error: 'The sign-in request is too large.' }, { status: 413 });
  if (!isAdminConfigured()) return NextResponse.json({ error: 'Admin access is not configured yet.' }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { password?: string };
  if (!verifyAdminPassword(String(body.password || ''))) return NextResponse.json({ error: 'Incorrect admin password.' }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, createAdminSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    maxAge: 60 * 60 * 4,
    path: '/',
    priority: 'high',
  });
  return response;
}
