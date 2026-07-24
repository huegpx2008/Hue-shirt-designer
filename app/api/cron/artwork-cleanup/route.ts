import { NextRequest, NextResponse } from 'next/server';

import { archiveStaleCustomerArtwork, cleanupExpiredGuestUploads, cleanupVerifiedSupabaseArtwork, getArtworkArchiveStats } from '@/lib/server/artwork-archive';
import { CUSTOMER_LIBRARY_DRIVE_ARCHIVE_DELAY_DAYS, GUEST_UPLOAD_RETENTION_HOURS, ORDER_DRIVE_ARCHIVE_DELAY_DAYS } from '@/lib/server/artwork-retention';
import { isGoogleDriveArchiveConfigured } from '@/lib/server/google-drive';
import { archiveOrderToDriveBestEffort, DriveArchiveOrder } from '@/lib/server/order-drive-archive';
import { supabaseAdminFetch } from '@/lib/server/supabase-admin';
import { cleanupVerifiedBackblazeArtwork } from '@/lib/server/b2-artwork-retention';

const DAY_MS = 24 * 60 * 60 * 1000;

const authorized = (request: NextRequest) => {
  const secret = process.env.CRON_SECRET || '';
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
};

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Cron authorization required.' }, { status: 401 });
  try {
    const archiveResults: Array<{ orderNumber: string; ok: boolean }> = [];
    if (isGoogleDriveArchiveConfigured()) {
      const orders = await supabaseAdminFetch(
        '/rest/v1/hue_orders?select=*&order=created_at.asc&limit=100',
      ) as DriveArchiveOrder[];
      const archiveCutoff = Date.now() - ORDER_DRIVE_ARCHIVE_DELAY_DAYS * DAY_MS;
      const pendingOrders = orders.filter((order) => order.drive_archive_status !== 'archived' && new Date(order.created_at || 0).getTime() <= archiveCutoff).slice(0, 25);
      for (const order of pendingOrders) {
        const result = await archiveOrderToDriveBestEffort(order, { force: true });
        archiveResults.push({ orderNumber: order.order_number, ok: result.ok });
      }
    }
    const staleArchive = await archiveStaleCustomerArtwork({ maxAgeDays: CUSTOMER_LIBRARY_DRIVE_ARCHIVE_DELAY_DAYS, limit: 25 });
    const cleanup = await cleanupVerifiedSupabaseArtwork({ limit: 100 });
    const b2Cleanup = await cleanupVerifiedBackblazeArtwork({ limit: 100 });
    const guestCleanup = await cleanupExpiredGuestUploads({ maxAgeHours: GUEST_UPLOAD_RETENTION_HOURS, limit: 100 });
    return NextResponse.json({ ok: true, staleArchive, cleanup, b2Cleanup, guestCleanup, archiveResults, stats: await getArtworkArchiveStats() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scheduled artwork cleanup failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
