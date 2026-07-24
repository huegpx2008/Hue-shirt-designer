import { NextRequest, NextResponse } from 'next/server';

import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { getArtworkAssetById } from '@/lib/server/artwork-assets';
import { getDriveFileMetadata, readDriveFileRange } from '@/lib/server/google-drive';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';
import { getStorageBucket, getSupabaseAdminClient } from '@/lib/server/supabase-admin';

const SAMPLE_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Cross-site admin changes are not allowed.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'admin-drive-recovery-test', 12, 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many Drive recovery tests. Wait a moment.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 4096)) return NextResponse.json({ error: 'The recovery test request is too large.' }, { status: 413 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const assetId = String(body.assetId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) return NextResponse.json({ error: 'A valid artwork asset id is required.' }, { status: 400 });

  try {
    const asset = await getArtworkAssetById(assetId);
    if (!asset) return NextResponse.json({ error: 'Artwork asset not found.' }, { status: 404 });
    if (!asset.drive_file_id || !asset.drive_verified_at) {
      return NextResponse.json({ error: 'This artwork does not have a verified Drive original yet.' }, { status: 409 });
    }

    const driveFile = await getDriveFileMetadata(asset.drive_file_id);
    if (!driveFile.id || driveFile.trashed) throw new Error('The verified Drive original is missing or in trash.');
    const expectedBytes = Number(asset.file_size || 0);
    const driveBytes = Number(driveFile.size || 0);
    if (!expectedBytes || !driveBytes || driveBytes !== expectedBytes) {
      throw new Error(`Drive size mismatch: expected ${expectedBytes || 'unknown'} bytes and found ${driveBytes || 'unknown'} bytes.`);
    }

    const sampleSize = Math.min(SAMPLE_BYTES, driveBytes);
    const tailStart = Math.max(0, driveBytes - sampleSize);
    const [head, tail] = await Promise.all([
      readDriveFileRange(asset.drive_file_id, 0, sampleSize - 1),
      tailStart > 0 ? readDriveFileRange(asset.drive_file_id, tailStart, driveBytes - 1) : Promise.resolve(new Uint8Array()),
    ]);
    if (head.byteLength < sampleSize || (tailStart > 0 && tail.byteLength < sampleSize)) {
      throw new Error('Google Drive did not return the expected recovery samples.');
    }

    const storage = getSupabaseAdminClient().storage.from(getStorageBucket());
    const [previewResult, thumbnailResult] = await Promise.all([
      storage.download(asset.preview_storage_path),
      storage.download(asset.thumbnail_storage_path),
    ]);
    if (previewResult.error || !previewResult.data?.size) throw new Error(`The Image Zone preview is unavailable: ${previewResult.error?.message || 'empty preview'}.`);
    if (thumbnailResult.error || !thumbnailResult.data?.size) throw new Error(`The Image Zone thumbnail is unavailable: ${thumbnailResult.error?.message || 'empty thumbnail'}.`);

    const sizeLabel = `${(driveBytes / 1024 / 1024).toFixed(driveBytes >= 1024 * 1024 ? 1 : 2)} MB`;
    return NextResponse.json({
      ok: true,
      assetId: asset.id,
      productionReference: asset.production_reference,
      originalName: asset.original_name,
      providerTested: 'drive',
      expectedBytes,
      driveBytes,
      sampledBytes: head.byteLength + tail.byteLength,
      previewBytes: previewResult.data.size,
      thumbnailBytes: thumbnailResult.data.size,
      testedAt: new Date().toISOString(),
      message: `Passed: Drive returned the production original (${sizeLabel}) and both Image Zone previews are readable. B2 was not used.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Drive-only recovery test failed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
