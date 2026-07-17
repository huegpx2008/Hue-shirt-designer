import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  MAX_ARTWORK_BYTES,
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

export const runtime = 'nodejs';
export const maxDuration = 60;

type UploadRequest = {
  action?: 'ticket' | 'verify';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  storagePath?: string;
  guestSessionId?: string;
  isProject?: boolean;
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
const validGuestSession = (value: string) => /^[a-zA-Z0-9-]{20,80}$/.test(value);

const ownsPath = (storagePath: string, userId?: string, guestSessionId?: string) => {
  if (!storagePath || storagePath.includes('..') || storagePath.includes('\\')) return false;
  const parts = storagePath.split('/');
  if (userId) return parts[0] === 'customers' && parts[2] === userId;
  return Boolean(guestSessionId && parts[0] === 'guest-orders' && parts[1] === guestSessionId);
};

export async function POST(request: Request) {
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Secure artwork storage is temporarily unavailable.' }, { status: 503 });

  try {
    const body = await request.json() as UploadRequest;
    const token = getBearerToken(request);
    const user = token ? await verifySupabaseAccessToken(token) : null;
    if (token && !user) return NextResponse.json({ error: 'Your sign-in expired. Sign in again before saving artwork.' }, { status: 401 });

    const guestSessionId = String(body.guestSessionId || '');
    if (!user && !validGuestSession(guestSessionId)) return NextResponse.json({ error: 'The guest upload session is invalid.' }, { status: 400 });

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
      const storagePath = `${prefix}/${generatedName}`;
      const supabase = getSupabaseAdminClient();
      const { data, error } = await supabase.storage.from(getStorageBucket()).createSignedUploadUrl(storagePath, { upsert: false });
      if (error || !data?.token) throw new Error(error?.message || 'Supabase did not create an upload ticket.');
      return NextResponse.json({ storagePath, token: data.token, mimeType });
    }

    if (body.action === 'verify') {
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
        const storageUrl = await getStorageSignedUrl(storagePath, 3600);
        return NextResponse.json({
          storagePath,
          storageUrl,
          mimeType: validated.mimeType,
          size: buffer.length,
          width: validated.width,
          height: validated.height,
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
