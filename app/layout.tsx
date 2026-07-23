import type { Metadata, Viewport } from 'next';
import { absoluteUrl, ALLOW_INDEXING, SITE_URL } from '@/lib/seo';
import './globals.css';

const siteDescription = 'Create, upload or import artwork, then order custom banners, yard signs, rigid signs, magnets, decals, business cards and more from Hue Graphics.';
const socialImage = '/brand/hue-studio-social.webp';
const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Hue Studio | Design, Upload & Order Custom Printing',
    template: '%s | Hue Studio',
  },
  description: siteDescription,
  applicationName: 'Hue Studio',
  alternates: { canonical: '/' },
  manifest: '/manifest.webmanifest',
  icons: { icon: '/brand/hue-graphics-icon.png', apple: '/brand/hue-graphics-icon.png' },
  verification: googleSiteVerification ? { google: googleSiteVerification } : undefined,
  robots: {
    index: ALLOW_INDEXING,
    follow: ALLOW_INDEXING,
    googleBot: {
      index: ALLOW_INDEXING,
      follow: ALLOW_INDEXING,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    url: '/',
    locale: 'en_US',
    siteName: 'Hue Studio by Hue Graphics',
    title: 'Hue Studio | Design, Upload & Order Custom Printing',
    description: siteDescription,
    images: [{ url: socialImage, width: 1200, height: 630, alt: 'Hue Studio by Hue Graphics — design, upload and order custom printing' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hue Studio | Design, Upload & Order Custom Printing',
    description: siteDescription,
    images: [socialImage],
  },
};

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#050b12',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const organizationId = `${absoluteUrl('/')}#organization`;
  const websiteId = `${absoluteUrl('/')}#website`;
  const organizationData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['Organization', 'LocalBusiness'],
        '@id': organizationId,
        name: 'Hue Graphics',
        url: process.env.HUE_WEBSITE_URL || 'https://www.huegraphics.cc',
        logo: {
          '@type': 'ImageObject',
          url: absoluteUrl('/brand/hue-graphics-icon.png'),
          width: 512,
          height: 512,
        },
        email: process.env.HUE_CONTACT_EMAIL || 'jason@huegraphics.cc',
        address: {
          '@type': 'PostalAddress',
          streetAddress: '741 Harry McCarty Road, Suite 101',
          addressLocality: 'Bethlehem',
          addressRegion: 'GA',
          postalCode: '30620',
          addressCountry: 'US',
        },
        sameAs: [SITE_URL],
      },
      {
        '@type': 'WebSite',
        '@id': websiteId,
        url: SITE_URL,
        name: 'Hue Studio',
        description: siteDescription,
        inLanguage: 'en-US',
        publisher: { '@id': organizationId },
      },
    ],
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
