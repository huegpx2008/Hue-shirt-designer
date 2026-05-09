import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hue T-shirt Designer',
  description: 'Design a custom T-shirt with draggable images and text.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
