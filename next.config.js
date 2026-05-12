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
  redirects: async () => [
    { source: '/register', destination: '/register/employer-free', permanent: false },
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


