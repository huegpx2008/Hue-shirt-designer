import { NextRequest, NextResponse } from 'next/server';

import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';
import { getStorageBucket, getSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/server/supabase-admin';

type StoredOrder = {
  id: string;
  order_number: string;
  submission_key?: string | null;
  payment_status?: string | null;
  paypal_order_id?: string | null;
  paypal_capture_id?: string | null;
  promo_code?: string | null;
  drive_folder_id?: string | null;
  order_data?: {
    paymentMode?: string;
    payment?: { status?: string };
    items?: Array<{
      artworkFiles?: Array<{ role?: string; storagePath?: string }>;
      productionBreakdown?: Array<{ frontStoragePath?: string; backStoragePath?: string }>;
      productionRecipes?: Array<{ proofStoragePath?: string }>;
    }>;
  } | null;
};

type ArchiveRow = {
  id: string;
  storage_path?: string | null;
  preview_storage_path?: string | null;
  restored_storage_path?: string | null;
  drive_file_id?: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const chunk = <T,>(items: T[], size = 100) => {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
};
const isOrderArtifactPath = (path?: string | null) => Boolean(path && (
  path.startsWith('orders/')
  || /\/order-proofs\//i.test(path)
));
const canDeleteOrder = (order: StoredOrder) => {
  const paymentStatus = String(order.payment_status || order.order_data?.payment?.status || '').toLowerCase();
  const protectedPayment = Boolean(order.paypal_capture_id)
    || ['completed', 'captured', 'paid', 'approved'].includes(paymentStatus);
  const releasedPayment = ['refunded', 'reversed', 'denied', 'failed', 'voided', 'canceled', 'cancelled'].includes(paymentStatus);
  return !protectedPayment || releasedPayment;
};
const orderArtifactPaths = (order: StoredOrder) => {
  const paths = new Set<string>();
  for (const item of order.order_data?.items || []) {
    for (const file of item.artworkFiles || []) {
      if (isOrderArtifactPath(file.storagePath) || /approved proof|final production/i.test(file.role || '')) {
        if (isOrderArtifactPath(file.storagePath)) paths.add(String(file.storagePath));
      }
    }
    for (const artwork of item.productionBreakdown || []) {
      if (isOrderArtifactPath(artwork.frontStoragePath)) paths.add(String(artwork.frontStoragePath));
      if (isOrderArtifactPath(artwork.backStoragePath)) paths.add(String(artwork.backStoragePath));
    }
    for (const recipe of item.productionRecipes || []) {
      if (isOrderArtifactPath(recipe.proofStoragePath)) paths.add(String(recipe.proofStoragePath));
    }
  }
  return paths;
};

export async function DELETE(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Cross-site admin changes are not allowed.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'admin-delete-order', 10, 10 * 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many order deletions were requested. Wait a moment.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 8 * 1024)) return NextResponse.json({ error: 'The order deletion request is too large.' }, { status: 413 });
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Secure admin storage is not configured.' }, { status: 503 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const orderId = String(body.orderId || '').trim();
  const confirmation = String(body.confirmation || '').trim();
  if (!UUID_PATTERN.test(orderId)) return NextResponse.json({ error: 'Choose a valid order.' }, { status: 400 });

  try {
    const client = getSupabaseAdminClient();
    const { data, error } = await client.from('hue_orders').select('*').eq('id', orderId).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'That order no longer exists.' }, { status: 404 });
    const order = data as StoredOrder;
    if (confirmation !== order.order_number) {
      return NextResponse.json({ error: `Type ${order.order_number} exactly to delete this order.` }, { status: 400 });
    }
    if (!canDeleteOrder(order)) {
      return NextResponse.json({ error: 'This order has an active captured payment and is protected. Refund or reverse the payment before removing its Studio test record.' }, { status: 409 });
    }

    const { data: archiveData, error: archiveError } = await client.from('hue_artwork_archive')
      .select('id,storage_path,preview_storage_path,restored_storage_path,drive_file_id')
      .eq('order_id', order.id);
    if (archiveError && !/PGRST205|does not exist|schema cache/i.test(archiveError.message)) throw archiveError;
    const archiveRows = (archiveData || []) as ArchiveRow[];
    const artifacts = orderArtifactPaths(order);
    for (const row of archiveRows) if (isOrderArtifactPath(row.storage_path)) artifacts.add(String(row.storage_path));
    const storagePaths = new Set<string>(artifacts);
    for (const row of archiveRows.filter((entry) => isOrderArtifactPath(entry.storage_path))) {
      if (row.preview_storage_path) storagePaths.add(row.preview_storage_path);
      if (row.restored_storage_path) storagePaths.add(row.restored_storage_path);
    }
    const bucket = client.storage.from(getStorageBucket());
    for (const paths of chunk([...storagePaths])) {
      const { error: storageError } = await bucket.remove(paths);
      if (storageError) throw new Error(`Order artwork cleanup failed: ${storageError.message}`);
    }

    const orderArchiveIds = archiveRows.filter((entry) => isOrderArtifactPath(entry.storage_path)).map((entry) => entry.id);
    for (const ids of chunk(orderArchiveIds)) {
      const { error: deleteArchiveError } = await client.from('hue_artwork_archive').delete().in('id', ids);
      if (deleteArchiveError) throw deleteArchiveError;
    }
    const reusableArchiveIds = archiveRows.filter((entry) => !isOrderArtifactPath(entry.storage_path)).map((entry) => entry.id);
    for (const ids of chunk(reusableArchiveIds)) {
      const { error: detachError } = await client.from('hue_artwork_archive').update({ order_id: null, order_number: null, updated_at: new Date().toISOString() }).in('id', ids);
      if (detachError) throw detachError;
    }

    if (order.submission_key) {
      const { error: paymentError } = await client.from('hue_payment_attempts').delete().eq('submission_key', order.submission_key);
      if (paymentError && !/PGRST205|does not exist|schema cache/i.test(paymentError.message)) throw paymentError;
    } else if (order.paypal_order_id) {
      const { error: paymentError } = await client.from('hue_payment_attempts').delete().eq('paypal_order_id', order.paypal_order_id);
      if (paymentError && !/PGRST205|does not exist|schema cache/i.test(paymentError.message)) throw paymentError;
    }

    if (order.promo_code) {
      const { data: promo } = await client.from('hue_promo_codes').select('id,uses_count').ilike('code', order.promo_code).maybeSingle();
      if (promo?.id) await client.from('hue_promo_codes').update({ uses_count: Math.max(0, Number(promo.uses_count || 0) - 1), updated_at: new Date().toISOString() }).eq('id', promo.id);
    }

    const { error: deleteError } = await client.from('hue_orders').delete().eq('id', order.id);
    if (deleteError) throw deleteError;
    return NextResponse.json({
      deleted: true,
      orderId: order.id,
      orderNumber: order.order_number,
      removedOrderArtifacts: storagePaths.size,
      driveArchivePreserved: Boolean(order.drive_folder_id),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The selected order could not be deleted.' }, { status: 500 });
  }
}
