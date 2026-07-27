'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { normalizeShopSlug, SHOP_PREVIEW_CATALOG, type ShopOptionDefinition } from '@/lib/shop-catalog';

type StoreRow = { id?: string; slug?: string; name?: string; organization?: string | null; description?: string; hero_image_url?: string | null; visibility?: 'public' | 'unlisted'; opens_at?: string | null; closes_at?: string | null; active?: boolean; delivery_note?: string | null };
type ProductRow = { id?: string; store_id?: string | null; product_type?: 'featured' | 'group'; slug?: string; title?: string; eyebrow?: string | null; short_description?: string; description?: string | null; image_url?: string | null; base_price?: number; active?: boolean; options?: ShopOptionDefinition[] };
type ShopAdminPayload = { configured: boolean; stores?: StoreRow[]; products?: ProductRow[]; preview?: typeof SHOP_PREVIEW_CATALOG; message?: string; error?: string };
type StoreDraft = { id: string; name: string; slug: string; organization: string; description: string; visibility: 'public' | 'unlisted'; opensAt: string; closesAt: string; active: boolean; deliveryNote: string; heroImageUrl: string };
type ProductDraft = { id: string; title: string; slug: string; eyebrow: string; shortDescription: string; description: string; productType: 'featured' | 'group'; storeId: string; basePrice: string; imageUrl: string; active: boolean; optionsText: string };

const localDateTime = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';
const optionLines = (options?: ShopOptionDefinition[]) => (options || []).map((option) => [option.label, option.type, option.choices?.join(',') || '', option.required ? 'required' : ''].join('|')).join('\n');
const parseOptionLines = (value: string): ShopOptionDefinition[] => value.split('\n').map((line, index) => {
  const [labelValue, typeValue, choicesValue, requiredValue] = line.split('|').map((part) => part.trim());
  const label = labelValue || `Option ${index + 1}`;
  const type = typeValue === 'select' ? 'select' : 'text';
  const choices = type === 'select' ? String(choicesValue || '').split(',').map((choice) => choice.trim()).filter(Boolean) : undefined;
  return { id: normalizeShopSlug(label) || `option-${index + 1}`, label, type, choices, required: requiredValue.toLowerCase() === 'required' } as ShopOptionDefinition;
}).filter((option) => option.label.trim());

const emptyStore: StoreDraft = { id: '', name: '', slug: '', organization: '', description: '', visibility: 'unlisted', opensAt: '', closesAt: '', active: false, deliveryNote: '', heroImageUrl: '' };
const emptyProduct: ProductDraft = { id: '', title: '', slug: '', eyebrow: '', shortDescription: '', description: '', productType: 'featured', storeId: '', basePrice: '0', imageUrl: '', active: false, optionsText: '' };

