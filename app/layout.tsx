import type { Metadata } from 'next';
import { absoluteUrl, ALLOW_INDEXING, SITE_URL } from '@/lib/seo';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Hue Studio | Design, Upload & Order Custom Printing',
    template: '%s | Hue Studio',
  },
  description: 'Create, upload or import artwork, then order custom banners, yard signs, rigid signs, magnets, decals, business cards and more from Hue Graphics.',
  applicationName: 'Hue Studio',
  alternates: { canonical: '/' },
  icons: { icon: '/brand/hue-graphics-mark.png', apple: '/brand/hue-graphics-mark.png' },
  robots: {
    index: ALLOW_INDEXING,
    follow: ALLOW_INDEXING,
    googleBot: { index: ALLOW_INDEXING, follow: ALLOW_INDEXING },
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Hue Studio by Hue Graphics',
    title: 'Hue Studio | Design, Upload & Order Custom Printing',
    description: 'Upload finished artwork, make quick changes, create a simple design or import from Canva, then choose a product and order online.',
    images: [{ url: '/brand/hue-graphics-mark.png', width: 512, height: 512, alt: 'Hue Graphics' }],
  },
  twitter: {
    card: 'summary',
    title: 'Hue Studio | Design, Upload & Order Custom Printing',
    description: 'Design, upload and order custom printed products online from Hue Graphics.',
    images: ['/brand/hue-graphics-mark.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const organizationData = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Hue Graphics',
    url: SITE_URL,
    logo: absoluteUrl('/brand/hue-graphics-mark.png'),
  };

  return (
    <html lang="en">
      <body>
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationData) }} />
      </body>
    </html>
  );
}
