import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getOrigin(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  if (host) return `${proto}://${host}`
  return new URL(req.url).origin
}

function companyNameFromEmail(email: string | undefined): string {
  if (!email) return 'My Company'
  const stem = (email.split('@')[1] || '').split('.')[0] || ''
  if (!stem || ['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'live', 'aol', 'protonmail'].includes(stem.toLowerCase())) {
    return 'My Company'
  }
  return stem.charAt(0).toUpperCase() + stem.slice(1)
}

export async function GET(request: NextRequest) {
  const origin = getOrigin(request)
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  console.log('[employer-callback] GET', { origin, hasCode: Boolean(code), error })

  if (error) {
    return NextResponse.redirect(`${origin}/login/employer?error=${encodeURIComponent(error)}`)
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login/employer?error=no-code`)
  }

  // Prepare the redirect response FIRST — we'll set cookies on it
  // so they're included in the 307 redirect. cookies().set() in
  // Next.js 14 route handlers doesn't propagate to redirect responses.
  const redirectTo = `${origin}/employer/dashboard`
  const response = NextResponse.redirect(redirectTo)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !data.session?.user) {
    console.error('[employer-callback] exchange failed', exchangeError?.message)
    return NextResponse.redirect(`${origin}/login/employer?error=${encodeURIComponent(exchangeError?.message || 'exchange-failed')}`)
  }

  const user = data.session.user
  const existingRole = user.user_metadata?.role as string | undefined

  console.log('[employer-callback] session ok', { userId: user.id, existingRole })

  // Returning employer — redirect is already set to /employer/dashboard
  if (existingRole === 'employer') {
    return response
  }

  // Wrong role
  if (existingRole && existingRole !== 'employer') {
    return NextResponse.redirect(`${origin}/login/employer?error=wrong-role&have=${existingRole}`)
  }

  // New user — stamp role + create profile + subscription
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User'
  const companyName = companyNameFromEmail(user.email)

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )

  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, role: 'employer', full_name: displayName },
  })

  await admin.from('employer_profiles').upsert(
    { user_id: user.id, company_name: companyName, contact_name: displayName, email: user.email || '' },
    { onConflict: 'user_id', ignoreDuplicates: false }
  )

  fetch(`${origin}/api/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: user.email, type: 'welcome', data: { contactName: displayName, companyName } }),
  }).catch(() => {})

  // New employer → payment page (trial subscription created there)
  // Copy session cookies from the exchange response so the payment page
  // can read the authenticated session.
  const paymentRedirect = NextResponse.redirect(`${origin}/register/employer/payment`)
  response.cookies.getAll().forEach(cookie => {
    paymentRedirect.cookies.set(cookie)
  })

  console.log('[employer-callback] new employer → payment', { userId: user.id })
  return paymentRedirect
}
