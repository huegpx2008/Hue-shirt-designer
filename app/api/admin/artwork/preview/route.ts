import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { enforceRateLimit } from '@/lib/server/request-security';
import { getStorageBucket, getSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const mimeTypeFromPath = (storagePath: string) => {
  const extension = storagePath.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  return null;
};

const isSafeArtworkPath = (storagePath: string) => {
  if (!storagePath || storagePath.length > 1200 || storagePath.includes('..') || storagePath.includes('\\')) return false;
  const root = storagePath.split('/')[0];
  return ['customers', 'guest-orders', 'orders', 'archive-previews'].includes(root);
};

export async function GET(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Artwork previews are temporarily unavailable.' }, { status: 503 });
  const retryAfter = enforceRateLimit(request, 'admin-artwork-preview', 1000, 10 * 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many preview requests. Please wait and refresh.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });

  const storagePath = request.nextUrl.searchParams.get('path') || '';
  const mimeType = mimeTypeFromPath(storagePath);
  if (!mimeType || !isSafeArtworkPath(storagePath)) return NextResponse.json({ error: 'That artwork preview path is invalid.' }, { status: 400 });

  try {
    const { data, error } = await getSupabaseAdminClient().storage.from(getStorageBucket()).download(storagePath);
    if (error || !data) throw new Error(error?.message || 'The preview file could not be downloaded.');
    return new NextResponse(await data.arrayBuffer(), {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The preview file could not be loaded.';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
