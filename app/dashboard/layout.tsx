import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard - Your Thrive Overview',
  description: 'View your Thrive dashboard with job activity, applications and profile overview.',
  robots: { index: false },
  alternates: {
    canonical: '/dashboard',
  },
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children
}
