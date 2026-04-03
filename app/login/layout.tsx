import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Log In - Access Your Thrive Account',
  description: 'Log in to your Thrive account to browse jobs, manage applications or post vacancies.',
  alternates: {
    canonical: '/login',
  },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
