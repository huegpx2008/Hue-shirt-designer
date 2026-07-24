import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

import {
  getStorageBucket,
  getStorageSignedUrl,
  getSupabaseAdminClient,
  hasSupabaseAdminConfig,
  verifySupabaseAccessToken,
} from '@/lib/server/supabase-admin';
import { getArtworkDisplayName } from '@/lib/server/artwork-storage-name';
import {
  deleteArtworkAssetRecord,
  getArtworkAssetForUser,
  listArtworkAssetsForUser,
} from '@/lib/server/artwork-assets';
import { deleteBackblazeObject } from '@/lib/server/backblaze-b2';

export const runtime = 'nodejs';
export const maxDuration = 60;

type StorageListEntry = {
  id?: string | null;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: ({ size?: number | string; mimetype?: string; mimeType?: string } & Record<string, unknown>) | null;
};

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get('authorization') || '';
  return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
};

const safeFolder = (value: string, fallback: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || fallback;
const isLikelyArtworkPath = (value: string) => /\.(png|jpe?g|webp|gif|bmp|svg|pdf|json)(\?.*)?$/i.test(value);
const mimeTypeFromName = (name: string) => {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'json') return 'application/json';
  return undefined;
};

const getPreviewPath = (storagePath: string) => {
  const slashIndex = storagePath.lastIndexOf('/');
  const folder = slashIndex >= 0 ? storagePath.slice(0, slashIndex) : '';
  const fileName = slashIndex >= 0 ? storagePath.slice(slashIndex + 1) : storagePath;
  const previewName = fileName.replace(/\.[^.]+$/, '');
  return `${folder ? `${folder}/` : ''}previews/${previewName}-preview.webp`;
};

const getMetadataPath = (storagePath: string) => getPreviewPath(storagePath).replace(/-preview\.webp$/i, '-metadata.json');

const getCustomerLibraryPrefixes = (userId: string, email?: string) => {
  const customerLabel = safeFolder(email || 'customer', 'customer');
  return Array.from(new Set([
    `customers/${customerLabel}/${userId}`,
    `customers/${userId}/${customerLabel}`,
    `customers/${userId}`,
  ]));
};

const INLINE_PREVIEW_LIMIT = 40;
const INLINE_PREVIEW_CONCURRENCY = 3;
const INLINE_PREVIEW_MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const isRasterImage = (name: string, mimeType?: string) => Boolean(
  /^(image\/(png|jpeg|webp|gif))$/i.test(mimeType || '')
  || /\.(png|jpe?g|webp|gif)$/i.test(name)
);

type ArtworkImageMetadata = { width: number; height: number; dpiX?: number; dpiY?: number };
type InlinePreview = { dataUrl: string; width: number; height: number; sourcePath: string; sourceMetadata?: ArtworkImageMetadata };

const parseArtworkImageMetadata = (value: unknown): ArtworkImageMetadata | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const width = Number(record.width || 0);
  const height = Number(record.height || 0);
  const dpiX = Number(record.dpiX || 0);
  const dpiY = Number(record.dpiY || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  return {
    width,
    height,
    ...(Number.isFinite(dpiX) && dpiX > 0 ? { dpiX } : {}),
    ...(Number.isFinite(dpiY) && dpiY > 0 ? { dpiY } : {}),
  };
};

const loadArtworkImageMetadata = async (storagePath: string) => {
  const storage = getSupabaseAdminClient().storage.from(getStorageBucket());
  const { data, error } = await storage.download(storagePath);
  if (error || !data) return null;
  try {
    return parseArtworkImageMetadata(JSON.parse(await data.text()));
  } catch {
    return null;
  }
};

const createInlinePreview = async (storagePath: string) => {
  const storage = getSupabaseAdminClient().storage.from(getStorageBucket());
  const { data, error } = await storage.download(storagePath);
  if (error || !data) throw new Error(error?.message || 'The artwork preview could not be downloaded.');
  if (data.size > INLINE_PREVIEW_MAX_SOURCE_BYTES) throw new Error('The artwork preview source is too large.');
  const source = sharp(Buffer.from(await data.arrayBuffer()), { failOn: 'none' });
  const metadata = await source.metadata();
  const preview = await source
    .clone()
    .rotate()
    .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72, effort: 3 })
    .toBuffer({ resolveWithObject: true });
  return {
    dataUrl: `data:image/webp;base64,${preview.data.toString('base64')}`,
    width: preview.info.width,
    height: preview.info.height,
    sourcePath: storagePath,
    sourceMetadata: metadata.width && metadata.height ? {
      width: metadata.width,
      height: metadata.height,
      ...(metadata.density ? { dpiX: metadata.density, dpiY: metadata.density } : {}),
    } : undefined,
  } satisfies InlinePreview;
};

