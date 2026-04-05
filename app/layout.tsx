import dynamic from 'next/dynamic'
const FeedbackWidget = dynamic(() => import('@/components/FeedbackWidget'), { ssr: false })
import ScrollToTop from '@/components/ScrollToTop'
import SessionGuard from '@/components/SessionGuard'
import { MessagesProvider } from '@/lib/MessagesContext'
import type { Metadata } from 'next'
import { Inter, Dancing_Script } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})
const dancingScript = Dancing_Script({
  subsets: ['latin'],
  variable: '--font-cursive',
  weight: ['400', '700'],
  display: 'swap',
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://thrivecareer.co.uk'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Thrive — Free UK Job Board | No Agency Fees',
    template: '%s | Thrive',
  },
  description: 'Find jobs or hire great people across all UK sectors. Post unlimited jobs free — no agency fees, no card needed. Search candidates, manage applications and schedule interviews in one platform.',
  keywords: ['UK jobs', 'job board', 'find jobs UK', 'hire staff UK', 'no agency fees', 'free job posting', 'hospitality jobs', 'healthcare jobs', 'Thrive'],
  authors: [{ name: 'Thrive' }],
  creator: 'Thrive',
  publisher: 'Thrive',
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: SITE_URL,
    siteName: 'Thrive',
    title: 'Thrive — Free UK Job Board | No Agency Fees',
    description: 'Find jobs or hire great people across all UK sectors. Post unlimited jobs free — no agency fees, no card needed.',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Thrive — Free UK Job Board',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Thrive — Free UK Job Board | No Agency Fees',
    description: 'Find jobs or hire great people across all UK sectors. Post unlimited jobs free — no agency fees, no card needed.',
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
    languages: {
      'en-GB': SITE_URL,
    },
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en-GB">
      <body className={`${inter.className} ${dancingScript.variable}`}>
        <Providers>
          <MessagesProvider>
            <ScrollToTop />
            <SessionGuard />
            {children}
            <FeedbackWidget />
          </MessagesProvider>
        </Providers>
      </body>
    </html>
  )
}
