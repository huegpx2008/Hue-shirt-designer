import { NextRequest, NextResponse } from 'next/server';

import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';
import { getStorageBucket, getSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/server/supabase-admin';

const RESET_CONFIRMATION = 'RESET HUE TEST DATA';
const STORAGE_PREFIXES = ['customers', 'guest-orders', 'orders', 'restored', 'archive-previews'] as const;
const PAGE_SIZE = 1000;
const BATCH_SIZE = 100;

type StorageFileStat = { prefix: string; count: number; bytes: number };
type StorageObject = { id?: string | null; name?: string; metadata?: { size?: number; mimetype?: string } | null };

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

const listIds = async (table: string) => {
  const client = getSupabaseAdminClient();
  const ids: string[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client.from(table).select('id').range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data || []) as Array<{ id?: string }>;
    ids.push(...page.map((row) => row.id).filter(Boolean) as string[]);
    if (page.length < PAGE_SIZE) return ids;
  }
};

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

const getPreview = async () => {
  const [orders, users, archiveRows, storageGroups] = await Promise.all([
    listIds('hue_orders'),
    listAuthUsers(),
    listIds('hue_artwork_archive').catch(() => []),
    Promise.all(STORAGE_PREFIXES.map(async (prefix): Promise<StorageFileStat> => {
      const files = await listStoragePaths(prefix).catch(() => []);
      return { prefix, count: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0) };
    })),
  ]);
  return {
    orders: orders.length,
    users: users.length,
    archiveRows: archiveRows.length,
    files: storageGroups,
    totalFiles: storageGroups.reduce((total, group) => total + group.count, 0),
    totalBytes: storageGroups.reduce((total, group) => total + group.bytes, 0),
  };
};

const deleteRows = async (table: string) => {
  const client = getSupabaseAdminClient();
  const ids = await listIds(table);
  let deleted = 0;
  for (const batch of chunk(ids, BATCH_SIZE)) {
    const { error } = await client.from(table).delete().in('id', batch);
    if (error) throw error;
    deleted += batch.length;
  }
  return deleted;
};

const deleteStoragePrefixes = async () => {
  const client = getSupabaseAdminClient();
  const bucket = client.storage.from(getStorageBucket());
  const filesByPrefix = await Promise.all(STORAGE_PREFIXES.map(async (prefix) => ({ prefix, files: await listStoragePaths(prefix).catch(() => []) })));
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
    const before = await getPreview();
    const deleted = {
      orders: body.deleteOrders === false ? 0 : await deleteRows('hue_orders'),
      archiveRows: body.deleteArchiveRows === false ? 0 : await deleteRows('hue_artwork_archive').catch(() => 0),
      storage: body.deleteArtworkFiles === false ? { deletedFiles: 0, deletedBytes: 0, skipped: [] as string[] } : await deleteStoragePrefixes(),
      users: body.deleteCustomerAccounts === false ? { deleted: 0, skipped: [] as Array<{ id: string; email?: string; error: string }> } : await deleteAuthUsers(),
    };
    const after = await getPreview();
    return NextResponse.json({ ok: true, before, deleted, after });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Pre-launch reset failed.' }, { status: 500 });
  }
}
