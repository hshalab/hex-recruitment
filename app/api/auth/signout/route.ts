import { NextResponse } from 'next/server'

// Server-side signout entrypoint. Clears any chunked auth-token cookies
// set by SSR helper / OAuth callbacks, then redirects to /signout — a
// client page that runs supabase.auth.signOut() to clear localStorage
// where the actual Supabase session lives. The chunked-cookie clear
// here remains worthwhile because OAuth flows can leave HTTP-only
// cookies the client can't reach.
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://thrivecareer.co.uk'
  const response = NextResponse.redirect(new URL('/signout', baseUrl))

  const projectRef = 'aaljufxcniacfggqiuls'
  const base = `sb-${projectRef}-auth-token`
  const cookieNames = [
    'sb-access-token',
    'sb-refresh-token',
    base,
    `${base}-code-verifier`,
    ...Array.from({ length: 20 }, (_, i) => `${base}.${i}`),
  ]
  for (const name of cookieNames) {
    response.cookies.set(name, '', { path: '/', maxAge: 0 })
  }

  return response
}
