import type { Metadata } from 'next';
import Link from 'next/link';
import { SEO_PRODUCTS } from '@/lib/seo-products';
import { absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Custom Printing Products',
  description: 'Explore custom banners, yard signs, rigid signs, adhesive vinyl, vehicle magnets, business cards and posters available through Hue Studio.',
  alternates: { canonical: '/products' },
};

export default function ProductsPage() {
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: SEO_PRODUCTS.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: product.name,
      url: absoluteUrl(`/products/${product.slug}`),
    })),
  };

  return (
    <main className="seo-shell">
      <header className="seo-header">
        <Link href="/" className="seo-brand" aria-label="Hue Studio home">
          <img src="/brand/hue-graphics-mark.png" alt="" />
          <span><small>Hue Graphics / Est. 2008</small><strong>Hue Studio</strong></span>
        </Link>
        <Link href="/" className="seo-header-link">Open Hue Studio</Link>
      </header>
      <section className="seo-hero seo-hero--index">
        <div>
          <p className="seo-kicker">Design / Upload / Order</p>
          <h1>Custom printing products</h1>
          <p>Start with finished artwork, make quick changes in Hue Designer, create a simple layout, or import a saved Canva project. Then choose the product and options that fit your job.</p>
          <Link href="/" className="seo-primary-link">Start an order</Link>
        </div>
      </section>
      <section className="seo-product-grid" aria-label="Hue Studio products">
        {SEO_PRODUCTS.map((product) => (
          <article className="seo-product-card" key={product.slug}>
            <p className="seo-card-category">{product.category}</p>
            <h2>{product.name}</h2>
            <p>{product.description}</p>
            <Link href={`/products/${product.slug}`}>View product details <span aria-hidden="true">-&gt;</span></Link>
          </article>
        ))}
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
    </main>
  );
}
