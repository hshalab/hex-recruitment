import { NextResponse } from 'next/server'

// Clears the Supabase session by redirecting with Set-Cookie headers
// that expire all sb-* cookies including chunked session cookies.
export async function GET() {
  const response = NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://thrivecareer.co.uk'))

  const projectRef = 'aaljufxcniacfggqiuls'
  const base = `sb-${projectRef}-auth-token`
  const cookieNames = [
    'sb-access-token',
    'sb-refresh-token',
    base,
    `${base}-code-verifier`,
    ...Array.from({ length: 10 }, (_, i) => `${base}.${i}`),
  ]
  for (const name of cookieNames) {
    response.cookies.set(name, '', { path: '/', maxAge: 0 })
  }

  return response
}
