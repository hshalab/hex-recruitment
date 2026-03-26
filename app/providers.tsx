'use client'

import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { JobsProvider } from '@/lib/JobsContext'
const ChatBot = dynamic(() => import('@/components/ChatBot'), { ssr: false })
const CookieConsent = dynamic(() => import('@/components/CookieConsent'), { ssr: false })

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith('/admin')

  return (
    <JobsProvider>
      {children}
      {!isAdmin && <ChatBot />}
      {!isAdmin && <CookieConsent />}
    </JobsProvider>
  )
}
