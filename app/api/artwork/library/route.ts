import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

import {
  getStorageBucket,
  getStorageSignedUrl,
  getSupabaseAdminClient,
  hasSupabaseAdminConfig,
  verifySupabaseAccessToken,
} from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

type StorageListEntry = {
  id?: string | null;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: { size?: number | string; mimetype?: string; mimeType?: string } | null;
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

type InlinePreview = { dataUrl: string; width: number; height: number };

const createInlinePreview = async (storagePath: string) => {
  const storage = getSupabaseAdminClient().storage.from(getStorageBucket());
  const { data, error } = await storage.download(storagePath);
  if (error || !data) throw new Error(error?.message || 'The artwork preview could not be downloaded.');
  if (data.size > INLINE_PREVIEW_MAX_SOURCE_BYTES) throw new Error('The artwork preview source is too large.');
  const preview = await sharp(Buffer.from(await data.arrayBuffer()), { failOn: 'none' })
    .rotate()
    .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72, effort: 3 })
    .toBuffer({ resolveWithObject: true });
  return {
    dataUrl: `data:image/webp;base64,${preview.data.toString('base64')}`,
    width: preview.info.width,
    height: preview.info.height,
  } satisfies InlinePreview;
};

const createInlinePreviews = async (
  files: Array<{ path: string; sourcePaths: string[] }>,
) => {
  const previews = new Map<string, InlinePreview>();
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < files.length) {
      const file = files[nextIndex];
      nextIndex += 1;
      for (const sourcePath of file.sourcePaths) {
        try {
          previews.set(file.path, await createInlinePreview(sourcePath));
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
    const originalFiles = allFiles.filter((file) => !/\/previews\//i.test(file.path));
    originalFiles.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
    const inlinePreviewCandidates = originalFiles
      .filter((file) => isRasterImage(file.name, mimeTypeFromName(file.name) || file.metadata?.mimetype || file.metadata?.mimeType))
      .slice(0, INLINE_PREVIEW_LIMIT)
      .map((file) => {
        const previewPath = getPreviewPath(file.path);
        const sourceSize = Number(file.metadata?.size || 0);
        return {
          path: file.path,
          // Try the deterministic preview path even when Supabase did not expose
          // its folder in the recursive list. This repairs older/missed listings.
          sourcePaths: Array.from(new Set([
            previewPath,
            ...(!sourceSize || sourceSize <= INLINE_PREVIEW_MAX_SOURCE_BYTES ? [file.path] : []),
          ])),
        };
      });
    const inlinePreviews = await createInlinePreviews(inlinePreviewCandidates);
    const items = await Promise.all(originalFiles.map(async (file) => {
      // The validated filename extension is authoritative. Some older signed
      // uploads were saved with stale storage metadata (for example PDF), which
      // made browsers reject an otherwise valid JPG thumbnail.
      const mimeType = mimeTypeFromName(file.name) || file.metadata?.mimetype || file.metadata?.mimeType || undefined;
      const previewPath = getPreviewPath(file.path);
      const inlinePreview = inlinePreviews.get(file.path);
      return {
        id: file.id || file.path,
        name: file.name,
        storagePath: file.path,
        storageUrl: await getStorageSignedUrl(file.path, 3600).catch(() => null),
        previewStoragePath: previewPaths.has(previewPath) ? previewPath : null,
        previewUrl: previewPaths.has(previewPath) ? await getStorageSignedUrl(previewPath, 3600).catch(() => null) : null,
        previewDataUrl: inlinePreview?.dataUrl || null,
        previewWidth: inlinePreview?.width,
        previewHeight: inlinePreview?.height,
        mimeType,
        createdAt: file.created_at,
        updatedAt: file.updated_at,
        size: Number(file.metadata?.size || 0) || undefined,
      };
    }));

    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load your Image Zone library.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
