import 'server-only';

import { recordVerifiedDriveArchive } from '@/lib/server/artwork-archive';
import { getArtworkAssetByPreviewPath, updateArtworkAsset } from '@/lib/server/artwork-assets';
import { createBackblazeDownloadUrl } from '@/lib/server/backblaze-b2';
import { B2_ORDER_SAFETY_RETENTION_DAYS } from '@/lib/server/artwork-retention';
import { driveFolderUrl, ensureDriveFolder, getDriveFileMetadata, getGoogleDriveRootFolderId, isGoogleDriveArchiveConfigured, sanitizeDriveName, uploadDriveFileFromUrlIfMissing, uploadDriveFileIfMissing } from '@/lib/server/google-drive';
import { getStorageSignedUrl, supabaseAdminFetch } from '@/lib/server/supabase-admin';

const DAY_MS = 24 * 60 * 60 * 1000;

export type DriveArchiveOrder = {
  id: string;
  order_number: string;
  customer_email?: string | null;
  customer_user_id?: string | null;
  customer_name?: string | null;
  created_at?: string | null;
  total?: number | null;
  currency?: string | null;
  order_data?: unknown;
  drive_archive_status?: string | null;
  drive_archive_attempts?: number | null;
};

type ArchiveFile = { path: string; name: string; kind: 'original' | 'final' };

const patchOrder = async (id: string, fields: Record<string, unknown>) => {
  await supabaseAdminFetch(`/rest/v1/hue_orders?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
};

const basename = (path: string) => path.split('/').filter(Boolean).pop() || 'artwork-file';

const collectArchiveFiles = (order: DriveArchiveOrder): ArchiveFile[] => {
  const data = order.order_data && typeof order.order_data === 'object'
    ? order.order_data as Record<string, unknown>
    : {};
  const items = Array.isArray(data.items) ? data.items as Record<string, unknown>[] : [];
  const files: ArchiveFile[] = [];
  const add = (path: unknown, name: unknown, kind: ArchiveFile['kind']) => {
    const normalizedPath = typeof path === 'string' ? path.trim() : '';
    if (!normalizedPath) return;
    files.push({ path: normalizedPath, name: typeof name === 'string' && name.trim() ? name.trim() : basename(normalizedPath), kind });
  };
  for (const item of items) {
    const artworkFiles = Array.isArray(item.artworkFiles) ? item.artworkFiles as Record<string, unknown>[] : [];
    for (const file of artworkFiles) {
      const role = String(file.role || file.source || '').toLowerCase();
      add(file.storagePath, file.name, role.includes('final') || role.includes('production') ? 'final' : 'original');
    }
    const breakdown = Array.isArray(item.productionBreakdown) ? item.productionBreakdown as Record<string, unknown>[] : [];
    for (const art of breakdown) {
      add(art.frontStoragePath, art.frontName, 'final');
      add(art.backStoragePath, art.backName, 'final');
    }
  }
  return [...new Map(files.map((file) => [`${file.kind}:${file.path}`, file])).values()];
};

type DownloadedStorageFile =
  | { kind: 'b2'; asset: NonNullable<Awaited<ReturnType<typeof getArtworkAssetByPreviewPath>>>; sourceUrl: string; size: number; mimeType: string }
  | { kind: 'supabase'; asset: null; bytes: ArrayBuffer; mimeType: string };

const downloadStorageFile = async (path: string): Promise<DownloadedStorageFile> => {
  const asset = await getArtworkAssetByPreviewPath(path);
  if (asset?.original_provider === 'b2' && asset.original_object_key && !asset.source_deleted_at) {
    return {
      kind: 'b2',
      asset,
      sourceUrl: await createBackblazeDownloadUrl(asset.original_object_key, 30 * 60),
      size: Number(asset.file_size),
      mimeType: asset.mime_type || 'application/octet-stream',
    };
  }
  const url = await getStorageSignedUrl(path, 900);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not download ${basename(path)} from order storage (${response.status}).`);
  return { kind: 'supabase', asset: null, bytes: await response.arrayBuffer(), mimeType: response.headers.get('content-type') || 'application/octet-stream' };
};