export default function AdminShopPanel() {
  const [payload, setPayload] = useState<ShopAdminPayload>({ configured: false });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Loading Shop settings...');
  const [storeDraft, setStoreDraft] = useState<StoreDraft>(emptyStore);
  const [productDraft, setProductDraft] = useState<ProductDraft>(emptyProduct);
  const [saving, setSaving] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/shop', { cache: 'no-store' });
      const result = await response.json().catch(() => ({})) as ShopAdminPayload;
      if (!response.ok) throw new Error(result.error || 'Shop settings could not be loaded.');
      setPayload(result);
      setStatus(result.message || (result.configured ? 'Shop settings loaded.' : 'Shop preview mode is active.'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Shop settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const stores = payload.stores || [];
  const products = payload.products || [];
  const storeNameById = useMemo(() => Object.fromEntries(stores.map((store) => [store.id || '', store.name || 'Group Store'])), [stores]);

  const save = async (action: 'save-store' | 'save-product', body: Record<string, unknown>) => {
    setSaving(action);
    setStatus(action === 'save-store' ? 'Saving Group Store...' : 'Saving Shop product...');
    try {
      const response = await fetch('/api/admin/shop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The Shop change could not be saved.');
      setStoreDraft(emptyStore);
      setProductDraft(emptyProduct);
      await load();
      setStatus(action === 'save-store' ? 'Group Store saved.' : 'Shop product saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The Shop change could not be saved.');
    } finally {
      setSaving('');
    }
  };

  const archive = async (kind: 'store' | 'product', id?: string) => {
    if (!id || !window.confirm(`Close this ${kind === 'store' ? 'Group Store' : 'Shop product'}? It remains in Admin and can be edited or reopened later.`)) return;
    setSaving(`archive-${id}`);
    try {
      const response = await fetch('/api/admin/shop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: kind === 'store' ? 'archive-store' : 'archive-product', id }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The item could not be closed.');
      await load();
      setStatus(`${kind === 'store' ? 'Group Store' : 'Shop product'} closed.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The item could not be closed.');
    } finally {
      setSaving('');
    }
  };

  const editStore = (store: StoreRow) => setStoreDraft({
    id: store.id || '', name: store.name || '', slug: store.slug || '', organization: store.organization || '', description: store.description || '', visibility: store.visibility === 'public' ? 'public' : 'unlisted', opensAt: localDateTime(store.opens_at), closesAt: localDateTime(store.closes_at), active: store.active === true, deliveryNote: store.delivery_note || '', heroImageUrl: store.hero_image_url || '',
  });
  const editProduct = (product: ProductRow) => setProductDraft({
    id: product.id || '', title: product.title || '', slug: product.slug || '', eyebrow: product.eyebrow || '', shortDescription: product.short_description || '', description: product.description || '', productType: product.product_type === 'group' ? 'group' : 'featured', storeId: product.store_id || '', basePrice: String(product.base_price || 0), imageUrl: product.image_url || '', active: product.active === true, optionsText: optionLines(product.options),
  });

  if (loading) return <section className="rounded-2xl border border-white/10 bg-[#071522] p-6 text-sm text-slate-300">Loading Shop settings...</section>;

  return <div className="space-y-5">
    <section className="overflow-hidden rounded-3xl border border-violet-300/20 bg-[radial-gradient(circle_at_85%_0%,rgba(124,58,237,0.22),transparent_34%),#071522] p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-200">Shop Hue management</p><h2 className="mt-2 text-3xl font-black text-white">Featured products and temporary Group Stores</h2><p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">Featured products appear in the public Shop. Group products belong to a timed organization store. Products remain safely unpublished until they have a price and the Active switch is enabled.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3"><a href="/?view=shop" target="_blank" rel="noreferrer" className="rounded-xl bg-violet-600 px-4 py-3 text-xs font-black uppercase text-white hover:bg-violet-500">Preview Shop</a><span className={`rounded-full px-3 py-2 text-[10px] font-black uppercase ${payload.configured ? 'bg-green-400/15 text-green-200' : 'bg-amber-300/15 text-amber-100'}`}>{payload.configured ? 'Shop database ready' : 'Preview mode'}</span></div>
      <p className="mt-4 text-xs leading-5 text-slate-300">{status}</p>
    </section>

    {!payload.configured ? <section className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] p-5 text-sm leading-7 text-amber-100"><strong>One setup step remains:</strong> run <code className="rounded bg-black/25 px-2 py-1">supabase/hue-studio-shop.sql</code> in the Supabase SQL Editor. The customer Shop currently shows safe, non-purchasable examples so you can review the layout first.</section> : null}

    <div className="grid gap-5 xl:grid-cols-2">
      <form onSubmit={(event: FormEvent) => { event.preventDefault(); void save('save-store', { store: storeDraft }); }} className="rounded-2xl border border-white/10 bg-[#071522] p-5">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-200">Group Store editor</p><h3 className="mt-1 text-xl font-black text-white">{storeDraft.id ? 'Edit Group Store' : 'Create Group Store'}</h3></div>{storeDraft.id ? <button type="button" onClick={() => setStoreDraft(emptyStore)} className="text-xs font-bold text-slate-400">New store</button> : null}</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Store name" value={storeDraft.name} onChange={(value) => setStoreDraft((current) => ({ ...current, name: value, slug: current.slug || normalizeShopSlug(value) }))} /><Field label="Share link slug" value={storeDraft.slug} onChange={(value) => setStoreDraft((current) => ({ ...current, slug: normalizeShopSlug(value) }))} /><Field label="Organization" value={storeDraft.organization} onChange={(value) => setStoreDraft((current) => ({ ...current, organization: value }))} /><label className="text-xs font-bold text-slate-400">Visibility<select value={storeDraft.visibility} onChange={(event) => setStoreDraft((current) => ({ ...current, visibility: event.target.value === 'public' ? 'public' : 'unlisted' }))} className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-[#02070d] px-3 text-white"><option value="unlisted">Private link / unlisted</option><option value="public">Public Shop listing</option></select></label><Field type="datetime-local" label="Opens" value={storeDraft.opensAt} onChange={(value) => setStoreDraft((current) => ({ ...current, opensAt: value }))} /><Field type="datetime-local" label="Closes" value={storeDraft.closesAt} onChange={(value) => setStoreDraft((current) => ({ ...current, closesAt: value }))} /><Field label="Hero image URL (optional)" value={storeDraft.heroImageUrl} onChange={(value) => setStoreDraft((current) => ({ ...current, heroImageUrl: value }))} /><Field label="Delivery note" value={storeDraft.deliveryNote} onChange={(value) => setStoreDraft((current) => ({ ...current, deliveryNote: value }))} /></div>
        <label className="mt-3 block text-xs font-bold text-slate-400">Store description<textarea rows={4} value={storeDraft.description} onChange={(event) => setStoreDraft((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-xl border border-white/15 bg-[#02070d] p-3 text-white" /></label>
        <label className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs font-bold text-slate-300"><input type="checkbox" checked={storeDraft.active} onChange={(event) => setStoreDraft((current) => ({ ...current, active: event.target.checked }))} className="h-4 w-4 accent-violet-500" />Store is open/published (dates still apply)</label>
        <button type="submit" disabled={!payload.configured || Boolean(saving)} className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 text-xs font-black uppercase text-white hover:bg-violet-500 disabled:opacity-40">{saving === 'save-store' ? 'Saving...' : 'Save Group Store'}</button>
      </form>

      <form onSubmit={(event: FormEvent) => { event.preventDefault(); void save('save-product', { product: { ...productDraft, options: parseOptionLines(productDraft.optionsText) } }); }} className="rounded-2xl border border-white/10 bg-[#071522] p-5">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#67d8ff]">Shop product editor</p><h3 className="mt-1 text-xl font-black text-white">{productDraft.id ? 'Edit Shop Product' : 'Create Shop Product'}</h3></div>{productDraft.id ? <button type="button" onClick={() => setProductDraft(emptyProduct)} className="text-xs font-bold text-slate-400">New product</button> : null}</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Product title" value={productDraft.title} onChange={(value) => setProductDraft((current) => ({ ...current, title: value, slug: current.slug || normalizeShopSlug(value) }))} /><Field label="Product link slug" value={productDraft.slug} onChange={(value) => setProductDraft((current) => ({ ...current, slug: normalizeShopSlug(value) }))} /><label className="text-xs font-bold text-slate-400">Product type<select value={productDraft.productType} onChange={(event) => setProductDraft((current) => ({ ...current, productType: event.target.value === 'group' ? 'group' : 'featured', storeId: event.target.value === 'group' ? current.storeId : '' }))} className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-[#02070d] px-3 text-white"><option value="featured">Featured &amp; Seasonal</option><option value="group">Group Store product</option></select></label>{productDraft.productType === 'group' ? <label className="text-xs font-bold text-slate-400">Group Store<select value={productDraft.storeId} onChange={(event) => setProductDraft((current) => ({ ...current, storeId: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-[#02070d] px-3 text-white"><option value="">Choose a store...</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label> : <Field label="Card label" value={productDraft.eyebrow} onChange={(value) => setProductDraft((current) => ({ ...current, eyebrow: value }))} /> }<Field type="number" label="Price each" value={productDraft.basePrice} onChange={(value) => setProductDraft((current) => ({ ...current, basePrice: value }))} /><Field label="Product image URL" value={productDraft.imageUrl} onChange={(value) => setProductDraft((current) => ({ ...current, imageUrl: value }))} /></div>
        <Field label="Short card description" value={productDraft.shortDescription} onChange={(value) => setProductDraft((current) => ({ ...current, shortDescription: value }))} wide />
        <label className="mt-3 block text-xs font-bold text-slate-400">Full description<textarea rows={3} value={productDraft.description} onChange={(event) => setProductDraft((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-xl border border-white/15 bg-[#02070d] p-3 text-white" /></label>
        <label className="mt-3 block text-xs font-bold text-slate-400">Customer options <span className="font-normal text-slate-600">(one per line: Label | text/select | choices | required)</span><textarea rows={5} value={productDraft.optionsText} onChange={(event) => setProductDraft((current) => ({ ...current, optionsText: event.target.value }))} placeholder={'Graduate name|text||required\nBanner size|select|2 ft × 4 ft,3 ft × 6 ft|required'} className="mt-1 w-full rounded-xl border border-white/15 bg-[#02070d] p-3 font-mono text-xs text-white" /></label>
        <label className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs font-bold text-slate-300"><input type="checkbox" checked={productDraft.active} onChange={(event) => setProductDraft((current) => ({ ...current, active: event.target.checked }))} className="h-4 w-4 accent-[#1686c9]" />Product is purchasable (requires a price above $0)</label>
        <button type="submit" disabled={!payload.configured || Boolean(saving)} className="mt-4 w-full rounded-xl bg-[#1686c9] px-4 py-3 text-xs font-black uppercase text-white hover:bg-[#0f75b5] disabled:opacity-40">{saving === 'save-product' ? 'Saving...' : 'Save Shop Product'}</button>
      </form>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <List title={`Group Stores (${stores.length})`}>{stores.map((store) => <div key={store.id} className="flex flex-wrap items-start justify-between gap-3 p-4"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-white">{store.name}</p><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${store.active ? 'bg-green-400/15 text-green-200' : 'bg-slate-400/10 text-slate-400'}`}>{store.active ? 'Open' : 'Closed'}</span></div><p className="mt-1 text-xs text-slate-500">/shop/{store.slug} · {store.visibility === 'public' ? 'Public' : 'Private link'}{store.closes_at ? ` · closes ${new Date(store.closes_at).toLocaleString()}` : ''}</p></div><div className="flex gap-2"><button type="button" onClick={() => editStore(store)} className="rounded-lg border border-white/15 px-3 py-2 text-[10px] font-black uppercase text-slate-300">Edit</button><button type="button" onClick={() => void archive('store', store.id)} disabled={!store.active || saving === `archive-${store.id}`} className="rounded-lg border border-amber-300/25 px-3 py-2 text-[10px] font-black uppercase text-amber-100 disabled:opacity-30">Close</button></div></div>)}</List>
      <List title={`Shop Products (${products.length})`}>{products.map((product) => <div key={product.id} className="flex flex-wrap items-start justify-between gap-3 p-4"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-white">{product.title}</p><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${product.active ? 'bg-green-400/15 text-green-200' : 'bg-slate-400/10 text-slate-400'}`}>{product.active ? 'Published' : 'Draft'}</span></div><p className="mt-1 text-xs text-slate-500">{product.product_type === 'group' ? storeNameById[product.store_id || ''] || 'Group Store' : 'Featured & Seasonal'} · ${Number(product.base_price || 0).toFixed(2)}</p></div><div className="flex gap-2"><button type="button" onClick={() => editProduct(product)} className="rounded-lg border border-white/15 px-3 py-2 text-[10px] font-black uppercase text-slate-300">Edit</button><button type="button" onClick={() => void archive('product', product.id)} disabled={!product.active || saving === `archive-${product.id}`} className="rounded-lg border border-amber-300/25 px-3 py-2 text-[10px] font-black uppercase text-amber-100 disabled:opacity-30">Unpublish</button></div></div>)}</List>
    </div>
  </div>;
}

function Field({ label, value, onChange, type = 'text', wide = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; wide?: boolean }) { return <label className={`${wide ? 'mt-3 block' : ''} text-xs font-bold text-slate-400`}>{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-[#02070d] px-3 text-white outline-none focus:border-[#38bdf8]" /></label>; }
function List({ title, children }: { title: string; children: React.ReactNode }) { return <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#071522]"><h3 className="border-b border-white/10 px-5 py-4 text-lg font-black text-white">{title}</h3><div className="divide-y divide-white/10">{children || <p className="p-5 text-sm text-slate-500">Nothing created yet.</p>}</div></section>; }
