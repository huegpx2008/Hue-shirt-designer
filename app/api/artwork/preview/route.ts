import { NextRequest, NextResponse } from 'next/server';

import {
  getStorageBucket,
  getSupabaseAdminClient,
  hasSupabaseAdminConfig,
  verifySupabaseAccessToken,
} from '@/lib/server/supabase-admin';
import { enforceRateLimit } from '@/lib/server/request-security';

export const runtime = 'nodejs';
export const maxDuration = 60;

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get('authorization') || '';
  return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
};

const ownsCustomerPreview = (storagePath: string, userId: string) => {
  if (!storagePath || storagePath.includes('..') || storagePath.includes('\\')) return false;
  const parts = storagePath.split('/');
  return parts[0] === 'customers'
    && (parts[1] === userId || parts[2] === userId)
    && parts.includes('previews')
    && /-preview\.webp$/i.test(parts.at(-1) || '');
};

export async function GET(request: NextRequest) {
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Artwork previews are temporarily unavailable.' }, { status: 503 });
  const retryAfter = enforceRateLimit(request, 'artwork-preview', 500, 10 * 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many preview requests. Please wait and refresh.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });

  const token = getBearerToken(request);
  const user = token ? await verifySupabaseAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'Sign in to load this artwork preview.' }, { status: 401 });

  const storagePath = request.nextUrl.searchParams.get('path') || '';
  if (!ownsCustomerPreview(storagePath, user.id)) return NextResponse.json({ error: 'That preview does not belong to this account.' }, { status: 403 });

  try {
    const { data, error } = await getSupabaseAdminClient().storage.from(getStorageBucket()).download(storagePath);
    if (error || !data) throw new Error(error?.message || 'The preview file could not be downloaded.');
    return new NextResponse(await data.arrayBuffer(), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': 'inline',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The preview file could not be loaded.';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
