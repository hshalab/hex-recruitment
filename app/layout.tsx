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
    default: 'Thrive — Hire talent / Find jobs',
    template: '%s | Thrive',
  },
  description: 'Hire faster for restaurants, hotels and hospitality groups. Manage applicants across kitchen, front of house, sales and operations. £99/month, 3-month free trial.',
  keywords: ['hospitality jobs UK', 'restaurant jobs London', 'hotel jobs UK', 'chef jobs London', 'front of house jobs', 'hospitality hiring platform', 'restaurant hiring software', 'Thrive'],
  authors: [{ name: 'Thrive' }],
  creator: 'Thrive',
  publisher: 'Thrive',
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: SITE_URL,
    siteName: 'Thrive',
    title: 'Thrive — Hire talent / Find jobs',
    description: 'Hire faster for restaurants, hotels and hospitality groups. Manage applicants across kitchen, front of house, sales and operations.',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Thrive — Hire faster. Apply smarter.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Thrive — Hire talent / Find jobs',
    description: 'Hire faster for restaurants, hotels and hospitality groups. Manage applicants across kitchen, front of house, sales and operations.',
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
    apple: '/apple-icon',
  },
  manifest: '/manifest.webmanifest',
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
