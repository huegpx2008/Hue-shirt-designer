'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';

type ConfirmationArtwork = { id?: string; label?: string; quantity?: number; sizeLabel?: string; sheetLabel?: string; frontName?: string; frontPreviewUrl?: string; backName?: string; backPreviewUrl?: string };
type ConfirmationItem = { id?: string; productName?: string; quantity?: number; sizeLabel?: string; price?: { total?: number | null; currency?: string }; productionBreakdown?: ConfirmationArtwork[] };
type ConfirmationOrder = {
  orderNumber: string;
  createdAt: string;
  customer: { name: string; organization?: string; email: string; phone?: string };
  fulfillment: { method: 'pickup' | 'direct_ship'; address?: { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string } };
  items: ConfirmationItem[];
  subtotal: number;
  promotion?: { code?: string; discountAmount?: number };
  shipping?: { amount?: number; label?: string };
  tax: { amount?: number; label?: string };
  total: number;
  currency: string;
};

const CONFIRMATION_KEY = 'hue-order-confirmation';
const ORDER_HISTORY_KEY = 'hue-test-orders';
const money = (value: unknown, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0));
const itemSizeLabel = (item: ConfirmationItem) => {
  const listed = String(item.sizeLabel || '').trim();
  if (listed && !/^0(?:\.0+)?"?\s*x\s*0(?:\.0+)?"?$/i.test(listed)) return listed;
  return item.productionBreakdown?.find((artwork) => artwork.sizeLabel && !/^0(?:\.0+)?"?\s*x\s*0(?:\.0+)?"?$/i.test(artwork.sizeLabel))?.sizeLabel || listed || 'Size not listed';
};

