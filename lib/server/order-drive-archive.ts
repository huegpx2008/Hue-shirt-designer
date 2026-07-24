import 'server-only';

import { recordVerifiedDriveArchive } from '@/lib/server/artwork-archive';
import { getArtworkAssetByPreviewPath, updateArtworkAsset } from '@/lib/server/artwork-assets';
import { createBackblazeDownloadUrl, readBackblazeObjectRange } from '@/lib/server/backblaze-b2';
import { B2_ORDER_SAFETY_RETENTION_DAYS } from '@/lib/server/artwork-retention';
import { copyDriveFileIfMissing, driveFolderUrl, ensureDriveFolder, getDriveFileMetadata, getGoogleDriveRootFolderId, isGoogleDriveArchiveConfigured, openDriveFileStream, readDriveFileRange, sanitizeDriveName, uploadDriveFileFromStreamIfMissing, uploadDriveFileFromUrlIfMissing, uploadDriveFileIfMissing } from '@/lib/server/google-drive';
import { getStorageSignedUrl, supabaseAdminFetch } from '@/lib/server/supabase-admin';
import { isProductionArtworkRecipe, type ProductionArtworkRecipe } from '@/lib/production-artwork';
import { createJpegPlacementPdfStream, readJpegInfo } from '@/lib/server/jpeg-placement-pdf';

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

type ArchiveFile = { path: string; name: string; kind: 'original' | 'proof' };

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
      const artifactKind = String(file.artifactKind || '').toLowerCase();
      add(file.storagePath, file.name, artifactKind === 'approved-proof' || role.includes('approved proof') || role.includes('final') || role.includes('production') ? 'proof' : 'original');
    }
    const breakdown = Array.isArray(item.productionBreakdown) ? item.productionBreakdown as Record<string, unknown>[] : [];
    for (const art of breakdown) {
      add(art.frontStoragePath, art.frontName, 'proof');
      add(art.backStoragePath, art.backName, 'proof');
    }
  }
  return [...new Map(files.map((file) => [`${file.kind}:${file.path}`, file])).values()];
};

