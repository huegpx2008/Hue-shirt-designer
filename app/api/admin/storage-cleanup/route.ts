import { NextRequest, NextResponse } from 'next/server';

import { archiveStaleCustomerArtwork, cleanupExpiredGuestUploads, getArtworkArchiveStats, cleanupVerifiedSupabaseArtwork } from '@/lib/server/artwork-archive';
import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { isGoogleDriveArchiveConfigured } from '@/lib/server/google-drive';
import { archiveOrderToDriveBestEffort, DriveArchiveOrder } from '@/lib/server/order-drive-archive';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';
import { supabaseAdminFetch } from '@/lib/server/supabase-admin';

const GUEST_UPLOAD_RETENTION_HOURS = 24 * 7;

const recentUnarchivedOrders = async () => {
  const orders = await supabaseAdminFetch(
    '/rest/v1/hue_orders?select=*&order=created_at.desc&limit=100',
  ) as DriveArchiveOrder[];
  return orders.filter((order) => order.drive_archive_status !== 'archived').slice(0, 25);
};

export async function GET(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  try {
    return NextResponse.json({
      ok: true,
      driveConfigured: isGoogleDriveArchiveConfigured(),
      stats: await getArtworkArchiveStats(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load storage cleanup status.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Cross-site admin changes are not allowed.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'admin-storage-cleanup', 4, 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'A cleanup was just requested. Wait a moment.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 4096)) return NextResponse.json({ error: 'The cleanup request is too large.' }, { status: 413 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const emergency = body.emergency === true;
  try {
    const before = await getArtworkArchiveStats();
    const archiveResults: Array<{ orderNumber: string; ok: boolean; error?: string }> = [];
    if (isGoogleDriveArchiveConfigured()) {
      for (const order of await recentUnarchivedOrders()) {
        const result = await archiveOrderToDriveBestEffort(order, { force: true });
        archiveResults.push({
          orderNumber: order.order_number,
          ok: result.ok,
          error: result.ok ? undefined : result.error,
        });
      }
    }
    const staleArchive = await archiveStaleCustomerArtwork({ maxAgeDays: 30, limit: 25 });
    const cleanup = await cleanupVerifiedSupabaseArtwork({ emergency, limit: 100 });
    const guestCleanup = await cleanupExpiredGuestUploads({ maxAgeHours: GUEST_UPLOAD_RETENTION_HOURS, limit: 100 });
    const after = await getArtworkArchiveStats();
    return NextResponse.json({ ok: true, emergency, before, after, staleArchive, cleanup, guestCleanup, archiveResults });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Storage cleanup failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
