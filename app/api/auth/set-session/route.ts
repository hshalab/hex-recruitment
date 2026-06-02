import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

// Session-cookie bridge for the email/password login flow.
//
// supabase.auth.signInWithPassword runs entirely client-side and writes
// the session to localStorage; it does NOT set the chunked SSR auth
// cookies that @supabase/ssr reads on the server. After the
// fix-entitlement-guard merge that added app/employer/layout.tsx, the
// server-side guard's auth.getUser() — which reads cookies — sees no
// session immediately after a password login, redirects to
// /login/employer, and the client-side getSession() (which reads
// localStorage) pushes back to /employer/dashboard. Infinite loop.
//
// The /auth/confirm route and the Google OAuth callback already bridge
// the session to cookies via @supabase/ssr's createServerClient with
// real set/remove cookie adapters (see lib/authCallback.ts:72-82). This
// route applies the same mechanism to the password flow: the client
// POSTs the tokens it just got from signInWithPassword, and we call
// setSession() on a cookie-writing server client. setSession()
// validates the tokens with Supabase, then @supabase/ssr writes the
// chunked sb-<ref>-auth-token cookies onto the response. The browser
// then has a valid cookie-borne session for the next navigation, and
// the layout guard's getUser() agrees.
//
// Security: setSession() refuses tokens that Supabase doesn't recognise
// — we never write cookies for an arbitrary access_token. A bogus
// payload comes back as 401 from this route and no cookies are set.

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: { access_token?: string; refresh_token?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const access_token = body?.access_token
  const refresh_token = body?.refresh_token
  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: 'access_token and refresh_token required' }, { status: 400 })
  }

  // Prepare the response upfront so the cookie set/remove adapters can
  // write onto it. Same shape as lib/authCallback.ts.
  const response = NextResponse.json({ ok: true })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options })
        },
      },
    },
  )

  // setSession() validates the tokens with Supabase and triggers the
  // cookie adapter's set() to write the chunked auth cookies onto
  // `response`. If the tokens are bogus / expired / not from this
  // project, this rejects and no cookies are written.
  const { error } = await supabase.auth.setSession({ access_token, refresh_token })
  if (error) {
    return NextResponse.json({ error: error.message, code: 'set_session_failed' }, { status: 401 })
  }

  return response
}
