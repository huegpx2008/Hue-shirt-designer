import 'server-only';

import { createHash } from 'node:crypto';
import sharp from 'sharp';

import {
  downloadDriveFile,
  ensureDriveFolder,
  getDriveFileMetadata,
  getGoogleDriveRootFolderId,
  isGoogleDriveArchiveConfigured,
  sanitizeDriveName,
  uploadDriveFileIfMissing,
} from '@/lib/server/google-drive';
import { getStorageBucket, getSupabaseAdminClient, getStorageSignedUrl } from '@/lib/server/supabase-admin';

const DAY_MS = 24 * 60 * 60 * 1000;
const RASTER_MIME = /^image\/(png|jpe?g|webp|gif|tiff?|avif)$/i;

export type ArtworkArchiveRecord = {
  id: string;
  storage_path: string;
  preview_storage_path?: string | null;
  owner_user_id?: string | null;
  owner_email?: string | null;
  order_id?: string | null;
  order_number?: string | null;
  kind?: string | null;
  original_name?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  drive_file_id?: string | null;
  drive_folder_id?: string | null;
  drive_web_view_link?: string | null;
  archive_status: string;
  drive_verified_at?: string | null;
  cleanup_eligible_at?: string | null;
  supabase_deleted_at?: string | null;
  restored_storage_path?: string | null;
  restore_expires_at?: string | null;
  created_at?: string | null;
};

const safeSegment = (value: string) => value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'artwork';

const inferOwner = (path: string) => {
  const currentCustomer = path.match(/^customers\/([^/]+)\/([0-9a-f-]{20,})\//i);
  if (currentCustomer) return { ownerUserId: currentCustomer[2], ownerEmail: null };
  const legacyCustomer = path.match(/^customers\/([0-9a-f-]{20,})\/([^/]+)\//i);
  if (legacyCustomer) return { ownerUserId: legacyCustomer[1], ownerEmail: null };
  const guest = path.match(/^guest-orders\/([^/]+)\//i);
  return { ownerUserId: null, ownerEmail: null, guestSessionId: guest?.[1] || null };
};

const collectGuestStoragePaths = (value: unknown, paths: Set<string>) => {
  if (typeof value === 'string') {
    let decoded = value;
    try { decoded = decodeURIComponent(value); } catch { /* Keep the original value. */ }
    for (const match of decoded.matchAll(/guest-orders\/[a-z0-9._/-]+/gi)) {
      paths.add(match[0].replace(/[),;]+$/g, ''));
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectGuestStoragePaths(entry, paths));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((entry) => collectGuestStoragePaths(entry, paths));
  }
};

const getProtectedGuestPaths = async () => {
  const client = getSupabaseAdminClient();
  const protectedPaths = new Set<string>();

  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('hue_artwork_archive').select('storage_path').like('storage_path', 'guest-orders/%').range(offset, offset + 499);
    if (error) throw new Error(error.message);
    for (const row of data || []) if (row.storage_path) protectedPaths.add(row.storage_path);
    if ((data || []).length < 500) break;
  }

  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('hue_orders').select('order_data').range(offset, offset + 499);
    if (error) throw new Error(error.message);
    for (const row of data || []) collectGuestStoragePaths(row.order_data, protectedPaths);
    if ((data || []).length < 500) break;
  }
  return protectedPaths;
};

type StorageListEntry = {
  id?: string | null;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: { size?: number | string } | null;
};

const listStorageFilesRecursively = async (prefix: string, maxFiles = 2000) => {
  const client = getSupabaseAdminClient();
  const bucket = getStorageBucket();
  const files: Array<StorageListEntry & { path: string }> = [];
  const folders = [prefix];
  while (folders.length && files.length < maxFiles) {
    const folder = folders.shift()!;
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await client.storage.from(bucket).list(folder, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new Error(error.message);
      for (const raw of data || []) {
        const entry = raw as StorageListEntry;
        const path = `${folder}/${entry.name}`;
        if (entry.id || entry.metadata) files.push({ ...entry, path });
        else folders.push(path);
      }
      if ((data || []).length < 100 || files.length >= maxFiles) break;
    }
  }
  return files;
};

