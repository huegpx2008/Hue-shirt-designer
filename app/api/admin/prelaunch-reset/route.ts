import { NextRequest, NextResponse } from 'next/server';

import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { deleteBackblazeObject, hasBackblazeB2Config } from '@/lib/server/backblaze-b2';
import { isGoogleDriveArchiveConfigured, trashDriveFile } from '@/lib/server/google-drive';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';
import { getStorageBucket, getSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/server/supabase-admin';

const RESET_CONFIRMATION = 'RESET HUE TEST DATA';
const STORAGE_PREFIXES = ['customers', 'guest-orders', 'orders', 'restored', 'archive-previews'] as const;
const PAGE_SIZE = 1000;
const BATCH_SIZE = 100;

type StorageFileStat = { prefix: string; count: number; bytes: number };
type StorageObject = { id?: string | null; name?: string; metadata?: { size?: number; mimetype?: string } | null };
type ArtworkAssetResetRow = {
  id: string;
  original_provider?: string | null;
  original_object_key?: string | null;
  file_size?: number | null;
  source_deleted_at?: string | null;
  drive_file_id?: string | null;
};
type OrderResetRow = { id: string; drive_folder_id?: string | null };
type ArchiveResetRow = { id: string; drive_file_id?: string | null };

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

const missingOptionalTable = (error: unknown) => /PGRST205|could not find the table|relation .* does not exist|schema cache/i.test(
  error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message || error || ''),
);

const listRows = async <T,>(table: string, columns: string, optional = false) => {
  const client = getSupabaseAdminClient();
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client.from(table).select(columns).range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      if (optional && missingOptionalTable(error)) return [];
      throw error;
    }
    const page = (data || []) as unknown as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
};

const listIds = async (table: string, optional = false) => (await listRows<{ id?: string }>(table, 'id', optional))
  .map((row) => row.id)
  .filter(Boolean) as string[];

const listAuthUsers = async () => {
  const client = getSupabaseAdminClient();
  const users: Array<{ id: string; email?: string }> = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const pageUsers = data.users || [];
    users.push(...pageUsers.map((user) => ({ id: user.id, email: user.email })));
    if (pageUsers.length < 200) return users;
  }
};

const listStoragePaths = async (prefix: string, depth = 0): Promise<Array<{ path: string; bytes: number }>> => {
  const client = getSupabaseAdminClient();
  const bucket = client.storage.from(getStorageBucket());
  const entries: StorageObject[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    const page = (data || []) as StorageObject[];
    entries.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  const files = entries
    .filter((entry) => entry.name && entry.name !== '.emptyFolderPlaceholder' && entry.id)
    .map((entry) => ({ path: `${prefix}/${entry.name}`, bytes: Number(entry.metadata?.size || 0) }));
  if (depth >= 12) return files;
  const folders = entries.filter((entry) => entry.name && !entry.id);
  const nested = await Promise.all(folders.map((folder) => listStoragePaths(`${prefix}/${folder.name}`, depth + 1)));
  return [...files, ...nested.flat()];
};

const getResetTargets = async () => {
  const [orders, users, paymentAttempts, archiveRows, artworkAssets] = await Promise.all([
    listRows<OrderResetRow>('hue_orders', 'id,drive_folder_id'),
    listAuthUsers(),
    listIds('hue_payment_attempts', true),
    listRows<ArchiveResetRow>('hue_artwork_archive', 'id,drive_file_id', true),
    listRows<ArtworkAssetResetRow>('hue_artwork_assets', 'id,original_provider,original_object_key,file_size,source_deleted_at,drive_file_id', true),
  ]);
  return { orders, users, paymentAttempts, archiveRows, artworkAssets };
};

const b2Targets = (assets: ArtworkAssetResetRow[]) => assets.filter((asset) => (
  asset.original_provider === 'b2' && asset.original_object_key && !asset.source_deleted_at
));

const driveTargets = (targets: Awaited<ReturnType<typeof getResetTargets>>) => [...new Set([
  ...targets.orders.map((row) => row.drive_folder_id),
  ...targets.archiveRows.map((row) => row.drive_file_id),
  ...targets.artworkAssets.map((row) => row.drive_file_id),
].filter(Boolean) as string[])];

const getPreview = async (providedTargets?: Awaited<ReturnType<typeof getResetTargets>>) => {
  const [targets, storageGroups] = await Promise.all([
    providedTargets || getResetTargets(),
    Promise.all(STORAGE_PREFIXES.map(async (prefix): Promise<StorageFileStat> => {
      const files = await listStoragePaths(prefix);
      return { prefix, count: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0) };
    })),
  ]);
  const activeB2Targets = b2Targets(targets.artworkAssets);
  return {
    orders: targets.orders.length,
    users: targets.users.length,
    paymentAttempts: targets.paymentAttempts.length,
    archiveRows: targets.archiveRows.length,
    artworkAssets: targets.artworkAssets.length,
    b2Originals: activeB2Targets.length,
    b2Bytes: activeB2Targets.reduce((total, asset) => total + Number(asset.file_size || 0), 0),
    driveCopies: driveTargets(targets).length,
    files: storageGroups,
    totalFiles: storageGroups.reduce((total, group) => total + group.count, 0),
    totalBytes: storageGroups.reduce((total, group) => total + group.bytes, 0),
  };
};

