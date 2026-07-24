import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import {
  MAX_ARTWORK_BYTES,
  MAX_PRODUCTION_JPEG_PIXELS,
  MAX_PROJECT_BYTES,
  safeArtworkBaseName,
  validateArtworkBuffer,
} from '@/lib/server/artwork-file-validation';
import {
  getStorageBucket,
  getStorageSignedUrl,
  getSupabaseAdminClient,
  hasSupabaseAdminConfig,
  verifySupabaseAccessToken,
} from '@/lib/server/supabase-admin';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';
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
  getArtworkAssetForUser,
  updateArtworkAsset,
} from '@/lib/server/artwork-assets';

export const runtime = 'nodejs';
export const maxDuration = 60;

type UploadRequest = {
  action?: 'ticket' | 'generate-previews' | 'verify' | 'abort';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  storagePath?: string;
  guestSessionId?: string;
  isProject?: boolean;
  assetId?: string;
  width?: number;
  height?: number;
  dpiX?: number;
  dpiY?: number;
  artifactKind?: 'order-proof';
};

const allowedTypes = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['application/pdf', 'pdf'],
  ['application/json', 'json'],
]);
const extensionTypes = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['pdf', 'application/pdf'],
  ['json', 'application/json'],
]);

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get('authorization') || '';
  return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
};