export const archiveOrderToDriveBestEffort = async (order: DriveArchiveOrder, options: { force?: boolean } = {}) => {
  if (!order?.id || !order.order_number) return { ok: false, error: 'Order record is incomplete.' };
  if (!options.force && order.drive_archive_status === 'archived') return { ok: true, skipped: true };
  if (!isGoogleDriveArchiveConfigured()) {
    await patchOrder(order.id, { drive_archive_status: 'not_configured', drive_archive_error: 'Google Drive archive is not configured.' }).catch(() => undefined);
    return { ok: false, error: 'Google Drive archive is not configured.' };
  }

  try {
    const attempts = Number(order.drive_archive_attempts || 0) + 1;
    await patchOrder(order.id, { drive_archive_status: 'processing', drive_archive_attempts: attempts, drive_archive_error: null });
    const rootId = getGoogleDriveRootFolderId();
    const customer = sanitizeDriveName(order.customer_email || order.customer_name || 'GUEST', 'GUEST');
    const customerFolder = await ensureDriveFolder(rootId, customer.toLowerCase());
    const orderFolder = await ensureDriveFolder(customerFolder.id, `ORDER__${order.order_number}`);
    const originalsFolder = await ensureDriveFolder(orderFolder.id, 'ORIGINALS');
    const productionFolder = await ensureDriveFolder(orderFolder.id, 'FINAL-PRODUCTION');
    const archiveFiles = collectArchiveFiles(order);

    const registryWarnings: string[] = [];
    for (const file of archiveFiles) {
      const downloaded = await downloadStorageFile(file.path);
      const parentId = file.kind === 'final' ? productionFolder.id : originalsFolder.id;
      const driveName = downloaded.asset
        ? `${downloaded.asset.production_reference}__${downloaded.asset.original_name}`
        : file.name;
      const driveFile = downloaded.kind === 'b2'
        ? await uploadDriveFileFromUrlIfMissing({
          parentId,
          name: driveName,
          mimeType: downloaded.mimeType,
          sourceUrl: downloaded.sourceUrl,
          size: downloaded.size,
        })
        : await uploadDriveFileIfMissing({
          parentId,
          name: driveName,
          mimeType: downloaded.mimeType,
          bytes: downloaded.bytes,
        });
      try {
        if (downloaded.kind === 'b2') {
          const verifiedDriveFile = await getDriveFileMetadata(driveFile.id);
          const driveSize = Number(verifiedDriveFile.size || 0);
          if (verifiedDriveFile.trashed || (driveSize && driveSize !== Number(downloaded.asset.file_size))) {
            throw new Error(`Drive verification failed for ${downloaded.asset.original_name}.`);
          }
          const verifiedAt = new Date();
          await updateArtworkAsset(downloaded.asset.id, {
            archive_status: 'archived',
            drive_file_id: verifiedDriveFile.id,
            drive_folder_id: parentId,
            drive_web_view_link: verifiedDriveFile.webViewLink || driveFile.webViewLink || null,
            drive_verified_at: verifiedAt.toISOString(),
            cleanup_eligible_at: new Date(verifiedAt.getTime() + B2_ORDER_SAFETY_RETENTION_DAYS * DAY_MS).toISOString(),
            error: null,
          });
        } else {
          await recordVerifiedDriveArchive({
            storagePath: file.path,
            originalName: file.name,
            kind: file.kind,
            bytes: downloaded.bytes,
            mimeType: downloaded.mimeType,
            driveFileId: driveFile.id,
            driveFolderId: parentId,
            driveWebViewLink: driveFile.webViewLink,
            orderId: order.id,
            orderNumber: order.order_number,
            customerId: order.customer_user_id,
            customerEmail: order.customer_email,
          });
        }
      } catch (registryError) {
        const message = registryError instanceof Error ? registryError.message : 'Archive registry update failed.';
        registryWarnings.push(`${file.name}: ${message}`);
      }
    }

    const manifest = {
      orderNumber: order.order_number,
      customerEmail: order.customer_email || null,
      customerName: order.customer_name || null,
      total: order.total || null,
      currency: order.currency || 'USD',
      archivedAt: new Date().toISOString(),
      source: 'Hue Studio secure storage',
      files: archiveFiles.map(({ path, name, kind }) => ({ previewStoragePath: path, customerFileName: name, kind })),
      registryWarnings,
      order: order.order_data || {},
    };
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    await uploadDriveFileIfMissing({ parentId: orderFolder.id, name: 'order-manifest.json', mimeType: 'application/json', bytes: manifestBytes });

    const folderUrl = orderFolder.webViewLink || driveFolderUrl(orderFolder.id);
    await patchOrder(order.id, {
      drive_archive_status: 'archived',
      drive_folder_id: orderFolder.id,
      drive_folder_url: folderUrl,
      drive_archived_at: new Date().toISOString(),
      drive_archive_error: null,
    });
    return { ok: true, folderUrl, registryWarnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Google Drive archive error.';
    await patchOrder(order.id, { drive_archive_status: 'failed', drive_archive_error: message.slice(0, 1000) }).catch(() => undefined);
    return { ok: false, error: message };
  }
};
