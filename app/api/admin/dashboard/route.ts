import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { getStorageBucket, hasSupabaseAdminConfig, supabaseAdminFetch } from '@/lib/server/supabase-admin';
import { DEFAULT_SHEET_PRICING, STUDIO_PRICING_PRODUCTS } from '@/lib/server/studio-pricing';
import { enforceRateLimit } from '@/lib/server/request-security';

type AdminArtifactKind = 'customer-original' | 'legacy-original' | 'order-artifact';
type StorageEntry = { id?: string | null; name?: string; created_at?: string; updated_at?: string; metadata?: { size?: number; mimetype?: string }; path?: string; preview_url?: string; artifact_kind?: AdminArtifactKind };
type ArtworkAssetEntry = {
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
  archive_status: string;
  drive_file_id?: string | null;
  drive_verified_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

const canPreviewImage = (entry: StorageEntry) => /\.(png|jpe?g|webp|gif)$/i.test(entry.name || '')
  || ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(String(entry.metadata?.mimetype || '').toLowerCase());
const adminPreviewUrl = (path: string) => `/api/admin/artwork/preview?path=${encodeURIComponent(path)}`;
const isInternalDerivative = (path?: string) => Boolean(path && (
  path.startsWith('archive-previews/')
  || /\/(?:previews|thumbnails)\//i.test(path)
));
const storageArtifactKind = (path?: string): AdminArtifactKind => path?.startsWith('orders/') || /\/order-proofs\//i.test(path || '')
  ? 'order-artifact'
  : 'legacy-original';
const registeredArtifactKind = (name: string): AdminArtifactKind => /^(?:FINAL-PRODUCTION|APPROVED-PROOF)-/i.test(name.trim())
  ? 'order-artifact'
  : 'customer-original';

const listAllOrders = async () => {
  const pageSize = 1000;
  const orders: unknown[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseAdminFetch(`/rest/v1/hue_orders?select=*&order=created_at.desc&limit=${pageSize}&offset=${offset}`) as unknown[];
    orders.push(...page);
    if (page.length < pageSize) return orders;
  }
};

const listAllUsers = async () => {
  const perPage = 200;
  const users: unknown[] = [];
  for (let page = 1; ; page += 1) {
    const payload = await supabaseAdminFetch(`/auth/v1/admin/users?page=${page}&per_page=${perPage}`) as { users?: unknown[] };
    const pageUsers = payload.users || [];
    users.push(...pageUsers);
    if (pageUsers.length < perPage) return { users };
  }
};

const listAllArtworkAssets = async () => {
  const pageSize = 1000;
  const assets: ArtworkAssetEntry[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseAdminFetch(`/rest/v1/hue_artwork_assets?select=*&archive_status=neq.deleted&order=created_at.desc&limit=${pageSize}&offset=${offset}`) as ArtworkAssetEntry[];
    assets.push(...page);
    if (page.length < pageSize) return assets;
  }
};

const listStorageFiles = async (prefix = '', depth = 0): Promise<StorageEntry[]> => {
  const pageSize = 1000;
  const entries: StorageEntry[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseAdminFetch(`/storage/v1/object/list/${encodeURIComponent(getStorageBucket())}`, { method: 'POST', body: JSON.stringify({ prefix, limit: pageSize, offset, sortBy: { column: 'created_at', order: 'desc' } }) }) as StorageEntry[];
    entries.push(...page);
    if (page.length < pageSize) break;
  }
  const files = entries.filter((entry) => entry.id).map((entry) => ({ ...entry, path: prefix ? `${prefix}/${entry.name}` : entry.name }));
  if (depth >= 4) return files;
  const folders = entries.filter((entry) => !entry.id && entry.name);
  const nested = await Promise.all(folders.map((folder) => listStorageFiles(prefix ? `${prefix}/${folder.name}` : String(folder.name), depth + 1)));
  return [...files, ...nested.flat()];
};

export async function GET(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  const retryAfter = enforceRateLimit(request, 'admin-dashboard', 30, 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Admin refresh is temporarily limited. Wait a moment.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Add SUPABASE_SERVICE_ROLE_KEY to load admin data.' }, { status: 503 });
  try {
    const results = await Promise.allSettled([
      listAllUsers(),
      listAllOrders(),
      listStorageFiles(),
      supabaseAdminFetch('/rest/v1/hue_promo_codes?select=*&order=created_at.desc') as Promise<unknown[]>,
      supabaseAdminFetch('/rest/v1/hue_pricing_adjustments?select=*&order=category.asc,display_name.asc') as Promise<unknown[]>,
      supabaseAdminFetch('/rest/v1/hue_pricing_adjustments?select=sheet_included_pieces,sheet_extra_percent,sheet_max_surcharge_percent&limit=1') as Promise<unknown[]>,
      listAllArtworkAssets(),
    ]);
    const sectionNames = ['users', 'orders', 'files', 'promos', 'pricing', 'sheetPricing', 'artworkAssets'] as const;
    const sectionErrors = results.reduce<Record<string, string>>((errors, result, index) => {
      if (result.status === 'rejected') {
        errors[sectionNames[index]] = result.reason instanceof Error ? result.reason.message : 'This section could not be loaded.';
      }
      return errors;
    }, {});
    const usersPayload = results[0].status === 'fulfilled' ? results[0].value : { users: [] };
    const orders = results[1].status === 'fulfilled' ? results[1].value : [];
    const artworkAssets = results[6].status === 'fulfilled' ? results[6].value : [];
    const managedDerivativePaths = new Set(artworkAssets.flatMap((asset) => [asset.preview_storage_path, asset.thumbnail_storage_path]));
    const rawFiles = results[2].status === 'fulfilled'
      ? results[2].value.filter((file) => file.name !== '.emptyFolderPlaceholder' && !file.path?.endsWith('/.emptyFolderPlaceholder'))
        .filter((file) => !file.path || !managedDerivativePaths.has(file.path))
        .filter((file) => !isInternalDerivative(file.path))
        .map((file) => ({ ...file, artifact_kind: storageArtifactKind(file.path) }))
      : [];
    const legacyFiles = rawFiles.map((file) => file.path && canPreviewImage(file)
      ? { ...file, preview_url: adminPreviewUrl(file.path) }
      : file);
    const registeredFiles = artworkAssets.map((asset) => ({
      id: asset.id,
      name: asset.original_name,
      path: asset.preview_storage_path,
      created_at: asset.created_at,
      updated_at: asset.updated_at,
      metadata: { size: Number(asset.file_size || 0), mimetype: asset.mime_type },
      preview_url: adminPreviewUrl(asset.preview_storage_path),
      asset_id: asset.id,
      owner_user_id: asset.owner_user_id,
      production_reference: asset.production_reference,
      original_provider: asset.original_provider,
      archive_status: asset.archive_status,
      derivative_count: 2,
      drive_recovery_ready: Boolean(asset.drive_file_id && asset.drive_verified_at),
      artifact_kind: registeredArtifactKind(asset.original_name),
    }));
    const files = [...registeredFiles, ...legacyFiles];
    const promos = results[3].status === 'fulfilled' ? results[3].value : [];
    const savedPricing = results[4].status === 'fulfilled' ? results[4].value as Array<Record<string, unknown>> : [];
    const pricing = STUDIO_PRICING_PRODUCTS.map((product) => {
      const saved = savedPricing.find((entry) => entry.product_key === product.key);
      const isSheetPriced = ['yard-sign', 'pvc', 'foamcore', 'polystyrene'].includes(product.key);
      return {
        productKey: product.key,
        sourceLabel: 'sourceLabel' in product ? product.sourceLabel : product.key,
        displayName: String(saved?.display_name || product.name),
        category: String(saved?.category || product.category),
        percentage: Number(saved?.percentage ?? 100),
        active: saved?.active !== false,
        notes: saved?.notes ? String(saved.notes) : '',
        updatedAt: saved?.updated_at ? String(saved.updated_at) : null,
        isSheetPriced,
        sheetIncludedPieces: Number(saved?.sheet_included_pieces ?? DEFAULT_SHEET_PRICING.includedPieces),
        sheetExtraPercent: Number(saved?.sheet_extra_percent ?? DEFAULT_SHEET_PRICING.extraPercentPerPiece),
        sheetMaxSurchargePercent: Number(saved?.sheet_max_surcharge_percent ?? DEFAULT_SHEET_PRICING.maxSurchargePercent),
      };
    });
    return NextResponse.json({
      users: usersPayload.users || [],
      orders,
      files,
      promos,
      pricing,
      pricingConfigured: results[4].status === 'fulfilled',
      sheetPricingConfigured: results[5].status === 'fulfilled',
      sectionErrors,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Admin data could not be loaded.' }, { status: 500 });
  }
}
