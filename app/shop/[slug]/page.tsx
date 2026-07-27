import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Hue Group Store',
  description: 'Temporary Hue Graphics Group Store.',
  robots: { index: false, follow: false },
};

export default async function GroupStorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/?view=shop&store=${encodeURIComponent(slug)}`);
}