export default function OrderConfirmationPage() {
  const [order, setOrder] = useState<ConfirmationOrder | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const requestedOrder = new URLSearchParams(window.location.search).get('order');
    try {
      const current = JSON.parse(window.sessionStorage.getItem(CONFIRMATION_KEY) || 'null') as ConfirmationOrder | null;
      if (current && (!requestedOrder || current.orderNumber === requestedOrder)) {
        setOrder(current);
        setLoaded(true);
        return;
      }
      const history = JSON.parse(window.localStorage.getItem(ORDER_HISTORY_KEY) || '[]') as ConfirmationOrder[];
      const match = Array.isArray(history) ? history.find((entry) => !requestedOrder || entry.orderNumber === requestedOrder) : null;
      setOrder(match || null);
    } catch {
      setOrder(null);
    }
    setLoaded(true);
  }, []);

  const productionQuantity = useMemo(() => order?.items.reduce((total, item) => total + (item.productionBreakdown?.length ? item.productionBreakdown.reduce((sum, artwork) => sum + Number(artwork.quantity || 0), 0) : Number(item.quantity || 0)), 0) || 0, [order]);

  if (!loaded) return <main className="flex min-h-screen items-center justify-center bg-[#030a12] text-white"><p className="text-sm font-bold text-[#8be8ff]">Loading your order confirmation...</p></main>;

  if (!order) return <main className="flex min-h-screen items-center justify-center bg-[#030a12] p-5 text-white">
    <section className="w-full max-w-xl rounded-3xl border border-[#38bdf8]/25 bg-[#071522] p-8 text-center shadow-[0_35px_120px_rgba(0,0,0,0.7)]">
      <img src="/brand/hue-graphics-mark.webp" alt="Hue Graphics" width={512} height={512} className="mx-auto h-16 w-16 rounded-xl border border-[#38bdf8]/30" />
      <h1 className="mt-5 text-3xl font-black">Order confirmation unavailable</h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">This browser no longer has the submitted order details. The order may still be available in your Hue account or the Studio Admin dashboard.</p>
      <a href="/" className="mt-6 inline-flex rounded-xl bg-[#1686c9] px-6 py-3 text-sm font-black uppercase text-white">Return to Hue Studio</a>
    </section>
  </main>;

  const address = order.fulfillment.address;
  return <main className="min-h-screen bg-[#030a12] text-white print:bg-white print:text-black">
    <header className="border-b border-white/10 bg-[#07111f] px-5 py-4 print:border-slate-300 print:bg-white md:px-8">
      <div className="mx-auto flex max-w-[1280px] items-center gap-4"><img src="/brand/hue-graphics-mark.webp" alt="Hue Graphics" width={512} height={512} className="h-12 w-12 rounded-lg border border-[#38bdf8]/30" /><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#67d8ff] print:text-sky-700">Hue Graphics / Est. 2008</p><p className="text-xl font-black">Hue Studio</p></div><p className="ml-auto hidden text-xs font-bold uppercase tracking-[0.18em] text-slate-500 sm:block">Order confirmation</p></div>
    </header>

    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[28px] border border-[#38bdf8]/25 bg-[#071522] shadow-[0_30px_100px_rgba(0,0,0,0.55),0_0_50px_rgba(14,165,233,0.10)] print:border-slate-300 print:bg-white print:shadow-none">
        <div className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_80%_10%,rgba(14,165,233,0.28),transparent_28%),linear-gradient(135deg,#07111f,#0a263b)] px-6 py-9 text-center print:bg-white sm:px-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-400/15 text-3xl font-black text-emerald-300 print:border-emerald-600 print:text-emerald-700">✓</div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-[#67d8ff] print:text-sky-700">Order successfully submitted</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">Thank you, {order.customer.name.split(' ')[0]}!</h1>
          <p className="mt-3 text-lg font-black text-[#9be8ff] print:text-sky-700">{order.orderNumber}</p>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-300 print:text-slate-600">Your order details and final production artwork have been saved. Hue Graphics will contact you if anything needs attention before production.</p>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Products" value={String(order.items.length)} />
            <Summary label="Pieces to produce" value={String(productionQuantity)} />
            <Summary label="Order total" value={money(order.total, order.currency)} accent />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <InfoCard title="Customer">
              <p className="font-black text-white print:text-black">{order.customer.name}</p>
              {order.customer.organization ? <p>{order.customer.organization}</p> : null}
              <p>{order.customer.email}</p>
              {order.customer.phone ? <p>{order.customer.phone}</p> : null}
            </InfoCard>
            <InfoCard title="Fulfillment">
              <p className="font-black text-white print:text-black">{order.fulfillment.method === 'direct_ship' ? 'US shipping' : 'Local pickup'}</p>
              {order.fulfillment.method === 'direct_ship' ? <><p>{address?.line1}{address?.line2 ? `, ${address.line2}` : ''}</p><p>{address?.city}, {address?.state} {address?.postalCode}</p></> : <p>Hue Graphics will notify you when the order is ready.</p>}
            </InfoCard>
          </div>

          <section className="mt-6">
            <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#67d8ff] print:text-sky-700">Production breakdown</p><h2 className="mt-1 text-2xl font-black">What you ordered</h2></div><p className="text-xs text-slate-500">Submitted {new Date(order.createdAt).toLocaleString()}</p></div>
            <div className="mt-4 space-y-4">{order.items.map((item, itemIndex) => <article key={item.id || itemIndex} className="rounded-2xl border border-white/10 bg-[#020a12]/70 p-4 print:border-slate-300 print:bg-white sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Item {itemIndex + 1}</p><h3 className="mt-1 text-xl font-black">{item.productName || 'Print product'}</h3><p className="mt-1 text-sm text-slate-400">{itemSizeLabel(item)} / Total qty {item.quantity || 0}</p></div><p className="text-lg font-black text-green-300 print:text-green-700">{money(item.price?.total, item.price?.currency || order.currency)}</p></div>
              {(item.productionBreakdown || []).length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{item.productionBreakdown?.map((artwork, artworkIndex) => <div key={artwork.id || artworkIndex} className="flex gap-3 rounded-xl border border-[#38bdf8]/25 bg-[#071827] p-3 print:border-sky-300 print:bg-sky-50">
                <div className="flex shrink-0 gap-1">{artwork.frontPreviewUrl ? <img src={artwork.frontPreviewUrl} alt={`${artwork.label || 'Artwork'} front`} className="h-24 w-24 rounded-lg bg-white object-contain" /> : <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-white/20 text-[10px] text-slate-500">No preview</div>}{artwork.backPreviewUrl ? <img src={artwork.backPreviewUrl} alt={`${artwork.label || 'Artwork'} back`} className="hidden h-24 w-24 rounded-lg bg-white object-contain sm:block" /> : null}</div>
                <div className="min-w-0"><p className="truncate text-sm font-black">{artwork.label || `Artwork set ${artworkIndex + 1}`}</p><p className="mt-1 text-2xl font-black text-green-300 print:text-green-700">Qty {artwork.quantity || 0}</p><p className="mt-2 text-xs text-slate-300 print:text-slate-700">{artwork.sizeLabel || itemSizeLabel(item)}</p>{artwork.sheetLabel ? <p className="mt-1 text-xs font-bold text-[#9be8ff] print:text-sky-700">{artwork.sheetLabel}</p> : null}<p className="mt-2 truncate text-[10px] text-slate-500">{artwork.frontName}</p></div>
              </div>)}</div> : null}
            </article>)}</div>
          </section>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5 print:border-slate-300 print:bg-white">
            <div className="ml-auto max-w-md space-y-2 text-sm"><TotalLine label="Subtotal" value={money(order.subtotal, order.currency)} />{order.promotion?.code ? <TotalLine label={`Promo ${order.promotion.code}`} value={`-${money(order.promotion.discountAmount, order.currency)}`} green /> : null}<TotalLine label={order.shipping?.label || 'Shipping'} value={money(order.shipping?.amount, order.currency)} /><TotalLine label={order.tax.label || 'Tax'} value={money(order.tax.amount, order.currency)} /><div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-xl font-black print:border-slate-300"><span>Total</span><span className="text-green-300 print:text-green-700">{money(order.total, order.currency)}</span></div></div>
          </div>

          <div className="mt-7 flex flex-wrap justify-center gap-3 print:hidden"><a href="/" className="rounded-xl bg-[#1686c9] px-6 py-3 text-sm font-black uppercase text-white hover:bg-[#0f75b5]">Start another order</a><a href="/?open=account" className="rounded-xl border border-[#38bdf8]/35 bg-[#0c2a40] px-6 py-3 text-sm font-black uppercase text-[#c8f2ff] hover:border-[#67d8ff]">View my account</a><button type="button" onClick={() => window.print()} className="rounded-xl border border-white/15 px-6 py-3 text-sm font-bold uppercase text-slate-300 hover:border-white/30">Print confirmation</button></div>
        </div>
      </section>
    </div>
  </main>;
}

function Summary({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center print:border-slate-300 print:bg-white"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p><p className={`mt-2 text-2xl font-black ${accent ? 'text-green-300 print:text-green-700' : 'text-white print:text-black'}`}>{value}</p></div>; }
function InfoCard({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-sm leading-6 text-slate-300 print:border-slate-300 print:bg-white print:text-slate-700"><p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#67d8ff] print:text-sky-700">{title}</p>{children}</section>; }
function TotalLine({ label, value, green = false }: { label: string; value: string; green?: boolean }) { return <div className={`flex items-center justify-between gap-4 ${green ? 'font-bold text-emerald-300 print:text-emerald-700' : 'text-slate-300 print:text-slate-700'}`}><span>{label}</span><span>{value}</span></div>; }
