'use client';

import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';

type AdminUser = { id?: string; email?: string; created_at?: string; last_sign_in_at?: string; user_metadata?: { full_name?: string; name?: string } };
type AdminProductionArtwork = { id?: string; label?: string; quantity?: number; sizeLabel?: string; sheetLabel?: string; frontName?: string; frontPreviewUrl?: string; frontStoragePath?: string; backName?: string; backPreviewUrl?: string; backStoragePath?: string };
type AdminOrderItem = { id?: string; productName?: string; quantity?: number; sizeLabel?: string; productionBreakdown?: AdminProductionArtwork[] };
type AdminOrderData = { items?: AdminOrderItem[]; fulfillment?: { method?: string }; customer?: { phone?: string } };
type AdminOrder = { id?: string; order_number?: string; created_at?: string; status?: string; customer_email?: string; customer_name?: string; total?: number; currency?: string; order_data?: AdminOrderData };
type AdminFile = { id?: string | null; name?: string; path?: string; created_at?: string; updated_at?: string; metadata?: { size?: number; mimetype?: string }; preview_url?: string };
type AdminPromo = { id?: string; code?: string; description?: string; discount_type?: 'percent' | 'fixed'; discount_value?: number; minimum_order?: number; expires_at?: string; max_uses?: number; uses_count?: number; active?: boolean };
type DashboardData = { users: AdminUser[]; orders: AdminOrder[]; files: AdminFile[]; promos: AdminPromo[] };
type AdminTab = 'overview' | 'orders' | 'users' | 'files' | 'promos';

