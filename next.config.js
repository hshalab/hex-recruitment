/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  generateBuildId: async () => {
    return 'build-' + Date.now()
  },
  // /register on its own is a dead-end (no app/register/page.tsx). Send
  // visitors to the employer signup since employers are the paying side;
  // candidates have their own discovery path via /jobs → Apply → signup
  // prompt. Temporary 307 keeps room for a role-chooser later.
  //
  // Dormant Stripe pages: under free-founding-mode pricing is intentionally
  // unset publicly, but /subscribe, /register/employer/payment, and
  // /renew-subscription still render "£99/month" and card-collection UI.
  // 307 them to the free signup so the price isn't reachable by URL,
  // without deleting any Stripe code. permanent: false (not 308) so
  // browsers don't cache hard — when Stripe is revived later, just remove
  // these entries and the originals come back instantly.
  redirects: async () => [
    { source: '/register', destination: '/register/employer-free', permanent: false },
    { source: '/subscribe', destination: '/register/employer-free', permanent: false },
    { source: '/register/employer/payment', destination: '/register/employer-free', permanent: false },
    { source: '/renew-subscription', destination: '/register/employer-free', permanent: false },
  ],
  headers: async () => [
    {
      source: '/_next/static/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      ],
    },
  ],
}

module.exports = nextConfig


