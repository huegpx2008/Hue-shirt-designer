'use client';

import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';

type AdminUser = { id?: string; email?: string; created_at?: string; last_sign_in_at?: string; user_metadata?: { full_name?: string; name?: string } };
type AdminProductionArtwork = { id?: string; label?: string; quantity?: number; sizeLabel?: string; sheetLabel?: string; frontName?: string; frontPreviewUrl?: string; frontStoragePath?: string; backName?: string; backPreviewUrl?: string; backStoragePath?: string };
type AdminArtworkFile = { role?: string; name?: string; storagePath?: string; storageUrl?: string; source?: string };
type AdminOrderItem = { id?: string; productId?: string; productName?: string; quantity?: number; sizeLabel?: string; optionSummary?: string[]; productionSummary?: string[]; price?: { total?: number | null; each?: number | null; currency?: string; sheetCount?: number; pricePerSheet?: number | null }; artworkFiles?: AdminArtworkFile[]; productionBreakdown?: AdminProductionArtwork[] };
type AdminOrderData = { status?: string; paymentMode?: string; payment?: { provider?: string; status?: string; paypalOrderId?: string; captureId?: string; paidAt?: string }; currency?: string; subtotal?: number; total?: number; promotion?: { code?: string; description?: string; discountAmount?: number }; shipping?: { amount?: number; label?: string }; tax?: { rate?: number; amount?: number; label?: string }; items?: AdminOrderItem[]; fulfillment?: { method?: string; address?: { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string } }; customer?: { phone?: string; userId?: string; email?: string; name?: string; organization?: string; notes?: string; taxExempt?: boolean; checkoutMode?: string } };
type AdminOrder = { id?: string; order_number?: string; created_at?: string; status?: string; customer_user_id?: string; customer_email?: string; customer_name?: string; subtotal?: number; discount?: number; promo_code?: string; shipping?: number; tax?: number; total?: number; currency?: string; payment_provider?: string | null; payment_status?: string | null; paypal_order_id?: string | null; paypal_capture_id?: string | null; paid_at?: string | null; payment_data?: Record<string, unknown> | null; printavo_status?: 'not_added' | 'added'; printavo_order_number?: string | null; printavo_added_at?: string | null; drive_archive_status?: 'pending' | 'processing' | 'archived' | 'failed' | 'not_configured' | null; drive_folder_id?: string | null; drive_folder_url?: string | null; drive_archived_at?: string | null; drive_archive_error?: string | null; drive_archive_attempts?: number | null; order_data?: AdminOrderData };
type AdminFile = { id?: string | null; name?: string; path?: string; created_at?: string; updated_at?: string; metadata?: { size?: number; mimetype?: string }; preview_url?: string; asset_id?: string; owner_user_id?: string; production_reference?: string; original_provider?: 'b2' | 'supabase' | 'drive'; archive_status?: string; derivative_count?: number };
type AdminPromo = { id?: string; code?: string; description?: string; discount_type?: 'percent' | 'fixed'; discount_value?: number; minimum_order?: number; expires_at?: string; max_uses?: number; uses_count?: number; active?: boolean };
type AdminPricing = { productKey: string; sourceLabel?: string; displayName: string; category: string; percentage: number; active: boolean; notes?: string; updatedAt?: string | null; isSheetPriced?: boolean; sheetIncludedPieces?: number; sheetExtraPercent?: number; sheetMaxSurchargePercent?: number };
type SheetPricingDraft = { includedPieces: string; extraPercent: string; maxSurchargePercent: string };
type DashboardData = { users: AdminUser[]; orders: AdminOrder[]; files: AdminFile[]; promos: AdminPromo[]; pricing: AdminPricing[]; pricingConfigured: boolean; sheetPricingConfigured: boolean };
type AdminTab = 'overview' | 'orders' | 'users' | 'guests' | 'files' | 'pricing' | 'promos' | 'maintenance';
type GuestGroupData = { key: string; label: string; detail: string; orders: AdminOrder[]; files: AdminFile[] };
type ArchiveStats = { trackedFiles: number; activeOriginals: number; eligibleFiles: number; activeBytes: number; eligibleBytes: number; cleanedFiles: number };
type PrelaunchResetPreview = { orders: number; users: number; paymentAttempts: number; archiveRows: number; artworkAssets: number; b2Originals: number; b2Bytes: number; driveCopies: number; files: Array<{ prefix: string; count: number; bytes: number }>; totalFiles: number; totalBytes: number };

const money = (value: unknown, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0));
const date = (value?: string) => value ? new Date(value).toLocaleString() : '—';
const fileSize = (value?: number) => value ? `${(value / 1024 / 1024).toFixed(value > 1024 * 1024 ? 1 : 2)} MB` : '—';
const orderBelongsToUser = (order: AdminOrder, user: AdminUser) => Boolean(
  (user.id && (order.customer_user_id === user.id || order.order_data?.customer?.userId === user.id))
  || (user.email && (order.customer_email || order.order_data?.customer?.email || '').toLowerCase() === user.email.toLowerCase())
);
const getOrderStoragePaths = (order: AdminOrder) => new Set((order.order_data?.items || []).flatMap((item) => [
  ...(item.artworkFiles || []).map((file) => file.storagePath),
  ...(item.productionBreakdown || []).flatMap((artwork) => [artwork.frontStoragePath, artwork.backStoragePath]),
]).filter(Boolean) as string[]);
const fileBelongsToCustomer = (file: AdminFile, user: AdminUser, orders: AdminOrder[]) => {
  if (user.id && String(file.path || '').split('/').includes(user.id)) return true;
  return orders.some((order) => getOrderStoragePaths(order).has(file.path || ''));
};
const guestSessionFromPath = (path?: string) => {
  const parts = String(path || '').split('/');
  return parts[0] === 'guest-orders' && parts[1] ? parts[1] : '';
};
const fileSearchText = (file: AdminFile) => `${file.name || ''} ${file.path || ''} ${file.production_reference || ''} ${file.original_provider || ''} ${file.archive_status || ''}`;

const friendlyAdminError = (message?: string) => {
  const value = String(message || '');
  if (value.includes('PGRST205') || value.includes('Could not find the table')) return 'Supabase setup is incomplete. Run the required Hue Studio SQL, then refresh.';
  return value || 'Admin data could not be loaded.';
};

