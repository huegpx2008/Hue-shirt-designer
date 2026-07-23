import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeoProduct, SEO_PRODUCTS } from '@/lib/seo-products';
import { absoluteUrl } from '@/lib/seo';

type ProductPageProps = { params: Promise<{ slug: string }> };

export const generateStaticParams = () => SEO_PRODUCTS.map((product) => ({ slug: product.slug }));

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const product = getSeoProduct((await params).slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.description,
    keywords: product.keywords,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { title: `${product.name} | Hue Studio`, description: product.description, url: `/products/${product.slug}` },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const product = getSeoProduct((await params).slug);
  if (!product) notFound();

  const productData = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: product.name,
    description: product.description,
    serviceType: product.name,
    category: product.category,
    provider: { '@type': 'Organization', name: 'Hue Graphics', url: absoluteUrl('/') },
    url: absoluteUrl(`/products/${product.slug}`),
  };

  return (
    <main className="seo-shell">
      <header className="seo-header">
        <Link href="/" className="seo-brand" aria-label="Hue Studio home">
          <img src="/brand/hue-graphics-mark.webp" alt="" width={512} height={512} />
          <span><small>Hue Graphics / Est. 2008</small><strong>Hue Studio</strong></span>
        </Link>
        <Link href="/products" className="seo-header-link">All products</Link>
      </header>
      <article>
        <section className="seo-hero">
          <div>
            <p className="seo-kicker">{product.category} / Online ordering</p>
            <h1>{product.name}</h1>
            <h2>{product.eyebrow}</h2>
            <p>{product.introduction}</p>
            <div className="seo-hero-actions">
              <Link href="/" className="seo-primary-link">Open Hue Studio</Link>
              <Link href="/products" className="seo-secondary-link">Browse all products</Link>
            </div>
          </div>
          <aside className="seo-start-card">
            <p>Choose your starting point</p>
            <ul>
              <li>Upload finished artwork</li>
              <li>Create or edit in Hue Designer</li>
              <li>Import a saved Canva project</li>
              <li>Review product options and pricing</li>
            </ul>
          </aside>
        </section>
        <section className="seo-detail-grid">
          <div>
            <p className="seo-section-label">Product features</p>
            <h2>Built for a clear ordering workflow</h2>
            <ul>{product.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
          </div>
          <div>
            <p className="seo-section-label">Popular uses</p>
            <h2>A practical fit for</h2>
            <ul>{product.bestFor.map((use) => <li key={use}>{use}</li>)}</ul>
          </div>
        </section>
        <section className="seo-callout">
          <p className="seo-kicker">Have artwork or an idea?</p>
          <h2>Give it some Hue.</h2>
          <p>Use Hue Studio to upload, design, check fit and prepare your order online.</p>
          <Link href="/" className="seo-primary-link">Start in Hue Studio</Link>
        </section>
      </article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productData) }} />
    </main>
  );
}
