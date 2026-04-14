import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
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

  // Use @supabase/ssr — reads the same cookies as @supabase/supabase-js v2
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }) } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.delete({ name, ...options }) } catch {}
        },
      },
    }
  )

  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !data.session?.user) {
    console.error('[employer-callback] exchange failed', exchangeError?.message)
    return NextResponse.redirect(`${origin}/login/employer?error=exchange-failed`)
  }

  const user = data.session.user
  const existingRole = user.user_metadata?.role as string | undefined

  console.log('[employer-callback] session ok', { userId: user.id, existingRole })

  // Returning employer
  if (existingRole === 'employer') {
    return NextResponse.redirect(`${origin}/employer/dashboard`)
  }

  // Wrong role
  if (existingRole && existingRole !== 'employer') {
    return NextResponse.redirect(`${origin}/login/employer?error=wrong-role&have=${existingRole}`)
  }

  // New user — stamp role + create profile + subscription
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User'
  const companyName = companyNameFromEmail(user.email)

  // Use admin client for profile/subscription creation (bypasses RLS)
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

  await admin.from('employer_subscriptions').upsert(
    { user_id: user.id, subscription_status: 'active', subscription_tier: 'free', trial_ends_at: new Date(Date.now() + 182 * 24 * 60 * 60 * 1000).toISOString() },
    { onConflict: 'user_id', ignoreDuplicates: true }
  )

  // Welcome email (fire and forget)
  fetch(`${origin}/api/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: user.email, type: 'welcome', data: { contactName: displayName, companyName } }),
  }).catch(() => {})

  console.log('[employer-callback] new employer created', { userId: user.id })
  return NextResponse.redirect(`${origin}/employer/dashboard`)
}
