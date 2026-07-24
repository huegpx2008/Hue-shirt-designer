import 'server-only';

import { listArtworkAssetsEligibleForSourceCleanup, updateArtworkAsset } from '@/lib/server/artwork-assets';
import { deleteBackblazeObject } from '@/lib/server/backblaze-b2';
import { getDriveFileMetadata } from '@/lib/server/google-drive';

export const cleanupVerifiedBackblazeArtwork = async (options: { limit?: number } = {}) => {
  const assets = await listArtworkAssetsEligibleForSourceCleanup(options.limit || 100);
  let deletedFiles = 0;
  let reclaimedBytes = 0;
  const skipped: string[] = [];

  for (const asset of assets) {
    try {
      if (!asset.drive_file_id || !asset.drive_verified_at) throw new Error('A verified Drive copy is required.');
      const driveFile = await getDriveFileMetadata(asset.drive_file_id);
      const driveSize = Number(driveFile.size || 0);
      if (driveFile.trashed || !driveFile.id) throw new Error('The Drive copy is missing or trashed.');
      if (driveSize && driveSize !== Number(asset.file_size)) throw new Error('The Drive copy no longer matches the source size.');

      await deleteBackblazeObject(asset.original_object_key);
      await updateArtworkAsset(asset.id, {
        original_provider: 'drive',
        source_deleted_at: new Date().toISOString(),
        error: null,
      });
      deletedFiles += 1;
      reclaimedBytes += Number(asset.file_size || 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown B2 cleanup error.';
      skipped.push(`${asset.production_reference}: ${message}`);
      await updateArtworkAsset(asset.id, { error: message.slice(0, 1000) }).catch(() => undefined);
    }
  }

  return { deletedFiles, reclaimedBytes, skipped };
};