const createInlinePreviews = async (
  files: Array<{ path: string; metadataPath: string; sourcePaths: string[] }>,
) => {
  const previews = new Map<string, InlinePreview>();
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < files.length) {
      const file = files[nextIndex];
      nextIndex += 1;
      for (const sourcePath of file.sourcePaths) {
        try {
          const preview = await createInlinePreview(sourcePath);
          previews.set(file.path, preview);
          if (sourcePath === file.path && preview.sourceMetadata) {
            await getSupabaseAdminClient().storage.from(getStorageBucket()).upload(
              file.metadataPath,
              JSON.stringify({ version: 1, ...preview.sourceMetadata }),
              { contentType: 'application/json', cacheControl: '604800', upsert: true },
            ).catch(() => null);
          }
          break;
        } catch {
          // Try the original when a derived preview is missing. The client can
          // still use the authenticated file endpoint if neither source works.
        }
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(INLINE_PREVIEW_CONCURRENCY, files.length) },
    () => worker(),
  ));
  return previews;
};

const listStorageFilesRecursively = async (prefix: string, maxFiles = 1000) => {
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
        sortBy: { column: 'created_at', order: 'desc' },
      });
      if (error) throw new Error(error.message);

      for (const raw of data || []) {
        const entry = raw as StorageListEntry;
        if (!entry.name || entry.name === '.emptyFolderPlaceholder') continue;
        const path = `${folder}/${entry.name}`;
        if (entry.id || entry.metadata) files.push({ ...entry, path });
        else folders.push(path);
      }

      if ((data || []).length < 100 || files.length >= maxFiles) break;
    }
  }

  return files;
};

