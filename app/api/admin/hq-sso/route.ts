import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, createAdminSessionToken } from '@/lib/server/admin-auth';

const hueHqUrl = 'https://hq.huegraphics.cc';
const codePattern = /^[A-Za-z0-9_-]{40,512}$/;

const safeAdminPath = (value: unknown) => typeof value === 'string'
  && (value === '/admin' || value.startsWith('/admin/') || value.startsWith('/admin?'))
  ? value
  : '/admin';

function failedRedirect(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/admin?sso=failed', request.url), 303);
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code') || '';
  const clientSecret = process.env.HUE_HQ_SSO_CLIENT_SECRET?.trim() || '';
  const sessionSecret = process.env.ADMIN_SESSION_SECRET?.trim() || '';
  if (!codePattern.test(code) || !codePattern.test(clientSecret) || sessionSecret.length < 32) {
    return failedRedirect(request);
  }

  try {
    const response = await fetch(`${hueHqUrl}/api/internal/admin-sso/redeem`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audience: 'studio', code, clientSecret }),
      signal: AbortSignal.timeout(8_000),
    });
    const payload = await response.json().catch(() => null) as {
      ok?: boolean;
      identity?: { userId?: string; role?: string };
      redirectPath?: unknown;
    } | null;

    if (
      !response.ok
      || payload?.ok !== true
      || payload.identity?.role !== 'admin'
      || !payload.identity.userId
    ) {
      return failedRedirect(request);
    }

    const redirect = NextResponse.redirect(
      new URL(safeAdminPath(payload.redirectPath), request.url),
      303,
    );
    redirect.cookies.set(ADMIN_COOKIE_NAME, createAdminSessionToken(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      maxAge: 60 * 60 * 4,
      path: '/',
      priority: 'high',
    });
    redirect.headers.set('Cache-Control', 'no-store, max-age=0');
    redirect.headers.set('Referrer-Policy', 'no-referrer');
    return redirect;
  } catch {
    return failedRedirect(request);
  }
}
