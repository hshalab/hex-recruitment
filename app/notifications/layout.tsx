import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Notifications',
  description: 'View your Thrive notifications.',
  robots: { index: false },
  alternates: {
    canonical: '/notifications',
  },
}

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return children
}
