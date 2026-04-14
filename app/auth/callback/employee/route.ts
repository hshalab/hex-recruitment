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

export async function GET(request: NextRequest) {
  const origin = getOrigin(request)
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${origin}/login/employee?error=${encodeURIComponent(error)}`)
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login/employee?error=no-code`)
  }

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
    console.error('[employee-callback] exchange failed', exchangeError?.message)
    return NextResponse.redirect(`${origin}/login/employee?error=exchange-failed`)
  }

  const user = data.session.user
  const existingRole = user.user_metadata?.role as string | undefined

  if (existingRole === 'employee') {
    return NextResponse.redirect(`${origin}/dashboard`)
  }

  if (existingRole && existingRole !== 'employee') {
    return NextResponse.redirect(`${origin}/login/employee?error=wrong-role&have=${existingRole}`)
  }

  // New user
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User'

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )

  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, role: 'employee', full_name: displayName },
  })

  await admin.from('candidate_profiles').upsert(
    { user_id: user.id, full_name: displayName, email: user.email || '' },
    { onConflict: 'user_id', ignoreDuplicates: false }
  )

  fetch(`${origin}/api/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: user.email, type: 'candidate_welcome', data: { candidateName: displayName } }),
  }).catch(() => {})

  return NextResponse.redirect(`${origin}/dashboard`)
}