type DownloadedStorageFile =
  | { kind: 'b2'; asset: NonNullable<Awaited<ReturnType<typeof getArtworkAssetByPreviewPath>>>; sourceUrl: string; size: number; mimeType: string }
  | { kind: 'drive'; asset: NonNullable<Awaited<ReturnType<typeof getArtworkAssetByPreviewPath>>>; driveFileId: string; size: number; mimeType: string }
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
  if (asset?.original_provider === 'drive' && asset.drive_file_id) {
    return {
      kind: 'drive',
      asset,
      driveFileId: asset.drive_file_id,
      size: Number(asset.file_size),
      mimeType: asset.mime_type || 'application/octet-stream',
    };
  }
  const url = await getStorageSignedUrl(path, 900);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not download ${basename(path)} from order storage (${response.status}).`);
  return { kind: 'supabase', asset: null, bytes: await response.arrayBuffer(), mimeType: response.headers.get('content-type') || 'application/octet-stream' };
};

const collectProductionRecipes = (order: DriveArchiveOrder) => {
  const data = order.order_data && typeof order.order_data === 'object' ? order.order_data as Record<string, unknown> : {};
  const items = Array.isArray(data.items) ? data.items as Record<string, unknown>[] : [];
  return items.flatMap((item) => Array.isArray(item.productionRecipes) ? item.productionRecipes : []).filter(isProductionArtworkRecipe);
};

const safeToken = (value: string, fallback: string) => value
  .replace(/\.[^.]+$/, '')
  .replace(/[^a-z0-9._-]+/gi, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 80) || fallback;

const createProductionPdf = async (recipe: ProductionArtworkRecipe, parentId: string) => {
  const asset = await getArtworkAssetByPreviewPath(recipe.sourceStoragePath);
  if (!asset) throw new Error(`${recipe.customerFileName}: the original asset registry entry was not found.`);
  if (asset.mime_type !== 'image/jpeg') {
    throw new Error(`${recipe.customerFileName}: ${asset.mime_type || 'this file type'} requires manual production from the original; no preview-based final was created.`);
  }
  const headerEnd = Math.min(Math.max(0, Number(asset.file_size) - 1), 1024 * 1024 - 1);
  let header: Uint8Array;
  let sourceStream: ReadableStream<Uint8Array>;
  if (asset.original_provider === 'b2' && asset.original_object_key && !asset.source_deleted_at) {
    header = await readBackblazeObjectRange(asset.original_object_key, `bytes=0-${headerEnd}`);
    const sourceUrl = await createBackblazeDownloadUrl(asset.original_object_key, 30 * 60);
    const source = await fetch(sourceUrl, { cache: 'no-store' });
    if (!source.ok || !source.body) throw new Error(`${recipe.customerFileName}: the B2 production original could not be opened (${source.status}).`);
    sourceStream = source.body;
  } else if (asset.original_provider === 'drive' && asset.drive_file_id) {
    header = await readDriveFileRange(asset.drive_file_id, 0, headerEnd);
    sourceStream = await openDriveFileStream(asset.drive_file_id);
  } else {
    throw new Error(`${recipe.customerFileName}: the archived production original is not available.`);
  }
  const jpegInfo = readJpegInfo(header);
  const pdf = createJpegPlacementPdfStream({
    jpegStream: sourceStream,
    jpegSize: Number(asset.file_size),
    jpeg: jpegInfo,
    recipe,
  });
  const role = safeToken(recipe.role, 'ARTWORK');
  const sourceName = safeToken(recipe.customerFileName, 'artwork');
  const size = `${recipe.artboardWidthInches}x${recipe.artboardHeightInches}`;
  const name = `${asset.production_reference}__FINAL-PRODUCTION__${role}__${sourceName}__${size}__${recipe.fitMode}.pdf`;
  const driveFile = await uploadDriveFileFromStreamIfMissing({
    parentId,
    name,
    mimeType: 'application/pdf',
    body: pdf.stream,
    size: pdf.size,
  });
  const verified = await getDriveFileMetadata(driveFile.id);
  const verifiedSize = Number(verified.size || 0);
  if (verified.trashed || (verifiedSize && verifiedSize !== pdf.size)) throw new Error(`${recipe.customerFileName}: generated production PDF failed Drive verification.`);
  const placedWidthInches = recipe.placement.width * recipe.artboardWidthInches;
  const placedHeightInches = recipe.placement.height * recipe.artboardHeightInches;
  return {
    recipeId: recipe.id,
    role: recipe.role,
    customerFileName: recipe.customerFileName,
    productionReference: asset.production_reference,
    finalFileName: name,
    driveFileId: driveFile.id,
    artboardWidthInches: recipe.artboardWidthInches,
    artboardHeightInches: recipe.artboardHeightInches,
    fitMode: recipe.fitMode,
    placement: recipe.placement,
    sourcePixels: { width: jpegInfo.width, height: jpegInfo.height },
    effectiveDpi: {
      x: placedWidthInches > 0 ? Number((jpegInfo.width / placedWidthInches).toFixed(2)) : null,
      y: placedHeightInches > 0 ? Number((jpegInfo.height / placedHeightInches).toFixed(2)) : null,
    },
  };
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
    const proofsFolder = await ensureDriveFolder(orderFolder.id, 'APPROVED-PROOFS');
    const productionFolder = await ensureDriveFolder(orderFolder.id, 'FINAL-PRODUCTION');
    const archiveFiles = collectArchiveFiles(order);
    const productionRecipes = collectProductionRecipes(order);

    const registryWarnings: string[] = [];
    for (const file of archiveFiles) {
      const downloaded = await downloadStorageFile(file.path);
      const parentId = file.kind === 'proof' ? proofsFolder.id : originalsFolder.id;
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
        : downloaded.kind === 'drive'
          ? await copyDriveFileIfMissing({
            sourceFileId: downloaded.driveFileId,
            parentId,
            name: driveName,
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
          const existingArchiveIsVerified = Boolean(downloaded.asset.drive_file_id && downloaded.asset.drive_verified_at);
          await updateArtworkAsset(downloaded.asset.id, {
            archive_status: 'archived',
            drive_file_id: existingArchiveIsVerified ? downloaded.asset.drive_file_id : verifiedDriveFile.id,
            drive_folder_id: existingArchiveIsVerified ? downloaded.asset.drive_folder_id : parentId,
            drive_web_view_link: existingArchiveIsVerified ? downloaded.asset.drive_web_view_link : verifiedDriveFile.webViewLink || driveFile.webViewLink || null,
            drive_verified_at: existingArchiveIsVerified ? downloaded.asset.drive_verified_at : verifiedAt.toISOString(),
            cleanup_eligible_at: existingArchiveIsVerified && downloaded.asset.cleanup_eligible_at
              ? downloaded.asset.cleanup_eligible_at
              : new Date(verifiedAt.getTime() + B2_ORDER_SAFETY_RETENTION_DAYS * DAY_MS).toISOString(),
            last_used_at: verifiedAt.toISOString(),
            error: null,
          });
        } else if (downloaded.kind === 'drive') {
          const verifiedDriveFile = await getDriveFileMetadata(driveFile.id);
          const driveSize = Number(verifiedDriveFile.size || 0);
          if (verifiedDriveFile.trashed || (driveSize && driveSize !== Number(downloaded.asset.file_size))) {
            throw new Error(`Drive order copy verification failed for ${downloaded.asset.original_name}.`);
          }
          await updateArtworkAsset(downloaded.asset.id, {
            archive_status: 'archived',
            last_used_at: new Date().toISOString(),
            error: null,
          });
        } else {
          await recordVerifiedDriveArchive({
            storagePath: file.path,
            originalName: file.name,
            kind: file.kind === 'proof' ? 'final' : 'original',
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

    const productionFiles: Awaited<ReturnType<typeof createProductionPdf>>[] = [];
    const productionWarnings: string[] = [];
    for (const recipe of productionRecipes) {
      try {
        productionFiles.push(await createProductionPdf(recipe, productionFolder.id));
      } catch (productionError) {
        productionWarnings.push(productionError instanceof Error ? productionError.message : `${recipe.customerFileName}: automatic production failed.`);
      }
    }

    const productionManifest = {
      version: 1,
      orderNumber: order.order_number,
      generatedAt: new Date().toISOString(),
      warning: 'APPROVED-PROOFS are visual references only. Print from FINAL-PRODUCTION PDFs or prepare manually from ORIGINALS using the recorded recipe.',
      recipes: productionRecipes,
      generatedProductionFiles: productionFiles,
      productionWarnings,
    };
    const productionManifestBytes = new TextEncoder().encode(JSON.stringify(productionManifest, null, 2));
    await uploadDriveFileIfMissing({ parentId: orderFolder.id, name: 'production-manifest.json', mimeType: 'application/json', bytes: productionManifestBytes });

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
      productionFiles,
      productionWarnings,
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
      drive_archive_error: productionWarnings.length ? `Production review required: ${productionWarnings.join(' ').slice(0, 900)}` : null,
    });
    return { ok: true, folderUrl, registryWarnings, productionWarnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Google Drive archive error.';
    await patchOrder(order.id, { drive_archive_status: 'failed', drive_archive_error: message.slice(0, 1000) }).catch(() => undefined);
    return { ok: false, error: message };
  }
};
