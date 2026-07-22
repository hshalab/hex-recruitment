import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Log In to Thrive — Job Seekers & Employers',
  description: 'Log in to Thrive. Job seekers browse jobs and manage applications; employers manage vacancies and candidates. Choose your account type to continue.',
  alternates: {
    canonical: '/login',
  },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