const dashboardStatus = (sectionErrors?: Record<string, string>) => {
  const updated = `Updated ${new Date().toLocaleTimeString()}`;
  const missingPricing = Boolean(sectionErrors?.pricing);
  const missingPromos = Boolean(sectionErrors?.promos);
  if (missingPricing && missingPromos) return `${updated} · Run hue-studio-admin.sql in Supabase`;
  if (missingPricing) return `${updated} · Pricing setup required`;
  if (missingPromos) return `${updated} · Promo-code setup required`;
  if (sectionErrors && Object.keys(sectionErrors).length) return `${updated} · Some admin sections could not be loaded`;
  return updated;
};

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [status, setStatus] = useState('Checking admin access...');
  const [data, setData] = useState<DashboardData>({ users: [], orders: [], files: [], promos: [], pricing: [], pricingConfigured: false, sheetPricingConfigured: false });
  const [tab, setTab] = useState<AdminTab>('overview');
  const [search, setSearch] = useState('');
  const [promo, setPromo] = useState({ code: '', description: '', discount_type: 'percent', discount_value: 10, minimum_order: '', maximum_discount: '', expires_at: '', max_uses: '' });
  const [savingPromo, setSavingPromo] = useState(false);
  const [pricingDrafts, setPricingDrafts] = useState<Record<string, string>>({});
  const [sheetPricingDrafts, setSheetPricingDrafts] = useState<Record<string, SheetPricingDraft>>({});
  const [savingPricingKey, setSavingPricingKey] = useState('');
  const [previewFile, setPreviewFile] = useState<AdminFile | null>(null);
  const [archiveStats, setArchiveStats] = useState<ArchiveStats | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetPreview, setResetPreview] = useState<PrelaunchResetPreview | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState('');

  const loadDashboard = async () => {
    setStatus('Loading Hue Studio data...');
    const response = await fetch('/api/admin/dashboard', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({})) as DashboardData & { error?: string; sectionErrors?: Record<string, string> };
    if (response.status === 401) {
      setAuthenticated(false);
      setStatus('Enter the Hue Studio admin password.');
      return;
    }
    if (!response.ok) {
      setAuthenticated(true);
      setStatus(friendlyAdminError(payload.error));
      return;
    }
    setAuthenticated(true);
    const pricing = payload.pricing || [];
    setData({ users: payload.users || [], orders: payload.orders || [], files: payload.files || [], promos: payload.promos || [], pricing, pricingConfigured: payload.pricingConfigured === true, sheetPricingConfigured: payload.sheetPricingConfigured === true });
    setPricingDrafts(Object.fromEntries(pricing.map((item) => [item.productKey, String(item.percentage)])));
    setSheetPricingDrafts(Object.fromEntries(pricing.filter((item) => item.isSheetPriced).map((item) => [item.productKey, {
      includedPieces: String(item.sheetIncludedPieces ?? 10),
      extraPercent: String(item.sheetExtraPercent ?? 0.325),
      maxSurchargePercent: String(item.sheetMaxSurchargePercent ?? 30),
    }])));
    setStatus(dashboardStatus(payload.sectionErrors));
  };

  useEffect(() => { void loadDashboard(); }, []);

  const loadArchiveStats = async () => {
    const response = await fetch('/api/admin/storage-cleanup', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({})) as { stats?: ArchiveStats; error?: string };
    if (!response.ok) {
      setCleanupMessage(payload.error || 'Storage status could not be loaded.');
      return;
    }
    setArchiveStats(payload.stats || null);
  };

  useEffect(() => {
    if (authenticated && tab === 'files') void loadArchiveStats();
  }, [authenticated, tab]);

  const loadPrelaunchResetPreview = async () => {
    const response = await fetch('/api/admin/prelaunch-reset', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({})) as { preview?: PrelaunchResetPreview; error?: string };
    if (!response.ok) {
      setResetMessage(payload.error || 'Reset preview could not be loaded.');
      return;
    }
    setResetPreview(payload.preview || null);
    setResetMessage('');
  };

  useEffect(() => {
    if (authenticated && tab === 'maintenance') void loadPrelaunchResetPreview();
  }, [authenticated, tab]);

  const runStorageCleanup = async (emergency: boolean) => {
    if (emergency && !window.confirm('Archive and clean verified originals now, even if their normal retention period has not ended? Drive and preview verification will still be required.')) return;
    setCleanupBusy(true);
    setCleanupMessage(emergency ? 'Verifying Drive copies and cleaning Supabase now...' : 'Archiving recent orders and cleaning eligible files...');
    const response = await fetch('/api/admin/storage-cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emergency }),
    });
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      cleanup?: { cleanedFiles?: number; reclaimedBytes?: number; skipped?: string[] };
      guestCleanup?: { deletedFiles?: number; reclaimedBytes?: number; skipped?: string[] };
      after?: ArchiveStats;
    };
    if (!response.ok) setCleanupMessage(payload.error || 'Storage cleanup failed.');
    else {
      setArchiveStats(payload.after || null);
      const cleaned = payload.cleanup?.cleanedFiles || 0;
      const guestFiles = payload.guestCleanup?.deletedFiles || 0;
      const reclaimed = fileSize((payload.cleanup?.reclaimedBytes || 0) + (payload.guestCleanup?.reclaimedBytes || 0));
      const skipped = (payload.cleanup?.skipped?.length || 0) + (payload.guestCleanup?.skipped?.length || 0);
      setCleanupMessage(`Cleanup finished: ${cleaned} verified order original${cleaned === 1 ? '' : 's'} archived, ${guestFiles} expired guest upload${guestFiles === 1 ? '' : 's'} removed, ${reclaimed} reclaimed${skipped ? `, ${skipped} safely skipped` : ''}.`);
      await loadDashboard();
      setTab('files');
    }
    setCleanupBusy(false);
  };

  const runPrelaunchReset = async () => {
    if (resetConfirmation !== 'RESET HUE TEST DATA') {
      setResetMessage('Type RESET HUE TEST DATA before running the pre-launch reset.');
      return;
    }
    if (!window.confirm('This deletes test customer accounts, orders, payment attempts, Supabase artwork, B2 production originals, artwork registries, and archive rows. Referenced Google Drive test archives move to Drive trash. Pricing, promos, product settings, and admin access stay untouched. Continue?')) return;
    setResetBusy(true);
    setResetMessage('Resetting test data now...');
    const response = await fetch('/api/admin/prelaunch-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirmation: resetConfirmation,
        deleteOrders: true,
        deleteCustomerAccounts: true,
        deleteArtworkFiles: true,
        deleteArchiveRows: true,
      }),
    });
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      deleted?: { orders?: number; paymentAttempts?: number; archiveRows?: number; artworkAssets?: number; storage?: { deletedFiles?: number; deletedBytes?: number; skipped?: string[] }; externalArtwork?: { deletedB2Originals?: number; deletedB2Bytes?: number; trashedDriveCopies?: number }; users?: { deleted?: number; skipped?: unknown[] } };
      after?: PrelaunchResetPreview;
    };
    if (!response.ok) setResetMessage(payload.error || 'Pre-launch reset failed.');
    else {
      const skipped = (payload.deleted?.storage?.skipped?.length || 0) + (payload.deleted?.users?.skipped?.length || 0);
      setResetPreview(payload.after || null);
      setResetConfirmation('');
      setResetMessage(`Reset finished: ${payload.deleted?.orders || 0} orders, ${payload.deleted?.paymentAttempts || 0} payment attempts, ${payload.deleted?.users?.deleted || 0} customer accounts, ${payload.deleted?.storage?.deletedFiles || 0} Supabase files, ${payload.deleted?.externalArtwork?.deletedB2Originals || 0} B2 originals, ${payload.deleted?.externalArtwork?.trashedDriveCopies || 0} Drive archives, and ${payload.deleted?.artworkAssets || 0} asset records cleaned${skipped ? `. ${skipped} customer account${skipped === 1 ? '' : 's'} could not be removed and should be checked manually.` : '.'}`);
      await loadDashboard();
      setTab('maintenance');
    }
    setResetBusy(false);
  };

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
    setData({ users: [], orders: [], files: [], promos: [], pricing: [], pricingConfigured: false, sheetPricingConfigured: false });
    setPricingDrafts({});
    setSheetPricingDrafts({});
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

  const savePricingAdjustment = async (item: AdminPricing, nextPercentage?: number) => {
    const percentage = nextPercentage ?? Number(pricingDrafts[item.productKey]);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 200) {
      setStatus('Pricing percentage must be between 0% and 200%.');
      return;
    }
    setSavingPricingKey(item.productKey);
    setStatus(`Saving ${item.displayName} pricing...`);
    const sheetDraft = sheetPricingDrafts[item.productKey];
    const response = await fetch('/api/admin/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productKey: item.productKey, percentage, active: true, ...(item.isSheetPriced ? {
        sheetIncludedPieces: Number(sheetDraft?.includedPieces),
        sheetExtraPercent: Number(sheetDraft?.extraPercent),
        sheetMaxSurchargePercent: Number(sheetDraft?.maxSurchargePercent),
      } : {}) }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setStatus(payload.error || `${item.displayName} pricing could not be saved.`);
    else await loadDashboard();
    setSavingPricingKey('');
  };

  const saveAllPricingAdjustments = async () => {
    const adjustments = data.pricing.map((item) => {
      const sheetDraft = sheetPricingDrafts[item.productKey];
      return { productKey: item.productKey, percentage: Number(pricingDrafts[item.productKey]), active: true, ...(item.isSheetPriced ? {
        sheetIncludedPieces: Number(sheetDraft?.includedPieces),
        sheetExtraPercent: Number(sheetDraft?.extraPercent),
        sheetMaxSurchargePercent: Number(sheetDraft?.maxSurchargePercent),
      } : {}) };
    });
    const invalid = adjustments.find((item) => !Number.isFinite(item.percentage) || item.percentage < 0 || item.percentage > 200);
    if (invalid) {
      const product = data.pricing.find((item) => item.productKey === invalid.productKey);
      setStatus(`${product?.displayName || invalid.productKey} must be between 0% and 200%.`);
      return;
    }
    setSavingPricingKey('__all__');
    setStatus(`Saving all ${adjustments.length} pricing adjustments...`);
    const response = await fetch('/api/admin/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adjustments }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setStatus(payload.error || 'Pricing adjustments could not be saved.');
    else {
      await loadDashboard();
      setTab('pricing');
      setStatus(`All ${adjustments.length} pricing adjustments were saved.`);
    }
    setSavingPricingKey('');
  };

  const query = search.trim().toLowerCase();
  const filteredUsers = useMemo(() => data.users.filter((user) => `${user.email || ''} ${user.user_metadata?.full_name || user.user_metadata?.name || ''}`.toLowerCase().includes(query)), [data.users, query]);
  const filteredOrders = useMemo(() => data.orders.filter((order) => `${order.order_number || ''} ${order.customer_email || ''} ${order.customer_name || ''}`.toLowerCase().includes(query)), [data.orders, query]);
  const customerGroups = useMemo(() => data.users.map((user) => {
    const orders = data.orders.filter((order) => orderBelongsToUser(order, user));
    const files = data.files.filter((file) => fileBelongsToCustomer(file, user, orders));
    return { user, orders, files };
  }), [data.users, data.orders, data.files]);
  const guestOrders = useMemo(() => data.orders.filter((order) => !data.users.some((user) => orderBelongsToUser(order, user))), [data.orders, data.users]);
  const guestGroups = useMemo(() => {
    const groups = new Map<string, GuestGroupData>();
    const ensureGroup = (key: string, label: string, detail: string) => {
      if (!groups.has(key)) groups.set(key, { key, label, detail, orders: [], files: [] });
      return groups.get(key)!;
    };
    guestOrders.forEach((order) => {
      const paths = Array.from(getOrderStoragePaths(order));
      const session = paths.map(guestSessionFromPath).find(Boolean);
      const key = session ? `session:${session}` : `order:${order.order_number || order.id || 'guest'}`;
      const label = order.customer_name || order.customer_email || 'Guest checkout';
      const detail = order.customer_email || (session ? `Guest session ${session.slice(0, 12)}` : 'No account created');
      ensureGroup(key, label, detail).orders.push(order);
    });
    data.files.forEach((file) => {
      const session = guestSessionFromPath(file.path);
      let group = session ? ensureGroup(`session:${session}`, 'Guest upload session', `Session ${session.slice(0, 12)}`) : undefined;
      if (!group) {
        const order = guestOrders.find((entry) => getOrderStoragePaths(entry).has(file.path || ''));
        if (order) {
          const orderPaths = Array.from(getOrderStoragePaths(order));
          const orderSession = orderPaths.map(guestSessionFromPath).find(Boolean);
          const key = orderSession ? `session:${orderSession}` : `order:${order.order_number || order.id || 'guest'}`;
          group = ensureGroup(key, order.customer_name || order.customer_email || 'Guest checkout', order.customer_email || 'No account created');
        }
      }
      if (group && !group.files.some((entry) => entry.path === file.path)) group.files.push(file);
    });
    return Array.from(groups.values()).sort((a, b) => String(b.orders[0]?.created_at || b.files[0]?.created_at || '').localeCompare(String(a.orders[0]?.created_at || a.files[0]?.created_at || '')));
  }, [data.files, guestOrders]);
  const assignedFilePaths = useMemo(() => new Set(customerGroups.flatMap((group) => group.files.map((file) => file.path).filter(Boolean) as string[])), [customerGroups]);
  const guestFilePaths = useMemo(() => new Set(guestGroups.flatMap((group) => group.files.map((file) => file.path).filter(Boolean) as string[])), [guestGroups]);
  const unassignedFiles = useMemo(() => data.files.filter((file) => !file.path || (!assignedFilePaths.has(file.path) && !guestFilePaths.has(file.path))), [data.files, assignedFilePaths, guestFilePaths]);
  const revenue = data.orders.reduce((total, order) => total + Number(order.total || 0), 0);
  const storageBytes = data.files.reduce((total, file) => total + Number(file.metadata?.size || 0), 0);
  const awaitingPrintavoCount = data.orders.filter((order) => order.printavo_status !== 'added').length;
  const adjustedPricingCount = data.pricing.filter((item) => item.active && item.percentage !== 100).length;
  const pricingCategories = useMemo(() => Array.from(new Set(data.pricing.map((item) => item.category))), [data.pricing]);
  const updateOrder = (updatedOrder: AdminOrder) => setData((current) => ({ ...current, orders: current.orders.map((order) => order.id === updatedOrder.id ? updatedOrder : order) }));
  const resetPreviewCards = resetPreview ? [[resetPreview.users, 'Customer accounts'], [resetPreview.orders, 'Orders'], [resetPreview.paymentAttempts, 'Payment attempts'], [resetPreview.totalFiles, 'Supabase files'], [resetPreview.artworkAssets, 'Asset records'], [resetPreview.b2Originals, 'B2 originals'], [resetPreview.driveCopies, 'Drive archives'], [resetPreview.archiveRows, 'Legacy archive rows'], [fileSize(resetPreview.totalBytes + resetPreview.b2Bytes), 'Tracked artwork size']] : [];

  if (authenticated !== true) return <main className="flex min-h-screen items-center justify-center bg-[#030a12] p-5 text-white">
    <form onSubmit={signIn} className="w-full max-w-md rounded-[24px] border border-[#38bdf8]/25 bg-[#071522] p-7 shadow-[0_34px_110px_rgba(0,0,0,0.65),0_0_54px_rgba(14,165,233,0.14)]">
      <div className="flex items-center gap-3"><img src="/brand/hue-graphics-mark.webp" alt="Hue Graphics" width={512} height={512} className="h-14 w-14 rounded-xl border border-[#38bdf8]/35" /><div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#67d8ff]">Hue Graphics</p><h1 className="text-2xl font-black">Studio Admin</h1></div></div>
      <p className="mt-6 text-sm leading-6 text-slate-400">Private access for customers, orders, artwork files, and promotional codes.</p>
      <label className="mt-6 block text-xs font-black uppercase tracking-wide text-slate-400">Admin password<input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-black/25 px-4 text-base text-white outline-none focus:border-[#38bdf8]" /></label>
      <button type="submit" className="mt-4 h-12 w-full rounded-xl bg-[#1686c9] text-sm font-black uppercase text-white hover:bg-[#0f75b5]">Open Dashboard</button>
      <p className={`mt-4 text-xs leading-5 ${status.toLowerCase().includes('incorrect') || status.toLowerCase().includes('not configured') ? 'text-amber-300' : 'text-slate-500'}`}>{status}</p>
    </form>
  </main>;

  return <main className="min-h-screen bg-[#030a12] text-white">
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07111f]/95 px-5 py-4 backdrop-blur md:px-8"><div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-4"><img src="/brand/hue-graphics-mark.webp" alt="" width={512} height={512} className="h-11 w-11 rounded-lg border border-[#38bdf8]/30" /><div className="mr-auto"><p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#67d8ff]">Hue Graphics</p><h1 className="text-xl font-black">Studio Admin</h1></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users, orders, or files" className="h-10 min-w-64 flex-1 rounded-xl border border-white/15 bg-black/25 px-4 text-sm outline-none focus:border-[#38bdf8] md:max-w-md" /><button onClick={() => void loadDashboard()} className="h-10 rounded-xl border border-[#38bdf8]/30 bg-[#0c2a40] px-4 text-xs font-black text-[#9be8ff]">Refresh</button><a href="/" className="h-10 rounded-xl border border-white/15 px-4 py-3 text-xs font-bold text-slate-300">Store</a><button onClick={signOut} className="h-10 rounded-xl border border-white/15 px-4 text-xs font-bold text-slate-300">Sign out</button></div></header>
    <div className="mx-auto grid max-w-[1700px] gap-5 px-5 py-5 md:px-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="h-fit rounded-2xl border border-white/10 bg-[#071522] p-3 lg:sticky lg:top-24"><p className="px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Management</p>{(['overview', 'orders', 'users', 'guests', 'files', 'pricing', 'promos', 'maintenance'] as AdminTab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`mb-1 w-full rounded-xl px-3 py-3 text-left text-sm font-bold capitalize ${tab === item ? 'bg-[#1686c9] text-white' : 'text-slate-300 hover:bg-white/[0.06]'}`}>{item === 'users' ? 'customers' : item}<span className="float-right text-xs opacity-60">{item === 'orders' ? data.orders.length : item === 'users' ? data.users.length : item === 'guests' ? guestGroups.length : item === 'files' ? data.files.length : item === 'pricing' ? adjustedPricingCount : item === 'promos' ? data.promos.length : ''}</span></button>)}<p className="mt-3 border-t border-white/10 px-3 pt-3 text-[10px] leading-5 text-slate-500">{status}</p></aside>
      <section className="min-w-0">
        {tab === 'overview' ? <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[[data.users.length, 'Customer accounts'], [data.orders.length, 'Orders'], [awaitingPrintavoCount, 'Awaiting Printavo'], [money(revenue), 'Recorded revenue'], [fileSize(storageBytes), 'Artwork storage']].map(([value, label]) => <div key={String(label)} className={`rounded-2xl border p-5 ${label === 'Awaiting Printavo' && Number(value) > 0 ? 'border-amber-300/25 bg-amber-300/[0.07]' : 'border-white/10 bg-[#071522]'}`}><p className={`text-3xl font-black ${label === 'Awaiting Printavo' && Number(value) > 0 ? 'text-amber-200' : 'text-white'}`}>{value}</p><p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p></div>)}</div><div className="mt-5 grid gap-5 xl:grid-cols-2"><AdminList title="Recent orders">{data.orders.slice(0, 8).map((order) => <Row key={order.id || order.order_number} title={order.order_number || 'Order'} detail={`${order.customer_email || 'No email'} · ${date(order.created_at)}`} value={money(order.total, order.currency)} />)}</AdminList><AdminList title="Recent customers">{data.users.slice(0, 8).map((user) => <Row key={user.id || user.email} title={user.email || 'Customer'} detail={`Joined ${date(user.created_at)}`} value={user.last_sign_in_at ? 'Active' : 'New'} />)}</AdminList></div></> : null}
        {tab === 'orders' ? <AdminList title="All orders — complete order details">{filteredOrders.map((order) => <OrderRow key={order.id || order.order_number} order={order} files={data.files} onPreview={setPreviewFile} onOrderUpdated={updateOrder} />)}</AdminList> : null}
        {tab === 'users' ? <AdminList title="Customers — orders and artwork">{filteredUsers.map((user) => {
          const group = customerGroups.find((entry) => entry.user.id === user.id || entry.user.email === user.email);
          return <CustomerRow key={user.id || user.email} user={user} orders={group?.orders || []} files={group?.files || []} onPreview={setPreviewFile} onOrderUpdated={updateOrder} />;
        })}</AdminList> : null}
        {tab === 'guests' ? <div className="space-y-4"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">Guest checkout</p><h2 className="mt-1 text-2xl font-black">Guest orders and artwork</h2><p className="mt-1 text-sm text-slate-400">Artwork is grouped by guest upload session and connected to its submitted order whenever possible.</p></div>{guestGroups.map((group) => {
          const groupText = `${group.label} ${group.detail} ${group.orders.map((order) => order.order_number).join(' ')} ${group.files.map(fileSearchText).join(' ')}`.toLowerCase();
          if (query && !groupText.includes(query)) return null;
          return <GuestFiles key={group.key} group={group} onPreview={setPreviewFile} onOrderUpdated={updateOrder} />;
        })}{guestGroups.length === 0 ? <p className="rounded-2xl border border-white/10 bg-[#071522] p-5 text-sm text-slate-500">No guest uploads or guest orders found.</p> : null}</div> : null}
        {tab === 'files' ? <div className="space-y-4"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">Customer artwork</p><h2 className="mt-1 text-2xl font-black">Files organized by customer</h2><p className="mt-1 text-sm text-slate-400">Open a customer to see library uploads and final-production order files together.</p></div><section className="rounded-2xl border border-[#38bdf8]/25 bg-[#071522] p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">Storage safety</p><h3 className="mt-1 text-xl font-black">Supabase archive cleanup</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">Full ordered originals are removed only after the Google Drive copy and Hue preview are both reverified. Abandoned guest uploads are removed after 7 days. Signed-in customer libraries remain live in Supabase and can also be backed up to Drive. Regular cleanup respects the configured long-term Supabase retention period; emergency cleanup skips only that waiting period.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={cleanupBusy} onClick={() => void runStorageCleanup(false)} className="rounded-xl border border-[#38bdf8]/40 bg-[#0b2537] px-4 py-3 text-xs font-black uppercase text-[#8be2ff] hover:bg-[#10334a] disabled:opacity-50">{cleanupBusy ? 'Working...' : 'Archive & clean eligible'}</button><button type="button" disabled={cleanupBusy} onClick={() => void runStorageCleanup(true)} className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-xs font-black uppercase text-amber-200 hover:bg-amber-400/15 disabled:opacity-50">Emergency cleanup now</button></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StorageStat label="Tracked originals" value={String(archiveStats?.trackedFiles ?? 0)} /><StorageStat label="Still in Supabase" value={String(archiveStats?.activeOriginals ?? 0)} detail={fileSize(archiveStats?.activeBytes)} /><StorageStat label="Eligible now" value={String(archiveStats?.eligibleFiles ?? 0)} detail={fileSize(archiveStats?.eligibleBytes)} /><StorageStat label="Already cleaned" value={String(archiveStats?.cleanedFiles ?? 0)} /></div>{cleanupMessage ? <p className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">{cleanupMessage}</p> : null}</section>{customerGroups.map((group) => {
          const groupText = `${group.user.email || ''} ${group.user.user_metadata?.full_name || group.user.user_metadata?.name || ''} ${group.orders.map((order) => order.order_number).join(' ')} ${group.files.map(fileSearchText).join(' ')}`.toLowerCase();
          if (query && !groupText.includes(query)) return null;
          return <CustomerFiles key={group.user.id || group.user.email} user={group.user} orders={group.orders} files={group.files} onPreview={setPreviewFile} />;
        })}{unassignedFiles.length ? <CustomerFiles user={{ email: 'Unassigned / legacy storage' }} orders={[]} files={query ? unassignedFiles.filter((file) => fileSearchText(file).toLowerCase().includes(query)) : unassignedFiles} onPreview={setPreviewFile} /> : null}</div> : null}
        {tab === 'pricing' ? <PricingPanel items={data.pricing} categories={pricingCategories} configured={data.pricingConfigured} sheetPricingConfigured={data.sheetPricingConfigured} drafts={pricingDrafts} sheetDrafts={sheetPricingDrafts} savingKey={savingPricingKey} onDraftChange={(productKey, value) => setPricingDrafts((current) => ({ ...current, [productKey]: value }))} onSheetDraftChange={(productKey, field, value) => setSheetPricingDrafts((current) => ({ ...current, [productKey]: { ...(current[productKey] || { includedPieces: '10', extraPercent: '0.325', maxSurchargePercent: '30' }), [field]: value } }))} onSave={savePricingAdjustment} onSaveAll={saveAllPricingAdjustments} /> : null}
        {tab === 'promos' ? <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]"><form onSubmit={savePromo} className="h-fit rounded-2xl border border-[#38bdf8]/20 bg-[#071522] p-5"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">Create or update</p><h2 className="mt-1 text-xl font-black">Promo code</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><AdminInput label="Code" value={promo.code} onChange={(value) => setPromo((current) => ({ ...current, code: value.toUpperCase() }))} /><AdminInput label="Description" value={promo.description} onChange={(value) => setPromo((current) => ({ ...current, description: value }))} /><label className="text-xs font-bold text-slate-400">Discount type<select value={promo.discount_type} onChange={(event) => setPromo((current) => ({ ...current, discount_type: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-[#02070d] px-3 text-white"><option value="percent">Percent off</option><option value="fixed">Fixed amount</option></select></label><AdminInput label="Discount value" type="number" value={String(promo.discount_value)} onChange={(value) => setPromo((current) => ({ ...current, discount_value: Number(value) }))} /><AdminInput label="Minimum order" type="number" value={promo.minimum_order} onChange={(value) => setPromo((current) => ({ ...current, minimum_order: value }))} /><AdminInput label="Maximum discount" type="number" value={promo.maximum_discount} onChange={(value) => setPromo((current) => ({ ...current, maximum_discount: value }))} /><AdminInput label="Expires" type="date" value={promo.expires_at} onChange={(value) => setPromo((current) => ({ ...current, expires_at: value }))} /><AdminInput label="Maximum uses" type="number" value={promo.max_uses} onChange={(value) => setPromo((current) => ({ ...current, max_uses: value }))} /></div><button disabled={savingPromo} className="mt-5 h-12 w-full rounded-xl bg-[#1686c9] text-sm font-black uppercase hover:bg-[#0f75b5] disabled:opacity-50">{savingPromo ? 'Saving...' : 'Save promo code'}</button></form><AdminList title="Promo codes">{data.promos.map((item) => <Row key={item.id || item.code} title={item.code || 'Code'} detail={`${item.description || 'No description'} · Used ${item.uses_count || 0}${item.max_uses ? ` of ${item.max_uses}` : ''} · ${item.expires_at ? `Expires ${date(item.expires_at)}` : 'No expiration'}`} value={`${item.discount_value || 0}${item.discount_type === 'percent' ? '%' : ' USD'} off${item.active === false ? ' · Inactive' : ''}`} />)}</AdminList></div> : null}
        {tab === 'maintenance' ? <div className="space-y-5"><section className="rounded-2xl border border-red-400/30 bg-[linear-gradient(135deg,rgba(127,29,29,0.28),#071522)] p-5"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-200">Pre-launch maintenance</p><div className="mt-2 flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-black">Reset fake testing data</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Use this before launch, or between heavy test rounds, to wipe customer accounts, orders, payment attempts, guest uploads, saved Image Zone artwork, B2 production originals, Supabase previews, and artwork registries. Referenced test order archives move to Google Drive trash. Pricing, promo codes, product settings, storage containers, and admin access are left alone.</p></div><button type="button" onClick={() => void loadPrelaunchResetPreview()} disabled={resetBusy} className="rounded-xl border border-[#38bdf8]/40 bg-[#0b2537] px-4 py-3 text-xs font-black uppercase text-[#8be2ff] disabled:opacity-50">Refresh preview</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{resetPreviewCards.map(([value, label]) => <StorageStat key={String(label)} label={String(label)} value={String(value)} />)}</div>{resetPreview?.files.length ? <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{resetPreview.files.map((group) => <div key={group.prefix} className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-xs font-black text-white">{group.prefix}</p><p className="mt-1 text-[11px] text-slate-400">{group.count} file{group.count === 1 ? '' : 's'} · {fileSize(group.bytes)}</p></div>)}</div> : <p className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">Load the preview to see what would be deleted.</p>}<div className="mt-5 rounded-2xl border border-red-400/25 bg-red-950/20 p-4"><p className="text-sm font-black text-red-100">This is destructive. Run it only for fake pre-launch/testing data.</p><p className="mt-1 text-xs leading-5 text-red-100/75">B2 originals, Supabase files, accounts, and database records are deleted. Referenced Google Drive archives move to trash. Type <span className="font-black text-white">RESET HUE TEST DATA</span> to enable the reset button.</p><input value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} placeholder="RESET HUE TEST DATA" className="mt-3 h-12 w-full rounded-xl border border-red-300/25 bg-[#02070d] px-4 text-sm text-white outline-none focus:border-red-300" /><button type="button" disabled={resetBusy || resetConfirmation !== 'RESET HUE TEST DATA'} onClick={() => void runPrelaunchReset()} className="mt-3 h-12 w-full rounded-xl bg-red-600 text-sm font-black uppercase text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40">{resetBusy ? 'Resetting...' : 'Permanently delete test data'}</button>{resetMessage ? <p className="mt-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">{resetMessage}</p> : null}</div></section></div> : null}
      </section>
    </div>
    {previewFile?.preview_url ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur" onClick={() => setPreviewFile(null)}>
      <section className="flex max-h-[92vh] w-[min(1100px,96vw)] flex-col overflow-hidden rounded-2xl border border-[#38bdf8]/30 bg-[#071522] shadow-[0_35px_120px_rgba(0,0,0,0.8)]" onClick={(event) => event.stopPropagation()}>
        <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-white">{previewFile.name}</p><p className="mt-1 truncate text-xs text-slate-400">{previewFile.asset_id ? `${previewFile.production_reference || 'Production reference pending'} · ${(previewFile.original_provider || 'cloud').toUpperCase()} production original` : previewFile.path}</p></div><a href={previewFile.preview_url} target="_blank" rel="noreferrer" className="rounded-xl border border-[#38bdf8]/35 bg-[#0c2a40] px-4 py-2 text-xs font-black text-[#9be8ff]">Open preview</a><button type="button" onClick={() => setPreviewFile(null)} className="rounded-xl border border-white/15 px-4 py-2 text-xs font-bold text-slate-300">Close</button></header>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[linear-gradient(45deg,#111827_25%,transparent_25%),linear-gradient(-45deg,#111827_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#111827_75%),linear-gradient(-45deg,transparent_75%,#111827_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0] p-5"><img src={previewFile.preview_url} alt={previewFile.name || 'Artwork preview'} className="max-h-[76vh] max-w-full object-contain shadow-2xl" /></div>
      </section>
    </div> : null}
  </main>;
}

function PricingPanel({ items, categories, configured, sheetPricingConfigured, drafts, sheetDrafts, savingKey, onDraftChange, onSheetDraftChange, onSave, onSaveAll }: { items: AdminPricing[]; categories: string[]; configured: boolean; sheetPricingConfigured: boolean; drafts: Record<string, string>; sheetDrafts: Record<string, SheetPricingDraft>; savingKey: string; onDraftChange: (productKey: string, value: string) => void; onSheetDraftChange: (productKey: string, field: keyof SheetPricingDraft, value: string) => void; onSave: (item: AdminPricing, percentage?: number) => Promise<void>; onSaveAll: () => Promise<void> }) {
  return <div className="space-y-5">
    <section className="rounded-2xl border border-[#38bdf8]/20 bg-[linear-gradient(135deg,#071522,#082238)] p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff]">Studio pricing controls</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-black">Price from the master Hue API</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Set the percentage of the current master retail price charged in Hue Studio. Use <strong className="text-white">100%</strong> for standard pricing or <strong className="text-white">80%</strong> for 20% off. Future master API price changes still flow through automatically.</p></div><div className="flex flex-col items-end gap-3"><PricingLegend /><button type="button" disabled={!configured || Boolean(savingKey)} onClick={() => void onSaveAll()} className="h-11 rounded-xl bg-[#22c55e] px-5 text-xs font-black uppercase text-white shadow-[0_0_22px_rgba(34,197,94,0.18)] hover:bg-[#16a34a] disabled:cursor-not-allowed disabled:opacity-40">{savingKey === '__all__' ? 'Saving all...' : 'Apply all changes'}</button></div></div>
    </section>
    {!configured ? <section className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.07] p-5 text-sm leading-6 text-amber-100">Run <strong>supabase/hue-studio-pricing-adjustments.sql</strong> in the Supabase SQL Editor, then refresh. Until then, the storefront safely uses 100% of every master price.</section> : null}
    {configured && !sheetPricingConfigured ? <section className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.07] p-5 text-sm leading-6 text-amber-100">Run <strong>supabase/hue-studio-sheet-density-pricing.sql</strong> in the Supabase SQL Editor, then refresh to enable the full-sheet controls. Until then, Hue Studio uses the safe built-in defaults.</section> : null}
    {categories.map((category) => <section key={category} className="overflow-hidden rounded-2xl border border-white/10 bg-[#071522]"><header className="border-b border-white/10 px-5 py-4"><h3 className="text-lg font-black">{category}</h3></header><div className="grid gap-px bg-white/10 lg:grid-cols-2">{items.filter((item) => item.category === category).map((item) => {
      const draft = drafts[item.productKey] ?? String(item.percentage);
      const percentage = Number(draft);
      const validPercentage = Number.isFinite(percentage) ? percentage : item.percentage;
      const effect = validPercentage === 100 ? 'Standard master price' : validPercentage < 100 ? `${Math.round((100 - validPercentage) * 100) / 100}% lower than master` : `${Math.round((validPercentage - 100) * 100) / 100}% above master`;
      const sheetDraft = sheetDrafts[item.productKey] || { includedPieces: '10', extraPercent: '0.325', maxSurchargePercent: '30' };
      return <div key={item.productKey} className="bg-[#071522] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black text-white">{item.displayName}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.sourceLabel || item.productKey}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${validPercentage === 100 ? 'bg-slate-400/10 text-slate-300' : validPercentage < 100 ? 'bg-green-400/10 text-green-300' : 'bg-amber-300/10 text-amber-200'}`}>{effect}</span></div>
        <div className="mt-4 flex flex-wrap items-end gap-2"><label className="min-w-44 flex-1 text-xs font-bold text-slate-400">Master price percentage<div className="relative mt-1"><input type="number" min="0" max="200" step="0.01" value={draft} disabled={savingKey === '__all__'} onChange={(event) => onDraftChange(item.productKey, event.target.value)} className="h-11 w-full rounded-xl border border-white/15 bg-[#02070d] px-3 pr-8 text-base font-black text-white outline-none focus:border-[#38bdf8] disabled:opacity-50" /><span className="pointer-events-none absolute right-3 top-3 text-sm font-black text-slate-500">%</span></div></label><button type="button" disabled={Boolean(savingKey)} onClick={() => void onSave(item)} className="h-11 rounded-xl bg-[#1686c9] px-4 text-xs font-black uppercase hover:bg-[#0f75b5] disabled:opacity-50">{savingKey === item.productKey ? 'Saving' : 'Save'}</button><button type="button" disabled={Boolean(savingKey)} onClick={() => { onDraftChange(item.productKey, '100'); void onSave(item, 100); }} className="h-11 rounded-xl border border-white/15 px-3 text-xs font-bold text-slate-300 hover:bg-white/[0.05] disabled:opacity-50">Reset</button></div>
        {item.isSheetPriced ? <div className="mt-4 rounded-xl border border-[#38bdf8]/20 bg-[#04101b] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#67d8ff]">Full-sheet density pricing</p><p className="mt-1 text-xs leading-5 text-slate-400">The base sheet includes the first pieces. Each additional piece adds a small handling percentage, up to the cap.</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><SheetPricingInput label="Pieces included" value={sheetDraft.includedPieces} min="1" max="10000" step="1" suffix="pcs" disabled={Boolean(savingKey)} onChange={(value) => onSheetDraftChange(item.productKey, 'includedPieces', value)} /><SheetPricingInput label="Extra per piece" value={sheetDraft.extraPercent} min="0" max="100" step="0.001" suffix="%" disabled={Boolean(savingKey)} onChange={(value) => onSheetDraftChange(item.productKey, 'extraPercent', value)} /><SheetPricingInput label="Maximum surcharge" value={sheetDraft.maxSurchargePercent} min="0" max="500" step="0.1" suffix="%" disabled={Boolean(savingKey)} onChange={(value) => onSheetDraftChange(item.productKey, 'maxSurchargePercent', value)} /></div><p className="mt-3 text-[10px] leading-4 text-amber-100/75">Default example: 98 pieces on one $140 sheet adds about $40 in density handling.</p></div> : null}
        {item.updatedAt ? <p className="mt-3 text-[10px] text-slate-600">Last saved {date(item.updatedAt)}</p> : null}
      </div>;
    })}</div></section>)}
  </div>;
}
function SheetPricingInput({ label, value, min, max, step, suffix, disabled, onChange }: { label: string; value: string; min: string; max: string; step: string; suffix: string; disabled: boolean; onChange: (value: string) => void }) { return <label className="text-[11px] font-bold text-slate-400">{label}<div className="relative mt-1"><input type="number" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-white/15 bg-[#02070d] px-3 pr-10 font-black text-white outline-none focus:border-[#38bdf8] disabled:opacity-50" /><span className="pointer-events-none absolute right-3 top-3 text-[10px] font-black text-slate-500">{suffix}</span></div></label>; }
function PricingLegend() { return <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase"><span className="rounded-full bg-slate-400/10 px-3 py-1.5 text-slate-300">100% standard</span><span className="rounded-full bg-green-400/10 px-3 py-1.5 text-green-300">80% = 20% off</span><span className="rounded-full bg-amber-300/10 px-3 py-1.5 text-amber-200">110% = 10% above</span></div>; }
function StorageStat({ label, value, detail }: { label: string; value: string; detail?: string }) { return <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-white">{value}</p>{detail ? <p className="mt-1 text-xs font-bold text-[#67d8ff]">{detail}</p> : null}</div>; }
function AdminList({ title, children }: { title: string; children: ReactNode }) { return <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#071522]"><div className="border-b border-white/10 px-5 py-4"><h2 className="text-lg font-black">{title}</h2></div><div className="divide-y divide-white/10">{children || <p className="p-5 text-sm text-slate-500">Nothing to show yet.</p>}</div></div>; }
function Row({ title, detail, value }: { title: string; detail: string; value: string }) { return <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-white">{title}</p><p className="mt-1 break-all text-xs leading-5 text-slate-400">{detail}</p></div><p className="text-xs font-bold text-[#8be3ff]">{value}</p></div>; }
function CustomerRow({ user, orders, files, onPreview, onOrderUpdated }: { user: AdminUser; orders: AdminOrder[]; files: AdminFile[]; onPreview: (file: AdminFile) => void; onOrderUpdated: (order: AdminOrder) => void }) {
  const [open, setOpen] = useState(false);
  const name = user.user_metadata?.full_name || user.user_metadata?.name;
  return <div className="px-5 py-4">
    <button type="button" onClick={() => setOpen((current) => !current)} className="flex w-full flex-wrap items-start justify-between gap-3 text-left">
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-white">{name || user.email || 'Customer'}</p><p className="mt-1 break-all text-xs leading-5 text-slate-400">{name ? `${user.email} · ` : ''}Created ${date(user.created_at)} · Last sign-in ${date(user.last_sign_in_at)}</p></div>
      <div className="text-right"><p className="text-xs font-black text-[#8be3ff]">{orders.length} order{orders.length === 1 ? '' : 's'} · {files.length} file{files.length === 1 ? '' : 's'}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{open ? 'Close customer' : 'Open customer'}</p></div>
    </button>
    {open ? <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
      <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#67d8ff]">Orders</p>{orders.length ? <div className="overflow-hidden rounded-xl border border-white/10 bg-[#030b13] divide-y divide-white/10">{orders.map((order) => <OrderRow key={order.id || order.order_number} order={order} files={files} onPreview={onPreview} onOrderUpdated={onOrderUpdated} />)}</div> : <p className="rounded-xl border border-white/10 bg-[#030b13] p-4 text-xs text-slate-500">No submitted orders for this customer yet.</p>}</div>
      <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#67d8ff]">All customer files</p>{files.length ? <div className="overflow-hidden rounded-xl border border-white/10 bg-[#030b13] divide-y divide-white/10">{files.map((file, index) => <FileRow key={file.id || file.path || `${file.name}-${index}`} file={file} onPreview={() => onPreview(file)} />)}</div> : <p className="rounded-xl border border-white/10 bg-[#030b13] p-4 text-xs text-slate-500">No artwork files found.</p>}</div>
    </div> : null}
  </div>;
}
function GuestFiles({ group, onPreview, onOrderUpdated }: { group: GuestGroupData; onPreview: (file: AdminFile) => void; onOrderUpdated: (order: AdminOrder) => void }) {
  const [open, setOpen] = useState(false);
  return <section className="overflow-hidden rounded-2xl border border-amber-300/20 bg-[#071522]">
    <button type="button" onClick={() => setOpen((current) => !current)} className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.03]">
      <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-amber-300/15 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-amber-200">Guest</span><p className="text-base font-black text-white">{group.label}</p></div><p className="mt-1 text-xs text-slate-400">{group.detail}</p></div>
      <div className="text-right"><p className="text-xs font-black text-[#8be3ff]">{group.orders.length} order{group.orders.length === 1 ? '' : 's'} · {group.files.length} file{group.files.length === 1 ? '' : 's'}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{open ? 'Close guest session' : 'Open guest session'}</p></div>
    </button>
    {open ? <div className="space-y-4 border-t border-white/10 p-4">
      <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#67d8ff]">Guest orders</p>{group.orders.length ? <div className="overflow-hidden rounded-xl border border-white/10 bg-[#030b13] divide-y divide-white/10">{group.orders.map((order) => <OrderRow key={order.id || order.order_number} order={order} files={group.files} onPreview={onPreview} onOrderUpdated={onOrderUpdated} />)}</div> : <p className="rounded-xl border border-white/10 bg-[#030b13] p-4 text-xs text-slate-500">Artwork uploaded, but no order has been submitted from this guest session.</p>}</div>
      <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#67d8ff]">Guest files</p>{group.files.length ? <div className="overflow-hidden rounded-xl border border-white/10 bg-[#030b13] divide-y divide-white/10">{group.files.map((file, index) => <FileRow key={file.id || file.path || `${file.name}-${index}`} file={file} onPreview={() => onPreview(file)} />)}</div> : <p className="rounded-xl border border-white/10 bg-[#030b13] p-4 text-xs text-slate-500">No stored artwork files were found for this guest order.</p>}</div>
    </div> : null}
  </section>;
}
function CustomerFiles({ user, orders, files, onPreview }: { user: AdminUser; orders: AdminOrder[]; files: AdminFile[]; onPreview: (file: AdminFile) => void }) {
  const [open, setOpen] = useState(false);
  if (!files.length && !orders.length) return null;
  const name = user.user_metadata?.full_name || user.user_metadata?.name;
  return <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#071522]">
    <button type="button" onClick={() => setOpen((current) => !current)} className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.03]">
      <div><p className="text-base font-black text-white">{name || user.email || 'Customer'}</p>{name ? <p className="mt-1 text-xs text-slate-400">{user.email}</p> : null}</div>
      <div className="text-right"><p className="text-xs font-black text-[#8be3ff]">{files.length} file{files.length === 1 ? '' : 's'} · {orders.length} order{orders.length === 1 ? '' : 's'}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{open ? 'Hide files' : 'View files'}</p></div>
    </button>
    {open ? <div className="divide-y divide-white/10 border-t border-white/10">{files.map((file, index) => <FileRow key={file.id || file.path || `${file.name}-${index}`} file={file} onPreview={() => onPreview(file)} />)}</div> : null}
  </section>;
}
function OrderRow({ order, files, onPreview, onOrderUpdated }: { order: AdminOrder; files: AdminFile[]; onPreview: (file: AdminFile) => void; onOrderUpdated: (order: AdminOrder) => void }) {
  const [open, setOpen] = useState(false);
  const [printavoStatus, setPrintavoStatus] = useState<'not_added' | 'added'>(order.printavo_status === 'added' ? 'added' : 'not_added');
  const [printavoOrderNumber, setPrintavoOrderNumber] = useState(order.printavo_order_number || '');
  const [savingPrintavo, setSavingPrintavo] = useState(false);
  const [printavoMessage, setPrintavoMessage] = useState('');
  const [savingDrive, setSavingDrive] = useState(false);
  const [driveMessage, setDriveMessage] = useState('');
  useEffect(() => {
    setPrintavoStatus(order.printavo_status === 'added' ? 'added' : 'not_added');
    setPrintavoOrderNumber(order.printavo_order_number || '');
  }, [order.printavo_status, order.printavo_order_number]);
  const items = order.order_data?.items || [];
  const artworkCount = items.reduce((total, item) => total + (item.productionBreakdown?.length || 0), 0);
  const previewFor = (storagePath?: string, fallback?: string) => files.find((file) => storagePath && file.path === storagePath)?.preview_url || fallback;
  const customer = order.order_data?.customer;
  const fulfillment = order.order_data?.fulfillment;
  const address = fulfillment?.address;
  const subtotal = order.subtotal ?? order.order_data?.subtotal ?? order.total ?? order.order_data?.total ?? 0;
  const discount = order.discount ?? order.order_data?.promotion?.discountAmount ?? 0;
  const shipping = order.shipping ?? order.order_data?.shipping?.amount ?? 0;
  const tax = order.tax ?? order.order_data?.tax?.amount ?? 0;
  const total = order.total ?? order.order_data?.total ?? 0;
  const currency = order.currency || order.order_data?.currency || 'USD';
  const savePrintavo = async () => {
    if (!order.id) return;
    setSavingPrintavo(true);
    setPrintavoMessage('');
    const response = await fetch('/api/admin/orders/printavo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id, printavoStatus, printavoOrderNumber }) });
    const payload = await response.json().catch(() => ({})) as { order?: AdminOrder; error?: string };
    if (!response.ok || !payload.order) setPrintavoMessage(payload.error || 'Could not update Printavo tracking.');
    else {
      onOrderUpdated(payload.order);
      setPrintavoMessage(printavoStatus === 'added' ? 'Recorded as added to Printavo.' : 'Returned to the Not added list.');
    }
    setSavingPrintavo(false);
  };
  const archiveToDrive = async () => {
    if (!order.id) return;
    setSavingDrive(true);
    setDriveMessage('');
    try {
      const response = await fetch('/api/admin/orders/drive-archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id }) });
      const payload = await response.json().catch(() => ({})) as { order?: AdminOrder; error?: string };
      if (!response.ok || !payload.order) setDriveMessage(payload.error || 'Could not archive this order to Google Drive.');
      else { onOrderUpdated(payload.order); setDriveMessage('Production files archived to Google Drive.'); }
    } catch { setDriveMessage('Could not reach the Google Drive archive service.'); }
    finally { setSavingDrive(false); }
  };
  const driveStatus = order.drive_archive_status || 'pending';
  const driveBadge = driveStatus === 'archived' ? 'bg-green-400/15 text-green-300' : driveStatus === 'failed' ? 'bg-red-400/15 text-red-300' : driveStatus === 'processing' ? 'bg-sky-400/15 text-sky-200' : driveStatus === 'not_configured' ? 'bg-slate-400/15 text-slate-300' : 'bg-amber-300/15 text-amber-200';
  return <div className="px-5 py-4">
    <button type="button" onClick={() => setOpen((current) => !current)} className="flex w-full flex-wrap items-start justify-between gap-3 text-left">
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-white">{order.order_number || 'Order'}</p><p className="mt-1 break-all text-xs leading-5 text-slate-400">{order.customer_name || 'Customer'} · {order.customer_email || 'No email'} · {date(order.created_at)}</p></div>
      <div className="text-right"><p className="text-xs font-bold text-[#8be3ff]">{money(order.total, order.currency)} · {order.status || 'received'}</p><div className="mt-1 flex flex-wrap justify-end gap-1"><span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase ${order.printavo_status === 'added' ? 'bg-green-400/15 text-green-300' : 'bg-amber-300/15 text-amber-200'}`}>{order.printavo_status === 'added' ? 'Added to Printavo' : 'Not added to Printavo'}</span><span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase ${driveBadge}`}>Drive: {driveStatus.replace('_', ' ')}</span></div><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{open ? 'Hide details' : `View ${artworkCount || ''} artwork detail${artworkCount === 1 ? '' : 's'}`}</p></div>
    </button>
    {open ? <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
      <section className={`rounded-xl border p-4 ${printavoStatus === 'added' ? 'border-green-400/20 bg-green-400/[0.05]' : 'border-amber-300/20 bg-amber-300/[0.05]'}`}>
        <div className="flex flex-wrap items-end gap-3"><div className="min-w-52 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#67d8ff]">Printavo workflow</p><p className="mt-1 text-xs text-slate-400">Track whether this Hue order has been entered into Printavo manually.</p></div><label className="text-xs font-bold text-slate-300">Tracking status<select value={printavoStatus} onChange={(event) => setPrintavoStatus(event.target.value === 'added' ? 'added' : 'not_added')} className="mt-1 block h-10 min-w-48 rounded-xl border border-white/15 bg-[#02070d] px-3 text-white outline-none focus:border-[#38bdf8]"><option value="not_added">Not added</option><option value="added">Added to Printavo</option></select></label><label className="min-w-52 flex-1 text-xs font-bold text-slate-300">Printavo order number (optional)<input value={printavoOrderNumber} onChange={(event) => setPrintavoOrderNumber(event.target.value)} placeholder="Example: 12345" className="mt-1 h-10 w-full rounded-xl border border-white/15 bg-[#02070d] px-3 text-white outline-none focus:border-[#38bdf8]" /></label><button type="button" disabled={savingPrintavo || !order.id} onClick={() => void savePrintavo()} className="h-10 rounded-xl bg-[#1686c9] px-4 text-xs font-black uppercase text-white disabled:opacity-50">{savingPrintavo ? 'Saving...' : 'Save tracking'}</button></div>
        {order.printavo_added_at && order.printavo_status === 'added' ? <p className="mt-2 text-[10px] text-green-300">Marked added {date(order.printavo_added_at)}{order.printavo_order_number ? ` · Printavo #${order.printavo_order_number}` : ''}</p> : null}{printavoMessage ? <p className={`mt-2 text-xs ${printavoMessage.startsWith('Could') ? 'text-red-300' : 'text-green-300'}`}>{printavoMessage}</p> : null}
      </section>
      <section className={`rounded-xl border p-4 ${driveStatus === 'archived' ? 'border-green-400/20 bg-green-400/[0.05]' : driveStatus === 'failed' ? 'border-red-400/20 bg-red-400/[0.05]' : 'border-sky-400/20 bg-sky-400/[0.04]'}`}>
        <div className="flex flex-wrap items-center gap-3"><div className="min-w-52 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#67d8ff]">Production Drive archive</p><p className="mt-1 text-xs text-slate-400">Supabase stores the order record and previews, Backblaze B2 holds the active production original, and Google Drive is the verified long-term production archive. Archive retries never block checkout.</p><p className="mt-2 text-[11px] text-slate-300">Status: <strong className="uppercase text-white">{driveStatus.replace('_', ' ')}</strong> · Attempts: {order.drive_archive_attempts || 0}{order.drive_archived_at ? ` · Archived ${date(order.drive_archived_at)}` : ''}</p>{order.drive_archive_error ? <p className="mt-2 break-words text-xs text-red-300">{order.drive_archive_error}</p> : null}{driveMessage ? <p className={`mt-2 text-xs ${driveMessage.startsWith('Production') ? 'text-green-300' : 'text-red-300'}`}>{driveMessage}</p> : null}</div>{order.drive_folder_url ? <a href={order.drive_folder_url} target="_blank" rel="noreferrer" className="h-10 rounded-xl border border-[#38bdf8]/40 px-4 py-3 text-xs font-black uppercase text-[#8be3ff]">Open Drive folder</a> : null}<button type="button" disabled={savingDrive || !order.id} onClick={() => void archiveToDrive()} className="h-10 rounded-xl bg-[#1686c9] px-4 text-xs font-black uppercase text-white disabled:opacity-50">{savingDrive ? 'Archiving...' : driveStatus === 'archived' ? 'Archive again' : driveStatus === 'failed' ? 'Retry archive' : 'Archive now'}</button></div>
      </section>
      <div className="grid gap-3 xl:grid-cols-3">
        <section className="rounded-xl border border-white/10 bg-[#020a12] p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#67d8ff]">Customer</p><div className="mt-3 space-y-1 text-xs leading-5 text-slate-300"><p className="font-black text-white">{customer?.name || order.customer_name || 'Name not provided'}</p>{customer?.organization ? <p>{customer.organization}</p> : null}<p>{customer?.email || order.customer_email || 'No email'}</p><p>{customer?.phone || 'No phone'}</p><p>{customer?.checkoutMode === 'account' || order.customer_user_id ? 'Hue account customer' : 'Guest checkout'}</p><p>Tax exempt: {customer?.taxExempt ? 'Yes — verify form' : 'No'}</p>{customer?.notes ? <p className="mt-2 rounded-lg bg-white/[0.04] p-2 text-amber-100"><span className="font-black">Order notes:</span> {customer.notes}</p> : null}</div></section>
        <section className="rounded-xl border border-white/10 bg-[#020a12] p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#67d8ff]">Fulfillment</p><div className="mt-3 space-y-1 text-xs leading-5 text-slate-300"><p className="font-black text-white">{fulfillment?.method === 'direct_ship' ? 'Direct shipping' : 'Local pickup'}</p>{fulfillment?.method === 'direct_ship' ? <><p>{address?.line1 || 'Address not provided'}</p>{address?.line2 ? <p>{address.line2}</p> : null}<p>{[address?.city, address?.state, address?.postalCode].filter(Boolean).join(', ')}</p></> : <p>Customer will pick up at Hue Graphics.</p>}<p className="pt-2 text-slate-500">Submitted {date(order.created_at)}</p><p className="text-slate-500">Status: {order.status || order.order_data?.status || 'received'}</p><p className="text-slate-500">Payment: {order.payment_status || order.order_data?.payment?.status || order.order_data?.paymentMode || 'Not recorded'}{order.payment_provider ? ` via ${order.payment_provider}` : ''}</p>{order.paypal_order_id || order.order_data?.payment?.paypalOrderId ? <p className="break-all text-slate-500">PayPal order: {order.paypal_order_id || order.order_data?.payment?.paypalOrderId}</p> : null}{order.paypal_capture_id || order.order_data?.payment?.captureId ? <p className="break-all text-slate-500">Capture: {order.paypal_capture_id || order.order_data?.payment?.captureId}</p> : null}{order.paid_at || order.order_data?.payment?.paidAt ? <p className="text-slate-500">Paid: {date(order.paid_at || order.order_data?.payment?.paidAt)}</p> : null}</div></section>
        <section className="rounded-xl border border-green-400/15 bg-[#03130f] p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-green-300">Order totals</p><div className="mt-3 space-y-2 text-xs text-slate-300"><OrderMoney label="Subtotal" value={subtotal} currency={currency} />{discount ? <OrderMoney label={`Discount${order.promo_code || order.order_data?.promotion?.code ? ` (${order.promo_code || order.order_data?.promotion?.code})` : ''}`} value={-discount} currency={currency} /> : null}<OrderMoney label={order.order_data?.shipping?.label || 'Shipping'} value={shipping} currency={currency} /><OrderMoney label={order.order_data?.tax?.label || 'Tax'} value={tax} currency={currency} /><div className="mt-2 flex items-center justify-between border-t border-green-300/20 pt-3 text-base font-black text-green-300"><span>Total</span><span>{money(total, currency)}</span></div></div></section>
      </div>
      {items.length === 0 ? <p className="text-xs text-amber-200">This older order does not contain a structured item breakdown.</p> : items.map((item, itemIndex) => <section key={item.id || `${order.order_number}-item-${itemIndex}`} className="rounded-xl border border-white/10 bg-[#020a12] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-black text-white">Item {itemIndex + 1}: {item.productName || 'Print item'}</p><p className="mt-1 text-xs text-slate-400">{item.sizeLabel || 'Size not listed'} · Total qty {item.quantity || 0}</p></div><span className="rounded-full bg-[#0ea5e9]/15 px-2.5 py-1 text-[10px] font-black uppercase text-[#9be8ff]">Production breakdown</span></div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2"><OrderDetailList title="Selected options" items={item.optionSummary} empty="No option details were recorded for this older item." /><OrderDetailList title="Production notes" items={item.productionSummary} empty="No production notes were recorded." /></div>
        {item.price ? <div className="mt-3 flex flex-wrap gap-2 text-[11px]"><span className="rounded-lg bg-white/[0.05] px-3 py-2 text-slate-300">Item total: <strong className="text-white">{money(item.price.total, item.price.currency || currency)}</strong></span><span className="rounded-lg bg-white/[0.05] px-3 py-2 text-slate-300">Each: <strong className="text-white">{money(item.price.each, item.price.currency || currency)}</strong></span>{item.price.sheetCount ? <span className="rounded-lg bg-white/[0.05] px-3 py-2 text-slate-300">Sheets: <strong className="text-white">{item.price.sheetCount}</strong></span> : null}{item.price.pricePerSheet ? <span className="rounded-lg bg-white/[0.05] px-3 py-2 text-slate-300">Per sheet: <strong className="text-white">{money(item.price.pricePerSheet, item.price.currency || currency)}</strong></span> : null}</div> : null}
        {(item.productionBreakdown || []).length ? <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{item.productionBreakdown?.map((artwork, artworkIndex) => {
          const frontPreview = previewFor(artwork.frontStoragePath, artwork.frontPreviewUrl);
          const backPreview = previewFor(artwork.backStoragePath, artwork.backPreviewUrl);
          const frontFile = files.find((file) => file.path === artwork.frontStoragePath);
          const backFile = files.find((file) => file.path === artwork.backStoragePath);
          return <div key={artwork.id || `${itemIndex}-${artworkIndex}`} className="flex gap-3 rounded-lg border border-[#38bdf8]/25 bg-[#071827] p-2.5">
            <div className="flex shrink-0 gap-1">{frontPreview ? <button type="button" onClick={() => frontFile && onPreview(frontFile)} disabled={!frontFile} className="h-20 w-20 overflow-hidden rounded bg-white"><img src={frontPreview} alt={`${artwork.label || 'Artwork'} front`} className="h-full w-full object-contain" /></button> : <div className="flex h-20 w-20 items-center justify-center rounded border border-dashed border-white/20 text-[9px] text-slate-500">No preview</div>}{backPreview ? <button type="button" onClick={() => backFile && onPreview(backFile)} disabled={!backFile} className="h-20 w-20 overflow-hidden rounded bg-white"><img src={backPreview} alt={`${artwork.label || 'Artwork'} back`} className="h-full w-full object-contain" /></button> : null}</div>
            <div className="min-w-0"><p className="truncate text-xs font-black text-white">{artwork.label || `Artwork set ${artworkIndex + 1}`}</p><p className="mt-1 text-xl font-black text-green-300">Qty {artwork.quantity || 0}</p><p className="mt-1 text-[11px] text-slate-300">{artwork.sizeLabel || item.sizeLabel}</p>{artwork.sheetLabel ? <p className="text-[11px] text-[#9be8ff]">{artwork.sheetLabel}</p> : null}<p className="mt-1 truncate text-[10px] text-slate-500">{artwork.frontName}</p></div>
          </div>;
        })}</div> : <p className="mt-3 text-xs text-amber-200">This item predates the per-artwork quantity breakdown.</p>}
        {(item.artworkFiles || []).length ? <div className="mt-3"><p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Original and final production files</p><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{item.artworkFiles?.map((reference, fileIndex) => {
          const storedFile = files.find((file) => file.path === reference.storagePath);
          const preview = storedFile?.preview_url;
          const isFinal = /final production/i.test(reference.role || '');
          return <button type="button" key={`${reference.storagePath || reference.name}-${fileIndex}`} onClick={() => storedFile && onPreview(storedFile)} disabled={!storedFile?.preview_url} className="flex min-w-0 gap-3 rounded-lg border border-white/10 bg-[#071827] p-2.5 text-left enabled:hover:border-[#38bdf8]/50 disabled:opacity-70">
            {preview ? <img src={preview} alt={reference.name || 'Artwork'} className="h-16 w-16 shrink-0 rounded bg-white object-contain" /> : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-dashed border-white/20 text-[9px] text-slate-500">FILE</div>}
            <div className="min-w-0"><span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase ${isFinal ? 'bg-green-400/15 text-green-300' : 'bg-sky-400/15 text-sky-200'}`}>{isFinal ? 'Final production' : 'Original'}</span><p className="mt-1 truncate text-xs font-black text-white">{reference.name || 'Artwork file'}</p><p className="mt-1 line-clamp-2 break-all text-[10px] text-slate-500">{reference.storagePath || 'No cloud path'}</p></div>
          </button>;
        })}</div></div> : null}
      </section>)}
    </div> : null}
  </div>;
}
function OrderMoney({ label, value, currency }: { label: string; value: number; currency: string }) { return <div className="flex items-center justify-between gap-4"><span>{label}</span><strong className={value < 0 ? 'text-green-300' : 'text-white'}>{money(value, currency)}</strong></div>; }
function OrderDetailList({ title, items, empty }: { title: string; items?: string[]; empty: string }) { return <div className="rounded-lg border border-white/10 bg-[#071827] p-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{title}</p>{items?.length ? <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-300">{items.map((item, index) => <li key={`${title}-${index}`} className="flex gap-2"><span className="text-[#67d8ff]">•</span><span>{item}</span></li>)}</ul> : <p className="mt-2 text-xs text-slate-500">{empty}</p>}</div>; }
function FileRow({ file, onPreview }: { file: AdminFile; onPreview: () => void }) {
  const imageFile = Boolean(file.preview_url);
  const typeLabel = file.metadata?.mimetype?.split('/').pop()?.toUpperCase() || file.name?.split('.').pop()?.toUpperCase() || 'FILE';
  const managedAssetDetail = file.asset_id
    ? `${file.production_reference || 'Production reference pending'} · ${(file.original_provider || 'cloud').toUpperCase()} production original · ${file.derivative_count || 2} optimized previews · ${file.archive_status || 'active'}`
    : '';
  return <div className="grid gap-4 px-4 py-4 sm:grid-cols-[104px_minmax(0,1fr)_auto] sm:items-center sm:px-5">
    {imageFile ? <button type="button" onClick={onPreview} className="group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-[#38bdf8]/25 bg-white shadow-[0_10px_28px_rgba(0,0,0,0.3)]"><img src={file.preview_url} alt={file.name || 'Artwork thumbnail'} loading="lazy" className="h-full w-full object-contain" /><span className="absolute inset-x-0 bottom-0 bg-black/70 py-1 text-[9px] font-black uppercase text-white opacity-0 transition group-hover:opacity-100">View larger</span></button> : <div className="flex h-24 w-24 flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400"><span className="text-xl font-black text-[#67d8ff]">{typeLabel.slice(0, 4)}</span><span className="mt-1 text-[9px] font-bold uppercase">No preview</span></div>}
    <div className="min-w-0"><button type="button" disabled={!imageFile} onClick={onPreview} className="max-w-full truncate text-left text-sm font-black text-white enabled:hover:text-[#67d8ff]">{file.name || 'File'}</button>{managedAssetDetail ? <><p className="mt-1 text-xs font-bold leading-5 text-[#8be3ff]">{managedAssetDetail}</p><p className="text-[11px] leading-5 text-slate-500">Original filename shown · internal storage IDs hidden · {date(file.created_at || file.updated_at)}</p></> : <p className="mt-1 break-all text-xs leading-5 text-slate-400">{file.path || 'Storage root'} · {file.metadata?.mimetype || 'file'} · {date(file.created_at || file.updated_at)}</p>}</div>
    <div className="flex items-center gap-2 sm:flex-col sm:items-end"><p className="text-xs font-bold text-[#8be3ff]">{fileSize(file.metadata?.size)}</p>{imageFile ? <button type="button" onClick={onPreview} className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-[10px] font-black uppercase text-slate-200 hover:border-[#38bdf8]/50">Preview</button> : null}</div>
  </div>;
}
function AdminInput({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="text-xs font-bold text-slate-400">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-[#02070d] px-3 text-white outline-none focus:border-[#38bdf8]" /></label>; }
