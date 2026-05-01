import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// Shared OAuth callback logic. Used by:
// - /auth/callback (email flow — reads role from ?role= query param)
// - /auth/callback/employer (Google OAuth — role is always 'employer')
// - /auth/callback/employee (Google OAuth — role is always 'employee')

function getOrigin(req: NextRequest): string {
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https'
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`
  return new URL(req.url).origin
}

function companyNameFromEmail(email: string | undefined): string {
  if (!email) return 'My Company'
  const domain = email.split('@')[1] || ''
  const stem = domain.split('.')[0] || ''
  if (!stem || ['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'live', 'aol', 'protonmail'].includes(stem.toLowerCase())) {
    return 'My Company'
  }
  return stem.charAt(0).toUpperCase() + stem.slice(1)
}

export async function handleAuthCallback(
  req: NextRequest,
  hardcodedRole?: 'employer' | 'employee'
) {
  const origin = getOrigin(req)

  try {

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const otpType = url.searchParams.get('type') as
    | 'signup' | 'magiclink' | 'recovery' | 'invite' | 'email' | 'email_change' | null
  const nextParam = url.searchParams.get('next')
  const errorParam = url.searchParams.get('error')
  const errorDesc = url.searchParams.get('error_description')

  // Role source priority: hardcoded (path-based) > query param (email flow)
  const roleParam = hardcodedRole || url.searchParams.get('role') as 'employer' | 'employee' | null

  console.log('[auth/callback] GET', {
    origin,
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    otpType,
    nextParam,
    roleParam,
    roleSource: hardcodedRole ? 'path' : 'query',
    errorParam,
  })

  if (errorParam) {
    return NextResponse.redirect(`${origin}/login?auth_error=${encodeURIComponent(errorDesc || errorParam)}`)
  }
  if (!code && !tokenHash) {
    return NextResponse.redirect(`${origin}/login?auth_error=missing_code`)
  }

  // Build a placeholder redirect — cookies from exchangeCodeForSession are
  // written onto this response object so they survive the redirect.
  const response = NextResponse.redirect(`${origin}/dashboard`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) { response.cookies.set({ name, value, ...options }) },
        remove(name: string, options: CookieOptions) { response.cookies.set({ name, value: '', ...options }) },
      },
    }
  )
  if (tokenHash && otpType) {
    // Email-link OTP flow: link in the confirmation email points directly
    // at this route with a token_hash. verifyOtp consumes the hash and
    // writes session cookies onto `response` via the SSR cookie adapter.
    console.log('[auth/callback] step:verifyOtp')
    const { error: otpError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    })
    if (otpError) {
      console.error('[auth/callback] verifyOtp FAILED', otpError.message)
      return NextResponse.redirect(
        `${origin}/login?error=verification_failed&reason=${encodeURIComponent(otpError.message)}`
      )
    }
    console.log('[auth/callback] step:verifyOtp OK')
  } else {
    // Legacy/PKCE flow: emails sent before the template change land here
    // via Supabase /auth/v1/verify → 303 → /auth/confirm?code=...
    console.log('[auth/callback] step:exchange')
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code!)
    if (exchangeError) {
      console.error('[auth/callback] exchangeCodeForSession FAILED', exchangeError.message)
      return NextResponse.redirect(`${origin}/login?auth_error=${encodeURIComponent(exchangeError.message)}`)
    }
    console.log('[auth/callback] step:exchange OK')
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    console.error('[auth/callback] getUser FAILED', userError?.message)
    return NextResponse.redirect(`${origin}/login?auth_error=no_user`)
  }
  console.log('[auth/callback] step:getUser OK', { userId: user.id, existingMetaRole: user.user_metadata?.role })

  const existingRole = (user.user_metadata?.role as 'employer' | 'employee' | undefined) || undefined

  if (existingRole && roleParam && existingRole !== roleParam) {
    console.warn('[auth/callback] step:mismatch', { existingRole, roleParam })
    await supabase.auth.signOut()
    const target = roleParam === 'employer' ? '/login/employer' : '/login/employee'
    return NextResponse.redirect(`${origin}${target}?error=wrong_account&have=${existingRole}`)
  }

  const role: 'employer' | 'employee' | undefined = existingRole || roleParam || undefined
  console.log('[auth/callback] step:resolveRole', { existingRole, roleParam, resolvedRole: role })

  if (!role) {
    console.warn('[auth/callback] step:noRole')
    return NextResponse.redirect(`${origin}/login?auth_error=missing_role`)
  }

  const displayName = (user.user_metadata?.full_name as string | undefined)
    || (user.user_metadata?.name as string | undefined)
    || (user.email?.split('@')[0] || 'User')

  // New user: stamp role + create profile
  if (!existingRole) {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )

    // Use admin.auth.admin.updateUserById to stamp role directly in the
    // database. The route-handler client's updateUser() updates metadata
    // but the new values aren't reflected in the session cookie that was
    // already set by exchangeCodeForSession — so the client-side
    // dashboard would see the old metadata (no role) and redirect away.
    console.log('[auth/callback] step:updateMeta', { userId: user.id, role })
    const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, role, full_name: displayName },
    })
    if (metaError) {
      console.error('[auth/callback] updateUserById FAILED', metaError.message)
    } else {
      console.log('[auth/callback] step:updateMeta OK')
    }

    console.log('[auth/callback] step:refreshSession')
    const { error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError) {
      console.error('[auth/callback] refreshSession FAILED', refreshError.message)
    } else {
      console.log('[auth/callback] step:refreshSession OK')
    }

    if (role === 'employer') {
      const { error: profileErr } = await admin
        .from('employer_profiles')
        .upsert(
          { user_id: user.id, company_name: companyNameFromEmail(user.email), contact_name: displayName, email: user.email || '' },
          { onConflict: 'user_id', ignoreDuplicates: false }
        )
      if (profileErr) console.error('[auth/callback] employer_profiles upsert failed', profileErr)

      // Bootstrap an inactive subscription row — the payment page
      // (/register/employer/payment) will upgrade it after card setup.
      const { error: subErr } = await admin
        .from('employer_subscriptions')
        .upsert(
          { user_id: user.id, subscription_status: 'inactive', subscription_tier: 'standard' },
          { onConflict: 'user_id', ignoreDuplicates: true }
        )
      if (subErr) console.error('[auth/callback] employer_subscriptions upsert failed', subErr)
    } else {
      const { error: profileErr } = await admin
        .from('candidate_profiles')
        .upsert(
          { user_id: user.id, full_name: displayName, email: user.email || '' },
          { onConflict: 'user_id', ignoreDuplicates: false }
        )
      if (profileErr) console.error('[auth/callback] candidate_profiles upsert failed', profileErr)
    }

    // Welcome email
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin
    if (role === 'employer') {
      const companyName = (user.user_metadata?.company_name as string | undefined) || companyNameFromEmail(user.email)
      fetch(`${siteUrl}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: user.email, type: 'welcome', data: { contactName: displayName, companyName } }),
      }).catch(() => {})
    } else {
      fetch(`${siteUrl}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: user.email, type: 'candidate_welcome', data: { candidateName: displayName } }),
      }).catch(() => {})
    }
  }

  // Route decision: employers need a Stripe subscription to reach the
  // dashboard. New employers always go to payment; returning employers go
  // to payment only if they haven't completed card setup.
  // Honor ?next= only for returning users with an existing role — for
  // brand-new employers we keep the payment-gate route so they can't
  // skip Stripe setup via a crafted next= value. Same-origin paths only.
  let destination = '/dashboard'
  if (existingRole && nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')) {
    destination = nextParam
  } else if (role === 'employer') {
    if (!existingRole) {
      destination = '/register/employer/payment'
    } else {
      const checkAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
      )
      const { data: sub } = await checkAdmin
        .from('employer_subscriptions')
        .select('stripe_subscription_id')
        .eq('user_id', user.id)
        .maybeSingle()
      destination = sub?.stripe_subscription_id
        ? '/employer/dashboard'
        : '/register/employer/payment'
    }
  }
  console.log('[auth/callback] success', { userId: user.id, role, destination, isNewUser: !existingRole })

  // Build the final redirect, copying session cookies from the exchange response
  const finalRedirect = NextResponse.redirect(`${origin}${destination}`)
  response.cookies.getAll().forEach(cookie => { finalRedirect.cookies.set(cookie) })
  return finalRedirect

  } catch (err: any) {
    console.error('[auth/callback] UNHANDLED ERROR', err?.message, err?.stack?.slice(0, 500))
    return NextResponse.redirect(`${origin}/login?auth_error=${encodeURIComponent(err?.message || 'unknown_error')}`)
  }
}
