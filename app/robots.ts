import { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://thrivecareer.co.uk'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/dashboard',
          '/employer/dashboard',
          '/profile',
          '/messages',
          '/applications',
          '/my-jobs',
          '/settings',
          '/notifications',
          '/interviews',
          '/post-job',
          '/cv-builder',
          '/saved-jobs',
          '/reactivate-account',
          '/renew-subscription',
          '/subscribe',
          '/register/employer/payment',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
