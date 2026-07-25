'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getOrderWorkflowLabel } from '@/lib/order-workflow';

type CustomerSession = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user?: { id?: string; email?: string };
};

type AccountOrderItem = {
  artworkFiles?: unknown[];
  productionBreakdown?: unknown[];
};

type AccountOrder = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status?: string;
  total: number;
  currency: string;
  items: AccountOrderItem[];
};

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zcugxtcbvkrquxeuonop.supabase.co').replace(/\/$/, '');
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_cK1tQvEVsg69SIMrrdLQpQ_Sw2ot5qb';
const CUSTOMER_SESSION_STORAGE_KEY = 'hue-customer-session';
const ORDER_CONFIRMATION_STORAGE_KEY = 'hue-order-confirmation';
const SESSION_REFRESH_BUFFER_MS = 2 * 60 * 1000;

const refreshSession = async (session: CustomerSession) => {
  if (!session.refresh_token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!response.ok) return null;
  const payload = await response.json() as Partial<CustomerSession>;
  if (!payload.access_token) return null;
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || session.refresh_token,
    expires_at: payload.expires_at,
    user: payload.user || session.user,
  } satisfies CustomerSession;
};

const validateSession = async (session: CustomerSession) => {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    cache: 'no-store',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) return { session: null, unauthorized: response.status === 401 || response.status === 403 };
  const user = await response.json() as { id?: string; email?: string };
  return { session: { ...session, user: { ...session.user, ...user } }, unauthorized: false };
};

const formatMoney = (amount: number, currency = 'USD') => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency,
}).format(Number(amount || 0));

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const orderArtworkCount = (order: AccountOrder) => order.items.reduce((total, item) => {
  const artworkFiles = Array.isArray(item.artworkFiles) ? item.artworkFiles.length : 0;
  const productionBreakdown = Array.isArray(item.productionBreakdown) ? item.productionBreakdown.length : 0;
  return total + Math.max(artworkFiles, productionBreakdown);
}, 0);

