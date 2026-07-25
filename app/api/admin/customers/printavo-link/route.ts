import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/server/supabase-admin';

const normalizePrintavoProfileUrl = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length > 2000) throw new Error('The Printavo profile URL is too long.');
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Paste a complete Printavo public-profile URL.');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || (hostname !== 'printavo.com' && !hostname.endsWith('.printavo.com'))) {
    throw new Error('Use an HTTPS link hosted by Printavo.');
  }
  if (parsed.username || parsed.password) throw new Error('That Printavo URL is not valid.');
  parsed.hash = '';
  return parsed.toString();
};

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Cross-site admin changes are not allowed.' }, { status: 403 });
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Customer account management is temporarily unavailable.' }, { status: 503 });
  const retryAfter = enforceRateLimit(request, 'admin-customer-printavo-link', 60, 10 * 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many customer-link changes. Please wait a moment.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 8 * 1024)) return NextResponse.json({ error: 'The customer-link request is too large.' }, { status: 413 });

  const body = await request.json().catch(() => ({})) as { userId?: unknown; printavoProfileUrl?: unknown };
  const userId = String(body.userId || '').trim();
  if (!/^[0-9a-f-]{20,80}$/i.test(userId)) return NextResponse.json({ error: 'Choose a valid customer account.' }, { status: 400 });
  let printavoProfileUrl: string;
  try {
    printavoProfileUrl = normalizePrintavoProfileUrl(body.printavoProfileUrl);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'That Printavo profile URL is invalid.' }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data: existing, error: readError } = await admin.auth.admin.getUserById(userId);
    if (readError || !existing.user) return NextResponse.json({ error: 'That customer account could not be found.' }, { status: 404 });
    const nextAppMetadata = { ...(existing.user.app_metadata || {}) } as Record<string, unknown>;
    if (printavoProfileUrl) nextAppMetadata.printavo_profile_url = printavoProfileUrl;
    else delete nextAppMetadata.printavo_profile_url;
    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(userId, { app_metadata: nextAppMetadata });
    if (updateError || !updated.user) throw new Error(updateError?.message || 'The customer account could not be updated.');
    return NextResponse.json({ user: updated.user });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The Printavo profile link could not be saved.' }, { status: 500 });
  }
}