const safeFolder = (value: string, fallback: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || fallback;
const PREVIEW_MAX_DIMENSION = 2400;
const MAX_PREVIEW_BYTES = 12 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;

const ownsPath = (storagePath: string, userId?: string, guestSessionId?: string) => {
  if (!storagePath || storagePath.includes('..') || storagePath.includes('\\')) return false;
  const parts = storagePath.split('/');
  if (userId) return parts[0] === 'customers' && parts[2] === userId;
  return Boolean(guestSessionId && parts[0] === 'guest-orders' && parts[1] === guestSessionId);
};

const getPreviewPath = (storagePath: string) => {
  const slashIndex = storagePath.lastIndexOf('/');
  const folder = slashIndex >= 0 ? storagePath.slice(0, slashIndex) : '';
  const fileName = slashIndex >= 0 ? storagePath.slice(slashIndex + 1) : storagePath;
  const previewName = fileName.replace(/\.[^.]+$/, '') || `preview-${randomUUID().slice(0, 8)}`;
  return `${folder ? `${folder}/` : ''}previews/${previewName}-preview.webp`;
};

const getMetadataPath = (storagePath: string) => getPreviewPath(storagePath).replace(/-preview\.webp$/i, '-metadata.json');

const createDesignerImagePreview = async (buffer: Buffer, mimeType: string) => {
  if (!mimeType.startsWith('image/') || mimeType === 'image/gif') return null;
  const source = sharp(buffer, { limitInputPixels: false });
  const metadata = await source.metadata();
  const preview = await source
    .clone()
    .rotate()
    .resize({ width: PREVIEW_MAX_DIMENSION, height: PREVIEW_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 2 })
    .toBuffer({ resolveWithObject: true });
  return {
    bytes: preview.data,
    width: preview.info.width,
    height: preview.info.height,
    originalWidth: metadata.autoOrient?.width || metadata.width,
    originalHeight: metadata.autoOrient?.height || metadata.height,
    dpi: metadata.density,
    mimeType: 'image/webp' as const,
  };
};

const createOversizedJpegPreviews = async (filePath: string) => {
  const metadata = await sharp(filePath, { limitInputPixels: false, sequentialRead: true }).metadata();
  const preview = await sharp(filePath, { limitInputPixels: false, sequentialRead: true })
    .rotate()
    .resize({ width: PREVIEW_MAX_DIMENSION, height: PREVIEW_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  const thumbnail = await sharp(filePath, { limitInputPixels: false, sequentialRead: true })
    .rotate()
    .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72, effort: 1 })
    .toBuffer({ resolveWithObject: true });
  if (preview.data.length > MAX_PREVIEW_BYTES || thumbnail.data.length > MAX_THUMBNAIL_BYTES) {
    throw new Error('The optimized artwork previews exceeded their storage limits.');
  }
  return {
    preview: preview.data,
    thumbnail: thumbnail.data,
    previewWidth: preview.info.width,
    previewHeight: preview.info.height,
    width: metadata.autoOrient?.width || metadata.width,
    height: metadata.autoOrient?.height || metadata.height,
    dpiX: metadata.density,
    dpiY: metadata.density,
  };
};

const inspectOptimizedWebp = async (
  buffer: Buffer,
  options: { label: string; maxBytes: number; maxDimension: number },
) => {
  if (buffer.length < 1 || buffer.length > options.maxBytes) throw new Error(`The ${options.label} is invalid.`);
  const metadata = await sharp(buffer, { limitInputPixels: options.maxDimension * options.maxDimension }).metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (metadata.format !== 'webp') throw new Error(`The ${options.label} must be a WebP image.`);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error(`The ${options.label} dimensions are invalid.`);
  if (width > options.maxDimension || height > options.maxDimension) throw new Error(`The ${options.label} dimensions exceed their safe limit.`);
  return { width, height };
};

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'This upload request came from an untrusted site.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'artwork-upload', 80, 10 * 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many artwork requests. Please wait and try again.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 16 * 1024)) return NextResponse.json({ error: 'The upload request is too large.' }, { status: 413 });
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Secure artwork storage is temporarily unavailable.' }, { status: 503 });

  try {
    const body = await request.json() as UploadRequest;
    const token = getBearerToken(request);
    const user = token ? await verifySupabaseAccessToken(token) : null;
    if (token && !user) return NextResponse.json({ error: 'Your sign-in expired. Sign in again before saving artwork.' }, { status: 401 });

    const guestSessionId = String(body.guestSessionId || '');
    if (!user) return NextResponse.json({ error: 'Create an account or sign in before uploading production artwork.' }, { status: 401 });

    if (body.action === 'abort') {
      const assetId = String(body.assetId || '');
      const asset = assetId ? await getArtworkAssetForUser(assetId, user.id) : null;
      if (!asset) return NextResponse.json({ aborted: true });
      await Promise.allSettled([
        asset.original_provider === 'b2' ? deleteBackblazeObject(asset.original_object_key) : Promise.resolve(),
        getSupabaseAdminClient().storage.from(getStorageBucket()).remove([asset.preview_storage_path, asset.thumbnail_storage_path]),
      ]);
      await deleteArtworkAssetRecord(asset.id, user.id);
      return NextResponse.json({ aborted: true });
    }

    if (body.action === 'generate-previews') {
      const assetId = String(body.assetId || '');
      const asset = assetId ? await getArtworkAssetForUser(assetId, user.id) : null;
      if (!asset || asset.original_provider !== 'b2') return NextResponse.json({ error: 'That B2 artwork upload does not belong to this account.' }, { status: 403 });
      if (asset.mime_type !== 'image/jpeg') return NextResponse.json({ error: 'Secure preview fallback is only available for oversized JPEG artwork.' }, { status: 400 });

      const object = await getBackblazeObjectMetadata(asset.original_object_key);
      if (object.size !== Number(asset.file_size)) throw new Error('The uploaded production file size does not match the selected file.');
      const firstEnd = Math.min(object.size - 1, 1024 * 1024 - 1);
      const firstBytes = await readBackblazeObjectRange(asset.original_object_key, `bytes=0-${firstEnd}`);
      const validated = validateArtworkBuffer(firstBytes, {
        maxBytes: MAX_ARTWORK_BYTES,
        maxImagePixels: MAX_PRODUCTION_JPEG_PIXELS,
      });
      if (validated.mimeType !== 'image/jpeg') throw new Error('The production file contents do not match the selected JPEG file type.');

      const temporaryPath = join(tmpdir(), `hue-artwork-${asset.id}.jpg`);
      try {
        await downloadBackblazeObjectToFile(asset.original_object_key, temporaryPath);
        const generated = await createOversizedJpegPreviews(temporaryPath);
        const storage = getSupabaseAdminClient().storage.from(getStorageBucket());
        const [{ error: previewError }, { error: thumbnailError }] = await Promise.all([
          storage.upload(asset.preview_storage_path, generated.preview, {
            contentType: 'image/webp',
            cacheControl: '604800',
            upsert: true,
          }),
          storage.upload(asset.thumbnail_storage_path, generated.thumbnail, {
            contentType: 'image/webp',
            cacheControl: '604800',
            upsert: true,
          }),
        ]);
        if (previewError) throw new Error(previewError.message || 'The reduced artwork preview could not be saved.');
        if (thumbnailError) throw new Error(thumbnailError.message || 'The artwork thumbnail could not be saved.');
        const width = generated.width || validated.width || undefined;
        const height = generated.height || validated.height || undefined;
        const dpiX = generated.dpiX || undefined;
        const dpiY = generated.dpiY || undefined;
        await updateArtworkAsset(asset.id, {
          archive_status: 'active',
          file_size: object.size,
          content_etag: object.etag,
          width,
          height,
          dpi_x: dpiX,
          dpi_y: dpiY,
          error: null,
        });
        const previewUrl = await getStorageSignedUrl(asset.preview_storage_path, 3600);
        const thumbnailUrl = await getStorageSignedUrl(asset.thumbnail_storage_path, 3600);
        return NextResponse.json({
          provider: 'b2',
          assetId: asset.id,
          productionReference: asset.production_reference,
          storagePath: asset.preview_storage_path,
          storageUrl: previewUrl,
          previewStoragePath: asset.preview_storage_path,
          previewUrl,
          // Give the current browser an immediately usable working preview.
          // Supabase can briefly return a signed URL before an upserted object is
          // readable at every edge, which made a successful upload look blank.
          previewDataUrl: `data:image/webp;base64,${generated.preview.toString('base64')}`,
          thumbnailStoragePath: asset.thumbnail_storage_path,
          thumbnailUrl,
          mimeType: validated.mimeType,
          size: object.size,
          width,
          height,
          dpiX,
          dpiY,
          previewWidth: generated.previewWidth,
          previewHeight: generated.previewHeight,
        });
      } finally {
        await unlink(temporaryPath).catch(() => undefined);
      }
    }

    if (body.action === 'ticket') {
      const fileName = String(body.fileName || '');
      const claimedType = String(body.mimeType || '').toLowerCase();
      const sourceExtension = fileName.split('.').pop()?.toLowerCase() || '';
      const mimeType = allowedTypes.has(claimedType) ? claimedType : (extensionTypes.get(sourceExtension) || '');
      const extension = allowedTypes.get(mimeType);
      const fileSize = Number(body.fileSize || 0);
      const isProject = mimeType === 'application/json' || /-project\.json$/i.test(fileName);
      if (!fileName || !extension) return NextResponse.json({ error: 'Upload a PNG, JPG, WebP, GIF, or PDF file.' }, { status: 400 });
      if ((mimeType === 'application/pdf' || isProject) && !user) return NextResponse.json({ error: 'Sign in to store PDF or editable Hue Designer project files.' }, { status: 401 });
      const maxBytes = isProject ? MAX_PROJECT_BYTES : MAX_ARTWORK_BYTES;
      if (!Number.isFinite(fileSize) || fileSize < 1 || fileSize > maxBytes) return NextResponse.json({ error: `The file must be smaller than ${(maxBytes / 1024 / 1024).toFixed(0)} MB.` }, { status: 413 });

      const generatedName = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeArtworkBaseName(fileName)}.${extension}`;
      const prefix = user
        ? `customers/${safeFolder(user.email || 'customer', 'customer')}/${user.id}`
        : `guest-orders/${guestSessionId}`;
      const isOrderProof = body.artifactKind === 'order-proof';
      const storagePath = `${prefix}/${isOrderProof ? 'order-proofs/' : ''}${generatedName}`;

      if (!isProject && !isOrderProof && hasBackblazeB2Config()) {
        const assetId = randomUUID();
        const originalName = fileName.trim().slice(0, 255);
        const objectKey = `customers/${user.id}/artwork/${assetId}/${generatedName}`;
        const previewStoragePath = `${prefix}/previews/${assetId}-preview.webp`;
        const thumbnailStoragePath = `${prefix}/thumbnails/${assetId}-thumbnail.webp`;
        const productionReference = `HUE-ART-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${assetId.slice(0, 8).toUpperCase()}`;
        const supabase = getSupabaseAdminClient();
        const { data: previewTicket, error: previewTicketError } = await supabase.storage
          .from(getStorageBucket())
          .createSignedUploadUrl(previewStoragePath, { upsert: false });
        if (previewTicketError || !previewTicket?.token) throw new Error(previewTicketError?.message || 'Supabase did not create a preview upload ticket.');
        const { data: thumbnailTicket, error: thumbnailTicketError } = await supabase.storage
          .from(getStorageBucket())
          .createSignedUploadUrl(thumbnailStoragePath, { upsert: false });
        if (thumbnailTicketError || !thumbnailTicket?.token) throw new Error(thumbnailTicketError?.message || 'Supabase did not create a thumbnail upload ticket.');

        await createArtworkAsset({
          id: assetId,
          owner_user_id: user.id,
          original_name: originalName,
          production_reference: productionReference,
          original_provider: 'b2',
          original_object_key: objectKey,
          preview_storage_path: previewStoragePath,
          thumbnail_storage_path: thumbnailStoragePath,
          mime_type: mimeType,
          file_size: fileSize,
          archive_status: 'uploading',
        });
        let uploadUrl: string;
        try {
          uploadUrl = await createBackblazeUploadUrl({ objectKey, contentType: mimeType });
        } catch (error) {
          await deleteArtworkAssetRecord(assetId, user.id).catch(() => undefined);
          throw error;
        }
        return NextResponse.json({
          provider: 'b2',
          assetId,
          productionReference,
          uploadUrl,
          mimeType,
          previewStoragePath,
          previewToken: previewTicket.token,
          thumbnailStoragePath,
          thumbnailToken: thumbnailTicket.token,
        });
      }

      const supabase = getSupabaseAdminClient();
      const { data, error } = await supabase.storage.from(getStorageBucket()).createSignedUploadUrl(storagePath, { upsert: false });
      if (error || !data?.token) throw new Error(error?.message || 'Supabase did not create an upload ticket.');
      return NextResponse.json({ storagePath, token: data.token, mimeType });
    }

    if (body.action === 'verify') {
      const assetId = String(body.assetId || '');
      if (assetId) {
        const asset = await getArtworkAssetForUser(assetId, user.id);
        if (!asset || asset.original_provider !== 'b2') return NextResponse.json({ error: 'That B2 artwork upload does not belong to this account.' }, { status: 403 });
        const storage = getSupabaseAdminClient().storage.from(getStorageBucket());
        try {
          const object = await getBackblazeObjectMetadata(asset.original_object_key);
          if (object.size !== Number(asset.file_size)) throw new Error('The uploaded production file size does not match the selected file.');
          if (object.size < 1 || object.size > MAX_ARTWORK_BYTES) throw new Error(`The uploaded file exceeds the ${(MAX_ARTWORK_BYTES / 1024 / 1024).toFixed(0)} MB limit.`);
          const firstEnd = Math.min(object.size - 1, 1024 * 1024 - 1);
          const firstBytes = await readBackblazeObjectRange(asset.original_object_key, `bytes=0-${firstEnd}`);
          let validationBytes = firstBytes;
          if (asset.mime_type === 'application/pdf' && object.size > firstBytes.length) {
            const tailStart = Math.max(0, object.size - 8192);
            const tailBytes = await readBackblazeObjectRange(asset.original_object_key, `bytes=${tailStart}-${object.size - 1}`);
            validationBytes = Buffer.concat([firstBytes, tailBytes]);
          }
          // This only parses the stored original's header; it does not decode
          // the full image. Oversized production JPEGs use the reduced WebP
          // files below throughout Image Zone and the order builder.
          const validated = validateArtworkBuffer(validationBytes, {
            allowPdf: true,
            maxBytes: MAX_ARTWORK_BYTES,
            maxImagePixels: asset.mime_type === 'image/jpeg' ? MAX_PRODUCTION_JPEG_PIXELS : undefined,
          });
          if (validated.mimeType !== asset.mime_type) throw new Error('The production file contents do not match the selected file type.');

          const { data: previewData, error: previewError } = await storage.download(asset.preview_storage_path);
          if (previewError || !previewData) throw new Error(previewError?.message || 'The reduced artwork preview was not saved.');
          const previewBuffer = Buffer.from(await previewData.arrayBuffer());
          const previewValidated = await inspectOptimizedWebp(previewBuffer, {
            label: 'designer preview',
            maxBytes: MAX_PREVIEW_BYTES,
            maxDimension: PREVIEW_MAX_DIMENSION,
          });
          const { data: thumbnailData, error: thumbnailError } = await storage.download(asset.thumbnail_storage_path);
          if (thumbnailError || !thumbnailData) throw new Error(thumbnailError?.message || 'The artwork thumbnail was not saved.');
          await inspectOptimizedWebp(Buffer.from(await thumbnailData.arrayBuffer()), {
            label: 'artwork thumbnail',
            maxBytes: MAX_THUMBNAIL_BYTES,
            maxDimension: 480,
          });

          const reportedWidth = Math.max(0, Math.round(Number(body.width || 0)));
          const reportedHeight = Math.max(0, Math.round(Number(body.height || 0)));
          const reportedDimensionsMatchOriginal = Boolean(
            reportedWidth && reportedHeight && validated.width && validated.height
            && reportedWidth * reportedHeight === validated.width * validated.height
            && ((reportedWidth === validated.width && reportedHeight === validated.height)
              || (reportedWidth === validated.height && reportedHeight === validated.width)),
          );
          const width = reportedDimensionsMatchOriginal ? reportedWidth : validated.width || undefined;
          const height = reportedDimensionsMatchOriginal ? reportedHeight : validated.height || undefined;
          const dpiX = Math.max(0, Number(body.dpiX || 0)) || undefined;
          const dpiY = Math.max(0, Number(body.dpiY || 0)) || undefined;
          await updateArtworkAsset(asset.id, {
            archive_status: 'active',
            file_size: object.size,
            content_etag: object.etag,
            width,
            height,
            dpi_x: dpiX,
            dpi_y: dpiY,
            error: null,
          });
          const previewUrl = await getStorageSignedUrl(asset.preview_storage_path, 3600);
          const thumbnailUrl = await getStorageSignedUrl(asset.thumbnail_storage_path, 3600);
          return NextResponse.json({
            provider: 'b2',
            assetId: asset.id,
            productionReference: asset.production_reference,
            storagePath: asset.preview_storage_path,
            storageUrl: previewUrl,
            previewStoragePath: asset.preview_storage_path,
            previewUrl,
            thumbnailStoragePath: asset.thumbnail_storage_path,
            thumbnailUrl,
            mimeType: validated.mimeType,
            size: object.size,
            width,
            height,
            dpiX,
            dpiY,
            previewWidth: previewValidated.width,
            previewHeight: previewValidated.height,
          });
        } catch (error) {
          await Promise.allSettled([
            deleteBackblazeObject(asset.original_object_key),
            storage.remove([asset.preview_storage_path, asset.thumbnail_storage_path]),
            updateArtworkAsset(asset.id, { archive_status: 'failed', error: error instanceof Error ? error.message.slice(0, 1000) : 'Verification failed.' }),
          ]);
          throw error;
        }
      }

      const storagePath = String(body.storagePath || '');
      if (!ownsPath(storagePath, user?.id, user ? undefined : guestSessionId)) return NextResponse.json({ error: 'That artwork upload does not belong to this session.' }, { status: 403 });
      const isProject = Boolean(body.isProject);
      if (isProject && !user) return NextResponse.json({ error: 'Sign in to save editable Hue Designer projects.' }, { status: 401 });

      const supabase = getSupabaseAdminClient();
      const storage = supabase.storage.from(getStorageBucket());
      const { data, error } = await storage.download(storagePath);
      if (error || !data) throw new Error(error?.message || 'The uploaded artwork could not be inspected.');
      const buffer = Buffer.from(await data.arrayBuffer());
      try {
        const validated = validateArtworkBuffer(buffer, {
          allowPdf: Boolean(user),
          allowJson: Boolean(user && isProject),
          maxBytes: isProject ? MAX_PROJECT_BYTES : MAX_ARTWORK_BYTES,
        });
        const pathExtension = storagePath.split('.').pop()?.toLowerCase();
        if (pathExtension !== validated.extension) throw new Error('The file contents do not match the selected file type.');
        let previewStoragePath: string | undefined;
        let previewUrl: string | undefined;
        let previewWidth: number | undefined;
        let previewHeight: number | undefined;
        const isOrderProof = /\/order-proofs\//i.test(storagePath);
        const designerPreview = isOrderProof ? null : await createDesignerImagePreview(buffer, validated.mimeType).catch(() => null);
        if (designerPreview) {
          previewStoragePath = getPreviewPath(storagePath);
          const { error: previewError } = await storage.upload(previewStoragePath, designerPreview.bytes, {
            contentType: designerPreview.mimeType,
            cacheControl: '604800',
            upsert: true,
          });
          if (!previewError) {
            previewUrl = await getStorageSignedUrl(previewStoragePath, 3600);
            previewWidth = designerPreview.width;
            previewHeight = designerPreview.height;
          }
        }
        const orientedWidth = designerPreview?.originalWidth || validated.width;
        const orientedHeight = designerPreview?.originalHeight || validated.height;
        if (!isOrderProof && orientedWidth && orientedHeight) {
          const metadataStoragePath = getMetadataPath(storagePath);
          await storage.upload(metadataStoragePath, JSON.stringify({
            version: 1,
            width: orientedWidth,
            height: orientedHeight,
            dpiX: designerPreview?.dpi,
            dpiY: designerPreview?.dpi,
          }), {
            contentType: 'application/json',
            cacheControl: '604800',
            upsert: true,
          }).catch(() => null);
        }
        const storageUrl = await getStorageSignedUrl(storagePath, 3600);
        return NextResponse.json({
          storagePath,
          storageUrl,
          mimeType: validated.mimeType,
          size: buffer.length,
          width: orientedWidth,
          height: orientedHeight,
          previewStoragePath,
          previewUrl,
          previewWidth,
          previewHeight,
        });
      } catch (error) {
        await storage.remove([storagePath]);
        throw error;
      }
    }

    return NextResponse.json({ error: 'The artwork upload action is invalid.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The artwork upload failed.';
    const status = /exceeds|cannot exceed|too large|smaller than/i.test(message) ? 413 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
