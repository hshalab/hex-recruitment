import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Supabase OAuth callback. Handles the redirect back from Google (or any
// other configured social provider) via Supabase Auth.
//
// Flow:
// 1. Exchange the `code` query param for a session (sets cookies).
// 2. Read the caller's intended role from `?role=employer|employee`.
// 3. First-time sign-in? Stamp role on user_metadata and create the
//    corresponding profile row (employer_profiles / candidate_profiles).
// 4. Returning user? Read their existing role from user_metadata.
// 5. Redirect to the role-appropriate dashboard.
//
// Profile row creation uses upsert with onConflict=user_id so repeat
// calls are safe — the existing row is preserved, a missing row is
// created.

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

export async function GET(req: NextRequest) {
  const origin = getOrigin(req)
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const errorParam = url.searchParams.get('error')
  const errorDesc = url.searchParams.get('error_description')

  // Role from query param (email signUp flow) or cookie (Google OAuth
  // flow — Supabase strips query params from redirectTo during OAuth).
  let roleParam = url.searchParams.get('role') as 'employer' | 'employee' | null
  if (!roleParam) {
    const cookieHeader = req.headers.get('cookie') || ''
    const match = cookieHeader.match(/oauth_intended_role=(employer|employee)/)
    if (match) roleParam = match[1] as 'employer' | 'employee'
  }

  console.log('[auth/callback] GET', {
    origin,
    hasCode: Boolean(code),
    roleParam,
    roleSource: url.searchParams.get('role') ? 'query' : 'cookie',
    errorParam,
  })

  if (errorParam) {
    return NextResponse.redirect(`${origin}/login?auth_error=${encodeURIComponent(errorDesc || errorParam)}`)
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login?auth_error=missing_code`)
  }

  const supabase = createRouteHandlerClient({ cookies })
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    console.error('[auth/callback] exchangeCodeForSession failed', exchangeError)
    return NextResponse.redirect(`${origin}/login?auth_error=${encodeURIComponent(exchangeError.message)}`)
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    console.error('[auth/callback] getUser failed', userError)
    return NextResponse.redirect(`${origin}/login?auth_error=no_user`)
  }

  // Resolve the role: prefer existing metadata; fall back to the query param
  const existingRole = (user.user_metadata?.role as 'employer' | 'employee' | undefined) || undefined

  // Mismatch: user has an existing role and clicked the *other* role's
  // Google button. Sign them out and bounce to the matching login page
  // with an error explaining what happened.
  if (existingRole && roleParam && existingRole !== roleParam) {
    await supabase.auth.signOut()
    const target = roleParam === 'employer' ? '/login/employer' : '/login/employee'
    console.warn('[auth/callback] role mismatch', { existingRole, roleParam, userId: user.id })
    return NextResponse.redirect(`${origin}${target}?error=wrong_account&have=${existingRole}`)
  }

  const role: 'employer' | 'employee' | undefined = existingRole || roleParam || undefined

  if (!role) {
    // This can happen if someone hits /auth/callback without the role
    // query param and their metadata isn't stamped yet (e.g. manual
    // link, misrouted redirect). Send them to the login chooser.
    console.warn('[auth/callback] no role available — user must pick one', { userId: user.id })
    return NextResponse.redirect(`${origin}/login?auth_error=missing_role`)
  }

  const displayName = (user.user_metadata?.full_name as string | undefined)
    || (user.user_metadata?.name as string | undefined)
    || (user.email?.split('@')[0] || 'User')

  // If the user is brand new (no role stamped yet), write metadata + profile.
  if (!existingRole) {
    const { error: metaError } = await supabase.auth.updateUser({
      data: {
        role,
        full_name: displayName,
      },
    })
    if (metaError) {
      console.error('[auth/callback] updateUser failed', metaError)
      // Non-fatal — continue to profile creation
    }

    // Use the service-role client for profile creation so RLS can't
    // block the first-touch insert on a row the user technically
    // doesn't own yet.
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )

    if (role === 'employer') {
      const { error: upsertErr } = await admin
        .from('employer_profiles')
        .upsert(
          {
            user_id: user.id,
            company_name: companyNameFromEmail(user.email),
            contact_name: displayName,
            email: user.email || '',
          },
          { onConflict: 'user_id', ignoreDuplicates: false }
        )
      if (upsertErr) console.error('[auth/callback] employer_profiles upsert failed', upsertErr)

      // Ensure a subscription row exists — free launch tier for new employers
      const { error: subErr } = await admin
        .from('employer_subscriptions')
        .upsert(
          {
            user_id: user.id,
            subscription_status: 'active',
            subscription_tier: 'free',
            trial_ends_at: new Date(Date.now() + 182 * 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: 'user_id', ignoreDuplicates: true }
        )
      if (subErr) console.error('[auth/callback] employer_subscriptions upsert failed', subErr)
    } else {
      const { error: upsertErr } = await admin
        .from('candidate_profiles')
        .upsert(
          {
            user_id: user.id,
            full_name: displayName,
            email: user.email || '',
          },
          { onConflict: 'user_id', ignoreDuplicates: false }
        )
      if (upsertErr) console.error('[auth/callback] candidate_profiles upsert failed', upsertErr)
    }

    // Send the appropriate welcome email now that the user is verified.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin
    if (role === 'employer') {
      const companyName = (user.user_metadata?.company_name as string | undefined) || companyNameFromEmail(user.email)
      fetch(`${siteUrl}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: user.email,
          type: 'welcome',
          data: { contactName: displayName, companyName },
        }),
      }).catch(() => {})
    } else {
      fetch(`${siteUrl}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: user.email,
          type: 'candidate_welcome',
          data: { candidateName: displayName },
        }),
      }).catch(() => {})
    }
  }

  const destination = role === 'employer' ? '/employer/dashboard' : '/dashboard'
  console.log('[auth/callback] success', { userId: user.id, role, destination, isNewUser: !existingRole })
  const response = NextResponse.redirect(`${origin}${destination}`)
  // Clear the role cookie so it doesn't linger
  response.cookies.set('oauth_intended_role', '', { path: '/', maxAge: 0 })
  return response
}
