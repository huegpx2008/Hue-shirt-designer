'use client';

import { useEffect, useMemo, useState } from 'react';
import { isGroupStoreOpen, SHOP_PREVIEW_CATALOG, type GroupStore, type ShopCatalogPayload, type ShopCartSelection, type ShopProduct } from '@/lib/shop-catalog';

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '';

type Props = {
  initialStoreSlug?: string;
  onAddToCart: (selection: ShopCartSelection) => void;
  onOpenCart: () => void;
};

export default function StudioShopView({ initialStoreSlug, onAddToCart, onOpenCart }: Props) {
  const [catalog, setCatalog] = useState<ShopCatalogPayload>(SHOP_PREVIEW_CATALOG);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Loading the Hue Shop...');
  const [section, setSection] = useState<'featured' | 'stores'>(initialStoreSlug ? 'stores' : 'featured');
  const [selectedStoreSlug, setSelectedStoreSlug] = useState(initialStoreSlug || '');
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [selectionError, setSelectionError] = useState('');

  useEffect(() => {
    let canceled = false;
    const load = async () => {
      setLoading(true);
      try {
        const query = initialStoreSlug ? `?store=${encodeURIComponent(initialStoreSlug)}` : '';
        const response = await fetch(`/api/shop${query}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({})) as ShopCatalogPayload & { error?: string };
        if (!response.ok) throw new Error(payload.error || 'The Shop could not be loaded.');
        if (!canceled) {
          setCatalog(payload);
          setMessage(payload.message || '');
        }
      } catch (error) {
        if (!canceled) {
          setCatalog(SHOP_PREVIEW_CATALOG);
          setMessage(error instanceof Error ? error.message : 'The Shop could not be loaded.');
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    };
    void load();
    return () => { canceled = true; };
  }, [initialStoreSlug]);

  const selectedStore = useMemo(() => catalog.groupStores.find((store) => store.slug === selectedStoreSlug) || null, [catalog.groupStores, selectedStoreSlug]);
  const selectedStoreProducts = useMemo(() => selectedStore ? catalog.groupProducts.filter((product) => product.storeId === selectedStore.id) : [], [catalog.groupProducts, selectedStore]);

  const openProduct = (product: ShopProduct) => {
    setSelectedProduct(product);
    setQuantity(1);
    setSelections(Object.fromEntries(product.options.filter((option) => option.type === 'select' && option.choices?.length).map((option) => [option.id, option.choices?.[0] || ''])));
    setSelectionError('');
  };

  const addSelection = () => {
    if (!selectedProduct) return;
    const missing = selectedProduct.options.find((option) => option.required && !String(selections[option.id] || '').trim());
    if (missing) {
      setSelectionError(`Enter ${missing.label.toLowerCase()} before adding this item.`);
      return;
    }
    const store = selectedProduct.storeId ? catalog.groupStores.find((entry) => entry.id === selectedProduct.storeId) || null : null;
    onAddToCart({ product: selectedProduct, store, quantity: Math.max(1, Math.min(10000, Math.floor(quantity || 1))), selections });
    setSelectedProduct(null);
  };

  const productGrid = (products: ShopProduct[], empty: string) => products.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {products.map((product) => <article key={product.id} className="group overflow-hidden rounded-3xl border border-white/10 bg-[#071522] shadow-[0_20px_58px_rgba(0,0,0,0.34)] transition hover:-translate-y-0.5 hover:border-[#38bdf8]/45">
      <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.18),transparent_68%),#eef6fb] p-6">
        {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]" /> : <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-[#38bdf8]/30 bg-[#0c2a40] text-3xl font-black text-[#67d8ff]">Hue</div>}
        {!product.active ? <span className="absolute right-4 top-4 rounded-full border border-amber-300/30 bg-[#1d1607]/90 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-amber-100">Preview listing</span> : null}
      </div>
      <div className="p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#67d8ff]">{product.eyebrow || (product.productType === 'group' ? 'Group Store product' : 'Featured & Seasonal')}</p>
        <h3 className="mt-2 text-xl font-black text-white">{product.title}</h3>
        <p className="mt-3 min-h-12 text-sm leading-6 text-slate-400">{product.shortDescription}</p>
        <div className="mt-5 flex items-end justify-between gap-3">
          <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Starting at</p><p className="mt-1 text-2xl font-black text-green-300">{product.basePrice > 0 ? money(product.basePrice) : 'Set in Admin'}</p></div>
          <button type="button" disabled={!product.active || product.basePrice <= 0} onClick={() => openProduct(product)} className="rounded-xl bg-[#1686c9] px-4 py-3 text-xs font-black uppercase text-white hover:bg-[#0f75b5] disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-slate-500">{product.active && product.basePrice > 0 ? 'Choose options' : 'Preview only'}</button>
        </div>
      </div>
    </article>)}
  </div> : <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.035] p-10 text-center"><p className="text-lg font-black text-white">Nothing published here yet.</p><p className="mt-2 text-sm text-slate-400">{empty}</p></div>;

  return <section className="mx-auto w-full max-w-[1800px] px-4 py-5 md:px-6">
    <div className="overflow-hidden rounded-[30px] border border-[#38bdf8]/25 bg-[radial-gradient(circle_at_84%_0%,rgba(14,165,233,0.24),transparent_35%),linear-gradient(135deg,#071827,#050b12)] shadow-[0_30px_100px_rgba(0,0,0,0.48)]">
      <div className="grid gap-8 px-6 py-8 md:px-9 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
        <div><p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#67d8ff]">Shop Hue inside Studio</p><h1 className="mt-3 max-w-4xl text-4xl font-black tracking-tight text-white md:text-6xl">Featured products and temporary Group Stores.</h1><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">Order graduation banners, limited designs, and other ready-to-personalize products—or open a private store created for your business, school, team, or organization.</p></div>
        <div className="rounded-3xl border border-white/10 bg-black/20 p-5"><p className="text-[10px] font-black uppercase tracking-[0.22em] text-green-300">Production timing</p><p className="mt-2 text-xl font-black text-white">Standard orders: 2–3 business days</p><p className="mt-2 text-xs leading-5 text-slate-400">Order by 3:00 PM ET to count the current business day. Larger orders automatically receive a longer estimated window at checkout.</p></div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-white/10 bg-black/15 px-6 py-4 md:px-9">
        <button type="button" onClick={() => { setSection('featured'); setSelectedStoreSlug(''); }} className={`rounded-xl px-5 py-3 text-xs font-black uppercase ${section === 'featured' ? 'bg-[#1686c9] text-white' : 'border border-white/12 bg-white/[0.04] text-slate-300'}`}>Featured &amp; Seasonal</button>
        <button type="button" onClick={() => setSection('stores')} className={`rounded-xl px-5 py-3 text-xs font-black uppercase ${section === 'stores' ? 'bg-[#1686c9] text-white' : 'border border-white/12 bg-white/[0.04] text-slate-300'}`}>Group Stores</button>
      </div>
    </div>

    {message ? <div className={`mt-4 rounded-2xl border px-4 py-3 text-xs leading-5 ${catalog.previewMode ? 'border-amber-300/25 bg-amber-300/[0.08] text-amber-100' : 'border-[#38bdf8]/20 bg-[#0c2a40]/50 text-[#b9efff]'}`}>{message}</div> : null}
    {loading ? <div className="mt-6 rounded-3xl border border-white/10 bg-[#071522] p-10 text-center text-slate-300">Opening the Hue Shop...</div> : null}

    {!loading && section === 'featured' ? <div className="mt-6"><div className="mb-5"><p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#67d8ff]">Featured &amp; Seasonal</p><h2 className="mt-2 text-3xl font-black text-white">Simple products without the full custom builder</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Choose a prepared product, enter the requested details, and use the same Hue Studio cart and checkout.</p></div>{productGrid(catalog.featuredProducts, 'Publish your first Featured or Seasonal item from Studio Admin.')}</div> : null}

    {!loading && section === 'stores' ? <div className="mt-6">
      {selectedStore ? <div>
        <button type="button" onClick={() => setSelectedStoreSlug('')} className="mb-4 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase text-slate-300 hover:border-[#38bdf8]/50">← All Group Stores</button>
        <div className="overflow-hidden rounded-[28px] border border-violet-300/20 bg-[radial-gradient(circle_at_80%_0%,rgba(124,58,237,0.22),transparent_35%),#071522] p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-200">{selectedStore.organization || 'Hue Group Store'}</p><h2 className="mt-2 text-3xl font-black text-white md:text-5xl">{selectedStore.name}</h2><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">{selectedStore.description}</p></div><span className={`rounded-full px-3 py-2 text-[10px] font-black uppercase ${isGroupStoreOpen(selectedStore) ? 'bg-green-400/15 text-green-200' : 'bg-amber-300/15 text-amber-100'}`}>{isGroupStoreOpen(selectedStore) ? 'Ordering open' : catalog.previewMode ? 'Preview store' : 'Store closed'}</span></div>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-300">{selectedStore.closesAt ? <span className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"><strong className="text-white">Closes:</strong> {dateTime(selectedStore.closesAt)}</span> : null}{selectedStore.deliveryNote ? <span className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"><strong className="text-white">Delivery:</strong> {selectedStore.deliveryNote}</span> : null}<span className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"><strong className="text-white">Store link:</strong> /shop/{selectedStore.slug}</span></div>
        </div>
        <div className="mt-6">{productGrid(selectedStoreProducts, catalog.previewMode ? 'This preview demonstrates the temporary-store layout. Add products after the Shop tables are installed.' : 'This store does not have published products yet.')}</div>
      </div> : <div><div className="mb-5"><p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-200">Group Stores</p><h2 className="mt-2 text-3xl font-black text-white">Individual checkout. One organized production run.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Temporary stores can be public or available only to people with their link. Each person orders and pays separately before the store deadline.</p></div>
        {catalog.groupStores.length ? <div className="grid gap-4 md:grid-cols-2">{catalog.groupStores.map((store) => <button key={store.id} type="button" onClick={() => setSelectedStoreSlug(store.slug)} className="rounded-3xl border border-white/10 bg-[#071522] p-6 text-left transition hover:-translate-y-0.5 hover:border-violet-300/45"><div className="flex items-start justify-between gap-3"><span className="rounded-full bg-violet-400/12 px-3 py-1 text-[10px] font-black uppercase text-violet-200">{store.visibility === 'unlisted' ? 'Private link' : 'Public store'}</span><span className="text-[10px] font-black uppercase text-slate-500">{isGroupStoreOpen(store) ? 'Open' : catalog.previewMode ? 'Preview' : 'Closed'}</span></div><h3 className="mt-4 text-2xl font-black text-white">{store.name}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{store.description}</p><p className="mt-5 text-xs font-black uppercase text-[#9be8ff]">Open store →</p></button>)}</div> : <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.035] p-10 text-center text-slate-400">No public Group Stores are open. Unlisted stores open from their private link.</div>}
      </div>}
    </div> : null}

    {selectedProduct ? <div className="fixed inset-0 z-[10030] flex items-center justify-center bg-black/78 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-[#38bdf8]/30 bg-[#071522] text-white shadow-[0_34px_110px_rgba(0,0,0,0.7)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#67d8ff]">Choose your options</p><h2 className="mt-2 text-2xl font-black">{selectedProduct.title}</h2><p className="mt-2 text-sm text-slate-400">{money(selectedProduct.basePrice)} each</p></div><button type="button" onClick={() => setSelectedProduct(null)} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-black uppercase text-slate-300">Close</button></div>
        <div className="space-y-4 p-6">
          {selectedProduct.options.map((option) => <label key={option.id} className="block text-xs font-black uppercase tracking-wide text-slate-300">{option.label}{option.required ? ' *' : ''}{option.type === 'select' ? <select value={selections[option.id] || ''} onChange={(event) => setSelections((current) => ({ ...current, [option.id]: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-[#02070d] px-4 text-sm font-bold normal-case text-white outline-none focus:border-[#38bdf8]"><option value="">Choose...</option>{option.choices?.map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select> : <input value={selections[option.id] || ''} onChange={(event) => setSelections((current) => ({ ...current, [option.id]: event.target.value }))} placeholder={option.placeholder} className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-[#02070d] px-4 text-sm font-normal normal-case text-white outline-none focus:border-[#38bdf8]" />}</label>)}
          <label className="block text-xs font-black uppercase tracking-wide text-slate-300">Quantity<input type="number" min="1" max="10000" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-[#02070d] px-4 text-sm text-white outline-none focus:border-[#38bdf8]" /></label>
          <div className="rounded-2xl border border-green-400/20 bg-green-400/[0.06] p-4"><p className="text-[10px] font-black uppercase tracking-wide text-green-300">Item total</p><p className="mt-1 text-3xl font-black text-white">{money(selectedProduct.basePrice * Math.max(1, Number(quantity) || 1))}</p><p className="mt-2 text-xs leading-5 text-slate-400">Final tax and shipping are calculated in the existing Hue Studio checkout.</p></div>
          {selectionError ? <p className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">{selectionError}</p> : null}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-white/10 p-5 sm:flex-row sm:justify-end"><button type="button" onClick={() => setSelectedProduct(null)} className="rounded-xl border border-white/15 px-5 py-3 text-xs font-black uppercase text-slate-300">Keep shopping</button><button type="button" onClick={addSelection} className="rounded-xl bg-[#1686c9] px-6 py-3 text-xs font-black uppercase text-white hover:bg-[#0f75b5]">Add to Studio cart</button><button type="button" onClick={onOpenCart} className="hidden">Open cart</button></div>
      </div>
    </div> : null}
  </section>;
}

