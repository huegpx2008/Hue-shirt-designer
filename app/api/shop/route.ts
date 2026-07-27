import { NextRequest, NextResponse } from 'next/server';
import { SHOP_PREVIEW_CATALOG, type GroupStore, type ShopOptionDefinition, type ShopProduct } from '@/lib/shop-catalog';
import { hasSupabaseAdminConfig, supabaseAdminFetch } from '@/lib/server/supabase-admin';
import { enforceRateLimit } from '@/lib/server/request-security';

type StoreRow = Record<string, unknown>;
type ProductRow = Record<string, unknown>;

const optionsFromRow = (value: unknown): ShopOptionDefinition[] => Array.isArray(value)
  ? value.filter((option): option is ShopOptionDefinition => Boolean(option && typeof option === 'object' && 'id' in option && 'label' in option))
  : [];

const storeFromRow = (row: StoreRow): GroupStore => ({
  id: String(row.id || ''),
  slug: String(row.slug || ''),
  name: String(row.name || ''),
  organization: row.organization ? String(row.organization) : undefined,
  description: String(row.description || ''),
  heroImageUrl: row.hero_image_url ? String(row.hero_image_url) : undefined,
  visibility: row.visibility === 'public' ? 'public' : 'unlisted',
  opensAt: row.opens_at ? String(row.opens_at) : null,
  closesAt: row.closes_at ? String(row.closes_at) : null,
  active: row.active === true,
  deliveryNote: row.delivery_note ? String(row.delivery_note) : undefined,
  createdAt: row.created_at ? String(row.created_at) : undefined,
  updatedAt: row.updated_at ? String(row.updated_at) : undefined,
});

const productFromRow = (row: ProductRow): ShopProduct => ({
  id: String(row.id || ''),
  storeId: row.store_id ? String(row.store_id) : null,
  productType: row.product_type === 'group' ? 'group' : 'featured',
  slug: String(row.slug || ''),
  title: String(row.title || ''),
  eyebrow: row.eyebrow ? String(row.eyebrow) : undefined,
  shortDescription: String(row.short_description || ''),
  description: row.description ? String(row.description) : undefined,
  imageUrl: row.image_url ? String(row.image_url) : undefined,
  basePrice: Number(row.base_price || 0),
  active: row.active === true,
  options: optionsFromRow(row.options),
  createdAt: row.created_at ? String(row.created_at) : undefined,
  updatedAt: row.updated_at ? String(row.updated_at) : undefined,
});

export async function GET(request: NextRequest) {
  const retryAfter = enforceRateLimit(request, 'public-shop', 90, 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'The Shop is busy. Try again in a moment.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (!hasSupabaseAdminConfig()) return NextResponse.json(SHOP_PREVIEW_CATALOG);
  const requestedStore = String(request.nextUrl.searchParams.get('store') || '').trim().toLowerCase();
  try {
    const [storeRows, productRows] = await Promise.all([
      supabaseAdminFetch('/rest/v1/hue_group_stores?select=*&active=eq.true&order=closes_at.asc.nullslast,name.asc') as Promise<StoreRow[]>,
      supabaseAdminFetch('/rest/v1/hue_shop_products?select=*&active=eq.true&base_price=gt.0&order=created_at.desc') as Promise<ProductRow[]>,
    ]);
    const allStores = storeRows.map(storeFromRow);
    const requested = requestedStore ? allStores.find((store) => store.slug === requestedStore) : undefined;
    const groupStores = allStores.filter((store) => store.visibility === 'public' || store.slug === requestedStore);
    const products = productRows.map(productFromRow);
    const visibleStoreIds = new Set(groupStores.map((store) => store.id));
    return NextResponse.json({
      configured: true,
      previewMode: false,
      featuredProducts: products.filter((product) => product.productType === 'featured'),
      groupStores,
      groupProducts: products.filter((product) => product.productType === 'group' && product.storeId && visibleStoreIds.has(product.storeId)),
      ...(requestedStore && !requested ? { message: 'This Group Store is not currently available.' } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/PGRST205|Could not find the table|hue_shop_products|hue_group_stores/i.test(message)) return NextResponse.json(SHOP_PREVIEW_CATALOG);
    return NextResponse.json({ error: message || 'The Shop could not be loaded.' }, { status: 500 });
  }
}

