export default function HelpPage() {
  return (
    <main className="min-h-screen bg-[#050b12] px-5 py-8 text-slate-100 md:px-8">
      <section className="mx-auto max-w-5xl">
        <a href="/" className="inline-flex rounded-xl border border-white/15 bg-white/[0.05] px-4 py-3 text-xs font-black uppercase tracking-wide text-[#9be8ff] hover:border-[#38bdf8]/60 hover:bg-white/[0.08]">
          ← Back to Hue Studio
        </a>

        <div className="mt-6 overflow-hidden rounded-[28px] border border-[#38bdf8]/25 bg-[radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.22),transparent_34%),linear-gradient(135deg,#071827,#050c14)] shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
          <div className="border-b border-white/10 p-6 md:p-8">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#67d8ff]">Hue Studio Help</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white md:text-5xl">What is Hue Studio?</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
              Hue Studio is a self-service ordering tool for print-ready products from Hue Graphics. You can choose a product, upload or create artwork, review the production setup, see pricing, and send the order details to Hue in one place.
            </p>
          </div>

          <div className="grid gap-4 p-6 md:grid-cols-2 md:p-8">
            <HelpCard title="1. Choose a product" text="Start with banners, yard signs, rigid signs, decals, magnets, apparel, or other print products. The product you choose controls the size, material, and finishing options shown in the builder." />
            <HelpCard title="2. Add artwork" text="Upload finished artwork, import a Canva design, open saved files from Image Zone, or create simple artwork inside Hue Designer. Signed-in customers can keep files in a private Image Zone library." />
            <HelpCard title="3. Review production details" text="The builder shows sizes, quantities, sides, material choices, and product-specific finishing options. For sheet-based products, Hue Studio helps show how many pieces fit on each production sheet." />
            <HelpCard title="4. Check pricing and checkout" text="Pricing is shown before checkout when available. Once submitted, Hue receives the order details and artwork references so we can review and move it toward production." />
          </div>

          <div className="border-t border-white/10 p-6 md:p-8">
            <h2 className="text-2xl font-black text-white">Key features</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                'Image Zone for saved artwork and reusable customer files',
                'Canva import for bringing existing Canva designs into Hue Studio',
                'Hue Designer for quick text, layout, and simple artwork edits',
                'Product builders for banners, signs, decals, magnets, and apparel',
                'Cart and checkout for submitting multiple products together',
                'Hue review before production so obvious artwork/order issues can be caught',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-sm leading-6 text-slate-300">
                  <span className="mr-2 text-[#67d8ff]">•</span>{item}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-amber-300/25 bg-amber-300/[0.07] p-6 md:p-8">
            <h2 className="text-xl font-black text-amber-100">A quick note about artwork</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-amber-50/85">
              Hue Studio is designed around print-ready artwork. Please double-check spelling, size, colors, resolution, and layout before checkout. Hue may contact you if we notice a major issue, but the submitted artwork is what the order is based on.
            </p>
          </div>

          <div className="border-t border-white/10 p-6 md:p-8">
            <h2 className="text-2xl font-black text-white">Need help with a quote or custom request?</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              If you are not sure which product to choose, need full custom design help, or want to submit a more detailed request, use the main Hue Graphics contact form.
            </p>
            <a href="https://www.huegraphics.cc/contact" className="mt-5 inline-flex rounded-xl bg-[#1686c9] px-5 py-4 text-sm font-black uppercase text-white shadow-[0_12px_30px_rgba(14,165,233,0.25)] hover:bg-[#0f75b5]">
              Submit a request
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

function HelpCard({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-[#38bdf8]/18 bg-[#071522] p-5">
      <h2 className="text-lg font-black text-white">{title}</h2>
      <p className="mt-2 text-sm leading-7 text-slate-400">{text}</p>
    </article>
  );
}
