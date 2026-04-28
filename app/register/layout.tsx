import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Register - Create Your Thrive Account',
  description: 'Sign up for Thrive. Free for job seekers. Employers get a 3-month free trial with unlimited job posts and candidate access.',
  openGraph: {
    title: 'Register - Create Your Thrive Account',
    description: 'Sign up for Thrive. Free for job seekers. Employers get a 3-month free trial.',
  },
  alternates: {
    canonical: '/register/employee',
  },
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children
}