export const cleanupExpiredGuestUploads = async (options: { maxAgeHours?: number; limit?: number } = {}) => {
  const client = getSupabaseAdminClient();
  const bucket = getStorageBucket();
  const maxAgeHours = Math.max(options.maxAgeHours || 72, 72);
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  const limit = Math.min(Math.max(options.limit || 100, 1), 500);
  const protectedPaths = await getProtectedGuestPaths();
  const files = await listStorageFilesRecursively('guest-orders');
  const removable = files.filter((file) => {
    const timestamp = new Date(file.updated_at || file.created_at || 0).getTime();
    return timestamp > 0 && timestamp <= cutoff && !protectedPaths.has(file.path);
  }).slice(0, limit);

  let deletedFiles = 0;
  let reclaimedBytes = 0;
  const skipped: string[] = [];
  for (let index = 0; index < removable.length; index += 50) {
    const batch = removable.slice(index, index + 50);
    const { error } = await client.storage.from(bucket).remove(batch.map((file) => file.path));
    if (error) {
      skipped.push(...batch.map((file) => `${file.path}: ${error.message}`));
      continue;
    }
    deletedFiles += batch.length;
    reclaimedBytes += batch.reduce((sum, file) => sum + Number(file.metadata?.size || 0), 0);
  }
  return { deletedFiles, reclaimedBytes, skipped, maxAgeHours };
};

const createPreview = async (bytes: ArrayBuffer, mimeType: string) => {
  if (RASTER_MIME.test(mimeType)) {
    return sharp(Buffer.from(bytes))
      .rotate()
      .resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72, effort: 4 })
      .toBuffer();
  }
  const label = mimeType === 'application/pdf' ? 'PDF' : 'FILE';
  return sharp(Buffer.from(`<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
    <rect width="640" height="480" rx="28" fill="#071827"/>
    <rect x="22" y="22" width="596" height="436" rx="22" fill="none" stroke="#26b9f3" stroke-width="4"/>
    <text x="320" y="226" text-anchor="middle" font-family="Arial,sans-serif" font-size="76" font-weight="700" fill="#ffffff">${label}</text>
    <text x="320" y="286" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="#72d7ff">HUE CLOUD ARCHIVE</text>
  </svg>`)).webp({ quality: 78 }).toBuffer();
};

export const recordVerifiedDriveArchive = async (args: {
  storagePath: string;
  originalName: string;
  kind: 'original' | 'final' | 'library';
  bytes: ArrayBuffer;
  mimeType: string;
  driveFileId: string;
  driveFolderId: string;
  driveWebViewLink?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  customerId?: string | null;
  customerEmail?: string | null;
}) => {
  const driveFile = await getDriveFileMetadata(args.driveFileId);
  if (driveFile.trashed || !driveFile.id) throw new Error(`Drive verification failed for ${args.originalName}.`);
  const driveSize = Number(driveFile.size || 0);
  if (driveSize && driveSize !== args.bytes.byteLength) {
    throw new Error(`Drive size verification failed for ${args.originalName}.`);
  }

  const client = getSupabaseAdminClient();
  const bucket = getStorageBucket();
  const owner = inferOwner(args.storagePath);
  const { data: existingRaw } = await client.from('hue_artwork_archive')
    .select('*')
    .eq('storage_path', args.storagePath)
    .maybeSingle();
  const existing = existingRaw as ArtworkArchiveRecord | null;
  // An order can reference the same customer-library object that was uploaded earlier.
  // Never let that later "final" archive pass erase its library ownership/classification.
  const preservedKind = existing?.kind === 'library' || existing?.kind === 'original'
    ? existing.kind
    : args.kind;
  // The storage path is the authoritative owner for customer-library files. Checkout
  // email/customer data must not be allowed to reassign an existing library object.
  const ownerUserId = owner.ownerUserId || existing?.owner_user_id || args.customerId || null;
  const ownerEmail = existing?.owner_email || owner.ownerEmail || args.customerEmail || null;
  const preview = await createPreview(args.bytes, args.mimeType);
  const pathHash = createHash('sha256').update(args.storagePath).digest('hex').slice(0, 16);
  const archiveKey = `${args.orderId || args.customerId || 'library'}-${safeSegment(args.kind)}-${pathHash}-${safeSegment(args.originalName)}.webp`;
  const previewPath = preview ? `archive-previews/${archiveKey}` : null;
  if (preview && previewPath) {
    const { error } = await client.storage.from(bucket).upload(previewPath, preview, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: true,
    });
    if (error) throw new Error(`Could not save archive preview: ${error.message}`);
  }

  const now = new Date();
  const { data, error } = await client.from('hue_artwork_archive').upsert({
    storage_path: args.storagePath,
    preview_storage_path: previewPath,
    owner_user_id: ownerUserId,
    owner_email: ownerEmail,
    guest_session_id: owner.guestSessionId || null,
    order_id: args.orderId || null,
    order_number: args.orderNumber || null,
    kind: preservedKind,
    original_name: args.originalName,
    mime_type: args.mimeType,
    file_size: args.bytes.byteLength,
    drive_file_id: driveFile.id,
    drive_folder_id: args.driveFolderId,
    drive_web_view_link: driveFile.webViewLink || args.driveWebViewLink || null,
    archive_status: 'verified',
    drive_verified_at: now.toISOString(),
    cleanup_eligible_at: new Date(now.getTime() + 7 * DAY_MS).toISOString(),
    error: null,
    updated_at: now.toISOString(),
  }, { onConflict: 'storage_path' }).select('*').single();
  if (error) throw new Error(`Could not record verified archive: ${error.message}`);
  return data as ArtworkArchiveRecord;
};

