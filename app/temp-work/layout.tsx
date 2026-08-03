import type { Metadata } from 'next'

// /temp-work had NO layout at all — no title, no description, no Open Graph. It
// is a public product surface, and a link to it shared anywhere previewed as
// the homepage: the root title, the root description, and no clue what the page
// was.
//
// The description is the page's own subtitle, word for word (page.tsx h1sub).
// Copying it rather than writing a second version is deliberate — two
// descriptions of the same page are two things that can drift, and the one on
// the page is the one someone actually reads.
//
// No openGraph block. It inherits the site-level card, which is now on brand,
// and there is no page-specific image worth minting for a shifts board.
export const metadata: Metadata = {
  title: 'Temp work & casual shifts',
  description:
    'Short-term roles and casual shifts. Apply to a role, or tell an employer ' +
    "you're available for a shift.",
  alternates: { canonical: '/temp-work' },
}

export default function TempWorkLayout({ children }: { children: React.ReactNode }) {
  return children
}