const deleteRows = async (table: string, optional = false) => {
  const client = getSupabaseAdminClient();
  const ids = await listIds(table, optional);
  let deleted = 0;
  for (const batch of chunk(ids, BATCH_SIZE)) {
    const { error } = await client.from(table).delete().in('id', batch);
    if (error) {
      if (optional && missingOptionalTable(error)) return deleted;
      throw error;
    }
    deleted += batch.length;
  }
  return deleted;
};

const deleteExternalArtwork = async (targets: Awaited<ReturnType<typeof getResetTargets>>) => {
  const b2 = b2Targets(targets.artworkAssets);
  const drive = driveTargets(targets);
  if (drive.length && !isGoogleDriveArchiveConfigured()) {
    throw new Error('Google Drive contains test archive references, but its credentials are not configured. Reset stopped before deleting database records.');
  }
  if (b2.length && !hasBackblazeB2Config()) {
    throw new Error('Backblaze B2 contains test original references, but its credentials are not configured. Reset stopped before deleting database records.');
  }

  const driveFailures: string[] = [];
  let trashedDriveCopies = 0;
  for (const batch of chunk(drive, 10)) {
    const results = await Promise.allSettled(batch.map((fileId) => trashDriveFile(fileId)));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') trashedDriveCopies += 1;
      else driveFailures.push(batch[index]);
    });
  }
  if (driveFailures.length) {
    throw new Error(`Could not move ${driveFailures.length} Google Drive test archive${driveFailures.length === 1 ? '' : 's'} to trash. Reset stopped before deleting database records so it can be retried.`);
  }

  const b2Failures: string[] = [];
  let deletedB2Originals = 0;
  let deletedB2Bytes = 0;
  for (const batch of chunk(b2, 10)) {
    const results = await Promise.allSettled(batch.map((asset) => deleteBackblazeObject(String(asset.original_object_key))));
    results.forEach((result, index) => {
      const asset = batch[index];
      if (result.status === 'fulfilled') {
        deletedB2Originals += 1;
        deletedB2Bytes += Number(asset.file_size || 0);
      } else {
        b2Failures.push(String(asset.original_object_key));
      }
    });
  }
  if (b2Failures.length) {
    throw new Error(`Could not delete ${b2Failures.length} Backblaze B2 test original${b2Failures.length === 1 ? '' : 's'}. Reset stopped before deleting database records so it can be retried.`);
  }

  return { deletedB2Originals, deletedB2Bytes, trashedDriveCopies };
};