const existingArchivePaths = async () => {
  const client = getSupabaseAdminClient();
  const paths = new Set<string>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('hue_artwork_archive').select('storage_path').range(offset, offset + 499);
    if (error) throw new Error(error.message);
    for (const row of data || []) if (row.storage_path) paths.add(row.storage_path);
    if ((data || []).length < 500) break;
  }
  return paths;
};

export const archiveStaleCustomerArtwork = async (options: { maxAgeDays?: number; limit?: number } = {}) => {
  if (!isGoogleDriveArchiveConfigured()) {
    return { archivedFiles: 0, archivedBytes: 0, skipped: ['Google Drive archive is not configured.'], maxAgeDays: options.maxAgeDays || 30 };
  }
  const client = getSupabaseAdminClient();
  const bucket = getStorageBucket();
  const maxAgeDays = Math.max(options.maxAgeDays || 30, 7);
  const cutoff = Date.now() - maxAgeDays * DAY_MS;
  const limit = Math.min(Math.max(options.limit || 25, 1), 100);
  const registered = await existingArchivePaths();
  const files = await listStorageFilesRecursively('customers', 5000);
  const candidates = files.filter((file) => {
    const timestamp = new Date(file.updated_at || file.created_at || 0).getTime();
    return timestamp > 0
      && timestamp <= cutoff
      && !registered.has(file.path)
      && !file.path.includes('/restored/')
      && !file.name.endsWith('.emptyFolderPlaceholder');
  }).slice(0, limit);

  let archivedFiles = 0;
  let archivedBytes = 0;
  const skipped: string[] = [];
  const ownerEmails = new Map<string, string | null>();
  const libraryRoot = await ensureDriveFolder(getGoogleDriveRootFolderId(), 'CUSTOMER LIBRARIES');
  for (const file of candidates) {
    try {
      const owner = inferOwner(file.path);
      if (!owner.ownerUserId) throw new Error('Could not determine the customer owner.');
      let ownerEmail = ownerEmails.get(owner.ownerUserId);
      if (ownerEmail === undefined) {
        const { data: authData, error: authError } = await client.auth.admin.getUserById(owner.ownerUserId);
        if (authError) throw new Error(`Could not look up the customer account: ${authError.message}`);
        ownerEmail = authData.user?.email || null;
        ownerEmails.set(owner.ownerUserId, ownerEmail);
      }
      const { data, error } = await client.storage.from(bucket).download(file.path);
      if (error || !data) throw new Error(error?.message || 'Could not download the Supabase original.');
      const bytes = await data.arrayBuffer();
      const mimeType = data.type || 'application/octet-stream';
      const ownerFolder = await ensureDriveFolder(libraryRoot.id, sanitizeDriveName(ownerEmail || owner.ownerUserId, owner.ownerUserId));
      const driveFile = await uploadDriveFileIfMissing({
        parentId: ownerFolder.id,
        name: `${safeSegment(owner.ownerUserId).slice(0, 12)}-${safeSegment(file.name)}`,
        mimeType,
        bytes,
      });
      if (!driveFile.id) throw new Error('Google Drive did not return a file id.');
      await recordVerifiedDriveArchive({
        storagePath: file.path,
        originalName: file.name,
        kind: 'library',
        bytes,
        mimeType,
        driveFileId: driveFile.id,
        driveFolderId: ownerFolder.id,
        driveWebViewLink: driveFile.webViewLink || null,
        customerId: owner.ownerUserId,
        customerEmail: ownerEmail,
      });
      archivedFiles += 1;
      archivedBytes += bytes.byteLength;
    } catch (archiveError) {
      skipped.push(`${file.path}: ${archiveError instanceof Error ? archiveError.message : 'Archive failed.'}`);
    }
  }
  return { archivedFiles, archivedBytes, skipped, maxAgeDays };
};

