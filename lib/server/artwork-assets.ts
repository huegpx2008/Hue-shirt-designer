import 'server-only';

import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';

export type ArtworkAssetRecord = {
  id: string;
  owner_user_id: string;
  original_name: string;
  production_reference: string;
  original_provider: 'b2' | 'supabase' | 'drive';
  original_object_key: string;
  preview_storage_path: string;
  thumbnail_storage_path: string;
  mime_type: string;
  file_size: number;
  width?: number | null;
  height?: number | null;
  dpi_x?: number | null;
  dpi_y?: number | null;
  content_etag?: string | null;
  drive_file_id?: string | null;
  drive_folder_id?: string | null;
  drive_web_view_link?: string | null;
  archive_status: 'uploading' | 'active' | 'ordered' | 'archiving' | 'archived' | 'failed' | 'deleted';
  ordered_at?: string | null;
  drive_verified_at?: string | null;
  cleanup_eligible_at?: string | null;
  source_deleted_at?: string | null;
  last_used_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  error?: string | null;
};

const table = () => getSupabaseAdminClient().from('hue_artwork_assets');

export const createArtworkAsset = async (record: Partial<ArtworkAssetRecord> & Pick<ArtworkAssetRecord,
  'id' | 'owner_user_id' | 'original_name' | 'production_reference' | 'original_provider' | 'original_object_key' | 'preview_storage_path' | 'thumbnail_storage_path' | 'mime_type' | 'file_size'
>) => {
  const { data, error } = await table().insert(record).select('*').single();
  if (error) throw new Error(`Artwork asset registry is unavailable: ${error.message}`);
  return data as ArtworkAssetRecord;
};

export const getArtworkAssetForUser = async (assetId: string, userId: string) => {
  const { data, error } = await table().select('*').eq('id', assetId).eq('owner_user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as ArtworkAssetRecord | null;
};

export const getArtworkAssetById = async (assetId: string) => {
  const { data, error } = await table().select('*').eq('id', assetId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as ArtworkAssetRecord | null;
};

export const getArtworkAssetByPreviewPath = async (previewStoragePath: string) => {
  const { data, error } = await table().select('*').eq('preview_storage_path', previewStoragePath).maybeSingle();
  if (error) {
    if (/relation .*hue_artwork_assets.* does not exist|schema cache/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return data as ArtworkAssetRecord | null;
};

export const listArtworkAssetsForUser = async (userId: string) => {
  const { data, error } = await table()
    .select('*')
    .eq('owner_user_id', userId)
    .in('archive_status', ['active', 'ordered', 'archiving', 'archived'])
    .order('created_at', { ascending: false });
  if (error) {
    if (/relation .*hue_artwork_assets.* does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data || []) as ArtworkAssetRecord[];
};

export const listArtworkAssetsReadyForLibraryArchive = async (cutoffIso: string, limit = 100) => {
  const { data, error } = await table()
    .select('*')
    .eq('original_provider', 'b2')
    .eq('archive_status', 'active')
    .is('source_deleted_at', null)
    .lte('created_at', cutoffIso)
    .order('created_at', { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error) {
    if (/relation .*hue_artwork_assets.* does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data || []) as ArtworkAssetRecord[];
};

export const listArtworkAssetsEligibleForSourceCleanup = async (limit = 100) => {
  const { data, error } = await table()
    .select('*')
    .eq('original_provider', 'b2')
    .eq('archive_status', 'archived')
    .is('source_deleted_at', null)
    .not('drive_verified_at', 'is', null)
    .lte('cleanup_eligible_at', new Date().toISOString())
    .order('cleanup_eligible_at', { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error) {
    if (/relation .*hue_artwork_assets.* does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data || []) as ArtworkAssetRecord[];
};

export const updateArtworkAsset = async (assetId: string, fields: Partial<ArtworkAssetRecord>) => {
  const { data, error } = await table().update({ ...fields, updated_at: new Date().toISOString() }).eq('id', assetId).select('*').single();
  if (error) throw new Error(error.message);
  return data as ArtworkAssetRecord;
};

export const deleteArtworkAssetRecord = async (assetId: string, userId: string) => {
  const { error } = await table().delete().eq('id', assetId).eq('owner_user_id', userId);
  if (error) throw new Error(error.message);
};
