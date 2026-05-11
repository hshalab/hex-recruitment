import type { Metadata } from 'next'

export const metadata: Metadata = {
  // No "— Thrive" suffix on document title — the root metadata.template
  // ("%s | Thrive") appends it automatically. og/twitter titles below
  // keep the suffix because the template doesn't apply to those fields.
  title: 'Hospitality Jobs in the UK',
  description: 'Search and apply for hospitality jobs across the UK. Kitchen, front of house, sales and operations roles from London restaurants, hotels and hospitality groups.',
  openGraph: {
    title: 'Hospitality Jobs in the UK — Thrive',
    description: 'Search and apply for hospitality jobs across the UK. Kitchen, front of house, sales and operations roles from London restaurants, hotels and hospitality groups.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hospitality Jobs in the UK — Thrive',
    description: 'Search and apply for hospitality jobs across the UK. Kitchen, front of house, sales and operations roles from London restaurants, hotels and hospitality groups.',
    images: ['/opengraph-image'],
  },
  alternates: {
    canonical: '/jobs',
  },
}

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return children
}