export default function AccountPage() {
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authStatus, setAuthStatus] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [artworkCount, setArtworkCount] = useState<number | null>(null);
  const [profileUrl, setProfileUrl] = useState('');

  const persistSession = (nextSession: CustomerSession | null) => {
    setSession(nextSession);
    if (nextSession) window.localStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    else window.localStorage.removeItem(CUSTOMER_SESSION_STORAGE_KEY);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'signup') setAuthMode('signup');
    let canceled = false;
    const restore = async () => {
      try {
        const stored = window.localStorage.getItem(CUSTOMER_SESSION_STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored) as CustomerSession;
        if (!parsed.access_token) return;
        const expiresAt = Number(parsed.expires_at || 0) * 1000;
        let active = parsed;
        if (parsed.refresh_token && (!expiresAt || expiresAt <= Date.now() + SESSION_REFRESH_BUFFER_MS)) {
          active = await refreshSession(parsed) || parsed;
        }
        let validation = await validateSession(active);
        if (!validation.session && validation.unauthorized && active.refresh_token) {
          const refreshed = await refreshSession(active);
          if (refreshed) {
            active = refreshed;
            validation = await validateSession(active);
          }
        }
        if (canceled) return;
        if (!validation.session && validation.unauthorized) {
          window.localStorage.removeItem(CUSTOMER_SESSION_STORAGE_KEY);
          setAuthStatus('Your secure session expired. Sign in again; your saved artwork and orders are still safe.');
          return;
        }
        persistSession(validation.session || active);
      } catch {
        if (!canceled) {
          try {
            const stored = window.localStorage.getItem(CUSTOMER_SESSION_STORAGE_KEY);
            const parsed = stored ? JSON.parse(stored) as CustomerSession : null;
            if (parsed?.access_token) setSession(parsed);
          } catch {
            window.localStorage.removeItem(CUSTOMER_SESSION_STORAGE_KEY);
          }
          setAuthStatus('Hue Studio could not verify your session while the connection was unavailable.');
        }
      } finally {
        if (!canceled) setSessionLoading(false);
      }
    };
    void restore();
    return () => { canceled = true; };
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setOrders([]);
      setArtworkCount(null);
      setProfileUrl('');
      return;
    }
    const controller = new AbortController();
    const headers = { Authorization: `Bearer ${session.access_token}` };
    setOrdersLoading(true);
    setOrdersError('');
    void Promise.allSettled([
      fetch('/api/account/orders', { cache: 'no-store', headers, signal: controller.signal }).then(async (response) => {
        const payload = await response.json() as { orders?: AccountOrder[]; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Unable to load order history.');
        setOrders(Array.isArray(payload.orders) ? payload.orders : []);
      }),
      fetch('/api/artwork/library?summary=1', { cache: 'no-store', headers, signal: controller.signal }).then(async (response) => {
        const payload = await response.json() as { count?: number };
        if (response.ok) setArtworkCount(Number(payload.count || 0));
      }),
      fetch('/api/account/profile', { cache: 'no-store', headers, signal: controller.signal }).then(async (response) => {
        const payload = await response.json() as { printavoProfileUrl?: string };
        if (response.ok) setProfileUrl(payload.printavoProfileUrl || '');
      }),
    ]).then((results) => {
      const orderResult = results[0];
      if (orderResult.status === 'rejected' && !controller.signal.aborted) {
        setOrdersError(orderResult.reason instanceof Error ? orderResult.reason.message : 'Unable to load order history.');
      }
    }).finally(() => {
      if (!controller.signal.aborted) setOrdersLoading(false);
    });
    return () => controller.abort();
  }, [session?.access_token]);

  const totalOrderValue = useMemo(() => orders.reduce((total, order) => total + Number(order.total || 0), 0), [orders]);

  const handleAuth = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setAuthStatus('Enter an email and password.');
      return;
    }
    setAuthLoading(true);
    setAuthStatus(authMode === 'signin' ? 'Signing in...' : 'Creating account...');
    try {
      const endpoint = authMode === 'signin'
        ? `${SUPABASE_URL}/auth/v1/token?grant_type=password`
        : `${SUPABASE_URL}/auth/v1/signup`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      const payload = await response.json() as Partial<CustomerSession> & { msg?: string; message?: string; error_description?: string };
      if (!response.ok) throw new Error(payload.error_description || payload.message || payload.msg || 'Sign-in failed. Please check your email and password.');
      if (!payload.access_token) {
        setAuthStatus('Account created! Check your email for a confirmation link, then return here to sign in.');
        setAuthMode('signin');
        return;
      }
      const nextSession: CustomerSession = {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        expires_at: payload.expires_at,
        user: payload.user,
      };
      persistSession(nextSession);
      setPassword('');
      setAuthStatus(`Signed in as ${nextSession.user?.email || normalizedEmail}.`);
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : 'Customer sign-in failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePasswordRecovery = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setAuthStatus('Enter your email and Hue Studio will send a password reset link.');
      return;
    }
    setAuthLoading(true);
    setAuthStatus('Sending Hue Studio reset email...');
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const response = await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const payload = await response.json().catch(() => ({})) as { msg?: string; message?: string; error_description?: string };
      if (!response.ok) throw new Error(payload.error_description || payload.message || payload.msg || 'Hue Studio could not send the reset email.');
      setAuthStatus(`If an account exists for ${normalizedEmail}, Hue Studio sent a password reset link.`);
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : 'Hue Studio could not send the reset email.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    const current = session;
    persistSession(null);
    setAuthStatus('Signed out. Your artwork, orders, and saved cart remain safe.');
    if (!current?.access_token) return;
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${current.access_token}` },
      });
    } catch {
      // Local sign-out is complete even if the remote request is unavailable.
    }
  };

  const openOrder = (order: AccountOrder) => {
    try {
      window.sessionStorage.setItem(ORDER_CONFIRMATION_STORAGE_KEY, JSON.stringify(order));
    } catch {
      // The confirmation page can still find the order from account history.
    }
    window.location.assign(`/order-confirmation?order=${encodeURIComponent(order.orderNumber)}`);
  };

  return <main className="min-h-screen bg-[#050b12] text-slate-100">
    <header className="border-b border-white/10 bg-[#080d14]/95 px-4 py-3 shadow-[0_10px_32px_rgba(0,0,0,0.42)] backdrop-blur md:px-7">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <a href="/" className="flex h-14 w-[min(360px,72vw)] items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-[#050b12] shadow-[0_0_24px_rgba(14,165,233,0.14)]">
          <img src="/brand/hue-studio-logo.webp" alt="Hue Studio" className="h-full w-full object-contain" />
        </a>
        <div className="flex items-center gap-2">
          <a href="/?open=image-zone" className="rounded-xl border border-[#38bdf8]/35 bg-[#0b263d] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-[#c8f2ff] hover:border-[#67d8ff]">Image Zone</a>
          <a href="/" className="rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white hover:border-white/30">Return to Studio</a>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-7xl px-4 py-8 md:px-7 md:py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#62d4ff]">Hue Customer Account</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-white md:text-5xl">My Account</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">Your saved artwork, current order status, and Hue order history—all in one place.</p>
        </div>
        {session ? <button type="button" onClick={() => void handleSignOut()} className="rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-3 text-sm font-black text-red-100 hover:bg-red-500/20">Sign Out</button> : null}
      </div>

      {sessionLoading ? <section className="rounded-3xl border border-[#38bdf8]/25 bg-[#071522]/90 p-10 text-center shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
        <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-[#38bdf8]/20 border-t-[#62d4ff]" />
        <p className="mt-4 text-sm font-bold text-slate-300">Opening your Hue account...</p>
      </section> : session ? <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-3">
          <a href="/?open=image-zone" className="group rounded-2xl border border-[#38bdf8]/25 bg-[linear-gradient(145deg,#0b263d,#07111f)] p-5 shadow-[0_18px_54px_rgba(0,0,0,0.30)] transition hover:-translate-y-0.5 hover:border-[#67d8ff]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#67d8ff]">Saved Artwork</p>
            <p className="mt-3 text-4xl font-black text-white">{artworkCount === null ? '—' : artworkCount}</p>
            <p className="mt-2 text-sm text-slate-300">Open your private Image Zone <span className="text-[#8be3ff]">→</span></p>
          </a>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_18px_54px_rgba(0,0,0,0.24)]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Studio Orders</p>
            <p className="mt-3 text-4xl font-black text-white">{ordersLoading && !orders.length ? '—' : orders.length}</p>
            <p className="mt-2 text-sm text-slate-300">Orders placed through Hue Studio</p>
          </div>
          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.06] p-5 shadow-[0_18px_54px_rgba(0,0,0,0.24)]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">Account Status</p>
            <p className="mt-3 text-2xl font-black text-emerald-300">Active</p>
            <p className="mt-3 truncate text-sm text-slate-300">{session.user?.email || 'Hue customer'}</p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#07111f]/92 shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-5 md:px-7">
              <div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#62d4ff]">Past Orders</p><h2 className="mt-1 text-2xl font-black text-white">Hue Studio order history</h2></div>
              <p className="text-sm font-bold text-slate-400">{orders.length ? `${formatMoney(totalOrderValue)} total` : ''}</p>
            </div>
            <div className="p-4 md:p-6">
              {ordersError ? <p className="mb-4 rounded-xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{ordersError}</p> : null}
              {orders.length ? <div className="grid gap-3">
                {orders.map((order) => <button type="button" key={order.id || order.orderNumber} onClick={() => openOrder(order)} className="group grid w-full gap-3 rounded-2xl border border-white/10 bg-[#02070d]/55 p-4 text-left transition hover:border-[#38bdf8]/50 hover:bg-[#0b263d]/55 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-black text-white">{order.orderNumber}</span><span className="rounded-full border border-[#38bdf8]/25 bg-[#0ea5e9]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#9be6ff]">{getOrderWorkflowLabel(order.status)}</span></div>
                    <p className="mt-2 text-xs text-slate-400">{formatDate(order.createdAt)} · {order.items.length} item{order.items.length === 1 ? '' : 's'} · {orderArtworkCount(order)} artwork file{orderArtworkCount(order) === 1 ? '' : 's'}</p>
                  </div>
                  <div className="sm:text-right"><p className="font-black text-green-300">{formatMoney(order.total, order.currency)}</p><p className="mt-1 text-xs font-bold text-[#8be3ff]">View details →</p></div>
                </button>)}
              </div> : <div className="py-12 text-center"><p className="text-lg font-black text-white">{ordersLoading ? 'Loading your orders...' : 'No Hue Studio orders yet'}</p><p className="mt-2 text-sm text-slate-400">Orders placed with this account will appear here.</p>{!ordersLoading ? <a href="/products" className="mt-5 inline-block rounded-xl bg-[#1686c9] px-5 py-3 text-xs font-black uppercase text-white hover:bg-[#0f75b5]">Browse products</a> : null}</div>}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-[#38bdf8]/20 bg-[#071522]/92 p-6 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#62d4ff]">Quick Actions</p>
              <div className="mt-4 grid gap-3">
                <a href="/?open=image-zone" className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-white hover:border-[#38bdf8]/45 hover:bg-[#0b263d]">Open Image Zone →</a>
                <a href="/products" className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-white hover:border-[#38bdf8]/45 hover:bg-[#0b263d]">Start a new order →</a>
                <a href="/help" className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-white hover:border-[#38bdf8]/45 hover:bg-[#0b263d]">Help &amp; contact Hue →</a>
              </div>
            </div>
            {profileUrl ? <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="block rounded-3xl border border-violet-300/25 bg-[linear-gradient(145deg,rgba(124,58,237,0.20),rgba(14,165,233,0.08))] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.28)] transition hover:border-violet-200">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-200">All Hue Orders</p>
              <p className="mt-3 text-xl font-black text-white">View complete order history →</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">See earlier Hue Graphics quotes, invoices, and order statuses.</p>
            </a> : null}
          </aside>
        </section>
      </div> : <section className="grid overflow-hidden rounded-3xl border border-[#38bdf8]/25 bg-[#07111f]/94 shadow-[0_30px_100px_rgba(0,0,0,0.46)] lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.72fr)]">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.22),transparent_45%),#071522] p-7 lg:border-b-0 lg:border-r lg:p-10">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#62d4ff]">Your Hue Studio account</p>
          <h2 className="mt-3 max-w-xl text-3xl font-black leading-tight text-white md:text-4xl">Keep artwork ready for the next order.</h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">Sign in to reuse artwork, follow order status, open confirmations, and keep your cart connected across your signed-in devices.</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {['Private Image Zone', 'Order tracking', 'Faster reorders'].map((label) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-4 text-sm font-black text-slate-100">{label}</div>)}
          </div>
        </div>
        <div className="p-6 md:p-8 lg:p-10">
          <div className="flex rounded-xl border border-white/10 bg-[#02070d]/65 p-1">
            <button type="button" onClick={() => setAuthMode('signin')} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-black ${authMode === 'signin' ? 'bg-[#1686c9] text-white' : 'text-slate-400 hover:text-white'}`}>Sign In</button>
            <button type="button" onClick={() => setAuthMode('signup')} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-black ${authMode === 'signup' ? 'bg-[#1686c9] text-white' : 'text-slate-400 hover:text-white'}`}>Create Account</button>
          </div>
          <form onSubmit={handleAuth} className="mt-6 space-y-4">
            <label className="block text-sm font-bold text-slate-200">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="mt-2 w-full rounded-xl border border-white/15 bg-[#02070d] px-4 py-3.5 text-white outline-none ring-[#0ea5e9]/40 focus:ring-2" /></label>
            <label className="block text-sm font-bold text-slate-200">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} className="mt-2 w-full rounded-xl border border-white/15 bg-[#02070d] px-4 py-3.5 text-white outline-none ring-[#0ea5e9]/40 focus:ring-2" /></label>
            {authMode === 'signin' ? <button type="button" onClick={() => void handlePasswordRecovery()} disabled={authLoading} className="block w-full text-right text-xs font-black uppercase tracking-[0.14em] text-[#8be3ff] hover:text-white">Forgot password?</button> : null}
            <button type="submit" disabled={authLoading} className="w-full rounded-xl border border-[#0ea5e9]/60 bg-[#1678b8] px-5 py-3.5 text-sm font-black uppercase text-white shadow-[0_0_22px_rgba(14,165,233,0.18)] hover:bg-[#0f5f94] disabled:cursor-wait disabled:opacity-60">{authLoading ? 'Calibrating the login ink...' : authMode === 'signin' ? 'Sign In' : 'Create Account'}</button>
          </form>
          {authStatus ? <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate-300">{authStatus}</p> : null}
          <a href="/" className="mt-5 block text-center text-sm font-bold text-slate-400 hover:text-white">Continue to Hue Studio without signing in</a>
        </div>
      </section>}
    </div>
  </main>;
}
