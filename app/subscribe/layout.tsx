import type { Metadata } from 'next'
import { EMPLOYER_SUBSCRIPTION_PRICE, trialPhraseFormal } from '@/lib/trialUtils'

// /subscribe is dormant under free-founding-mode and is 307'd at the
// edge (see next.config.js). The page component, title/description, and
// price imports above are kept so reviving Stripe later is a clean
// revert. The SEO surface, however, is closed off:
//   - self-canonical removed so Google doesn't treat /subscribe as a
//     preferred URL while it's redirected
//   - robots noindex/nofollow so even if a crawler bypasses the 307
//     somehow, the dormant £99 page is not indexed
// When Stripe is revived: remove these defenses and restore the
// canonical + sitemap entry.
export const metadata: Metadata = {
  title: `Employer Plan - Post Jobs & Find Candidates for £${EMPLOYER_SUBSCRIPTION_PRICE}/month`,
  description: `Post unlimited jobs and browse candidates. ${trialPhraseFormal()}, cancel anytime.`,
  openGraph: {
    title: `Employer Plan - Post Jobs & Find Candidates for £${EMPLOYER_SUBSCRIPTION_PRICE}/month`,
    description: `Post unlimited jobs and browse candidates. ${trialPhraseFormal()}, cancel anytime.`,
  },
  robots: {
    index: false,
    follow: false,
  },
}

export default function SubscribeLayout({ children }: { children: React.ReactNode }) {
  return children
}
