import type { Metadata } from 'next'

// /waitlist had no layout at all — no title, no description, no Open Graph —
// while sitting in the sitemap at priority 0.8. Every shared link previewed as
// the homepage.
//
// The words are the page's own: its headline promises 12 months free for the
// first 100 employers, and its subheadline says "no card needed". Written from
// what the page says rather than from what we'd like it to say, so the two
// cannot drift.
//
// The 12 months is the ONE money claim allowed — it is an offer actually being
// run and can be honoured. No price, no rate, no trial length. See CLAUDE.md.
//
// No openGraph block: it inherits the site card, which is on brand.
export const metadata: Metadata = {
  title: 'Join the waitlist',
  description:
    'The first 100 employers on Thrive get 12 months free, no card needed. ' +
    'Join the waitlist and claim a founding place.',
  alternates: { canonical: '/waitlist' },
}

export default function WaitlistLayout({ children }: { children: React.ReactNode }) {
  return children
}
