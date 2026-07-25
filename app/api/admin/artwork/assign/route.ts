import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { verifyAdminRequest } from '@/lib/server/admin-auth';
import {
  createBackblazeUploadUrl,
  deleteBackblazeObject,
  downloadBackblazeObjectToFile,
  getBackblazeObjectMetadata,
  hasBackblazeB2Config,
  readBackblazeObjectRange,
} from '@/lib/server/backblaze-b2';
import {
  createArtworkAsset,
  deleteArtworkAssetRecord,
  getArtworkAssetById,
  updateArtworkAsset,
} from '@/lib/server/artwork-assets';
import {
  MAX_ARTWORK_BYTES,
  MAX_IMAGE_PIXELS,
  MAX_PRODUCTION_JPEG_PIXELS,
  safeArtworkBaseName,
  validateArtworkBuffer,
} from '@/lib/server/artwork-file-validation';
import { enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';
import { getStorageBucket, getStorageSignedUrl, getSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

type AssignRequest = {
  action?: 'ticket' | 'finalize' | 'abort';
  userId?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  assetId?: string;
};

const allowedTypes = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

const extensionTypes = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
]);

const safeFolder = (value: string, fallback: string) => value
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[^a-z0-9_-]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 80) || fallback;

const createPreviews = async (filePath: string) => {
  const metadata = await sharp(filePath, { limitInputPixels: false, sequentialRead: true, animated: false }).metadata();
  const preview = await sharp(filePath, { limitInputPixels: false, sequentialRead: true, animated: false })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 3 })
    .toBuffer({ resolveWithObject: true });
  const thumbnail = await sharp(filePath, { limitInputPixels: false, sequentialRead: true, animated: false })
    .rotate()
    .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72, effort: 1 })
    .toBuffer();
  return {
    preview: preview.data,
    thumbnail,
    width: metadata.autoOrient?.width || metadata.width,
    height: metadata.autoOrient?.height || metadata.height,
    dpiX: metadata.density,
    dpiY: metadata.density,
    previewWidth: preview.info.width,
    previewHeight: preview.info.height,
  };
};

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Cross-site admin changes are not allowed.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'admin-artwork-assign', 30, 10 * 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many artwork assignment requests. Wait a moment and try again.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (!hasBackblazeB2Config()) return NextResponse.json({ error: 'Backblaze B2 is not configured for production originals.' }, { status: 503 });

  try {
    const body = await request.json() as AssignRequest;
    const action = body.action;

    if (action === 'abort') {
      const asset = body.assetId ? await getArtworkAssetById(body.assetId) : null;
      if (!asset) return NextResponse.json({ aborted: true });
      await Promise.allSettled([
        asset.original_provider === 'b2' ? deleteBackblazeObject(asset.original_object_key) : Promise.resolve(),
        getSupabaseAdminClient().storage.from(getStorageBucket()).remove([asset.preview_storage_path, asset.thumbnail_storage_path]),
      ]);
      await deleteArtworkAssetRecord(asset.id, asset.owner_user_id);
      return NextResponse.json({ aborted: true });
    }

    if (action === 'ticket') {
      const userId = String(body.userId || '');
      const fileName = String(body.fileName || '').trim();
      const fileSize = Number(body.fileSize || 0);
      const claimedType = String(body.mimeType || '').toLowerCase();
      const extension = fileName.split('.').pop()?.toLowerCase() || '';
      const mimeType = allowedTypes.has(claimedType) ? claimedType : extensionTypes.get(extension) || '';
      const normalizedExtension = allowedTypes.get(mimeType);
      if (!userId || !fileName || !normalizedExtension) return NextResponse.json({ error: 'Choose a customer and a PNG, JPG, WebP, or GIF file.' }, { status: 400 });
      if (!Number.isFinite(fileSize) || fileSize < 1 || fileSize > MAX_ARTWORK_BYTES) return NextResponse.json({ error: 'The production file must be between 1 byte and 150 MB.' }, { status: 413 });

      const { data: customer, error: customerError } = await getSupabaseAdminClient().auth.admin.getUserById(userId);
      if (customerError || !customer.user) return NextResponse.json({ error: 'That customer account could not be found.' }, { status: 404 });

      const assetId = randomUUID();
      const generatedName = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeArtworkBaseName(fileName)}.${normalizedExtension}`;
      const customerPrefix = `customers/${safeFolder(customer.user.email || 'customer', 'customer')}/${customer.user.id}`;
      const objectKey = `customers/${customer.user.id}/artwork/${assetId}/${generatedName}`;
      const previewStoragePath = `${customerPrefix}/previews/${assetId}-preview.webp`;
      const thumbnailStoragePath = `${customerPrefix}/thumbnails/${assetId}-thumbnail.webp`;
      const productionReference = `HUE-ART-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${assetId.slice(0, 8).toUpperCase()}`;

      await createArtworkAsset({
        id: assetId,
        owner_user_id: customer.user.id,
        original_name: fileName.slice(0, 255),
        production_reference: productionReference,
        original_provider: 'b2',
        original_object_key: objectKey,
        preview_storage_path: previewStoragePath,
        thumbnail_storage_path: thumbnailStoragePath,
        mime_type: mimeType,
        file_size: fileSize,
        archive_status: 'uploading',
      });

      try {
        return NextResponse.json({
          assetId,
          productionReference,
          uploadUrl: await createBackblazeUploadUrl({ objectKey, contentType: mimeType }),
          mimeType,
        });
      } catch (error) {
        await deleteArtworkAssetRecord(assetId, customer.user.id).catch(() => undefined);
        throw error;
      }
    }

    if (action === 'finalize') {
      const asset = body.assetId ? await getArtworkAssetById(body.assetId) : null;
      if (!asset || asset.original_provider !== 'b2' || asset.archive_status !== 'uploading') return NextResponse.json({ error: 'That pending artwork assignment could not be found.' }, { status: 404 });
      const object = await getBackblazeObjectMetadata(asset.original_object_key);
      if (object.size !== Number(asset.file_size)) throw new Error('The uploaded production file size does not match the selected file.');
      const firstBytes = await readBackblazeObjectRange(asset.original_object_key, `bytes=0-${Math.min(object.size - 1, 1024 * 1024 - 1)}`);
      const validated = validateArtworkBuffer(firstBytes, {
        maxBytes: MAX_ARTWORK_BYTES,
        maxImagePixels: asset.mime_type === 'image/jpeg' ? MAX_PRODUCTION_JPEG_PIXELS : MAX_IMAGE_PIXELS,
      });
      if (validated.mimeType !== asset.mime_type) throw new Error('The production file contents do not match the selected file type.');

      const temporaryPath = join(tmpdir(), `hue-admin-assignment-${asset.id}.${validated.extension}`);
      try {
        await downloadBackblazeObjectToFile(asset.original_object_key, temporaryPath);
        const generated = await createPreviews(temporaryPath);
        const storage = getSupabaseAdminClient().storage.from(getStorageBucket());
        const [{ error: previewError }, { error: thumbnailError }] = await Promise.all([
          storage.upload(asset.preview_storage_path, new Blob([Uint8Array.from(generated.preview)], { type: 'image/webp' }), { contentType: 'image/webp', cacheControl: '604800', upsert: true }),
          storage.upload(asset.thumbnail_storage_path, new Blob([Uint8Array.from(generated.thumbnail)], { type: 'image/webp' }), { contentType: 'image/webp', cacheControl: '604800', upsert: true }),
        ]);
        if (previewError) throw new Error(previewError.message || 'The designer preview could not be saved.');
        if (thumbnailError) throw new Error(thumbnailError.message || 'The Image Zone thumbnail could not be saved.');
        await updateArtworkAsset(asset.id, {
          archive_status: 'active',
          file_size: object.size,
          content_etag: object.etag,
          width: generated.width,
          height: generated.height,
          dpi_x: generated.dpiX,
          dpi_y: generated.dpiY,
          error: null,
        });
        return NextResponse.json({
          ok: true,
          assetId: asset.id,
          productionReference: asset.production_reference,
          originalName: asset.original_name,
          previewUrl: await getStorageSignedUrl(asset.preview_storage_path, 3600),
          thumbnailUrl: await getStorageSignedUrl(asset.thumbnail_storage_path, 3600),
          width: generated.width,
          height: generated.height,
          dpiX: generated.dpiX,
          dpiY: generated.dpiY,
          previewWidth: generated.previewWidth,
          previewHeight: generated.previewHeight,
        });
      } catch (error) {
        await Promise.allSettled([
          deleteBackblazeObject(asset.original_object_key),
          getSupabaseAdminClient().storage.from(getStorageBucket()).remove([asset.preview_storage_path, asset.thumbnail_storage_path]),
        ]);
        await deleteArtworkAssetRecord(asset.id, asset.owner_user_id).catch(() => undefined);
        throw error;
      } finally {
        await unlink(temporaryPath).catch(() => undefined);
      }
    }

    return NextResponse.json({ error: 'The artwork assignment action is invalid.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The artwork could not be assigned.';
    const status = /150 MB|exceed|too large/i.test(message) ? 413 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
