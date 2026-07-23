import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hue Studio by Hue Graphics',
    short_name: 'Hue Studio',
    description: 'Design, upload and order custom printed products from Hue Graphics.',
    start_url: '/',
    display: 'standalone',
    background_color: '#050b12',
    theme_color: '#050b12',
    icons: [
      {
        src: '/brand/hue-graphics-icon.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
