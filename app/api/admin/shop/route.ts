import { NextRequest, NextResponse } from 'next/server';
import { normalizeShopSlug, SHOP_PREVIEW_CATALOG, type ShopOptionDefinition } from '@/lib/shop-catalog';
import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { hasSupabaseAdminConfig, supabaseAdminFetch } from '@/lib/server/supabase-admin';
import { enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';

const isMissingShopSetup = (message: string) => /PGRST205|Could not find the table|hue_shop_products|hue_group_stores/i.test(message);

const normalizeOptions = (value: unknown): ShopOptionDefinition[] => Array.isArray(value) ? value.slice(0, 20).map((entry, index) => {
  const option = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
  const label = String(option.label || '').trim().slice(0, 80);
  const choices = Array.isArray(option.choices) ? option.choices.map((choice) => String(choice).trim()).filter(Boolean).slice(0, 50) : undefined;
  return {
    id: normalizeShopSlug(String(option.id || label || `option-${index + 1}`)) || `option-${index + 1}`,
    label: label || `Option ${index + 1}`,
    type: option.type === 'select' ? 'select' : 'text',
    required: option.required === true,
    placeholder: option.placeholder ? String(option.placeholder).slice(0, 120) : undefined,
    ...(choices?.length ? { choices } : {}),
  } as ShopOptionDefinition;
}) : [];

const loadShop = async () => {
  const [stores, products] = await Promise.all([
    supabaseAdminFetch('/rest/v1/hue_group_stores?select=*&order=created_at.desc') as Promise<Record<string, unknown>[]>,
    supabaseAdminFetch('/rest/v1/hue_shop_products?select=*&order=created_at.desc') as Promise<Record<string, unknown>[]>,
  ]);
  return { configured: true, stores, products };
};

export async function GET(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ configured: false, preview: SHOP_PREVIEW_CATALOG, message: 'Supabase service access is required.' });
  try {
    return NextResponse.json(await loadShop());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shop settings could not be loaded.';
    if (isMissingShopSetup(message)) return NextResponse.json({ configured: false, preview: SHOP_PREVIEW_CATALOG, message: 'Run supabase/hue-studio-shop.sql, then refresh this page.' });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'admin-shop-write', 40, 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Shop changes are temporarily limited.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Supabase service access is required.' }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || '');
    const now = new Date().toISOString();
    if (action === 'save-store') {
      const store = (body.store || {}) as Record<string, unknown>;
      const id = String(store.id || '').trim();
      const slug = normalizeShopSlug(String(store.slug || store.name || ''));
      const name = String(store.name || '').trim().slice(0, 140);
      if (!slug || !name) throw new Error('Store name and link slug are required.');
      const record = {
        slug,
        name,
        organization: String(store.organization || '').trim().slice(0, 160) || null,
        description: String(store.description || '').trim().slice(0, 2000),
        hero_image_url: String(store.heroImageUrl || '').trim().slice(0, 1000) || null,
        visibility: store.visibility === 'public' ? 'public' : 'unlisted',
        opens_at: store.opensAt ? new Date(String(store.opensAt)).toISOString() : null,
        closes_at: store.closesAt ? new Date(String(store.closesAt)).toISOString() : null,
        active: store.active === true,
        delivery_note: String(store.deliveryNote || '').trim().slice(0, 500) || null,
        updated_at: now,
      };
      const rows = id
        ? await supabaseAdminFetch(`/rest/v1/hue_group_stores?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(record) })
        : await supabaseAdminFetch('/rest/v1/hue_group_stores', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...record, created_at: now }) });
      return NextResponse.json({ ok: true, store: Array.isArray(rows) ? rows[0] : rows });
    }
    if (action === 'save-product') {
      const product = (body.product || {}) as Record<string, unknown>;
      const id = String(product.id || '').trim();
      const productType = product.productType === 'group' ? 'group' : 'featured';
      const storeId = String(product.storeId || '').trim() || null;
      const slug = normalizeShopSlug(String(product.slug || product.title || ''));
      const title = String(product.title || '').trim().slice(0, 160);
      const basePrice = Number(product.basePrice || 0);
      if (!slug || !title) throw new Error('Product title and link slug are required.');
      if (!Number.isFinite(basePrice) || basePrice < 0 || basePrice > 1000000) throw new Error('Enter a valid product price.');
      if (productType === 'group' && !storeId) throw new Error('Choose a Group Store for this product.');
      const record = {
        store_id: productType === 'group' ? storeId : null,
        product_type: productType,
        slug,
        title,
        eyebrow: String(product.eyebrow || '').trim().slice(0, 120) || null,
        short_description: String(product.shortDescription || '').trim().slice(0, 500),
        description: String(product.description || '').trim().slice(0, 3000) || null,
        image_url: String(product.imageUrl || '').trim().slice(0, 1000) || null,
        base_price: Number(basePrice.toFixed(2)),
        active: product.active === true && basePrice > 0,
        options: normalizeOptions(product.options),
        updated_at: now,
      };
      const rows = id
        ? await supabaseAdminFetch(`/rest/v1/hue_shop_products?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(record) })
        : await supabaseAdminFetch('/rest/v1/hue_shop_products', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...record, created_at: now }) });
      return NextResponse.json({ ok: true, product: Array.isArray(rows) ? rows[0] : rows });
    }
    if (action === 'archive-store' || action === 'archive-product') {
      const id = String(body.id || '').trim();
      if (!id) throw new Error('Choose an item to archive.');
      const table = action === 'archive-store' ? 'hue_group_stores' : 'hue_shop_products';
      await supabaseAdminFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: false, updated_at: now }) });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown Shop action.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shop settings could not be saved.';
    return NextResponse.json({ error: isMissingShopSetup(message) ? 'Run supabase/hue-studio-shop.sql before saving Shop items.' : message }, { status: 400 });
  }
}

