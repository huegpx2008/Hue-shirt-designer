import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Catalog Diagnostics',
  alternates: { canonical: '/catalog-debug' },
  robots: { index: false, follow: false, noarchive: true },
};

export default function CatalogDebugLayout({ children }: { children: React.ReactNode }) {
  return children;
}
