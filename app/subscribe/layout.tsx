import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Employer Plan - Post Jobs & Find Candidates for £149.99/month',
  description: 'Post unlimited jobs and browse candidates. 6-month free trial, cancel anytime.',
  openGraph: {
    title: 'Employer Plan - Post Jobs & Find Candidates for £149.99/month',
    description: 'Post unlimited jobs and browse candidates. 6-month free trial, cancel anytime.',
  },
  alternates: {
    canonical: '/subscribe',
  },
}

export default function SubscribeLayout({ children }: { children: React.ReactNode }) {
  return children
}
