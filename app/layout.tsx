import dynamic from 'next/dynamic'
const FeedbackWidget = dynamic(() => import('@/components/FeedbackWidget'), { ssr: false })
import ScrollToTop from '@/components/ScrollToTop'
import SessionGuard from '@/components/SessionGuard'
import { MessagesProvider } from '@/lib/MessagesContext'
import type { Metadata } from 'next'
import { Inter, Dancing_Script } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

// Body font. Also does double duty as the display face (see
// --font-display below) so that numbers and headings share the same
// family across the whole platform — one clean sans-serif look.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})
// Keep the --font-display CSS variable in place (many components already
// reference it) but point it at a heavier-weight Inter instance so stat
// pills and hero numbers stand out without switching family. Tabular
// numerals are enabled globally below so counts line up in columns.
const interDisplay = Inter({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
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
  keywords: ['UK jobs', 'job board', 'find jobs UK', 'hire staff UK', 'no agency fees', 'free job posting', 'jobs across all sectors', 'Thrive'],
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
      <body className={`${inter.className} ${dancingScript.variable} ${interDisplay.variable}`}>
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
