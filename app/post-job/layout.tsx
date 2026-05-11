import type { Metadata } from 'next'

export const metadata: Metadata = {
  // No "— Thrive" suffix on document title — the root metadata.template
  // ("%s | Thrive") appends it automatically. og title below keeps the
  // suffix because the template doesn't apply to og.
  title: 'Post a Hospitality Job',
  description: 'Reach thousands of hospitality candidates actively job-seeking. Post unlimited jobs across kitchen, front of house, sales and operations roles.',
  openGraph: {
    title: 'Post a Hospitality Job — Thrive',
    description: 'Reach thousands of hospitality candidates actively job-seeking. Post unlimited jobs across kitchen, front of house, sales and operations roles.',
  },
  alternates: {
    canonical: '/post-job',
  },
}

export default function PostJobLayout({ children }: { children: React.ReactNode }) {
  return children
}
