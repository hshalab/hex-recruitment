import { NextResponse } from 'next/server'

// Clears the Supabase session by redirecting with Set-Cookie headers
// that expire all sb-* cookies including chunked session cookies.
export async function GET() {
  const response = NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://thrivecareer.co.uk'))

  const projectRef = 'aaljufxcniacfggqiuls'
  const base = `sb-${projectRef}-auth-token`

  // REAL ISSUE: this server-side route cannot clear localStorage where the
  // Supabase session actually lives (lib/supabase.ts hybridStorage puts
  // tokens in localStorage, only code-verifier in cookies). Hitting
  // /api/auth/signout via URL leaves the session intact. The "Log out" UI
  // button works because it calls supabase.auth.signOut() client-side
  // first, which clears localStorage. Tracked separately — needs a
  // client-side handoff or middleware redirect to a sign-out client
  // component before this route is safe to expose as a navigable URL.
  //
  // The cookie chunk loop below is cheap defensive insurance (current
  // production sessions use 0-2 chunks via hybridStorage; 20 covers worst
  // case for SSR helper OAuth callbacks where chunked auth-token cookies
  // are set on the response).
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