export const getArtworkArchiveStats = async () => {
  const client = getSupabaseAdminClient();
  const { data, error } = await client.from('hue_artwork_archive').select('file_size,archive_status,supabase_deleted_at,cleanup_eligible_at');
  if (error) throw new Error(error.message);
  const rows = data || [];
  const active = rows.filter((row) => !row.supabase_deleted_at);
  const eligible = active.filter((row) => row.archive_status === 'verified' && row.cleanup_eligible_at && new Date(row.cleanup_eligible_at).getTime() <= Date.now());
  return {
    trackedFiles: rows.length,
    activeOriginals: active.length,
    eligibleFiles: eligible.length,
    activeBytes: active.reduce((sum, row) => sum + Number(row.file_size || 0), 0),
    eligibleBytes: eligible.reduce((sum, row) => sum + Number(row.file_size || 0), 0),
    cleanedFiles: rows.length - active.length,
  };
};

const cleanupExpiredRestores = async () => {
  const client = getSupabaseAdminClient();
  const bucket = getStorageBucket();
  const { data } = await client.from('hue_artwork_archive')
    .select('id,restored_storage_path')
    .not('restored_storage_path', 'is', null)
    .lte('restore_expires_at', new Date().toISOString());
  for (const row of data || []) {
    if (row.restored_storage_path) await client.storage.from(bucket).remove([row.restored_storage_path]);
    await client.from('hue_artwork_archive').update({
      restored_storage_path: null,
      restored_at: null,
      restore_expires_at: null,
      archive_status: 'cleaned',
      updated_at: new Date().toISOString(),
    }).eq('id', row.id);
  }
};

