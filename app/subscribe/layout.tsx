import type { Metadata } from 'next'
import { trialPhraseFormal } from '@/lib/trialUtils'

export const metadata: Metadata = {
  title: 'Employer Plan - Post Jobs & Find Candidates for £99/month',
  description: `Post unlimited jobs and browse candidates. ${trialPhraseFormal()}, cancel anytime.`,
  openGraph: {
    title: 'Employer Plan - Post Jobs & Find Candidates for £99/month',
    description: `Post unlimited jobs and browse candidates. ${trialPhraseFormal()}, cancel anytime.`,
  },
  alternates: {
    canonical: '/subscribe',
  },
}

export default function SubscribeLayout({ children }: { children: React.ReactNode }) {
  return children
}
