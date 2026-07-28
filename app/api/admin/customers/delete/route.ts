import { NextRequest, NextResponse } from 'next/server';

import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { deleteBackblazeObject, hasBackblazeB2Config } from '@/lib/server/backblaze-b2';
import { isGoogleDriveArchiveConfigured, trashDriveFile } from '@/lib/server/google-drive';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';
import { getStorageBucket, getSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/server/supabase-admin';

type ArtworkAsset = {
  id: string;
  original_provider?: string | null;
  original_object_key?: string | null;
  source_deleted_at?: string | null;
  preview_storage_path?: string | null;
  thumbnail_storage_path?: string | null;
  drive_file_id?: string | null;
  drive_folder_id?: string | null;
};
type ArchiveRow = {
  id: string;
  storage_path?: string | null;
  preview_storage_path?: string | null;
  restored_storage_path?: string | null;
  drive_file_id?: string | null;
  drive_folder_id?: string | null;
};
type StorageEntry = { id?: string | null; name?: string; metadata?: { size?: number } | null };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 1000;
const chunk = <T,>(items: T[], size = 100) => {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
};
const safeFolder = (value: string, fallback: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || fallback;
const missingOptionalTable = (message?: string) => /PGRST205|does not exist|schema cache|could not find the table/i.test(message || '');

const listStoragePaths = async (prefix: string, depth = 0): Promise<string[]> => {
  const bucket = getSupabaseAdminClient().storage.from(getStorageBucket());
  const entries: StorageEntry[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    const page = (data || []) as StorageEntry[];
    entries.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  const files = entries
    .filter((entry) => entry.id && entry.name && entry.name !== '.emptyFolderPlaceholder')
    .map((entry) => `${prefix}/${entry.name}`);
  if (depth >= 12) return files;
  const folders = entries.filter((entry) => !entry.id && entry.name);
  const nested = await Promise.all(folders.map((entry) => listStoragePaths(`${prefix}/${entry.name}`, depth + 1)));
  return [...files, ...nested.flat()];
};

export async function DELETE(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Cross-site admin changes are not allowed.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'admin-delete-customer', 5, 10 * 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many customer deletions were requested. Wait a moment.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 8 * 1024)) return NextResponse.json({ error: 'The customer deletion request is too large.' }, { status: 413 });
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Secure admin storage is not configured.' }, { status: 503 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const userId = String(body.userId || '').trim();
  const confirmation = String(body.confirmation || '').trim().toLowerCase();
  if (!UUID_PATTERN.test(userId)) return NextResponse.json({ error: 'Choose a valid customer account.' }, { status: 400 });

  try {
    const client = getSupabaseAdminClient();
    const { data: userData, error: userError } = await client.auth.admin.getUserById(userId);
    if (userError || !userData.user) return NextResponse.json({ error: 'That customer account no longer exists.' }, { status: 404 });
    const email = String(userData.user.email || '').trim().toLowerCase();
    if (!email || confirmation !== email) {
      return NextResponse.json({ error: `Type ${email || 'the customer email'} exactly to delete this account.` }, { status: 400 });
    }

    const [{ data: idOrders, error: idOrderError }, { data: emailOrders, error: emailOrderError }] = await Promise.all([
      client.from('hue_orders').select('id,order_number').eq('customer_user_id', userId).limit(1),
      client.from('hue_orders').select('id,order_number').ilike('customer_email', email).limit(1),
    ]);
    if (idOrderError) throw idOrderError;
    if (emailOrderError) throw emailOrderError;
    const linkedOrders = [...(idOrders || []), ...(emailOrders || [])];
    if (linkedOrders.length) {
      return NextResponse.json({ error: `This account still has order ${linkedOrders[0].order_number || 'history'}. Delete its removable test orders first; paid order history protects the customer account.` }, { status: 409 });
    }

    const [{ data: idPayments, error: idPaymentError }, { data: emailPayments, error: emailPaymentError }] = await Promise.all([
      client.from('hue_payment_attempts').select('id,status').eq('customer_user_id', userId),
      client.from('hue_payment_attempts').select('id,status').ilike('customer_email', email),
    ]);
    if (idPaymentError && !missingOptionalTable(idPaymentError.message)) throw idPaymentError;
    if (emailPaymentError && !missingOptionalTable(emailPaymentError.message)) throw emailPaymentError;
    const paymentAttempts = [...new Map([...(idPayments || []), ...(emailPayments || [])].map((attempt) => [attempt.id, attempt])).values()];
    const protectedAttempt = paymentAttempts.find((attempt) => ['approved', 'completed'].includes(String(attempt.status || '').toLowerCase()));
    if (protectedAttempt) {
      return NextResponse.json({ error: 'This account has a completed or approved payment record and is protected from deletion.' }, { status: 409 });
    }

    const { data: assetData, error: assetError } = await client.from('hue_artwork_assets').select('*').eq('owner_user_id', userId);
    if (assetError && !missingOptionalTable(assetError.message)) throw assetError;
    const assets = (assetData || []) as ArtworkAsset[];

    const { data: archiveData, error: archiveError } = await client.from('hue_artwork_archive').select('*').eq('owner_user_id', userId);
    if (archiveError && !missingOptionalTable(archiveError.message)) throw archiveError;
    const archiveRows = (archiveData || []) as ArchiveRow[];

    const b2Assets = assets.filter((asset) => asset.original_provider === 'b2' && asset.original_object_key && !asset.source_deleted_at);
    if (b2Assets.length && !hasBackblazeB2Config()) {
      return NextResponse.json({ error: 'This account owns B2 originals, but B2 cleanup is not configured. Nothing was deleted.' }, { status: 503 });
    }
    const driveFolderIds = [...new Set([...assets, ...archiveRows].map((entry) => entry.drive_folder_id).filter(Boolean) as string[])];
    const driveFileIds = [...new Set([...assets, ...archiveRows]
      .filter((entry) => !entry.drive_folder_id)
      .map((entry) => entry.drive_file_id)
      .filter(Boolean) as string[])];
    if ((driveFolderIds.length || driveFileIds.length) && !isGoogleDriveArchiveConfigured()) {
      return NextResponse.json({ error: 'This account owns Drive archives, but Drive cleanup is not configured. Nothing was deleted.' }, { status: 503 });
    }
    for (const group of chunk(b2Assets, 10)) await Promise.all(group.map((asset) => deleteBackblazeObject(String(asset.original_object_key))));
    for (const group of chunk([...driveFolderIds, ...driveFileIds], 10)) await Promise.all(group.map((fileId) => trashDriveFile(fileId)));

    const customerPrefix = `customers/${safeFolder(email, 'customer')}/${userId}`;
    const ownedStoragePaths = new Set(await listStoragePaths(customerPrefix));
    for (const asset of assets) {
      if (asset.preview_storage_path) ownedStoragePaths.add(asset.preview_storage_path);
      if (asset.thumbnail_storage_path) ownedStoragePaths.add(asset.thumbnail_storage_path);
    }
    for (const row of archiveRows) {
      if (row.storage_path?.split('/').includes(userId)) ownedStoragePaths.add(row.storage_path);
      if (row.preview_storage_path) ownedStoragePaths.add(row.preview_storage_path);
      if (row.restored_storage_path) ownedStoragePaths.add(row.restored_storage_path);
    }
    const bucket = client.storage.from(getStorageBucket());
    for (const paths of chunk([...ownedStoragePaths])) {
      const { error: storageError } = await bucket.remove(paths);
      if (storageError) throw new Error(`Customer artwork cleanup failed: ${storageError.message}`);
    }

    if (archiveRows.length) {
      const { error: deleteArchiveError } = await client.from('hue_artwork_archive').delete().eq('owner_user_id', userId);
      if (deleteArchiveError) throw deleteArchiveError;
    }
    if (assets.length) {
      const { error: deleteAssetsError } = await client.from('hue_artwork_assets').delete().eq('owner_user_id', userId);
      if (deleteAssetsError) throw deleteAssetsError;
    }
    const { error: cartError } = await client.from('hue_customer_carts').delete().eq('owner_user_id', userId);
    if (cartError && !missingOptionalTable(cartError.message)) throw cartError;
    if (paymentAttempts.length) {
      const { error: deletePaymentError } = await client.from('hue_payment_attempts').delete().in('id', paymentAttempts.map((attempt) => attempt.id));
      if (deletePaymentError && !missingOptionalTable(deletePaymentError.message)) throw deletePaymentError;
    }
    const { error: deleteUserError } = await client.auth.admin.deleteUser(userId);
    if (deleteUserError) throw deleteUserError;

    return NextResponse.json({
      deleted: true,
      userId,
      email,
      removedArtworkAssets: assets.length,
      removedStorageFiles: ownedStoragePaths.size,
      removedArchiveRows: archiveRows.length,
      trashedDriveItems: driveFolderIds.length + driveFileIds.length,
      deletedB2Originals: b2Assets.length,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The selected customer account could not be deleted.' }, { status: 500 });
  }
}
