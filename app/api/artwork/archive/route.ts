import { NextRequest, NextResponse } from 'next/server';

import { listArchivedArtworkForUser, restoreArchivedArtworkForUser } from '@/lib/server/artwork-archive';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';
import { hasSupabaseAdminConfig, verifySupabaseAccessToken } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get('authorization') || '';
  return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
};

const requireUser = async (request: Request) => {
  const token = getBearerToken(request);
  return token ? verifySupabaseAccessToken(token) : null;
};

export async function GET(request: NextRequest) {
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Artwork storage is temporarily unavailable.' }, { status: 503 });
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to view archived artwork.' }, { status: 401 });
  try {
    const rows = await listArchivedArtworkForUser({ userId: user.id, email: user.email });
    return NextResponse.json({
      items: rows.map((row) => ({
        id: row.id,
        originalName: row.original_name || 'Archived artwork',
        mimeType: row.mime_type || 'application/octet-stream',
        storagePath: row.storage_path,
        previewUrl: row.previewDataUrl || row.previewUrl,
        archivedAt: row.supabase_deleted_at || row.created_at,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load archived artwork.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'This restore request came from an untrusted site.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'artwork-restore', 12, 10 * 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many restore requests. Please wait and try again.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 4096)) return NextResponse.json({ error: 'The restore request is too large.' }, { status: 413 });
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Artwork storage is temporarily unavailable.' }, { status: 503 });
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to restore archived artwork.' }, { status: 401 });
  try {
    const body = await request.json() as { archiveId?: string };
    const archiveId = String(body.archiveId || '').trim();
    if (!archiveId) return NextResponse.json({ error: 'Choose archived artwork to restore.' }, { status: 400 });
    return NextResponse.json({ item: await restoreArchivedArtworkForUser(archiveId, user.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not restore archived artwork.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
