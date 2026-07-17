import { NextResponse } from 'next/server';
import { verifyArtworkAccessToken } from '@/lib/server/artwork-access';
import { getStorageSignedUrl, hasSupabaseAdminConfig } from '@/lib/server/supabase-admin';
import { enforceRateLimit } from '@/lib/server/request-security';

export const runtime = 'nodejs';

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const errorPage = (message: string, status: number) => new NextResponse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hue Studio Artwork</title></head>
<body style="margin:0;background:#061321;color:#e5f6ff;font-family:Arial,Helvetica,sans-serif;display:grid;min-height:100vh;place-items:center;padding:24px;box-sizing:border-box">
  <main style="max-width:560px;border:1px solid #168ac0;border-radius:18px;background:#081b2d;padding:30px;box-shadow:0 18px 60px rgba(0,0,0,.35)">
    <p style="margin:0;color:#59d4ff;font-weight:900;letter-spacing:.16em;font-size:12px">HUE STUDIO</p>
    <h1 style="margin:10px 0 8px;font-size:26px">Artwork unavailable</h1>
    <p style="margin:0;color:#b7c9d8;line-height:1.55">${escapeHtml(message)}</p>
  </main>
</body></html>`, {
  status,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
});

export async function GET(request: Request) {
  const retryAfter = enforceRateLimit(request, 'artwork-open', 120, 10 * 60 * 1000);
  if (retryAfter) return errorPage('Too many artwork link requests. Please wait and try again.', 429);
  if (!hasSupabaseAdminConfig()) return errorPage('Hue Studio storage access is not configured.', 503);
  const token = new URL(request.url).searchParams.get('token') || '';
  try {
    const payload = verifyArtworkAccessToken(token);
    const signedUrl = await getStorageSignedUrl(payload.path, 60 * 5);
    const response = NextResponse.redirect(signedUrl, 307);
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'This artwork link could not be opened.';
    return errorPage(message, message.includes('expired') ? 410 : 403);
  }
}