const money = (value: unknown, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0));
const date = (value?: string) => value ? new Date(value).toLocaleString() : '—';
const fileSize = (value?: number) => value ? `${(value / 1024 / 1024).toFixed(value > 1024 * 1024 ? 1 : 2)} MB` : '—';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [status, setStatus] = useState('Checking admin access...');
  const [data, setData] = useState<DashboardData>({ users: [], orders: [], files: [], promos: [] });
  const [tab, setTab] = useState<AdminTab>('overview');
  const [search, setSearch] = useState('');
  const [promo, setPromo] = useState({ code: '', description: '', discount_type: 'percent', discount_value: 10, minimum_order: '', maximum_discount: '', expires_at: '', max_uses: '' });
  const [savingPromo, setSavingPromo] = useState(false);
  const [previewFile, setPreviewFile] = useState<AdminFile | null>(null);

  const loadDashboard = async () => {
    setStatus('Loading Hue Studio data...');
    const response = await fetch('/api/admin/dashboard', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({})) as DashboardData & { error?: string };
    if (response.status === 401) {
      setAuthenticated(false);
      setStatus('Enter the Hue Studio admin password.');
      return;
    }
    if (!response.ok) {
      setAuthenticated(true);
      setStatus(payload.error || 'Admin data could not be loaded.');
      return;
    }
    setAuthenticated(true);
    setData({ users: payload.users || [], orders: payload.orders || [], files: payload.files || [], promos: payload.promos || [] });
    setStatus(`Updated ${new Date().toLocaleTimeString()}`);
  };

  useEffect(() => { void loadDashboard(); }, []);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setStatus('Signing in...');
    const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setAuthenticated(false);
      setStatus(payload.error || 'Admin sign-in failed.');
      return;
    }
    setPassword('');
    await loadDashboard();
  };

  const signOut = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    setAuthenticated(false);
    setData({ users: [], orders: [], files: [], promos: [] });
    setStatus('Signed out.');
  };

  const savePromo = async (event: FormEvent) => {
    event.preventDefault();
    setSavingPromo(true);
    setStatus('Saving promo code...');
    const response = await fetch('/api/admin/promos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(promo) });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setStatus(payload.error || 'Promo code could not be saved.');
    else {
      setPromo({ code: '', description: '', discount_type: 'percent', discount_value: 10, minimum_order: '', maximum_discount: '', expires_at: '', max_uses: '' });
      await loadDashboard();
      setTab('promos');
    }
    setSavingPromo(false);
  };

  const query = search.trim().toLowerCase();
  const filteredUsers = useMemo(() => data.users.filter((user) => `${user.email || ''} ${user.user_metadata?.full_name || user.user_metadata?.name || ''}`.toLowerCase().includes(query)), [data.users, query]);
  const filteredOrders = useMemo(() => data.orders.filter((order) => `${order.order_number || ''} ${order.customer_email || ''} ${order.customer_name || ''}`.toLowerCase().includes(query)), [data.orders, query]);
  const filteredFiles = useMemo(() => data.files.filter((file) => `${file.path || ''} ${file.name || ''}`.toLowerCase().includes(query)), [data.files, query]);
  const revenue = data.orders.reduce((total, order) => total + Number(order.total || 0), 0);
  const storageBytes = data.files.reduce((total, file) => total + Number(file.metadata?.size || 0), 0);

  if (authenticated !== true) return <main className="flex min-h-screen items-center justify-center bg-[#030a12] p-5 text-white">
    <form onSubmit={signIn} className="w-full max-w-md rounded-[24px] border border-[#38bdf8]/25 bg-[#071522] p-7 shadow-[0_34px_110px_rgba(0,0,0,0.65),0_0_54px_rgba(14,165,233,0.14)]">
      <div className="flex items-center gap-3"><img src="/brand/hue-graphics-mark.png" alt="Hue Graphics" className="h-14 w-14 rounded-xl border border-[#38bdf8]/35" /><div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#67d8ff]">Hue Graphics</p><h1 className="text-2xl font-black">Studio Admin</h1></div></div>
      <p className="mt-6 text-sm leading-6 text-slate-400">Private access for customers, orders, artwork files, and promotional codes.</p>
      <label className="mt-6 block text-xs font-black uppercase tracking-wide text-slate-400">Admin password<input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-black/25 px-4 text-base text-white outline-none focus:border-[#38bdf8]" /></label>
      <button type="submit" className="mt-4 h-12 w-full rounded-xl bg-[#1686c9] text-sm font-black uppercase text-white hover:bg-[#0f75b5]">Open Dashboard</button>
      <p className={`mt-4 text-xs leading-5 ${status.toLowerCase().includes('incorrect') || status.toLowerCase().includes('not configured') ? 'text-amber-300' : 'text-slate-500'}`}>{status}</p>
    </form>
  </main>;

  return <main className="min-h-screen bg-[#030a12] text-white">
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07111f]/95 px-5 py-4 backdrop-blur md:px-8"><div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-4"><img src="/brand/hue-graphics-mark.png" alt="" className="h-11 w-11 rounded-lg border border-[#38bdf8]/30" /><div className="mr-auto"><p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#67d8ff]">Hue Graphics</p><h1 className="text-xl font-black">Studio Admin</h1></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users, orders, or files" className="h-10 min-w-64 flex-1 rounded-xl border border-white/15 bg-black/25 px-4 text-sm outline-none focus:border-[#38bdf8] md:max-w-md" /><button onClick={() => void loadDashboard()} className="h-10 rounded-xl border border-[#38bdf8]/30 bg-[#0c2a40] px-4 text-xs font-black text-[#9be8ff]">Refresh</button><a href="/" className="h-10 rounded-xl border border-white/15 px-4 py-3 text-xs font-bold text-slate-300">Store</a><button onClick={signOut} className="h-10 rounded-xl border border-white/15 px-4 text-xs font-bold text-slate-300">Sign out</button></div></header>
    <div className="mx-auto grid max-w-[1700px] gap-5 px-5 py-5 md:px-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="h-fit rounded-2xl border border-white/10 bg-[#071522] p-3 lg:sticky lg:top-24"><p className="px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Management</p>{(['overview', 'orders', 'users', 'files', 'promos'] as AdminTab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`mb-1 w-full rounded-xl px-3 py-3 text-left text-sm font-bold capitalize ${tab === item ? 'bg-[#1686c9] text-white' : 'text-slate-300 hover:bg-white/[0.06]'}`}>{item}<span className="float-right text-xs opacity-60">{item === 'orders' ? data.orders.length : item === 'users' ? data.users.length : item === 'files' ? data.files.length : item === 'promos' ? data.promos.length : ''}</span></button>)}<p className="mt-3 border-t border-white/10 px-3 pt-3 text-[10px] leading-5 text-slate-500">{status}</p></aside>
      <section className="min-w-0">
        {tab === 'overview' ? <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[[data.users.length, 'Customer accounts'], [data.orders.length, 'Orders'], [money(revenue), 'Recorded revenue'], [fileSize(storageBytes), 'Artwork storage']].map(([value, label]) => <div key={String(label)} className="rounded-2xl border border-white/10 bg-[#071522] p-5"><p className="text-3xl font-black text-white">{value}</p><p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p></div>)}</div><div className="mt-5 grid gap-5 xl:grid-cols-2"><AdminList title="Recent orders">{data.orders.slice(0, 8).map((order) => <Row key={order.id || order.order_number} title={order.order_number || 'Order'} detail={`${order.customer_email || 'No email'} · ${date(order.created_at)}`} value={money(order.total, order.currency)} />)}</AdminList><AdminList title="Recent customers">{data.users.slice(0, 8).map((user) => <Row key={user.id || user.email} title={user.email || 'Customer'} detail={`Joined ${date(user.created_at)}`} value={user.last_sign_in_at ? 'Active' : 'New'} />)}</AdminList></div></> : null}
        {tab === 'orders' ? <AdminList title="Orders">{filteredOrders.map((order) => <OrderRow key={order.id || order.order_number} order={order} files={data.files} />)}</AdminList> : null}
        {tab === 'users' ? <AdminList title="Customer accounts">{filteredUsers.map((user) => <Row key={user.id || user.email} title={user.email || 'Customer'} detail={`Created ${date(user.created_at)} · Last sign-in ${date(user.last_sign_in_at)}`} value={user.id?.slice(0, 8) || ''} />)}</AdminList> : null}
        {tab === 'files' ? <AdminList title="Artwork files">{filteredFiles.map((file, index) => <FileRow key={file.id || file.path || `${file.name}-${index}`} file={file} onPreview={() => setPreviewFile(file)} />)}</AdminList> : null}
        {tab === 'promos' ? <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]"><form onSubmit={savePromo} className="h-fit rounded-2xl border border-[#38bdf8]/20 bg-[#071522] p-5"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">Create or update</p><h2 className="mt-1 text-xl font-black">Promo code</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><AdminInput label="Code" value={promo.code} onChange={(value) => setPromo((current) => ({ ...current, code: value.toUpperCase() }))} /><AdminInput label="Description" value={promo.description} onChange={(value) => setPromo((current) => ({ ...current, description: value }))} /><label className="text-xs font-bold text-slate-400">Discount type<select value={promo.discount_type} onChange={(event) => setPromo((current) => ({ ...current, discount_type: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-[#02070d] px-3 text-white"><option value="percent">Percent off</option><option value="fixed">Fixed amount</option></select></label><AdminInput label="Discount value" type="number" value={String(promo.discount_value)} onChange={(value) => setPromo((current) => ({ ...current, discount_value: Number(value) }))} /><AdminInput label="Minimum order" type="number" value={promo.minimum_order} onChange={(value) => setPromo((current) => ({ ...current, minimum_order: value }))} /><AdminInput label="Maximum discount" type="number" value={promo.maximum_discount} onChange={(value) => setPromo((current) => ({ ...current, maximum_discount: value }))} /><AdminInput label="Expires" type="date" value={promo.expires_at} onChange={(value) => setPromo((current) => ({ ...current, expires_at: value }))} /><AdminInput label="Maximum uses" type="number" value={promo.max_uses} onChange={(value) => setPromo((current) => ({ ...current, max_uses: value }))} /></div><button disabled={savingPromo} className="mt-5 h-12 w-full rounded-xl bg-[#1686c9] text-sm font-black uppercase hover:bg-[#0f75b5] disabled:opacity-50">{savingPromo ? 'Saving...' : 'Save promo code'}</button></form><AdminList title="Promo codes">{data.promos.map((item) => <Row key={item.id || item.code} title={item.code || 'Code'} detail={`${item.description || 'No description'} · Used ${item.uses_count || 0}${item.max_uses ? ` of ${item.max_uses}` : ''} · ${item.expires_at ? `Expires ${date(item.expires_at)}` : 'No expiration'}`} value={`${item.discount_value || 0}${item.discount_type === 'percent' ? '%' : ' USD'} off${item.active === false ? ' · Inactive' : ''}`} />)}</AdminList></div> : null}
      </section>
    </div>
    {previewFile?.preview_url ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur" onClick={() => setPreviewFile(null)}>
      <section className="flex max-h-[92vh] w-[min(1100px,96vw)] flex-col overflow-hidden rounded-2xl border border-[#38bdf8]/30 bg-[#071522] shadow-[0_35px_120px_rgba(0,0,0,0.8)]" onClick={(event) => event.stopPropagation()}>
        <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-white">{previewFile.name}</p><p className="mt-1 truncate text-xs text-slate-400">{previewFile.path}</p></div><a href={previewFile.preview_url} target="_blank" rel="noreferrer" className="rounded-xl border border-[#38bdf8]/35 bg-[#0c2a40] px-4 py-2 text-xs font-black text-[#9be8ff]">Open full size</a><button type="button" onClick={() => setPreviewFile(null)} className="rounded-xl border border-white/15 px-4 py-2 text-xs font-bold text-slate-300">Close</button></header>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[linear-gradient(45deg,#111827_25%,transparent_25%),linear-gradient(-45deg,#111827_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#111827_75%),linear-gradient(-45deg,transparent_75%,#111827_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0] p-5"><img src={previewFile.preview_url} alt={previewFile.name || 'Artwork preview'} className="max-h-[76vh] max-w-full object-contain shadow-2xl" /></div>
      </section>
    </div> : null}
  </main>;
}

function AdminList({ title, children }: { title: string; children: ReactNode }) { return <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#071522]"><div className="border-b border-white/10 px-5 py-4"><h2 className="text-lg font-black">{title}</h2></div><div className="divide-y divide-white/10">{children || <p className="p-5 text-sm text-slate-500">Nothing to show yet.</p>}</div></div>; }
function Row({ title, detail, value }: { title: string; detail: string; value: string }) { return <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-white">{title}</p><p className="mt-1 break-all text-xs leading-5 text-slate-400">{detail}</p></div><p className="text-xs font-bold text-[#8be3ff]">{value}</p></div>; }
function OrderRow({ order, files }: { order: AdminOrder; files: AdminFile[] }) {
  const [open, setOpen] = useState(false);
  const items = order.order_data?.items || [];
  const artworkCount = items.reduce((total, item) => total + (item.productionBreakdown?.length || 0), 0);
  const previewFor = (storagePath?: string, fallback?: string) => files.find((file) => storagePath && file.path === storagePath)?.preview_url || fallback;
  return <div className="px-5 py-4">
    <button type="button" onClick={() => setOpen((current) => !current)} className="flex w-full flex-wrap items-start justify-between gap-3 text-left">
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-white">{order.order_number || 'Order'}</p><p className="mt-1 break-all text-xs leading-5 text-slate-400">{order.customer_name || 'Customer'} · {order.customer_email || 'No email'} · {date(order.created_at)}</p></div>
      <div className="text-right"><p className="text-xs font-bold text-[#8be3ff]">{money(order.total, order.currency)} · {order.status || 'received'}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{open ? 'Hide details' : `View ${artworkCount || ''} artwork detail${artworkCount === 1 ? '' : 's'}`}</p></div>
    </button>
    {open ? <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
      {items.length === 0 ? <p className="text-xs text-amber-200">This older order does not contain a structured item breakdown.</p> : items.map((item, itemIndex) => <section key={item.id || `${order.order_number}-item-${itemIndex}`} className="rounded-xl border border-white/10 bg-[#020a12] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-black text-white">Item {itemIndex + 1}: {item.productName || 'Print item'}</p><p className="mt-1 text-xs text-slate-400">{item.sizeLabel || 'Size not listed'} · Total qty {item.quantity || 0}</p></div><span className="rounded-full bg-[#0ea5e9]/15 px-2.5 py-1 text-[10px] font-black uppercase text-[#9be8ff]">Production breakdown</span></div>
        {(item.productionBreakdown || []).length ? <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{item.productionBreakdown?.map((artwork, artworkIndex) => {
          const frontPreview = previewFor(artwork.frontStoragePath, artwork.frontPreviewUrl);
          const backPreview = previewFor(artwork.backStoragePath, artwork.backPreviewUrl);
          return <div key={artwork.id || `${itemIndex}-${artworkIndex}`} className="flex gap-3 rounded-lg border border-[#38bdf8]/25 bg-[#071827] p-2.5">
            <div className="flex shrink-0 gap-1">{frontPreview ? <img src={frontPreview} alt={`${artwork.label || 'Artwork'} front`} className="h-20 w-20 rounded bg-white object-contain" /> : <div className="flex h-20 w-20 items-center justify-center rounded border border-dashed border-white/20 text-[9px] text-slate-500">No preview</div>}{backPreview ? <img src={backPreview} alt={`${artwork.label || 'Artwork'} back`} className="h-20 w-20 rounded bg-white object-contain" /> : null}</div>
            <div className="min-w-0"><p className="truncate text-xs font-black text-white">{artwork.label || `Artwork set ${artworkIndex + 1}`}</p><p className="mt-1 text-xl font-black text-green-300">Qty {artwork.quantity || 0}</p><p className="mt-1 text-[11px] text-slate-300">{artwork.sizeLabel || item.sizeLabel}</p>{artwork.sheetLabel ? <p className="text-[11px] text-[#9be8ff]">{artwork.sheetLabel}</p> : null}<p className="mt-1 truncate text-[10px] text-slate-500">{artwork.frontName}</p></div>
          </div>;
        })}</div> : <p className="mt-3 text-xs text-amber-200">This item predates the per-artwork quantity breakdown.</p>}
      </section>)}
    </div> : null}
  </div>;
}
function FileRow({ file, onPreview }: { file: AdminFile; onPreview: () => void }) {
  const imageFile = Boolean(file.preview_url);
  const typeLabel = file.metadata?.mimetype?.split('/').pop()?.toUpperCase() || file.name?.split('.').pop()?.toUpperCase() || 'FILE';
  return <div className="grid gap-4 px-4 py-4 sm:grid-cols-[104px_minmax(0,1fr)_auto] sm:items-center sm:px-5">
    {imageFile ? <button type="button" onClick={onPreview} className="group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-[#38bdf8]/25 bg-white shadow-[0_10px_28px_rgba(0,0,0,0.3)]"><img src={file.preview_url} alt={file.name || 'Artwork thumbnail'} loading="lazy" className="h-full w-full object-contain" /><span className="absolute inset-x-0 bottom-0 bg-black/70 py-1 text-[9px] font-black uppercase text-white opacity-0 transition group-hover:opacity-100">View larger</span></button> : <div className="flex h-24 w-24 flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400"><span className="text-xl font-black text-[#67d8ff]">{typeLabel.slice(0, 4)}</span><span className="mt-1 text-[9px] font-bold uppercase">No preview</span></div>}
    <div className="min-w-0"><button type="button" disabled={!imageFile} onClick={onPreview} className="max-w-full truncate text-left text-sm font-black text-white enabled:hover:text-[#67d8ff]">{file.name || 'File'}</button><p className="mt-1 break-all text-xs leading-5 text-slate-400">{file.path || 'Storage root'} · {file.metadata?.mimetype || 'file'} · {date(file.created_at || file.updated_at)}</p></div>
    <div className="flex items-center gap-2 sm:flex-col sm:items-end"><p className="text-xs font-bold text-[#8be3ff]">{fileSize(file.metadata?.size)}</p>{imageFile ? <button type="button" onClick={onPreview} className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-[10px] font-black uppercase text-slate-200 hover:border-[#38bdf8]/50">Preview</button> : null}</div>
  </div>;
}
function AdminInput({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="text-xs font-bold text-slate-400">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-[#02070d] px-3 text-white outline-none focus:border-[#38bdf8]" /></label>; }