export const cleanupVerifiedSupabaseArtwork = async (options: { emergency?: boolean; limit?: number } = {}) => {
  const client = getSupabaseAdminClient();
  const bucket = getStorageBucket();
  await cleanupExpiredRestores();
  let query = client.from('hue_artwork_archive').select('*')
    .eq('archive_status', 'verified')
    .is('supabase_deleted_at', null)
    .not('drive_file_id', 'is', null)
    .not('preview_storage_path', 'is', null)
    .limit(Math.min(Math.max(options.limit || 100, 1), 500));
  if (!options.emergency) query = query.lte('cleanup_eligible_at', new Date().toISOString());
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let cleanedFiles = 0;
  let reclaimedBytes = 0;
  const skipped: string[] = [];
  for (const raw of data || []) {
    const row = raw as ArtworkArchiveRecord;
    try {
      if (!row.drive_file_id || !row.preview_storage_path) throw new Error('Missing verified Drive file or preview.');
      const drive = await getDriveFileMetadata(row.drive_file_id);
      if (drive.trashed || !drive.id) throw new Error('Drive file is unavailable.');
      const driveSize = Number(drive.size || 0);
      if (driveSize && row.file_size && driveSize !== Number(row.file_size)) throw new Error('Drive file size no longer matches.');
      const { error: previewError } = await client.storage.from(bucket).download(row.preview_storage_path);
      if (previewError) throw new Error(`Archive preview is unavailable: ${previewError.message}`);
      const { error: removeError } = await client.storage.from(bucket).remove([row.storage_path]);
      if (removeError) throw removeError;
      const deletedAt = new Date().toISOString();
      await client.from('hue_artwork_archive').update({
        archive_status: 'cleaned',
        drive_verified_at: deletedAt,
        supabase_deleted_at: deletedAt,
        error: null,
        updated_at: deletedAt,
      }).eq('id', row.id);
      cleanedFiles += 1;
      reclaimedBytes += Number(row.file_size || 0);
    } catch (cleanupError) {
      const message = cleanupError instanceof Error ? cleanupError.message : 'Cleanup failed.';
      skipped.push(`${row.original_name || row.storage_path}: ${message}`);
      await client.from('hue_artwork_archive').update({ error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq('id', row.id);
    }
  }
  return { cleanedFiles, reclaimedBytes, skipped };
};

export const listArchivedArtworkForUser = async (identity: { userId: string; email?: string | null }) => {
  const client = getSupabaseAdminClient();
  const normalizedEmail = identity.email?.trim().toLowerCase() || null;
  const queries = [
    client.from('hue_artwork_archive').select('*').eq('owner_user_id', identity.userId),
    client.from('hue_artwork_archive').select('*').like('storage_path', `customers/%/${identity.userId}/%`),
  ];
  if (normalizedEmail) queries.push(client.from('hue_artwork_archive').select('*').ilike('owner_email', normalizedEmail));
  const results = await Promise.all(queries);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);

  const rows = new Map<string, ArtworkArchiveRecord>();
  for (const result of results) {
    for (const raw of result.data || []) {
      const row = raw as ArtworkArchiveRecord;
      const belongsToCustomerLibrary = new RegExp(`^customers/[^/]+/${identity.userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`, 'i').test(row.storage_path);
      const ownedByUser = row.owner_user_id === identity.userId;
      const customerEmailFallback = Boolean(
        normalizedEmail
        && row.owner_email?.trim().toLowerCase() === normalizedEmail
        && row.storage_path.toLowerCase().startsWith('customers/'),
      );
      if (!row.preview_storage_path || !row.drive_file_id) continue;
      if (!ownedByUser && !belongsToCustomerLibrary && !customerEmailFallback) continue;
      if (!['original', 'library'].includes(row.kind || '') && !belongsToCustomerLibrary) continue;
      rows.set(row.storage_path, row);
      if (belongsToCustomerLibrary && (row.owner_user_id !== identity.userId || row.kind === 'final')) {
        await client.from('hue_artwork_archive').update({
          owner_user_id: identity.userId,
          owner_email: normalizedEmail || row.owner_email || null,
          kind: row.kind === 'final' ? 'library' : row.kind,
          updated_at: new Date().toISOString(),
        }).eq('id', row.id);
      }
    }
  }
  const data = [...rows.values()].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  return Promise.all(data.map(async (row) => {
    return { ...row, previewUrl: row.preview_storage_path ? await getStorageSignedUrl(row.preview_storage_path, 3600) : null };
  }));
};

export const restoreArchivedArtworkForUser = async (archiveId: string, userId: string) => {
  const client = getSupabaseAdminClient();
  const bucket = getStorageBucket();
  const { data, error } = await client.from('hue_artwork_archive').select('*').eq('id', archiveId).eq('owner_user_id', userId).single();
  if (error || !data) throw new Error('Archived artwork was not found.');
  const row = data as ArtworkArchiveRecord;
  if (!row.drive_file_id) throw new Error('This archived file does not have a verified Drive original.');
  const downloaded = await downloadDriveFile(row.drive_file_id);
  const restoredPath = `restored/${userId}/${row.id}/${safeSegment(row.original_name || 'artwork-file')}`;
  const { error: uploadError } = await client.storage.from(bucket).upload(restoredPath, Buffer.from(downloaded.bytes), {
    contentType: row.mime_type || downloaded.mimeType,
    upsert: true,
  });
  if (uploadError) throw new Error(uploadError.message);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DAY_MS);
  await client.from('hue_artwork_archive').update({
    restored_storage_path: restoredPath,
    restored_at: now.toISOString(),
    restore_expires_at: expiresAt.toISOString(),
    last_used_at: now.toISOString(),
    archive_status: 'restored',
    updated_at: now.toISOString(),
  }).eq('id', row.id);
  return {
    archiveId: row.id,
    originalName: row.original_name || 'artwork-file',
    mimeType: row.mime_type || downloaded.mimeType,
    storagePath: restoredPath,
    storageUrl: await getStorageSignedUrl(restoredPath, 3600),
    expiresAt: expiresAt.toISOString(),
  };
};
