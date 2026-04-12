import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const errorParam = url.searchParams.get('error')
  const errorDesc = url.searchParams.get('error_description')

  // Role source priority: hardcoded (path-based) > query param (email flow)
  const roleParam = hardcodedRole || url.searchParams.get('role') as 'employer' | 'employee' | null

  console.log('[auth/callback] GET', {
    origin,
    hasCode: Boolean(code),
    roleParam,
    roleSource: hardcodedRole ? 'path' : 'query',
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

  const existingRole = (user.user_metadata?.role as 'employer' | 'employee' | undefined) || undefined

  // Mismatch check: existing role doesn't match the intended role
  if (existingRole && roleParam && existingRole !== roleParam) {
    await supabase.auth.signOut()
    const target = roleParam === 'employer' ? '/login/employer' : '/login/employee'
    console.warn('[auth/callback] role mismatch', { existingRole, roleParam, userId: user.id })
    return NextResponse.redirect(`${origin}${target}?error=wrong_account&have=${existingRole}`)
  }

  const role: 'employer' | 'employee' | undefined = existingRole || roleParam || undefined

  if (!role) {
    console.warn('[auth/callback] no role available', { userId: user.id })
    return NextResponse.redirect(`${origin}/login?auth_error=missing_role`)
  }

  const displayName = (user.user_metadata?.full_name as string | undefined)
    || (user.user_metadata?.name as string | undefined)
    || (user.email?.split('@')[0] || 'User')

  // New user: stamp role + create profile
  if (!existingRole) {
    const { error: metaError } = await supabase.auth.updateUser({
      data: { role, full_name: displayName },
    })
    if (metaError) console.error('[auth/callback] updateUser failed', metaError)

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )

    if (role === 'employer') {
      const { error: profileErr } = await admin
        .from('employer_profiles')
        .upsert(
          { user_id: user.id, company_name: companyNameFromEmail(user.email), contact_name: displayName, email: user.email || '' },
          { onConflict: 'user_id', ignoreDuplicates: false }
        )
      if (profileErr) console.error('[auth/callback] employer_profiles upsert failed', profileErr)

      const { error: subErr } = await admin
        .from('employer_subscriptions')
        .upsert(
          { user_id: user.id, subscription_status: 'active', subscription_tier: 'free', trial_ends_at: new Date(Date.now() + 182 * 24 * 60 * 60 * 1000).toISOString() },
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

  const destination = role === 'employer' ? '/employer/dashboard' : '/dashboard'
  console.log('[auth/callback] success', { userId: user.id, role, destination, isNewUser: !existingRole })
  return NextResponse.redirect(`${origin}${destination}`)
}