export async function GET(request: NextRequest) {
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Artwork storage is temporarily unavailable.' }, { status: 503 });

  const token = getBearerToken(request);
  const user = token ? await verifySupabaseAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'Sign in to view your Image Zone library.' }, { status: 401 });

  try {
    const registeredAssets = await listArtworkAssetsForUser(user.id);
    const filesByPath = new Map<string, StorageListEntry & { path: string }>();
    for (const prefix of getCustomerLibraryPrefixes(user.id, user.email)) {
      const files = await listStorageFilesRecursively(prefix);
      for (const file of files) {
        if (!isLikelyArtworkPath(file.name)) continue;
        filesByPath.set(file.path, file);
      }
    }

    const allFiles = [...filesByPath.values()];
    const previewPaths = new Set(allFiles.filter((file) => /\/previews\/[^/]+-preview\.webp$/i.test(file.path)).map((file) => file.path));
    const registeredPreviewPaths = new Set(registeredAssets.map((asset) => asset.preview_storage_path));
    const originalFiles = allFiles.filter((file) => !/\/previews\//i.test(file.path) && !registeredPreviewPaths.has(file.path));
    originalFiles.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
    const metadataPaths = new Set(allFiles.filter((file) => /\/previews\/[^/]+-metadata\.json$/i.test(file.path)).map((file) => file.path));
    const storedMetadataEntries = await Promise.all(originalFiles.map(async (file) => {
      const metadataPath = getMetadataPath(file.path);
      return [file.path, metadataPaths.has(metadataPath) ? await loadArtworkImageMetadata(metadataPath) : null] as const;
    }));
    const storedMetadata = new Map(storedMetadataEntries);
    const inlinePreviewCandidates = originalFiles
      .filter((file) => isRasterImage(file.name, mimeTypeFromName(file.name) || file.metadata?.mimetype || file.metadata?.mimeType))
      .slice(0, INLINE_PREVIEW_LIMIT)
      .map((file) => {
        const previewPath = getPreviewPath(file.path);
        const metadataPath = getMetadataPath(file.path);
        const sourceSize = Number(file.metadata?.size || 0);
        const needsOriginalMetadata = !storedMetadata.get(file.path);
        return {
          path: file.path,
          metadataPath,
          // Try the deterministic preview path even when Supabase did not expose
          // its folder in the recursive list. This repairs older/missed listings.
          sourcePaths: Array.from(new Set([
            ...(needsOriginalMetadata && (!sourceSize || sourceSize <= INLINE_PREVIEW_MAX_SOURCE_BYTES) ? [file.path] : []),
            previewPath,
            ...(!sourceSize || sourceSize <= INLINE_PREVIEW_MAX_SOURCE_BYTES ? [file.path] : []),
          ])),
        };
      });
    const inlinePreviews = await createInlinePreviews(inlinePreviewCandidates);
    const legacyItems = await Promise.all(originalFiles.map(async (file) => {
      // The validated filename extension is authoritative. Some older signed
      // uploads were saved with stale storage metadata (for example PDF), which
      // made browsers reject an otherwise valid JPG thumbnail.
      const mimeType = mimeTypeFromName(file.name) || file.metadata?.mimetype || file.metadata?.mimeType || undefined;
      const previewPath = getPreviewPath(file.path);
      const inlinePreview = inlinePreviews.get(file.path);
      const hasStoredPreview = previewPaths.has(previewPath) || inlinePreview?.sourcePath === previewPath;
      const originalMetadata = storedMetadata.get(file.path)
        || (inlinePreview?.sourcePath === file.path ? inlinePreview.sourceMetadata : undefined);
      return {
        id: file.id || file.path,
        name: getArtworkDisplayName(file.name, file.metadata),
        storagePath: file.path,
        storageUrl: await getStorageSignedUrl(file.path, 3600).catch(() => null),
        previewStoragePath: hasStoredPreview ? previewPath : null,
        previewUrl: hasStoredPreview ? await getStorageSignedUrl(previewPath, 3600).catch(() => null) : null,
        previewDataUrl: inlinePreview?.dataUrl || null,
        previewWidth: inlinePreview?.width,
        previewHeight: inlinePreview?.height,
        width: originalMetadata?.width,
        height: originalMetadata?.height,
        dpiX: originalMetadata?.dpiX,
        dpiY: originalMetadata?.dpiY,
        mimeType,
        createdAt: file.created_at,
        updatedAt: file.updated_at,
        size: Number(file.metadata?.size || 0) || undefined,
      };
    }));

    const assetItems = await Promise.all(registeredAssets.map(async (asset) => {
      const signedPreviewUrl = await getStorageSignedUrl(asset.preview_storage_path, 3600).catch(() => null);
      const signedThumbnailUrl = await getStorageSignedUrl(asset.thumbnail_storage_path, 3600).catch(() => null);
      return {
        id: asset.id,
        assetId: asset.id,
        name: asset.original_name,
        storagePath: asset.preview_storage_path,
        storageUrl: signedPreviewUrl,
        previewStoragePath: asset.preview_storage_path,
        previewUrl: signedPreviewUrl,
        thumbnailStoragePath: asset.thumbnail_storage_path,
        thumbnailUrl: signedThumbnailUrl,
        width: Number(asset.width || 0) || undefined,
        height: Number(asset.height || 0) || undefined,
        dpiX: Number(asset.dpi_x || 0) || undefined,
        dpiY: Number(asset.dpi_y || 0) || undefined,
        mimeType: asset.mime_type,
        createdAt: asset.created_at,
        updatedAt: asset.updated_at,
        size: Number(asset.file_size || 0) || undefined,
        originalProvider: asset.original_provider,
        productionReference: asset.production_reference,
        archiveStatus: asset.archive_status,
      };
    }));

    return NextResponse.json({ items: [...assetItems, ...legacyItems] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load your Image Zone library.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Artwork storage is temporarily unavailable.' }, { status: 503 });

  const token = getBearerToken(request);
  const user = token ? await verifySupabaseAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'Sign in to delete artwork.' }, { status: 401 });

  try {
    const body = await request.json() as { assetId?: string };
    const assetId = String(body.assetId || '').trim();
    if (!assetId) return NextResponse.json({ error: 'Artwork asset ID is required.' }, { status: 400 });
    const asset = await getArtworkAssetForUser(assetId, user.id);
    if (!asset) return NextResponse.json({ error: 'Artwork was not found.' }, { status: 404 });
    if (asset.archive_status === 'archived' || asset.drive_verified_at) {
      return NextResponse.json({ error: 'This production file is already preserved with an order and cannot be deleted from Image Zone.' }, { status: 409 });
    }

    if (asset.original_provider === 'b2' && asset.original_object_key && !asset.source_deleted_at) {
      await deleteBackblazeObject(asset.original_object_key);
    }
    const storage = getSupabaseAdminClient().storage.from(getStorageBucket());
    await storage.remove([asset.preview_storage_path, asset.thumbnail_storage_path]);
    await deleteArtworkAssetRecord(asset.id, user.id);
    return NextResponse.json({ deleted: true, assetId: asset.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not delete artwork.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
