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

  try {

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

  let supabase: ReturnType<typeof createRouteHandlerClient>
  try {
    supabase = createRouteHandlerClient({ cookies })
  } catch (err: any) {
    console.error('[auth/callback] createRouteHandlerClient CRASHED', err?.message, err?.stack)
    return NextResponse.redirect(`${origin}/login?auth_error=client_init_failed`)
  }
  console.log('[auth/callback] step:exchange')
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    console.error('[auth/callback] exchangeCodeForSession FAILED', exchangeError.message)
    return NextResponse.redirect(`${origin}/login?auth_error=${encodeURIComponent(exchangeError.message)}`)
  }
  console.log('[auth/callback] step:exchange OK')

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

  // New employers go to payment page to set up their trial subscription.
  // Returning employers (who already have a role) go straight to dashboard.
  const destination = role === 'employer'
    ? (!existingRole ? '/register/employer/payment' : '/employer/dashboard')
    : '/dashboard'
  console.log('[auth/callback] success', { userId: user.id, role, destination, isNewUser: !existingRole })
  return NextResponse.redirect(`${origin}${destination}`)

  } catch (err: any) {
    console.error('[auth/callback] UNHANDLED ERROR', err?.message, err?.stack?.slice(0, 500))
    return NextResponse.redirect(`${origin}/login?auth_error=${encodeURIComponent(err?.message || 'unknown_error')}`)
  }
}
