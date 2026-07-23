import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Custom Printing Products',
  description: 'Browse custom banners, yard signs, rigid signs, decals, magnets, posters, business cards and apparel options available from Hue Graphics.',
  alternates: { canonical: '/products' },
  openGraph: {
    title: 'Custom Printing Products | Hue Studio',
    description: 'Browse custom printing products and choose the right material and ordering path for your project.',
    url: '/products',
  },
};

type CatalogProduct = {
  title: string;
  subtitle: string;
  description: string;
  bestFor: string[];
  status?: string;
};

type CatalogSection = {
  label: string;
  description: string;
  products: CatalogProduct[];
};

const sections: CatalogSection[] = [
  {
    label: 'Banners',
    description: 'Flexible vinyl and mesh banners for events, storefronts, fences, fundraisers, and outdoor advertising.',
    products: [
      {
        title: 'Vinyl Banners',
        subtitle: '13 oz, 15 oz, and 18 oz vinyl options',
        description: 'A strong all-purpose banner product for indoor or outdoor use. Great when you need a large, durable sign that rolls up, travels well, and can be finished with grommets, hems, rope, or other options depending on the setup.',
        bestFor: ['Fundraisers', 'Storefront signs', 'Events', 'Outdoor announcements'],
      },
      {
        title: 'Mesh Banners',
        subtitle: 'Wind-friendly banner material',
        description: 'Mesh banners allow airflow through the material, which makes them useful on fences and outdoor areas where wind can be an issue. They trade some solid-color density for better outdoor handling.',
        bestFor: ['Fence graphics', 'Sports fields', 'Construction sites', 'Windy locations'],
      },
    ],
  },
  {
    label: 'CORO / Yard Signs',
    description: 'Lightweight corrugated plastic signs, commonly used for yard signs, campaign signs, and temporary outdoor signage.',
    products: [
      {
        title: 'CORO Signs',
        subtitle: 'Sheet-based 4mm coroplast',
        description: 'A cost-effective rigid sign option for yard signs and temporary outdoor displays. Hue Studio can show how many signs fit on a production sheet so quantity and pricing are easier to understand.',
        bestFor: ['Yard signs', 'Political signs', 'Directional signs', 'Real estate signs'],
      },
    ],
  },
  {
    label: 'Rigid Signs',
    description: 'Flat panel signs for professional displays, indoor signage, outdoor signage, and durable business graphics.',
    products: [
      {
        title: 'Acrylic Signs',
        subtitle: 'Polished rigid plastic signage',
        description: 'Acrylic gives a clean, premium look. It is often used when the sign needs to feel more polished or dimensional, such as lobby signs, displays, and professional interior graphics.',
        bestFor: ['Lobby signs', 'Office displays', 'Premium indoor signs', 'Dimensional-looking graphics'],
      },
      {
        title: 'ACM / Aluminum Composite',
        subtitle: 'Durable aluminum-faced panels',
        description: 'ACM is a professional panel material with aluminum faces and a solid core. It is a strong choice for long-term business signage and exterior panels.',
        bestFor: ['Outdoor business signs', 'Building signs', 'Parking signs', 'Long-term panels'],
      },
      {
        title: 'PVC Signs',
        subtitle: 'Smooth rigid plastic panels',
        description: 'PVC is a versatile rigid sign material with a smooth surface. It is useful for indoor signs, displays, menus, and some outdoor applications depending on the need.',
        bestFor: ['Indoor signs', 'Displays', 'Menus', 'Trade show graphics'],
      },
      {
        title: 'Foamcore',
        subtitle: 'Lightweight indoor display board',
        description: 'Foamcore is lightweight and easy to display. It is best for indoor, short-term use where a clean presentation matters more than outdoor durability.',
        bestFor: ['Presentations', 'Indoor posters', 'Temporary displays', 'Event boards'],
      },
      {
        title: 'Polystyrene',
        subtitle: 'Thin flexible plastic signage',
        description: 'Polystyrene is a lightweight plastic option that works well for affordable signs, inserts, and flexible display pieces.',
        bestFor: ['Indoor signs', 'Retail inserts', 'Lightweight panels', 'Budget-friendly displays'],
      },
      {
        title: 'Aluminum',
        subtitle: '.040 or .080 metal panels',
        description: 'Aluminum signs are durable metal panels used for outdoor and professional signage. They are a good fit when the sign needs to hold up and look sharp over time.',
        bestFor: ['Parking signs', 'Outdoor signs', 'Industrial labels', 'Long-term business signage'],
      },
    ],
  },
  {
    label: 'Decals',
    description: 'Adhesive vinyl graphics for surfaces, windows, vehicles, products, and general labeling.',
    products: [
      {
        title: 'Adhesive Vinyl Decals',
        subtitle: 'Custom printed vinyl graphics',
        description: 'Vinyl decals are printed graphics with adhesive backing. They can be used for windows, vehicles, walls, equipment, packaging, and other smooth surfaces depending on material and installation needs.',
        bestFor: ['Window graphics', 'Labels', 'Vehicle graphics', 'Surface decals'],
      },
    ],
  },
  {
    label: 'Magnets',
    description: 'Removable magnetic graphics for vehicles, doors, equipment, and displays.',
    products: [
      {
        title: 'Vehicle Magnets',
        subtitle: 'Removable mobile advertising',
        description: 'Vehicle magnets are a removable option for turning a car, truck, or van into temporary advertising. They are useful when permanent vehicle graphics are not the right fit.',
        bestFor: ['Work trucks', 'Delivery vehicles', 'Temporary branding', 'Side-door graphics'],
      },
      {
        title: 'Custom Magnets',
        subtitle: 'Custom sizes and shapes',
        description: 'Custom magnets can be used for display pieces, promotional items, or specialty applications where a removable magnetic graphic makes sense.',
        bestFor: ['Promotions', 'Display magnets', 'Custom shapes', 'Reusable graphics'],
      },
    ],
  },
  {
    label: 'Paper / Small Format',
    description: 'Printed paper products for handouts, cards, posters, promotions, and everyday business materials.',
    products: [
      {
        title: 'Posters',
        subtitle: 'Bright paper posters',
        description: 'Poster printing is useful for announcements, displays, event promotion, and visual communication where a lightweight paper print is the right choice.',
        bestFor: ['Events', 'Retail posters', 'Announcements', 'Indoor displays'],
      },
      {
        title: 'Business Cards',
        subtitle: 'Print-ready card ordering',
        description: 'Business cards are small-format printed cards for contact information, branding, appointments, loyalty programs, and quick handouts.',
        bestFor: ['Business cards', 'Appointment cards', 'Loyalty cards', 'Contact cards'],
      },
      {
        title: 'Handheld Paper',
        subtitle: 'Flyers, postcards, mailers, and handouts',
        description: 'Handheld paper products cover common promotional pieces like flyers, postcards, mailers, menus, and handouts with gloss or matte-style finishing depending on the job.',
        bestFor: ['Flyers', 'Postcards', 'Menus', 'Promotional handouts'],
      },
    ],
  },
  {
    label: 'Apparel',
    description: 'Wearable print products and garment decoration options. Online ordering is still being shaped for this section.',
    products: [
      {
        title: 'Screen Printing',
        subtitle: 'Traditional apparel printing',
        description: 'Screen printing is a strong fit for shirts and apparel runs, especially when designs use spot colors and quantities make setup efficient.',
        bestFor: ['T-shirts', 'Team shirts', 'Event apparel', 'Bulk runs'],
        status: 'Coming soon online',
      },
      {
        title: 'DTG — Direct to Garment',
        subtitle: 'Full-color printing directly on garments',
        description: 'DTG can be useful for full-color artwork, smaller runs, and detailed designs printed directly onto compatible garments.',
        bestFor: ['Full-color shirts', 'Small runs', 'Detailed artwork', 'Photo-style prints'],
        status: 'Coming soon online',
      },
      {
        title: 'DTF — Direct to Film',
        subtitle: 'Full-color heat transfer printing',
        description: 'DTF is a versatile transfer method for full-color graphics and a range of garment types. Online ordering for this is planned but not fully live yet.',
        bestFor: ['Transfers', 'Full-color graphics', 'Small batches', 'Flexible garment options'],
        status: 'Coming soon online',
      },
    ],
  },
];

