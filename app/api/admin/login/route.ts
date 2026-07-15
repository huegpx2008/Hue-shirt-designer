import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, createAdminSessionToken, isAdminConfigured, verifyAdminPassword } from '@/lib/server/admin-auth';

export async function POST(request: NextRequest) {
  if (!isAdminConfigured()) return NextResponse.json({ error: 'Admin access is not configured yet.' }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { password?: string };
  if (!verifyAdminPassword(String(body.password || ''))) return NextResponse.json({ error: 'Incorrect admin password.' }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, createAdminSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    maxAge: 60 * 60 * 12,
    path: '/'
  });
  return response;
}

