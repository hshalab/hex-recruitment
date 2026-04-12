import { NextResponse } from 'next/server'

// Clears the Supabase session by redirecting with Set-Cookie headers
// that expire all sb-* cookies. Call this before retesting OAuth to
// ensure no stale session from a deleted account persists.
export async function GET() {
  const response = NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_SITE_URL || 'https://hex-recruitment.vercel.app'))

  // Clear all possible Supabase auth cookies
  const cookieNames = [
    'sb-access-token',
    'sb-refresh-token',
    'sb-aaljufxcniacfggqiuls-auth-token',
    'sb-aaljufxcniacfggqiuls-auth-token.0',
    'sb-aaljufxcniacfggqiuls-auth-token.1',
  ]
  for (const name of cookieNames) {
    response.cookies.set(name, '', { path: '/', maxAge: 0 })
  }

  return response
}
