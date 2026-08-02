import type { Metadata } from 'next'
import { foundingPhraseFormal, foundingPhraseShort } from '@/lib/trialUtils'
import { EMPLOYER_COHORT_CAP } from '@/lib/constants/cohort'

// NO PRICE, and no trial length either — a trial length implies what happens
// when it ends, which is the same claim wearing a different hat. The founding
// cohort offer is the one money claim allowed, because it is an offer actually
// being run and can be honoured. See CLAUDE.md.
//
// These described the DORMANT Stripe trial (3 months), not the live offer
// (12 months for the first 100), so the page was also understating what an
// employer actually gets by nine months.
export const metadata: Metadata = {
  title: 'Register - Create Your Thrive Account',
  description: `Sign up for Thrive. Free for job seekers. The first ${EMPLOYER_COHORT_CAP} employers get ${foundingPhraseFormal()}, with unlimited job posts and candidate access.`,
  openGraph: {
    title: 'Register - Create Your Thrive Account',
    description: `Sign up for Thrive. Free for job seekers. The first ${EMPLOYER_COHORT_CAP} employers get ${foundingPhraseShort()}.`,
  },
  alternates: {
    canonical: '/register/employee',
  },
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children
}
