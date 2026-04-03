import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Subscription Management - Thrive',
  description: 'Manage your Thrive subscription plan, billing, and account settings.',
  robots: { index: false },
}

export default function SubscriptionLayout({ children }: { children: React.ReactNode }) {
  return children
}