export default function ProductsPage() {
  return (
    <main className="min-h-screen bg-[#050b12] px-5 py-8 text-slate-100 md:px-8">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center gap-3">
          <a href="/" className="inline-flex rounded-xl border border-white/15 bg-white/[0.05] px-4 py-3 text-xs font-black uppercase tracking-wide text-[#9be8ff] hover:border-[#38bdf8]/60 hover:bg-white/[0.08]">
            ← Back to Hue Studio
          </a>
          <a href="/help" className="inline-flex rounded-xl border border-white/15 bg-white/[0.05] px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-300 hover:border-[#38bdf8]/60 hover:bg-white/[0.08]">
            Help
          </a>
        </div>

        <header className="mt-6 rounded-[28px] border border-[#38bdf8]/25 bg-[radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.22),transparent_34%),linear-gradient(135deg,#071827,#050c14)] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.45)] md:p-8">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#67d8ff]">Hue Graphics Product Catalog</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white md:text-5xl">What can you order through Hue Studio?</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
            This catalog gives a plain-English overview of the main products available through Hue Studio. It is meant to help customers understand which product fits their job before jumping into the order builder.
          </p>
          <a href="/" className="mt-6 inline-flex rounded-xl bg-[#1686c9] px-5 py-4 text-sm font-black uppercase text-white shadow-[0_12px_30px_rgba(14,165,233,0.25)] hover:bg-[#0f75b5]">
            Open Hue Studio
          </a>
        </header>

        <div className="mt-6 space-y-6">
          {sections.map((section) => (
            <section key={section.label} className="overflow-hidden rounded-[24px] border border-white/10 bg-[#071522]">
              <div className="border-b border-white/10 p-5 md:p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#67d8ff]">Product Category</p>
                <h2 className="mt-2 text-2xl font-black text-white">{section.label}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{section.description}</p>
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-2 md:p-6 xl:grid-cols-3">
                {section.products.map((product) => (
                  <article key={`${section.label}-${product.title}`} className="rounded-2xl border border-white/10 bg-white/[0.045] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-black text-white">{product.title}</h3>
                        <p className="mt-1 text-xs font-bold uppercase tracking-wide text-[#8be3ff]">{product.subtitle}</p>
                      </div>
                      {product.status ? <span className="shrink-0 rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-[9px] font-black uppercase text-amber-100">{product.status}</span> : null}
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-400">{product.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {product.bestFor.map((item) => (
                        <span key={item} className="rounded-full border border-[#38bdf8]/20 bg-[#0c2a40]/65 px-2.5 py-1 text-[10px] font-bold text-[#b9efff]">
                          {item}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-6 rounded-[24px] border border-amber-300/25 bg-amber-300/[0.07] p-6">
          <h2 className="text-xl font-black text-amber-100">Not sure which product fits?</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-amber-50/85">
            If your job does not fit neatly into one of these categories, or you need help choosing material, size, finishing, or design setup, send a request through the main Hue Graphics contact form.
          </p>
          <a href="https://www.huegraphics.cc/contact" className="mt-5 inline-flex rounded-xl bg-amber-300 px-5 py-4 text-sm font-black uppercase text-[#271600] hover:bg-amber-200">
            Submit a request
          </a>
        </section>
      </section>
    </main>
  );
}
