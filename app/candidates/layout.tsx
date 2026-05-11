import type { Metadata } from 'next'

export const metadata: Metadata = {
  // No "— Thrive" suffix on document title — the root metadata.template
  // ("%s | Thrive") appends it automatically. og title below keeps the
  // suffix because the template doesn't apply to og.
  title: 'Find Hospitality Talent',
  description: 'Browse qualified hospitality candidates across the UK. Chefs, front of house, management and operations talent.',
  openGraph: {
    title: 'Find Hospitality Talent — Thrive',
    description: 'Browse qualified hospitality candidates across the UK. Chefs, front of house, management and operations talent.',
  },
  alternates: {
    canonical: '/candidates',
  },
}

export default function CandidatesLayout({ children }: { children: React.ReactNode }) {
  return children
}