const deleteStoragePrefixes = async () => {
  const client = getSupabaseAdminClient();
  const bucket = client.storage.from(getStorageBucket());
  const filesByPrefix = await Promise.all(STORAGE_PREFIXES.map(async (prefix) => ({ prefix, files: await listStoragePaths(prefix) })));
  let deletedFiles = 0;
  let deletedBytes = 0;
  const skipped: string[] = [];
  for (const group of filesByPrefix) {
    for (const batch of chunk(group.files, BATCH_SIZE)) {
      const paths = batch.map((file) => file.path);
      const { error } = await bucket.remove(paths);
      if (error) {
        skipped.push(...paths);
      } else {
        deletedFiles += batch.length;
        deletedBytes += batch.reduce((total, file) => total + file.bytes, 0);
      }
    }
  }
  return { deletedFiles, deletedBytes, skipped };
};

const deleteAuthUsers = async () => {
  const client = getSupabaseAdminClient();
  const users = await listAuthUsers();
  let deleted = 0;
  const skipped: Array<{ id: string; email?: string; error: string }> = [];
  for (const user of users) {
    const { error } = await client.auth.admin.deleteUser(user.id);
    if (error) skipped.push({ ...user, error: error.message });
    else deleted += 1;
  }
  return { deleted, skipped };
};

export async function GET(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  const retryAfter = enforceRateLimit(request, 'admin-prelaunch-reset-preview', 20, 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Reset preview is temporarily limited. Wait a moment.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Add SUPABASE_SERVICE_ROLE_KEY to preview test-data reset.' }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, confirmationPhrase: RESET_CONFIRMATION, preview: await getPreview() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not preview reset.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Cross-site admin changes are not allowed.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'admin-prelaunch-reset', 2, 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'A reset was just requested. Wait a moment.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 4096)) return NextResponse.json({ error: 'The reset request is too large.' }, { status: 413 });
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Add SUPABASE_SERVICE_ROLE_KEY to reset test data.' }, { status: 503 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (body.confirmation !== RESET_CONFIRMATION) return NextResponse.json({ error: `Type ${RESET_CONFIRMATION} to confirm this reset.` }, { status: 400 });

  try {
    const targets = await getResetTargets();
    const before = await getPreview(targets);
    const deleteArtworkFiles = body.deleteArtworkFiles !== false;
    const deleteOrders = body.deleteOrders !== false;
    const deleteCustomerAccounts = body.deleteCustomerAccounts !== false;
    if (deleteCustomerAccounts && !deleteArtworkFiles && targets.artworkAssets.length) {
      return NextResponse.json({ error: 'Artwork files must be deleted when customer accounts are deleted, or B2 originals would lose their cleanup records.' }, { status: 400 });
    }

    const externalArtwork = deleteArtworkFiles
      ? await deleteExternalArtwork(targets)
      : { deletedB2Originals: 0, deletedB2Bytes: 0, trashedDriveCopies: 0 };
    const storage = deleteArtworkFiles
      ? await deleteStoragePrefixes()
      : { deletedFiles: 0, deletedBytes: 0, skipped: [] as string[] };
    if (storage.skipped.length) {
      throw new Error(`Could not delete ${storage.skipped.length} Supabase artwork file${storage.skipped.length === 1 ? '' : 's'}. Reset stopped before deleting database records so it can be retried.`);
    }

    const deleted = {
      paymentAttempts: deleteOrders ? await deleteRows('hue_payment_attempts', true) : 0,
      orders: deleteOrders ? await deleteRows('hue_orders') : 0,
      archiveRows: body.deleteArchiveRows === false ? 0 : await deleteRows('hue_artwork_archive', true),
      artworkAssets: deleteArtworkFiles ? await deleteRows('hue_artwork_assets', true) : 0,
      storage,
      externalArtwork,
      users: deleteCustomerAccounts ? await deleteAuthUsers() : { deleted: 0, skipped: [] as Array<{ id: string; email?: string; error: string }> },
    };
    const after = await getPreview();
    return NextResponse.json({ ok: true, before, deleted, after });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Pre-launch reset failed.' }, { status: 500 });
  }
}
