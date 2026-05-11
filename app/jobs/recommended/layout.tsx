import type { Metadata } from 'next'

export const metadata: Metadata = {
  // Title keeps the "— Thrive" suffix inline (unlike sibling /jobs,
  // /candidates, /post-job which drop it). Reason: the root metadata
  // title.template ("%s | Thrive") does not get applied to this route's
  // document title in Next 14 — likely because `robots: { index: false }`
  // alters how the metadata pipeline composes the final <title>. Without
  // the inline suffix here the tab would read just "Recommended
  // Hospitality Jobs" with no brand.
  title: 'Recommended Hospitality Jobs — Thrive',
  description: 'Personalised hospitality job recommendations matched to your experience and location.',
  openGraph: {
    title: 'Recommended Hospitality Jobs — Thrive',
    description: 'Personalised hospitality job recommendations matched to your experience and location.',
  },
  // Explicit twitter override so social shares of this page show
  // recommendations copy, not the /jobs index copy it would otherwise
  // inherit from the parent layout.
  twitter: {
    title: 'Recommended Hospitality Jobs — Thrive',
    description: 'Personalised hospitality job recommendations matched to your experience and location.',
  },
  robots: { index: false },
  alternates: {
    canonical: '/jobs/recommended',
  },
}

export default function RecommendedLayout({ children }: { children: React.ReactNode }) {
  return children
}
