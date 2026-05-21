import type { Metadata } from 'next'
import { EMPLOYER_SUBSCRIPTION_PRICE, trialPhraseFormal } from '@/lib/trialUtils'

export const metadata: Metadata = {
  title: `Employer Plan - Post Jobs & Find Candidates for £${EMPLOYER_SUBSCRIPTION_PRICE}/month`,
  description: `Post unlimited jobs and browse candidates. ${trialPhraseFormal()}, cancel anytime.`,
  openGraph: {
    title: `Employer Plan - Post Jobs & Find Candidates for £${EMPLOYER_SUBSCRIPTION_PRICE}/month`,
    description: `Post unlimited jobs and browse candidates. ${trialPhraseFormal()}, cancel anytime.`,
  },
  alternates: {
    canonical: '/subscribe',
  },
}

export default function SubscribeLayout({ children }: { children: React.ReactNode }) {
  return children
}
