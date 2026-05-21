import type { Metadata } from 'next'
import { trialPhraseFormal } from '@/lib/trialUtils'

export const metadata: Metadata = {
  title: 'Register - Create Your Thrive Account',
  description: `Sign up for Thrive. Free for job seekers. Employers get a ${trialPhraseFormal()} with unlimited job posts and candidate access.`,
  openGraph: {
    title: 'Register - Create Your Thrive Account',
    description: `Sign up for Thrive. Free for job seekers. Employers get a ${trialPhraseFormal()}.`,
  },
  alternates: {
    canonical: '/register/employee',
  },
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children
}
